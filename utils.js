'use strict';

function extend(base) {
  var opts = [].slice.call(arguments, 1);

  for (var i = 0; i < opts.length; i++) {
    var tmp = opts[i];

    for (var prop in tmp) {
      if (tmp.hasOwnProperty(prop)) {
        base[prop] = tmp[prop];
      }
    }
  }

  return base;
}

exports.extend = extend;
