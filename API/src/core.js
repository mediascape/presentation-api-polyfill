/**
 * @file Core classes of the Presentation API polyill
 * @copyright 2015 W3C (MIT, ERCIM, Keio, Beihang)
 * @license Apache-2.0
 * @author François Daoust <fd@w3.org>
 *
 * This file implements the helper functions and base classes that actual
 * presentation mechanisms need to use or inherit from and the Presentation API
 * interfaces defined in the specification.
 *
 * The resulting polyfill should be as close to the latest version of the
 * Presentation API draft as possible in JavaScript:
 *
 * http://w3c.github.io/presentation-api/
 *
 * This file does not implement any presentation mechanism on its own. It needs
 * to be completed with actual presentation mechanisms for it to do more than
 * just a "no-op".
 *
 * For instance, to create a polyfill with the Cast, Physical Web and window
 * mechanisms, ensure that your HTML contains code such as:
 *
 * <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"></script>
 * <script src="core.js"></script>
 * <script src="mechanisms/cast.js"></script>
 * <script src="mechanisms/physicalweb.js"></script>
 * <script src="mechanisms/window.js"></script>
 *
 * Some notes on the code:
 * - the code uses Promises, underlying Web browser needs to support them
 * - support for custom events is fairly limited. Only the "on" properties
 * are supported to attach to events on exposed objects, no way to use
 * "addEventListener" for the time being.
 * - the code does not properly handle cases where the receiver calls
 *  "connection.close()".
 *
 * The code below is divided in 2 parts:
 *  a) a few helper functions and the definition of base classes to be used
 *     by the different presentation mechanisms
 *  d) the actual definition of "navigator.presentation" and of the other
 *     related classes
 * The different interfaces could be moved to their own JS file, modules are
 * not used here not to introduce dependencies to some module loader library.
 */
(function () {
  /**********************************************************************
  Simple console logger to help with debugging. Caller may change logging
  level by setting navigator.presentationLogLevel to one of "log", "info",
  "warn", "error" or "none" (or null which also means "none").

  Note this should be done before that shim is loaded!
  **********************************************************************/
  var log = function () {
    var presentationLogLevel = navigator.presentationLogLevel || 'none';
    if ((presentationLogLevel === 'none') || (arguments.length === 0)) {
      return;
    }

    var level = arguments[0];
    var params = null;
    if ((level === 'log') ||
        (level === 'info') ||
        (level === 'warn') ||
        (level === 'error')) {
      // First parameter is the log level
      params = Array.prototype.slice.call(arguments, 1);
    }
    else {
      // No log level provided, assume "log"
      level = 'log';
      params = Array.prototype.slice.call(arguments);
    }
    if ((level === 'error') ||
        ((level === 'warn') &&
          (presentationLogLevel !== 'error')) ||
        ((level === 'info') &&
          (presentationLogLevel !== 'error') &&
          (presentationLogLevel !== 'warn')) ||
        ((level === 'log') &&
          (presentationLogLevel === 'log'))) {
      console[level].apply(console, params);
    }
  };


  /**********************************************************************
  Short helper function to "queue a task"
  **********************************************************************/
  var queueTask = function (task) {
    setTimeout(task, 0);
  };


  /**********************************************************************
  Shim for DOMExceptions (cannot be instantiated in most browsers for
  the time being)
  **********************************************************************/
  var _DOMException = function (name, message) {
    this.name = name;
    this.message = message;
  };




  /**********************************************************************
  Global sets of objects that the User Agent must keep track of
  **********************************************************************/
  /**
   * The list of presentation API mechanisms that may be used to connect
   * to a second screen
   *
   * @type {Array(PresentationMechanism)}
   */
  var registeredMechanisms = [];


  /**
   * Register a new presentation API mechanism
   *
   * @function
   * @private
   * @param {PresentationMechanism} mechanism The mechanism to register
   */
  var registerPresentationMechanism = function (mechanism) {
    registeredMechanisms.push(mechanism);
  };




  /**********************************************************************
  DataChannel / RemoteController / RemoteDisplay internal interfaces
  **********************************************************************/

  /**
   * Base class for objects that can send and receive messages
   *
   * @constructor
   * @private
   */
  var DataChannel = function () {
    var that = this;

    /**
     * The current connection state
     *
     * @type {String}
     */
    this.state = 'closed';


    /**
     * Sends a message through the communication channel.
     *
     * @function
     * @param {*} message
     */
    this.send = function (message) {
      if (that.state !== 'connected') {
        throw new _DOMException('InvalidStateError');
      }
    };


    /**
     * Event handler called when a message is received on the communication
     * channel.
     *
     * @type {EventHandler}
     */
    this.onmessage = null;


    /**
     * Close the communication channel
     *
     * @function
     */
    this.close = function () {
      if (that.state !== 'connected') {
        return;
      }
      that.state = 'closed';
      if (that.onstatechange) {
        that.onstatechange();
      }
    };
  };


  /**
   * A remote controller represents a controlling browsing context as seen
   * from the receiving browsing context.
   *
   * This base class is an empty shell. Presentation mechanisms should provide
   * their own RemoteController interface that inherits from this one and
   * retrieves the right data channel.
   *
   * @constructor
   * @private
   * @param {String} name A human-friendly name to identify the context
   */
  var RemoteController = function () {
    /**
     * The underlying data channel used to communicate with the display
     *
     * @type {DataChannel}
     * @private
     */
    var channel = null;

    /**
     * Retrieve the data channel with the remote browsing context
     *
     * Note the shim only calls that function once (or rather each time the
     * data channel needs to be re-created), so no need to worry about
     * returning the same Promise if the function is called multiple times.
     *
     * @function
     * @return {Promise<DataChannel>} The promise to get a data communication
     * channel ready for exchanging messages with the remote controller
     */
    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        if (!channel) {
          channel = new DataChannel();
          channel.state = 'connected';
        }
        resolve(channel);
      });
    };
  };


  /**
   * Represents a display (or a class of displays in this implementation) as
   * seen from the controlling browsing context. The display may be navigated
   * to a given URL, in which case it can also be used to send messages to the
   * receiving browsing context or receive messages from it.
   *
   * @constructor
   * @private
   * @param {String} name A human-friendly name to identify the context
   */
  var Display = function (name) {
    /**
     * A human-friendly name for the display
     *
     * @type {String}
     */
    this.name = name;


    /**
     * Navigate the display to the given URL, thus creating a receiving
     * browsing context.
     *
     * @function
     * @param {String} url The URL to navigate to
     * @return {Promise} The promise to have navigated to the given URL. The
     * promise is rejected with a DOMException named "OperationError"
     */
    this.navigate = function (url) {
      return new Promise(function (resolve, reject) {
        reject(new _DOMException('OperationError'));
      });
    };


    /**
     * Create a data channel with the remote browsing context
     *
     * Note the shim only calls that function once (or rather each time the
     * data channel needs to be re-created), so no need to worry about
     * returning the same Promise if the function is called multiple times.
     *
     * @function
     * @return {Promise<DataChannel>} The promise to get a data communication
     * channel ready for exchanging messages with the remote controller
     */
    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        if (!channel) {
          channel = new DataChannel();
          channel.state = 'connected';
        }
        resolve(channel);
      });
    };


    /**
     * Terminates the presentation with the display
     */
    this.terminate = function () {};
  };




  /**********************************************************************
  PresentationMechanism internal interface
  **********************************************************************/

  /**
   * Exposes a mechanism to detect, connect and control a second screen
   *
   * Concrete mechanisms must inherit from this base class.
   *
   * @constructor
   * @private
   */
  var PresentationMechanism = function () {
    /**
     * Some friendly name for the mechanism, mostly for logging purpose
     *
     * To be set in derivated classes.
     *
     * @type {String}
     */
    this.name = 'default presentation mechanism';


    /**
     * Compute the list of available presentation displays that the user may
     * select to launch a presentation.
     *
     * @function
     * @return {Promise<Array(Display)} The promise to get the current list of
     * available presentation displays
     */
    this.getAvailableDisplays = function () {
      return new Promise(function (resolve, reject) {
        resolve([]);
      });
    };


    /**
     * Start to monitor incoming presentation connections if code runs on the
     * receiving side.
     *
     * The function should not do anything if the code is not running on the
     * receiving side.
     *
     * @function
     */
    this.monitorIncomingControllers = function () {
      queueTask(function () {
      });
    };


    /**
     * Event handler called when an incoming controller is detected
     *
     * The "controller" attribute of the event that is given to the handler is set
     * to the remote controller that connected to this browsing context
     *
     * @type {EventHandler}
     */
    this.onincomingcontroller = null; 
  };




  /**********************************************************************
  PresentationConnection interface
  **********************************************************************/

  /**
   * Implements the PresentationConnection interface that is merely a wrapper
   * around a specified connection. 
   *
   * @constructor
   * @param {RemoteController|Display} remotePeer An object that represents the
   * remote peer with wich the presentation connection is associated.
   */
  var PresentationConnection = function (remotePeer) {
    var that = this;

    /**
     * The presentation connection identifier
     *
     * @type {String}
     */
    this.id = null;

    /**
     * The current connection state
     *
     * @type {String}
     */
    this.state = 'closed';

    /**
     * Event handler called when connection state changes
     *
     * @type {EventHandler}
     */
    this.onstatechange = null;

    /**
     * Event handler called when a message is received on the communication
     * channel.
     *
     * @type {EventHandler}
     */
    this.onmessage = null;

    /**
     * The underlying data channel
     *
     * @type {DataChannel}
     * @private
     */
    var channel = null;


    /**
     * Non-standard method to create a data channel with the remote browsing
     * context.
     *
     * The application that uses the Presentation API may override that method
     * right after the call to start returns the PresentationConnection
     * instance to associate the presentation connection with a data channel
     * of its own.
     *
     * @function
     * @return {Promise<DataChannel>} The promise to get a data communication
     * channel ready for exchanging messages with the remote peer
     */
    this.createDataChannel = (function () {
      var pendingPromise = null;
      return function () {
        if (pendingPromise) {
          return pendingPromise();
        }
        if (channel) {
          return new Promise(function (resolve, reject) {
            resolve(channel);
          });
        }
        pendingPromise = remotePeer.createDataChannel().then(function (dataChannel) {
          pendingPromise = null;
          channel = dataChannel;
          channel.onstatechange = function () {
            if (channel.state !== that.state) {
              that.state = channel.state;
              if (that.onstatechange) {
                that.onstatechange();
              }
            }
            if (channel.state !== 'connected') {
              // Channel will have to be re-created
              channel = null;
            }
          };
          channel.onmessage = function (message) {
            if (that.onmessage) {
              that.onmessage(message);
            }
          };
          if (that.state !== channel.state) {
            that.state = channel.state;
            if (that.onstatechange) {
              that.onstatechange();
            }
          }
        });
        return pendingPromise;
      };
    })();


    /**
     * Sends a message through the communication channel.
     *
     * @function
     * @param {*} message
     */
    this.send = function (message) {
      if (!channel) {
        throw new _DOMException('InvalidStateError', 'Presentation connection not available, cannot send message');
      }
      if (this.state !== 'connected') {
        throw new _DOMException('InvalidStateError', 'Presentation connection is closed, cannot send message');
      }
      channel.send(message);
    };


    /**
     * Close the connection
     *
     * @function
     */
    this.close = function () {
      if (!channel) {
        return;
      }
      channel.close();
      that.channel = null;
    };


    /**
     * Terminate the presentation connection
     *
     * @function
     */
    this.terminate = function () {
      if (channel) {
        channel.close();
      }
      remotePeer.terminate();
      if (that.state !== 'terminated') {
        that.state = 'terminated';
        if (that.onstatechange) {
          that.onstatechange();
        }
      }
    };
  };




  /**********************************************************************
  PresentationAvailability interface
  **********************************************************************/

  /**
   * Information about the current results of the presentation display
   * availability monitoring.
   *
   * An instance of this class is returned by PresentationRequest's
   * getAvailability method if monitoring is supported by the user agent.
   *
   * Controlling app may listen to the "change" event to be notified about
   * availability changes.
   *
   * @constructor
   */
  var PresentationAvailability = function () {
    /**
     * Whether there are presentation displays available
     *
     * @type {boolean}
     */
    this.value = false;

    /**
     * Event handler called when availability flag changes
     *
     * @type {EventHandler}
     */
    this.onchange = null;
  };




  /**********************************************************************
  PresentationConnectionAvailableEvent interface
  **********************************************************************/

  /**
   * Event fired with a pointer to a presentation connection once a
   * presentation request is properly started.
   *
   * @constructor
   * @inherits {Event}
   * @param {connection:PresentationConnection} eventInitDict An object that
   * points to the presentation connection to associate with the event
   */
  var PresentationConnectionAvailableEvent = function (eventInitDict) {
    this.connection = eventInitDict.connection;
  };




  /**********************************************************************
  PresentationRequest interface
  **********************************************************************/

  /**
   * The PresentationRequest interface represents an intent to start a
   * presentation at a given URL.
   *
   * This shim implements both the controlling side and the receiving side.
   * However, note that this interface is useless on the receiving side.
   *
   * @constructor
   * @param {String} url The URL to present when the intent is to be started
   */
  var PresentationRequest = (function () {
    /**
     * The set of presentation connections known to the controlling context
     *
     * @private
     * @type {Array({url:String, id:String, connection:PresentationConnection})}
     */
    var setOfPresentations = [];


    /**
     * The set of availability objects requested through the getAvailability
     * method.
     *
     * @private
     * @type {Array({A:PresentationAvailability, availabilityUrl:String})}
     */
    var setOfAvailabilityObjects = [];


    /**
     * The set of available presentation displays
     *
     * @private
     * @type {Array(Display)}
     */
    var listOfAvailablePresentationDisplays = [];


    /**
     * Returns a new valid presentation connection identifier unique among
     * all those present in the set of presentations
     *
     * @function
     * @private
     * @return {String} unique presentation connection id
     */
    var getNewValidPresentationConnectionIdentifier = function () {
      return setOfPresentations.length;
    };


    /**
     * The actual PresentationRequest interface
     */
    var PresentationRequest = function (url) {
      /**
       * Fired when the presentation connection associated with the object is
       * created, following a call to start, reconnect or, for the default
       * presentation, when the UA creates it on the controller's behalf.
       *
       * @type {EventHandler}
       */
      this.onconnectionavailable = null;


      /**
       * Start a presentation connection
       *
       * This method will prompt the user to select a screen among discovered
       * screens.
       *
       * @function
       * @return {Promise<PresentationConnection>} The promise that a user-selected
       *   second screen will have navigated to the requested URL and that the user
       *   agent will try to establish a communication channel between the
       *   controlling and receiving applications.
       *   The promise is rejected when the user did not select any screen or
       *   because navigation to the URL failed.
       */
      this.start = function () {
        return isAllowedToShowPopup()
          .then(monitorAvailablePresentationDisplays)
          .then(function () {
            if (listOfAvailablePresentationDisplays.length === 0) {
              throw new _DOMException('NotFoundError');
            }
          })
          .then(requestUserToSelectPresentationDisplay)
          .then(navigateDisplayToPresentationUrl)
          .then(function (display) {
            var connection = createPresentationConnection(display);
            establishPresentationConnection(connection);
            return connection;
          });
      };


      /**
       * Reconnect to a presentation connection
       *
       * The presentation connection must be known to the underlying user agent. In
       * other words, there should have been a call to "start" performed on that
       * user agent at some point in the past for the exact same presentation
       * request URL.
       *
       * TODO: the polyfill could perhaps save the set of presentations using the
       * the local storage. This probably won't be enough to avoid permission
       * prompts though.
       * 
       * @function
       * @param {String} presentationId The identifier of the presentation 
       * @return {Promise<PresentationConnection>} The promise to have re-connected
       *   to the former presentation connection and that the user agent will try
       *   to re-establish a communication channel between the controlling and
       *   receiving applications.
       *   The promise is rejected if the given presentation identified is unknown.
       */
      this.reconnect = function (presentationId) {
        return new Promise(function (resolve, reject) {
          queueTask(function () {
            var connection = null;
            setOfPresentations.forEach(function (presentation) {
              if (connection) {
                return;
              }
              if ((presentation.url === url) &&
                  (presentation.id === presentationId)) {
                connection = presentation.connection;
              }
            });
            if (connection) {
              resolve(connection);
              establishPresentationConnection(connection);
            }
            else {
              reject(new _DOMException('NotFoundError'));
            }
          });
        });
      };


      /**
       * Request the user agent to monitor the list of available presentation
       * displays
       *
       * @function
       * @return {Promise<PresentationAvailability>} The promise to know whether
       *  presentation displays are available and be notified about evolutions.
       *  The promise is rejected if the user agent is unable to monitor available
       *  displays, either because the user denied it or because it does not
       *  support that feature.
       */
      this.getAvailability = function () {
        return new Promise(function (resolve, reject) {
          log('warn', 'getAvailability is not supported');
          reject(new _DOMException('NotSupportedError'));
        });
      };


      /**********************************************************************
      PresentationRequest - private properties and methods
      **********************************************************************/

      /**
       * A pointer to this object
       */
      var thisPresentationRequest = this;


      /**
       * Determine whether the algorithm is allowed to show a popup
       *
       * @function
       * @private
       * @return {Promise} A promise resolved if algorithm is allowed to show a
       * popup. Promise is rejected with a DOMException named
       * "InvalidAccessError" otherwise.
       */
      var isAllowedToShowPopup = function () {
        return new Promise(function (resolve, reject) {
          // 1. If the algorithm isn't allowed to show a popup, return a Promise
          // rejected with a DOMException named "InvalidAccessError" and abort
          // these steps.
          // TODO: can this be detected in JavaScript?
          resolve();
        });
      };


      /**
       * Monitor the list of presentation displays that are available and return
       * that list
       *
       * @function
       * @private
       * @return {Promise} The Promise that the list of presentation displays
       * will have been refreshed. The promise is never rejected.
       */
       var monitorAvailablePresentationDisplays = function () {
        return new Promise(function (resolve, reject) {
          queueTask(function () {
            log('get list of available displays from registered mechanisms');
            Promise.all(registeredMechanisms.map(function (mechanism) {
              return mechanism.getAvailableDisplays();
            })).then(function (lists) {
              // Flattten the lists of displays
              var newDisplays = lists.reduce(function (a, b) {
                return a.concat(b);
              });

              setOfAvailabilityObjects.forEach(function (availabilityObject) {
                var previousAvailability = availabilityObject.A.value;
                var newAvailability = newDisplays.some(function (display) {
                  log('warn', 'TODO: is display compatible with availabilityUrl?');
                  return true;
                });
                if (previousAvailability !== newAvailability) {
                  queueTask(function () {
                    availabilityObject.A.value = newAvailability;
                    if (availabilityObject.A.onchange) {
                      availabilityObject.A.onchange();
                    }
                  });
                }
              });
              listOfAvailablePresentationDisplays = newDisplays;
              resolve();
            });
          });
        });
      };


      /**
       * Request the user permission for the user of a presentation display and
       * selection of one presentation display
       *
       * @function
       * @private
       * @return {Promise} The promise to get the presentation display that the
       * user will have selected. The promise is rejected with a DOMException
       * named "AbortError" if the user does not select any display.
       */
      var requestUserToSelectPresentationDisplay = function () {
        return new Promise(function (resolve, reject) {
          var msg = 'Select a display:\n\n';
          var idx = 0;
          listOfAvailablePresentationDisplays.forEach(function (display) {
            idx += 1;
            msg += '[' + idx + '] ' + display.name + '\n';
          });
          var choice = window.prompt(msg, '1');
          var display = null;
          try {
            choice = parseInt(choice, 10);
            choice -= 1;
          }
          catch (e) {
            reject(new _DOMException('AbortError'));
            return;
          }
          display = listOfAvailablePresentationDisplays[choice];
          if (display) {
            resolve(display);
          }
          else {
            reject(new _DOMException('AbortError'));
          }
        });
      };


      /**
       * Create a new receiving browsing context on the given display and
       * navigate to the requested URL
       *
       * @function
       * @private
       * @param {Display} display The user-selected display
       * @return {Promise} The promise that the display will have nagivated to
       * the requested URL. The promise is rejected with a DOMException named
       * "OperationError" if the presentation display cannot be navigated to the
       * requested URL.
       */ 
      var navigateDisplayToPresentationUrl = function (display) {
        return new Promise(function (resolve, reject) {
          queueTask(function () {
            log('navigate display to requested url');
            display.navigate(url).then(function () {
              resolve(display);
            }, reject);
          });
        });
      };


      /**
       * Create a presentation connection linked to the selected display
       *
       * Follows the relevant substeps of the "start a presentation connection"
       * algorithm.
       *
       * @function
       * @private
       * @return PresentationConnection A new presentation connection with a
       * valid connection id. The presentation connection is automatically
       * added to the set of presentations.
       */
      var createPresentationConnection = function (display) {
        var connection = new PresentationConnection(display);
        connection.id = getNewValidPresentationConnectionIdentifier();
        connection.state = 'closed';
        setOfPresentations.push({
          url: url,
          id: connection.id,
          connection: connection
        });
        return connection;
      };


      /**
       * Establish a presentation connection with the underlying display
       *
       * The method will queue a task to establish a presentation connection.
       * When successful, a statechange event is fired on the presentation
       * connection.
       *
       * @function
       * @private
       * @param {PresentationConnection} connection The connection that we want
       * to create a connection for
       */
      var establishPresentationConnection = function (connection) {
        // Queue a task to fire an event named "connection" at
        // presentationRequest with S as its connection attribute. 
        queueTask(function () {
          var connectEvent = new PresentationConnectionAvailableEvent({
            connection: connection
          });
          if (thisPresentationRequest.onconnection) {
            thisPresentationRequest.onconnection(connectEvent);
          }
        });

        if (connection.state === 'connected') {
          return;
        }

        queueTask(function () {
          connection.createDataChannel().then(function () {
            queueTask(function () {
              setOfPresentations.forEach(function (presentation) {
                if ((connection !== presentation.connection) &&
                    (presentation.id === connection.id)) {
                  queueTask(function () {
                    if (presentation.connection.onstatechange) {
                      presentation.connection.onstatechange();
                    }
                  });
                }
              });
            });
          });
        });
      };
    };

    return PresentationRequest;
  })();




  /**********************************************************************
  PresentationReceiver interface
  **********************************************************************/

  /**
   * Implements the main interface for the receiving side.
   *
   * This shim implements both the controlling side and the receiving side.
   * However, note that this interface is useless on the controlling side.
   *
   * @constructor
   */
  var PresentationReceiver = function () {
    /**
     * Fired when a new incoming presentation connection is detected.
     * A call to "getConnections" will return the list of presentations.
     *
     * @type {EventHandler}
     */
    this.onconnectionavailable = null;


    /**
     * Retrieve the first connected presentation connection as it becomes
     * available
     *
     * The function waits indefinitely if no controlling browsing context
     * connects to this connection.
     *
     * @function
     * @return {Promise<PresentationConnection>} The promise that some controlling
     *   application has initiated connection to this app, perhaps as the result
     *   of calling PresentationRequest.start() and that the user agent will
     *   establish a communication channel between the controlling and receiving
     *   applications.
     *   The promise is never rejected but may hang indefinitely if no
     *   controlling application ever connects to this application.
     *   Note that the presentation connection that gets returned may be in a
     *   "closed" state if controlling side has closed in the
     *   meantime.
     */
    this.getConnection = function () {
      if (pendingPromise) {
        return pendingPromise;
      }
      else {
        pendingPromise = new Promise(function (resolve, reject) {
          queueTask(function () {
            if (setOfIncomingPresentations.length === 0) {
              pendingResolveFunction = resolve;
            }
            else {
              resolve(setOfIncomingPresentations[0].connection);
            };
          });
        });
        return pendingPromise;
      }
    };


    /**
     * Retrieve the list of connected connections
     *
     * @function
     * @return {Promise<[PresentationConnection]>} The promise to be given a list
     *   of presentation connections that are currently associated with this
     *   receiving application.
     */
    this.getConnections = function () {
      return new Promise(function (resolve, reject) {
        queueTask(function () {
          var connections = setOfIncomingPresentations.map(function (presentation) {
            return presentation.connection;
          });
          resolve(connections);
        });
      });
    };


    /**********************************************************************
    PresentationReceiver - private properties and methods
    **********************************************************************/
    var thisPresentationReceiver = this;

    /**
     * The set of incoming presentation connections
     *
     * @private
     * @type {Array({url:String, id:String, connection:PresentationConnection})}
     */
    var setOfIncomingPresentations = [];


    /**
     * Pending promise for the first incoming presentation connection.
     *
     * The promise is set by the first call to getConnection and returned
     * afterwards.
     *
     * @private
     * @type {Promise}
     */
    var pendingPromise = null;

    /**
     * Pending resolve function to call when the first incoming presentation
     * connection is detected.
     *
     * The function is set by the UA when getConnection is called before any
     * presentation connection is available.
     *
     * @private
     * @type {function}
     */
    var pendingResolveFunction = null;


    /**
     * Monitor incoming presentation connections
     *
     * @function
     * @private
     */
    var monitorIncomingPresentationConnections = function () {
      queueTask(function () {
        var connection = null;
        registeredMechanisms.forEach(function (mechanism) {
          mechanism.monitorIncomingControllers();
          mechanism.onincomingcontroller = function (controller) {
            log('new incoming presentation connection');
            connection = new PresentationConnection(controller);
            connection.createDataChannel().then(function () {
              connection.id = 'connection-' + setOfIncomingPresentations.length;
              setOfIncomingPresentations.push({
                url: null,
                id: connection.id,
                connection: connection
              });
              if (thisPresentationReceiver.onconnectionavailable) {
                thisPresentationReceiver.onconnectionavailable();
              }
              if (pendingResolveFunction) {
                pendingResolveFunction(connection);
                pendingResolveFunction = null;
                pendingPromise = null;
              }
            });
          };
        });
      });
    };


    // Detects whether there is already a connection attached with this
    // receiving context when the shim is loaded. The code is the same as for
    // "getConnection", except that it allows the controlling and receiving
    // browsing contexts to setup the communication channel immediately
    window.addEventListener('load', function () {
      log('info', 'check whether code is running in a presentation receiver app');
      monitorIncomingPresentationConnections();
    });
  };




  /**********************************************************************
  Presentation interface
  **********************************************************************/

  /**
   * Implements the main Presentation interface, exposed on navigator
   *
   */
  var Presentation = {
    /**
     * The default presentation request that the user-agent should use
     * when user chooses to start the presentation from the user-agent
     * chrome.
     *
     * @type {PresentationRequest}
     */
    defaultRequest: null,

    /**
     * The main receiving interface
     * (only defined in the receiving browsing context)
     *
     * @type {PresentationReceiver}
     */
    receiver: new PresentationReceiver()
  };




  /**********************************************************************
  Expose interfaces to the global scope (prefixed with W3C)
  **********************************************************************/

  // Expose the Presentation API to the navigator object
  // (prefixed with W3C)
  navigator.w3cPresentation = Presentation;

  // Expose the PresentationRequest constructor to the window object
  window.w3cPresentationRequest = PresentationRequest;

  // Also expose the interfaces and method required to extend the shim with
  // new presentation mechanisms defined in some external JS file
  navigator.w3cPresentation.extend = {
    log: log,
    _DOMException: _DOMException,
    PresentationMechanism: PresentationMechanism,
    RemoteController: RemoteController,
    Display: Display,
    DataChannel: DataChannel,
    registerPresentationMechanism: registerPresentationMechanism
  };
})();