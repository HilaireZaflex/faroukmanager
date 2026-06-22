import React, { useState, useEffect } from 'react';
import PDVCell from '../components/common/PDVCell';
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
    { id: 'analyse',    label: '🤖 Analyse IA' },
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
          {activeTab === 'analyse'     && <TabAnalyseIA key={`a-${period}-${refreshKey}`} period={period}/>}
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
  const [sortQ, setSortQ] = useState({ col: 'reseau', dir: 'desc' });
  useEffect(() => { commissionService.dashboard(period, typeFilter || undefined).then(setData); }, [period, typeFilter]);
  if (!data) return <div className="loading-state">Calcul en cours…</div>;

  const thSort = (col, label, color) => {
    const active = sortQ.col === col;
    return (
      <th onClick={() => setSortQ(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
        style={{ padding: '10px 12px', textAlign: 'right', color: active ? color : '#8a8a9a', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {label} {active ? (sortQ.dir === 'desc' ? '▼' : '▲') : '⇅'}
      </th>
    );
  };

  const cb = data.commission_brute || {};         // Commission PDG par type
  const cr = data.commission_revendeur || {};     // Commission Revendeur par type
  const transit = data.montant_en_transit || {};
  const rev = data.reversements || {};

  // RS et KIOSQUE : Commission Revendeur = 0 (accessible partout dans le composant)
  const isGereType = typeFilter === 'RS' || typeFilter === 'KIOSQUE';
  const commRevDisplay = isGereType ? 0 : (data.commission_revendeur_total || 0);

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
      {(() => {
        const isDirect = typeFilter === 'RNS' || typeFilter === 'RSF';
        const isGere   = typeFilter === 'RS'  || typeFilter === 'KIOSQUE';
        const isAll    = !typeFilter;

        // Légende dynamique Commission PDG
        let legendCommPDG;
        if (typeFilter === 'RNS')     legendCommPDG = '30% RNS — reçus par le PDG d\'Orange';
        else if (typeFilter === 'RSF') legendCommPDG = '30% RSF — reçus par le PDG d\'Orange';
        else if (typeFilter === 'RS')  legendCommPDG = '100% RS — reçus par le PDG (30% gardés + 70% à reverser)';
        else if (typeFilter === 'KIOSQUE') legendCommPDG = '100% KIOSQUE — reçus par le PDG (30% gardés + 70% à reverser)';
        else legendCommPDG = `30% RNS/RSF (${fmtM(cb.rns_rsf||0)}) + 100% RS/KIOSQUE (${fmtM(cb.rs_kiosque||0)})`;

        // Légende dynamique Commission Revendeur
        let legendCommRev;
        if (isGere)    legendCommRev = `70% ${typeFilter} à reverser par le PDG aux PDV`;
        else if (isDirect) legendCommRev = `70% ${typeFilter} payés directement par Orange aux PDV`;
        else           legendCommRev = '70% RNS/RSF payés directement par Orange aux PDV';

        // Légende Commission Réelle PDG
        const legendCommReelle = `(${fmtM(cb.total||0)} + ${fmtM(data.commission_revendeur_total||0)}) × 30%`;

        // Légende PDV actifs
        let legendPDV;
        if (typeFilter) legendPDV = `${data.n_pdv_total} PDV de type ${typeFilter}`;
        else legendPDV = `RNS/RSF : ${data.n_pdv_directs} · RS/KIOSQUE : ${data.n_pdv_geres}`;

        return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total PDV actifs</div>
          <div className="stat-value" style={{ fontSize: 28, fontWeight: 800 }}>{data.n_pdv_total}</div>
          <small style={{ color: 'var(--text-muted)' }}>{legendPDV}</small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--success)' }}>
          <div className="stat-label">🏦 Commission PDG</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {Math.round(cb.total||0).toLocaleString('en-US').replace(/,/g, ' ')}
          </div>
          <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 600, marginTop: 3 }}>FCFA</div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>{legendCommPDG}</small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#8b5cf6' }}>
          <div className="stat-label">🔵 Commission Revendeur</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {Math.round(commRevDisplay).toLocaleString('en-US').replace(/,/g, ' ')}
          </div>
          <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 600, marginTop: 3 }}>FCFA</div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>{legendCommRev}</small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
          <div className="stat-label">💰 Commission Réelle PDG</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {Math.round(data.commission_reelle_pdg||0).toLocaleString('en-US').replace(/,/g, ' ')}
          </div>
          <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 600, marginTop: 3 }}>FCFA</div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>{legendCommReelle}</small>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
          <div className="stat-label">📊 Variation vs mois précédent</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: (data.taux_variation||0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {(data.taux_variation||0) >= 0 ? '+' : ''}{(data.taux_variation||0).toFixed(2)}%
          </div>
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {typeFilter ? `Commission Réelle PDG — ${typeFilter}` : 'Évolution Commission Réelle PDG vs mois précédent'}
          </small>
        </div>
      </div>
        );
      })()}


      {/* ── Schéma visuel répartition ── */}
      {(() => {
        // RNS/RSF : 70% PDV = Commission Revendeur totale (même montant qu'en haut)
        const rns_rsf_70 = data.commission_revendeur_total || 0;
        const totalRnsRsf = (cb.rns_rsf || 0) + rns_rsf_70;
        const rns_rsf_30 = cb.rns_rsf || 0;

        // RS/KIOSQUE : CommPDG = 100%, 30% PDG garde, 70% PDV reverse
        const totalRsKiosque = cb.rs_kiosque || 0;
        const rs_kiosque_30 = totalRsKiosque * 30 / 100;
        const rs_kiosque_70 = totalRsKiosque * 70 / 100;

        // total_30 = rns_rsf_30 + rs_kiosque_30 = Commission Réelle PDG ✅
        return (
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📐 Répartition Orange Mali — Comment ça fonctionne</h3>

        {/* Barre RNS/RSF */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>🟦 RNS / RSF — {data.n_pdv_directs} PDV</span>
            <span style={{ fontWeight: 700 }}>Total : {fmt(totalRnsRsf)}</span>
          </div>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: '30%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              30% PDG : {fmt(rns_rsf_30)}
            </div>
            <div style={{ width: '70%', background: 'rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', fontSize: 11, fontWeight: 700 }}>
              70% PDV : {fmt(rns_rsf_70)}
            </div>
          </div>
        </div>

        {/* Barre RS/KIOSQUE */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>🟧 RS / KIOSQUE — {data.n_pdv_geres} PDV</span>
            <span style={{ fontWeight: 700 }}>Total : {fmt(totalRsKiosque)}</span>
          </div>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            <div style={{ width: '30%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              30% PDG : {fmt(rs_kiosque_30)}
            </div>
            <div style={{ flex: 1, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              70% PDV : {fmt(rs_kiosque_70)}
            </div>
          </div>
        </div>
      </div>
        );
      })()}

      {/* ── Ventilation par type de PDV ── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🏷️ Ventilation par type de PDV</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Type</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Nbre PDV</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)' }}>Commission PDG</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>Commission Revendeur</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b' }}>Comm. Réelle PDG (30%)</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Mode paiement PDV</th>
              </tr>
            </thead>
            <tbody>
              {data.by_type.map(t => {
                // RS et KIOSQUE : Commission Revendeur = 0
                const commPDG    = t.reseau || 0;
                const commRev    = t.gere_reversement ? 0 : (t.pdv || 0);
                const commReelle = (commPDG + commRev) * 0.3;
                return (
                <tr key={t.type} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}><span className="status-badge" style={{ background: TYPE_COLORS[t.type] }}>{TYPE_LABELS[t.type]}</span></td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>{t.n_pdv}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(commPDG)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{fmt(commRev)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{fmt(commReelle)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {t.gere_reversement
                      ? <span className="status-badge" style={{ background: '#8b5cf6' }}>🏪 PDG reverse au PDV</span>
                      : <span className="status-badge" style={{ background: '#3b82f6' }}>🟦 Orange paie directement</span>}
                  </td>
                </tr>
                );
              })}
              {data.by_type.length > 0 && (() => {
                const totalCommPDG    = data.by_type.reduce((s, t) => s + (t.reseau || 0), 0);
                const totalCommRev    = data.by_type.reduce((s, t) => s + (t.gere_reversement ? 0 : (t.pdv || 0)), 0);
                const totalCommReelle = (totalCommPDG + totalCommRev) * 0.3;
                return (
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.03)', fontWeight: 800, fontSize: 13 }}>
                    <td style={{ padding: '10px 12px' }}><b>TOTAL</b></td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>{data.n_pdv_total}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 800 }}>{fmt(totalCommPDG)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 800 }}>{fmt(totalCommRev)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>{fmt(totalCommReelle)}</td>
                    <td></td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          📌 <b>RNS & RSF</b> : Commission PDG = 30% reçus d'Orange. Commission Revendeur = 70% payés directement par Orange aux PDV.<br/>
          📌 <b>RS & KIOSQUE</b> : Commission PDG = 100% reçus d'Orange. Le PDG garde 30% (Comm Réelle) et reverse 70% aux PDV.<br/>
          📌 <b>Commission Réelle PDG</b> = 30% pour RNS/RSF + 30% × CommPDG pour RS/KIOSQUE.
        </div>
      </div>

      {/* ── Ventilation par quartier ── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🌍 Ventilation par quartier</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Quartier</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Nbre PDV</th>
                {thSort('reseau',   'Commission PDG',        'var(--success)')}
                {thSort('pdv',      'Commission Revendeur',  '#8b5cf6')}
                {thSort('reelle',   'Comm. Réelle PDG (30%)','#f59e0b')}
              </tr>
            </thead>
            <tbody>
              {[...data.by_quartier]
                .map(q => {
                  const qCommRev    = isGereType ? 0 : (q.pdv || 0);
                  const qCommReelle = ((q.reseau || 0) + qCommRev) * 0.3;
                  return { ...q, qCommRev, qCommReelle };
                })
                .sort((a, b) => {
                  const valA = sortQ.col === 'reelle' ? a.qCommReelle : sortQ.col === 'pdv' ? a.qCommRev : (a[sortQ.col] || 0);
                  const valB = sortQ.col === 'reelle' ? b.qCommReelle : sortQ.col === 'pdv' ? b.qCommRev : (b[sortQ.col] || 0);
                  return sortQ.dir === 'desc' ? valB - valA : valA - valB;
                })
                .map(q => (
                <tr key={q.quartier} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{q.quartier}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{q.n_pdv}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(q.reseau)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{fmt(q.qCommRev)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{fmt(q.qCommReelle)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {(() => {
                const totalNPdv    = data.by_quartier.reduce((s, q) => s + (q.n_pdv || 0), 0);
                const totalReseau  = data.by_quartier.reduce((s, q) => s + (q.reseau || 0), 0);
                const totalRev     = isGereType ? 0 : data.by_quartier.reduce((s, q) => s + (q.pdv || 0), 0);
                const totalReelle  = (totalReseau + totalRev) * 0.3;
                return (
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.04)', fontWeight: 800, fontSize: 13 }}>
                    <td style={{ padding: '10px 12px' }}><b>TOTAL</b></td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>{totalNPdv}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 800 }}>{fmt(totalReseau)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 800 }}>{fmt(totalRev)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>{fmt(totalReelle)}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>

    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 2 : DÉTAIL PDV
// ─────────────────────────────────────────────────────────────────────────────
function AccordionSection({ title, defaultOpen = true, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="modal-section" style={{ background: 'var(--bg-card)', padding: 0, marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: open ? 'rgba(255,105,0,0.08)' : 'rgba(255,255,255,0.03)',
        border: 'none', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 700, borderRadius: 'var(--radius)',
      }}>
        <span>{title}{badge && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,105,0,0.2)', color: '#FF6900', marginLeft: 10 }}>{badge}</span>}</span>
        <span style={{ fontSize: 18, transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', color: '#FF6900' }}>▾</span>
      </button>
      {open && <div style={{ padding: '16px 20px' }}>{children}</div>}
    </div>
  );
}

function TabDetails({ period }) {
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading]       = useState(false);

  // Filtres section 1 : Zones & Localisation
  const [zone, setZone]         = useState('');
  const [sousZone, setSousZone] = useState('');
  const [quartier, setQuartier] = useState('');
  const [search1, setSearch1]   = useState('');

  // Filtres section 2 : Réseau & PDV
  const [gestionnaire, setGestionnaire] = useState('');
  const [superviseur, setSuperviseur]   = useState('');
  const [pdvType, setPdvType]           = useState('');
  const [search2, setSearch2]           = useState('');

  // Listes déroulantes dynamiques
  const [zones, setZones]           = useState([]);
  const [sousZones, setSousZones]   = useState([]);
  const [quartiers, setQuartiers]   = useState([]);
  const [gestionnaires, setGestionnaires] = useState([]);
  const [superviseurs, setSuperviseurs]   = useState([]);

  // Pagination
  const [page1, setPage1] = useState(1);
  const [page2, setPage2] = useState(1);
  const [sortD, setSortD] = useState({ col: 'commPDG', dir: 'desc' });
  const [showAll1, setShowAll1] = useState(false);
  const [showAll2, setShowAll2] = useState(false);

  useEffect(() => {
    setLoading(true);
    commissionService.entries({ period_key: period, limit: 2000 }).then(r => {
      setAllEntries(r);
      setZones([...new Set(r.map(e => e.zone).filter(Boolean))].sort());
      setSousZones([...new Set(r.map(e => e.sous_zone).filter(Boolean))].sort());
      setQuartiers([...new Set(r.map(e => e.quartier).filter(Boolean))].sort());
      setGestionnaires([...new Set(r.map(e => e.gestionnaire).filter(Boolean))].sort());
      setSuperviseurs([...new Set(r.map(e => e.superviseur).filter(Boolean))].sort());
    }).finally(() => setLoading(false));
  }, [period]);

  // Filtrage section 1 — reset page quand filtre change
  const entries1 = allEntries.filter(e => {
    if (zone && e.zone !== zone) return false;
    if (sousZone && e.sous_zone !== sousZone) return false;
    if (quartier && e.quartier !== quartier) return false;
    if (search1 && !(e.pdv_numero?.includes(search1) || e.pdv_nom?.toLowerCase().includes(search1.toLowerCase()))) return false;
    return true;
  });

  // Filtrage section 2 — reset page quand filtre change
  const entries2 = allEntries.filter(e => {
    if (gestionnaire && e.gestionnaire !== gestionnaire) return false;
    if (superviseur && e.superviseur !== superviseur) return false;
    if (pdvType && e.pdv_type !== pdvType) return false;
    if (search2 && !(e.pdv_numero?.includes(search2) || e.pdv_nom?.toLowerCase().includes(search2.toLowerCase()))) return false;
    return true;
  });

  // Reset pages quand filtres changent
  useEffect(() => { setPage1(1); }, [zone, sousZone, quartier, search1]);
  useEffect(() => { setPage2(1); }, [gestionnaire, superviseur, pdvType, search2]);

  const PAGE_SIZE = 20;

  const thD = (col, label, color) => {
    const active = sortD.col === col;
    return (
      <th onClick={() => { setSortD(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' })); setPage1(1); setPage2(1); }}
        style={{ padding: '10px 12px', textAlign: 'right', color: active ? color : '#8a8a9a', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {label} {active ? (sortD.dir === 'desc' ? '▼' : '▲') : '⇅'}
      </th>
    );
  };

  const renderTable = (entries, page, setPage, showAll, setShowAll) => {
    const enriched = entries.map(e => ({
      ...e,
      commPDG:    e.montant_reseau || 0,
      commRev:    e.gere_reversement ? 0 : (e.montant_pdv || 0),
      commReelle: ((e.montant_reseau || 0) + (e.gere_reversement ? 0 : (e.montant_pdv || 0))) * 0.3,
    })).sort((a, b) => sortD.dir === 'desc' ? b[sortD.col] - a[sortD.col] : a[sortD.col] - b[sortD.col]);

    const totalPages = Math.max(1, Math.ceil(enriched.length / PAGE_SIZE));
    const paginated  = showAll ? enriched : enriched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // Totaux sur toutes les entrées filtrées
    const totalCommPDG    = enriched.reduce((s, e) => s + e.commPDG, 0);
    const totalCommRev    = enriched.reduce((s, e) => s + e.commRev, 0);
    const totalCommReelle = enriched.reduce((s, e) => s + e.commReelle, 0);

    return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>N° PDV / Nom</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Type</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Zone / Quartier</th>
              {thD('commPDG',    'Commission PDG',        'var(--success)')}
              {thD('commRev',    'Commission Revendeur',  '#8b5cf6')}
              {thD('commReelle', 'Comm. Réelle PDG',      '#f59e0b')}
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Paiement</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <PDVCell numero={e.pdv_numero} nom={e.pdv_nom} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span className="status-badge" style={{ background: TYPE_COLORS[e.pdv_type] }}>{e.pdv_type}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 12 }}>{e.zone || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.quartier || '—'}</div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(e.commPDG)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{fmt(e.commRev)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{fmt(e.commReelle)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {e.gere_reversement
                      ? <span className="status-badge" style={{ background: '#8b5cf6', fontSize: 10 }}>🏪 PDG → PDV</span>
                      : <span className="status-badge" style={{ background: '#3b82f6', fontSize: 10 }}>🟦 Orange → PDV</span>}
                  </td>
                </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Aucun résultat</td></tr>
            )}
            {/* Ligne de totaux (sur toutes les entrées filtrées) */}
            {entries.length > 0 && (
              <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,105,0,0.06)', fontWeight: 800 }}>
                <td style={{ padding: '10px 12px', color: '#FF6900' }}>
                  <b>TOTAL</b>
                  <div style={{ fontSize: 10, color: '#8a8a9a', fontWeight: 400 }}>{entries.length} PDV</div>
                </td>
                <td></td>
                <td></td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 800 }}>{fmt(totalCommPDG)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 800 }}>{fmt(totalCommRev)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>{fmt(totalCommReelle)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="pdv-pagination">
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {enriched.length} PDV {!showAll && totalPages > 1 ? `· Page ${page} / ${totalPages}` : '· Tous affichés'}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!showAll && totalPages > 1 && <>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Préc.</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Suiv. →</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          </>}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setShowAll(v => !v); setPage(1); }}
            style={{ color: showAll ? 'var(--primary)' : '#8a8a9a', fontWeight: 600 }}
          >
            {showAll ? '📄 Paginer' : '📋 Tout afficher'}
          </button>
        </div>
      </div>
    </>
    );
  };

  if (loading) return <div className="loading-state">Chargement…</div>;

  return (
    <>
      {/* ── Section 1 : Zones & Localisation ── */}
      <AccordionSection title="🌍 Zones & Localisation" badge={`${entries1.length} PDV`} defaultOpen={true}>
        <div className="pdv-filters card mb-16">
          <div className="filter-search">
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8a8a9a', fontSize: 14 }}>🔍</span>
            <input
              type="text"
              placeholder="Rechercher N° ou nom PDV…"
              value={search1}
              onChange={e => setSearch1(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          <div className="filter-selects">
            <select value={zone} onChange={e => { setZone(e.target.value); setSousZone(''); setQuartier(''); }}>
              <option value="">Toutes les zones</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <select value={sousZone} onChange={e => setSousZone(e.target.value)}>
              <option value="">Toutes sous-zones</option>
              {sousZones.filter(sz => !zone || allEntries.find(e => e.zone === zone && e.sous_zone === sz)).map(sz => <option key={sz} value={sz}>{sz}</option>)}
            </select>
            <select value={quartier} onChange={e => setQuartier(e.target.value)}>
              <option value="">Tous quartiers</option>
              {quartiers.filter(q => !zone || allEntries.find(e => e.zone === zone && e.quartier === q)).map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>
        {renderTable(entries1, page1, setPage1, showAll1, setShowAll1)}
      </AccordionSection>

      {/* ── Section 2 : Réseau & PDV ── */}
      <AccordionSection title="👥 Réseau & PDV" badge={`${entries2.length} PDV`} defaultOpen={false}>
        <div className="pdv-filters card mb-16">
          <div className="filter-search">
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8a8a9a', fontSize: 14 }}>🔍</span>
            <input
              type="text"
              placeholder="Rechercher N° ou nom PDV…"
              value={search2}
              onChange={e => setSearch2(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
          <div className="filter-selects">
            <select value={superviseur} onChange={e => setSuperviseur(e.target.value)}>
              <option value="">Tous superviseurs</option>
              {superviseurs.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={gestionnaire} onChange={e => setGestionnaire(e.target.value)}>
              <option value="">Tous gestionnaires</option>
              {gestionnaires.filter(g => !superviseur || allEntries.find(e => e.superviseur === superviseur && e.gestionnaire === g)).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={pdvType} onChange={e => setPdvType(e.target.value)}>
              <option value="">Tous types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        {renderTable(entries2, page2, setPage2, showAll2, setShowAll2)}
      </AccordionSection>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant : Évolution par Superviseur / Gestionnaire
// ─────────────────────────────────────────────────────────────────────────────
function EvoReseauSection({ nPeriods, superviseurs, gestionnaires }) {
  const [activeView, setActiveView] = useState('superviseur');
  const [allPeriods, setAllPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [tableData, setTableData] = useState([]);   // [{nom, n_pdv, reseau, pdv, reelle, delta}]
  const [loading, setLoading] = useState(false);

  const liste = activeView === 'superviseur' ? superviseurs : gestionnaires;

  // Charger les périodes disponibles
  useEffect(() => {
    commissionService.periods().then(p => {
      setAllPeriods(p);
      if (p.length) setSelectedPeriod(p[0]);
    }).catch(() => {});
  }, []);

  // Charger les données pour la période sélectionnée
  useEffect(() => {
    if (!selectedPeriod || !liste.length) { setTableData([]); return; }
    setLoading(true);
    // Charger période actuelle ET période précédente pour calculer la variation
    const idx = allPeriods.indexOf(selectedPeriod);
    const prevPeriod = allPeriods[idx + 1] || null;

    Promise.all([
      commissionService.entries({ period_key: selectedPeriod, limit: 5000 }).catch(() => []),
      prevPeriod ? commissionService.entries({ period_key: prevPeriod, limit: 5000 }).catch(() => []) : Promise.resolve([]),
    ]).then(([curEntries, prevEntries]) => {
      const agg = (entries, key) => {
        const map = {};
        entries.forEach(e => {
          const k = e[key] || '—';
          if (!map[k]) map[k] = { nom: k, reseau: 0, pdv: 0, n: 0 };
          map[k].reseau += e.montant_reseau || 0;
          map[k].pdv    += e.gere_reversement ? 0 : (e.montant_pdv || 0);
          map[k].n      += 1;
        });
        return map;
      };
      const cur  = agg(curEntries, activeView);
      const prev = agg(prevEntries, activeView);
      const rows = liste
        .filter(nom => nom && nom !== '—' && nom.trim() !== '')
        .map(nom => {
          const c = cur[nom]  || { reseau:0, pdv:0, n:0 };
          const p = prev[nom] || { reseau:0, pdv:0, n:0 };
          const reelle = (c.reseau + c.pdv) * 0.3;
          const delta  = p.reseau ? ((c.reseau - p.reseau) / p.reseau * 100) : null;
          return { nom, n_pdv: c.n, reseau: c.reseau, pdv: c.pdv, reelle, delta };
        })
        .filter(r => !isNaN(r.reseau) && r.nom !== '—')
        .sort((a, b) => b.reseau - a.reseau);
      setTableData(rows);
      setLoading(false);
    });
  }, [selectedPeriod, activeView, liste.join(',')]);

  return (
    <div className="modal-section" style={{ background: 'var(--bg-card)', marginTop: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px 0' }}>👥 Évolution par {activeView === 'superviseur' ? 'Superviseur' : 'Gestionnaire'}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Toggle Superviseur / Gestionnaire */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {['superviseur','gestionnaire'].map(t => (
              <button key={t} onClick={() => setActiveView(t)}
                style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: activeView === t ? 'var(--primary)' : 'var(--bg-card)',
                  color: activeView === t ? '#fff' : 'var(--text-secondary)' }}>
                {t === 'superviseur' ? '👤 Superviseurs' : '🏪 Gestionnaires'}
              </button>
            ))}
          </div>
          {/* Filtre période */}
          <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', minWidth: 130 }}>
            {allPeriods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="loading-state" style={{ padding: 16 }}>Chargement…</div>}

      {!loading && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>
                  {activeView === 'superviseur' ? '👤 Superviseur' : '🏪 Gestionnaire'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>PDV</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)' }}>Commission PDG</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>Commission Revendeur</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b' }}>Comm. Réelle PDG</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: '#8a8a9a' }}>Variation vs période préc.</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((r, i) => (
                <tr key={r.nom} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{r.nom}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{r.n_pdv}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(r.reseau)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{fmt(r.pdv)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{fmt(r.reelle)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {r.delta !== null ? (
                      <span style={{ color: r.delta >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                        {r.delta >= 0 ? '▲' : '▼'} {Math.abs(r.delta).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {tableData.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Aucune donnée pour cette période</td></tr>
              )}
            </tbody>
            {tableData.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.04)', fontWeight: 800 }}>
                  <td style={{ padding: '10px 12px' }}><b>TOTAL</b></td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>{tableData.reduce((s,r)=>s+r.n_pdv,0)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 800 }}>{fmt(tableData.reduce((s,r)=>s+r.reseau,0))}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 800 }}>{fmt(tableData.reduce((s,r)=>s+r.pdv,0))}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>{fmt(tableData.reduce((s,r)=>s+r.reelle,0))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 3 : ÉVOLUTION
// ─────────────────────────────────────────────────────────────────────────────
const COMM_CRITERIA = {
  commission_pdg:   { label: 'Commission PDG',       field: 'reseau', color: 'var(--success)' },
  commission_reelle:{ label: 'Commission Réelle PDG', field: 'reelle', color: '#f59e0b' },
};

function TabEvolution() {
  const [data, setData]             = useState([]);
  const [nPeriods, setNPeriods]     = useState(6);
  const [typeFilter, setTypeFilter] = useState('');
  const [criterion, setCriterion]   = useState('commission_pdg');

  // Filtres géographiques et réseau
  const [zone, setZone]             = useState('');
  const [sousZone, setSousZone]     = useState('');
  const [quartier, setQuartier]     = useState('');
  const [superviseur, setSuperviseur] = useState('');

  // Listes dynamiques (chargées depuis les entries de la période la plus récente)
  const [zones, setZones]           = useState([]);
  const [sousZones, setSousZones]   = useState([]);
  const [quartiers, setQuartiers]   = useState([]);
  const [superviseurs, setSuperviseurs] = useState([]);
  const [gestionnaires, setGestionnaires] = useState([]);
  const [evoReseau, setEvoReseau] = useState([]);

  // Charger les listes de filtres depuis TOUTES les périodes disponibles pour avoir toutes les sous-zones
  useEffect(() => {
    commissionService.periods().then(async periods => {
      if (!periods.length) return;
      // Charger les 3 dernières périodes pour avoir toutes les valeurs distinctes
      const periodsToLoad = periods.slice(0, 3);
      const results = await Promise.all(
        periodsToLoad.map(p => commissionService.entries({ period_key: p, limit: 5000 }).catch(() => []))
      );
      const allEntries = results.flat();
      setZones([...new Set(allEntries.map(e => e.zone).filter(Boolean))].sort());
      setSousZones([...new Set(allEntries.map(e => e.sous_zone).filter(Boolean))].sort());
      setQuartiers([...new Set(allEntries.map(e => e.quartier).filter(Boolean))].sort());
      setSuperviseurs([...new Set(allEntries.map(e => e.superviseur).filter(Boolean))].sort());
      setGestionnaires([...new Set(allEntries.map(e => e.gestionnaire).filter(Boolean))].sort());
    }).catch(() => {});
  }, []);

  useEffect(() => {
    commissionService.evolution(nPeriods, typeFilter || undefined, {
      zone: zone || undefined,
      sous_zone: sousZone || undefined,
      quartier: quartier || undefined,
      superviseur: superviseur || undefined,
    }).then(rows => {
      const enriched = rows.map(d => ({
        ...d,
        reelle: (d.reseau + d.pdv) * 0.3,
      }));
      setData(enriched);
    });
  }, [nPeriods, typeFilter, zone, sousZone, quartier, superviseur]);

  // Charger l'évolution par gestionnaire/superviseur depuis les entries
  useEffect(() => {
    commissionService.periods().then(async periods => {
      if (!periods.length) return;
      const periodsToLoad = periods.slice(0, nPeriods);
      const results = await Promise.all(
        periodsToLoad.map(p => commissionService.entries({ period_key: p, limit: 5000 }).then(r => ({ period: p, entries: r })).catch(() => ({ period: p, entries: [] })))
      );
      // Construire le tableau par gestionnaire/superviseur par période
      const byReseau = {};
      results.forEach(({ period, entries }) => {
        entries.forEach(e => {
          const key = e.superviseur || '—';
          if (!byReseau[key]) byReseau[key] = { superviseur: key, gestionnaires: new Set(), periods: {} };
          if (e.gestionnaire) byReseau[key].gestionnaires.add(e.gestionnaire);
          if (!byReseau[key].periods[period]) byReseau[key].periods[period] = { reseau: 0, pdv: 0, n: 0 };
          byReseau[key].periods[period].reseau += e.montant_reseau || 0;
          byReseau[key].periods[period].pdv += e.montant_pdv || 0;
          byReseau[key].periods[period].n += 1;
        });
      });
      setEvoReseau({ rows: Object.values(byReseau), periods: periodsToLoad });
    }).catch(() => {});
  }, [nPeriods]);

  if (!data.length) return <div className="loading-state">Calcul…</div>;

  const crit = COMM_CRITERIA[criterion];
  const getValue = d => d[crit.field] || 0;
  const maxVal = Math.max(...data.map(getValue)) || 1;

  return (
    <>
      {/* ── Sélecteur de critère + filtres ── */}
      {/* Ligne 1 : boutons critères */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        {Object.entries(COMM_CRITERIA).map(([key, c]) => (
          <button key={key}
            onClick={() => setCriterion(key)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: criterion === key ? COMM_CRITERIA[criterion].color : 'var(--bg-card)',
              color: criterion === key ? '#fff' : 'var(--text-secondary)',
              boxShadow: criterion === key ? `0 2px 8px ${COMM_CRITERIA[criterion].color}55` : 'none',
              transition: 'all 0.2s',
            }}>
            {c.label}
          </button>
        ))}
      </div>
      {/* Ligne 2 : tous les selects sur une seule ligne */}
      <div className="pdv-filters card mb-16">
        <div className="filter-selects" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          <select value={nPeriods} onChange={e => setNPeriods(parseInt(e.target.value))}>
            <option value={3}>3 mois</option><option value={6}>6 mois</option><option value={12}>12 mois</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={zone} onChange={e => { setZone(e.target.value); setSousZone(''); setQuartier(''); }}>
            <option value="">Toutes zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={sousZone} onChange={e => setSousZone(e.target.value)}>
            <option value="">Toutes sous-zones</option>
            {sousZones.map(sz => <option key={sz} value={sz}>{sz}</option>)}
          </select>
          <select value={quartier} onChange={e => setQuartier(e.target.value)}>
            <option value="">Tous quartiers</option>
            {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          <select value={superviseur} onChange={e => setSuperviseur(e.target.value)}>
            <option value="">Tous superviseurs</option>
            {superviseurs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ── Graphique en barres ── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📈 Évolution — {crit.label}</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 220, marginTop: 16, padding: '0 8px' }}>
          {data.map((d, i) => {
            const val = getValue(d);
            const h = val > 0 ? (val / maxVal * 190) : 4;
            const prev = data[i - 1];
            const delta = prev && getValue(prev) ? ((val - getValue(prev)) / getValue(prev) * 100) : null;
            return (
              <div key={d.period_key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: crit.color, fontWeight: 700, textAlign: 'center', wordBreak: 'break-all' }}>
                  {Math.round(val).toLocaleString('en-US').replace(/,/g, ' ')}
                </div>
                {delta !== null && (
                  <div style={{ fontSize: 9, fontWeight: 700, color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                  </div>
                )}
                <div style={{ width: '100%', position: 'relative', height: h }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: h, background: crit.color, borderRadius: '4px 4px 0 0', opacity: 0.85 }}/>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{d.period_key}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{d.n_pdv} PDV</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tableau de données ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Période</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>PDV</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)' }}>Commission PDG</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>Commission Revendeur</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b' }}>Commission Réelle PDG</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: crit.color }}>Variation {crit.label}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => {
              const prev = data[i - 1];
              const val = getValue(d);
              const delta = prev && getValue(prev) ? ((val - getValue(prev)) / getValue(prev) * 100) : null;
              return (
                <tr key={d.period_key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{d.period_key}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{d.n_pdv}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(d.reseau)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{fmt(d.pdv)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{fmt(d.reelle)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {delta !== null ? (
                      <span style={{ color: delta >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Évolution par Superviseur / Gestionnaire ── */}
      <EvoReseauSection nPeriods={nPeriods} superviseurs={superviseurs} gestionnaires={gestionnaires} crit={crit} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 4 : TOP PDV
// ─────────────────────────────────────────────────────────────────────────────
function TabTop({ period }) {
  const [allData, setAllData]       = useState([]);
  const [data, setData]             = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [n, setN]                   = useState(20);
  const [criterion, setCriterion]   = useState('commission_pdg');
  const [sortT, setSortT]           = useState({ col: 'commPDG', dir: 'desc' });

  const [zone, setZone]             = useState('');
  const [sousZone, setSousZone]     = useState('');
  const [quartier, setQuartier]     = useState('');
  const [superviseur, setSuperviseur] = useState('');

  const [zones, setZones]           = useState([]);
  const [sousZones, setSousZones]   = useState([]);
  const [quartiers, setQuartiers]   = useState([]);
  const [superviseurs, setSuperviseurs] = useState([]);

  // Charger les listes dynamiques
  useEffect(() => {
    commissionService.entries({ period_key: period, limit: 2000 }).then(r => {
      setZones([...new Set(r.map(e => e.zone).filter(Boolean))].sort());
      setSousZones([...new Set(r.map(e => e.sous_zone).filter(Boolean))].sort());
      setQuartiers([...new Set(r.map(e => e.quartier).filter(Boolean))].sort());
      setSuperviseurs([...new Set(r.map(e => e.superviseur).filter(Boolean))].sort());
    }).catch(() => {});
  }, [period]);

  // Charger les données (top N avec filtre type)
  useEffect(() => {
    commissionService.topPdvs(period, 500, typeFilter || undefined).then(rows => {
      const enriched = rows.map(e => ({
        ...e,
        commPDG:    e.montant_reseau || 0,
        commRev:    e.gere_reversement ? 0 : (e.montant_pdv || 0),
        commReelle: ((e.montant_reseau || 0) + (e.gere_reversement ? 0 : (e.montant_pdv || 0))) * 0.3,
      }));
      setAllData(enriched);
    });
  }, [period, typeFilter]);

  // Filtrage + tri + limite
  useEffect(() => {
    let filtered = [...allData];
    if (zone)        filtered = filtered.filter(e => e.zone === zone);
    if (sousZone)    filtered = filtered.filter(e => e.sous_zone === sousZone);
    if (quartier)    filtered = filtered.filter(e => e.quartier === quartier);
    if (superviseur) filtered = filtered.filter(e => e.superviseur === superviseur);
    const field = criterion === 'commission_reelle' ? 'commReelle' : 'commPDG';
    filtered.sort((a, b) => b[field] - a[field]);
    setData(filtered.slice(0, n));
  }, [allData, zone, sousZone, quartier, superviseur, criterion, n]);

  const crit = COMM_CRITERIA[criterion];
  const medalColor = i => i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-muted)';

  const thT = (col, label, color) => {
    const active = sortT.col === col;
    return (
      <th onClick={() => setSortT(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
        style={{ padding: '10px 12px', textAlign: 'right', color: active ? color : '#8a8a9a', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {label} {active ? (sortT.dir === 'desc' ? '▼' : '▲') : '⇅'}
      </th>
    );
  };

  const sortedData = [...data].sort((a, b) =>
    sortT.dir === 'desc' ? b[sortT.col] - a[sortT.col] : a[sortT.col] - b[sortT.col]
  );

  return (
    <>
      {/* Ligne 1 : boutons critères */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        {Object.entries(COMM_CRITERIA).map(([key, c]) => (
          <button key={key} onClick={() => setCriterion(key)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: criterion === key ? c.color : 'var(--bg-card)',
              color: criterion === key ? '#fff' : 'var(--text-secondary)',
              boxShadow: criterion === key ? `0 2px 8px ${c.color}55` : 'none',
              transition: 'all 0.2s',
            }}>{c.label}</button>
        ))}
      </div>

      {/* Slider + selects */}
      <div className="pdv-filters card mb-16" style={{ flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <span style={{ fontSize: 12, color: '#8a8a9a', whiteSpace: 'nowrap', fontWeight: 600 }}>Top PDV :</span>
          <input
            type="range" min={5} max={100} step={5} value={n}
            onChange={e => setN(parseInt(e.target.value))}
            style={{ flex: 1, accentColor: crit.color, height: 4 }}
          />
          <span style={{ fontSize: 14, fontWeight: 800, color: crit.color, minWidth: 55, textAlign: 'right' }}>
            Top {n}
          </span>
        </div>
        <div className="filter-selects" style={{ flexWrap: 'nowrap', overflowX: 'auto', width: '100%' }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={zone} onChange={e => { setZone(e.target.value); setSousZone(''); setQuartier(''); }}>
            <option value="">Toutes zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={sousZone} onChange={e => setSousZone(e.target.value)}>
            <option value="">Toutes sous-zones</option>
            {sousZones.map(sz => <option key={sz} value={sz}>{sz}</option>)}
          </select>
          <select value={quartier} onChange={e => setQuartier(e.target.value)}>
            <option value="">Tous quartiers</option>
            {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          <select value={superviseur} onChange={e => setSuperviseur(e.target.value)}>
            <option value="">Tous superviseurs</option>
            {superviseurs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>#</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>PDV</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Type</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Zone / Quartier</th>
              {thT('commPDG',    'Commission PDG',        'var(--success)')}
              {thT('commRev',    'Commission Revendeur',  '#8b5cf6')}
              {thT('commReelle', 'Comm. Réelle PDG',      '#f59e0b')}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <b style={{ color: medalColor(i), fontSize: 15 }}>#{i+1}</b>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <PDVCell numero={e.pdv_numero} nom={e.pdv_nom} />
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <span className="status-badge" style={{ background: TYPE_COLORS[e.pdv_type] }}>{e.pdv_type}</span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 12 }}>{e.zone || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.quartier || '—'}</div>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{fmt(e.commPDG)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{fmt(e.commRev)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>{fmt(e.commReelle)}</td>
              </tr>
            ))}
            {sortedData.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Aucun résultat</td></tr>
            )}
          </tbody>
          {sortedData.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.04)', fontWeight: 800 }}>
                <td colSpan={4} style={{ padding: '10px 12px' }}><b>TOTAL — {sortedData.length} PDV</b></td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success)', fontWeight: 800 }}>{fmt(sortedData.reduce((s,e)=>s+e.commPDG,0))}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 800 }}>{fmt(sortedData.reduce((s,e)=>s+e.commRev,0))}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 800 }}>{fmt(sortedData.reduce((s,e)=>s+e.commReelle,0))}</td>
              </tr>
            </tfoot>
          )}
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
// Onglet 5 : ANALYSE IA
// ─────────────────────────────────────────────────────────────────────────────
function TabAnalyseIA({ period }) {
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading]       = useState(true);

  const [typeFilter, setTypeFilter] = useState('');
  const [zone, setZone]             = useState('');
  const [sousZone, setSousZone]     = useState('');
  const [quartier, setQuartier]     = useState('');
  const [superviseur, setSuperviseur] = useState('');
  const [zones, setZones]           = useState([]);
  const [sousZones, setSousZones]   = useState([]);
  const [quartiers, setQuartiers]   = useState([]);
  const [superviseurs, setSuperviseurs] = useState([]);
  const [activeSection, setActiveSection]   = useState('tendances');
  const [activeTendance, setActiveTendance] = useState(null);
  const [criterion, setCriterion]           = useState('commission_pdg'); // commission_pdg | commission_reelle
  const [prevEntries, setPrevEntries]       = useState([]);

  useEffect(() => {
    setLoading(true);
    // Calculer la période précédente directement depuis le period prop
    const [yr, mn] = period.split('-').map(Number);
    const prevMn = mn === 1 ? 12 : mn - 1;
    const prevYr = mn === 1 ? yr - 1 : yr;
    const prevPeriod = `${prevYr.toString().padStart(4,'0')}-${prevMn.toString().padStart(2,'0')}`;

    Promise.all([
      commissionService.entries({ period_key: period, limit: 2000 }),
      commissionService.entries({ period_key: prevPeriod, limit: 2000 }),
    ]).then(([entries, prev]) => {
      setAllEntries(entries);
      setPrevEntries(prev);
      setZones([...new Set(entries.map(e => e.zone).filter(Boolean))].sort());
      setSousZones([...new Set(entries.map(e => e.sous_zone).filter(Boolean))].sort());
      setQuartiers([...new Set(entries.map(e => e.quartier).filter(Boolean))].sort());
      setSuperviseurs([...new Set(entries.map(e => e.superviseur).filter(Boolean))].sort());
    }).finally(() => setLoading(false));
  }, [period]);

  const filtered = allEntries.filter(e => {
    if (typeFilter && e.pdv_type !== typeFilter) return false;
    if (zone && e.zone !== zone) return false;
    if (sousZone && e.sous_zone !== sousZone) return false;
    if (quartier && e.quartier !== quartier) return false;
    if (superviseur && e.superviseur !== superviseur) return false;
    return true;
  }).map(e => ({ ...e, commPDG: e.montant_reseau||0, commRev: e.montant_pdv||0, commReelle: ((e.montant_reseau||0)+(e.montant_pdv||0))*0.3 }));

  const crit = COMM_CRITERIA[criterion];
  const getValue = e => criterion === 'commission_reelle' ? e.commReelle : e.commPDG;

  const prevMap = {};
  prevEntries.forEach(e => {
    const commPDG = e.montant_reseau || 0;
    const commReelle = ((e.montant_reseau||0)+(e.montant_pdv||0))*0.3;
    prevMap[e.pdv_numero] = criterion === 'commission_reelle' ? commReelle : commPDG;
  });

  const pdvTendances = filtered.map(e => {
    const curr = getValue(e), prev = prevMap[e.pdv_numero]||0;
    const delta = prev > 0 ? ((curr-prev)/prev*100) : null;
    return { ...e, prev, delta, tendance: delta===null?'nouveau': delta>=10?'hausse': delta<=-20?'chute': delta<0?'baisse':'stable' };
  }).filter(e => getValue(e) > 0);

  const enHausse = pdvTendances.filter(e=>e.tendance==='hausse').sort((a,b)=>b.delta-a.delta);
  const enBaisse = pdvTendances.filter(e=>e.tendance==='baisse').sort((a,b)=>a.delta-b.delta);
  const enChute  = pdvTendances.filter(e=>e.tendance==='chute').sort((a,b)=>a.delta-b.delta);
  const stables  = pdvTendances.filter(e=>e.tendance==='stable');
  const nouveaux = pdvTendances.filter(e=>e.tendance==='nouveau');

  const byZone = {};
  filtered.forEach(e => { const z=e.zone||'Sans zone'; if(!byZone[z]) byZone[z]={zone:z,n:0,commReelle:0,commPDG:0}; byZone[z].n++; byZone[z].commReelle+=e.commReelle; byZone[z].commPDG+=e.commPDG; });
  const zonesData = Object.values(byZone).sort((a,b)=>b.commReelle-a.commReelle);

  const byQ = {};
  filtered.forEach(e => { const q=e.quartier||'Sans quartier'; if(!byQ[q]) byQ[q]={quartier:q,n:0,commReelle:0,zone:e.zone}; byQ[q].n++; byQ[q].commReelle+=e.commReelle; });
  const quartiersData = Object.values(byQ).sort((a,b)=>b.commReelle-a.commReelle);
  const top5Q = quartiersData.slice(0,5);
  const flop5Q = [...quartiersData].sort((a,b)=>a.commReelle-b.commReelle).slice(0,5);
  const opportunities = [...enBaisse,...enChute].filter(e=>e.prev>50000).sort((a,b)=>b.prev-a.prev).slice(0,20);

  const sections = [
    { id:'tendances', label:'📊 Tendances PDV', color:'#3b82f6' },
    { id:'zones',     label:'🌍 Zones & Quartiers', color:'#8b5cf6' },
    { id:'opportunites', label:'🎯 Opportunités', color:'#f59e0b' },
  ];

  if (loading) return <div className="loading-state">🤖 Analyse IA en cours…</div>;

  const thStyle = c => ({ padding:'10px 12px', textAlign:'left', color: c||'#8a8a9a' });
  const tdStyle = (align, color, fw) => ({ padding:'10px 12px', textAlign:align||'left', color:color||'inherit', fontWeight:fw||'normal' });

  return (
    <>
      {/* Boutons critères */}
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        {Object.entries(COMM_CRITERIA).map(([key, c]) => (
          <button key={key} onClick={() => { setCriterion(key); setActiveTendance(null); }}
            style={{
              padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:13,
              background: criterion===key ? c.color : 'var(--bg-card)',
              color: criterion===key ? '#fff' : 'var(--text-secondary)',
              boxShadow: criterion===key ? `0 2px 8px ${c.color}55` : 'none',
              transition:'all 0.2s',
            }}>{c.label}</button>
        ))}
      </div>

      {/* Filtres */}
      <div className="pdv-filters card mb-16">
        <div className="filter-selects" style={{ flexWrap:'nowrap', overflowX:'auto' }}>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value="">Tous types</option>
            {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select value={zone} onChange={e=>{setZone(e.target.value);setSousZone('');setQuartier('');}}>
            <option value="">Toutes zones</option>{zones.map(z=><option key={z} value={z}>{z}</option>)}
          </select>
          <select value={sousZone} onChange={e=>setSousZone(e.target.value)}>
            <option value="">Toutes sous-zones</option>{sousZones.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={quartier} onChange={e=>setQuartier(e.target.value)}>
            <option value="">Tous quartiers</option>{quartiers.map(q=><option key={q} value={q}>{q}</option>)}
          </select>
          <select value={superviseur} onChange={e=>setSuperviseur(e.target.value)}>
            <option value="">Tous superviseurs</option>{superviseurs.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs cliquables */}
      <div className="stats-grid" style={{ marginBottom:16 }}>
        {[
          { key:'hausse',  label:'📈 En hausse', val:enHausse.length, color:'var(--success)', sub:'≥ +10% vs mois préc.' },
          { key:'baisse',  label:'📉 En baisse',  val:enBaisse.length, color:'#f59e0b',        sub:'-1% à -19%' },
          { key:'chute',   label:'🔴 En chute',   val:enChute.length,  color:'var(--danger)',  sub:'≤ -20%' },
          { key:'stable',  label:'⚖️ Stables',    val:stables.length,  color:'#8b5cf6',        sub:'0% à +9%' },
          { key:'nouveau', label:'🆕 Nouveaux',   val:nouveaux.length, color:'#3b82f6',        sub:'Absents le mois préc.' },
        ].map(k=>{
          const isActive = activeTendance === k.key;
          return (
          <div key={k.label} className="stat-card"
            onClick={() => { setActiveTendance(isActive ? null : k.key); setActiveSection('tendances'); }}
            style={{ borderLeftColor:k.color, cursor:'pointer', transition:'all 0.2s',
              background: isActive ? `${k.color}22` : undefined,
              boxShadow: isActive ? `0 0 0 2px ${k.color}` : undefined,
            }}>
            <div className="stat-label">{k.label}</div>
            <div className="stat-value" style={{ fontSize:28, color:k.color, fontWeight:800 }}>{k.val}</div>
            <small>{k.sub}</small>
            {isActive && <div style={{ fontSize:10, color:k.color, fontWeight:700, marginTop:4 }}>✓ Filtré</div>}
          </div>
          );
        })}
      </div>

      {/* Navigation sections */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{
            padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:12, transition:'all 0.2s',
            background: activeSection===s.id ? s.color : 'var(--bg-card)',
            color: activeSection===s.id ? '#fff' : 'var(--text-secondary)',
            boxShadow: activeSection===s.id ? `0 2px 8px ${s.color}55` : 'none',
          }}>{s.label}</button>
        ))}
      </div>

      {/* Tendances */}
      {activeSection==='tendances' && (() => {
        const allSections = [
          { key:'chute',   list:enChute,  label:`🔴 PDV en chute libre (${enChute.length})`,  color:'var(--danger)',  bg:'rgba(239,68,68,0.06)' },
          { key:'baisse',  list:enBaisse, label:`📉 PDV en baisse (${enBaisse.length})`,       color:'#f59e0b',       bg:'rgba(245,158,11,0.06)' },
          { key:'hausse',  list:enHausse, label:`📈 PDV en hausse (${enHausse.length})`,       color:'var(--success)',bg:'rgba(34,197,94,0.06)' },
          { key:'stable',  list:stables,  label:`⚖️ PDV stables (${stables.length})`,          color:'#8b5cf6',       bg:'rgba(139,92,246,0.06)' },
          { key:'nouveau', list:nouveaux, label:`🆕 Nouveaux PDV (${nouveaux.length})`,        color:'#3b82f6',       bg:'rgba(59,130,246,0.06)' },
        ];
        const toShow = activeTendance ? allSections.filter(s=>s.key===activeTendance) : allSections;
        return toShow.map(({list,label,color,bg,key}) => list.length>0 && (
        <AccordionSection key={label} title={label} badge={`${list.length} PDV`} defaultOpen={true}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr>
                <th style={thStyle()}>PDV</th><th style={thStyle()}>Type</th><th style={thStyle()}>Zone / Quartier</th>
                <th style={{...thStyle(),...{textAlign:'right'}}}>Mois préc.</th>
                <th style={{...thStyle(crit.color),...{textAlign:'right'}}}>Actuel ({crit.label})</th>
                <th style={{...thStyle(color),...{textAlign:'right'}}}>Variation</th>
                <th style={thStyle()}>Superviseur</th>
              </tr></thead>
              <tbody>
                {list.slice(0,50).map(e=>(
                  <tr key={e.id} style={{borderBottom:'1px solid var(--border)',background:bg}}>
                    <td style={tdStyle()}><PDVCell numero={e.pdv_numero} nom={e.pdv_nom}/></td>
                    <td style={tdStyle('center')}><span className="status-badge" style={{background:TYPE_COLORS[e.pdv_type]}}>{e.pdv_type}</span></td>
                    <td style={tdStyle()}><div style={{fontSize:12}}>{e.zone||'—'}</div><div style={{fontSize:11,color:'var(--text-secondary)'}}>{e.quartier||''}</div></td>
                    <td style={tdStyle('right','var(--text-secondary)')}>{fmt(e.prev)}</td>
                    <td style={tdStyle('right',crit.color,700)}>{fmt(getValue(e))}</td>
                    <td style={tdStyle('right',color,800)}>{e.delta>=0?'▲':'▼'} {Math.abs(e.delta).toFixed(1)}%</td>
                    <td style={{...tdStyle(),...{fontSize:11,color:'var(--text-secondary)'}}}>{e.superviseur||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AccordionSection>
        ));
      })()}

      {/* Zones & Quartiers */}
      {activeSection==='zones' && <>
        <AccordionSection title="🌍 Performance par Zone" badge={`${zonesData.length} zones`} defaultOpen={true}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr>
                <th style={thStyle()}>Zone</th><th style={{...thStyle(),...{textAlign:'center'}}}>PDV</th>
                <th style={thStyle('#f59e0b')}>Comm. Réelle PDG</th><th style={thStyle('var(--success)')}>Comm. PDG</th>
                <th style={thStyle()}>Moy./PDV</th><th style={thStyle()}>Part</th>
              </tr></thead>
              <tbody>
                {zonesData.map((z,i)=>{
                  const total=zonesData.reduce((s,x)=>s+x.commReelle,0);
                  const pct=total>0?z.commReelle/total*100:0;
                  const isTop=i<Math.ceil(zonesData.length*0.3);
                  const isFlop=i>=zonesData.length-Math.ceil(zonesData.length*0.3);
                  return (
                    <tr key={z.zone} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={tdStyle(null,null,700)}>{z.zone}</td>
                      <td style={tdStyle('center')}>{z.n}</td>
                      <td style={tdStyle('right','#f59e0b',700)}>{fmt(z.commReelle)}</td>
                      <td style={tdStyle('right','var(--success)')}>{fmt(z.commPDG)}</td>
                      <td style={tdStyle('right','var(--text-secondary)')}>{z.n>0?fmt(z.commReelle/z.n):'—'}</td>
                      <td style={tdStyle()}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{flex:1,height:8,background:'rgba(255,255,255,0.1)',borderRadius:4}}>
                            <div style={{width:`${pct}%`,height:'100%',borderRadius:4,background:isTop?'var(--success)':isFlop?'var(--danger)':'#f59e0b'}}/>
                          </div>
                          <span style={{fontSize:11,color:isTop?'var(--success)':isFlop?'var(--danger)':'#f59e0b',fontWeight:700}}>{pct.toFixed(1)}% {isTop?'🌟':isFlop?'⚠️':''}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AccordionSection>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          {[{list:top5Q,title:'🏆 Top 5 Quartiers',color:'#FFD700'},{list:flop5Q,title:'⚠️ Flop 5 Quartiers',color:'var(--danger)'}].map(({list,title,color})=>(
            <AccordionSection key={title} title={title} defaultOpen={true}>
              {list.map((q,i)=>(
                <div key={q.quartier} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div>
                    <span style={{fontWeight:800,color,marginRight:8}}>#{i+1}</span>
                    <span style={{fontWeight:700}}>{q.quartier}</span>
                    <div style={{fontSize:11,color:'var(--text-secondary)'}}>{q.zone} · {q.n} PDV</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:800,color:'#f59e0b'}}>{fmt(q.commReelle)}</div>
                    <div style={{fontSize:10,color:'var(--text-secondary)'}}>Comm. Réelle</div>
                  </div>
                </div>
              ))}
            </AccordionSection>
          ))}
        </div>
      </>}

      {/* Opportunités */}
      {activeSection==='opportunites' && <>
        <div className="modal-section" style={{background:'rgba(245,158,11,0.08)',borderLeft:'4px solid #f59e0b'}}>
          <h3>🎯 Opportunités identifiées</h3>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:0}}>
            PDV qui avaient un bon potentiel le mois précédent mais qui ont chuté. Une intervention ciblée peut les récupérer.
          </p>
        </div>
        <AccordionSection title={`🎯 PDV à récupérer (${opportunities.length})`} defaultOpen={true}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr>
                <th style={thStyle()}>PDV</th><th style={thStyle()}>Type</th><th style={thStyle()}>Zone</th>
                <th style={{...thStyle('var(--success)'),...{textAlign:'right'}}}>Potentiel</th>
                <th style={{...thStyle('var(--danger)'),...{textAlign:'right'}}}>Actuel</th>
                <th style={{...thStyle('var(--danger)'),...{textAlign:'right'}}}>Chute</th>
                <th style={thStyle()}>Superviseur</th>
                <th style={{...thStyle(),...{textAlign:'center'}}}>Action</th>
              </tr></thead>
              <tbody>
                {opportunities.map(e=>(
                  <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={tdStyle()}><PDVCell numero={e.pdv_numero} nom={e.pdv_nom}/></td>
                    <td style={tdStyle('center')}><span className="status-badge" style={{background:TYPE_COLORS[e.pdv_type]}}>{e.pdv_type}</span></td>
                    <td style={tdStyle()}><div style={{fontSize:12}}>{e.zone||'—'}</div><div style={{fontSize:11,color:'var(--text-secondary)'}}>{e.quartier||''}</div></td>
                    <td style={tdStyle('right','var(--success)',700)}>{fmt(e.prev)}</td>
                    <td style={tdStyle('right','var(--danger)',700)}>{fmt(e.commReelle)}</td>
                    <td style={tdStyle('right','var(--danger)',800)}>▼ {Math.abs(e.delta).toFixed(1)}%</td>
                    <td style={{...tdStyle(),...{fontSize:11,color:'var(--text-secondary)'}}}>{e.superviseur||'—'}</td>
                    <td style={tdStyle('center')}>
                      <span style={{fontSize:10,padding:'3px 8px',borderRadius:4,background:'rgba(245,158,11,0.2)',color:'#f59e0b',fontWeight:700}}>
                        {Math.abs(e.delta)>=20?'🚨 Visite urgente':'📞 Appel ciblé'}
                      </span>
                    </td>
                  </tr>
                ))}
                {opportunities.length===0&&<tr><td colSpan={8} style={{padding:20,textAlign:'center',color:'var(--success)'}}>✅ Pas d'opportunités critiques — réseau en bonne santé !</td></tr>}
              </tbody>
            </table>
          </div>
        </AccordionSection>

        <div className="modal-section" style={{background:'var(--bg-card)'}}>
          <h3>💡 Recommandations IA</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>
            {enChute.length>0&&<div style={{padding:16,background:'rgba(239,68,68,0.08)',borderRadius:8,borderLeft:'4px solid var(--danger)'}}>
              <div style={{fontWeight:800,color:'var(--danger)',marginBottom:8}}>🚨 Alerte prioritaire</div>
              <div style={{fontSize:13}}>{enChute.length} PDV en chute libre. Action terrain urgente recommandée.</div>
            </div>}
            {top5Q.length>0&&<div style={{padding:16,background:'rgba(34,197,94,0.08)',borderRadius:8,borderLeft:'4px solid var(--success)'}}>
              <div style={{fontWeight:800,color:'var(--success)',marginBottom:8}}>🌟 Zone forte</div>
              <div style={{fontSize:13}}>Concentrez vos efforts sur <b>{top5Q[0]?.quartier}</b> — meilleur potentiel.</div>
            </div>}
            {flop5Q.length>0&&<div style={{padding:16,background:'rgba(245,158,11,0.08)',borderRadius:8,borderLeft:'4px solid #f59e0b'}}>
              <div style={{fontWeight:800,color:'#f59e0b',marginBottom:8}}>📍 Quartier à améliorer</div>
              <div style={{fontSize:13}}><b>{flop5Q[0]?.quartier}</b> est sous-performant. Plan d'action recommandé.</div>
            </div>}
            {nouveaux.length>0&&<div style={{padding:16,background:'rgba(59,130,246,0.08)',borderRadius:8,borderLeft:'4px solid #3b82f6'}}>
              <div style={{fontWeight:800,color:'#3b82f6',marginBottom:8}}>🆕 Nouveaux PDV</div>
              <div style={{fontSize:13}}>{nouveaux.length} nouveaux PDV actifs. Suivi rapproché recommandé.</div>
            </div>}
          </div>
        </div>
      </>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 6 : IMPORT EXCEL (gardé en interne)
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
