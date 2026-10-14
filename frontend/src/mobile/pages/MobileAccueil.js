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

  // Priorités terrain du superviseur (périmètre automatiquement restreint à son réseau)
  const { data: recup } = useQuery('m-recup-accueil',
    () => api.get('/analyse-perf/recuperation', { params: { mode: 'hebdo', metrique: 'volume' } }).then(r => r.data),
    { enabled: groupe === 'superviseur', staleTime: 120000 });
  const { data: alertes } = useQuery('m-alertes-accueil',
    () => api.get('/alerts/inactive').then(r => r.data),
    { enabled: groupe === 'superviseur', staleTime: 120000 });

  const kr = recup?.kpis || {};
  const nbAlertes = alertes?.pdvs?.length || 0;
  const nbCritiques = (alertes?.pdvs || []).filter(p => (p.priorite || '').toUpperCase() === 'CRITIQUE').length;

  // Priorités du développeur terrain (périmètre restreint à ses affectations par le serveur)
  const { data: devVisites } = useQuery('m-dev-visites',
    () => api.get('/prospects', { params: { status: 'EN_VISITE', assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { enabled: groupe === 'developpeur', staleTime: 120000 });
  const { data: devActis } = useQuery('m-dev-activations',
    () => api.get('/prospects', { params: { assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { enabled: groupe === 'developpeur', staleTime: 120000 });

  const nbVisites = devVisites?.length || 0;
  const nbA_activer = (devActis || []).filter(p => ['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE'].includes((p.status || '').toUpperCase())).length;
  const nbActivees = (devActis || []).filter(p => (p.status || '').toUpperCase() === 'PUCE_ACTIVEE').length;
  const nbAttente = (devActis || []).filter(p => ['VALIDEE_DEV', 'EN_ATTENTE_RC', 'APPROUVEE_RC'].includes((p.status || '').toUpperCase())).length;

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

      {groupe === 'developpeur' && (
        <>
          <div className="m-section-title">🎯 Mes priorités aujourd'hui</div>
          <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
            <KPI label="Visites à faire" value={fmtN(nbVisites)} color="#ffa502" sub="affectées à moi" />
            <KPI label="Activations à faire" value={fmtN(nbA_activer)} color="#4a9eff" sub="puces attribuées" />
            <KPI label="En attente RC" value={fmtN(nbAttente)} color="#a29bfe" sub="dossiers en cours" />
            <KPI label="Activées" value={fmtN(nbActivees)} color="#22c55e" sub="PDV créés" />
          </div>
        </>
      )}

      {groupe === 'superviseur' && (
        <>
          <div className="m-section-title">🎯 Mes priorités cette semaine</div>
          <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
            <KPI label="PDV en baisse" value={fmtN(kr.nb_baisse)} color="#ff4757"
              sub={`${fmtN(kr.nb_p1)} urgent(s) P1`} />
            <KPI label="Gain à récupérer" value={fmtF(kr.perte_totale)} color="#ffa502"
              sub="perte de valeur totale" />
            <KPI label="PDV sans activité" value={fmtN(nbAlertes)} color="#4a9eff"
              sub={`${fmtN(nbCritiques)} critique(s)`} />
            <KPI label="Récupération en cours" value={fmtN(stats?.en_recuperation)} color="#a29bfe" />
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
