var express = require("express"),
    app = express(),
    http = require('http').Server(app),
    beacon;
var bodyParser = require('body-parser');
var EventEmitter = require('events').EventEmitter;
var emitter = new EventEmitter();


app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

emitter.setMaxListeners(0);

// this is the back-end for the pseudo JavaScript API to broadcast URL
app.post('/api/beacon', function(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.body.action === "start") {
        beacon = require('eddystone-beacon');
        beacon.advertiseUrl(req.body.url);
        res.end();
    } else if (req.body.action === "stop") {
        beacon = undefined;
        res.end();
    }
});


http.listen(3000, function() {
    console.log('listening on *:3000');
});
