import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { useHierarchicalFilters, HierarchicalFilters } from '../hooks/useHierarchicalFilters';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import {
  DollarSign, Store, AlertTriangle, TrendingUp, Activity, Users, ChevronLeft, ChevronRight,
  Download, Home, Trophy, BarChart3, TrendingDown, Battery, Zap, Target, Filter
} from 'lucide-react';
import KPICard from '../components/common/KPICard';
import api from '../services/api';
import './DashboardPage.css';
import * as XLSX from 'xlsx';

const MOIS_NOMS = {
  1: 'Janvier', 2: 'Février', 3: 'Mars', 4: 'Avril', 5: 'Mai', 6: 'Juin',
  7: 'Juillet', 8: 'Août', 9: 'Septembre', 10: 'Octobre', 11: 'Novembre', 12: 'Décembre'
};

const ZONE_COLORS = ['#FF6900', '#00d68f', '#3742fa', '#ffa502', '#ff4757', '#a29bfe', '#fd79a8', '#00cec9'];
const OMY_CRITERIA = {
  montant_transaction: { label: 'Montant des opérations', shortLabel: 'Montant Opérations', key: 'ca' },
  montant_ca: { label: 'Montant CA', shortLabel: 'Montant CA', key: 'montant_ca' },
  commission_pdg: { label: 'Commission PDG', shortLabel: 'Commission PDG', key: 'commission_pdg' },
};

const getMetricValue = (item, criterion = 'montant_transaction') => {
  if (!item) return 0;
  if (criterion === 'montant_transaction') return item.montant_transaction ?? item.ca ?? 0;
  if (criterion === 'montant_ca') return item.montant_ca ?? 0;
  if (criterion === 'commission_pdg') return item.commission_pdg ?? 0;
  return 0;
};

const getMetricLabel = (criterion = 'montant_transaction') => OMY_CRITERIA[criterion]?.shortLabel || 'Valeur';

function formatCA(value) {
  if (!value || isNaN(value)) return '0 FCFA';
  return new Intl.NumberFormat('en-US').format(Math.round(value)).replace(/,/g, ' ') + ' FCFA';
}

function getAlertLevel(value, type = 'inactif') {
  if (type === 'inactif') {
    if (value >= 3) return { level: 'CRITIQUE', color: '#ff4757', bg: 'rgba(255,71,87,0.1)' };
    if (value === 2) return { level: 'HAUTE', color: '#ffa502', bg: 'rgba(255,165,2,0.1)' };
    return { level: 'NORMALE', color: '#999', bg: 'rgba(153,153,153,0.1)' };
  }
  if (type === 'baisse') {
    if (value > 30) return { level: 'CRITIQUE', color: '#ff4757', bg: 'rgba(255,71,87,0.1)' };
    if (value > 15) return { level: 'HAUTE', color: '#ffa502', bg: 'rgba(255,165,2,0.1)' };
    return { level: 'NORMALE', color: '#999', bg: 'rgba(153,153,153,0.1)' };
  }
  return { level: 'NORMAL', color: '#999', bg: 'rgba(153,153,153,0.1)' };
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color || '#FF6900', fontWeight: 700, fontSize: 13 }}>
            {formatCA(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ============ Composant Accordéon réutilisable ============
function AccordionSection({ title, defaultOpen = true, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: open ? 'rgba(255,105,0,0.08)' : 'rgba(255,255,255,0.03)',
        border: 'none', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 700,
        transition: 'background 0.2s',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {title}
          {badge && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,105,0,0.2)', color: '#FF6900' }}>{badge}</span>}
        </span>
        <span style={{ fontSize: 18, transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', color: '#FF6900' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '20px 20px 4px 20px', background: 'rgba(255,255,255,0.01)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

const GRAPH_INDICATEURS = [
  { key: 'montant_transaction', label: 'Montant Transactions' },
  { key: 'montant_ca',          label: 'Montant CA' },
  { key: 'commission_pdg',      label: 'Commission PDG' },
];

// ============ TAB 1: Vue d'ensemble ============
function TabOverview({ annee, mois }) {
  const [graphIndicateur, setGraphIndicateur] = useState('montant_transaction');

  const { data: dashboard, isLoading } = useQuery(
    ['dashboard-monthly', annee, mois],
    () => api.get(`/dashboard/monthly?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000 }
  );
  const { data: stats } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 300000 });

  const totalMontantTransaction = dashboard?.total_montant_transaction || dashboard?.total_ca || 0;
  const totalMontantCA          = dashboard?.total_montant_ca || 0;
  const totalCommissionPDG      = dashboard?.total_commission_pdg || 0;
  const totalCommissionRevendeur = dashboard?.total_commission_revendeur || 0;
  const ratioCaTransaction      = dashboard?.ratio_ca_transaction || 0;
  const pdvsFaibleCA            = dashboard?.pdvs_faible_ca || 0;
  const activePDVs   = dashboard?.active_pdvs || 0;
  const inactivePDVs = dashboard?.inactive_pdvs || 0;
  const totalPDVs    = dashboard?.total_pdvs || stats?.total_pdvs || 0;
  const taux         = dashboard?.taux_activite || 0;
  const caaCumule    = dashboard?.ca_cumule || 0;
  const avgCA        = dashboard?.average_ca || (totalPDVs > 0 ? totalMontantTransaction / totalPDVs : 0);
  const avgVariation = dashboard?.avg_variation || 0;
  const totalOps     = dashboard?.total_operations || 0;
  const totalDepots  = dashboard?.total_depots || 0;
  const totalRetraits = dashboard?.total_retraits || 0;
  const montantDepots  = dashboard?.montant_depots || 0;
  const montantRetraits = dashboard?.montant_retraits || 0;
  // compatibilité graphiques
  const totalCA = totalMontantTransaction;

  // Données selon l'indicateur sélectionné
  const getZoneData = () => {
    if (graphIndicateur === 'montant_ca') return dashboard?.montant_ca_by_zone || dashboard?.ca_by_zone || {};
    if (graphIndicateur === 'commission_pdg') return dashboard?.commission_pdg_by_zone || {};
    return dashboard?.ca_by_zone || {};
  };
  const getSupData = () => {
    if (graphIndicateur === 'montant_ca') return dashboard?.montant_ca_by_superviseur || dashboard?.ca_by_superviseur || {};
    if (graphIndicateur === 'commission_pdg') return dashboard?.commission_pdg_by_superviseur || {};
    return dashboard?.ca_by_superviseur || {};
  };
  const getGestData = () => {
    if (graphIndicateur === 'montant_ca') return dashboard?.montant_ca_by_gestionnaire || dashboard?.ca_by_gestionnaire || {};
    if (graphIndicateur === 'commission_pdg') return dashboard?.commission_pdg_by_gestionnaire || {};
    return dashboard?.ca_by_gestionnaire || {};
  };

  const getTypeData = () => {
    if (graphIndicateur === 'montant_ca') return dashboard?.montant_ca_by_type || dashboard?.ca_by_type || {};
    if (graphIndicateur === 'commission_pdg') return dashboard?.commission_pdg_by_type || {};
    return dashboard?.ca_by_type || {};
  };

  const caByZone = Object.entries(getZoneData()).map(([zone, ca]) => ({ zone: zone.replace('Bamako ', 'Bko '), ca })).sort((a, b) => b.ca - a.ca);
  const caBySup = Object.entries(getSupData()).map(([sup, ca]) => ({ sup, ca })).sort((a, b) => b.ca - a.ca).slice(0, 8);
  const caByGest = Object.entries(getGestData()).map(([gest, ca]) => ({ gest, ca })).sort((a, b) => b.ca - a.ca).slice(0, 6);
  const caByType = Object.entries(getTypeData()).map(([type, ca]) => ({ type, ca }));

  return (
    <div>

      {/* ══ GROUPE 1 : Volumes Financiers + Commissions ══ */}
      <AccordionSection title="💰 Volumes Financiers & 🏆 Commissions Orange" defaultOpen={true} badge={`${MOIS_NOMS[mois]} ${annee}`}>
        <div className="kpi-section-title" style={{ fontSize: 12, color: '#FF6900', marginBottom: 8 }}>💰 Volumes Financiers</div>
        <div className="grid-3-kpi mb-24">
          <KPICard title="Montant Transaction" formatted={formatCA(totalMontantTransaction)} icon={DollarSign} color="#FF6900" loading={isLoading} subtitle={`${MOIS_NOMS[mois]} ${annee} · Dépôts + Retraits`} />
          <KPICard title="Montant CA" formatted={formatCA(totalMontantCA)} icon={DollarSign} color="#00d68f" loading={isLoading} subtitle={`${ratioCaTransaction.toFixed(1)}% du volume transaction`} />
          <KPICard title="Moy. Transaction / PDV" formatted={formatCA(avgCA)} icon={DollarSign} color="#ffa502" loading={isLoading} subtitle={`Sur ${totalPDVs} PDVs`} />
        </div>

        <div className="kpi-section-title" style={{ fontSize: 12, color: '#a29bfe', marginBottom: 8 }}>🏆 Commissions Orange</div>
        <div className="grid-3-kpi mb-8">
          <KPICard title="Commission PDG" formatted={formatCA(totalCommissionPDG)} icon={DollarSign} color="#a29bfe" loading={isLoading} subtitle="Part réseau Orange (votre part)" />
          <KPICard title="Commission Revendeur" formatted={formatCA(totalCommissionRevendeur)} icon={DollarSign} color="#fd79a8" loading={isLoading} subtitle="Part PDV Orange" />
          <KPICard title="Ratio CA / Transaction" formatted={`${ratioCaTransaction.toFixed(1)}%`} icon={Activity} color={ratioCaTransaction >= 10 ? '#00d68f' : ratioCaTransaction >= 5 ? '#ffa502' : '#ff4757'} loading={isLoading} subtitle="Qualité des operations (plus = mieux)" />
        </div>
      </AccordionSection>

      {/* ══ GROUPE 2 : Activité Réseau + Dépôts & Retraits ══ */}
      <AccordionSection title="📊 Activité du Réseau & 🔄 Dépôts et Retraits" defaultOpen={true}>
        <div className="kpi-section-title" style={{ fontSize: 12, color: '#00d68f', marginBottom: 8 }}>📊 Activité du Réseau</div>
        <div className="grid-3-kpi mb-24">
          <KPICard title="PDVs Actifs" value={activePDVs} icon={Store} color="#00d68f" loading={isLoading} subtitle={`${taux.toFixed(1)}% du réseau · Objectif 75%`} />
          <KPICard title="PDVs Inactifs" value={inactivePDVs} icon={AlertTriangle} color="#ff4757" loading={isLoading} subtitle={`${(100 - taux).toFixed(1)}% du réseau`} />
          <KPICard title="Total Opérations" value={totalOps} icon={Activity} color="#3742fa" loading={isLoading} subtitle={`${totalDepots} dépôts · ${totalRetraits} retraits`} />
        </div>

        <div className="kpi-section-title" style={{ fontSize: 12, color: '#00cec9', marginBottom: 8 }}>🔄 Dépôts et Retraits</div>
        <div className="grid-4 mb-8">
          <KPICard title="Montant Dépôts" formatted={formatCA(montantDepots)} icon={TrendingUp} color="#00d68f" loading={isLoading} subtitle={`${totalDepots} opérations`} />
          <KPICard title="Montant Retraits" formatted={formatCA(montantRetraits)} icon={TrendingDown} color="#fd79a8" loading={isLoading} subtitle={`${totalRetraits} opérations`} />
          <KPICard title="Variation Moy." formatted={`${avgVariation >= 0 ? '+' : ''}${avgVariation.toFixed(1)}%`} icon={TrendingUp} color={avgVariation >= 0 ? '#00d68f' : '#ff4757'} loading={isLoading} subtitle="vs mois précédent" />
          <KPICard title="PDVs Faible CA" value={pdvsFaibleCA} icon={AlertTriangle} color="#ffa502" loading={isLoading} subtitle="Peu de retraits vs dépôts" />
        </div>
      </AccordionSection>

      {/* ══ GROUPE 3 : Graphiques ══ */}
      <AccordionSection title="📈 Graphiques & Classements" defaultOpen={true}>
        {/* Boutons sélecteur d'indicateur */}
        <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>Indicateur :</span>
          {GRAPH_INDICATEURS.map(ind => (
            <button key={ind.key} onClick={() => setGraphIndicateur(ind.key)}
              style={{ padding:'5px 14px', borderRadius:8, border:'1px solid var(--border)', fontSize:12, fontWeight:600, cursor:'pointer',
                background: graphIndicateur === ind.key ? '#FF6900' : 'rgba(255,255,255,0.06)',
                color: graphIndicateur === ind.key ? '#fff' : 'var(--text-secondary)',
                transition:'all 0.2s' }}>
              {ind.label}
            </button>
          ))}
        </div>

        <div className="charts-row mb-24">
          <div className="chart-card chart-large">
            <div className="chart-header"><h3>{GRAPH_INDICATEURS.find(i=>i.key===graphIndicateur)?.label} par Zone</h3><span className="badge badge-orange">{MOIS_NOMS[mois]} {annee}</span></div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={caByZone} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="zone" tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatCA(v)} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ca" radius={[6,6,0,0]} fill="url(#barGradient)">
                  {caByZone.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card chart-small">
            <div className="chart-header"><h3>Types PDV</h3></div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={caByType.length ? caByType : Object.entries(stats?.pdvs_par_type || {}).map(([k,v])=>({name:k,value:v}))} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey={caByType.length ? "ca" : "value"} nameKey={caByType.length ? "type" : "name"} paddingAngle={3}>
                  {(caByType.length ? caByType : Object.keys(stats?.pdvs_par_type || {})).map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 10 }} formatter={v => formatCA(v)} />
                <Legend iconSize={10} iconType="circle" formatter={v => <span style={{ color: '#ccc', fontSize: 12 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="charts-row mb-24">
          <div className="chart-card chart-large">
            <div className="chart-header"><h3>{GRAPH_INDICATEURS.find(i=>i.key===graphIndicateur)?.label} par Superviseur</h3><span className="badge badge-orange">{MOIS_NOMS[mois]} {annee}</span></div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={caBySup} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatCA(v)} />
                <YAxis type="category" dataKey="sup" tick={{ fill: '#ccc', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ca" fill="#FF6900" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card chart-small">
            <div className="chart-header"><h3>CA par Gestionnaire</h3></div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={caByGest} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatCA(v)} />
                <YAxis type="category" dataKey="gest" tick={{ fill: '#ccc', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ca" fill="#a29bfe" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {dashboard?.classement_superviseurs && dashboard.classement_superviseurs.length > 0 && (() => {
          // Trier le classement selon l'indicateur sélectionné
          const supIndicData = graphIndicateur === 'montant_ca'
            ? dashboard?.montant_ca_by_superviseur || {}
            : graphIndicateur === 'commission_pdg'
            ? dashboard?.commission_pdg_by_superviseur || {}
            : null; // null = utiliser ca_total par défaut

          const classement = supIndicData
            ? [...dashboard.classement_superviseurs]
                .map(s => ({ ...s, valeur_indic: supIndicData[s.superviseur] || 0 }))
                .sort((a, b) => b.valeur_indic - a.valeur_indic)
            : dashboard.classement_superviseurs;

          const indLabel = GRAPH_INDICATEURS.find(i => i.key === graphIndicateur)?.label || 'Montant Transactions';

          return (
            <div className="card mb-16">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🏆 Classement Superviseurs par {indLabel} — {MOIS_NOMS[mois]} {annee}</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>#</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Superviseur</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#00d68f' }}>Actifs</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#ff4757' }}>Inactifs</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#FF6900' }}>{indLabel}</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#8a8a9a' }}>Moy./PDV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classement.map((s, i) => {
                      const valeur = supIndicData ? (s.valeur_indic || 0) : (s.ca_total ?? s.ca ?? 0);
                      const nb = s.nb_pdvs || 1;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: i < 3 ? '#FF6900' : '#aaa' }}>{i + 1}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.superviseur}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#00d68f' }}>{s.actifs ?? s.nb_pdvs ?? '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#ff4757' }}>{s.inactifs ?? '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#FF6900' }}>{formatCA(valeur)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#aaa' }}>{formatCA(valeur / nb)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </AccordionSection>

    </div>
  );
}

// ============ TAB 2: Suivi des Top ============
function TabTopPDVs({ annee, mois, criterion }) {
  const [topN, setTopN] = useState(20);
  const [selectedPDV, setSelectedPDV] = useState(null);
  const [selectedPDVNom, setSelectedPDVNom] = useState('');
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const { data: topPDVs, isLoading } = useQuery(
    ['classements', annee, mois, topN],
    () => api.get(`/dashboard/classements?annee=${annee}&mois=${mois}&n=${topN}`).then(r => r.data),
    { staleTime: 300000 }
  );

  const getTopListByCriterion = () => {
    if (!topPDVs) return [];
    if (topPDVs.top_pdvs_ca) {
      if (criterion === 'montant_ca') return topPDVs.top_pdvs_ca || [];
      if (criterion === 'commission_pdg') {
        return [...(topPDVs.top_pdvs_ca || [])]
          .sort((a, b) => (b.commission_pdg || 0) - (a.commission_pdg || 0))
          .slice(0, topN);
      }
      return [...(topPDVs.top_pdvs_ca || [])]
        .sort((a, b) => (b.montant_transaction ?? 0) - (a.montant_transaction ?? 0))
        .slice(0, topN);
    }
    if (criterion === 'montant_transaction') return topPDVs.classement_operations || [];
    if (criterion === 'montant_ca') return topPDVs.classement_ca || [];
    return [...(topPDVs.classement_ca || [])]
      .sort((a, b) => (b.commission_pdg || 0) - (a.commission_pdg || 0))
      .slice(0, topN);
  };

  const loadHistory = async (pdvId, pdvNom) => {
    if (!pdvId) return;
    if (selectedPDV === pdvId) { setSelectedPDV(null); setHistoryData([]); return; }
    setLoadingHistory(true);
    setHistoryData([]);
    try {
      const res = await api.get(`/dashboard/pdv-monthly-history/${pdvId}`);
      const histo = res.data?.historique || res.data?.historique_mensuel || [];
      const sorted = [...histo].sort((a, b) => (a.annee * 100 + a.mois) - (b.annee * 100 + b.mois));
      const MOIS_ABR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      const formatted = sorted.map(h => ({
        mois: MOIS_ABR[(h.mois - 1)] || `M${h.mois}`,
        metric: getMetricValue({
          metric: getMetricValue({ ca: h.ca, montant_transaction: h.montant_transaction, montant_ca: h.montant_ca, commission_pdg: h.commission_pdg }, criterion),
          montant_ca: h.montant_ca || 0,
          commission_pdg: h.commission_pdg || 0,
        }, criterion),
      }));
      setHistoryData(formatted);
      setSelectedPDV(pdvId);
      setSelectedPDVNom(pdvNom);
    } catch (e) {
      console.error('Erreur chargement historique:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const exportExcel = () => {
    const selectedList = getTopListByCriterion();
    if (!selectedList.length) return;
    const data = selectedList.map((pdv, idx) => ({
      'Rang': idx + 1,
      'PDV': pdv.nom,
      'Numéro': pdv.numero_pdv,
      [getMetricLabel(criterion)]: getMetricValue(pdv, criterion),
      'Quartier': pdv.quartier,
      'Superviseur': pdv.superviseur,
      'Gestionnaire': pdv.gestionnaire || '-',
      'Médaille': pdv.medaille,
      'Opérations': pdv.nb_operations,
      'Variation %': pdv.taux_variation?.toFixed(2) + '%'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Top PDVs');
    XLSX.writeFile(wb, `top-pdvs-${annee}-${mois}.xlsx`);
  };

  const pdvList = getTopListByCriterion();

  return (
    <div>
      <div className="card mb-16" style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8, fontWeight: 600 }}>
            Afficher le Top : <span style={{ color: 'var(--primary)', fontWeight: 800 }}>Top {topN}</span>
          </label>
          <input
            type="range"
            min="10"
            max="50"
            step="10"
            value={topN}
            onChange={e => setTopN(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--primary)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555', marginTop: 4 }}>
            <span>Top 10</span><span>Top 20</span><span>Top 30</span><span>Top 40</span><span>Top 50</span>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Excel
        </button>
      </div>

      {selectedPDV && historyData.length > 0 && (
        <div style={{ marginBottom: 20, padding: 20, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid rgba(255,105,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>📈 Évolution mensuelle — {selectedPDVNom}</h3>
              <p style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>CA réalisé mois par mois — {annee}</p>
            </div>
            <button onClick={() => { setSelectedPDV(null); setHistoryData([]); }}
              style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 18, borderRadius: 8, width: 32, height: 32 }}>✕</button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="mois" tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 11 }} tickFormatter={v => formatCA(v)} width={80} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="metric" stroke="#FF6900" fill="rgba(255,105,0,0.15)" strokeWidth={2.5} dot={{ r: 4, fill: '#FF6900' }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Rang</th><th>PDV</th><th>CA</th><th>Gérant</th><th>Quartier</th><th>Superviseur</th><th>Gestionnaire</th><th>Médaille</th><th>Evolution</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#8a8a9a' }}>Chargement...</td></tr>
            ) : pdvList.slice(0, topN).map((pdv, idx) => {
              const medal = pdv.medaille || '';
              const medalColor = medal === 'OR' ? '#FFD700' : medal === 'ARGENT' ? '#C0C0C0' : medal === 'BRONZE' ? '#CD7F32' : '#999';
              const medalIcon = medal === 'OR' ? '🥇' : medal === 'ARGENT' ? '🥈' : medal === 'BRONZE' ? '🥉' : '';
              return (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: selectedPDV === pdv.pdv_id ? 'rgba(255,105,0,0.05)' : 'transparent' }}>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: idx < 3 ? '#FF6900' : '#aaa' }}>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pdv.numero_pdv}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.nom}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: '#FF6900' }}>{formatCA(getMetricValue(pdv, criterion))}</td>
                  <td style={{ color: '#ccc' }}>{pdv.nom_gerant || '—'}</td>
                  <td style={{ color: '#ccc' }}>{pdv.quartier || '—'}</td>
                  <td style={{ color: '#ccc' }}>{pdv.superviseur || '—'}</td>
                  <td style={{ color: '#ccc' }}>{pdv.gestionnaire || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {medalIcon ? <span style={{ color: medalColor, fontWeight: 700, fontSize: 16 }}>{medalIcon}</span> : <span style={{ color: '#555' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      style={{ cursor: 'pointer', background: selectedPDV === pdv.pdv_id ? 'rgba(255,105,0,0.3)' : 'rgba(255,105,0,0.1)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 6, color: '#FF6900', padding: '5px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                      onClick={() => loadHistory(pdv.pdv_id, pdv.nom)}>
                      {loadingHistory && selectedPDV === pdv.pdv_id ? '⏳' : '📊'} {selectedPDV === pdv.pdv_id ? 'Fermer' : 'Voir'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ============ TAB 3: Rapport Pareto ============
function TabPareto({ annee, mois, criterion }) {
  const [sortBy, setSortBy] = useState('rang');

  const { data: pareto, isLoading } = useQuery(
    ['pareto', annee, mois],
    () => api.get(`/dashboard/pareto?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000 }
  );

  const { data: stats } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 300000 });

  const allPDVs = [...(pareto?.pareto_pdvs || [])].sort((a, b) => getMetricValue(b, criterion) - getMetricValue(a, criterion));
  const { zoneFilter, setZoneFilter, supFilter, setSupFilter, zoneList, supList, hasFilters, resetFilters } = useHierarchicalFilters(allPDVs);

  const exportExcel = () => {
    if (!pareto?.pareto_pdvs) return;
    const data = pareto.pareto_pdvs.map((pdv, idx) => ({
      'Rang': idx + 1,
      'PDV Numéro': pdv.numero_pdv,
      'PDV Nom': pdv.nom,
      'Zone': pdv.zone,
      'Superviseur': pdv.superviseur,
      [getMetricLabel(criterion)]: getMetricValue(pdv, criterion),
      '% contribution': getPctByCriterion(pdv).toFixed(2) + '%',
      'Cumul %': pdv.cumul_pct?.toFixed(2) + '%',
      'Impact': pdv.dans_pareto ? 'Fort' : 'Faible'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pareto');
    XLSX.writeFile(wb, `pareto-${annee}-${mois}.xlsx`);
  };

  const getPctByCriterion = (pdv) => {
    if (criterion === 'montant_ca') return pdv.pct_montant_ca ?? pdv.pct_ca ?? 0;
    if (criterion === 'commission_pdg') return pdv.pct_commission_pdg ?? 0;
    return pdv.pct_montant_transaction ?? pdv.pct_ca ?? 0;
  };

  const filteredPDVs = allPDVs.filter(p =>
    (!zoneFilter || p.zone === zoneFilter) &&
    (!supFilter || p.superviseur === supFilter)
  );

  const fortImpact = filteredPDVs.filter(p => p.dans_pareto).reduce((sum, p) => sum + getMetricValue(p, criterion), 0);
  const faibleImpact = filteredPDVs.filter(p => !p.dans_pareto).reduce((sum, p) => sum + getMetricValue(p, criterion), 0);

  return (
    <div>
      <div className="grid-2 mb-24">
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, rgba(255,105,0,0.1), rgba(255,105,0,0.05))', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Fort Impact (Pareto)</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#FF6900' }}>{formatCA(fortImpact)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>PDVs avec forte contribution</div>
        </div>
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, rgba(100,200,200,0.1), rgba(100,200,200,0.05))', border: '1px solid rgba(100,200,200,0.2)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Faible Impact</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#00cec9' }}>{formatCA(faibleImpact)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>Gini: {pareto?.gini_coefficient?.toFixed(3)}</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={16} style={{ color: '#8a8a9a' }} />
        <HierarchicalFilters
          zoneFilter={zoneFilter} setZoneFilter={setZoneFilter}
          supFilter={supFilter} setSupFilter={setSupFilter}
          zoneList={zoneList} supList={supList}
          hasFilters={hasFilters} resetFilters={resetFilters}
        />
        <button className="btn btn-ghost" onClick={exportExcel} style={{ marginLeft: 'auto' }}>
          <Download size={14} /> Excel
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Rang</th><th>PDV</th><th>Zone</th><th>Superviseur</th><th>{getMetricLabel(criterion)}</th><th>% {getMetricLabel(criterion)}</th><th>Cumul %</th><th>Impact</th>
            </tr>
          </thead>
          <tbody>
            {filteredPDVs.map((pdv, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{pdv.numero_pdv}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.nom}</div>
                </td>
                <td>{pdv.zone}</td>
                <td>{pdv.superviseur}</td>
                <td><strong style={{ color: 'var(--primary)' }}>{formatCA(getMetricValue(pdv, criterion))}</strong></td>
                <td>{getPctByCriterion(pdv).toFixed(2)}%</td>
                <td style={{ fontWeight: 700 }}>{pdv.cumul_pct?.toFixed(2)}%</td>
                <td>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: pdv.dans_pareto ? 'rgba(255,105,0,0.2)' : 'rgba(100,200,200,0.2)',
                    color: pdv.dans_pareto ? '#FF6900' : '#00cec9'
                  }}>
                    {pdv.dans_pareto ? '💪 Fort' : '📉 Faible'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ TAB 4: Evolution ============
function TabEvolution({ annee, mois, criterion }) {
  const [compareAnnee, setCompareAnnee] = useState(annee);
  const [compareMois, setCompareMois] = useState(mois);
  const [activeSub, setActiveSub] = useState('pdvs');

  const prevMonth = () => {
    if (compareMois === 1) { setCompareMois(12); setCompareAnnee(a => a - 1); }
    else setCompareMois(m => m - 1);
  };

  const nextMonth = () => {
    if (compareMois === 12) { setCompareMois(1); setCompareAnnee(a => a + 1); }
    else setCompareMois(m => m + 1);
  };

  const { data: evolution, isLoading } = useQuery(
    ['evolution', annee, mois],
    () => api.get(`/dashboard/monthly-evolution?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000 }
  );

  const totalActuel = getMetricValue({
    ca: evolution?.total_ca_actuel,
    montant_ca: evolution?.total_montant_ca_actuel,
    commission_pdg: evolution?.total_commission_pdg_actuel,
  }, criterion);
  const totalPrecedent = getMetricValue({
    ca: evolution?.total_ca_precedent,
    montant_ca: evolution?.total_montant_ca_precedent,
    commission_pdg: evolution?.total_commission_pdg_precedent,
  }, criterion);
  const totalVariation = totalActuel - totalPrecedent;
  const totalTaux = totalPrecedent > 0 ? ((totalVariation / totalPrecedent) * 100) : 0;

  const prevMois = mois === 1 ? 12 : mois - 1;
  const prevAnnee = mois === 1 ? annee - 1 : annee;

  const toMetricEvolution = (row, labelKey) => {
    const actuel = getMetricValue({
      ca: row.ca_actuel,
      montant_ca: row.montant_ca_actuel,
      commission_pdg: row.commission_pdg_actuel,
    }, criterion);
    const precedent = getMetricValue({
      ca: row.ca_precedent,
      montant_ca: row.montant_ca_precedent,
      commission_pdg: row.commission_pdg_precedent,
    }, criterion);
    const variation = actuel - precedent;
    const taux = precedent > 0 ? Math.round((variation / precedent) * 100) : 0;
    return {
      nom: row[labelKey] || row.nom || '—',
      numero_pdv: row.numero_pdv || row.numero_personnel || '',
      actuel,
      precedent,
      variation,
      taux,
    };
  };

  const getPDVData = () => (evolution?.par_pdv || []).map(p => toMetricEvolution(p, 'nom'));
  const getSuperviseurData = () => (evolution?.par_superviseur || []).map(s => toMetricEvolution(s, 'superviseur'));
  const getGestionnaireData = () => (evolution?.par_gestionnaire || []).map(g => toMetricEvolution(g, 'gestionnaire'));

  const dataToShow = activeSub === 'pdvs' ? getPDVData() : activeSub === 'superviseurs' ? getSuperviseurData() : getGestionnaireData();

  const exportExcel = () => {
    const data = dataToShow.map((row, idx) => ({
      'Rang': idx + 1,
      'Nom': row.nom,
      [`${getMetricLabel(criterion)} Actuel`]: row.actuel,
      [`${getMetricLabel(criterion)} Précédent`]: row.precedent,
      'Variation': row.variation,
      'Taux %': row.taux.toFixed(2) + '%'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Evolution');
    XLSX.writeFile(wb, `evolution-${activeSub}-${annee}-${mois}.xlsx`);
  };

  return (
    <div>
      <div className="grid-4 mb-24">
        <KPICard title={`${getMetricLabel(criterion)} ${MOIS_NOMS[mois]} ${annee}`} formatted={formatCA(totalActuel || 0)} icon={DollarSign} color="#00d68f" subtitle="Mois actuel" />
        <KPICard title={`${getMetricLabel(criterion)} ${MOIS_NOMS[prevMois]} ${prevAnnee}`} formatted={formatCA(totalPrecedent || 0)} icon={TrendingUp} color="#ffa502" subtitle="Mois précédent" />
        <KPICard title="Variation" formatted={(totalVariation >= 0 ? '+' : '') + formatCA(totalVariation)} icon={TrendingUp} color={totalVariation >= 0 ? '#00d68f' : '#ff4757'} />
        <KPICard title="Taux Global" formatted={`${totalTaux >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(totalTaux))}%`} icon={Activity} color={totalTaux >= 0 ? '#00d68f' : '#ff4757'} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="tabs-container">
          {['PDVs', 'Superviseurs', 'Gestionnaires'].map((label, idx) => (
            <button
              key={idx}
              className={`tab-btn ${activeSub === ['pdvs', 'superviseurs', 'gestionnaires'][idx] ? 'active' : ''}`}
              onClick={() => setActiveSub(['pdvs', 'superviseurs', 'gestionnaires'][idx])}
            >
              {label}
            </button>
          ))}
          <button className="btn btn-ghost" onClick={exportExcel} style={{ marginLeft: 'auto' }}>
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Rang</th><th>Nom</th>
              <th style={{ color: '#00d68f' }}>{getMetricLabel(criterion)} {MOIS_NOMS[mois]} {annee}</th>
              <th style={{ color: '#ffa502' }}>{getMetricLabel(criterion)} {MOIS_NOMS[prevMois]} {prevAnnee}</th>
              <th>Variation</th><th>Taux</th>
            </tr>
          </thead>
          <tbody>
            {dataToShow.map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                <td>
                  {activeSub === 'pdvs' && row.numero_pdv ? (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{row.numero_pdv}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.nom}</div>
                    </>
                  ) : (
                    <strong>{row.nom}</strong>
                  )}
                </td>
                <td>{formatCA(row.actuel)}</td>
                <td>{formatCA(row.precedent)}</td>
                <td style={{ color: row.variation >= 0 ? '#00d68f' : '#ff4757', fontWeight: 600 }}>
                  {row.variation >= 0 ? '+' : ''}{formatCA(row.variation)}
                </td>
                <td style={{ color: row.taux >= 0 ? '#00d68f' : '#ff4757', fontWeight: 600 }}>
                  <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, background: row.taux >= 0 ? 'rgba(0,214,143,0.15)' : 'rgba(255,71,87,0.15)' }}>
                    {row.taux >= 0 ? '▲' : '▼'} {Math.abs(Math.round(row.taux))}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ TAB 5: PDV Inactifs ============
function TabInactivePDVs({ annee, mois, criterion }) {
  const { data: inactifs, isLoading } = useQuery(
    ['inactifs', annee, mois],
    () => api.get(`/dashboard/monthly-inactive?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000 }
  );

  const exportExcel = () => {
    if (!inactifs?.pdvs) return;
    const data = inactifs.pdvs.map((pdv, idx) => ({
      'Rang': idx + 1,
      'PDV': pdv.nom,
      'Numéro Personnel': pdv.numero_personnel,
      'Superviseur': pdv.superviseur,
      'Zone': pdv.zone,
      'Sous-zone': pdv.sous_zone,
      'Téléconseillère': pdv.teleconseillere,
      [getMetricLabel(criterion)]: getMetricValue(pdv, criterion),
      'Nb Mois Inactif': pdv.nb_mois_consecutifs_inactif,
      'Alerte': pdv.alerte
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inactifs');
    XLSX.writeFile(wb, `inactifs-${annee}-${mois}.xlsx`);
  };

  const critique = (inactifs?.pdvs || []).filter(p => p.nb_mois_consecutifs_inactif >= 3).length;
  const haute = (inactifs?.pdvs || []).filter(p => p.nb_mois_consecutifs_inactif === 2).length;
  const normale = (inactifs?.pdvs || []).filter(p => p.nb_mois_consecutifs_inactif === 1).length;

  return (
    <div>
      <div className="grid-4 mb-24">
        <KPICard title="Total Inactifs" value={inactifs?.count || 0} icon={AlertTriangle} color="#ff4757" />
        <KPICard title="Critique (≥3m)" value={critique} icon={AlertTriangle} color="#ff4757" />
        <KPICard title="Haute (2m)" value={haute} icon={AlertTriangle} color="#ffa502" />
        <KPICard title="Normale (1m)" value={normale} icon={AlertTriangle} color="#999" />
      </div>

      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={exportExcel}>
          <Download size={14} /> Excel
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>PDV</th><th>Numéro</th><th>Superviseur</th><th>Zone</th><th>Sous-zone</th><th>Téléconseillère</th><th>{getMetricLabel(criterion)}</th><th>Alerte</th><th>Mois</th>
            </tr>
          </thead>
          <tbody>
            {inactifs?.pdvs?.map((pdv, idx) => {
              const alertLevel = getAlertLevel(pdv.nb_mois_consecutifs_inactif, 'inactif');
              return (
                <tr key={idx}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pdv.numero_personnel || pdv.numero_pdv}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.nom}</div>
                  </td>
                  <td>{pdv.superviseur}</td>
                  <td>{pdv.zone}</td>
                  <td>{pdv.sous_zone}</td>
                  <td>{pdv.teleconseillere}</td>
                  <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatCA(getMetricValue(pdv, criterion))}</td>
                  <td>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: alertLevel.bg,
                      color: alertLevel.color
                    }}>
                      {alertLevel.level}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{pdv.nb_mois_consecutifs_inactif} mois</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ TAB 6: PDV en Baisse ============
function TabDecliningPDVs({ annee, mois, criterion }) {
  const [seuil, setSeuil] = useState(-10);

  const { data: declining, isLoading } = useQuery(
    ['declining', annee, mois, seuil],
    () => api.get(`/dashboard/monthly-declining?annee=${annee}&mois=${mois}&seuil=${seuil}`).then(r => r.data),
    { staleTime: 300000 }
  );

  const exportExcel = () => {
    if (!declining?.pdvs) return;
    const data = declining.pdvs.map((pdv, idx) => ({
      'Rang': idx + 1,
      'PDV': pdv.nom,
      'Numéro': pdv.numero_personnel,
      'Superviseur': pdv.superviseur,
      'Zone': pdv.zone,
      [`${getMetricLabel(criterion)} Actuel`]: getMetricValue(pdv, criterion),
      [`${getMetricLabel(criterion)} Précédent`]: getMetricValue({ ca: pdv.ca_precedent, montant_ca: pdv.montant_ca_precedent, commission_pdg: pdv.commission_pdg_precedent }, criterion),
      'Baisse %': pdv.taux_baisse?.toFixed(2) + '%',
      'Opérations': pdv.nb_operations
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'En Baisse');
    XLSX.writeFile(wb, `baisse-${annee}-${mois}.xlsx`);
  };

  // KPIs basés sur le critère choisi
  const getPrevMetric = (pdv) => getMetricValue({
    ca: pdv.ca_precedent,
    montant_transaction: pdv.montant_transaction_precedent,
    montant_ca: pdv.montant_ca_precedent,
    commission_pdg: pdv.commission_pdg_precedent,
  }, criterion);

  const pdvsAvecBaisseCritere = (declining?.pdvs || []).filter(p => {
    const actuel = getMetricValue(p, criterion);
    const prec = getPrevMetric(p);
    return prec > 0 && actuel < prec;
  });

  const getTauxCritere = (pdv) => {
    const actuel = getMetricValue(pdv, criterion);
    const prec = getPrevMetric(pdv);
    return prec > 0 ? ((actuel - prec) / prec) * 100 : 0;
  };

  const critique = pdvsAvecBaisseCritere.filter(p => getTauxCritere(p) < -30).length;
  const haute = pdvsAvecBaisseCritere.filter(p => getTauxCritere(p) < -15 && getTauxCritere(p) >= -30).length;
  const totalBaisse = pdvsAvecBaisseCritere.length;

  return (
    <div>
      <div className="grid-4 mb-24">
        <KPICard title={`Total en Baisse (${getMetricLabel(criterion)})`} value={totalBaisse} icon={TrendingDown} color="#ff4757" />
        <KPICard title="Critique (>30%)" value={critique} icon={TrendingDown} color="#ff4757" />
        <KPICard title="Haute (>15%)" value={haute} icon={TrendingDown} color="#ffa502" />
        <KPICard title="Seuil" formatted={`${seuil}%`} icon={Filter} color="#999" />
      </div>

      <div className="card mb-16" style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8, fontWeight: 600 }}>
            Seuil de baisse : <span style={{ color: '#ff4757', fontWeight: 800 }}>{Math.abs(seuil)}%</span>
          </label>
          <input
            type="range"
            min="5"
            max="50"
            value={Math.abs(seuil)}
            onChange={e => setSeuil(-parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#ff4757' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginTop: 2 }}>
            <span>5%</span><span>15%</span><span>25%</span><span>35%</span><span>50%</span>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Excel
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>PDV</th><th>Numéro</th><th>Superviseur</th><th>Zone</th><th>{getMetricLabel(criterion)} Actuel</th><th>{getMetricLabel(criterion)} Précédent</th><th>Baisse %</th><th>Alerte</th>
            </tr>
          </thead>
          <tbody>
            {declining?.pdvs?.map((pdv, idx) => {
              const alertLevel = getAlertLevel(Math.abs(pdv.taux_baisse), 'baisse');
              return (
                <tr key={idx}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pdv.numero_personnel || pdv.numero_pdv}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.nom}</div>
                  </td>
                  <td>{pdv.superviseur}</td>
                  <td>{pdv.zone}</td>
                  <td>{formatCA(getMetricValue(pdv, criterion))}</td>
                  <td>{formatCA(getMetricValue({ ca: pdv.ca_precedent, montant_ca: pdv.montant_ca_precedent, commission_pdg: pdv.commission_pdg_precedent }, criterion))}</td>
                  <td style={{ color: '#ff4757', fontWeight: 600 }}>-{Math.abs(pdv.taux_baisse).toFixed(2)}%</td>
                  <td>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: alertLevel.bg,
                      color: alertLevel.color
                    }}>
                      {alertLevel.level}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ TAB 7: Progression ============
function TabProgression({ annee, criterion }) {
  const { data: progression, isLoading } = useQuery(
    ['progression', annee],
    () => api.get(`/dashboard/monthly-progression?annee=${annee}`).then(r => r.data),
    { staleTime: 300000 }
  );

  const [selectedPDV, setSelectedPDV] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const toggleChart = (pdv) => {
    setSelectedPDV(prev => prev?.nom === pdv.nom ? null : pdv);
  };

  const exportExcel = () => {
    if (!progression?.pdvs) return;
    const data = progression.pdvs.map((pdv, idx) => ({
      'Rang': idx + 1,
      'PDV': pdv.nom,
      'Zone': pdv.zone,
      'Superviseur': pdv.superviseur,
      'Top 10': pdv.nb_fois_top10,
      'Top 50': pdv.nb_fois_top50,
      [`${getMetricLabel(criterion)} Max`]: getMetricValue({ ca: pdv.ca_max, montant_ca: pdv.montant_ca_max, commission_pdg: pdv.commission_pdg_max }, criterion),
      [`${getMetricLabel(criterion)} Min`]: getMetricValue({ ca: pdv.ca_min, montant_ca: pdv.montant_ca_min, commission_pdg: pdv.commission_pdg_min }, criterion),
      'Meilleur Mois': pdv.mois_meilleur_ca,
      'Pire Mois': pdv.mois_pire_ca
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Progression');
    XLSX.writeFile(wb, `progression-${annee}.xlsx`);
  };

  const allSortedPDVs = [...(progression?.pdvs || [])].sort((a, b) => {
    const maxA = getMetricValue({ ca: a.ca_max, montant_ca: a.montant_ca_max, commission_pdg: a.commission_pdg_max }, criterion);
    const maxB = getMetricValue({ ca: b.ca_max, montant_ca: b.montant_ca_max, commission_pdg: b.commission_pdg_max }, criterion);
    return maxB - maxA;
  });
  const totalPages = Math.ceil(allSortedPDVs.length / PAGE_SIZE);
  const sortedPDVs = allSortedPDVs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const getChartData = (pdv) => [...(pdv?.historique_mensuel || [])]
    .sort((a, b) => a.annee !== b.annee ? a.annee - b.annee : a.mois - b.mois)
    .map(h => ({
      ...h,
      label: `M${h.mois}`,
      metric: getMetricValue({
        ca: h.ca,
        montant_transaction: h.montant_transaction,
        montant_ca: h.montant_ca,
        commission_pdg: h.commission_pdg,
      }, criterion),
    }));
  const chartData = getChartData(selectedPDV);

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={exportExcel}>
          <Download size={14} /> Excel
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>PDV</th><th>Zone</th><th>Superviseur</th><th>Top 10</th><th>Top 50</th><th>{getMetricLabel(criterion)} Max</th><th>{getMetricLabel(criterion)} Min</th><th>Meilleur</th><th>Pire</th><th>Graphique</th>
            </tr>
          </thead>
          <tbody>
            {sortedPDVs.map((pdv, idx) => (
              <React.Fragment key={idx}>
                <tr style={{ background: selectedPDV?.nom === pdv.nom ? 'rgba(255,105,0,0.06)' : 'transparent' }}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pdv.numero_pdv || pdv.numero_personnel}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.nom}</div>
                  </td>
                  <td>{pdv.zone}</td>
                  <td>{pdv.superviseur}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{pdv.nb_fois_top10 || 0}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{pdv.nb_fois_top50 || 0}</td>
                  <td style={{ color: '#00d68f', fontWeight: 600 }}>{formatCA(getMetricValue({ ca: pdv.ca_max, montant_ca: pdv.montant_ca_max, commission_pdg: pdv.commission_pdg_max }, criterion))}</td>
                  <td style={{ color: '#ff4757', fontWeight: 600 }}>{formatCA(getMetricValue({ ca: pdv.ca_min, montant_ca: pdv.montant_ca_min, commission_pdg: pdv.commission_pdg_min }, criterion))}</td>
                  <td style={{ color: '#00d68f' }}>{pdv.mois_meilleur_ca ? MOIS_NOMS[parseInt(pdv.mois_meilleur_ca.split('-')[1])] || pdv.mois_meilleur_ca : '-'}</td>
                  <td style={{ color: '#ff4757' }}>{pdv.mois_pire_ca ? MOIS_NOMS[parseInt(pdv.mois_pire_ca.split('-')[1])] || pdv.mois_pire_ca : '-'}</td>
                  <td>
                    <span style={{ cursor: 'pointer', color: 'var(--primary)', textDecoration: 'underline' }}
                          onClick={() => toggleChart(pdv)}>
                      {selectedPDV?.nom === pdv.nom ? '✕ Fermer' : '📊 Voir'}
                    </span>
                  </td>
                </tr>
                {selectedPDV?.nom === pdv.nom && getChartData(pdv).length > 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: '16px 12px', background: 'rgba(255,105,0,0.04)', borderTop: '1px solid rgba(255,105,0,0.2)' }}>
                      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                        {/* Infos PDV */}
                        <div style={{ minWidth: 200, flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#FF6900', marginBottom: 12 }}>📊 {pdv.nom}</div>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Zone : <span style={{ color: '#ccc' }}>{pdv.zone}</span></div>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Superviseur : <span style={{ color: '#ccc' }}>{pdv.superviseur}</span></div>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Top 10 : <span style={{ color: '#FFD700', fontWeight: 700 }}>{pdv.nb_fois_top10}x</span></div>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Top 50 : <span style={{ color: '#a29bfe', fontWeight: 700 }}>{pdv.nb_fois_top50}x</span></div>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>{getMetricLabel(criterion)} Max : <span style={{ color: '#00d68f', fontWeight: 700 }}>{formatCA(getMetricValue({ ca: pdv.ca_max, montant_ca: pdv.montant_ca_max, commission_pdg: pdv.commission_pdg_max }, criterion))}</span></div>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>{getMetricLabel(criterion)} Min : <span style={{ color: '#ff4757', fontWeight: 700 }}>{formatCA(getMetricValue({ ca: pdv.ca_min, montant_ca: pdv.montant_ca_min, commission_pdg: pdv.commission_pdg_min }, criterion))}</span></div>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Meilleur : <span style={{ color: '#00d68f', fontWeight: 700 }}>{pdv.mois_meilleur_ca ? MOIS_NOMS[parseInt(pdv.mois_meilleur_ca.split('-')[1])] || pdv.mois_meilleur_ca : '-'}</span></div>
                          <div style={{ fontSize: 12, color: '#8a8a9a' }}>Pire : <span style={{ color: '#ff4757', fontWeight: 700 }}>{pdv.mois_pire_ca ? MOIS_NOMS[parseInt(pdv.mois_pire_ca.split('-')[1])] || pdv.mois_pire_ca : '-'}</span></div>
                        </div>
                        {/* Graphique */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 8 }}>Évolution mensuelle {annee}</div>
                          <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                              <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 10 }} />
                              <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} tickFormatter={v => formatCA(v)} width={70} />
                              <Tooltip content={<CustomTooltip />} />
                              <Area type="monotone" dataKey="metric" stroke="#FF6900" fill="rgba(255,105,0,0.2)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:20, flexWrap:'wrap' }}>
          <button onClick={() => setPage(1)} disabled={page === 1}
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background: page===1?'var(--primary)':'rgba(255,255,255,0.06)', color: page===1?'#fff':'#ccc', cursor: page===1?'default':'pointer', fontSize:12 }}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(255,255,255,0.06)', color:'#ccc', cursor: page===1?'default':'pointer', fontSize:12 }}>‹ Préc.</button>
          <span style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:600 }}>Page {page} / {totalPages} ({allSortedPDVs.length} PDVs)</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(255,255,255,0.06)', color:'#ccc', cursor: page===totalPages?'default':'pointer', fontSize:12 }}>Suiv. ›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background: page===totalPages?'var(--primary)':'rgba(255,255,255,0.06)', color: page===totalPages?'#fff':'#ccc', cursor: page===totalPages?'default':'pointer', fontSize:12 }}>»</button>
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function OMyDashboardPage() {
  const now = new Date();
  const [annee, setAnnee] = useState(2026);
  const [mois, setMois] = useState(4); // Dernier mois avec données
  const [activeTab, setActiveTab] = useState('overview');
  const [criterion, setCriterion] = useState('montant_transaction');

  // Charger le dernier mois disponible
  const { data: lastAvailable } = useQuery(
    'last-available',
    () => api.get('/dashboard/last-available').then(r => r.data),
    { staleTime: 300000 }
  );

  useEffect(() => {
    if (lastAvailable?.last_month) {
      setAnnee(lastAvailable.last_month.annee);
      setMois(lastAvailable.last_month.mois);
    }
  }, [lastAvailable?.last_month?.mois]);

  // Mois disponibles
  const moisDisponibles = lastAvailable?.mois_disponibles || [];
  const isMoisDispo = (a, m) => moisDisponibles.some(d => d.annee === a && d.mois === m);

  const prevMonth = () => {
    const newMois = mois === 1 ? 12 : mois - 1;
    const newAnnee = mois === 1 ? annee - 1 : annee;
    if (isMoisDispo(newAnnee, newMois)) { setMois(newMois); setAnnee(newAnnee); }
  };

  const nextMonth = () => {
    const newMois = mois === 12 ? 1 : mois + 1;
    const newAnnee = mois === 12 ? annee + 1 : annee;
    if (isMoisDispo(newAnnee, newMois)) { setMois(newMois); setAnnee(newAnnee); }
  };

  const canGoPrev = isMoisDispo(mois === 1 ? annee - 1 : annee, mois === 1 ? 12 : mois - 1);
  const canGoNext = isMoisDispo(mois === 12 ? annee + 1 : annee, mois === 12 ? 1 : mois + 1);

  const tabs = [
    { id: 'overview',    label: '🏠 Vue d\'ensemble', icon: Home },
    { id: 'top',         label: '🏆 Suivi des Top',   icon: Trophy },
    { id: 'pareto',      label: '📊 Rapport Pareto',  icon: BarChart3 },
    { id: 'evolution',   label: '📈 Évolution',        icon: TrendingUp },
    { id: 'inactifs',    label: '😴 PDV Inactifs',    icon: Battery },
    { id: 'declining',   label: '📉 PDV en Baisse',   icon: TrendingDown },
    { id: 'progression', label: '🎯 Progression',     icon: Target },
  ];

  return (
    <div className="page dashboard-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 OMY — Dashboard Mensuel</h1>
          <p className="page-subtitle">Performance du réseau OMY</p>
        </div>
        <div className="dash-controls" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {activeTab !== 'overview' && (
            <select
              value={criterion}
              onChange={(e) => setCriterion(e.target.value)}
              className="btn btn-ghost btn-sm"
              style={{ minWidth: 220 }}
            >
              {Object.entries(OMY_CRITERIA).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          )}
          <div className="month-nav">
            <button className="btn btn-ghost btn-sm" onClick={prevMonth} disabled={!canGoPrev} style={{opacity: canGoPrev ? 1 : 0.3, cursor: canGoPrev ? 'pointer' : 'not-allowed'}}><ChevronLeft size={16}/></button>
            <span className="month-label">{MOIS_NOMS[mois]} {annee}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth} disabled={!canGoNext} style={{opacity: canGoNext ? 1 : 0.3, cursor: canGoNext ? 'pointer' : 'not-allowed'}}><ChevronRight size={16}/></button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container mb-24">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && <TabOverview annee={annee} mois={mois} />}
        {activeTab === 'top' && <TabTopPDVs annee={annee} mois={mois} criterion={criterion} />}
        {activeTab === 'pareto' && <TabPareto annee={annee} mois={mois} criterion={criterion} />}
        {activeTab === 'evolution' && <TabEvolution annee={annee} mois={mois} criterion={criterion} />}
        {activeTab === 'inactifs' && <TabInactivePDVs annee={annee} mois={mois} criterion={criterion} />}
        {activeTab === 'declining' && <TabDecliningPDVs annee={annee} mois={mois} criterion={criterion} />}
        {activeTab === 'progression' && <TabProgression annee={annee} criterion={criterion} />}
      </div>
    </div>
  );
}
