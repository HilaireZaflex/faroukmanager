import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, ComposedChart, AreaChart, Area
} from 'recharts';
import useAuthStore from '../store/authStore';
import api from '../services/api';

const COLOR_PRIMARY = '#00d68f';
const ZONE_COLORS = ['#00d68f', '#FF6900', '#3742fa', '#ffa502', '#ff4757', '#a29bfe', '#fd79a8', '#00cec9'];

function formatCA(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('fr-FR').format(Math.round(value)) + ' F';
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

// ─── Hook tri colonnes ───────────────────────────────────────────────────
function useSortable(defaultCol, defaultDir = 'desc') {
  const [sortCol, setSortCol] = React.useState(defaultCol);
  const [sortDir, setSortDir] = React.useState(defaultDir);
  const thSort = (col, label, color, align = 'right') => (
    <th onClick={() => { if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortCol(col); setSortDir('desc'); } }}
      style={{ padding: '10px 12px', textAlign: align, color: sortCol === col ? (color || COLOR_PRIMARY) : '#8a8a9a', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </th>
  );
  const sortFn = (a, b) => {
    const va = a[sortCol]; const vb = b[sortCol];
    if (typeof va === 'string') return sortDir === 'desc' ? (vb||'').localeCompare(va||'') : (va||'').localeCompare(vb||'');
    return sortDir === 'desc' ? (vb||0) - (va||0) : (va||0) - (vb||0);
  };
  return { sortCol, sortDir, thSort, sortFn };
}

// ─── Accordéon NAFAMA ─────────────────────────────────────────────────────
function NafamaSection({ title, defaultOpen = true, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: open ? 'linear-gradient(90deg, rgba(0,214,143,0.12) 0%, rgba(0,214,143,0.03) 100%)' : 'rgba(255,255,255,0.02)',
        border: 'none', borderLeft: `3px solid ${open ? COLOR_PRIMARY : 'rgba(0,214,143,0.2)'}`,
        borderRadius: '0 10px 10px 0', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 700, transition: 'all 0.25s',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {title}
          {badge && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: 'rgba(0,214,143,0.15)', color: COLOR_PRIMARY, border: '1px solid rgba(0,214,143,0.3)' }}>{badge}</span>}
        </span>
        <span style={{ fontSize: 14, color: COLOR_PRIMARY, transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.25s' }}>▼</span>
      </button>
      {open && <div style={{ paddingTop: 16 }}>{children}</div>}
    </div>
  );
}

// ─── KPI Card style NAFAMA ────────────────────────────────────────────────
function NafamaKPI({ label, value, icon, color, sub }) {
  return (
    <div className="card" style={{ textAlign: 'center', borderTop: `3px solid ${color}`, padding: '18px 12px' }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

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
    () => api.get(`/nafama/weekly/overview?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data || !data.nb_pdv_actifs) return <EmptyTab />;

  const evolution = data.evolution_pct || 0;

  const caByZone = Object.entries(data.ca_by_zone || {})
    .map(([zone, ca]) => ({ zone: zone.replace('Bamako ', 'Bko '), ca }))
    .sort((a, b) => b.ca - a.ca);

  const caBySup = Object.entries(data.ca_by_superviseur || {})
    .map(([sup, ca]) => ({ sup, ca }))
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 8);

  const classement = data.classement_superviseurs || [];
  const totalCA = data.ca_total || 1;

  return (
    <div>
      {/* ══ SECTION 1 : Volume Financier & Activité Réseau ══ */}
      <NafamaSection title="💰 Volume Financier & Activité Réseau" defaultOpen={true} badge={`Semaine ${semaine} · ${annee}`}>
        <div style={{ fontSize: 11, color: COLOR_PRIMARY, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, paddingLeft: 4 }}>
          Volume Financier
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <NafamaKPI label="CA Total" value={formatCA(data.ca_total)} icon="💰" color={COLOR_PRIMARY} sub={`Semaine ${semaine} · ${annee}`} />
          <NafamaKPI label="CA Moyen / PDV" value={formatCA(data.ca_moyen)} icon="📊" color="#ffa502" sub={`${data.nb_pdv_actifs} PDVs actifs`} />
          <NafamaKPI
            label="Évolution vs S-1"
            value={`${evolution >= 0 ? '+' : ''}${evolution}%`}
            icon={evolution >= 0 ? '📈' : '📉'}
            color={evolution >= 0 ? '#00d68f' : '#ff4757'}
            sub={`S-1 : ${formatCA(data.ca_semaine_precedente)}`}
          />
        </div>
        <div style={{ fontSize: 11, color: '#3742fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, paddingLeft: 4 }}>
          Activité Réseau
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <NafamaKPI label="PDVs Actifs" value={data.nb_pdv_actifs} icon="✅" color="#3742fa" sub={`Semaine ${semaine}`} />
          <NafamaKPI label="PDVs Inactifs" value={data.nb_pdv_inactifs} icon="😴" color="#ff4757" sub="Actifs S-1 absents" />
          <NafamaKPI label="Nouveaux PDVs" value={data.nb_nouveaux_pdv} icon="🆕" color="#a29bfe" sub="Apparus cette semaine" />
        </div>
      </NafamaSection>

      {/* ══ SECTION 2 : Graphiques & Classement ══ */}
      <NafamaSection title="📈 Graphiques & Classement" defaultOpen={true}>

        {/* AreaChart CA par Zone */}
        {caByZone.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, rgba(0,214,143,0.06) 0%, rgba(0,0,0,0) 60%)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700 }}>📍 CA par Zone</h3>
              <span style={{ fontSize: 11, color: COLOR_PRIMARY }}>Semaine {semaine} · {annee}</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={caByZone} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="nafamaWZoneGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d68f" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="zone" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="ca" name="CA" stroke={COLOR_PRIMARY} strokeWidth={2.5} fill="url(#nafamaWZoneGrad)" dot={{ r: 5, fill: COLOR_PRIMARY, strokeWidth: 2, stroke: '#0a0a1a' }} activeDot={{ r: 7 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Classement Superviseurs avec barres de progression */}
        {classement.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700 }}>🏆 Classement Superviseurs</h3>
              <span style={{ fontSize: 11, color: '#8a8a9a' }}>Semaine {semaine} · {annee}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {classement.map((s, i) => {
                const pct = Math.round(s.ca_total / totalCA * 100 * 10) / 10;
                const maxCA = classement[0]?.ca_total || 1;
                const barPct = Math.round(s.ca_total / maxCA * 100);
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <div key={i} style={{ padding: '10px 14px', background: i < 3 ? `rgba(0,214,143,${0.06 - i * 0.015})` : 'rgba(255,255,255,0.01)', borderRadius: 10, border: `1px solid ${i < 3 ? 'rgba(0,214,143,0.15)' : 'rgba(255,255,255,0.04)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 16, minWidth: 24 }}>{medal || <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>{i+1}</span>}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.superviseur}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: COLOR_PRIMARY }}>{formatCA(s.ca_total)}</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: `linear-gradient(90deg, ${COLOR_PRIMARY}, #00b377)`, borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: '#666' }}>
                      <span>✅ {s.actifs} actifs {s.inactifs > 0 ? <span style={{ color: '#ff4757' }}>· 😴 {s.inactifs} inactifs</span> : ''}</span>
                      <span style={{ color: '#8a8a9a' }}>{pct}% du CA · Moy. {formatCA(s.ca_moyen)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Volume par Superviseur — BarChart dégradé vert */}
        {caBySup.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>👤 Volume par Superviseur</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={caBySup} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="sup" tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} width={35} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ca" name="CA" radius={[6,6,0,0]}>
                  {caBySup.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? COLOR_PRIMARY : i === 1 ? '#00b377' : i === 2 ? '#009966' : `rgba(0,214,143,${0.5 - i * 0.05})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </NafamaSection>
    </div>
  );
}

// ─── Top PDVs hebdo ────────────────────────────────────────────────────────
function OngletTop({ annee, semaine }) {
  const [topN, setTopN] = useState(20);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [supFilter, setSupFilter] = useState('');
  const [quarFilter, setQuarFilter] = useState('');
  const [sortBy, setSortBy] = useState('ca_desc');
  const [selectedPDV, setSelectedPDV] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { thSort, sortFn } = useSortable('ca');

  const { data, isLoading } = useQuery(
    ['nafama-w-top', annee, semaine, topN],
    () => api.get(`/nafama/weekly/top?annee=${annee}&semaine=${semaine}&limit=${topN}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  const loadHistory = async (numeroPdv) => {
    if (selectedPDV === numeroPdv) { setSelectedPDV(null); setHistoryData([]); return; }
    setLoadingHistory(true);
    setHistoryData([]);
    try {
      const res = await api.get(`/nafama/pdv/${numeroPdv}/weekly-history`);
      setHistoryData(res.data || []);
      setSelectedPDV(numeroPdv);
    } catch (e) { console.error(e); }
    finally { setLoadingHistory(false); }
  };

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyTab />;

  const zoneList = [...new Set(data.map(p => p.zone).filter(z => z && z !== '—'))].sort();
  const supList = [...new Set(data.filter(p => !zoneFilter || p.zone === zoneFilter).map(p => p.superviseur).filter(s => s && s !== '—'))].sort();
  const quarList = [...new Set(data.filter(p => (!zoneFilter || p.zone === zoneFilter) && (!supFilter || p.superviseur === supFilter)).map(p => p.quartier).filter(q => q && q !== '—'))].sort();

  const filtered = data
    .filter(p => !zoneFilter || p.zone === zoneFilter)
    .filter(p => !supFilter || p.superviseur === supFilter)
    .filter(p => !quarFilter || p.quartier === quarFilter)
    .filter(p => !search ||
      (p.numero_pdv || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.nom || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.superviseur || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'ca_asc') return a.ca - b.ca;
      if (sortBy === 'nom_asc') return (a.nom || '').localeCompare(b.nom || '');
      if (sortBy === 'zone_asc') return (a.zone || '').localeCompare(b.zone || '');
      if (sortBy === 'sup_asc') return (a.superviseur || '').localeCompare(b.superviseur || '');
      if (sortBy === 'evol_desc') return (b.evolution_pct ?? -999) - (a.evolution_pct ?? -999);
      return b.ca - a.ca;
    });

  const selectedPDVData = data.find(p => p.numero_pdv === selectedPDV);

  const selectStyle = {
    padding: '9px 10px', background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8,
    color: '#ddd', fontSize: 12, cursor: 'pointer', outline: 'none', minWidth: 0,
  };

  return (
    <div>
      {/* Seuil */}
      <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#8a8a9a', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Seuil : <span style={{ color: COLOR_PRIMARY, fontWeight: 800 }}>Top {topN}</span>
          </span>
          <input type="range" min="10" max="100" step="10" value={topN}
            onChange={e => setTopN(parseInt(e.target.value))}
            style={{ flex: 1, accentColor: COLOR_PRIMARY, height: 4 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[10,20,30,50,100].map(v => (
              <button key={v} onClick={() => setTopN(v)}
                style={{ padding: '3px 8px', fontSize: 11, borderRadius: 6, border: `1px solid ${topN === v ? COLOR_PRIMARY : 'rgba(255,255,255,0.1)'}`, background: topN === v ? 'rgba(0,214,143,0.15)' : 'transparent', color: topN === v ? COLOR_PRIMARY : '#888', cursor: 'pointer', fontWeight: topN === v ? 700 : 400 }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Barre de filtres — tout sur une ligne */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ flex: 2, minWidth: 140, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#8a8a9a' }}>🔍</span>
          <input type="text" placeholder="PDV, numéro, superviseur..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...selectStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box', background: 'transparent', border: 'none', borderRight: '1px solid rgba(0,214,143,0.12)', borderRadius: 0, paddingRight: 8 }} />
        </div>
        <select value={zoneFilter} onChange={e => { setZoneFilter(e.target.value); setSupFilter(''); setQuarFilter(''); }} style={selectStyle}>
          <option value="">📍 Zone</option>
          {zoneList.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={supFilter} onChange={e => { setSupFilter(e.target.value); setQuarFilter(''); }} style={selectStyle}>
          <option value="">👤 Superviseur</option>
          {supList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={quarFilter} onChange={e => setQuarFilter(e.target.value)} style={selectStyle}>
          <option value="">🏘️ Quartier</option>
          {quarList.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...selectStyle, borderLeft: '1px solid rgba(0,214,143,0.12)' }}>
          <option value="ca_desc">↓ CA max</option>
          <option value="ca_asc">↑ CA min</option>
          <option value="evol_desc">↓ Évolution</option>
          <option value="nom_asc">↑ Nom</option>
          <option value="zone_asc">↑ Zone</option>
          <option value="sup_asc">↑ Superviseur</option>
        </select>
        {(search || zoneFilter || supFilter || quarFilter) && (
          <button onClick={() => { setSearch(''); setZoneFilter(''); setSupFilter(''); setQuarFilter(''); }}
            style={{ padding: '7px 10px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, color: '#ff4757', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
            ✕
          </button>
        )}
      </div>

      {/* Courbe d'évolution hebdo */}
      {selectedPDV && historyData.length > 0 && (
        <div style={{ marginBottom: 16, padding: '18px 20px', background: 'linear-gradient(135deg, rgba(0,214,143,0.06) 0%, rgba(0,0,0,0) 60%)', borderRadius: 14, border: '1px solid rgba(0,214,143,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>📈 Évolution hebdomadaire — {selectedPDVData?.nom || selectedPDV}</h3>
              <p style={{ fontSize: 11, color: '#8a8a9a', marginTop: 3 }}>{selectedPDVData?.superviseur} · {selectedPDVData?.zone}</p>
            </div>
            <button onClick={() => { setSelectedPDV(null); setHistoryData([]); }}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 18, borderRadius: 8, width: 32, height: 32 }}>✕</button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={historyData}>
              <defs>
                <linearGradient id="nafamaWHistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d68f" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} width={45} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ca" name="CA" stroke={COLOR_PRIMARY} fill="url(#nafamaWHistGrad)" strokeWidth={2.5} dot={{ r: 4, fill: COLOR_PRIMARY, stroke: '#0a0a1a', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>🏆 Top {topN} PDVs — Semaine {semaine} · {annee}</span>
          <span style={{ fontSize: 12, color: COLOR_PRIMARY }}>{filtered.length} résultats</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a', fontWeight: 600 }}>#</th>
                {thSort('numero_pdv', 'PDV', '#8a8a9a', 'left')}
                {thSort('ca', 'CA', COLOR_PRIMARY, 'right')}
                {thSort('zone', 'Zone', '#8a8a9a', 'left')}
                {thSort('superviseur', 'Superviseur', '#8a8a9a', 'left')}
                {thSort('gestionnaire', 'Gestionnaire', '#8a8a9a', 'left')}
                {thSort('evolution_pct', 'Évolution vs S-1', '#8a8a9a', 'center')}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a', fontWeight: 600 }}>Courbe</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort(sortFn).map((pdv, i) => {
                const evol = pdv.evolution_pct;
                const isSelected = selectedPDV === pdv.numero_pdv;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isSelected ? 'rgba(0,214,143,0.05)' : 'transparent', transition: 'background 0.2s' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: pdv.rang <= 3 ? COLOR_PRIMARY : '#666' }}>
                      {pdv.rang === 1 ? '🥇' : pdv.rang === 2 ? '🥈' : pdv.rang === 3 ? '🥉' : pdv.rang}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{pdv.numero_pdv}</div>
                      <div style={{ fontSize: 11, color: '#8a8a9a' }}>{pdv.nom !== pdv.numero_pdv ? pdv.nom : ''}</div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(pdv.ca)}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc' }}>{pdv.zone}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc' }}>{pdv.superviseur}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc' }}>{pdv.gestionnaire}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {evol !== null && evol !== undefined ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: evol >= 0 ? '#00d68f' : '#ff4757' }}>
                          {evol >= 0 ? '▲' : '▼'} {Math.abs(evol)}%
                        </span>
                      ) : <span style={{ color: '#555' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button onClick={() => loadHistory(pdv.numero_pdv)}
                        style={{ cursor: 'pointer', background: isSelected ? 'rgba(0,214,143,0.2)' : 'rgba(0,214,143,0.08)', border: `1px solid ${isSelected ? 'rgba(0,214,143,0.5)' : 'rgba(0,214,143,0.2)'}`, borderRadius: 7, color: COLOR_PRIMARY, padding: '5px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {loadingHistory && isSelected ? '⏳' : '📊'} {isSelected ? 'Fermer' : 'Voir'}
                      </button>
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

// ─── Pareto hebdo ──────────────────────────────────────────────────────────
function OngletPareto({ annee, semaine }) {
  const [activeFilter, setActiveFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [supFilter, setSupFilter] = useState('');
  const [quarFilter, setQuarFilter] = useState('');
  const { thSort: thSortP, sortFn: sortFnP } = useSortable('ca');

  const { data, isLoading } = useQuery(
    ['nafama-w-pareto', annee, semaine],
    () => api.get(`/nafama/weekly/pareto?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.items?.length) return <EmptyTab />;

  const allItems = data.items || [];
  const zoneList = [...new Set(allItems.map(p => p.zone).filter(z => z && z !== '—'))].sort();
  const supList = [...new Set(allItems.filter(p => !zoneFilter || p.zone === zoneFilter).map(p => p.superviseur).filter(s => s && s !== '—'))].sort();
  const quarList = [...new Set(allItems.filter(p => (!zoneFilter || p.zone === zoneFilter) && (!supFilter || p.superviseur === supFilter)).map(p => p.quartier).filter(q => q && q !== '—'))].sort();

  const filtered = allItems
    .filter(p => !zoneFilter || p.zone === zoneFilter)
    .filter(p => !supFilter || p.superviseur === supFilter)
    .filter(p => !quarFilter || p.quartier === quarFilter)
    .filter(p => activeFilter === 'fort' ? p.dans_pareto : activeFilter === 'faible' ? !p.dans_pareto : true)
    .filter(p => !search || (p.numero_pdv||'').toLowerCase().includes(search.toLowerCase()) || (p.nom||'').toLowerCase().includes(search.toLowerCase()) || (p.superviseur||'').toLowerCase().includes(search.toLowerCase()));

  const fortCA = allItems.filter(p => p.dans_pareto).reduce((s, p) => s + p.ca, 0);
  const faibleCA = allItems.filter(p => !p.dans_pareto).reduce((s, p) => s + p.ca, 0);
  const chartData = allItems.slice(0, 50);

  const selectStyle = { padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: '#ddd', fontSize: 12, cursor: 'pointer', outline: 'none', minWidth: 0 };

  return (
    <div>
      {/* KPIs Fort / Faible — cliquables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div onClick={() => setActiveFilter(f => f === 'fort' ? null : 'fort')}
          style={{ padding: '18px 20px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
            background: activeFilter === 'fort' ? 'rgba(0,214,143,0.15)' : 'rgba(0,0,0,0.25)',
            border: `2px solid ${activeFilter === 'fort' ? COLOR_PRIMARY : 'rgba(0,214,143,0.15)'}`,
            transform: activeFilter === 'fort' ? 'scale(1.02)' : 'scale(1)' }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>💪 Fort Impact (Pareto 80%)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: COLOR_PRIMARY }}>{formatCA(fortCA)}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 6 }}>{data.nb_pdv_pareto} PDVs · {data.seuil_80_pct}% du réseau</div>
          {activeFilter === 'fort' && <div style={{ fontSize: 11, color: COLOR_PRIMARY, marginTop: 4 }}>✓ Filtre actif — cliquer pour enlever</div>}
        </div>
        <div onClick={() => setActiveFilter(f => f === 'faible' ? null : 'faible')}
          style={{ padding: '18px 20px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
            background: activeFilter === 'faible' ? 'rgba(255,165,2,0.1)' : 'rgba(0,0,0,0.25)',
            border: `2px solid ${activeFilter === 'faible' ? '#ffa502' : 'rgba(255,165,2,0.15)'}`,
            transform: activeFilter === 'faible' ? 'scale(1.02)' : 'scale(1)' }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>📉 Faible Impact</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#ffa502' }}>{formatCA(faibleCA)}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 6 }}>Gini : {data.gini_coefficient} · {data.nb_pdv_total - data.nb_pdv_pareto} PDVs</div>
          {activeFilter === 'faible' && <div style={{ fontSize: 11, color: '#ffa502', marginTop: 4 }}>✓ Filtre actif — cliquer pour enlever</div>}
        </div>
      </div>

      {/* Graphique */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,214,143,0.05) 0%, rgba(0,0,0,0) 60%)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700 }}>📊 Courbe Pareto — Semaine {semaine} · {annee}</h3>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#8a8a9a' }}>
            <span>🟢 CA <span style={{ color: COLOR_PRIMARY }}>par PDV</span></span>
            <span>🟡 <span style={{ color: '#ffa502' }}>Cumul %</span></span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="nafamaWParetoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d68f" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d68f" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="numero_pdv" tick={false} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} width={40} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={35} />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="left" dataKey="ca" name="CA" fill="url(#nafamaWParetoGrad)" stroke={COLOR_PRIMARY} strokeWidth={0.5} radius={[3,3,0,0]} />
            <Line yAxisId="right" type="monotone" dataKey="cumul_pct" name="Cumul %" stroke="#ffa502" dot={false} strokeWidth={2.5} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#8a8a9a' }}>
          <div style={{ width: 30, height: 2, background: '#ffa502', borderRadius: 2 }} />
          <span>80% du CA atteint au <strong style={{ color: COLOR_PRIMARY }}>{data.nb_pdv_pareto}ème PDV</strong> ({data.seuil_80_pct}% du réseau)</span>
        </div>
      </div>

      {/* Barre de filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ flex: 2, minWidth: 140, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#8a8a9a' }}>🔍</span>
          <input type="text" placeholder="PDV, numéro, superviseur..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...selectStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box', background: 'transparent', border: 'none', borderRight: '1px solid rgba(0,214,143,0.12)', borderRadius: 0, paddingRight: 8 }} />
        </div>
        <select value={zoneFilter} onChange={e => { setZoneFilter(e.target.value); setSupFilter(''); setQuarFilter(''); }} style={selectStyle}>
          <option value="">📍 Zone</option>
          {zoneList.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={supFilter} onChange={e => { setSupFilter(e.target.value); setQuarFilter(''); }} style={selectStyle}>
          <option value="">👤 Superviseur</option>
          {supList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={quarFilter} onChange={e => setQuarFilter(e.target.value)} style={selectStyle}>
          <option value="">🏘️ Quartier</option>
          {quarList.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        {(search || zoneFilter || supFilter || quarFilter || activeFilter) && (
          <button onClick={() => { setSearch(''); setZoneFilter(''); setSupFilter(''); setQuarFilter(''); setActiveFilter(null); }}
            style={{ padding: '7px 10px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, color: '#ff4757', cursor: 'pointer', fontSize: 13 }}>✕</button>
        )}
      </div>

      {/* Tableau */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>📋 Liste PDVs — Semaine {semaine} · {annee}</span>
          <span style={{ fontSize: 12, color: COLOR_PRIMARY }}>{filtered.length} PDVs affichés</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Rang</th>
                {thSortP('numero_pdv', 'PDV', '#8a8a9a', 'left')}
                {thSortP('zone', 'Zone', '#8a8a9a', 'left')}
                {thSortP('superviseur', 'Superviseur', '#8a8a9a', 'left')}
                {thSortP('ca', 'CA', COLOR_PRIMARY, 'right')}
                {thSortP('pct_ca', '% CA', '#8a8a9a', 'right')}
                {thSortP('cumul_pct', 'Cumul %', '#ffa502', 'right')}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Impact</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort(sortFnP).map((pdv, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: pdv.dans_pareto ? 'rgba(0,214,143,0.02)' : 'transparent' }}>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: '#666', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{pdv.numero_pdv}</div>
                    <div style={{ fontSize: 10, color: '#8a8a9a' }}>{pdv.nom !== pdv.numero_pdv ? pdv.nom : ''}</div>
                  </td>
                  <td style={{ padding: '9px 12px', color: '#ccc', fontSize: 11 }}>{pdv.zone}</td>
                  <td style={{ padding: '9px 12px', color: '#ccc', fontSize: 11 }}>{pdv.superviseur}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(pdv.ca)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#8a8a9a' }}>{pdv.pct_ca}%</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: pdv.cumul_pct <= 80 ? '#ffa502' : '#555' }}>{pdv.cumul_pct}%</td>
                  <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                      background: pdv.dans_pareto ? 'rgba(0,214,143,0.15)' : 'rgba(255,165,2,0.1)',
                      color: pdv.dans_pareto ? COLOR_PRIMARY : '#ffa502' }}>
                      {pdv.dans_pareto ? '💪 Fort' : '📉 Faible'}
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

// ─── Évolution hebdo ───────────────────────────────────────────────────────
function OngletEvolution({ annee, semaine }) {
  const [activeSub, setActiveSub] = useState('pdvs');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const { thSort: thSortE, sortFn: sortFnE } = useSortable('ca_actuel');

  const { data: graph } = useQuery(
    ['nafama-w-evolution-graph', annee],
    () => api.get(`/nafama/weekly/evolution?annee=${annee}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  const { data: detail, isLoading: loadingDetail } = useQuery(
    ['nafama-w-evolution-detail', annee, semaine],
    () => api.get(`/nafama/weekly/evolution-detail?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  const semPrec = detail?.semaine_prec || (semaine > 1 ? semaine - 1 : 52);
  const anneePrec = detail?.annee_prec || annee;

  const dataToShow = activeSub === 'pdvs' ? (detail?.par_pdv || [])
    : activeSub === 'superviseurs' ? (detail?.par_superviseur || [])
    : (detail?.par_gestionnaire || []);

  const filtered = dataToShow.filter(row => !search ||
    (row.numero_pdv||'').toLowerCase().includes(search.toLowerCase()) ||
    (row.nom||row.superviseur||row.gestionnaire||'').toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const displayed = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const totalActuel = detail?.total_ca_actuel || 0;
  const totalPrec = detail?.total_ca_precedent || 0;
  const totalVar = detail?.total_variation || 0;
  const totalTaux = detail?.total_taux || 0;

  const selectStyle = { padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: '#ddd', fontSize: 12, cursor: 'pointer', outline: 'none' };

  return (
    <div>
      {/* KPIs 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: `CA S${semaine} ${annee}`, value: formatCA(totalActuel), color: COLOR_PRIMARY },
          { label: `CA S${semPrec} ${anneePrec}`, value: formatCA(totalPrec), color: '#ffa502' },
          { label: 'Variation', value: `${totalVar >= 0 ? '+' : ''}${formatCA(totalVar)}`, color: totalVar >= 0 ? COLOR_PRIMARY : '#ff4757' },
          { label: 'Taux Global', value: `${totalTaux >= 0 ? '▲' : '▼'} ${Math.abs(totalTaux)}%`, color: totalTaux >= 0 ? COLOR_PRIMARY : '#ff4757' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.25)', border: `1px solid rgba(0,214,143,0.15)`, borderLeft: `3px solid ${k.color}`, borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Graphique hebdo annuel */}
      {graph?.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, rgba(0,214,143,0.05) 0%, rgba(0,0,0,0) 60%)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📈 CA par Semaine — {annee}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={graph}>
              <defs>
                <linearGradient id="nafamaWEvolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d68f" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1_000_000).toFixed(0)}M`} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ca" name="CA" stroke={COLOR_PRIMARY} fill="url(#nafamaWEvolGrad)" strokeWidth={2.5} dot={{ r: 4, fill: COLOR_PRIMARY, stroke: '#0a0a1a', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sous-onglets */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 5 }}>
        {[['pdvs','👥 PDVs'], ['superviseurs','👤 Superviseurs'], ['gestionnaires','🧑‍💼 Gestionnaires']].map(([key, label]) => (
          <button key={key} onClick={() => { setActiveSub(key); setPage(1); }}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: activeSub === key ? COLOR_PRIMARY : 'transparent',
              color: activeSub === key ? '#fff' : '#8a8a9a', transition: 'all 0.2s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#8a8a9a' }}>🔍</span>
          <input type="text" placeholder="Rechercher PDV, nom, superviseur..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ ...selectStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box', background: 'transparent', border: 'none' }} />
        </div>
        {search && <button onClick={() => { setSearch(''); setPage(1); }} style={{ padding: '7px 10px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, color: '#ff4757', cursor: 'pointer', fontSize: 13 }}>✕</button>}
      </div>

      {/* Tableau */}
      {loadingDetail ? <div className="loading-spinner" style={{ margin: '40px auto' }} /> : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>📋 {activeSub === 'pdvs' ? 'Par PDV' : activeSub === 'superviseurs' ? 'Par Superviseur' : 'Par Gestionnaire'}</span>
            <span style={{ fontSize: 12, color: COLOR_PRIMARY }}>{filtered.length} résultats</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Rang</th>
                  {thSortE('numero_pdv', 'Nom', '#8a8a9a', 'left')}
                  {thSortE('ca_actuel', `CA S${semaine}`, COLOR_PRIMARY, 'right')}
                  {thSortE('ca_precedent', `CA S${semPrec}`, '#ffa502', 'right')}
                  {thSortE('variation', 'Variation', '#8a8a9a', 'right')}
                  {thSortE('taux', 'Taux', '#8a8a9a', 'center')}
                </tr>
              </thead>
              <tbody>
                {[...displayed].sort(sortFnE).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: '#666', fontWeight: 700 }}>{(page-1)*PAGE_SIZE + i + 1}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {activeSub === 'pdvs' ? (
                        <>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>{row.numero_pdv}</div>
                          <div style={{ fontSize: 10, color: '#8a8a9a' }}>{row.nom !== row.numero_pdv ? row.nom : ''}</div>
                        </>
                      ) : <div style={{ fontWeight: 700 }}>{row.superviseur || row.gestionnaire}</div>}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(row.ca_actuel)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ffa502' }}>{formatCA(row.ca_precedent)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: row.variation >= 0 ? '#00d68f' : '#ff4757', fontWeight: 600 }}>
                      {row.variation >= 0 ? '+' : ''}{formatCA(row.variation)}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: row.taux >= 0 ? 'rgba(0,214,143,0.12)' : 'rgba(255,71,87,0.12)',
                        color: row.taux >= 0 ? COLOR_PRIMARY : '#ff4757' }}>
                        {row.taux >= 0 ? '▲' : '▼'} {Math.abs(row.taux)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 12, color: '#8a8a9a' }}>Page {page} / {totalPages} · {filtered.length} résultats</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                  style={{ padding: '6px 14px', background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: COLOR_PRIMARY, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>← Préc.</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                  style={{ padding: '6px 14px', background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: COLOR_PRIMARY, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page === totalPages ? 0.4 : 1 }}>Suiv. →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inactifs hebdo ────────────────────────────────────────────────────────
function OngletInactifs({ annee, semaine, teleFilter }) {
  const [activeFilter, setActiveFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [supFilter, setSupFilter] = useState('');
  // Note: teleFilter est utilisé pour filtrer les données par téléconseillère
  const { thSort: thSortI, sortFn: sortFnI } = useSortable('ca_semaine_precedente');

  const { data, isLoading } = useQuery(
    ['nafama-w-inactifs', annee, semaine],
    () => api.get(`/nafama/weekly/inactive?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;

  const allPdvs = data?.pdvs || [];
  // Filtrer par téléconseillère
  const pdvs = teleFilter
    ? allPdvs.filter(p => (p.teleconseillere || '').toLowerCase().includes(teleFilter.toLowerCase()))
    : allPdvs;
  if (!pdvs.length && !isLoading) return <EmptyTab message="✅ Aucun PDV inactif cette semaine !" />;

  const zoneList = [...new Set(pdvs.map(p => p.zone).filter(z => z && z !== '—'))].sort();
  const supList = [...new Set(pdvs.filter(p => !zoneFilter || p.zone === zoneFilter).map(p => p.superviseur).filter(s => s && s !== '—'))].sort();

  const displayed = pdvs
    .filter(p => activeFilter === 'critique' ? p.nb_semaines_consecutives_inactif >= 3 : activeFilter === 'haute' ? p.nb_semaines_consecutives_inactif === 2 : activeFilter === 'normale' ? p.nb_semaines_consecutives_inactif === 1 : true)
    .filter(p => !zoneFilter || p.zone === zoneFilter)
    .filter(p => !supFilter || p.superviseur === supFilter)
    .filter(p => !search || (p.numero_pdv||'').toLowerCase().includes(search.toLowerCase()) || (p.nom||'').toLowerCase().includes(search.toLowerCase()) || (p.superviseur||'').toLowerCase().includes(search.toLowerCase()));

  const selectStyle = { padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: '#ddd', fontSize: 12, cursor: 'pointer', outline: 'none', minWidth: 0 };

  const kpis = [
    { label: 'Total Inactifs', value: data?.total || 0, color: '#ff4757', filter: null },
    { label: '🔴 Critique (≥3 sem)', value: data?.nb_critique || 0, color: '#ff4757', filter: 'critique' },
    { label: '🟠 Haute (2 sem)', value: data?.nb_haute || 0, color: '#ffa502', filter: 'haute' },
    { label: '⚪ Normale (1 sem)', value: data?.nb_normale || 0, color: '#8a8a9a', filter: 'normale' },
  ];

  return (
    <div>
      {/* KPIs cliquables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <div key={i} onClick={() => setActiveFilter(f => f === k.filter ? null : k.filter)}
            style={{ padding: '16px 18px', background: activeFilter === k.filter ? `rgba(${k.color === '#ff4757' ? '255,71,87' : k.color === '#ffa502' ? '255,165,2' : '138,138,154'},0.12)` : 'rgba(0,0,0,0.25)',
              border: `2px solid ${activeFilter === k.filter ? k.color : `rgba(${k.color === '#ff4757' ? '255,71,87' : k.color === '#ffa502' ? '255,165,2' : '138,138,154'},0.2)`}`,
              borderLeft: `4px solid ${k.color}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
              transform: activeFilter === k.filter ? 'scale(1.02)' : 'scale(1)' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
            {activeFilter === k.filter && <div style={{ fontSize: 10, color: k.color, marginTop: 4 }}>✓ Filtre actif</div>}
          </div>
        ))}
      </div>

      {/* Barre de filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ flex: 2, minWidth: 140, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#8a8a9a' }}>🔍</span>
          <input type="text" placeholder="PDV, numéro, superviseur..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...selectStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box', background: 'transparent', border: 'none', borderRight: '1px solid rgba(0,214,143,0.12)', borderRadius: 0, paddingRight: 8 }} />
        </div>
        <select value={zoneFilter} onChange={e => { setZoneFilter(e.target.value); setSupFilter(''); }} style={selectStyle}>
          <option value="">📍 Zone</option>
          {zoneList.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={supFilter} onChange={e => setSupFilter(e.target.value)} style={selectStyle}>
          <option value="">👤 Superviseur</option>
          {supList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || zoneFilter || supFilter || activeFilter) && (
          <button onClick={() => { setSearch(''); setZoneFilter(''); setSupFilter(''); setActiveFilter(null); }}
            style={{ padding: '7px 10px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, color: '#ff4757', cursor: 'pointer', fontSize: 13 }}>✕</button>
        )}
      </div>

      {/* Tableau */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>😴 PDVs Inactifs — Semaine {semaine} · {annee}</span>
          <span style={{ fontSize: 12, color: '#ff4757' }}>{displayed.length} PDVs</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {thSortI('numero_pdv', 'PDV', '#8a8a9a', 'left')}
                {thSortI('zone', 'Zone', '#8a8a9a', 'left')}
                {thSortI('superviseur', 'Superviseur', '#8a8a9a', 'left')}
                {thSortI('gestionnaire', 'Gestionnaire', '#8a8a9a', 'left')}
                {thSortI('ca_semaine_precedente', 'CA Sem. Préc.', '#ffa502', 'right')}
                {thSortI('nb_semaines_consecutives_inactif', 'Sem. Inactif', '#8a8a9a', 'center')}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Alerte</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#00d68f' }}>✅ Aucun PDV inactif avec ces filtres</td></tr>
              ) : [...displayed].sort(sortFnI).map((p, i) => {
                const nb = p.nb_semaines_consecutives_inactif;
                const alertColor = nb >= 3 ? '#ff4757' : nb === 2 ? '#ffa502' : '#8a8a9a';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: nb >= 3 ? 'rgba(255,71,87,0.03)' : 'transparent' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.numero_pdv}</div>
                      <div style={{ fontSize: 10, color: '#8a8a9a' }}>{p.nom !== p.numero_pdv ? p.nom : ''}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#ccc', fontSize: 11 }}>{p.zone}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc', fontSize: 11 }}>{p.superviseur}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc', fontSize: 11 }}>{p.gestionnaire}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#ffa502' }}>{formatCA(p.ca_semaine_precedente)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: alertColor, fontSize: 16 }}>{nb}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `rgba(${nb >= 3 ? '255,71,87' : nb === 2 ? '255,165,2' : '138,138,154'},0.12)`, color: alertColor }}>
                        {p.alerte}
                      </span>
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

// ─── En Baisse hebdo ───────────────────────────────────────────────────────
function OngletBaisse({ annee, semaine, teleFilter }) {
  const [seuil, setSeuil] = useState(10);
  const [activeFilter, setActiveFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [supFilter, setSupFilter] = useState('');
  const { thSort: thSortD, sortFn: sortFnD } = useSortable('variation_pct');

  const { data, isLoading } = useQuery(
    ['nafama-w-baisse', annee, semaine, seuil],
    () => api.get(`/nafama/weekly/declining?annee=${annee}&semaine=${semaine}&seuil=${-seuil}`).then(r => r.data),
    { staleTime: 60000, retry: false }
  );

  const allPdvsB = data?.pdvs || [];
  const pdvs = teleFilter
    ? allPdvsB.filter(p => (p.teleconseillere || '').toLowerCase().includes(teleFilter.toLowerCase()))
    : allPdvsB;
  const zoneList = [...new Set(pdvs.map(p => p.zone).filter(z => z && z !== '—'))].sort();
  const supList = [...new Set(pdvs.filter(p => !zoneFilter || p.zone === zoneFilter).map(p => p.superviseur).filter(s => s && s !== '—'))].sort();

  const displayed = pdvs
    .filter(p => {
      const abs = Math.abs(p.variation_pct);
      if (activeFilter === 'critique') return abs > 30;
      if (activeFilter === 'haute') return abs > 15 && abs <= 30;
      if (activeFilter === 'normale') return abs <= 15;
      return true;
    })
    .filter(p => !zoneFilter || p.zone === zoneFilter)
    .filter(p => !supFilter || p.superviseur === supFilter)
    .filter(p => !search || (p.numero_pdv||'').toLowerCase().includes(search.toLowerCase()) || (p.nom||'').toLowerCase().includes(search.toLowerCase()) || (p.superviseur||'').toLowerCase().includes(search.toLowerCase()));

  const selectStyle = { padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: '#ddd', fontSize: 12, cursor: 'pointer', outline: 'none', minWidth: 0 };

  const kpis = [
    { label: `Total en Baisse (≥${seuil}%)`, value: data?.total || 0, color: '#ff4757', filter: null },
    { label: '🔴 Critique (>30%)', value: data?.nb_critique || 0, color: '#ff4757', filter: 'critique' },
    { label: '🟠 Haute (15-30%)', value: data?.nb_haute || 0, color: '#ffa502', filter: 'haute' },
    { label: '⚪ Normale (≤15%)', value: data?.nb_normale || 0, color: '#8a8a9a', filter: 'normale' },
  ];

  if (!data?.pdvs?.length && !isLoading) return (
    <div>
      <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#8a8a9a', fontWeight: 600, whiteSpace: 'nowrap' }}>Seuil : <span style={{ color: '#ff4757', fontWeight: 800 }}>{seuil}%</span></span>
          <input type="range" min="5" max="50" step="5" value={seuil} onChange={e => setSeuil(parseInt(e.target.value))} style={{ flex: 1, accentColor: '#ff4757' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[5,10,15,20,30].map(v => <button key={v} onClick={() => setSeuil(v)} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 6, border: `1px solid ${seuil===v?'#ff4757':'rgba(255,255,255,0.1)'}`, background: seuil===v?'rgba(255,71,87,0.15)':'transparent', color: seuil===v?'#ff4757':'#888', cursor: 'pointer' }}>{v}%</button>)}
          </div>
        </div>
      </div>
      <EmptyTab message={`✅ Aucun PDV en baisse de plus de ${seuil}% cette semaine`} />
    </div>
  );

  return (
    <div>
      {/* KPIs cliquables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <div key={i} onClick={() => setActiveFilter(f => f === k.filter ? null : k.filter)}
            style={{ padding: '16px 18px', background: activeFilter === k.filter ? `rgba(${k.color==='#ff4757'?'255,71,87':k.color==='#ffa502'?'255,165,2':'138,138,154'},0.12)` : 'rgba(0,0,0,0.25)',
              border: `2px solid ${activeFilter === k.filter ? k.color : `rgba(${k.color==='#ff4757'?'255,71,87':k.color==='#ffa502'?'255,165,2':'138,138,154'},0.2)`}`,
              borderLeft: `4px solid ${k.color}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s', transform: activeFilter === k.filter ? 'scale(1.02)' : 'scale(1)' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
            {activeFilter === k.filter && <div style={{ fontSize: 10, color: k.color, marginTop: 4 }}>✓ Filtre actif</div>}
          </div>
        ))}
      </div>

      {/* Seuil */}
      <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#8a8a9a', fontWeight: 600, whiteSpace: 'nowrap' }}>Seuil : <span style={{ color: '#ff4757', fontWeight: 800 }}>{seuil}%</span></span>
          <input type="range" min="5" max="50" step="5" value={seuil} onChange={e => setSeuil(parseInt(e.target.value))} style={{ flex: 1, accentColor: '#ff4757' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[5,10,15,20,30].map(v => <button key={v} onClick={() => setSeuil(v)} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 6, border: `1px solid ${seuil===v?'#ff4757':'rgba(255,255,255,0.1)'}`, background: seuil===v?'rgba(255,71,87,0.15)':'transparent', color: seuil===v?'#ff4757':'#888', cursor: 'pointer', fontWeight: seuil===v?700:400 }}>{v}%</button>)}
          </div>
        </div>
      </div>

      {/* Barre de filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ flex: 2, minWidth: 140, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#8a8a9a' }}>🔍</span>
          <input type="text" placeholder="PDV, numéro, superviseur..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...selectStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box', background: 'transparent', border: 'none', borderRight: '1px solid rgba(0,214,143,0.12)', borderRadius: 0, paddingRight: 8 }} />
        </div>
        <select value={zoneFilter} onChange={e => { setZoneFilter(e.target.value); setSupFilter(''); }} style={selectStyle}>
          <option value="">📍 Zone</option>
          {zoneList.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={supFilter} onChange={e => setSupFilter(e.target.value)} style={selectStyle}>
          <option value="">👤 Superviseur</option>
          {supList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || zoneFilter || supFilter || activeFilter) && (
          <button onClick={() => { setSearch(''); setZoneFilter(''); setSupFilter(''); setActiveFilter(null); }}
            style={{ padding: '7px 10px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, color: '#ff4757', cursor: 'pointer', fontSize: 13 }}>✕</button>
        )}
      </div>

      {/* Tableau */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>📉 PDVs En Baisse — Semaine {semaine} · {annee}</span>
          <span style={{ fontSize: 12, color: '#ff4757' }}>{displayed.length} PDVs</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {thSortD('numero_pdv', 'PDV', '#8a8a9a', 'left')}
                {thSortD('zone', 'Zone', '#8a8a9a', 'left')}
                {thSortD('superviseur', 'Superviseur', '#8a8a9a', 'left')}
                {thSortD('ca_actuel', 'CA Actuel', COLOR_PRIMARY, 'right')}
                {thSortD('ca_precedent', 'CA S-1', '#ffa502', 'right')}
                {thSortD('variation_pct', 'Baisse', '#ff4757', 'center')}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Alerte</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Action recommandée</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#8a8a9a' }}>Chargement...</td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#00d68f' }}>✅ Aucun PDV avec ces filtres</td></tr>
              ) : [...displayed].sort(sortFnD).map((p, i) => {
                const abs = Math.abs(p.variation_pct);
                const alertColor = abs > 30 ? '#ff4757' : abs > 15 ? '#ffa502' : '#8a8a9a';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: abs > 30 ? 'rgba(255,71,87,0.03)' : 'transparent' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.numero_pdv}</div>
                      <div style={{ fontSize: 10, color: '#8a8a9a' }}>{p.nom !== p.numero_pdv ? p.nom : ''}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#ccc', fontSize: 11 }}>{p.zone}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc', fontSize: 11 }}>{p.superviseur}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(p.ca_actuel)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ffa502' }}>{formatCA(p.ca_precedent)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#ff4757' }}>▼ {abs}%</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: `rgba(${abs>30?'255,71,87':abs>15?'255,165,2':'138,138,154'},0.12)`, color: alertColor }}>
                        {p.alerte}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: '#8a8a9a' }}>{p.action}</td>
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

// ─── Progression hebdo ────────────────────────────────────────────────────
function OngletProgression({ annee }) {
  const [selectedPDV, setSelectedPDV] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState(null);
  const PAGE_SIZE = 20;
  const { thSort: thSortProg, sortFn: sortFnProg } = useSortable('ca_max');

  const { data: progression, isLoading } = useQuery(
    ['nafama-w-progression', annee],
    () => api.get(`/nafama/weekly/progression?annee=${annee}`).then(r => r.data),
    { staleTime: 300000, retry: false }
  );

  const allPDVs = progression?.pdvs || [];
  const allSorted = allPDVs
    .filter(p => activeFilter === 'reguliers' ? p.est_regulier : activeFilter === 'hausse' ? p.tendance === 'HAUSSE' : activeFilter === 'baisse' ? p.tendance === 'BAISSE' : true)
    .filter(p => !search || (p.numero_pdv||'').toLowerCase().includes(search.toLowerCase()) || (p.superviseur||'').toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(allSorted.length / PAGE_SIZE);
  const displayed = allSorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const selectedData = selectedPDV ? (selectedPDV.historique_hebdo || []) : [];

  const selectStyle = { padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: '#ddd', fontSize: 12, cursor: 'pointer', outline: 'none' };

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!allPDVs.length) return <EmptyTab />;

  const kpis = [
    { label: '✅ Réguliers (ttes sem)', value: progression?.nb_reguliers || 0, color: COLOR_PRIMARY, filter: 'reguliers' },
    { label: '📈 Tendance Hausse', value: progression?.nb_hausse || 0, color: '#00d68f', filter: 'hausse' },
    { label: '📉 Tendance Baisse', value: progression?.nb_baisse || 0, color: '#ff4757', filter: 'baisse' },
    { label: '🏅 Total PDVs', value: progression?.nb_pdv_total || 0, color: '#ffa502', filter: null },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <div key={i} onClick={() => setActiveFilter(f => f === k.filter ? null : k.filter)}
            style={{ padding: '16px 18px', background: activeFilter === k.filter ? 'rgba(0,214,143,0.1)' : 'rgba(0,0,0,0.25)',
              border: `2px solid ${activeFilter === k.filter ? k.color : 'rgba(255,255,255,0.08)'}`,
              borderLeft: `4px solid ${k.color}`, borderRadius: 12, cursor: k.filter ? 'pointer' : 'default', transition: 'all 0.2s',
              transform: activeFilter === k.filter ? 'scale(1.02)' : 'scale(1)' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
            {activeFilter === k.filter && k.filter && <div style={{ fontSize: 10, color: k.color, marginTop: 4 }}>✓ Filtre actif</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: '14px 18px', background: 'rgba(0,214,143,0.06)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>📈 Meilleure Semaine Réseau</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLOR_PRIMARY }}>{progression?.meilleure_semaine?.label || '—'}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>CA : {formatCA(progression?.meilleure_semaine?.ca_total || 0)}</div>
        </div>
        <div style={{ padding: '14px 18px', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>⚠️ Pire Semaine Réseau</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ff4757' }}>{progression?.pire_semaine?.label || '—'}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>CA : {formatCA(progression?.pire_semaine?.ca_total || 0)}</div>
        </div>
      </div>

      {selectedPDV && selectedData.length > 0 && (
        <div style={{ marginBottom: 16, padding: '18px 20px', background: 'linear-gradient(135deg, rgba(0,214,143,0.06) 0%, rgba(0,0,0,0) 60%)', borderRadius: 14, border: '1px solid rgba(0,214,143,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 14 }}>📊 Évolution Hebdo — {selectedPDV.numero_pdv}</h3>
              <p style={{ fontSize: 11, color: '#8a8a9a', marginTop: 3 }}>{selectedPDV.superviseur} · {selectedPDV.zone} · Top10: {selectedPDV.nb_fois_top10}x · Top50: {selectedPDV.nb_fois_top50}x</p>
            </div>
            <button onClick={() => setSelectedPDV(null)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 18, borderRadius: 8, width: 32, height: 32 }}>✕</button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={selectedData}>
              <defs>
                <linearGradient id="nafamaWProgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d68f" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} width={40} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ca" name="CA" stroke={COLOR_PRIMARY} fill="url(#nafamaWProgGrad)" strokeWidth={2.5} dot={{ r: 3, fill: COLOR_PRIMARY, stroke: '#0a0a1a', strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#8a8a9a' }}>🔍</span>
          <input type="text" placeholder="PDV, numéro, superviseur..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ ...selectStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box', background: 'transparent', border: 'none' }} />
        </div>
        {(search || activeFilter) && <button onClick={() => { setSearch(''); setActiveFilter(null); setPage(1); }} style={{ padding: '7px 10px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, color: '#ff4757', cursor: 'pointer', fontSize: 13 }}>✕</button>}
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>🚀 Progression Hebdo — {annee}</span>
          <span style={{ fontSize: 12, color: COLOR_PRIMARY }}>{allSorted.length} PDVs</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Rang</th>
                {thSortProg('numero_pdv', 'PDV', '#8a8a9a', 'left')}
                {thSortProg('zone', 'Zone', '#8a8a9a', 'left')}
                {thSortProg('superviseur', 'Superviseur', '#8a8a9a', 'left')}
                {thSortProg('nb_fois_top10', 'Top 10', '#FFD700', 'center')}
                {thSortProg('nb_fois_top50', 'Top 50', '#a29bfe', 'center')}
                {thSortProg('ca_max', 'CA Max', COLOR_PRIMARY, 'right')}
                {thSortProg('ca_min', 'CA Min', '#ff4757', 'right')}
                {thSortProg('variation_globale', 'Tendance', '#8a8a9a', 'center')}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Courbe</th>
              </tr>
            </thead>
            <tbody>
              {[...displayed].sort(sortFnProg).map((pdv, i) => {
                const isSelected = selectedPDV?.numero_pdv === pdv.numero_pdv;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isSelected ? 'rgba(0,214,143,0.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666', fontWeight: 700 }}>{(page-1)*PAGE_SIZE + i + 1}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{pdv.numero_pdv}</div>
                      <div style={{ fontSize: 10, color: '#8a8a9a' }}>{pdv.nom !== pdv.numero_pdv ? pdv.nom : ''}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#ccc', fontSize: 11 }}>{pdv.zone}</td>
                    <td style={{ padding: '10px 12px', color: '#ccc', fontSize: 11 }}>{pdv.superviseur}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#FFD700' }}>{pdv.nb_fois_top10}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#a29bfe' }}>{pdv.nb_fois_top50}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: COLOR_PRIMARY }}>{formatCA(pdv.ca_max)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ff4757' }}>{formatCA(pdv.ca_min)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: pdv.tendance === 'HAUSSE' ? 'rgba(0,214,143,0.12)' : pdv.tendance === 'BAISSE' ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.06)',
                        color: pdv.tendance === 'HAUSSE' ? COLOR_PRIMARY : pdv.tendance === 'BAISSE' ? '#ff4757' : '#8a8a9a' }}>
                        {pdv.tendance === 'HAUSSE' ? '📈' : pdv.tendance === 'BAISSE' ? '📉' : '➡️'} {pdv.variation_globale > 0 ? '+' : ''}{pdv.variation_globale}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button onClick={() => setSelectedPDV(prev => prev?.numero_pdv === pdv.numero_pdv ? null : pdv)}
                        style={{ cursor: 'pointer', background: isSelected ? 'rgba(0,214,143,0.2)' : 'rgba(0,214,143,0.08)', border: `1px solid ${isSelected ? 'rgba(0,214,143,0.5)' : 'rgba(0,214,143,0.2)'}`, borderRadius: 7, color: COLOR_PRIMARY, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                        {isSelected ? '✕' : '📊'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 12, color: '#8a8a9a' }}>Page {page} / {totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={{ padding: '6px 14px', background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: COLOR_PRIMARY, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>← Préc.</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={{ padding: '6px 14px', background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 8, color: COLOR_PRIMARY, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page === totalPages ? 0.4 : 1 }}>Suiv. →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Principale Hebdomadaire ──────────────────────────────────────────
export default function NafamaWeeklyDashboardPage() {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [semaine, setSemaine] = useState(1);

  // Détection téléconseillère
  const user = useAuthStore(s => s.user);
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const isTelec = role === 'teleconseillere';
  const teleName = isTelec ? `${user?.nom || ''} ${user?.prenom || ''}`.trim() : null;

  const [activeTab, setActiveTab] = useState(null);

  useEffect(() => {
    if (activeTab === null) {
      setActiveTab(isTelec ? 'inactifs' : 'overview');
    } else if (isTelec && ['overview','top','pareto','evolution','progression'].includes(activeTab)) {
      setActiveTab('inactifs');
    }
  }, [isTelec, activeTab]);

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

  const allTabsNW = [
    { key: 'overview',    label: "🏠 Vue d'ensemble" },
    { key: 'top',         label: '🏆 Top PDVs' },
    { key: 'pareto',      label: '📊 Pareto' },
    { key: 'evolution',   label: '📈 Évolution' },
    { key: 'inactifs',    label: '😴 Inactifs' },
    { key: 'baisse',      label: '📉 En Baisse' },
    { key: 'progression', label: '🚀 Progression' },
  ];
  const tabs = isTelec
    ? allTabsNW.filter(t => ['inactifs', 'baisse'].includes(t.key))
    : allTabsNW;

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
      {activeTab === 'evolution' && <OngletEvolution annee={annee} semaine={semaine} />}
      {activeTab === 'inactifs'  && <OngletInactifs annee={annee} semaine={semaine} teleFilter={teleName} />}
      {activeTab === 'baisse'      && <OngletBaisse annee={annee} semaine={semaine} teleFilter={teleName} />}
      {activeTab === 'progression' && <OngletProgression annee={annee} />}
    </div>
  );
}
