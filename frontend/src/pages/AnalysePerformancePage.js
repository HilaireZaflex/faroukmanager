import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Download, RefreshCw, Settings, Target } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtN = (v, d = 0) => (v === null || v === undefined ? '—'
  : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));

const fmtF = (v) => (v === null || v === undefined ? '—' : `${fmtN(v)} F`);

const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmtN(v, 1)} %`);

const PRIO = {
  P1: { label: '🔴 P1 URGENCE', bg: 'rgba(255,71,87,0.15)', color: '#ff4757' },
  P2: { label: '🟠 P2 À RÉCUPÉRER', bg: 'rgba(255,165,2,0.15)', color: '#ffa502' },
  P3: { label: '🟡 P3 À SURVEILLER', bg: 'rgba(255,193,7,0.15)', color: '#ffc107' },
  P4: { label: '🟢 P4 STABLE', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
};

const scoreColor = (s) => (s >= 70 ? '#ff4757' : s >= 50 ? '#ffa502' : s >= 30 ? '#ffc107' : '#22c55e');

const varColor = (v) => (v == null ? '#64748b' : v < 0 ? '#ff4757' : '#22c55e');

const METRIQUES = [
  { id: 'volume', label: 'Volume (CI+CO)' },
  { id: 'real', label: 'REAL TTC (commission réelle agent)' },
  { id: 'rendement', label: 'Rendement (REAL ÷ Volume)' },
];

// ── Formulaire de configuration ───────────────────────────────────────────────
function TabConfig({ config, onSaved }) {
  const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify(config || {})));
  const [busy, setBusy] = useState(false);
  const set = (path, v) => setCfg(prev => {
    const next = { ...prev };
    const parts = path.split('.');
    let cur = next;
    for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = { ...(cur[parts[i]] || {}) }; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = v;
    return next;
  });
  const arr = (a) => (Array.isArray(a) ? a.join(', ') : '');
  const parseArr = (s) => String(s).split(',').map(x => parseFloat(x.trim())).filter(x => !isNaN(x));

  const save = async () => {
    setBusy(true);
    try { await api.put('/analyse-perf/config', cfg); toast.success('Paramètres enregistrés'); onSaved && onSaved(); }
    catch (e) { toast.error('Enregistrement impossible'); }
    finally { setBusy(false); }
  };

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, boxSizing: 'border-box' };
  const L = ({ children }) => <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 4, fontWeight: 700 }}>{children}</label>;
  const Card = ({ title, children }) => (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: '#FF6900', marginBottom: 14 }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>{children}</div>
    </div>
  );

  const sc = cfg.score || {};
  return (
    <div>
      <Card title="⚙️ Périodes & métrique">
        <div><L>Mode par défaut</L>
          <select style={inp} value={cfg.mode || 'mensuel'} onChange={e => set('mode', e.target.value)}>
            <option value="mensuel">Mensuel (glissant)</option>
            <option value="hebdo">Hebdomadaire (glissant)</option>
          </select>
        </div>
        <div><L>Nombre de périodes glissantes</L><input type="number" style={inp} value={cfg.nb_periodes ?? 4} onChange={e => set('nb_periodes', parseInt(e.target.value) || 4)} /></div>
        <div><L>Métrique par défaut</L>
          <select style={inp} value={cfg.metrique || 'volume'} onChange={e => set('metrique', e.target.value)}>
            {METRIQUES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div><L>Top à afficher</L><input type="number" style={inp} value={cfg.nb_top ?? 50} onChange={e => set('nb_top', parseInt(e.target.value) || 50)} /></div>
      </Card>

      <Card title="🎚️ Paliers de priorité (score /100)">
        <div><L>P1 — URGENCE ≥</L><input type="number" style={inp} value={cfg.paliers?.p1 ?? 70} onChange={e => set('paliers.p1', parseInt(e.target.value) || 0)} /></div>
        <div><L>P2 — À RÉCUPÉRER ≥</L><input type="number" style={inp} value={cfg.paliers?.p2 ?? 50} onChange={e => set('paliers.p2', parseInt(e.target.value) || 0)} /></div>
        <div><L>P3 — À SURVEILLER ≥</L><input type="number" style={inp} value={cfg.paliers?.p3 ?? 30} onChange={e => set('paliers.p3', parseInt(e.target.value) || 0)} /></div>
      </Card>

      <Card title="🧮 Score — Intensité (seuils % / points)">
        <div><L>Seuils (% de perte, séparés par virgule)</L><input style={inp} defaultValue={arr(sc.intensite?.seuils)} onBlur={e => set('score.intensite.seuils', parseArr(e.target.value))} /></div>
        <div><L>Points (séparés par virgule)</L><input style={inp} defaultValue={arr(sc.intensite?.points)} onBlur={e => set('score.intensite.points', parseArr(e.target.value))} /></div>
      </Card>

      <Card title="🧮 Score — Persistance (nb de baisses → points)">
        <div><L>3 baisses</L><input type="number" style={inp} value={sc.persistance?.points?.['3'] ?? 25} onChange={e => set('score.persistance.points.3', parseInt(e.target.value) || 0)} /></div>
        <div><L>2 baisses</L><input type="number" style={inp} value={sc.persistance?.points?.['2'] ?? 15} onChange={e => set('score.persistance.points.2', parseInt(e.target.value) || 0)} /></div>
        <div><L>1 baisse</L><input type="number" style={inp} value={sc.persistance?.points?.['1'] ?? 5} onChange={e => set('score.persistance.points.1', parseInt(e.target.value) || 0)} /></div>
      </Card>

      <Card title="🧮 Score — Baisse récente (seuils % / points)">
        <div><L>Seuils (%)</L><input style={inp} defaultValue={arr(sc.recente?.seuils)} onBlur={e => set('score.recente.seuils', parseArr(e.target.value))} /></div>
        <div><L>Points</L><input style={inp} defaultValue={arr(sc.recente?.points)} onBlur={e => set('score.recente.points', parseArr(e.target.value))} /></div>
      </Card>

      <Card title="🧮 Score — Financier (montant perdu → points)">
        <div><L>Points</L><input style={inp} defaultValue={arr(sc.financier?.points)} onBlur={e => set('score.financier.points', parseArr(e.target.value))} /></div>
        <div><L>Seuils Volume (FCFA)</L><input style={inp} defaultValue={arr(sc.financier?.seuils_volume)} onBlur={e => set('score.financier.seuils_volume', parseArr(e.target.value))} /></div>
        <div><L>Seuils REAL (FCFA)</L><input style={inp} defaultValue={arr(sc.financier?.seuils_real)} onBlur={e => set('score.financier.seuils_real', parseArr(e.target.value))} /></div>
        <div><L>Seuils Rendement (ratio)</L><input style={inp} defaultValue={arr(sc.financier?.seuils_rendement)} onBlur={e => set('score.financier.seuils_rendement', parseArr(e.target.value))} /></div>
      </Card>

      <Card title="🚩 Seuils opérationnels">
        <div><L>Gisement — volume min (FCFA)</L><input type="number" style={inp} value={cfg.seuil_gisement_volume ?? 10000000} onChange={e => set('seuil_gisement_volume', parseFloat(e.target.value) || 0)} /></div>
        <div><L>Gisement — rendement max (%)</L><input type="number" step="0.01" style={inp} value={cfg.seuil_gisement_rendement ?? 0.20} onChange={e => set('seuil_gisement_rendement', parseFloat(e.target.value) || 0)} /></div>
        <div><L>Rupture — nb de périodes sans opération</L><input type="number" style={inp} value={cfg.seuil_rupture_periodes ?? 2} onChange={e => set('seuil_rupture_periodes', parseInt(e.target.value) || 2)} /></div>
        <div><L>Objectif — taux de croissance</L><input type="number" step="0.01" style={inp} value={cfg.objectif_taux_croissance ?? 0.05} onChange={e => set('objectif_taux_croissance', parseFloat(e.target.value) || 0)} /></div>
      </Card>

      <button onClick={save} disabled={busy}
        style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
        {busy ? '⏳ Enregistrement…' : '💾 Enregistrer les paramètres'}
      </button>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function AnalysePerformancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('recuperation');
  const [mode, setMode] = useState('mensuel');
  const [metrique, setMetrique] = useState('volume');
  const [search, setSearch] = useState('');
  const [prioFilter, setPrioFilter] = useState('');
  const [onlyTop, setOnlyTop] = useState(false);
  const [sortKey, setSortKey] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery(['analyse-perf', mode, metrique],
    () => api.get('/analyse-perf/recuperation', { params: { mode, metrique } }).then(r => r.data),
    { staleTime: 30000 }
  );
  const { data: config } = useQuery('analyse-perf-config',
    () => api.get('/analyse-perf/config').then(r => r.data), { staleTime: 60000 }
  );

  const periodes = data?.periodes || [];
  const kpis = data?.kpis || {};

  const lignes = useMemo(() => {
    let l = data?.pdvs || [];
    if (onlyTop) l = l.slice(0, config?.nb_top || 50);
    if (prioFilter) l = l.filter(r => r.priorite === prioFilter);
    if (search) {
      const s = search.toLowerCase();
      l = l.filter(r => [r.numero_pdv, r.nom, r.zone, r.quartier, r.superviseur]
        .some(x => (x || '').toLowerCase().includes(s)));
    }
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...l].sort((a, b) => {
      const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
      if (typeof va === 'string') return dir * String(va).localeCompare(String(vb));
      return dir * (va - vb);
    });
  }, [data, onlyTop, prioFilter, search, sortKey, sortDir, config]);

  const tri = (k) => {
    if (sortKey === k) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const exporter = async () => {
    setBusy(true);
    try {
      const res = await api.get('/analyse-perf/export', { params: { mode, metrique }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `pdv_a_recuperer_${mode}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Export téléchargé');
    } catch (e) { toast.error('Export impossible'); }
    finally { setBusy(false); }
  };

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13 };
  const th = { textAlign: 'left', padding: '9px 10px', color: '#8a8a9a', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 11 };
  const td = { padding: '9px 10px', fontSize: 12, whiteSpace: 'nowrap' };

  const KPI = ({ label, value, color, sub }) => (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#8a8a9a', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">📊 Analyse Performance</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            Détection & priorisation des PDV en baisse — score de risque sur plusieurs analyses
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[
          { id: 'recuperation', label: '🎯 PDV à récupérer' },
          { id: 'config', label: '⚙️ Configuration' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${tab === t.id ? '#FF6900' : 'rgba(255,255,255,0.08)'}`, background: tab === t.id ? 'rgba(255,105,0,0.12)' : 'rgba(255,255,255,0.03)', color: tab === t.id ? '#FF6900' : '#8a8a9a', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <TabConfig config={config} onSaved={() => { qc.invalidateQueries('analyse-perf-config'); qc.invalidateQueries('analyse-perf'); }} />
      )}

      {tab === 'recuperation' && (
        <div>
          {/* Barre d'outils */}
          <div className="card" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <select style={inp} value={mode} onChange={e => setMode(e.target.value)}>
              <option value="mensuel">Mensuel</option>
              <option value="hebdo">Hebdomadaire</option>
            </select>
            <select style={inp} value={metrique} onChange={e => setMetrique(e.target.value)}>
              {METRIQUES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <select style={inp} value={prioFilter} onChange={e => setPrioFilter(e.target.value)}>
              <option value="">Toutes priorités</option>
              <option value="P1">🔴 P1 URGENCE</option>
              <option value="P2">🟠 P2 À RÉCUPÉRER</option>
              <option value="P3">🟡 P3 À SURVEILLER</option>
              <option value="P4">🟢 P4 STABLE</option>
            </select>
            <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Rechercher PDV, nom, zone, quartier, superviseur…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8a8a9a' }}>
              <input type="checkbox" checked={onlyTop} onChange={e => setOnlyTop(e.target.checked)} />
              Top {config?.nb_top || 50}
            </label>
            <button onClick={() => qc.invalidateQueries('analyse-perf')} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={14} /> Actualiser
            </button>
            <button onClick={exporter} disabled={busy}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> {busy ? '…' : 'Exporter Excel'}
            </button>
          </div>

          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <KPI label="PDV analysés" value={kpis.nb_pdv_analyses ?? 0} color="#4a9eff" sub={`${periodes.length} périodes : ${periodes.join(' → ')}`} />
            <KPI label="🔴 P1 Urgence" value={kpis.nb_p1 ?? 0} color="#ff4757" sub="intervention immédiate" />
            <KPI label="🟠 P2 À récupérer" value={kpis.nb_p2 ?? 0} color="#ffa502" sub="plan de récupération" />
            <KPI label="🟡 P3 À surveiller" value={kpis.nb_p3 ?? 0} color="#ffc107" sub="surveillance" />
            <KPI label="🟢 P4 Stable" value={kpis.nb_p4 ?? 0} color="#22c55e" sub="faible priorité" />
            <KPI label="Perte totale" value={fmtF(kpis.perte_totale)} color="#ff4757" sub={`sur ${metrique === 'real' ? 'REAL' : metrique === 'rendement' ? 'rendement' : 'volume'}`} />
            <KPI label="Potentiel récupérable" value={fmtF(kpis.potentiel_total)} color="#00d68f" sub="meilleur − actuel" />
          </div>

          {/* Tableau */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#141422', zIndex: 2 }}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={th} onClick={() => tri('rang_risque')}>#</th>
                    <th style={th} onClick={() => tri('numero_pdv')}>PDV</th>
                    <th style={th} onClick={() => tri('zone')}>Zone</th>
                    <th style={th} onClick={() => tri('superviseur')}>Superviseur</th>
                    {periodes.map(p => <th key={p} style={{ ...th, textAlign: 'right' }}>{p}</th>)}
                    <th style={{ ...th, textAlign: 'right' }} onClick={() => tri('var_recente')}>Var réc.</th>
                    <th style={{ ...th, textAlign: 'right' }} onClick={() => tri('var_globale')}>Var glob.</th>
                    <th style={{ ...th, textAlign: 'right' }} onClick={() => tri('nb_baisses')}>Baisses</th>
                    <th style={{ ...th, textAlign: 'right' }} onClick={() => tri('perte_valeur')}>Perte</th>
                    <th style={{ ...th, textAlign: 'right' }} onClick={() => tri('pct_perte')}>% perte</th>
                    <th style={{ ...th, textAlign: 'center' }} onClick={() => tri('score')}>Score</th>
                    <th style={th}>Priorité</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={12 + periodes.length} style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Chargement…</td></tr>
                  ) : lignes.length === 0 ? (
                    <tr><td colSpan={12 + periodes.length} style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Aucun PDV trouvé</td></tr>
                  ) : lignes.map(r => (
                    <tr key={r.pdv_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ ...td, color: '#64748b', fontWeight: 700 }}>{r.rang_risque}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{r.numero_pdv}</div>
                        <div style={{ fontSize: 11, color: '#8a8a9a' }}>{r.nom}</div>
                      </td>
                      <td style={{ ...td, color: '#94a3b8' }}>{r.zone || '—'}</td>
                      <td style={{ ...td, color: '#94a3b8' }}>{r.superviseur || '—'}</td>
                      {(r.serie || []).map((v, i) => (
                        <td key={i} style={{ ...td, textAlign: 'right', color: '#cbd5e1' }}>
                          {metrique === 'rendement' ? `${fmtN(v * 100, 3)} %` : fmtN(v)}
                        </td>
                      ))}
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: varColor(r.var_recente) }}>{fmtPct(r.var_recente)}</td>
                      <td style={{ ...td, textAlign: 'right', color: varColor(r.var_globale) }}>{fmtPct(r.var_globale)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{r.nb_baisses}{r.baisse_consecutive > 1 ? ` (${r.baisse_consecutive}✓)` : ''}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#ff4757' }}>{metrique === 'rendement' ? fmtN(r.perte_valeur * 100, 3) + ' pt' : fmtN(r.perte_valeur)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#ffa502', fontWeight: 700 }}>{fmtN(r.pct_perte, 1)} %</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ fontWeight: 900, color: scoreColor(r.score) }}>{r.score}</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>/100</span>
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: PRIO[r.priorite]?.bg, color: PRIO[r.priorite]?.color }}>
                          {PRIO[r.priorite]?.label || r.priorite}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#8a8a9a' }}>
              {lignes.length} PDV affiché(s) · classement par score de risque (cliquez sur un en-tête pour trier)
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: '#64748b' }}>
            Score = intensité de la baisse + persistance + baisse récente + montant perdu. Métrique « real » = commission réelle agent.
          </div>
        </div>
      )}
    </div>
  );
}
