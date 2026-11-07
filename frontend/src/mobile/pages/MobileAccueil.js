import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { groupeRole, ONGLETS } from '../MobileLayout';
import { fmtCourt, fmtN } from '../format';
import { Hero, Kpi } from '../ui';

const fmtF = (v) => (v == null ? '—' : `${fmtN(v)} F`);

/**
 * Accueil mobile.
 * Même design pour tous les rôles (héros + cartes KPI + accès rapides) ;
 * seuls les indicateurs et les raccourcis changent selon le métier.
 */
export default function MobileAccueil() {
  const user = useAuthStore(s => s.user);
  const groupe = groupeRole(user?.role);
  const estTerrain = groupe === 'developpeur' || groupe === 'commercial';

  const { data: stats } = useQuery('m-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 120000 });

  const { data: synthese } = useQuery('m-synthese',
    () => api.get('/analyse-perf/synthese', { params: { mode: 'hebdo', niveau: 'zone' } }).then(r => r.data),
    { enabled: groupe === 'manager', staleTime: 120000 });

  // Superviseur : priorités de son réseau
  const { data: recup } = useQuery('m-recup-accueil',
    () => api.get('/analyse-perf/recuperation', { params: { mode: 'hebdo', metrique: 'volume' } }).then(r => r.data),
    { enabled: groupe === 'superviseur', staleTime: 120000 });
  const { data: alertes } = useQuery('m-alertes-accueil',
    () => api.get('/alerts/inactive').then(r => r.data),
    { enabled: groupe === 'superviseur', staleTime: 120000 });

  // Développeur / commercial : ses dossiers
  const { data: devVisites } = useQuery('m-dev-visites',
    () => api.get('/prospects', { params: { status: 'EN_VISITE', assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { enabled: estTerrain, staleTime: 120000 });
  const { data: devDossiers } = useQuery('m-dev-activations',
    () => api.get('/prospects', { params: { assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { enabled: estTerrain, staleTime: 120000 });

  const { data: pstats } = useQuery('m-prospect-stats',
    () => api.get('/prospects/stats').then(r => r.data),
    { enabled: groupe === 'manager', staleTime: 120000 });

  const kr = recup?.kpis || {};
  const k = synthese?.kpis || {};
  const nbAlertes = alertes?.pdvs?.length || 0;
  const nbCritiques = (alertes?.pdvs || []).filter(p => (p.priorite || '').toUpperCase() === 'CRITIQUE').length;

  const dossiers = devDossiers || [];
  const statut = (p) => (p.status || '').toUpperCase();
  const nbVisites = devVisites?.length || 0;
  const nbA_activer = dossiers.filter(p => ['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE'].includes(statut(p))).length;
  const nbActivees = dossiers.filter(p => statut(p) === 'PUCE_ACTIVEE').length;
  const nbAttente = dossiers.filter(p => ['VALIDEE_DEV', 'EN_ATTENTE_RC', 'APPROUVEE_RC'].includes(statut(p))).length;

  const aDecider = (Number(pstats?.validees_dev) || 0) + (Number(pstats?.en_attente_rc) || 0);
  const aAttribuer = Number(pstats?.approuvees_rc) || 0;

  const liens = (ONGLETS[groupe] || ONGLETS.autre).filter(t => t.to !== '/m/accueil');

  const titre = groupe === 'superviseur' ? 'Espace superviseur'
    : groupe === 'developpeur' ? 'Espace développeur'
    : groupe === 'commercial' ? 'Espace commercial'
    : groupe === 'manager' ? 'Espace encadrement' : 'Farouk Manager';

  return (
    <div>
      <Hero
        titre={user?.prenom || user?.nom || 'Bonjour 👋'}
        sousTitre={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        role={titre}
      />

      {groupe === 'manager' && (
        <>
          <div className="m-section-title">📊 Synthèse{synthese?.periode_courante ? ` · ${synthese.periode_courante}` : ''}</div>
          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi label="Gain réel" to="/m/pilotage" icone="💰" valeur={fmtCourt(k.real)} couleur="#FF6900" sub="REAL TTC" />
            <Kpi label="Gain / million" to="/m/pilotage" icone="📈" valeur={fmtN(k.real_par_million)} couleur="#00d68f" sub="rendement" />
            <Kpi label="Volume" to="/m/pilotage" icone="📦" valeur={fmtCourt(k.volume)} couleur="#4a9eff" sub="transactions" />
            <Kpi label="Activation" to="/m/pilotage" icone="🏪" valeur={`${fmtN(k.activation, 1)} %`} couleur="#a29bfe" sub={`${fmtN(k.nb_actifs)} / ${fmtN(k.nb_pdv_total)}`} />
            <Kpi label="Gisements" to="/m/pilotage" icone="💎" valeur={fmtN(k.nb_gisements)} couleur="#ffa502" sub={`${fmtN(k.pct_volume_gisements, 1)} % volume`} />
            <Kpi label="Ruptures Top 100" to="/m/pilotage" icone="⚠️" valeur={fmtN(k.ruptures_top100)} couleur="#ff4757" />
          </div>

          <div className="m-section-title">📋 À valider</div>
          <div className="m-kpi-grid" style={{ marginBottom: 10 }}>
            <Kpi label="Décisions RC" valeur={fmtN(aDecider)} couleur="#ffa502" sub="dossiers en attente" to="/m/validations" />
            <Kpi label="Puces à attribuer" valeur={fmtN(aAttribuer)} couleur="#4a9eff" sub="dossiers approuvés" to="/m/validations" />
          </div>
        </>
      )}

      {estTerrain && (
        <>
          <div className="m-section-title">🎯 Mes priorités</div>
          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi label="Visites à faire" to="/m/planning" icone="📋" valeur={fmtN(nbVisites)} couleur="#ffa502" sub="affectées à moi" />
            <Kpi label="En attente RC" to="/m/prospection" icone="📁" valeur={fmtN(nbAttente)} couleur="#a29bfe" sub="dossiers en cours" />
            {groupe === 'developpeur' ? (
              <>
                <Kpi label="Activations à faire" to="/m/activations" icone="⚡" valeur={fmtN(nbA_activer)} couleur="#4a9eff" sub="puces attribuées" />
                <Kpi label="Activées" to="/m/activations" icone="✅" valeur={fmtN(nbActivees)} couleur="#22c55e" sub="PDV créés" />
              </>
            ) : (
              <>
                <Kpi label="Mes prospects" to="/m/prospection" icone="👥" valeur={fmtN(dossiers.length)} couleur="#4a9eff" sub="dossiers suivis" />
                <Kpi label="Activés" to="/m/prospection" icone="✅" valeur={fmtN(nbActivees)} couleur="#22c55e" sub="devenus PDV" />
              </>
            )}
          </div>
        </>
      )}

      {groupe === 'superviseur' && (
        <>
          <div className="m-section-title">🎯 Mes priorités cette semaine</div>
          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi label="PDV en baisse" to="/m/recuperation" icone="📉" valeur={fmtN(kr.nb_baisse)} couleur="#ff4757"
              sub={`${fmtN(kr.nb_p1)} urgent(s) P1`} />
            <Kpi label="Gain à récupérer" to="/m/recuperation" icone="💸" valeur={fmtF(kr.perte_totale)} couleur="#ffa502"
              sub="perte de valeur totale" />
            <Kpi label="PDV sans activité" to="/m/alertes" icone="🔔" valeur={fmtN(nbAlertes)} couleur="#4a9eff"
              sub={`${fmtN(nbCritiques)} critique(s)`} />
            <Kpi label="Récupération en cours" to="/m/pdv?statut=RECUPERATION" icone="♻️" valeur={fmtN(stats?.en_recuperation)} couleur="#a29bfe" />
          </div>
        </>
      )}

      {groupe === 'superviseur' && (
        <>
          <div className="m-section-title">🏪 Mon réseau</div>
          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi label="Total PDV" to="/m/pdv" icone="🏪" valeur={fmtN(stats?.total_pdvs)} couleur="#4a9eff" />
            <Kpi label="Actifs" to="/m/pdv?statut=ACTIF" icone="✅" valeur={fmtN(stats?.actifs)} couleur="#22c55e" />
            <Kpi label="Inactifs" to="/m/pdv?statut=INACTIF" icone="⚠️" valeur={fmtN(stats?.inactifs)} couleur="#ff4757" />
            <Kpi label="Récupération" to="/m/pdv?statut=RECUPERATION" icone="♻️" valeur={fmtN(stats?.en_recuperation)} couleur="#ffa502" />
          </div>
        </>
      )}

      {liens.length > 0 && (
        <>
          <div className="m-section-title">⚡ Accès rapides</div>
          <div className="m-tiles">
            {liens.map(t => (
              <Link key={t.to} to={t.to} className="m-tile">
                <span className="m-tile-ico">{t.icon}</span>
                <span className="m-tile-lbl">{t.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
