import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';

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

// Layout
import Layout from './components/layout/Layout';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
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
                <Route path="/accueil" element={<AccueilPage />} />
                <Route path="/carte" element={<CartePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/dashboard/weekly" element={<WeeklyDashboardPage />} />
                <Route path="/pdvs" element={<PDVsPage />} />
                <Route path="/pdvs/:id" element={<PDVDetailPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/recovery" element={<RecoveryPage />} />
                <Route path="/recovery/liste" element={<RecoveryListePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/ia" element={<IAPage />} />
                <Route path="/ia/whatif" element={<WhatIfPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/superviseurs" element={<SuperviseurPage />} />
                <Route path="/import" element={<ImportPage />} />
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
