/* eslint-disable no-restricted-globals */
//
// SERVICE WORKER — NOTIFICATIONS PUSH
//
// Ce service worker ne met RIEN en cache et n'intercepte AUCUNE requête.
// L'ancienne version gardait la page et les scripts en mémoire : après un
// déploiement, les navigateurs exécutaient l'ancienne application (écran blanc,
// connexion impossible). Ici il ne sert qu'à recevoir les notifications push et
// à ouvrir le bon écran lorsqu'on les touche — le réseau est toujours interrogé.
//
// `self.__WB_MANIFEST` est conservé uniquement parce que l'outil de build de
// Create React App exige de le trouver dans ce fichier.
//
const _manifesteInutilise = self.__WB_MANIFEST;
void _manifesteInutilise;

const ICONE = '/icons/icon-192.png';

self.addEventListener('install', () => {
  // On active tout de suite la nouvelle version (elle est inoffensive : pas de cache).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // On profite du passage pour effacer les anciens caches laissés par le SW d'avant.
    try {
      const noms = await caches.keys();
      await Promise.all(noms.map((n) => caches.delete(n)));
    } catch (e) { /* rien à nettoyer */ }
    try { await self.clients.claim(); } catch (e) { /* pas bloquant */ }
  })());
});

// ── Réception d'une notification ────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch (e) {
    try { donnees = { body: event.data ? event.data.text() : '' }; } catch (e2) { donnees = {}; }
  }

  const titre = donnees.title || 'Farouk Manager';
  const options = {
    body: donnees.body || donnees.message || '',
    icon: donnees.icon || ICONE,
    badge: ICONE,
    image: donnees.image || undefined,
    tag: donnees.tag || undefined,
    renotify: Boolean(donnees.tag),
    requireInteraction: Boolean(donnees.requireInteraction),
    vibrate: [120, 60, 120],
    timestamp: Date.now(),
    data: {
      url: donnees.url || '/m/accueil',
      ...(donnees.data || {}),
    },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(titre, options);
    // Application ouverte : on la prévient pour qu'elle rafraîchisse tout de suite
    // la cloche et la liste concernée (sans attendre le prochain sondage).
    try {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      fenetres.forEach((c) => { try { c.postMessage({ type: 'fm-push', notification: donnees }); } catch (e) {} });
    } catch (e) { /* aucune fenêtre ouverte */ }
  })());
});

// ── Clic sur la notification : on ouvre l'écran concerné ────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const cible = (event.notification.data && event.notification.data.url) || '/m/accueil';

  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of fenetres) {
      let memeOrigine = false;
      try { memeOrigine = new URL(client.url).origin === self.location.origin; } catch (e) { memeOrigine = false; }
      if (!memeOrigine) continue;

      try { await client.focus(); } catch (e) { /* fenêtre non focalisable */ }

      if ('navigate' in client) {
        try { await client.navigate(cible); return; } catch (e) { /* navigation refusée */ }
      }
      // Repli : l'application écoute ce message et change d'écran elle-même.
      try { client.postMessage({ type: 'fm-navigate', url: cible }); } catch (e) {}
      return;
    }

    try { await self.clients.openWindow(cible); } catch (e) {}
  })());
});

self.addEventListener('notificationclose', () => { /* rien */ });
