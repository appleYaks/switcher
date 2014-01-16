'use strict';

var exec = require('child_process').exec;
var RSVP = require('rsvp');
var DBus = require('dbus');
var dbus = new DBus();
var bus = dbus.getBus('session');

var utils = require('./utils');

/**
 * An object that can manage switching ttys to
 * repaint the screen when DPMS causes tty7 to
 * become distorted with weird artifacts. This is
 * only problematic when the lock screen is
 * activated, so Swticher handles that case.
 *
 * @api   public
 * @param {Object} opts A configuration object.
 */
function Switcher (opts) {
  this.config = {
    service: 'org.cinnamon.ScreenSaver',
    path: '/org/cinnamon/ScreenSaver',
    innaface: 'org.cinnamon.ScreenSaver',
    timeoutCheckDPMS: 3000
  };

  utils.extend(this.config, opts);
}

/**
 * Initialize the Switcher instance.
 *
 * @api    public
 * @return {Switcher} The switcher instance for chaining.
 */
Switcher.prototype.init = function () {
  this.registerLockEvent();
  return this;
};

/**
 * Holds the promise returned by `getInterface`
 * to return it immediately on subsequent calls.
 *
 * @type {Promise}
 */
Switcher.prototype._interfacePromise = null;

/**
 * Get the DBus interface to query for Screen locking.
 *
 * @api    public
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
 * Register a callback for when the lock/unlock message
 * is triggered from the DBus after a screen lock/unlock event.
 *
 * @api    private
 * @return {Switcher} The switcher object for chaining.
 */
Switcher.prototype.registerLockEvent = function () {
  var self = this;

  self.getInterface().then(function (iface) {
    iface.on('ActiveChanged', self.screenLockChanged);
  }).catch(function (err) {
    console.error('There was an error getting the interface: ', err);
  });

  return this;
};

/**
 * A callback that's called when the screen is locked or unlocked.
 *
 * @api    private
 * @param  {boolean} locked Tells whether the screen is locked or unlocked.
 * @return {Switcher}       The switcher object for chaining.
 */
Switcher.prototype.screenLockChanged = function (locked) {
  if (locked === true) {
    console.log('screen is locked!');
  } else {
    console.log('screen is unlocked!');
  }

  return this;
};

/**
 * Determines if the screen is locked.
 *
 * @api    public
 * @return {Promise} A promise that will return a boolean for locked/unlocked.
 */
Switcher.prototype.checkIfLocked = function () {
  var self = this;

  return self.getInterface().then(function (iface) {
    return self._getLockActive(iface);
  });
};

/**
 * Private function that determines if the screen is locked.
 * This actually generates the promised used in the public method.
 *
 * @api    private
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
 *
 * @api    public
 * @return {Promise} A promise returning the number of seconds of inactivity before the session is considered idle.
 */
Switcher.prototype.getIdleSetting = function () {
  var promise = new RSVP.Promise(function (resolve, reject) {
    var child = exec('gsettings get org.cinnamon.desktop.session idle-delay', {
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
 *
 * @api    public
 * @return {Promise} The user's idle time so far, in milliseconds.
 */
Switcher.prototype.getIdleTime = function () {
  var promise = new RSVP.Promise(function (resolve, reject) {
    var child = exec('xprintidle', {
      encoding: 'utf8'
    }, function (err, stdout, stderr) {
      if (err || stderr) {
        return reject(err || stderr);
      }

      var idleTime = parseInt(stdout, 10);
      return resolve(idleTime);
    });
  });

  return promise;
};

/**
 * Uses xset's DPMS feature to tell whether the screen is currently powered off.
 *
 * @api    public
 * @return {Promise} A promise returning a boolean telling whether the screen is currently off.
 */
Switcher.prototype.isMonitorOff = function () {
  var self = this;

  var promise = new RSVP.Promise(function (resolve, reject) {
    // give ourselves a few seconds for the screen to settle down
    setTimeout(function () {
      var child = exec('xset q', {
        encoding: 'utf8'
      }, function (err, stdout, stderr) {
        if (err || stderr) {
          return reject(err || stderr);
        }

        var screenOff = /Monitor is Off/.test(stdout);
        return resolve(screenOff);
      });
    }, self.config.timeoutCheckDPMS);
  });

  return promise;
};

/**
 * Switches the virtual terminal to tty1 and back to tt7 in order to force X to repaint the screen.
 *
 * @api    public
 * @return {Promise} A promise that fires when the switching has completed.
 */
Switcher.prototype.switchVirtualTerminal = function () {
  // if isMonitorOff ; then
  //   echo 'monitor is off now. switching vts...'
  //   sudo chvt 1
  //   sleep .1
  //   sudo chvt 7
  //   return 0
  // fi

  // echo "monitor wasn't off. not switching vts."
  // return 1
};

module.exports = Switcher;