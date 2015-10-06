/**
 * @file Presentation API polyfill
 * @copyright 2015 W3C (MIT, ERCIM, Keio, Beihang)
 * @license W3C Software and Document License
 * @author François Daoust <fd@w3.org>
 *
 * This is a polyfill of the Presentation API specification that embeds all
 * available presentation mechanisms so far.
 *
 * The polyfill intents to remain as close as possible to the Presentation API
 * specification:
 * https://w3c.github.io/presentation-api/
 *
 * This polyfill was built automatically by concatenating files in the
 * presentation-api-polyfill repository:
 * https://mediascape.github.io/presentation-api-polyfill
 *
 * Please note that this polyfill does not include external dependencies.
 * For instance, to use the Cast mechanism, the Cast sender library needs to
 * be loaded before that code. Typically, to use the polyfill, ensure the
 * HTML of the controlling app includes code such as:
 *
 * <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"></script>
 * <script src="presentation-api-polyfill.js"></script>
 *
 * Similarly, the Cast receiver library needs to be loaded before the polyfill:
 *
 * <script src="https://www.gstatic.com/cast/sdk/libs/receiver/2.0.0/cast_receiver.js"></script>
 * <script src="presentation-api-polyfill.js"></script>
 *
 * Also note that other mechanisms such as the Physical Web one also require
 * to "proxy" commands through some local backend server.
 */
