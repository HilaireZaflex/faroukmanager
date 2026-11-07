import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import api from '../services/api';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { resynchroniserPush } from './push';

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

  const groupe = groupeRole(user?.role);
  const libelleEspace = groupe === 'superviseur' ? 'Espace de gestion · Superviseur'
    : groupe === 'developpeur' ? 'Espace de gestion · Développeur'
    : groupe === 'manager' ? 'Espace de gestion · Encadrement' : 'Espace de gestion';
  const raccourcis = ONGLETS[groupe] || ONGLETS.autre;

  // Le tiroir reprend EXACTEMENT les menus dont dispose le rôle dans la version web.
  const liens = [
    { ok: true,                       to: '/m/accueil',      icon: '🏠', label: 'Accueil' },
    { ok: true,                       to: '/m/pdv',          icon: '🏪', label: 'Points de vente' },
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
            <span className="m-nav-ico">{o.icon}</span>
            <span className="m-nav-lbl">{o.label}</span>
          </NavLink>
        ))}
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
