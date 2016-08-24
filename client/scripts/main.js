/* global Peer */

'use strict';

var notes = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
var notesSound = ['sounds/C.wav', 'sounds/D.wav', 'sounds/E.wav', 'sounds/F.wav', 'sounds/G.wav', 'sounds/A.wav', 'sounds/B.wav'];
function getId() {
	var tune = [Math.floor(Math.random() * notes.length), Math.floor(Math.random() * notes.length), Math.floor(Math.random() * notes.length)];
	var tune = [1,2,3];
	var id = tune.map(function (n) {return notes[n]}).join('-');
	return id;
}
var id = getId();
var peer = null;
navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);

(function generatePeer() {
	peer = new Peer(id, { path: 'peerjs', host: location.hostname, secure: !!location.protocol.match(/^https/), port: location.port || 80 });
	peer.on('error', function(err) {
		switch(err.type) {
			case 'unavailable-id':
				id = getId();
				peer.destroy();
				generatePeer();
				break;
			default:
				console.log(err.type, err);
				setTimeout(function () {
					peer.reconnect();
				}, 250);
		}
	});
	peer.on('open', ready);
}());

function ready(id) {
	console.log(id);
}