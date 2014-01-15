#!/usr/bin/env node

// this script requires the installation of 'xprintidle' from a repository.
// also the script is tuned for DBus communication with Cinnamon, not straight GNOME Shell,
// though this can be easily patched in. for xscreensaver, however, this wouldn't be so easy.

'use strict';

var Switcher = require('./Switcher');

var switcher = new Switcher();
switcher.init();
