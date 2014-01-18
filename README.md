# Switcher!

This script works around a bug that crops up in X Server when using GNOME or Cinnamon.

If you lock your screen and turn it off (by closing a laptop lid, or maybe the system does it after an idle timeout), you may find that when you come back, instead of seeing the lock screen, your screen is distorted with artifacts and unrecognizable patterns. Or worse, what you were working on is displayed statically, seemingly layered over the lock screen as an image. Manually switching virtual terminals with `Ctrl+Alt+F1` and then `Ctrl+Alt+F7` will fix it by forcing a screen repaint, showing the lock screen. But this script will handle it all for you automatically.

## Instructions

### Install xprintidle and nodejs:

```bash
$ sudo apt-get install xprintidle nodejs
```

### Install the dependencies

```bash
$ cd [folder where the script resides]
$ npm install
```

### Make the command `sudo chvt` work without a password

Open the `/etc/sudoers` file or a new file in `/etc/sudoers.d/` with:

```bash
$ sudo visudo -f /etc/sudoers.d/chvt
```

Add this line, replacing `USER` with your username. Use `which chvt` or `sudo which chvt` to find out where the program is on your machine and replace `/bin/chvt` with that:

```bash
USER ALL= NOPASSWD: /bin/chvt
```

This allows the script to switch your virtual terminals (and thereby repaint your X screen to good health) without needing a password.

### Configure for your desktop

If you're using GNOME and not Cinnamon, you'll need to change a few lines from the default configuration. This is easy to do. For more information on that, check the beginning of the `Switcher.js` file, specifically what's inside the `Switcher` function. You can change these options there, or by passing them into the creation of the switcher object in `daemon.js`.

### Make the script run on login

It's preferred to do it this way so that it runs as your user, and not as root. You can do this in the System Settings application in Cinnamon under "Startup Programs". The file it should point to is `daemon.js`.

## If it doesn't work

You can run the program in a terminal to see its debug output. Make sure the program isn't already running and simply run the script in your terminal as you would a bash script. Then lock and unlock the screen, let the idle time run out, etc. and see if any errors crop up in the output. If so, let me know in an issue.

## License

This program is distributed under the [ISC License](http://opensource.org/licenses/ISC), reprinted below.

```
Copyright (c) 2014, David Arvelo

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
