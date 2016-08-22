/* global Peer */

'use strict';

const peer = new Peer({ path: 'peerjs', host: location.hostname, port: Location.port, secure: true });
window.peer = peer;