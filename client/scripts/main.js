/* global Peer */

'use strict';

var audioCtx = new AudioContext();

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
	var id = tune.map(function (n) {return notes[n]}).join('-');
	return id;
}
var id = getId();
var peer = null;
var timoutToReconnect = 2000;

(function generatePeer() {
	peer = new Peer(id, { path: 'peerjs', host: location.hostname, port: location.port || 80 });
	peer.on('error', function handleErr(err) {
		switch(err.type) {
			case 'unavailable-id':
				id = getId();
				break;
			case 'peer-unavailable':
				console.log(err.message);
				return;
		}
		peer.off('error', handleErr);
		timoutToReconnect *= 2;
		console.log(err.type, err);
		console.log('Disconnected reconnecting in ' + (timoutToReconnect / 1000) + ' seconds');
		peer.destroy();
		setTimeout(function () {
			generatePeer();
		}, timoutToReconnect);
	});
	peer.on('call', function receiveCall(mediaConnection) {
		navigator.mediaDevices.getUserMedia({
			audio: true,
			video: false
		})
		.then(function (mediaStream) {
			mediaConnection.answer(mediaStream);
		});
		mediaConnection.on('stream', function (stream) {
			var source = audioCtx.createMediaStreamSource(stream);

			// Create a biquadfilter
			var biquadFilter = audioCtx.createBiquadFilter();
			biquadFilter.type = "lowshelf";
			biquadFilter.frequency.value = 1000;
			biquadFilter.gain.value = 1;

			source.connect(biquadFilter);
			biquadFilter.connect(audioCtx.destination);
		});
	});
	peer.on('open', ready);
}());

function ready(id) {
	timoutToReconnect = 2000;
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

	navigator.mediaDevices.getUserMedia({
		audio: true,
		video: false
	})
	.then(function (mediaStream) {

		if (!data.length) throw Error('No ID entered');
		peer.call(data.join('-'), mediaStream);
	})
	.then(function () {
		data.forEach(function (n, i) {
			setTimeout(function () {
				playSound(n);
			}, 300 * i + 300);
		});
		updateDisplay();
	});
});

Array.from(document.querySelectorAll('[data-dial-key]'))
.forEach(function (p) {
	p.addEventListener('click', function () {
		currentlyDialing.push(this.dataset.dialKey);
		updateDisplay();
		playSound(this.dataset.dialKey);
	});
});