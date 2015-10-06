/**
 * @file DIAL presentation mechanism for the Presentation API polyfill
 * @copyright 2015 W3C (MIT, ERCIM, Keio, Beihang)
 * @license W3C Software and Document License
 * @author François Daoust <fd@w3.org>
 *
 * This mechanism allows a user to request display of Web content on
 * a DIAL device.
 *
 * TODO: add the possibility to establish a communication channel
 *
 * This mechanism relays the discovery part of DIAL, which uses SSDP and cannot
 * be implemented in a regular Web application, through a backend HTTP proxy
 * that needs to run on localhost on port 3001:
 *
 * node Server/dial-proxy.js
 *
 * The main problem that this mechanism faces is that DIAL does not mandate the
 * presence or even the name of a DIAL app that would serve as a browser app.
 * The list of DIAL applications that this mechanism may use must first be
 * registered using the following non-standard static function:
 *
 * navigator.w3cPresentation.registerDialApplication(app);
 *
 * where "app" is an instance of DialApplication
 **/
(function () {
  // Retrieve classes that the core of the Presentation API polyfill exposes
  // to defined and register this presentation mechanism
  var ns = navigator.w3cPresentation.extend;
  var log = ns.log;
  var _DOMException = ns._DOMException;
  var DataChannel = ns.DataChannel;
  var RemoteController = ns.RemoteController;
  var Display = ns.Display;
  var PresentationMechanism = ns.PresentationMechanism;
  var registerPresentationMechanism = ns.registerPresentationMechanism;


  /**
   * Convert the provided URL to an absolute one
   *
   * @function
   * @param {String} url The URL to convert
   * @return {String} The URL converted to an absolute one
   */
  var toAbsolute = function (url) {
    var a = document.createElement('a');
    a.href = url;
    return a.href;
  };


  /**
   * List of DIAL applications that the mechanism may start on the DIAL device.
   *
   * The mechanism will start the first DIAL application it finds in thist list.
   * The keys in the object are the DIAL application names. The values the
   * actual DialApplication instance to use to talk with the DIAL proxy server.
   *
   * @type {Object}
   */
  var dialApplications = {};


  /**
   * Represents a basic DIAL application that can load a URL
   *
   * With this class, the URL is passed as the value of a "url" parameter in
   * the POST request sent to start the DIAL application.
   *
   * More specific DIAL applications that inherit from this base class can
   * modify the POST data that gets passed to the DIAL application. For
   * instance, the HbbTV DIAL application uses an XML AIT structure for that.
   *
   * @class
   * @param {String} name The registered DIAL application name
   * @param {String} urlParam The name of the parameter to use to pass the URL
   * to the DIAL application when it is started. Defaults to "url".
   */
  var DialApplication = function (name, urlParam) {
    /**
     * The registered DIAL name for the application
     *
     * @type {String}
     */
    this.name = name;

    /**
     * The name of the form parameter to use to pass the URL to the DIAL
     * application when it is started.
     *
     * @type {String}
     */
    urlParam = urlParam || 'url';

    /**
     * The Content-Type of the POST data to pass to the DIAL app to start it
     *
     * @type {String}
     */
    this.contentType = 'application/x-www-form-urlencoded';

    /**
     * Return the POST data to send to the DIAL application to start it and
     * have it navigate to the provided URL.
     *
     * @function
     * @param {String} url The absolute URL to navigate to
     * @return {String} The POST data to send
     */
    this.getStartData = function (url) {
      return urlParam + '=' + encodeURIComponent(url);
    };
  };


  /**
   * HbbTV 2.0 DIAL application
   *
   * The HbbTV DIAL application uses an XML AIT to load the right URL on the
   * DIAL device. Please note that there is no way to pass the appId and orgId
   * with the Presentation API, so the application will be
   * broadcast-independent in practice.
   *
   * The appId and orgId still need to be passed over to the HbbTV DIAL app,
   * which means that user agents will have to register themselves with HbbTV
   * one way or the other, perhaps using the same appId for all URLs loaded
   * with the Presentation API.
   *
   * @class
   * @inherits {DialApplication}
   */
  var HbbTVDialApplication = function () {
    DialApplication.call(this, 'HbbTV');

    var orgId = '123';
    var appId = '456';

    this.contentType = 'text/xml';
    this.getStartData = function (url) {
      return '<?xml version="1.0" encoding="UTF-8"?>' +
        '<mhp:ServiceDiscovery xmlns:mhp="urn:dvb:mhp:2009" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          '<mhp:ApplicationDiscovery DomainName="example.com">' +
            '<mhp:ApplicationList>' +
              '<mhp:Application>' +
                '<mhp:appName Language="eng"></mhp:appName>' +
                '<mhp:applicationIdentifier>' +
                  '<mhp:orgId>' + orgId + '</mhp:orgId>' +
                  '<mhp:appId>' + appId + '</mhp:appId>' +
                  '</mhp:applicationIdentifier>' +
                '<mhp:applicationDescriptor>' +
                  '<mhp:type>' +
                    '<mhp:OtherApp>application/vnd.hbbtv.xhtml+xml</mhp:OtherApp>' +
                  '</mhp:type>' +
                  '<mhp:controlCode>AUTOSTART</mhp:controlCode>' +
                  '<mhp:visibility>VISIBLE_ALL</mhp:visibility>' +
                  '<mhp:serviceBound>false</mhp:serviceBound>' +
                  '<mhp:priority>1</mhp:priority>' +
                  '<mhp:version>01</mhp:version>' +
                  '<mhp:mhpVersion>' +
                    '<mhp:profile>0</mhp:profile>' +
                    '<mhp:versionMajor>1</mhp:versionMajor>' +
                    '<mhp:versionMinor>3</mhp:versionMinor>' +
                    '<mhp:versionMicro>1</mhp:versionMicro>' +
                  '</mhp:mhpVersion>' +
                '</mhp:applicationDescriptor>' +
                '<mhp:applicationTransport xsi:type="mhp:HTTPTransportType">' +
                  '<mhp:URLBase>' + url + '</mhp:URLBase>' +
                '</mhp:applicationTransport>' +
                '<mhp:applicationLocation>?launch=from-cs</mhp:applicationLocation>' +
              '</mhp:Application>' +
            '</mhp:ApplicationList>' +
          '</mhp:ApplicationDiscovery>' +
        '</mhp:ServiceDiscovery>';
    };
  };




  /**
   * IRT's Amazon FireTV dongle DIAL application
   *
   * Supports the custom Android-based DIAL application developed by
   * IRT as part of MediaScape to present content on an Amazon FireTV dongle.
   *
   * @class
   * @inherits {DialApplication}
   */
  var IRTFireTVDialApplication = function () {
    DialApplication.call(this, 'mediaScapeWebView');

    this.contentType = 'application/json';
    this.getStartData = function (url) {
      return JSON.stringify({
        url: url
      }, null, 2);
    };
  };




  /**
   * Remote controller from the perspective of the DIAL device
   *
   * @class
   * @inherits {RemoteController}
   */
  var DialRemoteController = function () {
    RemoteController.call(this);

    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        log('info', 'Data channel not yet implemented in DIAL mechanism');
      });
    };

    this.terminate = function () {
      // TODO: figure out how to notify remote controller
    };
  };


  /**
   * Represents a DIAL device that may be navigated to a URL
   *
   * @class
   * @inherits {Display}
   * @param {String} device The DIAL device's name and REST service URL
   * @param {DialApplication} app The DIAL app to use on that device
   */
  var DialDisplay = function (device, app) {
    Display.call(this, device);
    this.state = 'closed';

    var appInstanceUrl = null;

    this.navigate = function (url) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'http://localhost:3001/dial');
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        xhr.onload = function () {
          // TODO: monitor effective app launch and resolve when started
          if ((xhr.status === 200) || (xhr.status === 201)) {
            appInstanceUrl = xhr.getResponseHeader('Location');
          }
          resolve();
        };
        var presentationUrl = toAbsolute(url) +
          ((url.indexOf('?') === -1) ? '?' : '&') +
          '__dial__';
        xhr.onerror = function (e) {
          reject(new _DOMException('OperationError',
            'Unable to start DIAL app: ' + JSON.stringify(e)));
        };
        xhr.send('action=start' +
          '&device=' + device +
          '&app=' + app.name +
          '&contentType=' + app.contentType +
          '&postData=' + encodeURIComponent(app.getStartData(presentationUrl))
        );
      });
    };

    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        log('info', 'Data channel not implemented yet in DIAL mechanism');
      });
    };


    this.terminate = function () {
      log('close DIAL app');
      if (!appInstanceUrl) {
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('DELETE', appInstanceUrl);
      xhr.onload = function () {
        // TODO: only resolve when DIAL app actually stopped
        resolve();
      };
      xhr.onerror = function (e) {
        reject(new _DOMException('OperationError',
          'Unable to stop DIAL app: ' + JSON.stringify(e)));
      };
      xhr.send();
    };
  };


  /**
   * The DIAL presentation mechanism allows a user to request display of
   * Web content on available DIAL devices that contain the right DIAL
   * application.
   *
   * @class
   * @inherits {PresentationMechanism}
   */
  var DialPresentationMechanism = function () {
    PresentationMechanism.call(this);
    this.name = 'DIAL presentation mechanism';

    var that = this;

    var checkLocalProxyPresence = (function () {
      var promise = null;
      var enabled = false;
      return function (timeout) {
        if (promise) {
          return promise;
        }
        timeout = timeout || 0;
        promise = new Promise(function (resolve, reject) {
          var enable = function () {
            log('info', 'DIAL local proxy detected, enable mechanism');
            resolve();
          };
          var disable = function () {
            log('info', 'DIAL local proxy not available, disable mechanism');
            reject();
            promise = null;
          };
          var xhr = new XMLHttpRequest();
          xhr.timeout = timeout;
          xhr.onload = enable;
          xhr.onerror = disable;
          xhr.ontimeout = disable;
          xhr.open('GET', 'http://localhost:3001/');
          xhr.send();
        });
        return promise;
      };
    })();
    checkLocalProxyPresence(2000).catch(function () {});

    this.getAvailableDisplays = function (url, options) {
      options = options || {};
      if (!options.isChannelOptional) {
        return new Promise(function (resolve, reject) {
          resolve([]);
        });
      }
      return checkLocalProxyPresence(500)
        .then(function () {
          return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.responseType = 'json';
            xhr.open('GET', 'http://localhost:3001/dial?apps=' +
              Object.keys(dialApplications).join(','));
            xhr.onload = function () {
              var devices = xhr.response || [];
              var displays = devices.map(function (device) {
                return new DialDisplay(device.name, dialApplications[device.app]);
              });
              log('info', 'found ' + displays.length + ' DIAL displays');
              resolve(displays);
            };
            xhr.onerror = function () {
              log('warn', 'could not establish the list of DIAL devices');
              resolve([]);
            };
            xhr.send();
          });
        })
        .catch(function () {
          return [];
        });
    };

    this.monitorIncomingControllers = function () {
      // Detect whether the code is running in a DIAL application. If it is,
      // it means the code is used within a Receiver application and was
      // launched as the result of a call to:
      //   navigator.presentation.requestSession
      // NB: there is no good way to tell whether the app is running on a DIAL
      // device, we'll just use a querystring parameter.
      if (window.location.search.indexOf('__dial__') === -1) {
        return;
      }

      // TODO: setup communication channel one way or the other
      log('code is running on a DIAL device');
      var controller = new DialRemoteController();
      if (that.onincomingcontroller) {
        that.onincomingcontroller(controller);
      }
    };
  };




  /**
   * Non-standard function exposed so that this mechanism can tell which DIAL
   * applications it should be looking for to load the requested URL
   *
   * @function
   * @param {DialApplication} app The DIAL application to register
   */
  navigator.w3cPresentation.registerDialApplication = function (app) {
    dialApplications[app.name] = app;
  };




  // Expose the non-standard DialApplication class to the external world
  // in the same namespace as the other classes
  navigator.w3cPresentation.extend.DialApplication = DialApplication;




  // Register the presentation mechanism
  registerPresentationMechanism(new DialPresentationMechanism());


  // Register supported DIAL applications
  navigator.w3cPresentation.registerDialApplication(new HbbTVDialApplication());
  navigator.w3cPresentation.registerDialApplication(new IRTFireTVDialApplication());
})();
