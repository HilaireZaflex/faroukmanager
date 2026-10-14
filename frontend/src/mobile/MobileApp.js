import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import MobileLayout from './MobileLayout';
import MobileLogin from './pages/MobileLogin';
import MobileAccueil from './pages/MobileAccueil';
import MobileProfil from './pages/MobileProfil';
import MobilePDV from './pages/MobilePDV';
import MobilePDVDetail from './pages/MobilePDVDetail';
import MobileRecuperation from './pages/MobileRecuperation';
import MobileAlertes from './pages/MobileAlertes';
import MobileProspection from './pages/MobileProspection';
import MobileProspectDetail from './pages/MobileProspectDetail';
import MobilePlanning from './pages/MobilePlanning';
import MobileActivations from './pages/MobileActivations';
import MobilePilotage from './pages/MobilePilotage';
import MobileEquipe from './pages/MobileEquipe';
import MobileValidations from './pages/MobileValidations';
import './mobile.css';

export default function MobileApp() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  useEffect(() => {
    document.body.classList.add('fm-mobile');
    return () => document.body.classList.remove('fm-mobile');
  }, []);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="login" element={<MobileLogin />} />
        <Route path="*" element={<Navigate to="/m/login" replace />} />
      </Routes>
    );
  }

  return (
    <MobileLayout>
      <Routes>
        <Route path="accueil" element={<MobileAccueil />} />

        {/* ── Phase B · Superviseur terrain ── */}
        <Route path="pdv" element={<MobilePDV />} />
        <Route path="pdv/:id" element={<MobilePDVDetail />} />
        <Route path="recuperation" element={<MobileRecuperation />} />
        <Route path="alertes" element={<MobileAlertes />} />

        {/* ── Phase C · Développeur terrain ── */}
        <Route path="prospection" element={<MobileProspection />} />
        <Route path="prospect/:id" element={<MobileProspectDetail />} />
        <Route path="planning" element={<MobilePlanning />} />
        <Route path="activations" element={<MobileActivations />} />

        {/* ── Phase D · Manager / Admin ── */}
        <Route path="pilotage" element={<MobilePilotage />} />
        <Route path="equipe" element={<MobileEquipe />} />
        <Route path="validations" element={<MobileValidations />} />

        <Route path="profil" element={<MobileProfil />} />
        <Route path="*" element={<Navigate to="/m/accueil" replace />} />
      </Routes>
    </MobileLayout>
  );
}
