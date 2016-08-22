'use strict';

const express = require('express');
const app = express();
const expressPeerServer = require('peer').ExpressPeerServer;

app.set('port', (process.env.PORT || 3001));

const server = app.listen(app.get('port'), function() {
	console.log('Node app is running on port', app.get('port'));
});

const peerServer = expressPeerServer(server, { proxied: true, debug: true });

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.use('/peerjs', peerServer);
app.use(express.static('client'));

peerServer.on('connection', function(id) {
	console.log(id);
	console.log(server._clients);
});

server.on('disconnect', function(id) {
	console.log(id + "deconnected");
});