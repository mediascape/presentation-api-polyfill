# Presentation API polyfill

This repository contains a JavaScript polyfill of the [Presentation API](https://w3c.github.io/presentation-api/) specification under standardisation within the [Second Screen Working Group](https://www.w3.org/2014/secondscreen/) at W3C. The polyfill is mostly intended for exploring how the Presentation API may be implemented on top of different presentation mechanisms.

Presentation mechanisms that are currently supported are:

1. **Cast**: Supports presenting to a Chromecast device using Google Chrome's Cast extension.
2. **Physical Web**: Supports broadcasting the URL to present through a Bluetooth Low-Energy device
3. **Window**: Opens the presentation in a separate browser window

## Usage / Examples

Check the [Presentation API polyfill home page](https://mediascape.github.io/presentation-api-polyfill).


## Authors

* François Daoust <[fd@w3.org](mailto:fd@3.org)>
* Dominique Hazaël-Massieux <[dom@w3.org](mailto:dom@3.org)>


## License

The source code is available under an [Apache 2.0 license](http://www.apache.org/licenses/LICENSE-2.0).


## Acknowledgements

This work was done with support from the European Commission under grant agreement no: 610404 ([MediaScape](http://www.mediascapeproject.eu/)).
