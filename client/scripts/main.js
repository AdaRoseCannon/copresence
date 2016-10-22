/* eslint no-var: 0, no-console: 0 */

'use strict';

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

		if (!data.length) throw Error('No room ID entered');
		dial(data.join('-'), mediaStream);
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


// for room names
function randomToken() {
	var tune = [Math.floor(Math.random() * notes.length), Math.floor(Math.random() * notes.length), Math.floor(Math.random() * notes.length)];
	var id = tune.map(function (n) {return notes[n]}).join('-');
	return id;
}

var notes = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];

var webrtcAvatar = document.getElementById('webrtc-avatar');
function dial(room) {
	window.location.hash = room;
	webrtcAvatar.setAttribute('webrtc-avatar', 'room:' + room);
	document.getElementById('id-label').setAttribute('bmfont-text', 'text: My room: ' + room);
}

webrtcAvatar.addEventListener('avatar-created', function (e) {
	var avatar = e.detail;
	var col = 'color: hsl(' + Math.random() * 360 + ',80%,60%);';
	Array.from(avatar.querySelectorAll('.recolor'))
	.forEach(function (el) {
		if (el.matches('.avatar-boom')) {
			el.setAttribute('material', col + 'side: double; transparent: true; opacity: 0.5;');
		} else {
			el.setAttribute('material', col);
		}
	});
	webrtcAvatar.emit('sendstringmessage', 'colorme: ' + 'blue');
	avatar.addEventListener('avatarmessage', function (e) {
		console.log('Message from avatar: ' + e.detail);
	});
});

var scene = document.querySelector('a-scene');
if (scene.hasLoaded) {
  run();
} else {
  scene.addEventListener('loaded', run);
}
function run () {
	var cam = document.querySelector('a-camera');
	var pos = cam.getAttribute('position');
	cam.setAttribute('position', (6 * Math.random() - 3 + pos.x) + ' ' + pos.y + ' ' + pos.z);
}

// Create a random room if not already present in the URL.
var room = window.location.hash.substring(1);
if (!room) {
	room = randomToken();
}
dial(room);

(function () {

	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('/sw.js', { scope: '/' })
		.then(function (reg) {
			console.log('sw registered', reg);
		}).catch(function (error) {
			console.log('sw registration failed with ' + error);
		});
	}
}())