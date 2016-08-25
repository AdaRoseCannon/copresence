/* global Peer */

'use strict';

var notesMap = {
	do: 'c',
	re: 'd',
	mi: 'e',
	fa: 'f',
	sol: 'g',
	la: 'a',
	si: 'b'
};
var notes = Object.keys(notesMap);


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
	document.getElementById('id-label').setAttribute('bmfont-text', 'text: My id: ' + id);
}

var currentlyDialing = [];
var dialDisplay = document.getElementById('dial-label')
function updateDisplay() {
	dialDisplay.setAttribute('bmfont-text', 'text: ' + currentlyDialing.join('-'));
}

function playSound(rhyme) {
	var note = document.querySelector('[data-dial-key="' + rhyme + '"]').components.sound;
	if (note.sound.isPlaying) {
		note.stopSound();
	}
	setTimeout(function () {
		if (!note.sound.isPlaying) {
			note.playSound();
		}
	}, 16);
}

document.getElementById('dial-button').addEventListener('click', function () {
	var data = currentlyDialing.splice(0);
	data.forEach(function (n, i) {
		setTimeout(function() {
			playSound(n);
		}, 300 * i + 300);
	});
	updateDisplay();
});

Array.from(document.querySelectorAll('[data-dial-key]'))
.forEach(function (p) {
	p.addEventListener('click', function () {
		currentlyDialing.push(this.dataset.dialKey);
		updateDisplay();
		playSound(this.dataset.dialKey);
	});
});