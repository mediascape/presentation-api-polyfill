/**
 * @file QR code presentation mechanism for the Presentation API polyfill
 * @copyright 2015 W3C (MIT, ERCIM, Keio, Beihang)
 * @license W3C Software and Document License
 * @author François Daoust <fd@w3.org>
 *
 * The QR code presentation mechanism allows a user to generate and display
 * a QR code that a receiving device may then scan to load the underlying URL.
 *
 * To display the QR code, please note that the code needs to add HTML content
 * to the Web application. This may potentially create conflicts with styles
 * of the controlling Web application.
 *
 * The controlling application does not have nay way to tell that the QR code
 * has been indeed scanned. It cannot create a communication channel between
 * the controlling side and the receiving side.
 *
 * The QR code generation uses the QRCode.js library which must have been
 * loaded before that mechanism for this mechanism to report an available
 * screen.
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
   * Remote controller (does not do anything in this mechanism)
   *
   * @constructor
   * @private
   * @inherits {RemoteController}
   */
  var QRCodeRemoteController = function () {
    RemoteController.call(this);

    /**
     * No way to create a data channel since the receiving side cannot
     * directly communicate with the controlling device, so the data
     * channel creation simple hangs on forever.
     *
     * @function
     * @return {Promise<DataChannel>} The promise to get a data communication
     * channel ready for exchanging messages with the remote controller
     */
    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        console.info('no possible "native" data channel');
      });
    };
  };


  /**
   * Represents a QR code "display". In practice, this represents the
   * possibility to have the URL represented as a QR code.
   *
   * @constructor
   * @inherits {Display}
   * @param {String} name A human-friendly name for that type of display
   */
  var QRCodeDisplay = function (name) {
    Display.call(this, name);

    /**
     * "Navigate" the "display" to the given URL, thus creating a receiving
     * browsing context.
     *
     * For this mechanism, navigation means generating and displaying the
     * given URL as a QR code, hoping that someone will pick it up. In other
     * words, when the Promise returned by this function resolves, all we know
     * is that someone may connect.
     *
     * @function
     * @param {String} url The URL to navigate to
     * @return {Promise} The promise to have navigated to the given URL. The
     * promise is rejected with a DOMException named "OperationError"
     */
    this.navigate = function (url) {
      return new Promise(function (resolve, reject) {
        var qrElement = document.createElement('div');
        qrElement.id = 'presentation-api-polyfill-qrcode';
        qrElement.style.width = '200px';
        qrElement.style.height = '200px';
        qrElement.style.margin = '1em auto';

        var closeButton = document.createElement('button');
        closeButton.innerHTML = 'Close';
        closeButton.style.width = '100%';
        closeButton.style.height = '2em';
        closeButton.style.marginTop = '1em';
        closeButton.style['font-size'] = 'larger';
        closeButton.addEventListener('click', function (event) {
          event.preventDefault();
          document.body.removeChild(container);
          resolve();
          return false;
        });

        var modal = document.createElement('div');
        modal.style.width = '300px';
        modal.style.height = '300px';
        modal.style.margin = '1em auto';
        modal.style.padding = '1em';
        modal.style['background-color'] = '#ffffff';
        modal.appendChild(qrElement);
        modal.appendChild(closeButton);

        var container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = 0;
        container.style.left = 0;
        container.style.height = '100%';
        container.style.width = '100%';
        container.style['z-index'] = 10;
        container.style['background-color'] =  'rgba(0,0,0,0.5)';
        container.appendChild(modal);

        document.body.appendChild(container);
        var code = new QRCode('presentation-api-polyfill-qrcode', {
          text: toAbsolute(url),
          width: 200,
          height: 200,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
      });
    };


    /**
     * No way to create a data channel since the receiving side cannot
     * directly communicate with the controlling device, so the data
     * channel creation simple hangs on forever.
     *
     * @function
     * @return {Promise<DataChannel>} The promise to get a data communication
     * channel ready for exchanging messages with the remote controller
     */
    this.createDataChannel = function () {
      return new Promise(function (resolve, reject) {
        console.info('no possible "native" data channel');
      });
    };
  };


  /**
   * Presentation API mechanism that displays the requested URL in QR code
   *
   * @constructor
   * @inherits {PresentationMechanism}
   */
  var QRCodePresentationMechanism = function () {
    PresentationMechanism.call(this);
    this.name = 'QR code presentation mechanism';

    var that = this;

    this.getAvailableDisplays = function () {
      return new Promise(function (resolve, reject) {
        if (typeof QRCode !== 'undefined') {
          resolve([new QRCodeDisplay('QR code')]);
        }
        else {
          resolve([]);
        }
      });
    };
  };
  QRCodePresentationMechanism.prototype = new PresentationMechanism();


  // Register the presentation mechanism
  registerPresentationMechanism(new QRCodePresentationMechanism());
})();
