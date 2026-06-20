import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Menus de base pour tous les non-admin
export const DEFAULT_MENUS = ['pdvs', 'prospection', 'evaluations', 'alerts'];
export const DEFAULT_DASHBOARDS = ['omy', 'nafama', 'kaabu'];

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
          const baseURL = process.env.REACT_APP_API_BASE_URL || 'https://faroukmanager-backend-production-feb9.up.railway.app/api';
          const res = await fetch(`${baseURL}/my-permissions`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error('Failed');
          const data = await res.json();
          set({ permissions: data });
          return data;
        } catch {
          const fallback = { menus: DEFAULT_MENUS, dashboards: DEFAULT_DASHBOARDS, is_admin: false };
          set({ permissions: fallback });
          return fallback;
        }
      },

      // Vérifie si un menu est accessible
      canAccess: (menuId) => {
        const { user, permissions } = get();
        if (!user) return false;
        const role = (user.role || '').toLowerCase().replace('userrole.', '');
        if (role === 'admin') return true;
        if (!permissions) return DEFAULT_MENUS.includes(menuId);
        return (permissions.menus || DEFAULT_MENUS).includes(menuId);
      },

      // Vérifie si un dashboard est accessible
      canAccessDash: (dashId) => {
        const { user, permissions } = get();
        if (!user) return false;
        const role = (user.role || '').toLowerCase().replace('userrole.', '');
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
