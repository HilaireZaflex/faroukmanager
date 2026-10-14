/* eslint-disable no-restricted-globals */
// Service worker Farouk Manager (CRA / Workbox)
// - précache de la coquille de l'application
// - couche API : réseau d'abord, cache de secours (consultation hors-ligne)
// - images : cache d'abord
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();

// Coquille de l'application (injectée par react-scripts)
precacheAndRoute(self.__WB_MANIFEST);

// Toute navigation SPA renvoie l'index (y compris /m/...)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html'))
);

// API : réseau d'abord, cache de secours (8 s de patience)
registerRoute(
  ({ url }) => url.pathname.includes('/api/') || url.hostname.endsWith('railway.app'),
  new NetworkFirst({
    cacheName: 'fm-api',
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 })],
  })
);

// Images : cache d'abord
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'fm-images',
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);
