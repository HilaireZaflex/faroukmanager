import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, LayoutDashboard, CalendarDays, Store, Bell,
  Brain, RefreshCw, FileText, Settings,
  LogOut, ChevronLeft, ChevronRight, Users, Upload,
  Wand2, TrendingUp, ChevronDown, Map, AlertTriangle, Network, UserPlus, Activity, DollarSign, Star
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import './Sidebar.css';

// ── Permissions par défaut (fallback si rien en localStorage) ─────────────────
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    dashboards: ['omy', 'nafama', 'kaabu'],
    menus: ['pdvs','prospection','indicateurs','commissions','evaluations','alerts','reseau','ia','carte','recovery','import','reports','settings'],
  },
  manager: {
    dashboards: ['omy', 'nafama', 'kaabu'],
    menus: ['pdvs','prospection','indicateurs','commissions','evaluations','alerts','reseau','ia','carte','recovery','reports','settings'],
  },
  superviseur: {
    dashboards: ['omy'],
    menus: ['pdvs','prospection','indicateurs','alerts','reseau','carte','recovery'],
  },
  rc: {
    dashboards: ['omy'],
    menus: ['pdvs','commissions','alerts','recovery'],
  },
  developpeur: {
    dashboards: [],
    menus: ['prospection','alerts','reseau'],
  },
  teleconseillere: {
    dashboards: [],
    menus: ['prospection','indicateurs','alerts'],
  },
};

// Cache des permissions chargées depuis l'API
let _cachedPerms = null;

// Charger les permissions depuis l'API et mettre en cache
async function loadPermissionsFromAPI() {
  try {
    const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/role-permissions`);
    if (res.ok) {
      const data = await res.json();
      _cachedPerms = { ...DEFAULT_ROLE_PERMISSIONS, ...data };
      localStorage.setItem('fd_sidebar_permissions', JSON.stringify(_cachedPerms));
      return _cachedPerms;
    }
  } catch (e) {}
  return null;
}

// Lire les permissions : API (cache) → localStorage → défauts
function getRolePermissions() {
  if (_cachedPerms) return _cachedPerms;
  try {
    const saved = localStorage.getItem('fd_sidebar_permissions');
    if (saved) {
      _cachedPerms = { ...DEFAULT_ROLE_PERMISSIONS, ...JSON.parse(saved) };
      return _cachedPerms;
    }
  } catch (e) {}
  return DEFAULT_ROLE_PERMISSIONS;
}

function getRole(user) {
  if (!user) return 'admin';
  const r = (user.role || '').toLowerCase().replace('userrole.', '');
  return DEFAULT_ROLE_PERMISSIONS[r] ? r : 'admin';
}

function can(user, item) {
  const perms = getRolePermissions()[getRole(user)];
  return perms?.menus?.includes(item) ?? true;
}

function canDash(user, dash) {
  const perms = getRolePermissions()[getRole(user)];
  return perms?.dashboards?.includes(dash) ?? true;
}

// ── Libellé rôle lisible ─────────────────────────────────────────────────────
const ROLE_LABELS = {
  admin: '🔴 Administrateur',
  manager: '🟠 Manager',
  superviseur: '🟡 Superviseur',
  rc: '🟢 Responsable Commercial',
  developpeur: '🔵 Développeur',
  teleconseillere: '🟣 Téléconseillère',
};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [omyOpen, setOmyOpen] = useState(false);
  const [nafamaOpen, setNafamaOpen] = useState(false);
  const [kaabuOpen, setKaabuOpen] = useState(false);
  const [reseauOpen, setReseauOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const onIA = location.pathname.startsWith('/ia') || location.pathname.startsWith('/analytics');
  const role = getRole(user);
  const [, forceUpdate] = React.useState(0);

  // Charger les permissions depuis l'API au montage du composant
  React.useEffect(() => {
    loadPermissionsFromAPI().then(perms => {
      if (perms) forceUpdate(n => n + 1); // forcer re-render avec nouvelles permissions
    });
  }, []);

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
            <span className="logo-name">Farouk Distribution</span>
            <span className="logo-sub">Orange Mali</span>
          </div>
        )}
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={15}/> : <ChevronLeft size={15}/>}
        </button>
      </div>

      <nav className="sidebar-nav">

        {/* ── ACCUEIL ── */}
        {nl('/accueil', Home, 'Accueil', true)}

        {/* ── DASHBOARDS ── */}
        {(canDash(user,'omy') || canDash(user,'nafama') || canDash(user,'kaabu')) && (
          <>
            {!collapsed && <div className="nav-section-label">Dashboards</div>}
            {collapsed && <div className="nav-divider"/>}
          </>
        )}

        {/* OMY */}
        {canDash(user,'omy') && <>
          <div className={`nav-item${location.pathname.startsWith('/omy') ? ' active' : ''}`}
            onClick={() => collapsed ? navigate('/omy/dashboard') : setOmyOpen(v => !v)}
            title={collapsed ? 'Gestion OMY' : ''}>
            <LayoutDashboard size={17} className="nav-icon" style={{ color: location.pathname.startsWith('/omy') ? '#FF6900' : '' }}/>
            {!collapsed && <>
              <span className="nav-label" style={{ flex: 1 }}>
                <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#4a9eff', marginRight:7, verticalAlign:'middle' }}/>
                OMY
              </span>
              <ChevronDown size={12} style={{ transform: (omyOpen || location.pathname.startsWith('/omy')) ? 'rotate(180deg)' : 'none', transition: '0.2s', opacity: 0.4 }}/>
            </>}
          </div>
          {(omyOpen || location.pathname.startsWith('/omy')) && !collapsed && (
            <div className="nav-submenu">
              <NavLink to="/omy/dashboard" end className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <LayoutDashboard size={12} className="nav-icon"/><span className="nav-label">Mensuel</span>
              </NavLink>
              <NavLink to="/omy/dashboard/weekly" className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <CalendarDays size={12} className="nav-icon"/><span className="nav-label">Hebdomadaire</span>
              </NavLink>
            </div>
          )}
        </>}

        {/* NAFAMA */}
        {canDash(user,'nafama') && <>
          <div className={`nav-item${location.pathname.startsWith('/nafama') ? ' active' : ''}`}
            onClick={() => collapsed ? navigate('/nafama/dashboard') : setNafamaOpen(v => !v)}
            title={collapsed ? 'Gestion NAFAMA' : ''}>
            <LayoutDashboard size={17} className="nav-icon" style={{ color: location.pathname.startsWith('/nafama') ? '#FF6900' : '' }}/>
            {!collapsed && <>
              <span className="nav-label" style={{ flex: 1 }}>
                <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#00d68f', marginRight:7, verticalAlign:'middle' }}/>
                NAFAMA
              </span>
              <ChevronDown size={12} style={{ transform: (nafamaOpen || location.pathname.startsWith('/nafama')) ? 'rotate(180deg)' : 'none', transition: '0.2s', opacity: 0.4 }}/>
            </>}
          </div>
          {(nafamaOpen || location.pathname.startsWith('/nafama')) && !collapsed && (
            <div className="nav-submenu">
              <NavLink to="/nafama/dashboard" end className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <LayoutDashboard size={12} className="nav-icon"/><span className="nav-label">Mensuel</span>
              </NavLink>
              <NavLink to="/nafama/dashboard/weekly" className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <CalendarDays size={12} className="nav-icon"/><span className="nav-label">Hebdomadaire</span>
              </NavLink>
            </div>
          )}
        </>}

        {/* KAABU */}
        {canDash(user,'kaabu') && <>
          <div className={`nav-item${location.pathname.startsWith('/kaabu') ? ' active' : ''}`}
            onClick={() => collapsed ? navigate('/kaabu/dashboard') : setKaabuOpen(v => !v)}
            title={collapsed ? 'Gestion KAABU' : ''}>
            <LayoutDashboard size={17} className="nav-icon" style={{ color: location.pathname.startsWith('/kaabu') ? '#FF6900' : '' }}/>
            {!collapsed && <>
              <span className="nav-label" style={{ flex: 1 }}>
                <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#a855f7', marginRight:7, verticalAlign:'middle' }}/>
                KAABU
              </span>
              <ChevronDown size={12} style={{ transform: (kaabuOpen || location.pathname.startsWith('/kaabu')) ? 'rotate(180deg)' : 'none', transition: '0.2s', opacity: 0.4 }}/>
            </>}
          </div>
          {(kaabuOpen || location.pathname.startsWith('/kaabu')) && !collapsed && (
            <div className="nav-submenu">
              <NavLink to="/kaabu/dashboard" end className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <LayoutDashboard size={12} className="nav-icon"/><span className="nav-label">Mensuel</span>
              </NavLink>
              <NavLink to="/kaabu/dashboard/weekly" className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <CalendarDays size={12} className="nav-icon"/><span className="nav-label">Hebdomadaire</span>
              </NavLink>
            </div>
          )}
        </>}

        {/* ── GESTION ── */}
        <div className="nav-divider"/>
        {!collapsed && <div className="nav-section-label">Gestion</div>}

        {can(user,'pdvs')        && nl('/pdvs',        Store,       'Points de Vente')}
        {can(user,'prospection') && nl('/prospection', UserPlus,    'Prospection OM')}
        {can(user,'indicateurs') && nl('/indicateurs', Activity,    'Indicateurs')}
        {can(user,'commissions') && nl('/commissions', DollarSign,  'Commissions')}
        {can(user,'evaluations') && nl('/evaluations', Star,        'Évaluations')}
        {can(user,'alerts')      && nl('/alerts',      Bell,        'Alertes')}
        {can(user,'reseau')      && nl('/reseau',      Network,     'Gestion du Réseau')}

        {/* ── INTELLIGENCE ── */}
        {can(user,'ia') && <>
          <div className="nav-divider"/>
          {!collapsed && <div className="nav-section-label">Intelligence</div>}
          <div className={`nav-item${onIA ? ' active' : ''}`}
            onClick={() => collapsed ? navigate('/ia') : setIaOpen(v => !v)}
            title={collapsed ? 'Intelligence IA' : ''}>
            <Brain size={17} className="nav-icon" style={{ color: onIA ? '#FF6900' : '' }}/>
            {!collapsed && <>
              <span className="nav-label" style={{ flex: 1 }}>Intelligence IA</span>
              <ChevronDown size={12} style={{ transform: (iaOpen || onIA) ? 'rotate(180deg)' : 'none', transition: '0.2s', opacity: 0.4 }}/>
            </>}
          </div>
          {(iaOpen || onIA) && !collapsed && (
            <div className="nav-submenu">
              <NavLink to="/ia" end className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <TrendingUp size={12} className="nav-icon"/><span className="nav-label">Tableau de Bord IA</span>
              </NavLink>
              <NavLink to="/ia/whatif" className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <Wand2 size={12} className="nav-icon"/><span className="nav-label">Simulateur Et Si ?</span>
              </NavLink>
            </div>
          )}
        </>}

        {can(user,'carte') && nl('/carte', Map, 'Carte Interactive')}

        {/* Récupérations */}
        {can(user,'recovery') && <>
          <div className={`nav-item${location.pathname.startsWith('/recovery') ? ' active' : ''}`}
            onClick={() => collapsed ? navigate('/recovery') : setRecoveryOpen(v => !v)}
            title={collapsed ? 'Récupérations' : ''}>
            <RefreshCw size={17} className="nav-icon" style={{ color: location.pathname.startsWith('/recovery') ? '#FF6900' : '' }}/>
            {!collapsed && <>
              <span className="nav-label" style={{ flex: 1 }}>Récupérations</span>
              <ChevronDown size={12} style={{ transform: (recoveryOpen || location.pathname.startsWith('/recovery')) ? 'rotate(180deg)' : 'none', transition: '0.2s', opacity: 0.4 }}/>
            </>}
          </div>
          {(recoveryOpen || location.pathname.startsWith('/recovery')) && !collapsed && (
            <div className="nav-submenu">
              <NavLink to="/recovery" end className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <RefreshCw size={12} className="nav-icon"/><span className="nav-label">Aperçu Général</span>
              </NavLink>
              <NavLink to="/recovery/liste" className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}>
                <AlertTriangle size={12} className="nav-icon"/><span className="nav-label">Liste à Récupérer</span>
              </NavLink>
            </div>
          )}
        </>}

        {/* ── OUTILS ── */}
        {(can(user,'import') || can(user,'reports') || can(user,'settings')) && <>
          <div className="nav-divider"/>
          {!collapsed && <div className="nav-section-label">Outils</div>}
          {can(user,'import')   && nl('/import',   Upload,   'Import Données')}
          {can(user,'reports')  && nl('/reports',  FileText, 'Rapports')}
          {can(user,'settings') && nl('/settings', Settings, 'Paramètres')}
        </>}

      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{initials}</div>
          {!collapsed && (
            <div className="user-details">
              <span className="user-name">{user?.prenom} {user?.nom}</span>
              <span className="user-role" style={{ fontSize: 11 }}>{ROLE_LABELS[role] || role}</span>
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
