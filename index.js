'use strict';
/* eslint-env es6 */
/* eslint no-console: 0 */

const express = require('express');
const socketIO = require('socket.io');
const http = require('http');
const app = express();
const httpServer = http.createServer(app).listen(process.env.PORT || 8080);

function hasRoom(room) {
	return (io.sockets.adapter.rooms[room] !== undefined);
}

function getFromRoom(room) {
	let ioRoom = io.sockets.adapter.rooms[room];
	if (ioRoom) {
		return Object.keys(ioRoom).map(id => io.sockets.connected[id]);
	} else {
		throw Error('no room called ' + room);
	}
}

function emitToRoomButExcludeSelf(socket, ...emit ) {
	// console.log('Client said: ', message);
	const ioRoom = hasRoom(socket.__webRTCRoom) && getFromRoom(socket.__webRTCRoom);

	if (ioRoom) {
		ioRoom.forEach(function (socketOut) {
			if (socketOut !== socket) {
				socketOut.emit(...emit);
			}
		});
	}
}

const io = socketIO.listen(httpServer);
io.sockets.on('connection', function (socket) {

	socket.__webRTCRoom = null;

	socket.on('message', function (message, connectionId) {
		emitToRoomButExcludeSelf(socket, 'message', message, connectionId);
	});

	socket.on('create or join', function (room) {
		console.log('Received request to create or join room ' + room);
		socket.__webRTCRoom = room;
		socket.join(room);
		console.log('joined room', room, socket.id);
		socket.emit('joined', room, socket.id);
		console.log('People in room', room, getFromRoom(room).length);
		emitToRoomButExcludeSelf(socket, 'new arrival');
		socket.emit('ready', getFromRoom(room).length);
	});

	socket.on('bye', function () {
		socket.leave(socket.__webRTCRoom);
		console.console.log('received bye');
	});

});

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.use(express.static('client'));
