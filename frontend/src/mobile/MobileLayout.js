import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import api from '../services/api';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { resynchroniserPush } from './push';
import { nomComplet, libelleRole } from './format';

// ── Groupes de rôles ──
export function groupeRole(role) {
  const r = (role || '').toLowerCase().replace('userrole.', '');
  if (r === 'superviseur') return 'superviseur';
  if (r === 'developpeur') return 'developpeur';
  if (r === 'commercial') return 'commercial';
  if (['admin', 'manager', 'rc', 'conformite', 'gestionnaire'].includes(r) || r.includes('responsable')) return 'manager';
  return 'autre';
}

// Barre du bas : 4 raccourcis + « Menu »
export const ONGLETS = {
  superviseur: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/pdv',          icon: '🏪', label: 'PDV' },
    { to: '/m/recuperation', icon: '🚨', label: 'En urgence' },
    { to: '/m/alertes',      icon: '🔔', label: 'Alertes' },
  ],
  developpeur: [
    { to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { to: '/m/pdv',          icon: '🏪', label: 'PDV' },
    { to: '/m/prospection',  icon: '👥', label: 'Prospect' },
    { to: '/m/reclamations', icon: '📣', label: 'Réclam.' },
  ],
  commercial: [
    { to: '/m/accueil',          icon: '🏠', label: 'Accueil' },
    { to: '/m/prospection',      icon: '👥', label: 'Prospect' },
    { to: '/m/energia',          icon: '☀️', label: 'ENERGIA' },
    { to: '/m/prospect/nouveau', icon: '➕', label: 'Nouveau' },
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
  const canAccessDash = useAuthStore(s => s.canAccessDash);
  const queryClient = useQueryClient();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [notifsOuvert, setNotifsOuvert] = useState(false);

  // Une notification push reçue pendant que l'application est ouverte :
  // on rafraîchit la cloche immédiatement.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const gestion = (evenement) => {
      if (evenement && evenement.data && evenement.data.type === 'fm-push') {
        queryClient.invalidateQueries('m-notifs');
      }
    };
    navigator.serviceWorker.addEventListener('message', gestion);
    return () => navigator.serviceWorker.removeEventListener('message', gestion);
  }, [queryClient]);

  // Appareil déjà autorisé : on vérifie discrètement que l'abonnement est
  // toujours valide (après un redéploiement, un nettoyage du navigateur, etc.).
  useEffect(() => {
    const t = setTimeout(() => { resynchroniserPush().catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, []);
  const { data: notifsData } = useQuery('m-notifs',
    () => api.get('/notifications/pending').then(r => r.data).catch(() => []),
    { refetchInterval: 60000, staleTime: 30000 });
  const notifs = Array.isArray(notifsData) ? notifsData
    : (notifsData?.items || notifsData?.notifications || []);

  // Compteur affiché sous l'onglet « PDV » (comme sur les maquettes).
  const { data: statsNav } = useQuery('m-nav-stats',
    () => api.get('/pdvs/stats').then(r => r.data).catch(() => null),
    { refetchInterval: 180000, staleTime: 120000 });
  const nombreCompact = (n) => {
    const v = Number(n) || 0;
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)} M`;
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} k`;
    return String(v);
  };
  const groupe = groupeRole(user?.role);

  // Nombre d'alertes du réseau (superviseur) : pastille sur l'onglet Alertes.
  const { data: alertesNav } = useQuery('m-nav-alertes',
    () => api.get('/alerts/inactive').then(r => r.data).catch(() => null),
    { enabled: groupe === 'superviseur', refetchInterval: 180000, staleTime: 120000 });
  const nbAlertesNav = alertesNav?.pdvs?.length || 0;

  const pastille = (to) => {
    if (to === '/m/pdv' && statsNav?.total_pdvs) return nombreCompact(statsNav.total_pdvs);
    if (to === '/m/alertes' && nbAlertesNav) return nbAlertesNav > 99 ? '99+' : String(nbAlertesNav);
    return null;
  };

  const estGestionnaire = (user?.role || '').toLowerCase().replace('userrole.', '') === 'gestionnaire';
  const libelleEspace = groupe === 'superviseur' ? 'Espace de gestion · Superviseur'
    : groupe === 'developpeur' ? 'Espace de gestion · Développeur'
    : groupe === 'commercial' ? 'Espace de gestion · Commercial'
    : estGestionnaire ? 'Espace de gestion · Gestionnaire'
    : groupe === 'manager' ? 'Espace de gestion · Encadrement' : 'Espace de gestion';
  const raccourcis = (ONGLETS[groupe] || ONGLETS.autre)
    .filter(o => o.to !== '/m/prospection' || canAccess('prospection'))
    .filter(o => o.to !== '/m/prospect/nouveau' || canAccess('prospection'))
    .filter(o => o.to !== '/m/energia' || canAccess('prospection_energia'));

  // Menu mobile : une liste par métier, pour que chaque rôle retrouve
  // exactement ce qu'il fait sur le terrain — avec le même design.
  const ITEMS = {
    accueil:      { to: '/m/accueil',           icon: '🏠', label: 'Accueil', couleur: '#a855f7' },
    pdv:          { to: '/m/pdv',               icon: '🏪', label: 'Points de vente', couleur: '#60a5fa' },
    prospection:  { to: '/m/prospection',       icon: '👥', label: 'Prospection', couleur: '#60a5fa' },
    energia:      { to: '/m/energia',           icon: '☀️', label: 'Prospection ENERGIA', couleur: '#fbbf24' },
    nouveau:      { to: '/m/prospect/nouveau',  icon: '➕', label: 'Nouveau prospect', couleur: '#22c55e' },
    planning:     { to: '/m/planning',          icon: '📅', label: 'Mes visites', couleur: '#a855f7' },
    activations:  { to: '/m/activations',       icon: '⚡', label: 'Mes activations', couleur: '#ffa502' },
    recuperation: { to: '/m/recuperation',      icon: '🎯', label: 'En urgence', couleur: '#f472b6' },
    alertes:      { to: '/m/alertes',           icon: '🔔', label: 'Alertes', couleur: '#fbbf24' },
    reclamations: { to: '/m/reclamations',      icon: '📣', label: 'Réclamations', couleur: '#fbbf24' },
    pilotage:     { to: '/m/pilotage',          icon: '📊', label: 'Pilotage', couleur: '#a855f7' },
    equipe:       { to: '/m/equipe',            icon: '🌐', label: 'Équipe & réseau', couleur: '#60a5fa' },
    validations:  { to: '/m/validations',       icon: '📋', label: 'Validations', couleur: '#22c55e' },
  };

  const MENUS_MOBILE = {
    commercial:  ['accueil', 'prospection', 'energia', 'nouveau', 'pdv'],
    developpeur: ['accueil', 'prospection', 'planning', 'activations', 'pdv', 'reclamations'],
    superviseur: ['accueil', 'pdv', 'recuperation', 'alertes', 'prospection', 'reclamations'],
    manager:     ['accueil', 'pdv', 'prospection', 'alertes', 'reclamations', 'activations', 'pilotage', 'equipe', 'validations'],
    autre:       ['accueil', 'pdv'],
  };

  // L'encadrement garde les droits web (menus cochés dans Paramètres).
  const autorise = (id) => {
    // Un compte peut n'avoir que la prospection ENERGIA : on masque alors
    // la prospection OM partout, y compris dans le menu mobile.
    if (id === 'prospection') return canAccess('prospection');
    if (id === 'energia') return canAccess('prospection_energia');
    if (groupe !== 'manager') return true;
    if (id === 'alertes') return canAccess('alerts');
    if (id === 'activations') return canAccess('activations');
    return true;
  };

  const liens = (MENUS_MOBILE[groupe] || MENUS_MOBILE.autre)
    .filter(autorise)
    .map(id => ITEMS[id])
    .filter(Boolean);

  // Dashboards OMY / NAFAMA / KAABU : mêmes droits que la version web.
  const dashboards = [
    { ok: canAccessDash('omy'),    to: '/m/dashboard/omy',    icon: '📊', label: 'Dashboard OMY', couleur: '#a855f7' },
    { ok: canAccessDash('nafama'), to: '/m/dashboard/nafama', icon: '💰', label: 'Dashboard NAFAMA', couleur: '#fbbf24' },
    { ok: canAccessDash('kaabu'),  to: '/m/dashboard/kaabu',  icon: '📈', label: 'Dashboard KAABU', couleur: '#2dd4bf' },
  ].filter(d => d.ok);

  const retourBureau = () => {
    document.body.classList.remove('fm-mobile');
    navigate('/accueil');
  };

  // À la déconnexion on vide aussi le cache des requêtes : sans cela, le compte
  // suivant voyait brièvement les chiffres du compte précédent.
  const seDeconnecter = () => {
    queryClient.clear();
    logout();
    navigate('/m/login');
  };

  return (
    <div className="m-app">


      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', flexDirection: 'row', flexWrap: 'nowrap',
        alignItems: 'center', gap: 10,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: 10,
        paddingLeft: 14,
        paddingRight: 14,
        background: 'rgba(15,15,30,0.94)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <button className="m-icon-btn" onClick={() => setMenuOuvert(true)} aria-label="Menu"
          style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)',
                   background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 18, display: 'flex',
                   alignItems: 'center', justifyContent: 'center' }}>☰</button>

        <img src="/icons/icon-192.png" alt=""
          style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', padding: 2, flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <b style={{ fontSize: 15, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Farouk Manager
          </b>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {libelleEspace}
          </span>
        </div>

        <button onClick={() => setNotifsOuvert(true)} aria-label="Notifications"
          style={{ position: 'relative', flexShrink: 0, width: 40, height: 40, borderRadius: 11,
                   border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                   color: '#fff', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          🔔
          {notifs.length > 0 && (
            <span className="m-bell-badge">{notifs.length > 99 ? '99+' : notifs.length}</span>
          )}
        </button>
      </header>
      <main className="m-content">{children}</main>

      <nav className="m-nav">
        {raccourcis.map(o => (
          <NavLink key={o.to} to={o.to}
            className={({ isActive }) => 'm-nav-item' + (isActive ? ' active' : '')}>
            <span className="m-nav-ico">
              {o.icon}
              {pastille(o.to) && <span className="m-nav-badge">{pastille(o.to)}</span>}
            </span>
            <span className="m-nav-lbl">{o.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Tiroir : tous les menus du rôle, comme sur le web ── */}
      {menuOuvert && (
        <div className="m-drawer-overlay" onClick={() => setMenuOuvert(false)}>
          <div className="m-drawer" onClick={e => e.stopPropagation()}>
            <div className="m-drawer-head">
              <div className="m-avatar">
                {(user?.prenom || '').slice(0, 1)}{(user?.nom || '').slice(0, 1)}
                <span className="m-avatar-dot" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="m-drawer-name">{nomComplet(user)}</div>
                <div className="m-drawer-role"><span>🛡️</span>{libelleRole(user?.role)}</div>
              </div>
              <button className="m-drawer-close" onClick={() => setMenuOuvert(false)} aria-label="Fermer">✕</button>
            </div>

            <div className="m-drawer-section">Navigation</div>
            {liens.map(l => (
              <NavLink key={l.to} to={l.to} onClick={() => setMenuOuvert(false)}
                className={({ isActive }) => 'm-drawer-item' + (isActive ? ' active' : '')}>
                <span className="m-drawer-ico" style={{ background: `${l.couleur}26`, borderColor: `${l.couleur}55` }}>
                  {l.icon}
                </span>
                <span className="m-drawer-lbl">{l.label}</span>
                <span className="m-drawer-trail">
                  {l.to === '/m/alertes' && nbAlertesNav > 0 && (
                    <span className="m-drawer-badge">{nbAlertesNav > 99 ? '99+' : nbAlertesNav}</span>
                  )}
                  <span className="arrow">›</span>
                </span>
              </NavLink>
            ))}

            {dashboards.length > 0 && (
              <>
                <div className="m-drawer-section">Dashboards</div>
                {dashboards.map(d => (
                  <NavLink key={d.to} to={d.to} onClick={() => setMenuOuvert(false)}
                    className={({ isActive }) => 'm-drawer-item' + (isActive ? ' active' : '')}>
                    <span className="m-drawer-ico" style={{ background: `${d.couleur}26`, borderColor: `${d.couleur}55` }}>
                      {d.icon}
                    </span>
                    <span className="m-drawer-lbl">{d.label}</span>
                    <span className="m-drawer-trail"><span className="arrow">›</span></span>
                  </NavLink>
                ))}
              </>
            )}

            <div className="m-drawer-section">Compte</div>
            <NavLink to="/m/profil" onClick={() => setMenuOuvert(false)}
              className={({ isActive }) => 'm-drawer-item' + (isActive ? ' active' : '')}>
              <span className="m-drawer-ico" style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.16)' }}>👤</span>
              <span className="m-drawer-lbl">Mon profil</span>
              <span className="m-drawer-trail"><span className="arrow">›</span></span>
            </NavLink>
            <button className="m-drawer-item" onClick={retourBureau}>
              <span className="m-drawer-ico" style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.16)' }}>🖥️</span>
              <span className="m-drawer-lbl">Version bureau</span>
              <span className="m-drawer-trail"><span className="arrow">›</span></span>
            </button>
            <button className="m-drawer-item danger" onClick={seDeconnecter}>
              <span className="m-drawer-ico">⏻</span>
              <span className="m-drawer-lbl">Se déconnecter</span>
              <span className="m-drawer-trail"><span className="arrow">›</span></span>
            </button>

            <div className="m-drawer-waves" />
          </div>
        </div>
      )}

      {notifsOuvert && (
        <div className="m-drawer-overlay" onClick={() => setNotifsOuvert(false)}>
          <div className="m-sheet" style={{ maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>🔔 Notifications ({notifs.length})</h3>
              <button className="m-icon-btn" onClick={() => setNotifsOuvert(false)}>✕</button>
            </div>
            {notifs.length === 0 && <div className="m-empty">Aucune notification pour le moment.</div>}
            {notifs.map((n, i) => (
              <div key={n.id || i} className="m-card" style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{n.title || n.titre || 'Notification'}</div>
                {(n.message || n.body) && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4, lineHeight: 1.5 }}>
                    {n.message || n.body}
                  </div>
                )}
                {n.created_at && (
                  <div style={{ fontSize: 10.5, color: 'var(--fm-muted)', marginTop: 6 }}>
                    {new Date(n.created_at).toLocaleString('fr-FR')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
