import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, LayoutDashboard, CalendarDays, Store, Bell,
  Brain, RefreshCw, FileText, Settings,
  LogOut, ChevronLeft, ChevronRight, Users, Upload,
  Wand2, TrendingUp, ChevronDown, Map, AlertTriangle
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import './Sidebar.css';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const onIA = location.pathname.startsWith('/ia') || location.pathname.startsWith('/analytics');

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user ? `${(user.nom||'?')[0]}${(user.prenom||'')[0]||''}`.toUpperCase() : '?';

  const nl = (to, Icon, label, end=false) => (
    <NavLink key={to} to={to} end={end}
      className={({isActive}) => `nav-item${isActive?' active':''}`}
      title={collapsed ? label : ''}>
      <Icon size={18} className="nav-icon"/>
      {!collapsed && <span className="nav-label">{label}</span>}
    </NavLink>
  );

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">🟠</div>
        {!collapsed && (
          <div className="logo-text">
            <span className="logo-name">FaroukManager</span>
            <span className="logo-sub">Orange Mali</span>
          </div>
        )}
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={15}/> : <ChevronLeft size={15}/>}
        </button>
      </div>

      <nav className="sidebar-nav">
        {/* ACCUEIL — en premier */}
        {nl('/accueil', Home, '🏠 Accueil', true)}

        {/* Dashboards */}
        {nl('/dashboard', LayoutDashboard, 'Dashboard Mensuel', true)}
        {nl('/dashboard/weekly', CalendarDays, 'Dashboard Hebdo')}

        {/* PDVs */}
        {nl('/pdvs', Store, 'Points de Vente')}

        {/* Alertes */}
        {nl('/alerts', Bell, 'Alertes')}

        {/* Superviseurs */}
        {nl('/superviseurs', Users, 'Superviseurs & Zones')}

        {/* Intelligence IA — menu expandable */}
        <div
          className={`nav-item${onIA ? ' active' : ''}`}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => collapsed ? navigate('/ia') : setIaOpen(v => !v)}
          title={collapsed ? 'Intelligence IA' : ''}
        >
          <Brain size={18} className="nav-icon" style={{ color: onIA ? 'var(--primary)' : '' }}/>
          {!collapsed && (
            <>
              <span className="nav-label" style={{ flex: 1 }}>🧠 Intelligence IA</span>
              <ChevronDown size={13} style={{
                transform: (iaOpen || onIA) ? 'rotate(180deg)' : 'none',
                transition: '0.2s',
                color: 'var(--text-secondary)'
              }}/>
            </>
          )}
        </div>
        {(iaOpen || onIA) && !collapsed && (
          <div style={{ paddingLeft: 12, borderLeft: '2px solid rgba(255,105,0,0.3)', marginLeft: 20 }}>
            <NavLink to="/ia" end className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}
              style={{ paddingLeft: 8 }}>
              <TrendingUp size={13} className="nav-icon"/>
              <span className="nav-label" style={{ fontSize: 12 }}>Tableau de Bord IA</span>
            </NavLink>
            <NavLink to="/ia/whatif" className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}
              style={{ paddingLeft: 8 }}>
              <Wand2 size={13} className="nav-icon"/>
              <span className="nav-label" style={{ fontSize: 12 }}>Simulateur Et Si ?</span>
            </NavLink>
          </div>
        )}

        {/* Carte Interactive */}
        {nl('/carte', Map, '🗺️ Carte Interactive')}

        {/* Récupération — accordéon comme IA */}
        <div
          className={`nav-item${location.pathname.startsWith('/recovery') ? ' active' : ''}`}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => collapsed ? navigate('/recovery') : setRecoveryOpen(v => !v)}
          title={collapsed ? 'Récupérations' : ''}
        >
          <RefreshCw size={18} className="nav-icon" style={{ color: location.pathname.startsWith('/recovery') ? 'var(--primary)' : '' }}/>
          {!collapsed && (
            <>
              <span className="nav-label" style={{ flex: 1 }}>Récupérations</span>
              <ChevronDown size={13} style={{
                transform: (recoveryOpen || location.pathname.startsWith('/recovery')) ? 'rotate(180deg)' : 'none',
                transition: '0.2s',
                color: 'var(--text-secondary)'
              }}/>
            </>
          )}
        </div>
        {(recoveryOpen || location.pathname.startsWith('/recovery')) && !collapsed && (
          <div style={{ paddingLeft: 12, borderLeft: '2px solid rgba(255,105,0,0.3)', marginLeft: 20 }}>
            <NavLink to="/recovery" end className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}
              style={{ paddingLeft: 8 }}>
              <RefreshCw size={13} className="nav-icon"/>
              <span className="nav-label" style={{ fontSize: 12 }}>Aperçu Général</span>
            </NavLink>
            <NavLink to="/recovery/liste" className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}
              style={{ paddingLeft: 8 }}>
              <AlertTriangle size={13} className="nav-icon"/>
              <span className="nav-label" style={{ fontSize: 12 }}>Liste à Récupérer</span>
            </NavLink>
          </div>
        )}

        {/* Import */}
        {nl('/import', Upload, 'Import Données')}

        {/* Rapports */}
        {nl('/reports', FileText, 'Rapports')}

        {/* Paramètres */}
        {nl('/settings', Settings, 'Paramètres')}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{initials}</div>
          {!collapsed && (
            <div className="user-details">
              <span className="user-name">{user?.nom || 'Utilisateur'}</span>
              <span className="user-role">{user?.role || 'admin'}</span>
            </div>
          )}
        </div>
        <button className="logout-btn" onClick={handleLogout} title="Déconnexion">
          <LogOut size={15}/>
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  );
}
