import { create } from 'zustand';
import api from '../services/api';

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

  // Récupère les notifications non lues du serveur
  fetchNotifications: async () => {
    try {
      const res = await api.get('/notifications/pending');
      const data = Array.isArray(res.data) ? res.data : [];
      const { _seenIds, lastFetch } = get();

      // Détecter les nouvelles notifications (IDs pas encore vus)
      // On ne joue pas le son au premier fetch (chargement initial)
      if (lastFetch !== null) {
        const newOnes = data.filter(n => !_seenIds.has(n.id));
        if (newOnes.length > 0) {
          playNotifSound();
        }
      }

      // Mettre à jour les IDs vus
      const newSeenIds = new Set(data.map(n => n.id));
      set({ notifications: data, lastFetch: Date.now(), _seenIds: newSeenIds });
    } catch (e) {
      // Silencieux si non connecté ou erreur réseau
    }
  },

  // Marque une notification comme lue
  markRead: async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      set(state => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, lu: true } : n
        ),
      }));
    } catch (e) {}
  },

  // Marque toutes comme lues
  markAllRead: async () => {
    try {
      await api.post('/notifications/read-all');
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, lu: true })),
      }));
    } catch (e) {}
  },

  // Réinitialise (logout)
  reset: () => set({ notifications: [], lastFetch: null }),
}));

export default useNotifStore;
