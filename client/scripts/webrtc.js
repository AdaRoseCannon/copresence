'use strict';
/* global io, _, Map, AFRAME */
/* eslint-env browser */
/* eslint no-var: 0, no-console: 0 */


/**
 * CONSTANTS AND UTILITY FUNCTIONS
 */

var audioCtx = new AudioContext();

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

var RADTODEG = 180 / Math.PI;
function radToDeg(n) {
	return n * RADTODEG;
}

function numberToPrecision(n) {
	return n.toFixed(5);
}

function logError(err) {
	console.log(err.toString(), err);
}

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
		(function () {
			cleanUpPeerConnById(id, true);
			console.log('disco: ' + id);
		} ());
	}
});

window.addEventListener('unload', function () {
	Array.from(peerConns.keys()).forEach(function (id) {
		cleanUpPeerConnById(id);
	});

	// tell server leaving room
	socket.emit('bye');
});

function cleanUpPeerConnById(id, nomessage) {
	if (!nomessage) {

		// Tell other peers this connection is being closed
		sendMessage('bye', id);
	}
	var peerConn = peerConns.get(id);
	peerConns.delete(id);
	if (peerConn.__avatar) {
		peerConn.__avatar.parentNode.removeChild(peerConn.__avatar);
	}
	peerConn.close();
}

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

	peerConn.onconnectionstatechange = function() {
		switch(peerConn.connectionState) {
			case 'connected':
				console.log('connected');
			break;
			case 'disconnected':
			case 'failed':
				console.log('TODO: RECONNECT');
				if (peerConn.__peerConnId) {
					cleanUpPeerConnById(peerConn.__peerConnId);
				}
			// One or more transports has terminated unexpectedly or in an error
			break;
			case 'closed':
				if (peerConn.__peerConnId) {
					console.log('Connection closed ' + peerConn.__peerConnId);
					cleanUpPeerConnById(peerConn.__peerConnId);
				}
			break;
		}
	}

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

var onMessage = _.curry(function onMessage(avatar, event) {
	var data = event.data.split(';').map(_.trim);
	avatar.setAttribute('position', data[0]);
	avatar.setAttribute('rotation', data[1]);
}, 2);

function onDataChannelCreated(peerConn, channel) {
	console.log('onDataChannelCreated:', channel);

	channel.onopen = function() {
		console.log('CHANNEL opened!!!');
		peerConn.__dataChannel = channel;
		var el = document.querySelector('[webrtc-avatar]');
		if (el) {
			var avatar = el.components['webrtc-avatar'].createAvatar();
			peerConn.__avatar = avatar;
			channel.onmessage = onMessage(avatar);
		}
	};
}

/**
 * REGISTERRING THE COMPONENT
 *
 * web-rtc avatar sits on what you want to track
 *
 * with the room is the room it is part of
 *
 * */

AFRAME.registerComponent('webrtc-avatar', {
	schema:{
		room: {
			type: 'string'
		}
	},
	update: function () {

		// Clean up before updating
		this.remove();

		if (document.querySelectorAll('[webrtc-avatar]').length > 1) {
			throw Error('Only one avatar can be established');
		}

		var room = this.data.room;
		var target = this.el.parentNode;
		var avatarString = this.el.innerHTML;
		this.el.innerHTML = '';

		this.createAvatar = function createAvatar() {
			var avatar = document.createElement('a-entity');
			avatar.innerHTML = avatarString;
			target.parentNode.appendChild(avatar);
			return avatar;
		}

		// Join a room
		socket.emit('create or join', room);

		this.sendAvatarData = _.throttle(function coords() {
			var data =
				target.object3D.getWorldPosition().toArray().slice(0, 3).map(numberToPrecision).join(' ') +
				';' +
				target.object3D.rotation.toArray().slice(0, 3).map(radToDeg).map(numberToPrecision).join(' ');
			var channels = getDataChannels();
			channels.forEach(function (dataChannel) {
				dataChannel.send(data);
			});
		}, 16);
	},
	tick: function () {
		this.sendAvatarData();
	},
	remove: function () {

		socket.emit('bye');

		// Close all old connections
		Array.from(peerConns.keys()).forEach(function (id) {
			cleanUpPeerConnById(id);
		});

	}
});