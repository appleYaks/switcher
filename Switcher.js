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
 * @param {Class} opts A configuration object
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
};

/**
 * Holds the promise returned by `getInterface`
 * to return it immediately on subsequent calls.
 *
 * @type {Promise}
 */
Switcher.prototype._interfacePromise = null;

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

Switcher.prototype.registerLockEvent = function () {
  var self = this;

  self.getInterface().then(function (iface) {
    iface.on('ActiveChanged', self.screenLockChanged);
  }).catch(function (err) {
    console.error('There was an error getting the interface: ', err);
  });
};

Switcher.prototype.screenLockChanged = function (locked) {
  if (locked === true) {
    console.log('screen is locked!');
  } else {
    console.log('screen is unlocked!');
  }
};

Switcher.prototype.checkIfLocked = function () {
  var self = this;

  return self.getInterface().then(function (iface) {
    return self._getLockActive(iface);
  });
};

Switcher.prototype._getLockActive = function (iface) {
  var promise = new RSVP.Promise(function (resolve, reject) {
    iface.GetActive.timeout = 0;
    iface.GetActive.finish = resolve;
    iface.GetActive();
  });

  return promise;
};

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


function switch_vt () {
  // if isMonitorOff ; then
  //   echo 'monitor is off now. switching vts...'
  //   sudo chvt 1
  //   sleep .1
  //   sudo chvt 7
  //   return 0
  // fi

  // echo "monitor wasn't off. not switching vts."
  // return 1
}

module.exports = Switcher;
