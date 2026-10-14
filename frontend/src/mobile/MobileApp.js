import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import MobileLayout from './MobileLayout';
import MobileLogin from './pages/MobileLogin';
import MobileAccueil from './pages/MobileAccueil';
import MobileProfil from './pages/MobileProfil';
import MobileSoon from './pages/MobileSoon';
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
        <Route path="profil" element={<MobileProfil />} />
        <Route path="pdv" element={<MobileSoon titre="Mes PDV" icone="🏪" phase="B" />} />
        <Route path="missions" element={<MobileSoon titre="Mes missions" icone="📣" phase="B" />} />
        <Route path="recuperation" element={<MobileSoon titre="PDV à récupérer" icone="🎯" phase="B" />} />
        <Route path="prospection" element={<MobileSoon titre="Prospection" icone="👥" phase="C" />} />
        <Route path="planning" element={<MobileSoon titre="Planning des visites" icone="📅" phase="C" />} />
        <Route path="activations" element={<MobileSoon titre="Activations" icone="✅" phase="C" />} />
        <Route path="pilotage" element={<MobileSoon titre="Pilotage" icone="📊" phase="D" />} />
        <Route path="equipe" element={<MobileSoon titre="Équipe & Réseau" icone="🌐" phase="D" />} />
        <Route path="validations" element={<MobileSoon titre="Validations" icone="📋" phase="D" />} />
        <Route path="*" element={<Navigate to="/m/accueil" replace />} />
      </Routes>
    </MobileLayout>
  );
}
