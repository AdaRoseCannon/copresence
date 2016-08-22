/* global Peer */

'use strict';

const peer = new Peer({ path: 'peerjs', host: location.hostname, secure: !!location.protocol.match(/^https/) });
window.peer = peer;