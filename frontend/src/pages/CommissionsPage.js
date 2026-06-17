import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Upload } from 'lucide-react';
import commissionService, {
  TYPE_COLORS, TYPE_LABELS, REV_STATUS_LABELS, fmt, fmtM,
} from '../services/commissionService';
import './ProspectionPage.css';

export default function CommissionsPage() {
  const [period, setPeriod]     = useState('');
  const [periods, setPeriods]   = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    commissionService.periods().then(list => {
      setPeriods(list);
      if (list.length) setPeriod(list[0]);
    });
  }, []);

  const tabs = [
    { id: 'dashboard',  label: '💰 Dashboard' },
    { id: 'details',    label: '📋 Détail PDV' },
    { id: 'evolution',  label: '📈 Évolution' },
    { id: 'top',        label: '🏆 Top PDV' },
    { id: 'import',     label: '📥 Import Excel' },
  ];

  return (
    <div className="prospection-page">
      <div className="prospection-header">
        <h1>
          <span>💰 Commissions Réseau — Orange Mali</span>
          <small>Réseau (30%) · PDV (70%) · RNS · RSF · RS · KIOSQUE</small>
        </h1>
        <div className="header-actions">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
            {periods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setRefreshKey(k => k+1)}><RefreshCw size={14}/> Actualiser</button>
          {period && <a className="btn-secondary" href={commissionService.exportUrl(period)} target="_blank" rel="noreferrer">
            <Download size={14}/> Excel
          </a>}
        </div>
      </div>

      <div className="tabs-container mb-24">
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {!period && <div className="empty-state">⚠ Aucune période disponible. Importez d'abord un fichier Excel.</div>}

      {period && (
        <>
          {activeTab === 'dashboard'   && <TabDashboard key={`d-${period}-${refreshKey}`} period={period}/>}
          {activeTab === 'details'     && <TabDetails key={`e-${period}-${refreshKey}`} period={period}/>}
          {activeTab === 'evolution'   && <TabEvolution key={`ev-${refreshKey}`}/>}
          {activeTab === 'top'         && <TabTop key={`t-${period}-${refreshKey}`} period={period}/>}
          {activeTab === 'import'      && <TabImport key={`i-${refreshKey}`} onImported={() => { setRefreshKey(k => k+1); window.location.reload(); }}/>}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 1 : DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function TabDashboard({ period }) {
  const [data, setData] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  useEffect(() => { commissionService.dashboard(period, typeFilter || undefined).then(setData); }, [period, typeFilter]);
  if (!data) return <div className="loading-state">Calcul en cours…</div>;

  const cb = data.commission_brute || {};         // Commission PDG par type
  const cr = data.commission_revendeur || {};     // Commission Revendeur par type
  const transit = data.montant_en_transit || {};
  const rev = data.reversements || {};

  return (
    <>
      {/* Filtrage par type */}
      <div className="filters">
        <span style={{ color: 'var(--text-secondary)' }}>Type PDV :</span>
        {['', 'RNS', 'RSF', 'RS', 'KIOSQUE'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={typeFilter === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12 }}>
            {t ? TYPE_LABELS[t] : 'Tous'}
          </button>
        ))}
      </div>

      {/* ── KPI NIVEAU 1 : Vue globale ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total PDV actifs</div>
          <div className="stat-value" style={{ fontSize: 28, fontWeight: 800 }}>{data.n_pdv_total}</div>
          <small style={{ color: 'var(--text-muted)' }}>
            RNS/RSF : {data.n_pdv_directs} · RS/KIOSQUE : {data.n_pdv_geres}
          </small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--success)' }}>
          <div className="stat-label">🏦 Commission PDG</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {Math.round(cb.total||0).toLocaleString('en-US').replace(/,/g, ' ')}
          </div>
          <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 600, marginTop: 3 }}>FCFA</div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            30% RNS/RSF ({fmtM(cb.rns_rsf||0)}) + 100% RS/KIOSQUE ({fmtM(cb.rs_kiosque||0)})
          </small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#8b5cf6' }}>
          <div className="stat-label">🔵 Commission Revendeur</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {Math.round(data.commission_revendeur_total||0).toLocaleString('en-US').replace(/,/g, ' ')}
          </div>
          <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 600, marginTop: 3 }}>FCFA</div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>70% RNS/RSF payés directement par Orange aux PDV</small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
          <div className="stat-label">💰 Commission Réelle PDG</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {Math.round(data.commission_reelle_pdg||0).toLocaleString('en-US').replace(/,/g, ' ')}
          </div>
          <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 600, marginTop: 3 }}>FCFA</div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>({fmtM(cb.total||0)} + {fmtM(data.commission_revendeur_total||0)}) × 30%</small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
          <div className="stat-label">📊 Variation vs mois précédent</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: (data.taux_variation||0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {(data.taux_variation||0) >= 0 ? '+' : ''}{(data.taux_variation||0).toFixed(2)}%
          </div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>Évolution Commission Réelle PDG vs mois précédent</small>
        </div>
      </div>


      {/* ── Schéma visuel répartition ── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📐 Répartition Orange Mali — Comment ça fonctionne</h3>

        {/* Barre RNS/RSF */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>🟦 RNS / RSF — Orange paie directement les PDVs</span>
            <span>{data.n_pdv_directs} PDV</span>
          </div>
          <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(cb.rns_rsf||0) / ((cb.rns_rsf||0) + (cr.rns_rsf||1)) * 100}%`, minWidth: '20%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              PDG: {fmt(cb.rns_rsf||0)}
            </div>
            <div style={{ flex: 1, background: 'rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', fontSize: 11, fontWeight: 700 }}>
              PDV (via Orange): {fmt(cr.rns_rsf||0)}
            </div>
          </div>
        </div>

        {/* Barre RS/KIOSQUE */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>🟧 RS / KIOSQUE — Orange verse <b>tout</b> au PDG</span>
            <span>{data.n_pdv_geres} PDV</span>
          </div>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            <div style={{ width: `${(cb.rs_kiosque||0) / ((cb.rs_kiosque||0) + (cr.rs_kiosque||1)) * 100}%`, minWidth: '20%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              PDG garde: {fmt(cb.rs_kiosque||0)}
            </div>
            <div style={{ flex: 1, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              PDG reverse aux PDV: {fmt(cr.rs_kiosque||0)}
            </div>
          </div>
          <div style={{fontSize: 11, color: 'var(--text-muted)', marginTop: 4}}>
            💡 Le PDG reçoit {fmt((cb.rs_kiosque||0)+(cr.rs_kiosque||0))} d'Orange, garde {fmt(cb.rs_kiosque||0)} et reverse {fmt(cr.rs_kiosque||0)} aux PDVs
          </div>
        </div>
      </div>

      {/* ── Ventilation par type de PDV ── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🏷️ Ventilation par type de PDV</h3>
        <div className="prospects-table">
          <table>
            <thead>
              <tr>
                <th>Type</th><th>PDV</th><th>Brut (100%)</th>
                <th style={{ color: 'var(--success)' }}>Réseau (30%)</th>
                <th style={{ color: '#8b5cf6' }}>PDV (70%)</th>
                <th style={{ color: '#3b82f6' }}>Comm. NET</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {data.by_type.map(t => (
                <tr key={t.type}>
                  <td><span className="status-badge" style={{ background: TYPE_COLORS[t.type] }}>{TYPE_LABELS[t.type]}</span></td>
                  <td>{t.n_pdv}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmt(t.brut)}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 700 }}>{fmt(t.reseau)}</td>
                  <td style={{ fontFamily: 'monospace', color: '#8b5cf6' }}>{fmt(t.pdv)}</td>
                  <td style={{ fontFamily: 'monospace', color: '#3b82f6', fontWeight: 700 }}>{fmt(t.commission_nette)}</td>
                  <td>
                    {t.gere_reversement
                      ? <span className="status-badge" style={{ background: '#8b5cf6' }}>🏪 PDG → PDV</span>
                      : <span className="status-badge" style={{ background: '#3b82f6' }}>🟦 Orange → PDV</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          📌 <b>RNS & RSF</b> : Orange paye directement le PDV. Le PDG reçoit uniquement ses 30%.<br/>
          📌 <b>RS & KIOSQUE</b> : Orange verse 100% au PDG. Le PDG paie ensuite directement le PDV (70%).<br/>
          📌 <b>Dans tous les cas</b> : chaque PDV est payé. Le PDG conserve toujours ses 30% de commission.
        </div>
      </div>

      {/* ── Ventilation par quartier ── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🌍 Ventilation par quartier</h3>
        <div className="prospects-table">
          <table>
            <thead>
              <tr>
                <th>Quartier</th><th>PDV</th><th>Brut</th>
                <th style={{ color: 'var(--success)' }}>Réseau (30%)</th>
                <th style={{ color: '#8b5cf6' }}>PDV (70%)</th>
                <th style={{ color: '#3b82f6' }}>Comm. NET</th>
              </tr>
            </thead>
            <tbody>
              {data.by_quartier.map(q => (
                <tr key={q.quartier}>
                  <td><b>{q.quartier}</b></td>
                  <td>{q.n_pdv}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmt(q.brut)}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 700 }}>{fmt(q.reseau)}</td>
                  <td style={{ fontFamily: 'monospace', color: '#8b5cf6' }}>{fmt(q.pdv)}</td>
                  <td style={{ fontFamily: 'monospace', color: '#3b82f6', fontWeight: 700 }}>{fmt(q.commission_nette)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Récapitulatif final ── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)', borderLeft: '4px solid var(--success)' }}>
        <h3>✅ Récapitulatif — Ce que le PDG a gagné ce mois</h3>
        <div className="stats-grid">
          <div className="stat-card" style={{ borderLeftColor: 'var(--success)' }}>
            <div className="stat-label">🟢 Commission PDG</div>
            <div className="stat-value" style={{ fontSize: 16, color: 'var(--success)' }}>{fmt(cb.total||0)}</div>
            <small>Sa part définitive</small>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#8b5cf6' }}>
            <div className="stat-label">🟣 Commission Revendeur</div>
            <div className="stat-value" style={{ fontSize: 16, color: '#8b5cf6' }}>{fmt(data.commission_revendeur_total||0)}</div>
            <small>RNS/RSF via Orange · RS/KIOSQUE via le PDG</small>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
            <div className="stat-label">💰 Commission Réelle PDG</div>
            <div className="stat-value" style={{ fontSize: 16, color: '#f59e0b' }}>{fmt(data.commission_reelle_pdg||0)}</div>
            <small>(Comm PDG + Comm Revendeur) × 30%</small>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3b82f6' }}>
            <div className="stat-label">📊 PDV actifs</div>
            <div className="stat-value" style={{ fontSize: 16, color: '#3b82f6' }}>{data.n_pdv_total}</div>
            <small>{data.n_pdv_directs} RNS/RSF · {data.n_pdv_geres} RS/KIOSQUE</small>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 2 : DÉTAIL PDV
// ─────────────────────────────────────────────────────────────────────────────
function TabDetails({ period }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ pdv_type: '', quartier: '', search: '' });
  const [quartiers, setQuartiers] = useState([]);

  useEffect(() => {
    setLoading(true);
    commissionService.entries({ period_key: period, limit: 200,
      ...(filters.pdv_type ? { pdv_type: filters.pdv_type } : {}),
      ...(filters.quartier ? { quartier: filters.quartier } : {}),
      ...(filters.search ? { search: filters.search } : {}),
    }).then(r => {
      setEntries(r);
      const qs = [...new Set(r.map(e => e.quartier).filter(Boolean))].sort();
      setQuartiers(qs);
    }).finally(() => setLoading(false));
  }, [period, filters]);

  return (
    <>
      <div className="filters">
        <input placeholder="Rechercher PDV…" value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}/>
        <select value={filters.pdv_type} onChange={e => setFilters(f => ({ ...f, pdv_type: e.target.value }))}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.quartier} onChange={e => setFilters(f => ({ ...f, quartier: e.target.value }))}>
          <option value="">Tous quartiers</option>
          {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>

      {loading ? <div className="loading-state">Chargement…</div> : (
        <div className="prospects-table">
          <table>
            <thead>
              <tr>
                <th>N° PDV</th><th>Nom</th><th>Type</th><th>Quartier</th>
                <th>Brut (100%)</th>
                <th style={{ color: 'var(--success)' }}>Réseau (30%)</th>
                <th style={{ color: '#8b5cf6' }}>PDV (70%)</th>
                <th style={{ color: '#3b82f6' }}>Comm. NET</th>
                <th>Paiement PDV</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td><b>{e.pdv_numero}</b></td>
                  <td>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{e.pdv_numero || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.pdv_nom}</div>
                </td>
                  <td><span className="status-badge" style={{ background: TYPE_COLORS[e.pdv_type] }}>{e.pdv_type}</span></td>
                  <td>{e.quartier || '—'}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'right' }}>{fmt(e.montant_brut)}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(e.montant_reseau)}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'right', color: '#8b5cf6' }}>{fmt(e.montant_pdv)}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>
                    {fmt(e.commission_nette)}
                  </td>
                  <td>
                    {e.gere_reversement
                      ? <span className="status-badge" style={{ background: '#22c55e', color: '#fff' }}>
                          ✅ Payé par le PDG
                        </span>
                      : <span className="status-badge" style={{ background: '#3b82f6', color: '#fff' }}>
                          ✅ Payé par Orange
                        </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 3 : ÉVOLUTION
// ─────────────────────────────────────────────────────────────────────────────
function TabEvolution() {
  const [data, setData] = useState([]);
  const [nPeriods, setNPeriods] = useState(6);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    commissionService.evolution(nPeriods, typeFilter || undefined).then(setData);
  }, [nPeriods, typeFilter]);

  if (!data.length) return <div className="loading-state">Calcul…</div>;

  const maxBrut = Math.max(...data.map(d => d.brut)) || 1;
  return (
    <>
      <div className="filters">
        <select value={nPeriods} onChange={e => setNPeriods(parseInt(e.target.value))}>
          <option value={3}>3 mois</option><option value={6}>6 mois</option><option value={12}>12 mois</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📈 Évolution mensuelle des commissions</h3>
        {/* Graphique en barres simple */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, marginTop: 16 }}>
          {data.map(d => {
            const h = d.brut > 0 ? (d.brut / maxBrut * 180) : 4;
            const hR = d.brut > 0 ? (d.reseau / maxBrut * 180) : 4;
            return (
              <div key={d.period_key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>{fmt(d.reseau)}</div>
                <div style={{ width: '100%', position: 'relative', height: h }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: h, background: '#8b5cf620', borderRadius: '4px 4px 0 0' }}/>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: hR, background: 'var(--success)', borderRadius: '4px 4px 0 0' }}/>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.period_key}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{d.n_pdv} PDV</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
          <span>🟢 Part réseau (30%)</span>
          <span style={{ color: 'var(--text-muted)' }}>⬜ Part PDV (70%)</span>
        </div>
      </div>

      <div className="prospects-table">
        <table>
          <thead><tr><th>Période</th><th>PDV</th><th>Brut (100%)</th><th>Réseau (30%)</th><th>PDV (70%)</th><th>Var. réseau</th></tr></thead>
          <tbody>
            {data.map((d, i) => {
              const prev = data[i - 1];
              const delta = prev && prev.reseau ? ((d.reseau - prev.reseau) / prev.reseau * 100).toFixed(1) : null;
              return (
                <tr key={d.period_key}>
                  <td><b>{d.period_key}</b></td>
                  <td>{d.n_pdv}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'right' }}>{fmt(d.brut)}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(d.reseau)}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'right', color: '#8b5cf6' }}>{fmt(d.pdv)}</td>
                  <td>{delta !== null ? (
                    <span style={{ color: parseFloat(delta) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                      {parseFloat(delta) >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
                    </span>
                  ) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 4 : TOP PDV
// ─────────────────────────────────────────────────────────────────────────────
function TabTop({ period }) {
  const [data, setData] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [n, setN] = useState(20);

  useEffect(() => {
    commissionService.topPdvs(period, n, typeFilter || undefined).then(setData);
  }, [period, n, typeFilter]);

  return (
    <>
      <div className="filters">
        <select value={n} onChange={e => setN(parseInt(e.target.value))}>
          <option value={10}>Top 10</option><option value={20}>Top 20</option><option value={50}>Top 50</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="prospects-table">
        <table>
          <thead>
            <tr>
              <th>#</th><th>PDV</th><th>Type</th><th>Quartier</th>
              <th>Brut (100%)</th>
              <th style={{ color: 'var(--success)' }}>Réseau (30%)</th>
              <th style={{ color: '#8b5cf6' }}>PDV (70%)</th>
              <th style={{ color: '#3b82f6' }}>Comm. NET</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e, i) => (
              <tr key={e.id}>
                <td><b style={{ color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-muted)' }}>#{i+1}</b></td>
                <td><b>{e.pdv_numero}</b><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.pdv_nom}</div></td>
                <td><span className="status-badge" style={{ background: TYPE_COLORS[e.pdv_type] }}>{e.pdv_type}</span></td>
                <td>{e.quartier || '—'}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'right' }}>{fmt(e.montant_brut)}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(e.montant_reseau)}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'right', color: '#8b5cf6' }}>{fmt(e.montant_pdv)}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>
                  {fmt(e.commission_nette)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 5 : REVERSEMENTS (KIOSQUE + RS uniquement)
// ─────────────────────────────────────────────────────────────────────────────
function TabReversement({ period }) {
  const [entries, setEntries] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    commissionService.entries({
      period_key: period, gere_reversement: true, limit: 500,
      ...(statusFilter ? { reversement_status: statusFilter } : {}),
    }).then(setEntries);
  }, [period, statusFilter]);

  const totalAVerser = entries.reduce((s, e) => s + (e.montant_pdv || 0), 0);
  const totalPaye    = entries.reduce((s, e) => s + (e.montant_reverse || 0), 0);
  const totalReste   = totalAVerser - totalPaye;

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card warn"><div className="stat-label">Total à reverser</div><div className="stat-value" style={{ fontSize: 16 }}>{fmt(totalAVerser)}</div></div>
        <div className="stat-card ok"><div className="stat-label">Déjà reversé</div><div className="stat-value" style={{ fontSize: 16 }}>{fmt(totalPaye)}</div></div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--danger)' }}>
          <div className="stat-label">Reste à payer</div>
          <div className="stat-value" style={{ fontSize: 16, color: 'var(--danger)' }}>{fmt(totalReste)}</div>
        </div>
        <div className="stat-card"><div className="stat-label">PDV concernés</div><div className="stat-value">{entries.length}</div><small style={{ color: 'var(--text-muted)' }}>RS + KIOSQUE</small></div>
      </div>

      <div className="filters">
        <span style={{ color: 'var(--text-secondary)' }}>Statut :</span>
        {['', 'EN_ATTENTE', 'PARTIEL', 'PAYE'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={statusFilter === s ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12 }}>
            {s ? REV_STATUS_LABELS[s]?.label : `Tous (${entries.length})`}
          </button>
        ))}
      </div>

      <div className="prospects-table">
        <table>
          <thead><tr><th>PDV</th><th>Type</th><th>Quartier</th><th>Part PDV (70%)</th><th>Reversé</th><th>Reste</th><th>Statut</th></tr></thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td><b>{e.pdv_numero}</b><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.pdv_nom}</div></td>
                <td><span className="status-badge" style={{ background: TYPE_COLORS[e.pdv_type] }}>{e.pdv_type}</span></td>
                <td>{e.quartier || '—'}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'right', color: '#8b5cf6', fontWeight: 700 }}>{fmt(e.montant_pdv)}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'right', color: 'var(--success)' }}>{fmt(e.montant_reverse)}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'right', color: e.montant_reste_a_reverser > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {fmt(e.montant_reste_a_reverser)}
                </td>
                <td><span className="status-badge" style={{ background: REV_STATUS_LABELS[e.reversement_status]?.color }}>
                  {REV_STATUS_LABELS[e.reversement_status]?.label}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 6 : IMPORT EXCEL
// ─────────────────────────────────────────────────────────────────────────────
function TabImport({ onImported }) {
  const [file, setFile] = useState(null);
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [cols, setCols] = useState({
    col_numero: 'numero_pdv', col_nom: 'pdv_nom',
    col_type: 'pdv_type', col_brut: 'montant_brut',
    col_quartier: 'quartier', col_zone: 'zone', col_gestionnaire: 'gestionnaire',
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return alert('Sélectionnez un fichier');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('period_key', periodKey);
      Object.entries(cols).forEach(([k, v]) => fd.append(k, v));
      const r = await commissionService.import(fd);
      setResult(r);
      onImported?.();
    } catch (err) { alert('Erreur : ' + (err.response?.data?.detail || err.message)); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
      <h3>📥 Importer un fichier Excel de commissions</h3>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
        ✓ Le fichier doit contenir une ligne d'en-tête + une ligne par PDV.<br/>
        ✓ Colonnes obligatoires : <b>N° PDV</b>, <b>Type PDV</b> (RNS/RSF/RS/KIOSQUE), <b>Montant brut</b><br/>
        ✓ Colonnes optionnelles : Nom PDV, Quartier, Zone, Gestionnaire, Superviseur
      </div>

      <form onSubmit={submit}>
        <div className="form-grid">
          <label>Fichier Excel *<input type="file" accept=".xlsx,.xls" required onChange={e => setFile(e.target.files[0])}/></label>
          <label>Période (YYYY-MM) *<input value={periodKey} onChange={e => setPeriodKey(e.target.value)} placeholder="2026-04"/></label>
          <label>Colonne N° PDV<input value={cols.col_numero} onChange={e => setCols(c => ({ ...c, col_numero: e.target.value }))}/></label>
          <label>Colonne Type PDV<input value={cols.col_type} onChange={e => setCols(c => ({ ...c, col_type: e.target.value }))}/></label>
          <label>Colonne Montant brut<input value={cols.col_brut} onChange={e => setCols(c => ({ ...c, col_brut: e.target.value }))}/></label>
          <label>Colonne Nom PDV<input value={cols.col_nom} onChange={e => setCols(c => ({ ...c, col_nom: e.target.value }))}/></label>
          <label>Colonne Quartier<input value={cols.col_quartier} onChange={e => setCols(c => ({ ...c, col_quartier: e.target.value }))}/></label>
          <label>Colonne Zone<input value={cols.col_zone} onChange={e => setCols(c => ({ ...c, col_zone: e.target.value }))}/></label>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <button type="submit" className="btn-primary" disabled={busy}>
            <Upload size={14}/> {busy ? 'Import en cours…' : 'Lancer l\'import'}
          </button>
        </div>
      </form>

      {result && (
        <div style={{ marginTop: 16, padding: 14, background: 'rgba(34,197,94,0.08)', borderRadius: 8, borderLeft: '3px solid var(--success)' }}>
          <b>✅ Import terminé — Période {result.period_key}</b>
          <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-secondary)' }}>
            ✓ Créés : <b>{result.created}</b> · Mis à jour : <b>{result.updated}</b> · Ignorés : <b>{result.skipped}</b>
          </div>
        </div>
      )}
    </div>
  );
}
