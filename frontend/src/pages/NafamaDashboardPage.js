import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, ComposedChart
} from 'recharts';
import {
  ChevronLeft, ChevronRight, Home, Trophy, BarChart3,
  TrendingUp, TrendingDown, Battery, Target
} from 'lucide-react';
import api from '../services/api';

const COLOR_PRIMARY = '#00d68f';
const MOIS_NOMS = {
  1:'Janvier',2:'Février',3:'Mars',4:'Avril',5:'Mai',6:'Juin',
  7:'Juillet',8:'Août',9:'Septembre',10:'Octobre',11:'Novembre',12:'Décembre'
};
const ZONE_COLORS = ['#00d68f', '#FF6900', '#3742fa', '#ffa502', '#ff4757', '#a29bfe', '#fd79a8', '#00cec9'];

function formatCA(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M FCFA`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K FCFA`;
  return value.toLocaleString() + ' FCFA';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && p.dataKey !== 'cumul_pct' ? formatCA(p.value) : `${p.value}%`}</p>
      ))}
    </div>
  );
};

function EmptyTab({ message = 'Aucune donnée disponible. Importez le fichier NAFAMA.' }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <p style={{ fontSize: 15, fontWeight: 600 }}>{message}</p>
      <p style={{ fontSize: 13, marginTop: 8 }}>Utilisez <strong>Import Données → NAFAMA</strong> pour charger les données.</p>
    </div>
  );
}

// ─── Vue d'ensemble mensuelle ──────────────────────────────────────────────
function TabOverview({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['nafama-overview', annee, mois],
    () => api.get(`/nafama/monthly/summary?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data || !data.nb_pdv_actifs) return <EmptyTab />;

  const kpis = [
    { label: 'CA Total', value: formatCA(data.ca_total), icon: '💰', color: COLOR_PRIMARY },
    { label: 'PDVs Actifs', value: data.nb_pdv_actifs, icon: '✅', color: '#3742fa' },
    { label: 'CA Moyen / PDV', value: formatCA(data.ca_moyen), icon: '📊', color: '#ffa502' },
    { label: 'Évolution vs M-1', value: `${data.evolution_pct > 0 ? '+' : ''}${data.evolution_pct}%`, icon: data.evolution_pct >= 0 ? '📈' : '📉', color: data.evolution_pct >= 0 ? '#00d68f' : '#ff4757' },
    { label: 'PDVs Inactifs', value: data.nb_pdv_inactifs, icon: '😴', color: '#ff4757' },
    { label: 'Nouveaux PDVs', value: data.nb_nouveaux_pdv, icon: '🆕', color: '#a29bfe' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{ textAlign: 'center', borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: '16px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          CA mois précédent : <strong style={{ color: '#fff' }}>{formatCA(data.ca_mois_precedent)}</strong>
        </p>
      </div>
    </div>
  );
}

// ─── Top PDVs mensuel ──────────────────────────────────────────────────────
function TabTopPDVs({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['nafama-top', annee, mois],
    () => api.get(`/nafama/monthly/top?annee=${annee}&mois=${mois}&limit=20`).then(r => r.data),
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
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.nb_jours_actif} jour(s) actif</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLOR_PRIMARY }}>{formatCA(pdv.ca)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pareto mensuel ────────────────────────────────────────────────────────
function TabPareto({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['nafama-pareto', annee, mois],
    () => api.get(`/nafama/monthly/pareto?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.items?.length) return <EmptyTab />;

  const chartData = data.items.slice(0, 40);

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📊 Analyse Pareto — {MOIS_NOMS[mois]} {annee}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        <strong style={{ color: COLOR_PRIMARY }}>{data.nb_pdv_pareto} PDVs</strong> ({data.seuil_80_pct}%) représentent 80% du CA · Total : {data.nb_pdv_total} PDVs
      </p>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="numero_pdv" tick={{ fontSize: 8 }} />
          <YAxis yAxisId="left" tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar yAxisId="left" dataKey="ca" name="CA" fill={COLOR_PRIMARY} radius={[4,4,0,0]} />
          <Line yAxisId="right" type="monotone" dataKey="cumul_pct" name="Cumul %" stroke="#ffa502" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Évolution mensuelle ───────────────────────────────────────────────────
function TabEvolution({ annee }) {
  const { data, isLoading } = useQuery(
    ['nafama-evolution', annee],
    () => api.get(`/nafama/monthly/evolution?annee=${annee}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📈 CA Mensuel — {annee}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ca" name="CA" fill={COLOR_PRIMARY} radius={[6,6,0,0]}>
              {data.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>👥 PDVs Actifs par Mois</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="nb_pdv" name="PDVs Actifs" stroke="#ffa502" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Inactifs mensuel ──────────────────────────────────────────────────────
function TabInactivePDVs({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['nafama-inactifs', annee, mois],
    () => api.get(`/nafama/monthly/inactive?annee=${annee}&mois=${mois}`).then(r => r.data),
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.numero_pdv}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Dernier CA : {formatCA(pdv.ca_dernier_mois)}</div>
            <div style={{ fontSize: 11, color: '#ff4757', fontWeight: 700 }}>INACTIF</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── En Baisse mensuel ─────────────────────────────────────────────────────
function TabDecliningPDVs({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['nafama-baisse', annee, mois],
    () => api.get(`/nafama/monthly/declining?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab message="Aucun PDV en baisse significative ce mois ✅" />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📉 PDVs En Baisse — {MOIS_NOMS[mois]} {annee} ({data.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(255,165,2,0.05)', borderRadius: 8, border: '1px solid rgba(255,165,2,0.15)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Précédent : {formatCA(pdv.ca_precedent)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffa502' }}>{formatCA(pdv.ca_actuel)}</div>
              <div style={{ fontSize: 11, color: '#ff4757' }}>↓ {Math.abs(pdv.variation_pct)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page Principale Mensuelle ─────────────────────────────────────────────
export default function NafamaDashboardPage() {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState('overview');

  // Charger les périodes disponibles depuis la nouvelle API NAFAMA
  const { data: periods } = useQuery(
    'nafama-periods',
    () => api.get('/nafama/periods').then(r => r.data),
    { staleTime: 300000 }
  );

  useEffect(() => {
    if (periods?.mois?.length) {
      const last = periods.mois[periods.mois.length - 1];
      setAnnee(last.annee);
      setMois(last.mois);
    }
  }, [periods]);

  const moisDispo = periods?.mois || [];
  const isMoisDispo = (a, m) => moisDispo.some(d => d.annee === a && d.mois === m);
  const canGoPrev = mois === 1 ? isMoisDispo(annee - 1, 12) : isMoisDispo(annee, mois - 1);
  const canGoNext = mois === 12 ? isMoisDispo(annee + 1, 1) : isMoisDispo(annee, mois + 1);

  const prevMonth = () => {
    if (!canGoPrev) return;
    if (mois === 1) { setMois(12); setAnnee(a => a - 1); } else setMois(m => m - 1);
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (mois === 12) { setMois(1); setAnnee(a => a + 1); } else setMois(m => m + 1);
  };

  const tabs = [
    { id: 'overview',  label: "🏠 Vue d'ensemble" },
    { id: 'top',       label: '🏆 Top PDVs' },
    { id: 'pareto',    label: '📊 Pareto' },
    { id: 'evolution', label: '📈 Évolution' },
    { id: 'inactifs',  label: '😴 Inactifs' },
    { id: 'declining', label: '📉 En Baisse' },
  ];

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🟢 NAFAMA — Dashboard Mensuel</h1>
          <p className="page-subtitle">Performance du réseau NAFAMA · {moisDispo.length > 0 ? `${moisDispo.length} mois disponibles` : 'Aucune donnée'}</p>
        </div>
        <div className="dash-controls">
          <div className="month-nav">
            <button className="btn btn-ghost btn-sm" onClick={prevMonth} disabled={!canGoPrev} style={{ opacity: canGoPrev ? 1 : 0.3 }}>
              <ChevronLeft size={16}/>
            </button>
            <span className="month-label">{MOIS_NOMS[mois]} {annee}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth} disabled={!canGoNext} style={{ opacity: canGoNext ? 1 : 0.3 }}>
              <ChevronRight size={16}/>
            </button>
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
        {activeTab === 'overview'  && <TabOverview annee={annee} mois={mois} />}
        {activeTab === 'top'       && <TabTopPDVs annee={annee} mois={mois} />}
        {activeTab === 'pareto'    && <TabPareto annee={annee} mois={mois} />}
        {activeTab === 'evolution' && <TabEvolution annee={annee} />}
        {activeTab === 'inactifs'  && <TabInactivePDVs annee={annee} mois={mois} />}
        {activeTab === 'declining' && <TabDecliningPDVs annee={annee} mois={mois} />}
      </div>
    </div>
  );
}
