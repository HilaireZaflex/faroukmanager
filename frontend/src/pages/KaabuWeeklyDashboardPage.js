import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell
} from 'recharts';
import api from '../services/api';

const INDICATEUR = 'KAABU';
const COLOR_PRIMARY = '#a29bfe';
const ZONE_COLORS = ['#a29bfe', '#FF6900', '#00d68f', '#ffa502', '#ff4757', '#3742fa', '#fd79a8', '#00cec9'];

function formatCA(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {formatCA(p.value)} FCFA</p>)}
    </div>
  );
};

function EmptyTab({ message = 'Aucune donnée disponible pour cet indicateur.' }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <p style={{ fontSize: 15, fontWeight: 600 }}>{message}</p>
      <p style={{ fontSize: 13, marginTop: 8 }}>Importez des données {INDICATEUR} via le menu <strong>Import Données</strong>.</p>
    </div>
  );
}

function OngletVueEnsemble({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    [`kaabu-w-overview`, annee, semaine],
    () => api.get(`/performance/weekly/summary?annee=${annee}&semaine=${semaine}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data || data.total_pdvs === 0) return <EmptyTab />;
  const kpis = [
    { label: 'Montant Transaction', value: formatCA(data.montant_transaction || data.ca_total) + ' FCFA', icon: '💰', color: COLOR_PRIMARY },
    { label: 'PDVs Actifs', value: data.pdvs_actifs ?? '—', icon: '✅', color: '#3742fa' },
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
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_zone}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => formatCA(v)} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ca" name="CA" radius={[6,6,0,0]}>
                {data.by_zone.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function OngletTop({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    [`kaabu-w-top`, annee, semaine],
    () => api.get(`/performance/weekly/top?annee=${annee}&semaine=${semaine}&indicateur=${INDICATEUR}&limit=20`).then(r => r.data),
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
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.nom || pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.zone} · {pdv.numero_pdv}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLOR_PRIMARY }}>{formatCA(pdv.ca)} FCFA</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OngletPareto({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    [`kaabu-w-pareto`, annee, semaine],
    () => api.get(`/performance/weekly/pareto?annee=${annee}&semaine=${semaine}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;
  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📊 Pareto — Semaine {semaine} · {annee}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data.slice(0, 30)}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="numero_pdv" tick={{ fontSize: 9 }} />
          <YAxis tickFormatter={v => formatCA(v)} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="ca" name="CA" fill={COLOR_PRIMARY} radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function OngletEvolution({ annee }) {
  const { data, isLoading } = useQuery(
    [`kaabu-w-evolution`, annee],
    () => api.get(`/performance/weekly/evolution?annee=${annee}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;
  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📈 Évolution Hebdomadaire — {annee}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="semaine" tickFormatter={v => `S${v}`} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={v => formatCA(v)} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="ca_total" name="Montant Transaction" stroke={COLOR_PRIMARY} strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OngletInactifs({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    [`kaabu-w-inactifs`, annee, semaine],
    () => api.get(`/performance/weekly/inactifs?annee=${annee}&semaine=${semaine}&indicateur=${INDICATEUR}`).then(r => r.data),
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

function OngletBaisse({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    [`kaabu-w-baisse`, annee, semaine],
    () => api.get(`/performance/weekly/declining?annee=${annee}&semaine=${semaine}&indicateur=${INDICATEUR}`).then(r => r.data),
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.nom || pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.zone}</div>
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

function OngletProgression({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    [`kaabu-w-progression`, annee, semaine],
    () => api.get(`/performance/weekly/progression?annee=${annee}&semaine=${semaine}&indicateur=${INDICATEUR}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;
  return (
    <div className="card">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>🎯 Progression — Semaine {semaine} · {annee}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((pdv, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(162,155,254,0.05)', borderRadius: 8, border: '1px solid rgba(162,155,254,0.15)' }}>
            <div style={{ width: 24, textAlign: 'center', fontWeight: 800, color: 'var(--text-secondary)', fontSize: 12 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{pdv.nom || pdv.numero_pdv}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.zone}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(pdv.ca)} FCFA</div>
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

export default function KaabuWeeklyDashboardPage() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const defaultSemaine = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);

  const [annee, setAnnee] = useState(now.getFullYear());
  const [semaine, setSemaine] = useState(defaultSemaine);
  const [activeTab, setActiveTab] = useState('overview');

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
    { key: 'overview',    label: "🏠 Vue d'ensemble" },
    { key: 'top',         label: '🏆 Top PDVs' },
    { key: 'pareto',      label: '📊 Pareto' },
    { key: 'evolution',   label: '📈 Évolution' },
    { key: 'inactifs',    label: '😴 Inactifs' },
    { key: 'baisse',      label: '📉 En Baisse' },
    { key: 'progression', label: '🎯 Progression' },
  ];

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">🟣 KAABU — Dashboard Hebdomadaire</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>Suivi semaine par semaine du réseau KAABU</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '8px 16px' }}>
          <button onClick={prevWeek} style={{ background: 'none', border: 'none', color: COLOR_PRIMARY, cursor: 'pointer', fontSize: 18 }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', minWidth: 130, textAlign: 'center' }}>Semaine {semaine} · {annee}</span>
          <button onClick={nextWeek} style={{ background: 'none', border: 'none', color: COLOR_PRIMARY, cursor: 'pointer', fontSize: 18 }}>›</button>
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

      {activeTab === 'overview'    && <OngletVueEnsemble annee={annee} semaine={semaine} />}
      {activeTab === 'top'         && <OngletTop annee={annee} semaine={semaine} />}
      {activeTab === 'pareto'      && <OngletPareto annee={annee} semaine={semaine} />}
      {activeTab === 'evolution'   && <OngletEvolution annee={annee} />}
      {activeTab === 'inactifs'    && <OngletInactifs annee={annee} semaine={semaine} />}
      {activeTab === 'baisse'      && <OngletBaisse annee={annee} semaine={semaine} />}
      {activeTab === 'progression' && <OngletProgression annee={annee} semaine={semaine} />}
    </div>
  );
}
