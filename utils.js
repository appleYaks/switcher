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

// from: http://stackoverflow.com/a/8809472/544252
function generateUUID(){
  var d = new Date().getTime();
  var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (d + Math.random()*16)%16 | 0;
    d = Math.floor(d/16);
    return (c=='x' ? r : (r&0x7|0x8)).toString(16);
  });
  return uuid;
}

exports.extend = extend;
exports.generateUUID = generateUUID;
