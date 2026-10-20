/* eslint-disable no-restricted-globals */
//
// SERVICE WORKER DE DÉSINSTALLATION — 20/10/2026
//
// L'ancien service worker conservait en cache la page d'accueil et les fichiers
// JavaScript du déploiement d'origine. Résultat : même après correction du
// serveur, les navigateurs continuaient d'exécuter l'ancienne version de
// l'application — qui appelait une adresse *.railway.app devenue injoignable
// sur certains réseaux. Écran blanc ou connexion impossible, malgré tous les
// correctifs déployés côté serveur.
//
// Ce service worker ne met plus RIEN en cache : il supprime les caches
// existants, se désenregistre lui-même, puis recharge les fenêtres ouvertes
// pour qu'elles récupèrent la version à jour depuis le serveur.
//
// `self.__WB_MANIFEST` est conservé uniquement parce que l'outil de build de
// Create React App exige de le trouver dans ce fichier.
//
const _manifesteInutilise = self.__WB_MANIFEST;
void _manifesteInutilise;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const noms = await caches.keys();
      await Promise.all(noms.map((nom) => caches.delete(nom)));
    } catch (e) { /* rien à nettoyer */ }

    try {
      await self.registration.unregister();
    } catch (e) { /* déjà désenregistré */ }

    try {
      const fenetres = await self.clients.matchAll({ type: 'window' });
      fenetres.forEach((fenetre) => {
        try { fenetre.navigate(fenetre.url); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  })());
});
