/**
 * @file Google Cast presentation mechanism for the Presentation API polyfill
 * @copyright 2015 W3C (MIT, ERCIM, Keio, Beihang)
 * @license Apache-2.0
 * @author François Daoust <fd@w3.org>
 *
 * This mechanism allows a user to request display of Web content on
 * available Google Cast devices discovered through the Cast extension
 * of Google Chrome. Since that extension does not expose the list of
 * Chromecast devices that are available, this mechanism simply takes
 * for granted that there is one and offers the mechanism as display
 * choice.
 *
 * The Cast presentation mechanism will only be enabled in Google
 * Chrome running the Cast extension. It should be transparent to
 * all other environments.
 *
 * The Cast sender library needs to be loaded before that code if one
 * wants to support Chromecast devices:
 *
 * <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"></script>
 *
 * Support for Chromecast devices is heavily restrained because Cast receiver
 * applications need to be registered with Google before they may be used and
 * this code needs to know about the mapping between the URL of the application
 * and the application ID provided by Google upon registration.
 *
 * As such, applications that want to make use of the shim on Google Cast
 * devices need first to issue a call to the following static function that
 * this mechanism adds to the presentation namespace:
 *  navigator.w3cPresentation.registerCastApplication(appUrl, appId)
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
   * Whether the Cast API library is available or not.
   * If it's not, the Promises returned by "create" and "startReceiver"
   * will always end up being rejected.
   */
  var castApiAvailable = false;
  window['__onGCastApiAvailable'] = function (loaded, errorInfo) {
    if (loaded) {
      log('Google Cast API library is available and loaded');
      castApiAvailable = true;
    } else {
      log('warn',
        'Google Cast API library is available but could not be loaded',
        errorInfo);
    }
  };


  /**
   * Whether the Cast API library has been initialized.
   *
   * That flag is used to support multiple calls to "requestSession". Once
   * the Cast API library has been initialized, subsequent Cast session
   * requests should directly call sessionRequest.
   */
  var castApiInitialized = false;


  /**
   * Mapping table between receiver application URLs and Cast application IDs
   *
   * Ideally, there should not be any need to maintain such a mapping table
   * but there is no way to have an arbitrary URL run on a Chromecast device.
   */
  var castApplications = {};


  /**
   * Remote controller from the perspective of the Cast device
   *
   * @constructor
   * @inherits {RemoteController}
   * @param {cast.ReceiverManager} castReceiverManager The cast's receiver
   * manager.
   */
  var CastRemoteController = function (castReceiverManager) {
    RemoteController.call(this);

    var customMessageBus = castReceiverManager.getCastMessageBus(
      'urn:x-cast:org.w3c.webscreens.presentationapi.shim',
      cast.receiver.CastMessageBus.MessageType.JSON);

    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        var channel = new DataChannel();
        channel.state = 'connected';

        customMessageBus.addEventListener('message', function (event) {
          log('received message from Cast sender', event.data);
          if (channel.onmessage) {
            channel.onmessage(event);
          }
        });

        channel.send = function (message) {
          if (channel.state !== 'connected') {
            throw new _DOMException('InvalidStateError');
          }
          log('send message to Cast sender', message);
          customMessageBus.broadcast(message);
        };

        channel.close = function () {
          if (channel.state !== 'connected') {
            return;
          }
          channel.state = 'closed';
          if (channel.onstatechange) {
            channel.onstatechange();
          }
        };

        resolve(channel);
      });
    };

    this.terminate = function () {
      log('stop Cast receiver manager');
      castReceiverManager.stop();
    };
  };


  /**
   * Represents a Chromecast device that may be navigated to a URL
   *
   * The class more accurately represents the possibility that the user
   * will have a Chromecast device at hand that could be used to browse
   * the requested URL. The actual device is not known a priori.
   *
   * @function
   * @inherits {Display}
   * @param {String} name A human-friendly name for the "device"
   */
  var CastDisplay = function (name) {
    Display.call(this, name);
    this.state = 'closed';

    var castSession = null;

    this.navigate = function (url) {
      return new Promise(function (resolve, reject) {
        if (!castApiAvailable) {
          log('cannot create Cast session',
            'Google Cast API library is not available');
          reject(new _DOMException('OperationError'));
          return;
        }

        if (!castApplications[url]) {
          log('cannot create Cast session',
            'no receiver app known for url', url);
          reject(new _DOMException('OperationError'));
          return;
        }

        var applicationId = castApplications[url];
        var sessionRequest = new chrome.cast.SessionRequest(applicationId);

        var requestSession = function () {
          log('request new Cast session for url', url);
          chrome.cast.requestSession(function (session) {
            log('got a new Cast session');
            castSession = session;
            resolve();
          }, function (error) {
            if (castSession) {
              return;
            }
            if (error.code === 'cancel') {
              log('info', 'user chose not to use Cast device');
            }
            else if (error.code === 'receiver_unavailable') {
              log('info', 'no compatible Cast device found');
            }
            else {
              log('error', 'could not create Cast session', error);
            }
            reject(new _DOMException('OperationError'));
          }, sessionRequest);
        };

        var apiConfig = new chrome.cast.ApiConfig(
          sessionRequest,
          function sessionListener(session) {
            // Method called at most once after initialization if a running
            // Cast session may be resumed
            log('found existing Cast session, reusing');
            castSession = session;
            resolve();
          },
          function receiverListener(available) {
            // Method called whenever the number of Cast devices available in
            // the local network changes. The method is called at least once
            // after initialization. We're interested in that first call.
            if (castSession) {
              return;
            }

            // Reject creation if there are no Google Cast devices that
            // can handle the application.
            if (available !== chrome.cast.ReceiverAvailability.AVAILABLE) {
              log('cannot create Cast session',
                'no Cast device available for url', url);
              reject(new _DOMException('OperationError'));
            }

            log('found at least one compatible Cast device');
            requestSession();
          });

        if (castApiInitialized) {
          // The Cast API library has already been initialized, call
          // requestSession directly.
          log('Google Cast API library already initialized',
            'request new Cast session');
          requestSession();
        }
        else {
          // The Cast API library first needs to be initialized
          log('initialize Google Cast API library for url', url);
          chrome.cast.initialize(apiConfig, function () {
            // Note actual session creation is handled by callback functions
            // defined above
            log('Google Cast API library initialized');
            castApiInitialized = true;
          }, function (err) {
            log('error',
              'Google Cast API library could not be initialized', err);
            reject();
            return;
          });
        }
      });
    };


    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        if (!castSession) {
          reject();
          return;
        }

        var channel = new DataChannel();
        channel.state = 'connected';

        var updateListener = function () {
          channel.state = (castSession === chrome.cast.SessionStatus.CONNECTED) ?
            'connected' : 'closed';
          log('received Cast session state update', 'isAlive=' + isAlive);
          if (channel.onstatechange) {
            channel.onstatechange();
          }
          if (channel.state !== 'connected') {
            castSession.removeMessageListener(messageListener);
            castSession.removeUpdateListener(updateListener);
          }
        };

        var messageListener = function (namespace, message) {
          log('received message from Cast receiver', message);
          if (channel.onmessage) {
            channel.onmessage({ data: message });
          }
        };

        var namespace = castSession.namespaces[0];
        castSession.addUpdateListener(updateListener);
        castSession.addMessageListener(namespace.name, messageListener);

        channel.send = function (message) {
          if (channel.state !== 'connected') {
            throw new _DOMException('InvalidStateError');
          }
          log('send message to Cast receiver', message);
          var namespace = castSession.namespaces[0];
          castSession.sendMessage(namespace.name, message);
        };

        channel.close = function () {
          if (channel.state !== 'connected') {
            return;
          }
          castSession.removeMessageListener(messageListener);
          castSession.removeUpdateListener(updateListener);
          channel.state = 'closed';
          if (channel.onstatechange) {
            channel.onstatechange();
          }
        };

        resolve(channel);
      });
    };


    this.terminate = function () {
      log('close Cast session');
      castSession.stop();
    };
  };


  /**
   * The cast presentation mechanism allows a user to request display of
   * Web content on available Google Cast devices discovered through the
   * Cast extension.
   *
   * The extension does not expose the list of Chromecast devices that
   * are available, so this mechanism takes for granted that there is
   * one.
   *
   * @constructor
   * @inherits {PresentationMechanism}
   */
  var CastPresentationMechanism = function () {
    PresentationMechanism.call(this);
    this.name = 'cast presentation mechanism';

    var that = this;

    this.getAvailableDisplays = function () {
      return new Promise(function (resolve, reject) {
        if (castApiAvailable) {
          resolve([new CastDisplay('A chromecast device')]);
        }
        else {
          resolve([]);
        }
      });
    };

    this.monitorIncomingControllers = function () {
      // Detect whether the code is running on a Google Cast device. If it is,
      // it means the code is used within a Receiver application and was
      // launched as the result of a call to:
      //   navigator.presentation.requestSession
      // NB: no better way to tell whether we're running on a Cast device
      // for the time being, see:
      // https://code.google.com/p/google-cast-sdk/issues/detail?id=157
      var runningOnChromecast = !!window.navigator.userAgent.match(/CrKey/);
      if (!runningOnChromecast) {
        log('code is not running on a Google Cast device');
        return;
      }

      // Start the Google Cast receiver
      // Note the need to create the CastReceiverSession before the call to
      // "start", as that class registers the namespace used for the
      // communication channel.
      log('code is running on a Google Cast device',
        'start Google Cast receiver manager');
      var castReceiverManager = cast.receiver.CastReceiverManager.getInstance();
      var controller = new CastRemoteController(castReceiverManager);
      castReceiverManager.start();
      castReceiverManager.onReady = function () {
        log('Google Cast receiver manager started');
        if (that.onincomingcontroller) {
          that.onincomingcontroller(controller);
        }
      };
    };
  };




  /**
   * Non-standard function exposed so that this mechanism can tell how to map
   * a URL to be presented to a Cast receiver application on a Chromecast
   * device
   *
   * @function
   * @param {String} url URL of the receiver application
   * @param {String} id The Cast application ID associated with that URL
   */
  navigator.w3cPresentation.registerCastApplication = function (url, id) {
    castApplications[url] = id;
  };




  // Register the presentation mechanism
  registerPresentationMechanism(new CastPresentationMechanism());
})();
