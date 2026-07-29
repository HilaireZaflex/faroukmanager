import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, ComposedChart
} from 'recharts';
import api from '../services/api';

const COLOR_PRIMARY = '#00d68f';
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
        <p key={i} style={{ color: p.color }}>{p.name}: {p.dataKey === 'cumul_pct' ? `${p.value}%` : formatCA(p.value)}</p>
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

// ─── Vue d'ensemble hebdo ──────────────────────────────────────────────────
function OngletVueEnsemble({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    ['nafama-w-overview', annee, semaine],
    () => api.get(`/nafama/weekly/summary?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data || !data.nb_pdv_actifs) return <EmptyTab />;

  const kpis = [
    { label: 'CA Total', value: formatCA(data.ca_total), icon: '💰', color: COLOR_PRIMARY },
    { label: 'PDVs Actifs', value: data.nb_pdv_actifs, icon: '✅', color: '#3742fa' },
    { label: 'CA Moyen / PDV', value: formatCA(data.ca_moyen), icon: '📊', color: '#ffa502' },
    { label: 'Évolution vs S-1', value: `${data.evolution_pct > 0 ? '+' : ''}${data.evolution_pct}%`, icon: data.evolution_pct >= 0 ? '📈' : '📉', color: data.evolution_pct >= 0 ? '#00d68f' : '#ff4757' },
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
          CA semaine précédente : <strong style={{ color: '#fff' }}>{formatCA(data.ca_semaine_precedente)}</strong>
        </p>
      </div>
    </div>
  );
}

// ─── Top PDVs hebdo ────────────────────────────────────────────────────────
function OngletTop({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    ['nafama-w-top', annee, semaine],
    () => api.get(`/nafama/weekly/top?annee=${annee}&semaine=${semaine}&limit=20`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>🏆 Top 20 PDVs — Semaine {semaine} · {annee}</h3>
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

// ─── Pareto hebdo ──────────────────────────────────────────────────────────
function OngletPareto({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    ['nafama-w-pareto', annee, semaine],
    () => api.get(`/nafama/weekly/pareto?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.items?.length) return <EmptyTab />;

  const chartData = data.items.slice(0, 40);

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📊 Pareto — Semaine {semaine} · {annee}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        <strong style={{ color: COLOR_PRIMARY }}>{data.nb_pdv_pareto} PDVs</strong> ({data.seuil_80_pct}%) représentent 80% du CA · Total : {data.nb_pdv_total} PDVs
      </p>
      <ResponsiveContainer width="100%" height={320}>
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

// ─── Évolution hebdo ───────────────────────────────────────────────────────
function OngletEvolution({ annee }) {
  const { data, isLoading } = useQuery(
    ['nafama-w-evolution', annee],
    () => api.get(`/nafama/weekly/evolution?annee=${annee}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📈 CA par Semaine — {annee}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ca" name="CA" fill={COLOR_PRIMARY} radius={[4,4,0,0]}>
              {data.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>👥 PDVs Actifs par Semaine</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="nb_pdv" name="PDVs Actifs" stroke="#ffa502" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Inactifs hebdo ────────────────────────────────────────────────────────
function OngletInactifs({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    ['nafama-w-inactifs', annee, semaine],
    () => api.get(`/nafama/weekly/inactive?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab message="Aucun PDV inactif cette semaine ✅" />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>😴 PDVs Inactifs — Semaine {semaine} · {annee} ({data.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(255,71,87,0.05)', borderRadius: 8, border: '1px solid rgba(255,71,87,0.15)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.numero_pdv}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Semaine préc. : {formatCA(pdv.ca_semaine_precedente)}</div>
            <div style={{ fontSize: 11, color: '#ff4757', fontWeight: 700 }}>INACTIF</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── En Baisse hebdo ───────────────────────────────────────────────────────
function OngletBaisse({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    ['nafama-w-baisse', annee, semaine],
    () => api.get(`/nafama/weekly/declining?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab message="Aucun PDV en baisse cette semaine ✅" />;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📉 PDVs En Baisse — Semaine {semaine} · {annee} ({data.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(255,165,2,0.05)', borderRadius: 8, border: '1px solid rgba(255,165,2,0.15)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Préc. : {formatCA(pdv.ca_precedent)}</div>
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

// ─── Page Principale Hebdomadaire ──────────────────────────────────────────
export default function NafamaWeeklyDashboardPage() {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [semaine, setSemaine] = useState(1);
  const [activeTab, setActiveTab] = useState('overview');

  // Charger les périodes disponibles depuis la nouvelle API NAFAMA
  const { data: periods } = useQuery(
    'nafama-periods',
    () => api.get('/nafama/periods').then(r => r.data),
    { staleTime: 300000 }
  );

  useEffect(() => {
    if (periods?.semaines?.length) {
      const last = periods.semaines[periods.semaines.length - 1];
      setAnnee(last.annee);
      setSemaine(last.semaine);
    }
  }, [periods]);

  const semDispo = periods?.semaines || [];
  const isSemDispo = (a, s) => semDispo.some(d => d.annee === a && d.semaine === s);
  const canGoPrev = semaine <= 1 ? isSemDispo(annee - 1, 52) : isSemDispo(annee, semaine - 1);
  const canGoNext = semaine >= 52 ? isSemDispo(annee + 1, 1) : isSemDispo(annee, semaine + 1);

  const prevWeek = () => {
    if (!canGoPrev) return;
    if (semaine <= 1) { setSemaine(52); setAnnee(a => a - 1); } else setSemaine(s => s - 1);
  };
  const nextWeek = () => {
    if (!canGoNext) return;
    if (semaine >= 52) { setSemaine(1); setAnnee(a => a + 1); } else setSemaine(s => s + 1);
  };

  const tabs = [
    { key: 'overview',  label: "🏠 Vue d'ensemble" },
    { key: 'top',       label: '🏆 Top PDVs' },
    { key: 'pareto',    label: '📊 Pareto' },
    { key: 'evolution', label: '📈 Évolution' },
    { key: 'inactifs',  label: '😴 Inactifs' },
    { key: 'baisse',    label: '📉 En Baisse' },
  ];

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">🟢 NAFAMA — Dashboard Hebdomadaire</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            Suivi semaine par semaine · {semDispo.length > 0 ? `${semDispo.length} semaines disponibles` : 'Aucune donnée'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '8px 16px' }}>
          <button onClick={prevWeek} disabled={!canGoPrev} style={{ background: 'none', border: 'none', color: canGoPrev ? COLOR_PRIMARY : '#444', cursor: canGoPrev ? 'pointer' : 'not-allowed', fontSize: 20 }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', minWidth: 150, textAlign: 'center' }}>Semaine {semaine} · {annee}</span>
          <button onClick={nextWeek} disabled={!canGoNext} style={{ background: 'none', border: 'none', color: canGoNext ? COLOR_PRIMARY : '#444', cursor: canGoNext ? 'pointer' : 'not-allowed', fontSize: 20 }}>›</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28, background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '6px' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              background: activeTab === t.key ? COLOR_PRIMARY : 'transparent',
              color: activeTab === t.key ? '#fff' : '#8a8a9a', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview'  && <OngletVueEnsemble annee={annee} semaine={semaine} />}
      {activeTab === 'top'       && <OngletTop annee={annee} semaine={semaine} />}
      {activeTab === 'pareto'    && <OngletPareto annee={annee} semaine={semaine} />}
      {activeTab === 'evolution' && <OngletEvolution annee={annee} />}
      {activeTab === 'inactifs'  && <OngletInactifs annee={annee} semaine={semaine} />}
      {activeTab === 'baisse'    && <OngletBaisse annee={annee} semaine={semaine} />}
    </div>
  );
}
