'use strict';
/* global io, _, Map, AFRAME, Promise, Uint8Array */
/* eslint-env browser */
/* eslint no-var: 0, no-console: 0 */


/**
 * CONSTANTS AND UTILITY FUNCTIONS
 */

var audioCtx = new AudioContext();
var audioStreamPromise = navigator.mediaDevices.getUserMedia({
	audio: true,
	video: false
})
.then(function (stream) {
	var microphone = audioCtx.createMediaStreamSource(stream);
	var filter = audioCtx.createBiquadFilter();
	var peer = audioCtx.createMediaStreamDestination();
	microphone.connect(filter);
	filter.connect(peer);
	return peer.stream;
});

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

var peerConnPromises = new Map();

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

	// Connect to preexisting clients
	function connect(peerConn) {
		console.log('Creating an offer, id:', peerConn.__peerConnId);

		var dataChannel = peerConn.createDataChannel('coords', {
			maxPacketLifeTime: 16,
			maxRetransmits: 1
		});
		dataChannel.__peerConn = peerConn;
		onDataChannelCreated(peerConn, dataChannel);

		peerConn.createOffer(onLocalSessionCreated(peerConn), logError);
	}

	for (i = 0; i < count - 1; i++) {
		createPeerConnection(configuration).then(connect);
	}
});

socket.on('new arrival', function () {
	console.log('Someone has joined the channel so waiting for an offer.');
});

socket.on('message', function(message, id) {
	// console.log('Client received message:', message);
	if (message.type === 'candidate') {
		(function () {

			var promise = peerConnPromises.get(id);
			if (!promise) {
				console.log('I don\'t have a connection with id', id);
				return;
			}
			promise.then(function (peerConn) {
				peerConn.addIceCandidate(new RTCIceCandidate({
					candidate: message.candidate
				}));
			});
		} ());
	} else if (message.type === 'offer') {
		(function () {

			Promise.resolve(peerConnPromises.get(id))
			.then(function (pc) {
				return pc || createPeerConnection(configuration, id);
			})
			.then(function (peerConn) {
				console.log('Got offer. Sending answer to peer, id: ', id);
				peerConn.setRemoteDescription(new RTCSessionDescription(message), function () { }, logError);
				peerConn.createAnswer(onLocalSessionCreated(peerConn), logError);
			});

		} ());
	} else if (message.type === 'answer') {
		(function () {
			var promise = peerConnPromises.get(id);
			if (!promise) {
				console.log('I don\'t have a connection with id', id);
				return;
			}
			peerConnPromises.set(id, promise.then(function (peerConn) {
				console.log('Got answer.');
				peerConn.setRemoteDescription(new RTCSessionDescription(message), function () {
					console.log('Connected');
				}, logError);
				return peerConn;
			}));
		} ());
	} else if (message === 'closeconnection') {
		(function () {
			cleanUpPeerConnById(id, true);
			console.log('disco: ' + id);
		} ());
	}
});

window.addEventListener('unload', function () {
	Array.from(peerConnPromises.keys()).forEach(function (id) {
		cleanUpPeerConnById(id);
	});

	// tell server leaving room
	socket.emit('leaveroom');
});

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
function createPeerConnection(config, id) {
	console.log('Creating new PEER connection');

	var peerConn = new RTCPeerConnection(config);

	peerConn.__peerConnId = id || genId();

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

	peerConn.onaddstream = function (e) {

		console.log('audio stream added ', e.stream);
		// var video = document.createElement('video');
		// video.autoplay = 'true';
		// video.objectSrc = e.stream;
		// video.style.position = 'absolute';
		// video.style.visibility = 'hidden';
		// peerConn.__video = video;
		// document.body.appendChild(video);

		peerConn.__audioCtx = new AudioContext();
		peerConn.__source = peerConn.__audioCtx.createMediaStreamSource(e.stream);

		peerConn.__stream = e.stream;

		peerConn.__analyser = peerConn.__audioCtx.createAnalyser();
		peerConn.__analyser.minDecibels = -140;
		peerConn.__analyser.maxDecibels = 0;

		peerConn.__analyser.smoothingTimeConstant = 0.8;
		peerConn.__analyser.fftSize = 32;
		var freqs = new Uint8Array(peerConn.__analyser.frequencyBinCount);
		var times = new Uint8Array(peerConn.__analyser.frequencyBinCount);

		peerConn.__source.connect(peerConn.__analyser);
		peerConn.__analyser.connect(peerConn.__audioCtx.destination);

		setInterval(function () {
			peerConn.__analyser.getByteFrequencyData(freqs);
			peerConn.__analyser.getByteTimeDomainData(times);
			console.log(freqs.join(' '));
		}, 100);

	}

	var promise = audioStreamPromise.then(function (audioStream) {
		peerConn.addStream(audioStream);
		return peerConn;
	});

	peerConnPromises.set(peerConn.__peerConnId, promise);
	return promise;
}

function cleanUpPeerConnById(id, nomessage) {
	if (!nomessage) {

		// Tell other peers this connection is being closed
		sendMessage('closeconnection', id);
	}
	var promise = peerConnPromises.get(id);
	if (!promise) return;
	peerConnPromises.set(id, promise.then(function (peerConn) {
		peerConnPromises.delete(id);
		if (peerConn.__avatar) {
			peerConn.__avatar.emit('remove');
			var avatar = peerConn.__avatar;
			delete peerConn.__avatar;
			setTimeout(function () {
				avatar.parentNode.removeChild(avatar);
			}, 1800);
		}
		document.querySelector('[webrtc-avatar]').components['webrtc-avatar'].sendAvatarData.cancel();
		peerConn.close();
	}));
}

// Used to send offers and answers
var onLocalSessionCreated = _.curry(function onLocalSessionCreated(peerConn, desc) {
	console.log('local session created:', desc);
	peerConn.setLocalDescription(desc, function () {
		console.log('sending local desc:', peerConn.localDescription);
		sendMessage(peerConn.localDescription, peerConn.__peerConnId);
	}, logError);
}, 2);

function getDataChannels() {
	return Promise.all(Array.from(peerConnPromises.values()))
	.then(function (arr) {
		return _.compact(arr.map(function (peerConn) {
			return peerConn.__dataChannel;
		}));
	});
}

var onMessage = _.curry(function onMessage(avatar, event) {
	var data = event.data.split(';').map(_.trim);
	var d
	d = data.shift();
	avatar.setAttribute('position', d);
	d = data.shift();
	avatar.setAttribute('rotation', d);
	while ((d = data.shift()) !== undefined) {
		avatar.emit('avatarmessage', d.trim());
	}
}, 2);

function onDataChannelCreated(peerConn, channel) {
	console.log('onDataChannelCreated:', channel);

	channel.onopen = function() {
		console.log('CHANNEL opened!!!');
		peerConn.__dataChannel = channel;
		channel.__peerConn = peerConn;
		var el = document.querySelector('[webrtc-avatar]');
		if (el && !peerConn.__avatar) {
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
	init: function () {
		this.avatarString = this.el.innerHTML;
	},
	update: function () {

		// Clean up before updating
		this.remove();

		this.dataToSend = [];

		if (document.querySelectorAll('[webrtc-avatar]').length > 1) {
			throw Error('Only one avatar can be established');
		}

		var room = this.data.room;
		var target = this.el.parentNode;
		this.el.innerHTML = '';

		this.el.addEventListener('sendstringmessage', function (e) {
			this.dataToSend.push(e.detail);
		}.bind(this));

		this.createAvatar = function createAvatar() {
			var avatar = document.createElement('a-entity');
			avatar.innerHTML = this.avatarString;
			target.parentNode.appendChild(avatar);
			this.el.emit('avatar-created', avatar);
			this.tick();
			return avatar;
		}

		// Join a room
		socket.emit('create or join', room);

		this.sendAvatarData = _.throttle(function coords(extraData) {
			var data =
				target.object3D.getWorldPosition().toArray().slice(0, 3).map(numberToPrecision).join(' ') +
				';' +
				target.object3D.rotation.toArray().slice(0, 3).map(radToDeg).map(numberToPrecision).join(' ') +
				';' +
				extraData;
			getDataChannels().then(function (channels) {
				channels.forEach(function (dataChannel) {
					if (
						dataChannel.readyState !== 'open'
					) {
						if (dataChannel.readyState === 'closed') {
							return cleanUpPeerConnById(dataChannel.__peerConn.__peerConnId);
						}
						return;
					}
					dataChannel.send(data);
				});
			});
		}, 16);
	},
	tick: function () {
		this.sendAvatarData(this.dataToSend.splice(0).join(';'));
	},
	remove: function () {

		socket.emit('leaveroom');
		this.dataToSend = [];

		if (this.sendAvatarData) this.sendAvatarData.cancel();

		// Close all old connections
		Array.from(peerConnPromises.keys()).forEach(function (id) {
			cleanUpPeerConnById(id);
		});

	}
});