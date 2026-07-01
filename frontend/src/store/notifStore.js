import { create } from 'zustand';
import api from '../services/api';

const useNotifStore = create((set, get) => ({
  notifications: [],
  lastFetch: null,

  // Récupère les notifications non lues du serveur
  fetchNotifications: async () => {
    try {
      const res = await api.get('/notifications/pending');
      const data = Array.isArray(res.data) ? res.data : [];
      set({ notifications: data, lastFetch: Date.now() });
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
