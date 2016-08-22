/* global Peer */

'use strict';

const peer = new Peer({ path: 'peerjs', host: location.hostname, secure: true });
window.peer = peer;