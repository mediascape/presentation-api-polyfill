# Presentation API polyfill

This repository contains a JavaScript polyfill of the [Presentation API](https://w3c.github.io/presentation-api/) specification under standardisation within the [Second Screen Working Group](https://www.w3.org/2014/secondscreen/) at W3C. The polyfill is mostly intended for exploring how the Presentation API may be implemented on top of different presentation mechanisms.

Presentation mechanisms that are currently supported are:

1. **Cast**: Supports presenting to a Chromecast device using Google Chrome's Cast extension.
2. **DIAL**: Supports presenting to a DIAL devices with a specific set of DIAL applications (that may be specified at runtime)
3. **HbbTV 2.0**: Supports presenting to an HbbTV 2.0 device (HbbTV is a specific case of the DIAL mechanism in practice)
4. **QR Code**: Generates and displays the URL that another device may pick up
5. **Physical Web**: Supports broadcasting the URL to present through a Bluetooth Low-Energy device
6. **Window**: Opens the presentation in a separate browser window

**Important**: The establishment of a communication channel between the peers is either not fully implemented (Cast, Window) or simply not available at all when it cannot be established automatically (DIAL, HbbTV, QR Code). The polyfill uses an `isChannelOptional` presentation request option flag to let the calling app specify whether it needs a communication channel (the default) or will handle the communication on its own.


## Usage / Examples

Check the [Presentation API polyfill home page](https://mediascape.github.io/presentation-api-polyfill).


## Authors

* François Daoust <[fd@w3.org](mailto:fd@3.org)>
* Dominique Hazaël-Massieux <[dom@w3.org](mailto:dom@3.org)>


## License

The source code is available under a [W3C Software and Document License](http://www.w3.org/Consortium/Legal/2015/copyright-software-and-document). Parts of the code depends on other third-party open-source libraries that are available under similar license (e.g. MIT).


## Acknowledgements

This work was done with support from the European Commission under grant agreement no: 610404 ([MediaScape](http://www.mediascapeproject.eu/)).
