/* global Peer */

'use strict';

const peer = new Peer({ path: '/peerjs/', host: 'adais-peerjs.herokuapp.com', port: 80, secure: true });
window.peer = peer;