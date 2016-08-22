/* global Peer */

'use strict';

const peer = new Peer({ path: '/peerjs/', host: location.hostname, port: location.port });
window.peer = peer;