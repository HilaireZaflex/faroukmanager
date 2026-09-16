import { create } from 'zustand';
import api from '../services/api';
import useAuthStore from './authStore';

// ── Préférence « ne plus afficher les alertes » (persistée par utilisateur) ──
// Clé localStorage : { "<userId>": true }
const MUTE_KEY = 'fm_notif_muted_users';

function _readMutedMap() {
  try {
    return JSON.parse(localStorage.getItem(MUTE_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

function _currentUserId() {
  try {
    return useAuthStore.getState()?.user?.id ?? null;
  } catch (e) {
    return null;
  }
}

function _isMutedFor(userId) {
  if (userId === null || userId === undefined) return false;
  return !!_readMutedMap()[String(userId)];
}

// ── Son de notification via Web Audio API (aucune dépendance externe) ────────
let _audioCtx = null;
function playNotifSound() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;

    // 2 bips courts façon "message reçu"
    const playBip = (startTime, freq = 880, duration = 0.12) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playBip(now,       880, 0.12); // premier bip
    playBip(now + 0.15, 1100, 0.1); // deuxième bip (plus aigu)
  } catch (e) {
    // Silencieux si le navigateur bloque l'audio
  }
}

const useNotifStore = create((set, get) => ({
  notifications: [],
  lastFetch: null,
  _seenIds: new Set(),
  muted: false,   // true = plus aucune alerte automatique (popup + son)

  // Charge la préférence de l'utilisateur connecté
  loadMutePref: () => {
    set({ muted: _isMutedFor(_currentUserId()) });
  },

  // Active / désactive les alertes automatiques (persisté par utilisateur)
  setMuted: (value) => {
    const muted = !!value;
    const uid = _currentUserId();
    if (uid !== null && uid !== undefined) {
      try {
        const map = _readMutedMap();
        if (muted) map[String(uid)] = true;
        else delete map[String(uid)];
        localStorage.setItem(MUTE_KEY, JSON.stringify(map));
      } catch (e) {
        // localStorage indisponible → la préférence reste valable pour la session
      }
    }
    set({ muted });
  },

  // Récupère les notifications non lues du serveur
  fetchNotifications: async () => {
    try {
      const [res, resRec] = await Promise.all([
        api.get('/notifications/pending').catch(() => ({ data: [] })),
        api.get('/reclamations-notifications', { params: { non_lues_seulement: false } }).catch(() => ({ data: { notifications: [] } })),
      ]);
      const prospNotifs = Array.isArray(res.data) ? res.data : [];
      // Titre lisible pour les notifications de réclamation (elles n'en ont pas côté serveur)
      const REC_TITRES = {
        NOUVELLE: 'Nouvelle réclamation',
        PRISE_EN_CHARGE: 'Réclamation prise en charge',
        RESOLUTION: 'Réclamation résolue',
        CLOTURE: 'Réclamation clôturée',
        REOUVERTURE: 'Réclamation réouverte',
        ESCALADE: 'Réclamation escaladée',
        REASSIGNATION: 'Réclamation réassignée',
        COMMENTAIRE: 'Nouveau commentaire',
        MISE_A_JOUR: 'Réclamation mise à jour',
        RELANCE: 'Relance réclamation',
      };
      const recNotifs = (resRec.data?.notifications || [])
        .filter(n => !n.lue)
        .map(n => ({
          id: 'rec_' + n.id,
          titre: REC_TITRES[n.type_notif] || 'Réclamation',
          message: n.message,
          type: 'RECLAMATION',
          reclamation_id: n.reclamation_id,
          lu: n.lue,
          created_at: n.created_at,
          type_notif: n.type_notif,
        }));
      const data = [...prospNotifs, ...recNotifs];
      const { _seenIds, lastFetch, muted } = get();

      if (lastFetch !== null && !muted) {
        const newOnes = data.filter(n => !_seenIds.has(n.id));
        if (newOnes.length > 0) {
          playNotifSound();
        }
      }

      const newSeenIds = new Set(data.map(n => n.id));
      set({ notifications: data, lastFetch: Date.now(), _seenIds: newSeenIds });
    } catch (e) {
      // Silencieux si non connecté ou erreur réseau
    }
  },

  // Marque une notification comme lue
  markRead: async (id) => {
    try {
      // Notifications réclamations (id commence par 'rec_')
      if (String(id).startsWith('rec_')) {
        const recId = String(id).replace('rec_', '');
        await api.post('/reclamations-notifications/marquer-lues', { ids: [parseInt(recId)] });
      } else {
        await api.post(`/notifications/${id}/read`);
      }
      set(state => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, lu: true } : n
        ),
      }));
    } catch (e) {}
  },

  // Marque TOUTES les notifications comme lues (workflow + réclamations)
  markAllRead: async () => {
    // Les deux sources sont indépendantes : une panne de l'une ne doit pas
    // empêcher l'autre d'être marquée comme lue.
    await Promise.all([
      api.post('/notifications/read-all').catch(() => {}),
      // ids vide = toutes les notifications de réclamation de l'utilisateur
      api.post('/reclamations-notifications/marquer-lues', {}).catch(() => {}),
    ]);
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, lu: true })),
    }));
  },

  // Réinitialise (logout)
  reset: () => set({ notifications: [], lastFetch: null, _seenIds: new Set(), muted: false }),
}));

export default useNotifStore;
