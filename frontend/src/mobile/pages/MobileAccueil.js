import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { groupeRole, ONGLETS } from '../MobileLayout';

const fmtN = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtF = (v) => (v == null ? '—' : `${fmtN(v)} F`);

const KPI = ({ label, value, sub, color }) => (
  <div className="m-kpi" style={{ borderLeftColor: color }}>
    <div className="lbl">{label}</div>
    <div className="val" style={{ color }}>{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

export default function MobileAccueil() {
  const user = useAuthStore(s => s.user);
  const groupe = groupeRole(user?.role);

  const { data: stats } = useQuery('m-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 120000 });
  const { data: synthese } = useQuery('m-synthese',
    () => api.get('/analyse-perf/synthese', { params: { mode: 'hebdo', niveau: 'zone' } }).then(r => r.data),
    { enabled: groupe === 'manager', staleTime: 120000 });

  const k = synthese?.kpis || {};
  const liens = (ONGLETS[groupe] || ONGLETS.autre).filter(t => t.to !== '/m/accueil' && t.to !== '/m/profil');

  const titre = groupe === 'superviseur' ? 'Espace superviseur'
    : groupe === 'developpeur' ? 'Espace développeur'
    : groupe === 'manager' ? 'Espace encadrement' : '';

  return (
    <div>
      <div className="m-card">
        <div style={{ fontSize: 13, color: 'var(--fm-muted)' }}>Bonjour 👋</div>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', marginTop: 2 }}>{user?.nom || 'Utilisateur'}</div>
        {titre && <div style={{ fontSize: 11.5, color: 'var(--fm-muted)', marginTop: 2 }}>{titre}</div>}
      </div>

      {groupe === 'manager' && (
        <>
          <div className="m-section-title">📊 Synthèse{synthese?.periode_courante ? ` · ${synthese.periode_courante}` : ''}</div>
          <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
            <KPI label="Gain réel" value={fmtF(k.real)} color="#FF6900" sub="REAL TTC" />
            <KPI label="Gain / million" value={fmtN(k.real_par_million)} color="#00d68f" sub="rendement" />
            <KPI label="Volume" value={fmtF(k.volume)} color="#4a9eff" />
            <KPI label="Activation" value={`${fmtN(k.activation, 1)} %`} color="#a29bfe" sub={`${fmtN(k.nb_actifs)} / ${fmtN(k.nb_pdv_total)}`} />
            <KPI label="Gisements" value={fmtN(k.nb_gisements)} color="#ffa502" sub={`${fmtN(k.pct_volume_gisements, 1)} % volume`} />
            <KPI label="Ruptures Top 100" value={fmtN(k.ruptures_top100)} color="#ff4757" />
          </div>
        </>
      )}

      {groupe !== 'manager' && (
        <>
          <div className="m-section-title">🏪 Mon réseau</div>
          <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
            <KPI label="Total PDV" value={fmtN(stats?.total_pdvs)} color="#4a9eff" />
            <KPI label="Actifs" value={fmtN(stats?.actifs)} color="#22c55e" />
            <KPI label="Inactifs" value={fmtN(stats?.inactifs)} color="#ff4757" />
            <KPI label="Récupération" value={fmtN(stats?.en_recuperation)} color="#ffa502" />
          </div>
        </>
      )}

      <div className="m-section-title">🛰️ Accès rapides</div>
      {liens.map(t => (
        <Link key={t.to} to={t.to} className="m-link-row">
          <span className="ico">{t.icon}</span>{t.label}<span className="arrow">›</span>
        </Link>
      ))}
    </div>
  );
}
