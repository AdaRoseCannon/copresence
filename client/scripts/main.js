/* global Peer */

'use strict';

const peer = new Peer({ path: '/peerjs/', host: location.hostname, port: location.port, secure: true });
window.peer = peer;