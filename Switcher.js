'use strict';

var exec = require('child_process').exec;
var RSVP = require('rsvp');
var DBus = require('dbus');
var dbus = new DBus();
var bus = dbus.getBus('session');

var utils = require('./utils');


// catch any errors from promises missing a 'catch' function
RSVP.on('error', function(err) {
  console.log('catch-all caught an error: ', err);
  console.assert(false, err);
});

/**
 * An object that can manage switching ttys to repaint the screen when DPMS causes tty7 to
 * become distorted with weird artifacts. This is only problematic when the lock screen is
 * activated, so Swticher handles that case.
 * @param {Object} opts A configuration object.
 */
function Switcher (opts) {
  this.config = {
    // DBus parameters for the screensaver. Should work with Cinnamon and GNOME.
    // Use a program like D-Feet to inspect for the correct values for your machine.
    // The interface should have a `GetActive()` method and an `ActiveChanged` signal.
    // `org.gnome.ScreenSaver` or `org.freedesktop.ScreenSaver` might be good guesses.
    service: 'org.cinnamon.ScreenSaver',
    path: '/org/cinnamon/ScreenSaver',
    innaface: 'org.cinnamon.ScreenSaver',

    // Gsetting for the period of time before the session is considered idle.
    // Use a program like dconf-editor to check. Switch this to GNOME if that's what you use.
    // For that the setting might be `org.gnome.desktop.session idle-delay`.
    gsetting: 'org.cinnamon.desktop.session idle-delay',

    // The amount of time to wait if a recheck of the screen's lock and power states determines
    // that the screen is still on after the idle period has been passed. The screen might need
    // just a few more seconds to turn off before the script can do its thing.
    recheckDelayCushion: 5,
    // The amount of time in seconds to wait before turning off the screen after switching terminals
    screenOffDelay: 0.2
  };

  utils.extend(this.config, opts);
}

/**
 * Initialize the Switcher instance.
 * @return {Switcher} The switcher instance for chaining.
 */
Switcher.prototype.init = function () {
  this.registerLockEvent();
  return this;
};

/**
 * Holds the promise returned by `getInterface` to return it immediately on subsequent calls.
 * @type {Promise}
 */
Switcher.prototype._interfacePromise = null;

/**
 * A unique ID that indicates whether we've already scheduled a recheck of the screen state.
 * Allows prevention of duplicate rechecks, and is nulled when a recheck is complete.
 * The unique ID may be used in the future to compare against.
 * @type {String}
 */
Switcher.prototype._scheduleID = null;

/**
 * Get the DBus interface to query for Screen locking.
 * @return {Promise} A promise to chain methods to.
 */
Switcher.prototype.getInterface = function () {
  var self = this;

  if (self._interfacePromise) {
    return self._interfacePromise;
  }

  var promise = self._interfacePromise = new RSVP.Promise(function (resolve, reject) {
    var service = self.config.service;
    var path = self.config.path;
    var innaface = self.config.innaface;

    bus.getInterface(service, path, innaface, function(err, iface) {
      if (err) {
        err.message = err.message || 'The DBus interface could not be gotten.';
        return reject(err);
      }

      return resolve(iface);
    });
  });

  return promise;
};

/**
 * Register a callback for when a message is triggered from the DBus after a screen lock/unlock event.
 * @return {Switcher} The switcher object for chaining.
 */
Switcher.prototype.registerLockEvent = function () {
  var self = this;

  self.getInterface()
    .then(function (iface) {
      iface.on('ActiveChanged', self.screenLockChanged.bind(self));
    })
    .catch(function (err) {
      console.error('There was an error getting the interface: ', err);
    });

  return this;
};

/**
 * A callback that's called by DBus when the screen is locked or unlocked.
 * @param  {Boolean} locked Tells whether the screen is locked or unlocked.
 * @return {undefined}      A return value isn't useful here as this function's being called by a DBus event.
 */
Switcher.prototype.screenLockChanged = function (locked) {
  var self = this;

  if (locked === true) {
    console.log('screen is locked!');
  } else {
    console.log('screen is unlocked.');
    return;
  }

  self.isMonitorOff()
    // monitor is off
    .then(function () {
      console.log('screen was off when locked -- switching terminals');

      return self.switchVirtualTerminal(1, 7)
        .then(self.turnScreenOff.bind(self), function (err) {
          console.error('There was an error switching virtual terminals: ', err);
        })
        .then(null, function (err) {
          console.error('There was an error turning the screen off: ', err);
        });
    // monitor is still on
    }, function () {
      if (self._scheduleID) {
        console.log('was going to schedule another recheck, but one is already scheduled. letting that one continue instead.');
        return;
      }

      self._scheduleID = utils.generateUUID();
      console.log('screen is still on -- calculating recheck delay');

      self._calculateRecheckDelay()
        // trigger a delayed recheck of the screen lock && screen off
        .then(self._performDelayedRecheck.bind(self))
        .then(function (stillLocked) {
          self._scheduleID = null;
          if (!stillLocked) {
            console.log('screen is found unlocked after delay. nothing to be done.');
            return;
          }

          console.log('delay is up -- trying again');

          self.screenLockChanged(stillLocked);
        })
        .catch(function (err) {
          self._scheduleID = null;
          console.error('There was an error executing the delayed recheck: ', err);
        });
    })
    .catch(function (err) {
      console.error('There was an error in the screen lock DBus callback: ', err);
    });
};

/**
 * Calculates the time when the system is considered idle,
 * depending on the idle setting and the user's current idle time.
 * @return {Promise} A Promise returning the delay needed in seconds.
 */
Switcher.prototype._calculateRecheckDelay = function () {
  var self = this;

  return RSVP.hash({
    idleSetting: self.getIdleSetting(),
    idleTime: self.getIdleTime()
  }).then(function (hash) {
    var delay = hash.idleSetting - hash.idleTime;

    if (delay <= 0) {
      console.log('The idle time is passed -- setting a default %s second delay.', self.config.recheckDelayCushion);
      delay = self.config.recheckDelayCushion;
    }

    console.log('idleSetting was: %s. idleTime was: %s. delay is: %s', hash.idleSetting, hash.idleTime, delay);

    return delay;
  })
  .catch(function (err) {
    console.error('There was an error in calculating the proper recheck delay: ', err);
    throw err;
  });
};

/**
 * Wait the specified period, then resolve whether the screen is locked through a promise.
 * @param  {Number} delay The delay period in seconds.
 * @return {Promise}      A promise that fires when the delay period is up and after the screen's lock state has been checked.
 */
Switcher.prototype._performDelayedRecheck = function (delay) {
  var self = this;

  var promise = new RSVP.Promise(function (resolve, reject) {
    console.log('checking if the screen is still locked in %s seconds', delay);

    setTimeout(function () {
      self.checkIfLocked()
        .then(resolve, function (err) {
          // need to do this since setTimeout won't allow me to
          // return the rejected promise from self.checkIfLocked()
          return reject(err);
        });
    }, delay * 1000);
  });

  return promise;
};

/**
 * Determines if the screen is locked.
 * @return {Promise} A promise that will return a boolean for locked/unlocked.
 */
Switcher.prototype.checkIfLocked = function () {
  var self = this;

  return self.getInterface()
    .then(function (iface) {
      return self._getLockActive(iface);
    })
    .catch(function (err) {
      if (err) {
        throw err;
      }

      throw new Error('There was an error checking if the screen was locked');
    });
};

/**
 * Private function that determines if the screen is locked.
 * This actually generates the promised used in the public method.
 * @param  {Object} iface The handle for the DBus interface.
 * @return {Promise}      A promise returning the boolean for locked/unlocked.
 */
Switcher.prototype._getLockActive = function (iface) {
  var promise = new RSVP.Promise(function (resolve, reject) {
    iface.GetActive.timeout = 0;
    iface.GetActive.finish = resolve;
    iface.GetActive();
  });

  return promise;
};

/**
 * Queries gsettings for the system session configuration of how long
 * a delay should be before the system is determined to be idle.
 * @return {Promise} A promise returning the number of seconds of inactivity before the session is considered idle.
 */
Switcher.prototype.getIdleSetting = function () {
  var self = this;

  var promise = new RSVP.Promise(function (resolve, reject) {
    var child = exec('gsettings get ' + self.config.gsetting, {
      encoding: 'utf8'
    }, function (err, stdout, stderr) {
      if (err || stderr) {
        return reject(err || stderr);
      }

      if (/uint32 \d+/.test(stdout)) {
        var idleTime = parseInt(stdout.split(' ')[1], 10);
        return resolve(idleTime);
      }

      return reject(new Error('Idle time wasn\'t returned by DBus in the proper format.'));
    });
  });

  return promise;
};

/**
 * Queries the X server for the user's idle time thus far.
 * @return {Promise} The user's idle time so far, in seconds.
 */
Switcher.prototype.getIdleTime = function () {
  var promise = new RSVP.Promise(function (resolve, reject) {
    var child = exec('xprintidle', {
      encoding: 'utf8'
    }, function (err, stdout, stderr) {
      if (err || stderr) {
        return reject(err || stderr);
      }

      var idleTime = parseInt(stdout, 10) / 1000;
      return resolve(idleTime);
    });
  });

  return promise;
};

/**
 * Uses xset's DPMS feature to tell whether the screen is currently powered off.
 * @return {Promise} A promise that resolves if the screen is off and rejects if the screen is on or if there's an error/stderror.
 */
Switcher.prototype.isMonitorOff = function () {
  var promise = new RSVP.Promise(function (resolve, reject) {
    // give ourselves a few seconds for the screen to settle down
    var child = exec('xset q', {
      encoding: 'utf8'
    }, function (err, stdout, stderr) {
      if (err || stderr) {
        return reject(err || stderr);
      }

      var screenOff = /Monitor is Off/.test(stdout);
      if (screenOff) {
        return resolve(screenOff);
      }

      // reject if screen is on in order to chain
      // promises more easily on the resolve code path
      return reject(new Error('Screen is still on.'));
    });
  });

  return promise;
};

/**
 * Switches the virtual terminal to tty1 and back to tt7 in order to force X to repaint the screen.
 * @param  {Number} first  The number of the tty to briefly switch to first.
 * @param  {Number} second The number of the tty to switch to second. Usually you'd use this to switch back to X under tty7.
 * @return {Promise}       A promise that fires when the switching has completed.
 */
Switcher.prototype.switchVirtualTerminal = function (first, second) {
  // create an "immediate" promise to kick off the creation
  // of the functions that in turn create the promises that
  // manage the switching of virtual terminals.
  return RSVP.resolve()
    .then(this._chvt.bind(this, first)())
    .then(this._chvt.bind(this, second)());
};

/**
 * Return a function that should be called as a parameter to a `.then`,
 * which returns a promise after the virtual terminal has been switched.
 * @param  {Number} ttyNum The number of the tty you want to switch to.
 * @return {Function}      A function to be called as a parameter to `.then()`, and returns a promise.
 */
Switcher.prototype._chvt = function (ttyNum) {
  return function () {
    var promise = new RSVP.Promise(function (resolve, reject) {
      var child = exec('sudo chvt ' + ttyNum, {
        encoding: 'utf8'
      }, function (err, stdout, stderr) {
        if (err || stderr) {
          return reject(err || stderr);
        }
        return resolve();
      });
    });

    return promise;
  };
};

/**
 * Turns off the screen using xset dpms.
 * @return {Promise} A promise that fires when the screen has been turned off.
 */
Switcher.prototype.turnScreenOff = function () {
  var self = this;

  var promise = new RSVP.Promise(function (resolve, reject) {
    setTimeout(function () {
      console.log('Turning off the screen.');
      var child = exec('xset dpms force off', {
        encoding: 'utf8'
      }, function (err, stdout, stderr) {
        if (err || stderr) {
          return reject(err || stderr);
        }

        return resolve();
      });
    }, self.config.screenOffDelay * 1000);
  });

  return promise;
};

module.exports = Switcher;
