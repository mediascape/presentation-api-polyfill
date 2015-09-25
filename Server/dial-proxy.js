/**
 * @file HTTP server that exposes the list of DIAL devices found around
 * @copyright 2015 W3C (MIT, ERCIM, Keio, Beihang)
 * @license Apache-2.0
 * @author François Daoust <fd@w3.org>
 *
 * The HTTP server searches for DIAL devices on a regular basis and returns the
 * list of devices found when it receives a request on /dial
 */
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var dial = require('peer-dial');
var app = express();


/**
 * DIAL client that will discover DIAL servers on the home network
 */
var dialClient = new dial.Client();




/**
 * List of DIAL devices known so far, actually the list of DIAL
 * devices description URLs.
 */
var dialDevices = [];




/**
 * Ensure server can be accessed by the requesting page
 */
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});


app.use(bodyParser.urlencoded({ extended: true }));




/**
 * Main entry-point is to be used to ensure server is up and running
 */
app.get('/', function (req, res) {
  console.log('GET /');
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end();
});




/**
 * Retrieve the list of known DIAL devices when the request is made
 */
app.get('/dial', function (req, res) {
  if (!req.query.apps) {
    console.log('GET /dial, return ' + dialDevices.length + ' devices');
    res.json(dialDevices.map(function (device) {
      return {
        name: device.friendlyName
      };
    }));
    res.end();
    return;
  }

  // List of requested DIAL applications
  var dialApplications = req.query.apps.split(',');


  /**
   * Returns a promise that resolves with the name of a DIAL app supported
   * by the provided device if one is found.
   *
   * @function {Object} device The DIAL device to check
   * @return {Promise<Object>} The promise to get an object with a "device"
   * and "app" keys with the appropriate info if the device supports one of
   * the registered DIAL applications, null otherwise.
   */
  var getAppSupportedByDevice = function (device) {
    var deviceSupportsApp = function (device, app) {
      return new Promise(function (resolve, reject) {
        device.getAppInfo(app, function (desc) {
          if (desc) {
            console.log(app + ' app found on ' + device.friendlyName);
            resolve({
              name: device.friendlyName,
              app: app
            });
          }
          else {
            console.log(app + ' app not found on ' + device.friendlyName);
            resolve();
          }
        });
      });
    };
    var promise = new Promise(function (resolve, reject) {
      resolve();
    });
    dialApplications.forEach(function (app) {
      promise = promise
        .then(function (supported) {
          if (supported) {
            return supported;
          }
          else {
            return deviceSupportsApp(device, app);
          }
        });
    });
    return promise;
  };

  Promise.all(dialDevices.map(getAppSupportedByDevice))
    .then(function (devices) {
      var compatibleDevices = [];
      devices.forEach(function (device) {
        if (device) {
          compatibleDevices.push(device);
        }
      });
      console.log('GET /dial, return ' + compatibleDevices.length + ' devices');
      res.json(compatibleDevices);
      res.end();
    });
});




/**
 * Start/Stop a DIAL application on the DIAL device
 */
app.post('/dial', function (req, res) {
  var deviceName = req.body.device;
  var app = req.body.app;
  var device = null;
  var postData = null;
  var contentType = null;
  var action = req.body.action || 'start';

  dialDevices.forEach(function (dialDevice) {
    if (dialDevice.friendlyName === deviceName) {
      device = dialDevice;
    }
  });
  console.log('POST /dial', deviceName);

  if (!device) {
    res.status(404);
    res.end();
    return;
  }


  if (action === 'start') {
    postData = req.body.postData || '';
    contentType = req.body.contentType || 'application/x-www-form-urlencoded';
    device.launchApp(app, postData, contentType, function (result, err) {
      if (result) {
        console.log(app + ' launched on ' + deviceName);
        // TODO: retrieve application instance ID
        // (not yet implemented in DialClient AFAICT)
        res.end();
        return;
      }
      else {
        console.log(app + ' could not be launched on ' + deviceName);
        res.status(500);
        res.end();
        return;
      }
    });
  }
  else if (action === 'stop') {
    // TODO: stop DIAL app
    res.end();
  }
  else {
    res.status(404);
    res.end();
  }
});



/**
 * Function that starts searching for new DIAL devices
 *
 * NB: the function calls itself indefinitely once every 10 second.
 *
 * @function
 */
var monitorDialDevices = function () {
  console.log('start new search for DIAL devices');
  dialDevices = [];
  dialClient.refresh();
  setTimeout(monitorDialDevices, 30000);
};



// Start the HTTP server
http.Server(app).listen(3001, function () {
  console.log('DIAL proxy server started, listening on port 3001');
});



// Start searching for new DIAL devices
dialClient
  .on('ready', monitorDialDevices)
  .on('found', function (url) {
    dialClient.getDialDevice(url, function (device, err) {
      dialDevices.push(device);
      console.log(
        'found DIAL device: ' + device.friendlyName +
        ' at ' + device.applicationUrl
      );
    });
  })
  .on('disappear', function (url, device) {
    var pos = dialDevices.indexOf(device);
    dialDevices = dialDevices.splice(pos, 1);
  })
  .start();