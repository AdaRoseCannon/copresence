/* global caches, Request, self, toolbox, importScripts */
/* jshint browser:true */
/* eslint-env es6 */
'use strict';


importScripts('/scripts/sw-toolbox.js');

self.addEventListener('fetch', function (event) {
	const request = event.request;
	const handler = (request.url.match(/^http:\/\/localhost/) && location.protocol === 'http:' || location.hostname === 'localhost') ? toolbox.networkFirst : toolbox.fastest;
	if (
		!(
			request.url.match(/(\.mp4|\.webm|\.avi|\.wmv|\.m4v)$/i) ||
			request.url.match(/data:/i)
		)
	) {
		event.respondWith(handler(request, [], {
			networkTimeoutSeconds: 3
		}));
	}
});
