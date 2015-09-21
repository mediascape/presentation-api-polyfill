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
var polyfill = fs.openSync(path.join(root, 'presentation-api-polyfill.js'), 'w');

[
  path.join(root, 'utils', 'header.js'),
  path.join(root, 'core.js'),
  path.join(root, 'mechanisms', 'cast.js'),
  path.join(root, 'mechanisms', 'physicalweb.js'),
  path.join(root, 'mechanisms', 'window.js')
]
.forEach(function (file) {
  var contents = fs.readFileSync(file, utf8);
  fs.writeSync(polyfill, contents, utf8);
  fs.writeSync(polyfill, '\n\n\n\n', utf8);
});


fs.closeSync(polyfill);
