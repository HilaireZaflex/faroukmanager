import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  ChevronLeft, ChevronRight, Home, Trophy, BarChart3,
  TrendingUp, TrendingDown, Battery, Target
} from 'lucide-react';
import api from '../services/api';

const INDICATEUR = 'NAFAMA';
const COLOR_PRIMARY = '#00d68f';

const MOIS_NOMS = {
  1:'Janvier',2:'Février',3:'Mars',4:'Avril',5:'Mai',6:'Juin',
  7:'Juillet',8:'Août',9:'Septembre',10:'Octobre',11:'Novembre',12:'Décembre'
};
const ZONE_COLORS = ['#00d68f', '#FF6900', '#3742fa', '#ffa502', '#ff4757', '#a29bfe', '#fd79a8', '#00cec9'];

function formatCA(value) {
  if (!value || isNaN(value)) return '0 FCFA';
  return new Intl.NumberFormat('en-US').format(Math.round(value)) + ' FCFA';
}

function getAlertLevel(value, type = 'inactif') {
  if (type === 'inactif') {
    if (value >= 30) return { color: '#ff4757', bg: 'rgba(255,71,87,0.1)', label: 'Critique' };
    if (value >= 15) return { color: '#ffa502', bg: 'rgba(255,165,2,0.1)', label: 'Attention' };
    return { color: '#00d68f', bg: 'rgba(0,214,143,0.1)', label: 'OK' };
  }
  return { color: '#3742fa', bg: 'rgba(55,66,250,0.1)', label: '' };
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {formatCA(p.value)} FCFA</p>
      ))}
    </div>
  );
};

// ─── Onglet vide réutilisable ──────────────────────────────────────────────
function EmptyTab({ message = 'Aucune donnée disponible pour cet indicateur.' }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <p style={{ fontSize: 15, fontWeight: 600 }}>{message}</p>
      <p style={{ fontSize: 13, marginTop: 8 }}>Importez des données {INDICATEUR} via le menu <strong>Import Données</strong>.</p>
    </div>
  );
}

// ─── Tab Vue d'ensemble ────────────────────────────────────────────────────
function TabOverview({ annee, mois }) {
  const { data, isLoading } = useQuery(
    [`nafama-overview`, annee, mois],
    () => api.get(`/performance/monthly/summary?annee=${annee}&mois=${mois}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data || data.total_pdvs === 0) return <EmptyTab />;

  const kpis = [
    { label: 'Montant Transaction', value: formatCA(data.montant_transaction || data.ca_total) + ' FCFA', icon: '💰', color: COLOR_PRIMARY },
    { label: 'PDVs Actifs', value: data.pdvs_actifs ?? '—', icon: '✅', color: '#3742fa' },
    { label: 'Montant CA', value: formatCA(data.montant_ca || 0) + ' FCFA', icon: '💚', color: '#00d68f' },
    { label: 'Commission PDG', value: formatCA(data.commission_pdg || 0) + ' FCFA', icon: '🏆', color: '#a29bfe' },
    { label: 'PDVs Inactifs', value: data.pdvs_inactifs ?? '—', icon: '😴', color: '#ff4757' },
    { label: 'Moy. Transaction/PDV', value: formatCA(data.ca_moyen) + ' FCFA', icon: '📊', color: '#ffa502' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{ textAlign: 'center', borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {data.by_zone?.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>CA par Zone</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.by_zone}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => formatCA(v)} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ca" name="CA" fill={COLOR_PRIMARY} radius={[6,6,0,0]}>
                {data.by_zone.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Tab Top PDVs ──────────────────────────────────────────────────────────
function TabTopPDVs({ annee, mois }) {
  const { data, isLoading } = useQuery(
    [`nafama-top`, annee, mois],
    () => api.get(`/performance/monthly/top?annee=${annee}&mois=${mois}&indicateur=${INDICATEUR}&limit=20`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>🏆 Top 20 PDVs — {MOIS_NOMS[mois]} {annee}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: i < 3 ? `${ZONE_COLORS[i]}15` : 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pdv.nom || pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.zone} · {pdv.numero_pdv}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLOR_PRIMARY }}>{formatCA(pdv.ca)} FCFA</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Pareto ────────────────────────────────────────────────────────────
function TabPareto({ annee, mois }) {
  const { data, isLoading } = useQuery(
    [`nafama-pareto`, annee, mois],
    () => api.get(`/performance/monthly/pareto?annee=${annee}&mois=${mois}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  const top20pct = data.filter(d => d.cumul_pct <= 80);

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📊 Analyse Pareto — {MOIS_NOMS[mois]} {annee}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {top20pct.length} PDVs représentent 80% du CA total
      </p>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data.slice(0, 30)}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="numero_pdv" tick={{ fontSize: 9 }} />
          <YAxis yAxisId="left" tickFormatter={v => formatCA(v)} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar yAxisId="left" dataKey="ca" name="CA" fill={COLOR_PRIMARY} radius={[4,4,0,0]} />
          <Line yAxisId="right" type="monotone" dataKey="cumul_pct" name="Cumul %" stroke="#ffa502" dot={false} strokeWidth={2} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Tab Évolution ─────────────────────────────────────────────────────────
function TabEvolution({ annee, mois }) {
  const { data, isLoading } = useQuery(
    [`nafama-evolution`, annee],
    () => api.get(`/performance/monthly/evolution?annee=${annee}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📈 Évolution du CA — {annee}</h3>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="mois_nom" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={v => formatCA(v)} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="ca_total" name="CA Total" stroke={COLOR_PRIMARY} strokeWidth={2.5} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Tab Inactifs ──────────────────────────────────────────────────────────
function TabInactivePDVs({ annee, mois }) {
  const { data, isLoading } = useQuery(
    [`nafama-inactifs`, annee, mois],
    () => api.get(`/performance/monthly/inactifs?annee=${annee}&mois=${mois}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab message="Aucun PDV inactif ce mois ✅" />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>😴 PDVs Inactifs — {MOIS_NOMS[mois]} {annee} ({data.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(255,71,87,0.05)', borderRadius: 8, border: '1px solid rgba(255,71,87,0.15)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.nom || pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.zone} · {pdv.superviseur}</div>
            </div>
            <div style={{ fontSize: 11, color: '#ff4757', fontWeight: 700 }}>INACTIF</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab En Baisse ─────────────────────────────────────────────────────────
function TabDecliningPDVs({ annee, mois }) {
  const { data, isLoading } = useQuery(
    [`nafama-baisse`, annee, mois],
    () => api.get(`/performance/monthly/declining?annee=${annee}&mois=${mois}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab message="Aucun PDV en baisse ce mois ✅" />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📉 PDVs En Baisse — {MOIS_NOMS[mois]} {annee} ({data.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(255,165,2,0.05)', borderRadius: 8, border: '1px solid rgba(255,165,2,0.15)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.nom || pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.zone} · {pdv.superviseur}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffa502' }}>{formatCA(pdv.ca)} FCFA</div>
              <div style={{ fontSize: 11, color: '#ff4757' }}>↓ {pdv.variation_pct?.toFixed(1)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Progression ───────────────────────────────────────────────────────
function TabProgression({ annee }) {
  const { data, isLoading } = useQuery(
    [`nafama-progression`, annee],
    () => api.get(`/performance/monthly/progression?annee=${annee}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>🎯 Progression — {annee}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(0,214,143,0.05)', borderRadius: 8, border: '1px solid rgba(0,214,143,0.15)' }}>
            <div style={{ width: 24, textAlign: 'center', fontWeight: 800, color: 'var(--text-secondary)', fontSize: 12 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.nom || pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.zone}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(pdv.ca_total)} FCFA</div>
              <div style={{ fontSize: 11, color: pdv.variation_pct >= 0 ? '#00d68f' : '#ff4757' }}>
                {pdv.variation_pct >= 0 ? '↑' : '↓'} {Math.abs(pdv.variation_pct)?.toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page Principale ────────────────────────────────────────────────────────
export default function NafamaDashboardPage() {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState('overview');

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
  }, [lastAvailable]);

  const prevMonth = () => { if (mois === 1) { setMois(12); setAnnee(a => a - 1); } else setMois(m => m - 1); };
  const nextMonth = () => { if (mois === 12) { setMois(1); setAnnee(a => a + 1); } else setMois(m => m + 1); };

  const tabs = [
    { id: 'overview',    label: "🏠 Vue d'ensemble", icon: Home },
    { id: 'top',         label: '🏆 Top PDVs',       icon: Trophy },
    { id: 'pareto',      label: '📊 Pareto',          icon: BarChart3 },
    { id: 'evolution',   label: '📈 Évolution',       icon: TrendingUp },
    { id: 'inactifs',    label: '😴 Inactifs',        icon: Battery },
    { id: 'declining',   label: '📉 En Baisse',       icon: TrendingDown },
    { id: 'progression', label: '🎯 Progression',     icon: Target },
  ];

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🟢 NAFAMA — Dashboard Mensuel</h1>
          <p className="page-subtitle">Performance du réseau NAFAMA</p>
        </div>
        <div className="dash-controls">
          <div className="month-nav">
            <button className="btn btn-ghost btn-sm" onClick={prevMonth} disabled={!canGoPrev} style={{opacity: canGoPrev ? 1 : 0.3, cursor: canGoPrev ? 'pointer' : 'not-allowed'}}><ChevronLeft size={16}/></button>
            <span className="month-label">{MOIS_NOMS[mois]} {annee}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth} disabled={!canGoNext} style={{opacity: canGoNext ? 1 : 0.3, cursor: canGoNext ? 'pointer' : 'not-allowed'}}><ChevronRight size={16}/></button>
          </div>
        </div>
      </div>

      <div className="tabs-container mb-24">
        {tabs.map(tab => (
          <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview'    && <TabOverview annee={annee} mois={mois} />}
        {activeTab === 'top'         && <TabTopPDVs annee={annee} mois={mois} />}
        {activeTab === 'pareto'      && <TabPareto annee={annee} mois={mois} />}
        {activeTab === 'evolution'   && <TabEvolution annee={annee} mois={mois} />}
        {activeTab === 'inactifs'    && <TabInactivePDVs annee={annee} mois={mois} />}
        {activeTab === 'declining'   && <TabDecliningPDVs annee={annee} mois={mois} />}
        {activeTab === 'progression' && <TabProgression annee={annee} />}
      </div>
    </div>
  );
}
