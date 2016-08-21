var express = require('express');
var app = express();
var ExpressPeerServer = require('peer').ExpressPeerServer;

app.set('port', (process.env.PORT || 3001));

app.use('/', (req, res) => res.end('hello world'));

app.use('/peerjs', ExpressPeerServer(app, {proxied: true, debug: true}));

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
