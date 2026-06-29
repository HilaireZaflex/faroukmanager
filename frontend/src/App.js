import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuthStore, { MENU_ROUTES, DEFAULT_MENUS } from './store/authStore';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WeeklyDashboardPage from './pages/WeeklyDashboardPage';
import PDVsPage from './pages/PDVsPage';
import PDVDetailPage from './pages/PDVDetailPage';
import AlertsPage from './pages/AlertsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import RecoveryPage from './pages/RecoveryPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import SuperviseurPage from './pages/SuperviseurPage';
import ImportPage from './pages/ImportPage';
import IAPage from './pages/IAPage';
import WhatIfPage from './pages/WhatIfPage';
import AccueilPage from './pages/AccueilPage';
import CartePage from './pages/CartePage';
import RecoveryListePage from './pages/RecoveryListePage';
import OMyDashboardPage from './pages/OMyDashboardPage';
import OMyWeeklyDashboardPage from './pages/OMyWeeklyDashboardPage';
import NafamaDashboardPage from './pages/NafamaDashboardPage';
import NafamaWeeklyDashboardPage from './pages/NafamaWeeklyDashboardPage';
import KaabuDashboardPage from './pages/KaabuDashboardPage';
import KaabuWeeklyDashboardPage from './pages/KaabuWeeklyDashboardPage';
import GestionReseauPage from './pages/GestionReseauPage';
import ProspectionPage from './pages/ProspectionPage';
import IndicatorsPage from './pages/IndicatorsPage';
import CommissionsPage from './pages/CommissionsPage';
import EvaluationsPage from './pages/EvaluationsPage';

// Layout
import Layout from './components/layout/Layout';

// ── Route protégée par authentification ──────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated     = useAuthStore((state) => state._hasHydrated);
  const loadPermissions = useAuthStore((state) => state.loadPermissions);
  const permissions     = useAuthStore((state) => state.permissions);

  // Charger les permissions si pas encore chargées
  useEffect(() => {
    if (isAuthenticated && !permissions) {
      loadPermissions();
    }
  }, [isAuthenticated, permissions, loadPermissions]);

  if (!hasHydrated) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: '#fff', fontSize: '18px' }}>Chargement...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// ── Route protégée par menu ───────────────────────────────────────────────────
const MenuRoute = ({ menuId, children }) => {
  const canAccess   = useAuthStore((state) => state.canAccess);
  const user        = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const location    = useLocation();

  const role = (user?.role || '').toLowerCase().replace('userrole.', '');

  // Admin : accès total
  if (role === 'admin') return children;

  // Attendre que les permissions soient chargées
  if (!permissions) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: '#fff', fontSize: '18px' }}>Vérification des droits...</div>;
  }

  // Vérifier l'accès
  if (!canAccess(menuId)) {
    return <Navigate to="/accueil" replace state={{ blocked: true, from: location.pathname }} />;
  }

  return children;
};

function App() {
  // Keep-alive: ping backend toutes les 10 min pour eviter le cold start
  useEffect(() => {
    const ping = () => fetch(`${(process.env.REACT_APP_API_BASE_URL || "https://faroukmanager-backend-production-feb9.up.railway.app/api").replace(/\/api$/, '')}/health`).catch(() => {});
    ping();
    const interval = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                {/* ── Routes libres (toujours accessibles) ── */}
                <Route path="/accueil" element={<AccueilPage />} />
                <Route path="/omy/dashboard" element={<OMyDashboardPage />} />
                <Route path="/omy/dashboard/weekly" element={<OMyWeeklyDashboardPage />} />
                <Route path="/nafama/dashboard" element={<NafamaDashboardPage />} />
                <Route path="/nafama/dashboard/weekly" element={<NafamaWeeklyDashboardPage />} />
                <Route path="/kaabu/dashboard" element={<KaabuDashboardPage />} />
                <Route path="/kaabu/dashboard/weekly" element={<KaabuWeeklyDashboardPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/dashboard/weekly" element={<WeeklyDashboardPage />} />

                {/* ── Routes protégées par menu ── */}
                <Route path="/pdvs" element={<MenuRoute menuId="pdvs"><PDVsPage /></MenuRoute>} />
                <Route path="/pdvs/:id" element={<MenuRoute menuId="pdvs"><PDVDetailPage /></MenuRoute>} />
                <Route path="/prospection" element={<MenuRoute menuId="prospection"><ProspectionPage /></MenuRoute>} />
                <Route path="/evaluations" element={<MenuRoute menuId="evaluations"><EvaluationsPage /></MenuRoute>} />
                <Route path="/alerts" element={<MenuRoute menuId="alerts"><AlertsPage /></MenuRoute>} />
                <Route path="/indicateurs" element={<MenuRoute menuId="indicateurs"><IndicatorsPage /></MenuRoute>} />
                <Route path="/commissions" element={<MenuRoute menuId="commissions"><CommissionsPage /></MenuRoute>} />
                <Route path="/reseau" element={<MenuRoute menuId="reseau"><GestionReseauPage /></MenuRoute>} />
                <Route path="/ia" element={<MenuRoute menuId="ia"><IAPage /></MenuRoute>} />
                <Route path="/ia/whatif" element={<MenuRoute menuId="ia"><WhatIfPage /></MenuRoute>} />
                <Route path="/carte" element={<MenuRoute menuId="carte"><CartePage /></MenuRoute>} />
                <Route path="/recovery" element={<MenuRoute menuId="recovery"><RecoveryPage /></MenuRoute>} />
                <Route path="/recovery/liste" element={<MenuRoute menuId="recovery"><RecoveryListePage /></MenuRoute>} />
                <Route path="/reports" element={<MenuRoute menuId="reports"><ReportsPage /></MenuRoute>} />
                <Route path="/import" element={<MenuRoute menuId="import"><ImportPage /></MenuRoute>} />
                <Route path="/settings" element={<MenuRoute menuId="settings"><SettingsPage /></MenuRoute>} />
                <Route path="/analytics" element={<MenuRoute menuId="reports"><AnalyticsPage /></MenuRoute>} />
                <Route path="/superviseurs" element={<MenuRoute menuId="settings"><SuperviseurPage /></MenuRoute>} />

                <Route path="/" element={<Navigate to="/accueil" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
