import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, ComposedChart, PieChart, Pie, Legend
} from 'recharts';
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Activity,
  DollarSign, Store, AlertTriangle
} from 'lucide-react';
import KPICard from '../components/common/KPICard';
import api from '../services/api';

const COLOR_PRIMARY = '#00d68f';
const MOIS_NOMS = {
  1:'Janvier',2:'Février',3:'Mars',4:'Avril',5:'Mai',6:'Juin',
  7:'Juillet',8:'Août',9:'Septembre',10:'Octobre',11:'Novembre',12:'Décembre'
};
const ZONE_COLORS = ['#00d68f', '#FF6900', '#3742fa', '#ffa502', '#ff4757', '#a29bfe', '#fd79a8', '#00cec9'];

function formatCA(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('fr-FR').format(Math.round(value)) + ' FCFA';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a1a2e', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || COLOR_PRIMARY, fontWeight: 700, fontSize: 13 }}>
          {p.dataKey === 'cumul_pct' ? `${p.value}%` : formatCA(p.value)}
        </p>
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

// ─── Composant Accordéon (identique OMY) ─────────────────────────────────
function AccordionSection({ title, defaultOpen = true, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: open ? 'rgba(0,214,143,0.08)' : 'rgba(255,255,255,0.03)',
        border: 'none', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 700,
        transition: 'background 0.2s',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {title}
          {badge && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,214,143,0.2)', color: COLOR_PRIMARY }}>{badge}</span>}
        </span>
        <span style={{ fontSize: 18, transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', color: COLOR_PRIMARY }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '20px 20px 16px 20px', background: 'rgba(255,255,255,0.01)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Vue d'ensemble mensuelle ──────────────────────────────────────────────
function TabOverview({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['nafama-overview', annee, mois],
    () => api.get(`/nafama/monthly/overview?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data || !data.nb_pdv_actifs) return <EmptyTab />;

  const evolution = data.evolution_pct || 0;

  // Préparer données graphiques
  const caByZone = Object.entries(data.ca_by_zone || {})
    .map(([zone, ca]) => ({ zone: zone.replace('Bamako ', 'Bko '), ca }))
    .sort((a, b) => b.ca - a.ca);

  const caBySup = Object.entries(data.ca_by_superviseur || {})
    .map(([sup, ca]) => ({ sup, ca }))
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 8);

  const caByGest = Object.entries(data.ca_by_gestionnaire || {})
    .filter(([g]) => g && g !== '—')
    .map(([gest, ca]) => ({ gest, ca }))
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 6);

  const classement = data.classement_superviseurs || [];

  return (
    <div>
      {/* ══ SECTION 1 : Volume Financier & Activité Réseau ══ */}
      <AccordionSection
        title="💰 Volume Financier & Activité Réseau"
        defaultOpen={true}
        badge={`${MOIS_NOMS[mois]} ${annee}`}
      >
        <div style={{ fontSize: 12, color: COLOR_PRIMARY, fontWeight: 700, marginBottom: 10 }}>💰 Volume Financier</div>
        <div className="grid-3-kpi mb-24">
          <KPICard
            title="CA Total"
            formatted={formatCA(data.ca_total)}
            icon={DollarSign}
            color={COLOR_PRIMARY}
            loading={isLoading}
            subtitle={`${MOIS_NOMS[mois]} ${annee}`}
          />
          <KPICard
            title="CA Moyen / PDV"
            formatted={formatCA(data.ca_moyen)}
            icon={DollarSign}
            color="#ffa502"
            loading={isLoading}
            subtitle={`Sur ${data.nb_pdv_actifs} PDVs actifs`}
          />
          <KPICard
            title="Évolution vs M-1"
            formatted={`${evolution >= 0 ? '+' : ''}${evolution}%`}
            icon={evolution >= 0 ? TrendingUp : TrendingDown}
            color={evolution >= 0 ? '#00d68f' : '#ff4757'}
            loading={isLoading}
            subtitle={`CA M-1 : ${formatCA(data.ca_mois_precedent)}`}
          />
        </div>

        <div style={{ fontSize: 12, color: '#3742fa', fontWeight: 700, marginBottom: 10 }}>📊 Activité Réseau</div>
        <div className="grid-3-kpi mb-8">
          <KPICard
            title="PDVs Actifs"
            value={data.nb_pdv_actifs}
            icon={Store}
            color="#3742fa"
            loading={isLoading}
            subtitle={`${MOIS_NOMS[mois]} ${annee}`}
          />
          <KPICard
            title="PDVs Inactifs"
            value={data.nb_pdv_inactifs}
            icon={AlertTriangle}
            color="#ff4757"
            loading={isLoading}
            subtitle="Actifs M-1 mais absents ce mois"
          />
          <KPICard
            title="Nouveaux PDVs"
            value={data.nb_nouveaux_pdv}
            icon={Activity}
            color="#a29bfe"
            loading={isLoading}
            subtitle="Absents M-1, actifs ce mois"
          />
        </div>
      </AccordionSection>

      {/* ══ SECTION 2 : Graphiques & Classement ══ */}
      <AccordionSection title="📈 Graphiques & Classement" defaultOpen={true}>

        {/* Graphique CA par Zone */}
        {caByZone.length > 0 && (
          <div className="card mb-16" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>📍 CA par Zone — {MOIS_NOMS[mois]} {annee}</h3>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(0,214,143,0.15)', color: COLOR_PRIMARY, fontWeight: 600 }}>{caByZone.length} zones</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={caByZone} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="zone" tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ca" name="CA" radius={[6,6,0,0]}>
                  {caByZone.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Graphiques CA par Superviseur + Gestionnaire */}
        <div style={{ display: 'grid', gridTemplateColumns: caByGest.length ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
          {caBySup.length > 0 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>👤 CA par Superviseur</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={caBySup} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                  <YAxis type="category" dataKey="sup" tick={{ fill: '#ccc', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ca" name="CA" fill={COLOR_PRIMARY} radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {caByGest.length > 0 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>🧑‍💼 CA par Gestionnaire</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={caByGest} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                  <YAxis type="category" dataKey="gest" tick={{ fill: '#ccc', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ca" name="CA" fill="#a29bfe" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Classement Superviseurs */}
        {classement.length > 0 && (
          <div className="card" style={{ padding: '16px 20px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🏆 Classement Superviseurs — {MOIS_NOMS[mois]} {annee}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>#</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Superviseur</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#00d68f' }}>PDVs Actifs</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#ff4757' }}>Inactifs</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: COLOR_PRIMARY }}>CA Total</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#8a8a9a' }}>Moy./PDV</th>
                  </tr>
                </thead>
                <tbody>
                  {classement.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#aaa' }}>
                        {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.superviseur}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#00d68f', fontWeight: 600 }}>{s.actifs}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: s.inactifs > 0 ? '#ff4757' : '#666', fontWeight: s.inactifs > 0 ? 600 : 400 }}>{s.inactifs}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(s.ca_total)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#aaa' }}>{formatCA(s.ca_moyen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AccordionSection>
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
