/* ───────────────────────────────────────────────────────────────────────────
   Notifications push — côté navigateur (PWA)

   Trois étapes, dans cet ordre :
     1. le navigateur autorise les notifications (Notification.requestPermission) ;
     2. on s'abonne au service de push du navigateur (pushManager.subscribe) avec
        la clé publique VAPID fournie par le serveur ;
     3. on transmet cet abonnement au serveur, qui pourra alors nous écrire même
        quand l'application est fermée.

   Aucun cache n'est utilisé : le service worker ne sert qu'aux notifications.
   ─────────────────────────────────────────────────────────────────────────── */
import api from '../services/api';

export const SW_URL = '/service-worker.js';

export function pushSupporte() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export function permissionActuelle() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/** Enregistre (ou met à jour) le service worker. Ne bloque jamais l'application. */
export async function enregistrerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const inscription = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    try { await inscription.update(); } catch (e) { /* hors ligne : on garde l'existant */ }
    return inscription;
  } catch (e) {
    return null;
  }
}

function base64EnOctets(base64) {
  const reste = base64.length % 4;
  const complete = reste === 0 ? base64 : base64 + '='.repeat(4 - reste);
  const normalise = complete.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(normalise);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

function tamponVersBase64url(tampon) {
  if (!tampon) return '';
  const octets = new Uint8Array(tampon);
  let binaire = '';
  for (let i = 0; i < octets.length; i += 1) binaire += String.fromCharCode(octets[i]);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function abonnementExistant() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const inscription = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!inscription) return null;
    return await inscription.pushManager.getSubscription();
  } catch (e) {
    return null;
  }
}

/** Envoie l'abonnement courant au serveur. */
async function transmettre(abonnement) {
  const p256dh = abonnement.getKey('p256dh');
  const auth = abonnement.getKey('auth');
  await api.post('/push/subscribe', {
    endpoint: abonnement.endpoint,
    p256dh: tamponVersBase64url(p256dh),
    auth: tamponVersBase64url(auth),
    user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 250),
  });
}

/** Récupère l'abonnement existant ou en crée un nouveau. Lève une erreur lisible. */
async function _souscrire(inscription) {
  const existant = await abonnementExistant();
  if (existant) return existant;

  let cle = '';
  try {
    const reponse = await api.get('/push/public-key');
    cle = (reponse.data && reponse.data.public_key) || '';
  } catch (e) {
    const erreur = new Error("Impossible de joindre le serveur de notifications. Vérifiez votre connexion.");
    erreur.raison = 'cle';
    throw erreur;
  }
  if (!cle) {
    const erreur = new Error('Clé de notification indisponible.');
    erreur.raison = 'cle';
    throw erreur;
  }

  try {
    return await inscription.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64EnOctets(cle),
    });
  } catch (e) {
    const erreur = new Error(`Abonnement refusé par le navigateur : ${e.message || e}`);
    erreur.raison = 'abonnement';
    throw erreur;
  }
}

/**
 * Active les notifications sur cet appareil.
 * Renvoie { ok: true } ou { ok: false, raison, message }.
 */
export async function activerPush() {
  if (!pushSupporte()) {
    return {
      ok: false,
      raison: 'unsupported',
      message:
        "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d'abord Farouk Manager à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis rouvrez l'application depuis cette icône.",
    };
  }

  // iOS n'autorise les notifications que si l'application est installée.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installee = window.matchMedia('(display-mode: standalone)').matches ||
    (typeof navigator.standalone === 'boolean' && navigator.standalone);
  if (ios && !installee) {
    return {
      ok: false,
      raison: 'ios-non-installee',
      message:
        "Sur iPhone, les notifications ne fonctionnent que depuis l'application installée. Touchez Partager → « Sur l'écran d'accueil », puis ouvrez Farouk Manager depuis cette icône.",
    };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); } catch (e) { permission = 'denied'; }
  }
  if (permission !== 'granted') {
    return {
      ok: false,
      raison: 'refusee',
      message:
        "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur (icône cadenas → Notifications), puis réessayez.",
    };
  }

  const inscription = (await enregistrerServiceWorker()) ||
    (await navigator.serviceWorker.getRegistration(SW_URL));
  if (!inscription) {
    return { ok: false, raison: 'sw', message: "Le service de notifications n'a pas pu démarrer. Rechargez la page et réessayez." };
  }

  try { await navigator.serviceWorker.ready; } catch (e) { /* on tente quand même */ }

  let abonnement;
  try {
    abonnement = await _souscrire(inscription);
  } catch (e) {
    return { ok: false, raison: e.raison || 'abonnement', message: e.message };
  }

  try {
    await transmettre(abonnement);
  } catch (e) {
    return { ok: false, raison: 'serveur', message: "L'appareil n'a pas pu être enregistré sur le serveur. Réessayez dans un instant." };
  }

  return { ok: true };
}

/**
 * Remet l'abonnement d'aplomb au démarrage de l'application (sans rien demander) :
 * si l'autorisation est déjà accordée, on s'assure que l'appareil est bien
 * enregistré côté serveur. C'est ce qui répare automatiquement les appareils
 * abonnés avant un déploiement ou après une réinstallation.
 */
export async function resynchroniserPush() {
  if (!pushSupporte() || Notification.permission !== 'granted') return { ok: false, raison: 'non-autorise' };
  try {
    const inscription = (await enregistrerServiceWorker()) ||
      (await navigator.serviceWorker.getRegistration(SW_URL));
    if (!inscription) return { ok: false, raison: 'sw' };
    await navigator.serviceWorker.ready;
    const abonnement = await _souscrire(inscription);
    await transmettre(abonnement);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e.raison || 'erreur', message: e.message };
  }
}

/** Désactive les notifications sur cet appareil. */
export async function desactiverPush() {
  const abonnement = await abonnementExistant();
  if (!abonnement) return { ok: true };
  try {
    await api.post('/push/unsubscribe', { endpoint: abonnement.endpoint });
  } catch (e) { /* on désabonne quand même localement */ }
  try { await abonnement.unsubscribe(); } catch (e) { /* déjà désabonné */ }
  return { ok: true };
}

/** Envoie une notification de test à l'utilisateur connecté. */
export async function testPush() {
  try {
    await api.post('/push/test');
    return { ok: true };
  } catch (e) {
    const detail = e?.response?.data?.detail;
    return {
      ok: false,
      message: detail
        ? String(detail)
        : "Le test n'a pas pu être envoyé. Vérifiez votre connexion, puis réessayez.",
    };
  }
}

/** État complet : permission, abonnement local, appareils enregistrés côté serveur. */
export async function etatPush() {
  const supporte = pushSupporte();
  const permission = permissionActuelle();
  const abonnement = await abonnementExistant();

  let appareils = 0;
  try {
    const reponse = await api.get('/push/status');
    appareils = (reponse.data && reponse.data.mes_appareils) || 0;
  } catch (e) { /* non connecté ou hors ligne */ }

  return {
    supporte,
    permission,
    abonne: Boolean(abonnement),
    actif: permission === 'granted' && Boolean(abonnement),
    appareils,
  };
}

/** L'application écoute ce message quand une notification est touchée. */
export function ecouterNavigationPush(quandNaviguer) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const gestion = (evenement) => {
    const donnees = evenement && evenement.data;
    if (donnees && donnees.type === 'fm-navigate' && donnees.url) {
      quandNaviguer(donnees.url);
    }
  };
  navigator.serviceWorker.addEventListener('message', gestion);
  return () => navigator.serviceWorker.removeEventListener('message', gestion);
}
