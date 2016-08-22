/* global Peer */

'use strict';

const peer = new Peer({ path: 'peerjs', host: location.hostname, secure: !!location.protocol.match(/^https/), port: location.port || 80 });
window.peer = peer;