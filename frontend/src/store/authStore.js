import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Menus de base pour tous les non-admin
export const DEFAULT_MENUS = ['pdvs', 'prospection', 'evaluations', 'alerts'];
export const DEFAULT_DASHBOARDS = []; // Aucun dashboard par défaut — doit être explicitement coché

// Mapping menu → route(s)
export const MENU_ROUTES = {
  pdvs:         ['/pdvs'],
  prospection:  ['/prospection'],
  evaluations:  ['/evaluations'],
  alerts:       ['/alerts'],
  indicateurs:  ['/indicateurs'],
  commissions:  ['/commissions'],
  reseau:       ['/reseau'],
  ia:           ['/ia'],
  carte:        ['/carte'],
  recovery:     ['/recovery'],
  import:       ['/import'],
  reports:      ['/reports'],
  settings:     ['/settings'],
  superviseurs: ['/superviseurs'],
};

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      permissions: null,   // { menus, dashboards, is_admin }
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({ user: null, token: null, isAuthenticated: false, permissions: null }),
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setPermissions: (permissions) => set({ permissions }),

      // Charger les permissions depuis l'API
      loadPermissions: async () => {
        try {
          const { token } = get();
          if (!token) return null;
          const baseURL = process.env.REACT_APP_API_BASE_URL || 'https://faroukmanager-backend-production-feb9.up.railway.app/api';
          const res = await fetch(`${baseURL}/my-permissions`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // Token expiré ou invalide → forcer la déconnexion proprement
          if (res.status === 401) {
            console.warn('[Auth] Token expiré — déconnexion automatique');
            set({ user: null, token: null, isAuthenticated: false, permissions: null });
            // Rediriger vers login
            window.location.href = '/login';
            return null;
          }

          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          set({ permissions: data });
          return data;
        } catch (err) {
          console.error('[Auth] Erreur chargement permissions:', err);
          // NE PAS écraser avec les defaults si on a déjà des permissions valides
          // Garder les permissions existantes en cas d'erreur réseau temporaire
          const existing = get().permissions;
          if (existing) return existing;
          // Seulement si on n'a jamais eu de permissions, utiliser les defaults
          const fallback = { menus: DEFAULT_MENUS, dashboards: DEFAULT_DASHBOARDS, is_admin: false };
          set({ permissions: fallback });
          return fallback;
        }
      },

      // Rafraîchir le token automatiquement (appelé au démarrage)
      refreshToken: async () => {
        try {
          const { token } = get();
          if (!token) return false;
          const baseURL = process.env.REACT_APP_API_BASE_URL || 'https://faroukmanager-backend-production-feb9.up.railway.app/api';
          const res = await fetch(`${baseURL}/auth/refresh`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401) {
            // Token vraiment expiré → déconnexion
            set({ user: null, token: null, isAuthenticated: false, permissions: null });
            window.location.href = '/login';
            return false;
          }
          if (!res.ok) return false;
          const data = await res.json();
          set({ token: data.access_token });
          console.log('[Auth] Token rafraîchi avec succès');
          return true;
        } catch (err) {
          console.error('[Auth] Erreur refresh token:', err);
          return false;
        }
      },

      // Vérifie si un menu est accessible
      canAccess: (menuId) => {
        const { user, permissions } = get();
        if (!user) return false;
        const role = (user.role || '').toLowerCase().replace('userrole.', '');
        if (role === 'admin') return true;
        // Commerciaux : uniquement prospection
        if (role === 'commercial') return menuId === 'prospection';
        if (!permissions) return DEFAULT_MENUS.includes(menuId);
        return (permissions.menus || DEFAULT_MENUS).includes(menuId);
      },

      // Vérifie si un dashboard est accessible
      canAccessDash: (dashId) => {
        const { user, permissions } = get();
        if (!user) return false;
        const role = (user.role || '').toLowerCase().replace('userrole.', '');
        // Commerciaux : aucun dashboard
        if (role === 'commercial') return false;
        if (role === 'admin') return true;
        if (!permissions) return DEFAULT_DASHBOARDS.includes(dashId);
        return (permissions.dashboards || DEFAULT_DASHBOARDS).includes(dashId);
      },
    }),
    {
      name: 'farouk-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        permissions: state.permissions,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.setHasHydrated(true);
      },
    }
  )
);

export default useAuthStore;
