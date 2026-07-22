import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import './Layout.css';

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

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
