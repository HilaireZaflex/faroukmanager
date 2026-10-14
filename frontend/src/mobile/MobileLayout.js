import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

// ── Groupes de rôles → onglets de la navigation basse ──
export function groupeRole(role) {
  const r = (role || '').toLowerCase().replace('userrole.', '');
  if (r === 'superviseur') return 'superviseur';
  if (r === 'developpeur' || r === 'commercial') return 'developpeur';
  if (['admin', 'manager', 'rc', 'conformite'].includes(r) || r.includes('responsable')) return 'manager';
  return 'autre';
}

export const ONGLETS = {
  superviseur: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/pdv',          icon: '🏪', label: 'Mes PDV' },
    { to: '/m/recuperation', icon: '🎯', label: 'Récupérer' },
    { to: '/m/alertes',      icon: '🔔', label: 'Alertes' },
    { to: '/m/profil',       icon: '👤', label: 'Profil' },
  ],
  developpeur: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/prospection',  icon: '👥', label: 'Prospection' },
    { to: '/m/planning',     icon: '📅', label: 'Planning' },
    { to: '/m/activations',  icon: '✅', label: 'Activations' },
    { to: '/m/profil',       icon: '👤', label: 'Profil' },
  ],
  manager: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/pilotage',     icon: '📊', label: 'Pilotage' },
    { to: '/m/equipe',       icon: '🌐', label: 'Équipe' },
    { to: '/m/validations',  icon: '📋', label: 'Valider' },
    { to: '/m/profil',       icon: '👤', label: 'Profil' },
  ],
  autre: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/profil',       icon: '👤', label: 'Profil' },
  ],
};

export default function MobileLayout({ children }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const onglets = ONGLETS[groupeRole(user?.role)] || ONGLETS.autre;

  const retourBureau = () => {
    try { localStorage.setItem('fm_force_desktop', '1'); } catch (e) {}
    document.body.classList.remove('fm-mobile');
    navigate('/accueil');
  };

  return (
    <div className="m-app">
      <header className="m-header">
        <img src="/icons/icon-192.png" className="m-logo" alt="Farouk Manager" />
        <div className="m-title">
          <b>Farouk Manager</b>
          <span>{(user?.nom || user?.email || '')} · {user?.role || ''}</span>
        </div>
        <button className="m-icon-btn" onClick={retourBureau} title="Version bureau">🖥️</button>
        <button className="m-icon-btn" onClick={() => { logout(); navigate('/m/login'); }} title="Déconnexion">⏻</button>
      </header>

      <main className="m-content">{children}</main>

      <nav className="m-nav">
        {onglets.map(o => (
          <NavLink key={o.to} to={o.to}
            className={({ isActive }) => 'm-nav-item' + (isActive ? ' active' : '')}>
            <span className="m-nav-ico">{o.icon}</span>
            <span className="m-nav-lbl">{o.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
