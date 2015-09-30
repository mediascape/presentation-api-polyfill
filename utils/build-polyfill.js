/**
 * @file Command-line tool to build the Presentation API polyfill
 *
 * To run the command: node utils/build-polyfill.js
 *
 * This will create or update "presentation-api-polyfill.js" in place.
 */
var fs = require('fs');
var path = require('path');

var utf8 = { encoding: 'utf-8' };

var root = path.join(__dirname, '..');
var api = path.join(root, 'API');
var src = path.join(api, 'src');
var mechanisms = path.join(src, 'mechanisms');
var polyfill = fs.openSync(path.join(api, 'presentation-api-polyfill.js'), 'w');

[
  path.join(root, 'utils', 'header.js'),
  path.join(src, 'core.js'),
  path.join(mechanisms, 'cast.js'),
  path.join(mechanisms, 'dial.js'),
  path.join(mechanisms, 'physicalweb.js'),
  path.join(mechanisms, 'qrcode.js'),
  path.join(mechanisms, 'window.js')
]
.forEach(function (file) {
  var contents = fs.readFileSync(file, utf8);
  fs.writeSync(polyfill, contents, utf8);
  fs.writeSync(polyfill, '\n\n\n\n', utf8);
});


fs.closeSync(polyfill);
