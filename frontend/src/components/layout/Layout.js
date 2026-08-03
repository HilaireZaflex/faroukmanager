import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import useAuthStore from '../../store/authStore';
import './Layout.css';

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  // Rediriger les commerciaux vers Prospection automatiquement
  useEffect(() => {
    const role = (user?.role || '').toLowerCase();
    if (role === 'commercial' && location.pathname === '/accueil') {
      navigate('/prospection');
    }
  }, [user, location.pathname, navigate]);

  // Fermer le drawer uniquement au changement de page (URL)
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className={`layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)}/>
      )}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onCollapse={setSidebarCollapsed}
      />
      <main className="main-content">
        {children}
      </main>
      {/* Bottom bar mobile — 4 items seulement */}
      <MobileBottomBar
        onMenuOpen={() => setMobileOpen(true)}
        pathname={location.pathname}
      />
    </div>
  );
}

function MobileBottomBar({ onMenuOpen, pathname }) {
  const user = useAuthStore(s => s.user);
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const isCommercial = role === 'commercial';
  const isDeveloppeur = role === 'developpeur';
  const isTelec = role === 'teleconseillere';

  // Commerciaux et Développeurs : Prospection + bouton Déconnexion uniquement
  if (isCommercial || isDeveloppeur) {
    return (
      <nav className="mobile-bottom-bar">
        <a href="/prospection" className={`mbb-item${pathname.startsWith('/prospection') ? ' mbb-active' : ''}`} style={{ flex: 2 }}>
          <span className="mbb-icon">📋</span>
          <span className="mbb-label">Prospection</span>
        </a>
        <button className="mbb-item" onClick={() => { useAuthStore.getState().logout(); window.location.href = '/login'; }}
          style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontFamily: 'inherit' }}>
          <span className="mbb-icon">🚪</span>
          <span className="mbb-label">Déco.</span>
        </button>
      </nav>
    );
  }

  // Téléconseillères : PDV + Dashboards + Déco
  if (isTelec) {
    return (
      <nav className="mobile-bottom-bar">
        <a href="/pdvs" className={`mbb-item${pathname.startsWith('/pdvs') ? ' mbb-active' : ''}`}>
          <span className="mbb-icon">🏪</span>
          <span className="mbb-label">Mes PDVs</span>
        </a>
        <a href="/omy/dashboard" className={`mbb-item${pathname.startsWith('/omy') ? ' mbb-active' : ''}`}>
          <span className="mbb-icon">📊</span>
          <span className="mbb-label">OMY</span>
        </a>
        <a href="/nafama/dashboard" className={`mbb-item${pathname.startsWith('/nafama') ? ' mbb-active' : ''}`}>
          <span className="mbb-icon">📈</span>
          <span className="mbb-label">NAFAMA</span>
        </a>
        <button className="mbb-item" onClick={() => { useAuthStore.getState().logout(); window.location.href = '/login'; }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontFamily: 'inherit' }}>
          <span className="mbb-icon">🚪</span>
          <span className="mbb-label">Déco.</span>
        </button>
      </nav>
    );
  }

  return (
    <nav className="mobile-bottom-bar">
      <a href="/accueil" className={`mbb-item${pathname === '/accueil' ? ' mbb-active' : ''}`}>
        <span className="mbb-icon">🏠</span>
        <span className="mbb-label">Accueil</span>
      </a>
      <a href="/pdvs" className={`mbb-item${pathname.startsWith('/pdvs') ? ' mbb-active' : ''}`}>
        <span className="mbb-icon">🏪</span>
        <span className="mbb-label">PDV</span>
      </a>
      <a href="/prospection" className={`mbb-item${pathname.startsWith('/prospection') ? ' mbb-active' : ''}`}>
        <span className="mbb-icon">📋</span>
        <span className="mbb-label">Prospect</span>
      </a>
      <button
        className="mbb-item mbb-menu"
        onClick={e => { e.stopPropagation(); onMenuOpen(); }}
      >
        <span className="mbb-icon">☰</span>
        <span className="mbb-label">Menu</span>
      </button>
    </nav>
  );
}
