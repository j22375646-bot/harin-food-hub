'use strict';

const OFFLINE_CACHE = 'harin-hub-offline-v2';
const OFFLINE_URL = '/hub-offline-v2.html';

self.addEventListener('install', event => {
  // An unavailable cache must never prevent normal online use.
  event.waitUntil(caches.open(OFFLINE_CACHE)
    .then(cache => cache.addAll([OFFLINE_URL]))
    .catch(() => undefined));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate'
    || request.destination !== 'document' || url.origin !== self.location.origin
    || url.pathname === '/api' || url.pathname.startsWith('/api/')
    || request.headers.has('RSC') || url.searchParams.has('_rsc')
    || request.headers.get('accept')?.includes('text/x-component')) return;

  // Never store a navigation response, including login or private page HTML.
  // HTTP errors are responses, not an offline condition.
  event.respondWith(fetch(request, { cache: 'no-store' }).catch(async error => {
    try {
      const cache = await caches.open(OFFLINE_CACHE);
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    } catch {
      // Keep the original network failure when cache storage is unavailable.
    }
    throw error;
  }));
});
