import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import './Layout.css';

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Fermer le drawer quand on change de page
  useEffect(() => {
    setMobileOpen(false);
  }, [children]);

  return (
    <div className={`layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)}/>
      )}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} onCollapse={setSidebarCollapsed}/>
      <main className="main-content">
        {children}
      </main>
      {/* Bottom bar mobile */}
      <MobileBottomBar onMenuOpen={() => setMobileOpen(true)}/>
    </div>
  );
}

function MobileBottomBar({ onMenuOpen }) {
  const loc = window.location.pathname;
  return (
    <nav className="mobile-bottom-bar">
      <a href="/accueil" className={`mbb-item${loc==='/accueil'?' mbb-active':''}`}>
        <span className="mbb-icon">🏠</span>
        <span className="mbb-label">Accueil</span>
      </a>
      <a href="/pdvs" className={`mbb-item${loc.startsWith('/pdvs')?' mbb-active':''}`}>
        <span className="mbb-icon">🏪</span>
        <span className="mbb-label">PDV</span>
      </a>
      <a href="/prospection" className={`mbb-item${loc.startsWith('/prospection')?' mbb-active':''}`}>
        <span className="mbb-icon">📋</span>
        <span className="mbb-label">Prospect</span>
      </a>
      <a href="/recovery/liste" className={`mbb-item${loc.startsWith('/recovery')?' mbb-active':''}`}>
        <span className="mbb-icon">🔄</span>
        <span className="mbb-label">Récup.</span>
      </a>
      <button className="mbb-item mbb-menu" onClick={onMenuOpen}>
        <span className="mbb-icon">☰</span>
        <span className="mbb-label">Menu</span>
      </button>
    </nav>
  );
}
