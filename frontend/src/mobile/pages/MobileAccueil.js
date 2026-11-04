import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { groupeRole, ONGLETS } from '../MobileLayout';
import { fmtCourt } from '../format';

const fmtN = (v, d = 0) =>
  v == null ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

const KpiCard = ({ icone, label, valeur, sous, couleur, to }) => {
  const contenu = (
    <>
      <div className="m-kpi-ico" style={{ color: couleur }}>{icone}</div>
      <div className="m-kpi-body">
        <div className="m-kpi-lbl">{label}</div>
        <div className="m-kpi-val" style={{ color }}>{valeur}</div>
        {sous && <div className="m-kpi-sub">{sous}</div>}
      </div>
      {to && <div className="m-kpi-chev">›</div>}
    </>
  );
  const style = {
    '--m-accent': `${couleur}55`, '--m-bg1': `${couleur}18`,
    '--m-bg2': `${couleur}06`, '--m-ico-bg': `${couleur}22`,
  };
  return to
    ? <Link to={to} className="m-kpi-card" style={style}>{contenu}</Link>
    : <div className="m-kpi-card" style={style}>{contenu}</div>;
};

const Anneau = ({ actifs, inactifs, recup }) => {
  const total = (actifs || 0) + (inactifs || 0) + (recup || 0);
  const r = 46, c = 2 * Math.PI * r;
  let offset = 0;
  const parts = [
    { v: actifs || 0, col: '#22c55e' },
    { v: inactifs || 0, col: '#ff4757' },
    { v: recup || 0, col: '#ffa502' },
  ];
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="13" />
      {total > 0 && parts.map((p, i) => {
        const len = (p.v / total) * c;
        const el = (
          <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={p.col} strokeWidth="13"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            transform="rotate(-90 60 60)" />
        );
        offset += len;
        return el;
      })}
      <text x="60" y="55" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="9">Total PDV</text>
      <text x="60" y="74" textAnchor="middle" fill="#fff" fontSize="19" fontWeight="900">{fmtN(total)}</text>
    </svg>
  );
};

export default function MobileAccueil() {
  const user = useAuthStore(s => s.user);
  const groupe = groupeRole(user?.role);

  const { data: stats } = useQuery('m-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 120000 });
  const { data: synthese } = useQuery('m-synthese',
    () => api.get('/analyse-perf/synthese', { params: { mode: 'hebdo', niveau: 'zone' } }).then(r => r.data),
    { enabled: groupe === 'manager', staleTime: 120000 });
  const { data: recup } = useQuery('m-recup-accueil',
    () => api.get('/analyse-perf/recuperation', { params: { mode: 'hebdo', metrique: 'volume' } }).then(r => r.data),
    { enabled: groupe === 'superviseur', staleTime: 120000 });
  const { data: alertes } = useQuery('m-alertes-accueil',
    () => api.get('/alerts/inactive').then(r => r.data),
    { enabled: groupe === 'superviseur', staleTime: 120000 });
  const { data: devVisites } = useQuery('m-dev-visites',
    () => api.get('/prospects', { params: { status: 'EN_VISITE', assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { enabled: groupe === 'developpeur', staleTime: 120000 });
  const { data: devActis } = useQuery('m-dev-activations',
    () => api.get('/prospects', { params: { assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { enabled: groupe === 'developpeur', staleTime: 120000 });
  const { data: pstats } = useQuery('m-prospect-stats',
    () => api.get('/prospects/stats').then(r => r.data),
    { enabled: groupe === 'manager', staleTime: 120000 });

  const k = synthese?.kpis || {};
  const kr = recup?.kpis || {};
  const nbAlertes = alertes?.pdvs?.length || 0;
  const aDecider = (Number(pstats?.validees_dev) || 0) + (Number(pstats?.en_attente_rc) || 0);
  const nbVisites = devVisites?.length || 0;
  const nbA_activer = (devActis || []).filter(p => ['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE'].includes((p.status || '').toUpperCase())).length;
  const nbActivees = (devActis || []).filter(p => (p.status || '').toUpperCase() === 'PUCE_ACTIVEE').length;
  const nbAttente = (devActis || []).filter(p => ['VALIDEE_DEV', 'EN_ATTENTE_RC', 'APPROUVEE_RC'].includes((p.status || '').toUpperCase())).length;

  let priorites = [];
  if (groupe === 'superviseur') {
    priorites = [
      { icone: '📉', label: 'PDV en baisse', valeur: fmtN(kr.nb_baisse), sous: `${fmtN(kr.nb_p1)} urgent(s)`, couleur: '#ff4757', to: '/m/recuperation' },
      { icone: '💸', label: 'Gain à récupérer', valeur: fmtCourt(kr.perte_totale), sous: 'perte totale', couleur: '#ffa502', to: '/m/recuperation' },
      { icone: '🔔', label: 'PDV sans activité', valeur: fmtN(nbAlertes), sous: 'à relancer', couleur: '#4a9eff', to: '/m/alertes' },
      { icone: '♻️', label: 'Récupération', valeur: fmtN(stats?.en_recuperation), sous: 'en cours', couleur: '#a855f7', to: '/m/pdv' },
    ];
  } else if (groupe === 'developpeur') {
    priorites = [
      { icone: '📋', label: 'Visites à faire', valeur: fmtN(nbVisites), sous: 'affectées à moi', couleur: '#ffa502', to: '/m/planning' },
      { icone: '⚡', label: 'Activations à faire', valeur: fmtN(nbA_activer), sous: 'puces attribuées', couleur: '#4a9eff', to: '/m/activations' },
      { icone: '📁', label: 'En attente RC', valeur: fmtN(nbAttente), sous: 'dossiers en cours', couleur: '#a855f7', to: '/m/prospection' },
      { icone: '✅', label: 'Activées', valeur: fmtN(nbActivees), sous: 'PDV créés', couleur: '#22c55e', to: '/m/activations' },
    ];
  } else {
    priorites = [
      { icone: '💰', label: 'Gain réel', valeur: fmtCourt(k.real), sous: 'REAL TTC', couleur: '#FF6900', to: '/m/pilotage' },
      { icone: '📈', label: 'Gain / million', valeur: fmtN(k.real_par_million), sous: 'rendement', couleur: '#00d68f', to: '/m/pilotage' },
      { icone: '🏪', label: 'Activation', valeur: `${fmtN(k.activation, 1)} %`, sous: `${fmtN(k.nb_actifs)} / ${fmtN(k.nb_pdv_total)}`, couleur: '#4a9eff', to: '/m/pilotage' },
      { icone: '📋', label: 'À valider', valeur: fmtN(aDecider), sous: 'décisions RC', couleur: '#ffa502', to: '/m/validations' },
    ];
  }

  const tuiles = (ONGLETS[groupe] || ONGLETS.autre).filter(t => t.to !== '/m/accueil').slice(0, 4);
  const titreEspace = groupe === 'superviseur' ? 'ESPACE SUPERVISEUR'
    : groupe === 'developpeur' ? 'ESPACE DÉVELOPPEUR'
    : groupe === 'manager' ? 'ESPACE ENCADREMENT' : 'FAROUK MANAGER';

  return (
    <div>
      <div className="m-hero">
        <div className="m-hero-bonjour">Bonjour 👋</div>
        <div className="m-hero-nom">{user?.nom || user?.prenom || 'Utilisateur'}</div>
        <div className="m-hero-role">{titreEspace}</div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 10 }}>
        🎯 Mes priorités aujourd'hui
      </div>
      <div className="m-kpi-grid">
        {priorites.map(p => <KpiCard key={p.label} {...p} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>👥 Mon réseau</div>
        <Link to="/m/pdv" style={{ fontSize: 11.5, fontWeight: 700, color: '#ff8c3a', textDecoration: 'none' }}>
          Voir le détail ›
        </Link>
      </div>
      <div className="m-ring-card">
        <Anneau actifs={stats?.actifs} inactifs={stats?.inactifs} recup={stats?.en_recuperation} />
        <div style={{ flex: 1 }}>
          <div className="m-legend-row"><span className="m-legend-dot" style={{ background: '#22c55e' }} />Actifs <span className="m-legend-val">{fmtN(stats?.actifs)}</span></div>
          <div className="m-legend-row"><span className="m-legend-dot" style={{ background: '#ff4757' }} />Inactifs <span className="m-legend-val">{fmtN(stats?.inactifs)}</span></div>
          <div className="m-legend-row"><span className="m-legend-dot" style={{ background: '#ffa502' }} />Récupération <span className="m-legend-val">{fmtN(stats?.en_recuperation)}</span></div>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 10 }}>⚡ Accès rapides</div>
      <div className="m-tiles" style={{ gridTemplateColumns: `repeat(${Math.max(tuiles.length, 2)}, 1fr)` }}>
        {tuiles.map(t => (
          <Link key={t.to} to={t.to} className="m-tile">
            <span className="m-tile-ico">{t.icon}</span>
            <span className="m-tile-lbl">{t.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
