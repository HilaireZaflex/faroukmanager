import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
  ChevronLeft, ChevronRight, Download, Home, Trophy, BarChart3,
  TrendingDown, TrendingUp, AlertTriangle, Target, Activity, Users, Zap
} from 'lucide-react';
import KPICard from '../components/common/KPICard';
import api from '../services/api';
import * as XLSX from 'xlsx';
import './WeeklyDashboardPage.css';

const ZONE_COLORS = ['#FF6900', '#00d68f', '#3742fa', '#ffa502', '#ff4757', '#a29bfe', '#fd79a8', '#00cec9'];

function formatCA(value) {
  if (!value || value === 0) return '0 FCFA';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} Md FCFA`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M FCFA`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} K FCFA`;
  return new Intl.NumberFormat('fr-FR').format(Math.round(value)) + ' FCFA';
}

function getAlertInfo(value, type = 'inactif') {
  if (type === 'inactif') {
    if (value >= 3) return { level: 'CRITIQUE', color: '#ff4757', bg: 'rgba(255,71,87,0.1)' };
    if (value === 2) return { level: 'HAUTE', color: '#ffa502', bg: 'rgba(255,165,2,0.1)' };
    return { level: 'NORMALE', color: '#8a8a9a', bg: 'rgba(138,138,154,0.1)' };
  }
  if (type === 'baisse') {
    if (value > 30) return { level: 'CRITIQUE', color: '#ff4757', bg: 'rgba(255,71,87,0.1)' };
    if (value > 15) return { level: 'HAUTE', color: '#ffa502', bg: 'rgba(255,165,2,0.1)' };
    return { level: 'NORMALE', color: '#8a8a9a', bg: 'rgba(138,138,154,0.1)' };
  }
  return { level: 'NORMALE', color: '#8a8a9a', bg: 'rgba(138,138,154,0.1)' };
}

const MEDAL_COLORS = { OR: '#FFD700', ARGENT: '#C0C0C0', BRONZE: '#CD7F32' };

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>{label}</p>
        <p style={{ color: '#FF6900', fontWeight: 700, fontSize: 13 }}>{formatCA(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

// ─── ONGLET 1 : VUE D'ENSEMBLE ───────────────────────────────────────────────
function OngletVueEnsemble({ annee, semaine }) {
  const { data: dash, isLoading } = useQuery(
    ['weekly-overview', annee, semaine],
    () => api.get('/dashboard/weekly', { params: { annee, semaine } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const caByZone = dash?.ca_by_zone
    ? Object.entries(dash.ca_by_zone).map(([zone, ca]) => ({ zone: zone.replace('Bamako ', 'Bko '), ca })).sort((a, b) => b.ca - a.ca)
    : [];
  const caByType = dash?.ca_by_type
    ? Object.entries(dash.ca_by_type).map(([type, ca]) => ({ type, ca }))
    : [];
  const caBySup = dash?.ca_by_superviseur
    ? Object.entries(dash.ca_by_superviseur).map(([sup, ca]) => ({ sup, ca })).sort((a, b) => b.ca - a.ca).slice(0, 8)
    : [];

  const totalTransaction  = dash?.total_montant_transaction || dash?.total_ca || 0;
  const totalCA           = dash?.total_montant_ca || 0;
  const commPDG           = dash?.total_commission_pdg || 0;
  const commRev           = dash?.total_commission_revendeur || 0;
  const ratio             = dash?.ratio_ca_transaction || 0;
  const pdvsFaibleCA      = dash?.pdvs_faible_ca || 0;
  const taux              = dash?.taux_activite || 0;

  return (
    <div>
      {/* ── Section 1 : Volumes Financiers ── */}
      <div className="kpi-section">
        <div className="kpi-section-title">💰 Volumes Financiers</div>
        <div className="grid-3-kpi mb-24">
          <KPICard title="Montant Transaction" formatted={formatCA(totalTransaction)} icon={Activity} color="#FF6900" loading={isLoading} subtitle="Dépôts + Retraits de la semaine" />
          <KPICard title="Montant CA" formatted={formatCA(totalCA)} icon={Activity} color="#00d68f" loading={isLoading} subtitle={`${ratio.toFixed(1)}% du volume transaction`} />
          <KPICard title="Taux Activité" formatted={`${taux.toFixed(1)}%`} icon={Zap} color={taux >= 70 ? '#00d68f' : taux >= 50 ? '#ffa502' : '#ff4757'} loading={isLoading} subtitle="Objectif: 75% du réseau" />
        </div>
      </div>
      {/* ── Section 2 : Commissions Orange ── */}
      <div className="kpi-section">
        <div className="kpi-section-title">🏆 Commissions Orange</div>
        <div className="grid-3-kpi mb-24">
          <KPICard title="Commission PDG" formatted={formatCA(commPDG)} icon={Activity} color="#a29bfe" loading={isLoading} subtitle="Part réseau Orange (votre part)" />
          <KPICard title="Commission Revendeur" formatted={formatCA(commRev)} icon={Activity} color="#fd79a8" loading={isLoading} subtitle="Part PDV Orange" />
          <KPICard title="Ratio CA / Transaction" formatted={`${ratio.toFixed(1)}%`} icon={Zap} color={ratio >= 10 ? '#00d68f' : ratio >= 5 ? '#ffa502' : '#ff4757'} loading={isLoading} subtitle="Qualité des operations" />
        </div>
      </div>
      {/* ── Section 3 : Activite Reseau ── */}
      <div className="kpi-section">
        <div className="kpi-section-title">📊 Activité du Réseau</div>
        <div className="grid-4 mb-24">
          <KPICard title="PDVs Actifs" value={dash?.active_pdvs} icon={Users} color="#00d68f" loading={isLoading} subtitle={`${taux.toFixed(1)}% du réseau`} />
          <KPICard title="Total Opérations" value={dash?.total_operations} icon={Activity} color="#3742fa" loading={isLoading} subtitle={`${dash?.total_depots} dépôts · ${dash?.total_retraits} retraits`} />
          <KPICard title="Variation Moy." formatted={`${(dash?.avg_variation || 0).toFixed(1)}%`} icon={TrendingUp} color="#fd79a8" loading={isLoading} subtitle="vs semaine précédente" />
          <KPICard title="PDVs Faible CA" value={pdvsFaibleCA} icon={AlertTriangle} color="#ffa502" loading={isLoading} subtitle="Peu de retraits vs dépôts" />
        </div>
      </div>

      <div className="grid-2 mb-24">
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>CA par Zone — S{semaine}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={caByZone}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="zone" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatCA(v)} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ca" radius={[6, 6, 0, 0]}>
                {caByZone.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>CA par Superviseur</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={caBySup} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatCA(v)} />
              <YAxis type="category" dataKey="sup" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ca" fill="#FF6900" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Présence par Superviseur</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a', fontWeight: 600 }}>Superviseur</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#00d68f', fontWeight: 600 }}>Actifs</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#ff4757', fontWeight: 600 }}>Inactifs</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#FF6900', fontWeight: 600 }}>CA</th>
                </tr>
              </thead>
              <tbody>
                {dash?.presence_par_superviseur && Object.entries(dash.presence_par_superviseur).map(([sup, d], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{sup}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#00d68f' }}>{d.actifs}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#ff4757' }}>{d.inactifs}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#FF6900' }}>{formatCA(d.ca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Top PDVs Semaine</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>#</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>PDV</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#FF6900' }}>CA</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Var.</th>
                </tr>
              </thead>
              <tbody>
                {(dash?.top_pdvs || []).slice(0, 10).map((pdv, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#FF6900', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{pdv.nom}</div>
                      <div style={{ fontSize: 10, color: '#8a8a9a' }}>{pdv.zone}</div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatCA(pdv.ca)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ color: (pdv.taux_variation || 0) >= 0 ? '#00d68f' : '#ff4757', fontSize: 11 }}>
                        {(pdv.taux_variation || 0) >= 0 ? '▲' : '▼'} {Math.abs(pdv.taux_variation || 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ONGLET 2 : SUIVI DES TOP ─────────────────────────────────────────────────
function OngletSuiviTop({ annee, semaine }) {
  const [topN, setTopN] = useState(20);
  const [selectedPdv, setSelectedPdv] = useState(null);

  const { data: classements, isLoading } = useQuery(
    ['weekly-top', annee, semaine, topN],
    () => api.get('/dashboard/classements-weekly', { params: { annee, semaine, n: topN } })
      .catch(() => api.get('/dashboard/weekly', { params: { annee, semaine } }))
      .then(r => r.data),
    { staleTime: 60000 }
  );

  const { data: weeklyDash } = useQuery(
    ['weekly-dash-top', annee, semaine],
    () => api.get('/dashboard/weekly', { params: { annee, semaine } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const { data: pdvHistory } = useQuery(
    ['pdv-weekly-history', selectedPdv],
    () => selectedPdv ? api.get(`/dashboard/pdv-weekly-history/${selectedPdv}`).then(r => r.data) : null,
    { enabled: !!selectedPdv, staleTime: 120000 }
  );

  const topPdvs = weeklyDash?.top_pdvs || [];
  const displayPdvs = topPdvs.slice(0, topN);

  const exportExcel = () => {
    const rows = displayPdvs.map((p, i) => ({
      'Rang': i + 1, 'PDV': p.nom, 'CA (FCFA)': p.ca, 'Quartier': p.quartier || '-',
      'Superviseur': p.superviseur || '-', 'Gestionnaire': p.gestionnaire || '-',
      'Variation (%)': p.taux_variation || 0, 'Médaille': p.medaille || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Top${topN}_S${semaine}`);
    XLSX.writeFile(wb, `top${topN}_semaine${semaine}_${annee}.xlsx`);
  };

  const histoData = pdvHistory?.historique?.slice(-16).map(h => ({
    label: `S${h.semaine}`, ca: h.ca, semaine: h.semaine
  })) || [];

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
          <Download size={14} /> Export Excel
        </button>
      </div>

      {selectedPdv && pdvHistory && (
        <div className="card mb-24" style={{ borderLeft: '3px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700 }}>📈 Évolution — {pdvHistory.nom}</h3>
            <button onClick={() => setSelectedPdv(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 20 }}>✕</button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={histoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatCA(v)} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ca" stroke="#FF6900" fill="rgba(255,105,0,0.15)" strokeWidth={2} dot={{ r: 3, fill: '#FF6900' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Rang</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>PDV</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#FF6900' }}>Montant CA</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Nom/Prénom</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Quartier</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Superviseur</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Gestionnaire</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Médaille</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Évolution</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#8a8a9a' }}>Chargement...</td></tr>
              ) : displayPdvs.map((pdv, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: i < 3 ? '#FF6900' : '#aaa' }}>{i + 1}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600 }}>{pdv.nom}</div>
                    <div style={{ fontSize: 11, color: '#8a8a9a' }}>{pdv.zone}</div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#FF6900' }}>{formatCA(pdv.ca)}</td>
                  <td style={{ padding: '12px 14px', color: '#ccc' }}>{pdv.nom_gerant || '—'}</td>
                  <td style={{ padding: '12px 14px', color: '#ccc' }}>{pdv.quartier || '—'}</td>
                  <td style={{ padding: '12px 14px', color: '#ccc' }}>{pdv.superviseur || '—'}</td>
                  <td style={{ padding: '12px 14px', color: '#ccc' }}>{pdv.gestionnaire || '—'}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    {pdv.medaille && pdv.medaille !== 'AUCUNE' ? (
                      <span style={{ color: MEDAL_COLORS[pdv.medaille] || '#aaa', fontWeight: 700 }}>
                        {pdv.medaille === 'OR' ? '🥇' : pdv.medaille === 'ARGENT' ? '🥈' : '🥉'}
                      </span>
                    ) : <span style={{ color: '#555' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <button onClick={() => setSelectedPdv(selectedPdv === pdv.pdv_id ? null : pdv.pdv_id)}
                      style={{ background: 'rgba(255,105,0,0.15)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 6,
                        color: '#FF6900', padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                      📊 Voir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ONGLET 4 : EVOLUTION ────────────────────────────────────────────────────
function OngletEvolution({ annee, semaine }) {
  const [subTab, setSubTab] = useState('pdvs');

  const prevSemaine = semaine === 1 ? 52 : semaine - 1;
  const prevAnnee = semaine === 1 ? annee - 1 : annee;

  const { data: evo, isLoading } = useQuery(
    ['weekly-evolution', annee, semaine],
    () => api.get('/dashboard/weekly-evolution', { params: { annee, semaine } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const exportExcel = (data, name) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name);
    XLSX.writeFile(wb, `${name}_S${semaine}_${annee}.xlsx`);
  };

  const taux = evo?.taux_variation_total || 0;

  const renderTable = (rows, keyField) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
              <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Nom</th>
              <th style={{ padding: '12px 14px', textAlign: 'right', color: '#00d68f' }}>CA S{semaine}</th>
              <th style={{ padding: '12px 14px', textAlign: 'right', color: '#ffa502' }}>CA S{prevSemaine}</th>
              <th style={{ padding: '12px 14px', textAlign: 'right', color: '#8a8a9a' }}>Variation</th>
              <th style={{ padding: '12px 14px', textAlign: 'right', color: '#8a8a9a' }}>Taux</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r[keyField] || r.nom || '—'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{formatCA(r.ca_actuel)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#aaa' }}>{formatCA(r.ca_precedent)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: (r.variation || 0) >= 0 ? '#00d68f' : '#ff4757', fontWeight: 600 }}>
                  {(r.variation || 0) >= 0 ? '+' : ''}{formatCA(r.variation)}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: (r.taux || 0) >= 0 ? 'rgba(0,214,143,0.15)' : 'rgba(255,71,87,0.15)',
                    color: (r.taux || 0) >= 0 ? '#00d68f' : '#ff4757' }}>
                    {(r.taux || 0) >= 0 ? '▲' : '▼'} {Math.abs(Math.round(r.taux || 0))}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <div className="grid-4 mb-24">
        <div className="card" style={{ borderLeft: '3px solid #00d68f' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>CA S{semaine}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#00d68f' }}>{formatCA(evo?.total_ca_actuel)}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #ffa502' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>CA S{prevSemaine}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ffa502' }}>{formatCA(evo?.total_ca_precedent)}</div>
        </div>
        <div className="card" style={{ borderLeft: `3px solid ${(evo?.variation_totale || 0) >= 0 ? '#00d68f' : '#ff4757'}` }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Variation</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: (evo?.variation_totale || 0) >= 0 ? '#00d68f' : '#ff4757' }}>
            {(evo?.variation_totale || 0) >= 0 ? '+' : ''}{formatCA(evo?.variation_totale)}
          </div>
        </div>
        <div className="card" style={{ borderLeft: `3px solid ${taux >= 0 ? '#00d68f' : '#ff4757'}` }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Taux Global</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: taux >= 0 ? '#00d68f' : '#ff4757' }}>
            {taux >= 0 ? '▲' : '▼'} {Math.abs(taux).toFixed(1)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['pdvs', 'PDVs'], ['superviseurs', 'Superviseurs'], ['gestionnaires', 'Gestionnaires']].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            style={{ padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: subTab === k ? 'var(--primary)' : 'rgba(255,255,255,0.08)', color: subTab === k ? '#fff' : '#aaa' }}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost" onClick={() => exportExcel(
            (subTab === 'pdvs' ? evo?.par_pdv : subTab === 'superviseurs' ? evo?.par_superviseur : evo?.par_gestionnaire) || [],
            `evolution_${subTab}`
          )} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {isLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Chargement...</div> : (
        subTab === 'pdvs' ? renderTable(evo?.par_pdv, 'nom') :
        subTab === 'superviseurs' ? renderTable(evo?.par_superviseur, 'superviseur') :
        renderTable(evo?.par_gestionnaire, 'gestionnaire')
      )}
    </div>
  );
}

// ─── ONGLET 5 : PDV INACTIFS ─────────────────────────────────────────────────
function OngletInactifs({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    ['weekly-inactive', annee, semaine],
    () => api.get('/dashboard/weekly-inactive', { params: { annee, semaine } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const pdvs = data?.pdvs || [];
  const critique = pdvs.filter(p => p.alerte === 'CRITIQUE');
  const haute = pdvs.filter(p => p.alerte === 'HAUTE');
  const normale = pdvs.filter(p => p.alerte === 'NORMALE');

  const exportExcel = () => {
    const rows = pdvs.map(p => ({
      'PDV': p.nom, 'Numéro Personnel': p.numero_personnel || '-', 'Superviseur': p.superviseur || '-',
      'Zone': p.zone || '-', 'Sous-zone': p.sous_zone || '-', 'Téléconseillère': p.teleconseillere || '-',
      'Alerte': p.alerte, 'Semaines Inactif': p.nb_semaines_consecutives_inactif,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Inactifs_S${semaine}`);
    XLSX.writeFile(wb, `inactifs_semaine${semaine}_${annee}.xlsx`);
  };

  return (
    <div>
      <div className="grid-4 mb-24">
        <div className="card" style={{ borderLeft: '3px solid #ff4757' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Total Inactifs</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ff4757' }}>{pdvs.length}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>Semaine {semaine}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #ff4757' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>🔴 Critique (≥3 sem.)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ff4757' }}>{critique.length}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #ffa502' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>🟠 Haute (2 sem.)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ffa502' }}>{haute.length}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #8a8a9a' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>⚪ Normale (1 sem.)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#8a8a9a' }}>{normale.length}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Export Excel
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Nom PDV</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>N° Personnel</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Superviseur</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Zone</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Sous-Zone</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Téléconseillère</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Alerte</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Sem. Inactif</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#8a8a9a' }}>Chargement...</td></tr>
              ) : pdvs.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#00d68f' }}>✅ Aucun PDV inactif cette semaine</td></tr>
              ) : pdvs.map((p, i) => {
                const alert = getAlertInfo(p.nb_semaines_consecutives_inactif || 1, 'inactif');
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.nom}</td>
                    <td style={{ padding: '10px 14px', color: '#aaa' }}>{p.numero_personnel || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#ccc' }}>{p.superviseur || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#ccc' }}>{p.zone || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#aaa' }}>{p.sous_zone || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#aaa' }}>{p.teleconseillere || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: alert.bg, color: alert.color }}>
                        {p.alerte || alert.level}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: alert.color }}>
                      {p.nb_semaines_consecutives_inactif || 1}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ONGLET 6 : PDV EN BAISSE ─────────────────────────────────────────────────
function OngletBaisse({ annee, semaine }) {
  const [seuil, setSeuil] = useState(-10);

  const { data, isLoading } = useQuery(
    ['weekly-declining', annee, semaine, seuil],
    () => api.get('/dashboard/weekly-declining', { params: { annee, semaine, seuil } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const pdvs = data?.pdvs || [];
  const critique = pdvs.filter(p => Math.abs(p.taux_baisse || 0) > 30);
  const haute = pdvs.filter(p => Math.abs(p.taux_baisse || 0) > 15 && Math.abs(p.taux_baisse || 0) <= 30);
  const normale = pdvs.filter(p => Math.abs(p.taux_baisse || 0) <= 15);

  const exportExcel = () => {
    const rows = pdvs.map(p => ({
      'PDV': p.nom, 'N° Personnel': p.numero_personnel || '-', 'Superviseur': p.superviseur || '-',
      'Zone': p.zone || '-', 'Sous-zone': p.sous_zone || '-', 'Téléconseillère': p.teleconseillere || '-',
      'CA Actuel': p.ca, 'CA Précédent': p.ca_precedent, 'Baisse (%)': p.taux_baisse, 'Alerte': p.alerte,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Baisse_S${semaine}`);
    XLSX.writeFile(wb, `baisse_semaine${semaine}_${annee}.xlsx`);
  };

  const getAction = (taux) => {
    const abs = Math.abs(taux || 0);
    if (abs > 30) return 'Visite urgente + appel superviseur';
    if (abs > 15) return 'Appel téléphonique + relance';
    return 'Surveillance & suivi régulier';
  };

  return (
    <div>
      <div className="grid-4 mb-24">
        <div className="card" style={{ borderLeft: '3px solid #ff4757' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>Total en Baisse</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ff4757' }}>{pdvs.length}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>Seuil: {seuil}%</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #ff4757' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>🔴 Critique (&gt;30%)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ff4757' }}>{critique.length}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #ffa502' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>🟠 Haute (&gt;15%)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ffa502' }}>{haute.length}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #8a8a9a' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>⚪ Normale</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#8a8a9a' }}>{normale.length}</div>
        </div>
      </div>
      <div className="card mb-16" style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, color: '#8a8a9a', display: 'block', marginBottom: 8, fontWeight: 600 }}>
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
          <Download size={14} /> Export Excel
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Nom PDV</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>N° Personnel</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Superviseur</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Zone</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Téléconseillère</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#00d68f' }}>CA Actuel</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#ffa502' }}>CA Préc.</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#ff4757' }}>Baisse</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Alerte</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: '#8a8a9a' }}>Chargement...</td></tr>
              ) : pdvs.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: '#00d68f' }}>✅ Aucun PDV en baisse cette semaine</td></tr>
              ) : pdvs.map((p, i) => {
                const abs = Math.abs(p.taux_baisse || 0);
                const alert = getAlertInfo(abs, 'baisse');
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.nom}</td>
                    <td style={{ padding: '10px 14px', color: '#aaa' }}>{p.numero_personnel || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#ccc' }}>{p.superviseur || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#aaa' }}>{p.zone || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#aaa' }}>{p.teleconseillere || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{formatCA(p.ca)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#aaa' }}>{formatCA(p.ca_precedent)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#ff4757' }}>
                      ▼ {abs.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: alert.bg, color: alert.color }}>
                        {p.alerte || alert.level}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#aaa' }}>{getAction(p.taux_baisse)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ONGLET 7 : PROGRESSION ───────────────────────────────────────────────────
function OngletProgression({ annee, semaine }) {
  const [selectedPdv, setSelectedPdv] = useState(null);

  const { data, isLoading } = useQuery(
    ['weekly-dash-progression', annee],
    () => api.get('/dashboard/weekly-progression', { params: { annee } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: pdvHistory } = useQuery(
    ['pdv-weekly-hist-prog', selectedPdv],
    () => selectedPdv ? api.get(`/dashboard/pdv-weekly-history/${selectedPdv.pdv_id}`).then(r => r.data) : null,
    { enabled: !!selectedPdv, staleTime: 120000 }
  );

  const pdvs = data?.pdvs || [];

  const exportExcel = () => {
    const rows = pdvs.map(p => ({
      'PDV': p.nom, 'Zone': p.zone || '-', 'Superviseur': p.superviseur || '-',
      'Nb fois Top 10': p.nb_fois_top10, 'Nb fois Top 50': p.nb_fois_top50,
      'Sem. Meilleur CA': p.semaine_meilleur_ca || '-', 'Sem. Pire CA': p.semaine_pire_ca || '-',
      'CA Max (FCFA)': p.ca_max, 'CA Min (FCFA)': p.ca_min,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Progression_${annee}`);
    XLSX.writeFile(wb, `progression_${annee}.xlsx`);
  };

  const histoData = pdvHistory?.historique?.slice(-16).map(h => ({
    label: `S${h.semaine}`, ca: h.ca
  })) || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Export Excel
        </button>
      </div>

      {selectedPdv && pdvHistory && (
        <div className="card mb-24" style={{ borderLeft: '3px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontWeight: 700, marginBottom: 4 }}>📈 Évolution — {selectedPdv.nom}</h3>
              <div style={{ fontSize: 12, color: '#8a8a9a' }}>
                🏆 Top10: {selectedPdv.nb_fois_top10}x · Top50: {selectedPdv.nb_fois_top50}x ·
                CA Max: {formatCA(selectedPdv.ca_max)} ({selectedPdv.semaine_meilleur_ca ? 'S' + (selectedPdv.semaine_meilleur_ca.includes('-W') ? parseInt(selectedPdv.semaine_meilleur_ca.split('-W')[1]) : selectedPdv.semaine_meilleur_ca) : '—'}) ·
                CA Min: {formatCA(selectedPdv.ca_min)} ({selectedPdv.semaine_pire_ca ? 'S' + (selectedPdv.semaine_pire_ca.includes('-W') ? parseInt(selectedPdv.semaine_pire_ca.split('-W')[1]) : selectedPdv.semaine_pire_ca) : '—'})
              </div>
            </div>
            <button onClick={() => setSelectedPdv(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 20 }}>✕</button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={histoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatCA(v)} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ca" stroke="#FF6900" fill="rgba(255,105,0,0.15)" strokeWidth={2} dot={{ r: 3, fill: '#FF6900' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>PDV</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Zone</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Superviseur</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#FFD700' }}>Nb Top 10</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#a29bfe' }}>Nb Top 50</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#00d68f' }}>Sem. Meilleur</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#ff4757' }}>Sem. Pire</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#00d68f' }}>CA Max</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#ff4757' }}>CA Min</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Évol.</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: '#8a8a9a' }}>Chargement...</td></tr>
              ) : pdvs.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: selectedPdv?.pdv_id === p.pdv_id ? 'rgba(255,105,0,0.05)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.nom}</td>
                  <td style={{ padding: '10px 14px', color: '#8a8a9a' }}>{p.zone || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#ccc' }}>{p.superviseur || '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>
                      {p.nb_fois_top10}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ background: 'rgba(162,155,254,0.15)', color: '#a29bfe', padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>
                      {p.nb_fois_top50}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#00d68f', fontWeight: 600 }}>{p.semaine_meilleur_ca ? 'S' + (p.semaine_meilleur_ca.includes('-W') ? parseInt(p.semaine_meilleur_ca.split('-W')[1]) : p.semaine_meilleur_ca) : '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#ff4757', fontWeight: 600 }}>{p.semaine_pire_ca ? 'S' + (p.semaine_pire_ca.includes('-W') ? parseInt(p.semaine_pire_ca.split('-W')[1]) : p.semaine_pire_ca) : '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#00d68f' }}>{formatCA(p.ca_max)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#ff4757' }}>{formatCA(p.ca_min)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <button onClick={() => setSelectedPdv(selectedPdv?.pdv_id === p.pdv_id ? null : p)}
                      style={{ background: 'rgba(255,105,0,0.15)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 6,
                        color: '#FF6900', padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                      📊 Voir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────
export default function WeeklyDashboardPage() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const defaultSemaine = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);

  const [annee, setAnnee] = useState(now.getFullYear());
  const [semaine, setSemaine] = useState(defaultSemaine);
  const [activeTab, setActiveTab] = useState('overview');

  // Charger la dernière semaine disponible et l'utiliser par défaut
  const { data: lastAvailable } = useQuery(
    'last-available',
    () => api.get('/dashboard/last-available').then(r => r.data),
    { staleTime: 300000 }
  );

  useEffect(() => {
    if (lastAvailable?.last_week) {
      setAnnee(lastAvailable.last_week.annee);
      setSemaine(lastAvailable.last_week.semaine);
    }
  }, [lastAvailable]);

  const semDisponibles = lastAvailable?.semaines_disponibles || [];
  const isSemDispo = (a, s) => semDisponibles.some(d => d.annee === a && d.semaine === s);
  const canGoPrevSem = isSemDispo(semaine <= 1 ? annee - 1 : annee, semaine <= 1 ? 52 : semaine - 1);
  const canGoNextSem = isSemDispo(semaine >= 52 ? annee + 1 : annee, semaine >= 52 ? 1 : semaine + 1);
  const prevWeek = () => { const ns=semaine<=1?52:semaine-1; const na=semaine<=1?annee-1:annee; if(isSemDispo(na,ns)){setSemaine(ns);setAnnee(na);} };
  const nextWeek = () => { const ns=semaine>=52?1:semaine+1; const na=semaine>=52?annee+1:annee; if(isSemDispo(na,ns)){setSemaine(ns);setAnnee(na);} };

  const tabs = [
    { key: 'overview', label: '🏠 Vue d\'ensemble', icon: Home },
    { key: 'top', label: '🏆 Suivi des Top', icon: Trophy },
    { key: 'pareto', label: '📊 Rapport Pareto', icon: BarChart3 },
    { key: 'evolution', label: '📈 Évolution', icon: TrendingUp },
    { key: 'inactifs', label: '😴 PDV Inactifs', icon: AlertTriangle },
    { key: 'baisse', label: '📉 PDV en Baisse', icon: TrendingDown },
    { key: 'progression', label: '🎯 Progression', icon: Target },
  ];

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Dashboard Hebdomadaire</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>Suivi semaine par semaine du réseau Orange Mali</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '8px 16px' }}>
          <button onClick={prevWeek} disabled={!canGoPrevSem} style={{ background: 'none', border: 'none', color: '#FF6900', cursor: canGoPrevSem?'pointer':'not-allowed', fontSize: 18, lineHeight: 1, opacity: canGoPrevSem?1:0.3 }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', minWidth: 130, textAlign: 'center' }}>
            Semaine {semaine} · {annee}
          </span>
          <button onClick={nextWeek} disabled={!canGoNextSem} style={{ background: 'none', border: 'none', color: '#FF6900', cursor: canGoNextSem?'pointer':'not-allowed', fontSize: 18, lineHeight: 1, opacity: canGoNextSem?1:0.3 }}>›</button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28, background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '6px' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              background: activeTab === t.key ? 'var(--primary)' : 'transparent',
              color: activeTab === t.key ? '#fff' : '#8a8a9a',
              transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CONTENU */}
      {activeTab === 'overview' && <OngletVueEnsemble annee={annee} semaine={semaine} />}
      {activeTab === 'top' && <OngletSuiviTop annee={annee} semaine={semaine} />}
      {activeTab === 'pareto' && <OngletPareto annee={annee} semaine={semaine} />}
      {activeTab === 'evolution' && <OngletEvolution annee={annee} semaine={semaine} />}
      {activeTab === 'inactifs' && <OngletInactifs annee={annee} semaine={semaine} />}
      {activeTab === 'baisse' && <OngletBaisse annee={annee} semaine={semaine} />}
      {activeTab === 'progression' && <OngletProgression annee={annee} semaine={semaine} />}
    </div>
  );
}

// ─── ONGLET 3 : RAPPORT PARETO ────────────────────────────────────────────────
function OngletPareto({ annee, semaine }) {
  const [zoneFilter, setZoneFilter] = useState('');

  const { data: weeklyDash } = useQuery(
    ['weekly-pareto-dash', annee, semaine],
    () => api.get('/dashboard/weekly', { params: { annee, semaine } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const allPdvs = weeklyDash?.top_pdvs || [];
  const totalCA = weeklyDash?.total_ca || 0;
  const zones = [...new Set(allPdvs.map(p => p.zone).filter(Boolean))];

  const filtered = zoneFilter ? allPdvs.filter(p => p.zone === zoneFilter) : allPdvs;
  const sorted = [...filtered].sort((a, b) => b.ca - a.ca);

  let cumul = 0;
  const paretoList = sorted.map((p, i) => {
    cumul += p.ca;
    const cumul_pct = totalCA > 0 ? (cumul / totalCA) * 100 : 0;
    return { ...p, rang: i + 1, pct_ca: totalCA > 0 ? (p.ca / totalCA) * 100 : 0, cumul_pct, dans_pareto: cumul_pct <= 80 };
  });

  const fortImpact = paretoList.filter(p => p.dans_pareto);
  const faibleImpact = paretoList.filter(p => !p.dans_pareto);
  const caFort = fortImpact.reduce((s, p) => s + p.ca, 0);
  const caFaible = faibleImpact.reduce((s, p) => s + p.ca, 0);

  const exportExcel = () => {
    const rows = paretoList.map(p => ({
      'Rang': p.rang, 'PDV': p.nom, 'Zone': p.zone || '-', 'Superviseur': p.superviseur || '-',
      'CA (FCFA)': p.ca, '% CA': p.pct_ca.toFixed(2), 'Cumul %': p.cumul_pct.toFixed(2),
      'Impact': p.dans_pareto ? 'Fort' : 'Faible',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Pareto_S${semaine}`);
    XLSX.writeFile(wb, `pareto_semaine${semaine}_${annee}.xlsx`);
  };

  return (
    <div>
      <div className="grid-3 mb-24">
        <div className="card" style={{ borderLeft: '3px solid #00d68f' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>PDVs Fort Impact (80% CA)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#00d68f' }}>{fortImpact.length}</div>
          <div style={{ fontSize: 13, color: '#ccc', marginTop: 4 }}>{formatCA(caFort)}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #ff4757' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>PDVs Faible Impact</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#ff4757' }}>{faibleImpact.length}</div>
          <div style={{ fontSize: 13, color: '#ccc', marginTop: 4 }}>{formatCA(caFaible)}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #FF6900' }}>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 6 }}>CA Total Semaine</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#FF6900' }}>{formatCA(totalCA)}</div>
          <div style={{ fontSize: 13, color: '#ccc', marginTop: 4 }}>{paretoList.length} PDVs analysés</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', fontSize: 13 }}>
          <option value="">Toutes les zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Rang</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>PDV</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Zone</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#8a8a9a' }}>Superviseur</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#FF6900' }}>CA</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#8a8a9a' }}>% CA</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#8a8a9a' }}>Cumul %</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#8a8a9a' }}>Impact</th>
              </tr>
            </thead>
            <tbody>
              {paretoList.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: p.dans_pareto ? 'rgba(0,214,143,0.03)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#FF6900', fontWeight: 700 }}>{p.rang}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.nom}</td>
                  <td style={{ padding: '10px 14px', color: '#8a8a9a' }}>{p.zone || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#ccc' }}>{p.superviseur || '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{formatCA(p.ca)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#aaa' }}>{(p.pct_ca || 0).toFixed(2)}%</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#aaa' }}>{(p.cumul_pct || 0).toFixed(2)}%</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                      background: p.dans_pareto ? 'rgba(0,214,143,0.15)' : 'rgba(255,71,87,0.15)',
                      color: p.dans_pareto ? '#00d68f' : '#ff4757' }}>
                      {p.dans_pareto ? 'FORT' : 'FAIBLE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
