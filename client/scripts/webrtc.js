'use strict';
/* global io, _, Map, AFRAME, Promise, Float32Array, EventEmitter */
/* eslint-env browser */
/* eslint no-var: 0, no-console: 0 */

/**
 * CONSTANTS AND UTILITY FUNCTIONS
 */

var VoiceActivityDetector = (function () {

	function CBuffer(len) {
		var out = [];
		out.push = function (a) {
			out.reverse();
			out.unshift(a);
			out.splice(len);
			out.reverse();
			return out.length;
		}
		return out;
	};

	var FFT_SIZE = 2048;
	var HISTORY_SIZE = 5;
	var POWER_FREQUENCY = 1000;
	var VOICE_POWER_THRESHOLD = -90;

	/**
	 * Given an audio stream, fires events whenever voice activity starts and stops.
	 * Current implementation relies on AnalyserNode for efficiency, but works more
	 * based on frequency power metering than anything else.
	 *
	 * Emits the following events, both with a power amount:
	 *
	 *    active: When a voice is detected in the stream.
	 *    inactive: When a voice is no longer detected in the stream.
	 *    power: The current power level.
	 *
	 * TODO(smus): Make a more complex implementation that is based not on a naive
	 * FFT approach, but the real deal (eg. http://goo.gl/wHlhOs) once AudioWorklets
	 * are available.
	 */
	function VoiceActivityDetector(context) {
		this.context = context;
		this.fftData = new Float32Array(FFT_SIZE);

		// Track the current state to emit the right events.
		this.isActive = false;

		// A circular buffer of voice amplitude histories.
		this.buffer = new CBuffer(HISTORY_SIZE);

		// When the power level was last reported.
		this.lastPowerTime = performance.now();
	}

	VoiceActivityDetector.prototype = new EventEmitter();

	/**
	 * Sets the source on which to do voice activity detection.
	 */
	VoiceActivityDetector.prototype.setSource = function(source) {
		var analyser = this.context.createAnalyser();
		analyser.fftSize = FFT_SIZE;
		source.connect(analyser);
		this.analyser = analyser;

		this.detect_();
	};

	VoiceActivityDetector.prototype.detect_ = function() {
		// Get FFT data into the fftData array.
		this.analyser.getFloatFrequencyData(this.fftData);

		var power = this.getCurrentHumanSpeechPower_();
		this.buffer.push(power);

		// Get the running average of the last few samples.
		var powerHistory = this.getPowerHistory_();

		var isActive = powerHistory > VOICE_POWER_THRESHOLD;

		if (isActive && !this.isActive) {
			// Just became active.
			this.emit('active', power);
		} else if (!isActive && this.isActive) {
			// Just became inactive.
			this.emit('inactive', power)
		}

		// Periodically report the power level too.
		var now = performance.now();
		if (isActive && now - this.lastPowerTime > POWER_FREQUENCY) {
			this.emit('power', power);
			this.lastPowerTime = now;
		}


		this.isActive = isActive;

		requestAnimationFrame(this.detect_.bind(this));
	};

	VoiceActivityDetector.prototype.getCurrentHumanSpeechPower_ = function() {
		// Look at the relevant portions of the frequency spectrum (human speech is
		// roughly between 300 Hz to 3400 Hz).
		var start = this.freqToBucketIndex_(300);
		var end = this.freqToBucketIndex_(3400);

		var sum = 0;
		for (var i = start; i < end; i++) {
			sum += this.fftData[i];
		}

		var power = sum / (end - start);

		return power;
	};

	VoiceActivityDetector.prototype.getPowerHistory_ = function() {
		var sum = 0;
		var count = 0;
		this.buffer.forEach(function(value) {
			sum += value;
			count += 1;
		});
		return sum / count;
	};

	VoiceActivityDetector.prototype.freqToBucketIndex_ = function(frequency) {
		var nyquist = this.context.sampleRate / 2;
		return Math.round(frequency / nyquist * this.fftData.length);
	};

	return VoiceActivityDetector;
}());


var audioCtx = new AudioContext();
var audioStreamPromise = navigator.mediaDevices.getUserMedia({
		audio: true,
		video: false
	})
	.then(function(stream) {
		var microphone = audioCtx.createMediaStreamSource(stream);

		// Create a filter for voices
		var filter = audioCtx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 170;
		filter.Q.value = 0.1;

		var peer = audioCtx.createMediaStreamDestination();

		// Connect the microphone input to the stream
		microphone.connect(filter);
		filter.connect(peer);

		// Make sure the stream is read.
		var gain = audioCtx.createGain();
		gain.gain.value = 0.00001;
		filter.connect(gain);
		gain.connect(audioCtx.destination);

		return peer.stream;
	});

var configuration = {
	'iceServers': [{
		'urls': [
			'stun:stun.l.google.com:19302'
		]
	}, {
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

socket.on('ready', function(count) {
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

		peerConn.addStream(peerConn.__localStream);

		peerConn.createOffer(onLocalSessionCreated(peerConn), logError);
	}

	// Create sockets for the number of people in the same room
	for (i = 0; i < count - 1; i++) {
		createPeerConnection(configuration).then(connect);
	}
});

socket.on('new arrival', function() {
	console.log('Someone has joined the channel so waiting for an offer.');
});

socket.on('message', function(message, id) {
	// console.log('Client received message:', message);
	if (message.type === 'candidate') {
		(function() {

			var promise = peerConnPromises.get(id);
			if (!promise) {
				console.log('I don\'t have a connection with id', id);
				return;
			}
			promise.then(function(peerConn) {
				peerConn.addIceCandidate(new RTCIceCandidate({
					candidate: message.candidate
				}));
			});
		}());
	} else if (message.type === 'offer') {
		(function() {

			Promise.resolve(peerConnPromises.get(id))
				.then(function(pc) {
					return pc || createPeerConnection(configuration, id);
				})
				.then(function(peerConn) {
					console.log('Got offer. Sending answer to peer, id: ', id);
					peerConn.addStream(peerConn.__localStream);
					peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {

						// Creating answer
						peerConn.createAnswer(onLocalSessionCreated(peerConn), logError);
					}, logError);

				});

		}());
	} else if (message.type === 'answer') {
		(function() {
			var promise = peerConnPromises.get(id);
			if (!promise) {
				console.log('I don\'t have a connection with id', id);
				return;
			}
			peerConnPromises.set(id, promise.then(function(peerConn) {
				console.log('Got answer. ' + id);
				peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {
					console.log('Connected ' + id);
				}, logError);
				return peerConn;
			}));
		}());
	} else if (message === 'closeconnection') {
		(function() {
			cleanUpPeerConnById(id, true);
			console.log('disco: ' + id);
		}());
	}
});

window.addEventListener('unload', function() {
	Array.from(peerConnPromises.keys()).forEach(function(id) {
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

	id = id || genId();

	var promise = audioStreamPromise.then(function(audioStream) {
		console.log('Creating new PEER connection');

		var peerConn = new RTCPeerConnection(config);

		peerConn.__peerConnId = id;

		peerConn.__localStream = audioStream;

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

		peerConn.ondatachannel = function(event) {
			// console.log('ondatachannel:', event.channel);
			onDataChannelCreated(peerConn, event.channel);
		};

		peerConn.onconnectionstatechange = function() {
			switch (peerConn.connectionState) {
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

		peerConn.onaddstream = function(e) {

			console.log('audio stream added ', e.stream);

			// create a player, we could also get a reference from a existing player in the DOM
			var player = new Audio();
			player.src = URL.createObjectURL(e.stream);
			player.autoplay = true;
			player.muted = true;
			window.player = player;

			peerConn.__source = audioCtx.createMediaStreamSource(e.stream);

			peerConn.__vad = new VoiceActivityDetector(audioCtx);
			peerConn.__vad.setSource(peerConn.__source);

			var interval = -1;
			function flap() {
				peerConn.__avatar.querySelector('.flap').emit('talk');
			}

			peerConn.__vad.on('active', function(e) {
				peerConn.currentLevel = e;
				if (peerConn.__avatar) {
					if (interval === -1) {
						flap();
						interval = setInterval(flap, 160);
					}
				}
			});

			peerConn.__vad.on('inactive', function() {
				peerConn.currentLevel = null;
				clearInterval(interval);
				interval = -1;
			});

			peerConn.__vad.on('power', function(e) {
				peerConn.currentLevel = e;
				if (peerConn.__avatar) {
					if (interval === -1) {
						flap();
						interval = setInterval(flap, 160);
					}
				}
			});

			peerConn.__source.connect(audioCtx.destination);

		}

		return peerConn;
	});

	peerConnPromises.set(id, promise);
	return promise;
}

function cleanUpPeerConnById(id, nomessage) {
	if (!nomessage) {

		// Tell other peers this connection is being closed
		sendMessage('closeconnection', id);
	}
	var promise = peerConnPromises.get(id);
	if (!promise) return;
	peerConnPromises.set(id, promise.then(function(peerConn) {
		peerConnPromises.delete(id);
		if (peerConn.__avatar) {
			peerConn.__avatar.emit('remove');
			var avatar = peerConn.__avatar;
			delete peerConn.__avatar;
			setTimeout(function() {
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
	peerConn.setLocalDescription(desc, function() {
		console.log('sending local desc:', peerConn.localDescription);
		sendMessage(peerConn.localDescription, peerConn.__peerConnId);
	}, logError);
}, 2);

function getDataChannels() {
	return Promise.all(Array.from(peerConnPromises.values()))
		.then(function(arr) {
			return _.compact(arr.map(function(peerConn) {
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
	while (d = data.shift()) {
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
	schema: {
		room: {
			type: 'string'
		}
	},
	init: function() {
		this.avatarString = this.el.innerHTML;
	},
	update: function() {

		// Clean up before updating
		this.remove();

		this.dataToSend = [];

		if (document.querySelectorAll('[webrtc-avatar]').length > 1) {
			throw Error('Only one avatar can be established');
		}

		var room = this.data.room;
		var target = this.el.parentNode;
		this.el.innerHTML = '';

		this.el.addEventListener('sendstringmessage', function(e) {
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
			getDataChannels().then(function(channels) {
				channels.forEach(function(dataChannel) {
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
	tick: function() {
		this.sendAvatarData(this.dataToSend.splice(0).join(';'));
	},
	remove: function() {

		socket.emit('leaveroom');
		this.dataToSend = [];

		if (this.sendAvatarData) this.sendAvatarData.cancel();

		// Close all old connections
		Array.from(peerConnPromises.keys()).forEach(function(id) {
			cleanUpPeerConnById(id);
		});

	}
});