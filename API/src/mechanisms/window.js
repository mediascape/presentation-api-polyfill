/**
 * @file Window presentation mechanism for the Presentation API polyfill
 * @copyright 2015 W3C (MIT, ERCIM, Keio, Beihang)
 * @license W3C Software and Document License
 * @author François Daoust <fd@w3.org>
 *
 * The window presentation mechanism allows a user to open a new window on
 * the same screen and pretend that it is a second screen. This mechanism is
 * intended as a fallback that runs on all platforms to test the polyfill. It
 * is not meant to demonstrate that such a fallback would be of any interest
 * in a real implementation of the Presentation API in particular.
 *
 * If the user runs an experimental build of Chromium prepared by Intel Labs,
 * the mechanism will rather open the requested URL in the first screen it
 * finds that is connected through some video port (VGA, HDMI, Miracast) to
 * the computer running the controlling application, see instructions for the
 * Chromium build at:
 *
 * http://webscreens.github.io/demo/#binaries
 *
 * The user will likely have to authorize the calling app to open pop-up
 * windows for this mechanism to work properly.
 *
 * Messaging between the window relies on "postMessage" primitives.
 */
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
   * Remote window controller
   *
   * @constructor
   * @private
   * @inherits {RemoteController}
   * @param {Window} source Reference to the controlling window
   */
  var WindowRemoteController = function (source) {
    RemoteController.call(this);

    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        var channel = new DataChannel();

        var initMessageListener = function (event) {
          if ((event.source === source) &&
              (event.data === 'channel')) {
            log('received message to start data channel');
            channel.state = 'connected';
            window.removeEventListener('message', initMessageListener);
            window.addEventListener('message', messageListener);
            source.postMessage('channelready', '*');
            resolve(channel);
          }
        };
        window.addEventListener('message', initMessageListener);

        var messageListener = function (event) {
          if (event.source === source) {
            if (channel.onmessage) {
              channel.onmessage(event);
            }
          }
        };

        channel.send = function (message) {
          if (channel.state !== 'connected') {
            throw new _DOMException('InvalidStateError');
          }
          log('send message to receiving window', message);
          source.postMessage(message, '*');
        };

        channel.close = function () {
          if (channel.state !== 'connected') {
            return;
          }
          window.removeEventListener('message', messageListener);
          channel.state = 'closed';
          if (channel.onstatechange) {
            channel.onstatechange();
          }
        };
      });
    };
  };


  /**
   * Remote window display that may be navigated to some URL
   *
   * @constructor
   * @private
   * @param {String} name Human-friendly name for that display
   */
  var WindowDisplay = function (name) {
    Display.call(this, name);

    var receivingWindow = null;
    var openPromise = null;
    var openPromiseResolve = null;
    var openPromiseReject = null;
    var reconnectionNeeded = false;
    var that = this;

    this.navigate = function (url) {
      return new Promise(function (resolve, reject) {
        receivingWindow = window.open(url, name);
        if (!receivingWindow) {
          log('could not open receiving window');
          reject(new _DOMException('OperationError'));
          return;
        }
        var isPresentationListener = function (event) {
          if ((event.source === receivingWindow) &&
              (event.data === 'ispresentation')) {
            log('received "is this a presentation connection?" message ' +
              'from receiving window');
            log('send "presentation" message to receiving window');
            receivingWindow.postMessage('presentation', '*');
            window.removeEventListener('message', isPresentationListener);
            resolve();
          }
        };
        window.addEventListener('message', isPresentationListener);
      });
    };

    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        var channel = new DataChannel();
        channel.state = 'connected';

        var readyMessageListener = function (event) {
          if ((event.source === receivingWindow) &&
              (event.data === 'channelready')) {
            log('received "channel ready" message from receiving window');
            channel.state = 'connected';
            window.removeEventListener('message', readyMessageListener);
            window.addEventListener('message', messageListener);
            resolve(channel);
          }
        };

        var messageListener = function (event) {
          if ((event.source === receivingWindow) &&
              (event.data === 'receivershutdown')) {
            log('received shut down message from receiving side', 'disconnect');
            channel.state = 'terminated';
            if (channel.onstatechange) {
              channel.onstatechange();
            }
          }
          else {
            log('received message from receiving window', event.data);
            if (that.onmessage) {
              that.onmessage(event);
            }
          }
        };

        log('tell receiving window to create data channel');
        receivingWindow.postMessage('channel', '*');
        window.addEventListener('message', readyMessageListener);

        channel.send = function (message) {
          if (channel.state !== 'connected') {
            throw new _DOMException('InvalidStateError');
          }
          log('send message to receiving window', message);
          receivingWindow.postMessage(message, '*');
        };

        channel.close = function () {
          if (channel.state !== 'connected') {
            return;
          }
          window.removeEventListener('messsage', messageListener);
          channel.state = 'closed';
          if (channel.onstatechange) {
            channel.onstatechange();
          }
        };
      });
    };

    this.terminate = function () {
      log('close presentation window');
      receivingWindow.close();
    };
  };

  /**
   * Presentation API mechanism that opens the requested URL in a window.
   *
   * @constructor
   * @inherits {PresentationMechanism}
   */
  var WindowPresentationMechanism = function () {
    PresentationMechanism.call(this);
    this.name = 'window presentation mechanism';

    var controllingWindows = [];
    var that = this;

    this.getAvailableDisplays = function () {
      return new Promise(function (resolve, reject) {
        var display = new WindowDisplay('A beautiful window on your screen');
        resolve([display]);
      });
    };

    this.monitorIncomingControllers = function () {
      // No window opener? The code does not run a receiver app.
      if (!window.opener) {
        log('code is not running in a receiving window');
        return;
      }

      var messageEventListener = function (event) {
        // Note that the event source window is not checked to allow multiple
        // controlling windows
        if (event.data === 'presentation') {
          log('received "presentation" message from some window');
          log('code is running in a receiving window');
          if (that.onincomingcontroller &&
              !controllingWindows.some(function (win) {
                return (win === event.source);
              })) {
            controllingWindows.push(event.source);
            var controller = new WindowRemoteController(event.source);
            if (that.onincomingcontroller) {
              that.onincomingcontroller(controller);
            }
          }
        }
      };

      window.addEventListener('message', messageEventListener, false);
      log('send "ispresentation" message to opener window');
      window.opener.postMessage('ispresentation', '*');
      window.addEventListener('unload', function () {
        log('receiving window is being closed');
        controllingWindows.forEach(function (win) {
          if (win) {
            win.postMessage('receivershutdown', '*');
          }
        });
      }, false);
    };
  };
  WindowPresentationMechanism.prototype = new PresentationMechanism();




  // Register the presentation mechanism
  registerPresentationMechanism(new WindowPresentationMechanism());
})();
