import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

// ── Groupes de rôles ──
export function groupeRole(role) {
  const r = (role || '').toLowerCase().replace('userrole.', '');
  if (r === 'superviseur') return 'superviseur';
  if (r === 'developpeur' || r === 'commercial') return 'developpeur';
  if (['admin', 'manager', 'rc', 'conformite'].includes(r) || r.includes('responsable')) return 'manager';
  return 'autre';
}

// Barre du bas : 4 raccourcis + « Menu »
export const ONGLETS = {
  superviseur: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/pdv',          icon: '🏪', label: 'PDV' },
    { to: '/m/prospection',  icon: '👥', label: 'Prospect' },
    { to: '/m/recuperation', icon: '🎯', label: 'Récupérer' },
  ],
  developpeur: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/pdv',          icon: '🏪', label: 'PDV' },
    { to: '/m/prospection',  icon: '👥', label: 'Prospect' },
    { to: '/m/reclamations', icon: '📣', label: 'Réclam.' },
  ],
  manager: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/pilotage',     icon: '📊', label: 'Pilotage' },
    { to: '/m/equipe',       icon: '🌐', label: 'Équipe' },
    { to: '/m/validations',  icon: '📋', label: 'Valider' },
  ],
  autre: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
  ],
};

export default function MobileLayout({ children }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const canAccess = useAuthStore(s => s.canAccess);
  const [menuOuvert, setMenuOuvert] = useState(false);

  const groupe = groupeRole(user?.role);
  const raccourcis = ONGLETS[groupe] || ONGLETS.autre;

  // Le tiroir reprend EXACTEMENT les menus dont dispose le rôle dans la version web.
  const liens = [
    { ok: true,                       to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { ok: canAccess('pdvs'),          to: '/m/pdv',          icon: '🏪', label: 'Points de vente' },
    { ok: canAccess('prospection'),   to: '/m/prospection',  icon: '👥', label: 'Prospection' },
    { ok: canAccess('alerts'),        to: '/m/alertes',      icon: '🔔', label: 'Alertes' },
    { ok: canAccess('reclamations'),  to: '/m/reclamations', icon: '📣', label: 'Réclamations' },
    // ⏳ Encore à porter sur mobile : Évaluations, dashboards OMY / NAFAMA / KAABU
  ].filter(l => l.ok);

  // Dashboards OMY / NAFAMA / KAABU : portage mobile en cours.
  const dashboards = [].filter(d => d.ok);

  const retourBureau = () => {
    document.body.classList.remove('fm-mobile');
    navigate('/accueil');
  };

  return (
    <div className="m-app">


      <main className="m-content">{children}</main>

      <nav className="m-nav">
        {raccourcis.map(o => (
          <NavLink key={o.to} to={o.to}
            className={({ isActive }) => 'm-nav-item' + (isActive ? ' active' : '')}>
            <span className="m-nav-ico">{o.icon}</span>
            <span className="m-nav-lbl">{o.label}</span>
          </NavLink>
        ))}
        <button className="m-nav-item" onClick={() => setMenuOuvert(true)}>
          <span className="m-nav-ico">☰</span>
          <span className="m-nav-lbl">Menu</span>
        </button>
      </nav>

      {/* ── Tiroir : tous les menus du rôle, comme sur le web ── */}
      {menuOuvert && (
        <div className="m-drawer-overlay" onClick={() => setMenuOuvert(false)}>
          <div className="m-drawer" onClick={e => e.stopPropagation()}>
            <div className="m-drawer-head">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.nom || 'Utilisateur'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--fm-muted)' }}>{user?.role || ''}</div>
              </div>
              <button className="m-icon-btn" onClick={() => setMenuOuvert(false)}>✕</button>
            </div>

            <div className="m-drawer-section">Navigation</div>
            {liens.map(l => (
              <Link key={l.to} to={l.to} className="m-drawer-item" onClick={() => setMenuOuvert(false)}>
                <span>{l.icon}</span>{l.label}<span className="arrow">›</span>
              </Link>
            ))}

            {dashboards.length > 0 && (
              <>
                <div className="m-drawer-section">Dashboards</div>
                {dashboards.map(d => (
                  <Link key={d.to} to={d.to} className="m-drawer-item" onClick={() => setMenuOuvert(false)}>
                    <span>{d.icon}</span>{d.label}<span className="arrow">›</span>
                  </Link>
                ))}
              </>
            )}

            <div className="m-drawer-section">Compte</div>
            <Link to="/m/profil" className="m-drawer-item" onClick={() => setMenuOuvert(false)}>
              <span>👤</span>Mon profil<span className="arrow">›</span>
            </Link>
            <button className="m-drawer-item" onClick={retourBureau}>
              <span>🖥️</span>Version bureau<span className="arrow">›</span>
            </button>
            <button className="m-drawer-item" style={{ color: '#ff8b96' }}
              onClick={() => { logout(); navigate('/m/login'); }}>
              <span>⏻</span>Se déconnecter<span className="arrow">›</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
