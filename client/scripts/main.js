/* eslint no-var: 0, no-console: 0 */
/* global AFRAME */

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

		if (!data.length) throw Error('No ID entered');
		window.dial(data.join('-'), mediaStream);
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

AFRAME.registerSystem('senddata', {schema:{}, tick: function() {
	window.sendAvatarData();
}});