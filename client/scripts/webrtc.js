'use strict';
/* global io, _, Map */
/* eslint-env browser */
/* eslint no-var: 0, no-console: 0 */

/****************************************************************************
 * Initial setup
 ****************************************************************************/


var audioCtx = new AudioContext();
var scene = document.querySelector('a-scene');

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

var configuration = {
	'iceServers': [{
		'urls': [
			'stun:stun.l.google.com:19302'
		]
	},
	{
		'urls': [
			'stun:stun.services.mozilla.com'
		]
	}]
};

var peerConns = new Map();
var availablePeerConns = [];

// for connection ids
function genId() {
	return Number(
		Math.floor(performance.now() * 100000) + '' + Math.floor(Math.random() * 1000000)
	).toString(36);
}

// for room names
function randomToken() {
	var tune = [Math.floor(Math.random() * notes.length), Math.floor(Math.random() * notes.length), Math.floor(Math.random() * notes.length)];
	var id = tune.map(function (n) {return notes[n]}).join('-');
	return id;
}

// Create a random room if not already present in the URL.
var room = window.location.hash.substring(1);
if (!room) {
	room = window.location.hash = randomToken();
}
document.getElementById('id-label').setAttribute('bmfont-text', 'text: My room: ' + room);

/****************************************************************************
 * Signaling server
 ****************************************************************************/

// Connect to the signaling server
var socket = io.connect();

socket.on('joined', function(room, clientId) {
	console.log('This peer has joined room', room, 'with client ID', clientId);
});

socket.on('ready', function (count) {
	var i;
	var peerConn;

	// Connect to preexisting clients
	for (i = 0; i < count - 1; i++) {
		console.log('Creating an offer');
		peerConn = createPeerConnection(configuration);
		peerConn.__peerConnId = genId();
		peerConns.set(peerConn.__peerConnId, peerConn);

		var dataChannel = peerConn.createDataChannel('coords', {
			maxPacketLifeTime: 16,
			maxRetransmits: 1
		});
		onDataChannelCreated(peerConn, dataChannel);

		// navigator.mediaDevices.getUserMedia({
		// 	audio: true,
		// 	video: false
		// })
		// .then(function (mediaStream) {
		// 	mediaConnection.answer(mediaStream);
		// });
		// mediaConnection.on('stream', function (stream) {
		// 	var source = audioCtx.createMediaStreamSource(stream);

		// 	// Create a biquadfilter
		// 	var biquadFilter = audioCtx.createBiquadFilter();
		// 	biquadFilter.type = "lowshelf";
		// 	biquadFilter.frequency.value = 1000;
		// 	biquadFilter.gain.value = 1;

		// 	source.connect(biquadFilter);
		// 	biquadFilter.connect(audioCtx.destination);
		// });

		peerConn.createOffer(onLocalSessionCreated(peerConn), logError);
	}
});

socket.on('new arrival', function () {
	console.log('Someone has joined the channel so making a new connection for them and waiting for an offer.');
	var peerConn = createPeerConnection(configuration);
	availablePeerConns.push(peerConn);
});

socket.on('message', function(message, id) {
	// console.log('Client received message:', message);
	if (message.type === 'offer') {
		(function () {
			console.log('Got offer. Sending answer to peer.');

			var peerConn = availablePeerConns.pop();
			peerConns.set(id, peerConn);

			// set the id to the one received from the description
			peerConn.__peerConnId = id;
			peerConn.setRemoteDescription(new RTCSessionDescription(message), function () { }, logError);
			peerConn.createAnswer(onLocalSessionCreated(peerConn), logError);

		} ());
	} else if (message.type === 'answer') {
		(function () {
			var peerConn = peerConn = peerConns.get(id);
			console.log('Got answer.');
			peerConn.setRemoteDescription(new RTCSessionDescription(message), function () {
				console.log('Connected');
			}, logError);
		} ());
	} else if (message.type === 'candidate') {
		(function () {
			var peerConn = peerConn = peerConns.get(id);
			peerConn.addIceCandidate(new RTCIceCandidate({
				candidate: message.candidate
			}));
		} ());
	} else if (message === 'bye') {
		// TODO: cleanup RTC connection?
		console.log('disco');
	}
});

// Join a room
socket.emit('create or join', room);

/**
 * Send message to signaling server
 */
function sendMessage(message, id) {
	// console.log('Client sending message: ', message);
	socket.emit('message', message, id);
}

/****************************************************************************
 * WebRTC peer connection and data channel
 ****************************************************************************/

/**
 * Need to rejig so it works with many peers
 */
function createPeerConnection(config) {
	var peerConn = new RTCPeerConnection(config);

	// send any ice candidates to the other peer
	peerConn.onicecandidate = function(event) {
		// console.log('icecandidate event:', event);
		if (event.candidate) {
			sendMessage({
				type: 'candidate',
				label: event.candidate.sdpMLineIndex,
				id: event.candidate.sdpMid,
				candidate: event.candidate.candidate
			}, peerConn.__peerConnId);
		} else {
			// console.log('End of candidates.');
		}
	};

	peerConn.ondatachannel = function (event) {
		// console.log('ondatachannel:', event.channel);
		onDataChannelCreated(peerConn, event.channel);
	};

	return peerConn;
}

// Used to send offers and answers
var onLocalSessionCreated = _.curry(function onLocalSessionCreated(peerConn, desc) {
	// console.log('local session created:', desc);
	peerConn.setLocalDescription(desc, function () {
		// console.log('sending local desc:', peerConn.localDescription);
		sendMessage(peerConn.localDescription, peerConn.__peerConnId);
	}, logError);
}, 2);

function getDataChannels() {
	return _.compact(Array.from(peerConns.values()).map(function (peerConn) {
		return peerConn.__dataChannel;
	}));
}

function createAvatar() {
	var avatar = document.createElement('a-entity');
	avatar.innerHTML = '<a-box></a-box>';
	scene.appendChild(avatar);
	return avatar;
}

function onDataChannelCreated(peerConn, channel) {
	console.log('onDataChannelCreated:', channel);

	channel.onopen = function() {
		console.log('CHANNEL opened!!!');
		peerConn.__dataChannel = channel;

		var avatar = createAvatar();
		channel.onmessage = onMessage(avatar);
	};
}

var onMessage = _.curry(function onMessage(avatar, event) {
	var data = event.data.split(';').map(_.trim);
	avatar.setAttribute('position', data[0]);
	avatar.setAttribute('rotation', data[1]);
}, 2);

var RADTODEG = 180 / Math.PI;
function radToDeg(n) {
	return n * RADTODEG;
}

function numberToPrecision(n) {
	return n.toFixed(5);
}

window.sendAvatarData = _.throttle(function coords() {
	var data = scene.camera.getWorldPosition().toArray().slice(0, 3).map(numberToPrecision).join(' ') +
		';' + scene.camera.parent.rotation.toArray().slice(0, 3).map(radToDeg).map(numberToPrecision).join(' ');
	var channels = getDataChannels();
	channels.forEach(function (dataChannel) {
		dataChannel.send(data);
	});
}, 16);

function logError(err) {
	console.log(err.toString(), err);
}
