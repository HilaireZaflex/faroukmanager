import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
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
        <div><L>Source du REAL TTC</L>
          <select style={inp} value={cfg.source_real || 'agent'} onChange={e => set('source_real', e.target.value)}>
            <option value="agent">Commission réelle agent (part PDV 70%)</option>
            <option value="pdg">Commission PDG (part réseau 30%)</option>
            <option value="totale">Commission totale (PDG + agent)</option>
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

// ── Onglet Synthèse Direction Générale ────────────────────────────────────────
const Var = ({ v }) => {
  if (v === null || v === undefined) return <span style={{ color: '#475569' }}>—</span>;
  return <span style={{ color: v >= 0 ? '#22c55e' : '#ff4757', fontWeight: 700 }}>{v > 0 ? '+' : ''}{fmtN(v, 1)} %</span>;
};

const SynKPI = ({ label, value, sub, color, varPrev, var4 }) => (
  <div className="card" style={{ borderLeft: `4px solid ${color}`, padding: '14px 16px' }}>
    <div style={{ fontSize: 11, color: '#8a8a9a', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
    <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
      {varPrev !== undefined && <span>vs préc. <Var v={varPrev} /></span>}
      {var4 !== undefined && var4 !== null && <span>réf. <Var v={var4} /></span>}
    </div>
    {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{sub}</div>}
  </div>
);

function TabSynthese() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState('hebdo');
  const [niveau, setNiveau] = useState('zone');
  const [zone, setZone] = useState('');
  const [superviseur, setSuperviseur] = useState('');
  const [objInput, setObjInput] = useState('');

  const { data, isLoading } = useQuery(['analyse-perf-synthese', mode, niveau, zone, superviseur],
    () => api.get('/analyse-perf/synthese', { params: { mode, niveau, zone: zone || undefined, superviseur: superviseur || undefined } }).then(r => r.data),
    { staleTime: 30000 }
  );
  const k = data?.kpis || {};
  const lignes = data?.lignes || [];
  const scopeKey = zone ? `ZONE:${zone}` : superviseur ? `SUPERVISEUR:${superviseur}` : 'RESEAU';

  const enregistrerObjectif = async (valeur) => {
    try {
      await api.put('/analyse-perf/objectif', { scope: scopeKey, period_key: data.period_key_courante, valeur });
      qc.invalidateQueries('analyse-perf-synthese');
      toast.success(valeur === null ? 'Objectif remis en automatique' : 'Objectif enregistré');
      setObjInput('');
    } catch (e) { toast.error('Erreur'); }
  };

  const ouvrirLigne = (l) => {
    if (niveau === 'zone') { setZone(l.nom === '—' ? '' : l.nom); setNiveau('superviseur'); }
    else if (niveau === 'superviseur') { setSuperviseur(l.nom === '—' ? '' : l.nom); setNiveau('pdv'); }
    else if (l.pdv_id) { navigate(`/pdvs/${l.pdv_id}`); }
  };

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13 };
  const th = { textAlign: 'left', padding: '9px 10px', color: '#8a8a9a', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11 };
  const td = { padding: '9px 10px', fontSize: 12, whiteSpace: 'nowrap' };
  const realColor = k.taux_realisation >= 100 ? '#22c55e' : k.taux_realisation >= 90 ? '#ffa502' : '#ff4757';

  return (
    <div>
      {/* Barre scope + breadcrumb */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <select style={inp} value={mode} onChange={e => setMode(e.target.value)}>
            <option value="hebdo">Hebdomadaire</option>
            <option value="mensuel">Mensuel</option>
          </select>
          <button onClick={() => qc.invalidateQueries('analyse-perf-synthese')} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8a8a9a' }}>
            <span style={{ cursor: 'pointer', color: '#4a9eff' }} onClick={() => { setZone(''); setSuperviseur(''); setNiveau('zone'); }}>Réseau</span>
            {zone && <> › <span style={{ cursor: 'pointer', color: '#4a9eff' }} onClick={() => { setSuperviseur(''); setNiveau('superviseur'); }}>{zone}</span></>}
            {superviseur && <> › <span style={{ color: '#e2e8f0' }}>{superviseur}</span></>}
            <span style={{ marginLeft: 12, color: '#64748b' }}>Période : <strong style={{ color: '#FF6900' }}>{data?.periode_courante || '—'}</strong></span>
          </div>
        </div>
      </div>

      {isLoading ? <div className="card">Chargement…</div> : (
        <>
          {/* 8 KPI DG */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
            <SynKPI label="REAL TTC" value={fmtF(k.real)} color="#FF6900" varPrev={k.var_real} var4={k.var_real_4} sub={data?.source_real === 'pdg' ? 'Commission PDG (réseau)' : data?.source_real === 'totale' ? 'Commission totale (PDG + agent)' : 'Commission réelle agent'} />
            <SynKPI label="Rendement (REAL / million)" value={fmtN(k.real_par_million)} color="#00d68f" varPrev={k.var_rendement} sub={`${fmtN((k.rendement || 0) * 100, 3)} % du volume`} />
            <SynKPI label="Volume total" value={fmtF(k.volume)} color="#4a9eff" varPrev={k.var_volume} var4={k.var_volume_4} sub="CI + CO" />
            <SynKPI label="Activation" value={`${fmtN(k.activation, 1)} %`} color="#a29bfe" varPrev={k.var_activation} sub={`${fmtN(k.nb_actifs)} / ${fmtN(k.nb_pdv_total)} PDV actifs`} />
            <SynKPI label="Volume / actif" value={fmtF(k.volume_par_actif)} color="#0ea5e9" sub="Productivité par PDV actif" />
            <SynKPI label="VCPA (REAL / actif)" value={fmtF(k.real_par_actif)} color="#22c55e" sub="Valeur créée par PDV actif" />
            <SynKPI label="Gisements de profit" value={fmtN(k.nb_gisements)} color="#ffa502" sub={`${fmtN(k.pct_volume_gisements, 1)} % du volume réseau`} />
            <SynKPI label="Ruptures Top 100" value={fmtN(k.ruptures_top100)} color="#ff4757" sub={`${fmtN(k.nb_ruptures)} ruptures au total`} />
          </div>

          {/* Objectif + flux */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ borderLeft: '4px solid #FF6900' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6900' }}>
                  🎯 Objectif REAL TTC — {k.objectif_source === 'manuel' ? 'saisi' : 'auto (meilleure période + croissance)'}
                </div>
                <div style={{ fontSize: 12, color: '#8a8a9a' }}>Réalisation : <strong style={{ color: realColor, fontSize: 15 }}>{fmtN(k.taux_realisation, 1)} %</strong></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', margin: '8px 0 4px' }}>
                <span>Réalisé : <strong style={{ color: '#fff' }}>{fmtF(k.real)}</strong></span>
                <span>Objectif : <strong style={{ color: '#fff' }}>{fmtF(k.objectif)}</strong></span>
              </div>
              <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, k.taux_realisation || 0)}%`, background: realColor, borderRadius: 5 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="number" placeholder="Objectif manuel (FCFA)" value={objInput} onChange={e => setObjInput(e.target.value)} style={{ ...inp, width: 200 }} />
                <button onClick={() => objInput !== '' && enregistrerObjectif(parseFloat(objInput))}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#FF6900', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Définir</button>
                {k.objectif_source === 'manuel' && (
                  <button onClick={() => enregistrerObjectif(null)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#8a8a9a', fontSize: 12, cursor: 'pointer' }}>Revenir à l'auto</button>
                )}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid #0ea5e9' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0ea5e9', marginBottom: 10 }}>💧 Flux net CI − CO</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: '#8a8a9a' }}>Cash-in</span><strong>{fmtF(k.ci)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: '#8a8a9a' }}>Cash-out</span><strong>{fmtF(k.co)}</strong></div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: '#8a8a9a' }}>Net</span>
                <strong style={{ color: k.flux_net < 0 ? '#ffa502' : '#22c55e' }}>{fmtF(k.flux_net)}</strong>
              </div>
            </div>
          </div>

          {/* Tableau de drill-down */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>
              {niveau === 'zone' ? '🧭 Répartition par zone' : niveau === 'superviseur' ? `👤 Superviseurs — ${zone}` : `🏪 PDV — ${superviseur}`}
              {niveau !== 'pdv' && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}> · cliquez sur une ligne pour descendre</span>}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '55vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#141422' }}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={th}>{niveau === 'pdv' ? 'PDV' : 'Nom'}</th>
                    <th style={{ ...th, textAlign: 'right' }}>PDV</th>
                    <th style={{ ...th, textAlign: 'right' }}>REAL TTC</th>
                    <th style={{ ...th, textAlign: 'right' }}>Var</th>
                    <th style={{ ...th, textAlign: 'right' }}>Volume</th>
                    <th style={{ ...th, textAlign: 'right' }}>Rendement</th>
                    <th style={{ ...th, textAlign: 'right' }}>REAL/M</th>
                    <th style={{ ...th, textAlign: 'right' }}>Activation</th>
                    <th style={{ ...th, textAlign: 'right' }}>Vol/actif</th>
                    <th style={{ ...th, textAlign: 'right' }}>VCPA</th>
                    <th style={{ ...th, textAlign: 'right' }}>Gisements</th>
                    <th style={{ ...th, textAlign: 'right' }}>Ruptures</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.length === 0 ? (
                    <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30, color: '#8a8a9a' }}>Aucune donnée</td></tr>
                  ) : lignes.map((l, i) => (
                    <tr key={i} onClick={() => ouvrirLigne(l)} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ ...td, fontWeight: 700, color: '#e2e8f0' }}>{l.nom}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#8a8a9a' }}>{l.nb_pdv}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#FF6900', fontWeight: 700 }}>{fmtN(l.real)}</td>
                      <td style={{ ...td, textAlign: 'right' }}><Var v={l.var_real} /></td>
                      <td style={{ ...td, textAlign: 'right', color: '#cbd5e1' }}>{fmtN(l.volume)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmtN(l.rendement * 100, 3)} %</td>
                      <td style={{ ...td, textAlign: 'right', color: '#00d68f' }}>{fmtN(l.real_par_million)}</td>
                      <td style={{ ...td, textAlign: 'right', color: l.activation >= 90 ? '#22c55e' : '#ffa502' }}>{fmtN(l.activation, 1)} %</td>
                      <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmtN(l.volume_par_actif)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#22c55e' }}>{fmtN(l.real_par_actif)}</td>
                      <td style={{ ...td, textAlign: 'right', color: l.nb_gisements > 0 ? '#ffa502' : '#475569' }}>{l.nb_gisements}</td>
                      <td style={{ ...td, textAlign: 'right', color: l.nb_ruptures > 0 ? '#ff4757' : '#475569' }}>{l.nb_ruptures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: '#64748b' }}>
            REAL TTC = commission réelle agent · Rendement = REAL ÷ Volume · VCPA = REAL ÷ PDV actifs ·
            Gisement = volume ≥ seuil et rendement &lt; seuil · Rupture = aucune opération sur {k.nb_ruptures != null ? 'les dernières périodes' : ''}.
          </div>
        </>
      )}
    </div>
  );
}

// ── Onglet Analyses : Zones · Segments · Gisements ────────────────────────────
function TabAnalyses() {
  const qc = useQueryClient();
  const [sous, setSous] = useState('zones');
  const [mode, setMode] = useState('hebdo');
  const [critere, setCritere] = useState('rendement');

  const { data: zonesData } = useQuery(['analyse-perf-zones', mode],
    () => api.get('/analyse-perf/zones', { params: { mode } }).then(r => r.data), { staleTime: 30000, enabled: sous === 'zones' });
  const { data: segData } = useQuery(['analyse-perf-segments', mode, critere],
    () => api.get('/analyse-perf/segments', { params: { mode, critere } }).then(r => r.data), { staleTime: 30000, enabled: sous === 'segments' });
  const { data: gisData } = useQuery(['analyse-perf-gisements', mode],
    () => api.get('/analyse-perf/gisements', { params: { mode } }).then(r => r.data), { staleTime: 30000, enabled: sous === 'gisements' });
  const { data: ruptData } = useQuery(['analyse-perf-ruptures', mode],
    () => api.get('/analyse-perf/ruptures', { params: { mode } }).then(r => r.data), { staleTime: 30000, enabled: sous === 'ruptures' });

  const modifierObjectifZone = async (zone, valeur) => {
    try {
      const cfg = (await api.get('/analyse-perf/config')).data;
      const obj = { ...(cfg.objectifs_activation || {}), [zone]: valeur };
      await api.put('/analyse-perf/config', { ...cfg, objectifs_activation: obj });
      qc.invalidateQueries('analyse-perf-zones');
      toast.success(`Objectif ${zone} : ${valeur} %`);
    } catch (e) { toast.error('Erreur'); }
  };

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13 };
  const th = { textAlign: 'left', padding: '9px 10px', color: '#8a8a9a', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11 };
  const td = { padding: '9px 10px', fontSize: 12, whiteSpace: 'nowrap' };
  const Card = ({ label, value, color, sub }) => (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#8a8a9a', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {[{ id: 'zones', label: '🧭 Zones' }, { id: 'segments', label: '🎖️ Segments' }, { id: 'gisements', label: '💎 Gisements' }, { id: 'ruptures', label: '🚱 Ruptures' }].map(s => (
          <button key={s.id} onClick={() => setSous(s.id)}
            style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid ${sous === s.id ? '#FF6900' : 'rgba(255,255,255,0.08)'}`, background: sous === s.id ? 'rgba(255,105,0,0.12)' : 'rgba(255,255,255,0.03)', color: sous === s.id ? '#FF6900' : '#8a8a9a', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {s.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select style={inp} value={mode} onChange={e => setMode(e.target.value)}>
            <option value="hebdo">Hebdomadaire</option>
            <option value="mensuel">Mensuel</option>
          </select>
          {sous === 'segments' && (
            <select style={inp} value={critere} onChange={e => setCritere(e.target.value)}>
              <option value="rendement">Critère : Rendement</option>
              <option value="volume">Critère : Volume</option>
              <option value="real">Critère : REAL TTC</option>
            </select>
          )}
        </div>
      </div>

      {/* ── ZONES ── */}
      {sous === 'zones' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>
            🧭 Analyse par zone — {zonesData?.periode_courante || '…'}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={th}>Zone</th><th style={{ ...th, textAlign: 'right' }}>PDV</th><th style={{ ...th, textAlign: 'right' }}>Actifs</th>
                <th style={{ ...th, textAlign: 'right' }}>Activation</th><th style={{ ...th, textAlign: 'right' }}>Objectif</th><th style={{ ...th, textAlign: 'right' }}>Écart</th>
                <th style={{ ...th, textAlign: 'right' }}>Volume</th><th style={{ ...th, textAlign: 'right' }}>REAL TTC</th><th style={{ ...th, textAlign: 'right' }}>Rendement</th>
                <th style={{ ...th, textAlign: 'right' }}>REAL/M</th><th style={{ ...th, textAlign: 'right' }}>Vol/actif</th><th style={{ ...th, textAlign: 'right' }}>VCPA</th>
                <th style={{ ...th, textAlign: 'right' }}>Gisements</th>
              </tr></thead>
              <tbody>
                {(zonesData?.lignes || []).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#e2e8f0' }}>{l.nom}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#8a8a9a' }}>{l.nb_pdv}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{l.nb_actifs}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: l.activation >= l.objectif_activation ? '#22c55e' : '#ffa502' }}>{fmtN(l.activation, 1)} %</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input type="number" defaultValue={l.objectif_activation} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== l.objectif_activation) modifierObjectifZone(l.nom, v); }}
                        style={{ width: 58, padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#a29bfe', fontSize: 12, textAlign: 'right' }} />
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: l.ecart_activation >= 0 ? '#22c55e' : '#ff4757' }}>{l.ecart_activation > 0 ? '+' : ''}{fmtN(l.ecart_activation, 1)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#cbd5e1' }}>{fmtN(l.volume)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#FF6900', fontWeight: 700 }}>{fmtN(l.real)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmtN(l.rendement * 100, 3)} %</td>
                    <td style={{ ...td, textAlign: 'right', color: '#00d68f' }}>{fmtN(l.real_par_million)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmtN(l.volume_par_actif)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#22c55e' }}>{fmtN(l.real_par_actif)}</td>
                    <td style={{ ...td, textAlign: 'right', color: l.nb_gisements > 0 ? '#ffa502' : '#475569' }}>{l.nb_gisements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '9px 16px', fontSize: 11, color: '#64748b', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            L'objectif d'activation est modifiable directement dans le tableau (il se sauvegarde automatiquement).
          </div>
        </div>
      )}

      {/* ── SEGMENTS ── */}
      {sous === 'segments' && (
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>
              🎖️ Segmentation dynamique par <strong style={{ color: '#FF6900' }}>{segData?.critere}</strong> — {segData?.periode_courante || '…'}
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}> · percentiles { (segData?.paliers || []).join(' / ') }</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={th}>Segment</th><th style={{ ...th, textAlign: 'right' }}>Nb PDV</th><th style={{ ...th, textAlign: 'right' }}>Activation</th>
                  <th style={{ ...th, textAlign: 'right' }}>Volume</th><th style={{ ...th, textAlign: 'right' }}>% volume</th>
                  <th style={{ ...th, textAlign: 'right' }}>REAL TTC</th><th style={{ ...th, textAlign: 'right' }}>% REAL</th>
                  <th style={{ ...th, textAlign: 'right' }}>Rendement</th><th style={{ ...th, textAlign: 'right' }}>REAL/M</th>
                </tr></thead>
                <tbody>
                  {(segData?.lignes || []).map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ ...td, fontWeight: 800, color: '#e2e8f0' }}>{l.segment}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#8a8a9a' }}>{l.nb_pdv}</td>
                      <td style={{ ...td, textAlign: 'right', color: l.activation >= 90 ? '#22c55e' : '#ffa502' }}>{fmtN(l.activation, 1)} %</td>
                      <td style={{ ...td, textAlign: 'right', color: '#cbd5e1' }}>{fmtN(l.volume)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#4a9eff' }}>{fmtN(l.pct_volume, 1)} %</td>
                      <td style={{ ...td, textAlign: 'right', color: '#FF6900', fontWeight: 700 }}>{fmtN(l.real)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#4a9eff' }}>{fmtN(l.pct_real, 1)} %</td>
                      <td style={{ ...td, textAlign: 'right', color: '#00d68f' }}>{fmtN(l.rendement * 100, 3)} %</td>
                      <td style={{ ...td, textAlign: 'right', color: '#00d68f' }}>{fmtN(l.real_par_million)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <Card label={`${segData?.sous_segment?.nom || 'Fer'} — dormant`} value={segData?.sous_segment?.dormant ?? 0} color="#64748b" sub="0 opération" />
            <Card label={`${segData?.sous_segment?.nom || 'Fer'} — rentable`} value={segData?.sous_segment?.rentable ?? 0} color="#22c55e" sub="bon rendement" />
            <Card label={`${segData?.sous_segment?.nom || 'Fer'} — à potentiel`} value={segData?.sous_segment?.a_potentiel ?? 0} color="#ffa502" sub="gros volume" />
            <Card label={`${segData?.sous_segment?.nom || 'Fer'} — structurellement faible`} value={segData?.sous_segment?.faible ?? 0} color="#ff4757" sub="à corriger" />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
            Segmentation calculée par percentiles sur les PDV (paramétrable dans Configuration). L'objectif Orange peut différer : fournir la règle exacte pour la reproduire à l'identique.
          </div>
        </div>
      )}

      {/* ── GISEMENTS ── */}
      {sous === 'gisements' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Card label="Gisements" value={gisData?.kpis?.nb_gisements ?? 0} color="#ffa502" sub={`Volume ≥ ${fmtN(gisData?.seuil_volume)} & rendement < ${gisData?.seuil_rendement}%`} />
            <Card label="Volume des gisements" value={fmtF(gisData?.kpis?.volume_gisements)} color="#4a9eff" sub="fort volume, faible rendement" />
            <Card label="% du volume réseau" value={`${fmtN(gisData?.kpis?.pct_volume_reseau, 1)} %`} color="#ff4757" sub="poids dans le réseau" />
            <Card label="REAL des gisements" value={fmtF(gisData?.kpis?.real_gisements)} color="#FF6900" sub={`rendement moyen ${fmtN((gisData?.kpis?.rendement_moyen || 0), 3)} %`} />
          </div>

          {/* Évolution */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 12 }}>📈 Évolution du nombre de gisements</div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 120 }}>
              {(gisData?.evolution || []).map((e, i) => {
                const max = Math.max(...(gisData?.evolution || []).map(x => x.nb), 1);
                return (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#ffa502', marginBottom: 4 }}>{e.nb}</div>
                    <div style={{ height: `${(e.nb / max) * 80}px`, background: 'linear-gradient(180deg,#FF6900,#ffa502)', borderRadius: 6, minHeight: 4 }} />
                    <div style={{ fontSize: 11, color: '#8a8a9a', marginTop: 6 }}>{e.periode}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>
              💎 PDV gisements de profit — {gisData?.periode_courante || '…'}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '55vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#141422' }}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={th}>PDV</th><th style={th}>Zone</th><th style={th}>Superviseur</th>
                    <th style={{ ...th, textAlign: 'right' }}>Volume</th><th style={{ ...th, textAlign: 'right' }}>REAL TTC</th>
                    <th style={{ ...th, textAlign: 'right' }}>Rendement</th><th style={{ ...th, textAlign: 'right' }}>Opérations</th>
                  </tr>
                </thead>
                <tbody>
                  {(gisData?.pdvs || []).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={td}><div style={{ fontWeight: 700, color: '#e2e8f0' }}>{p.numero_pdv}</div><div style={{ fontSize: 11, color: '#8a8a9a' }}>{p.nom}</div></td>
                      <td style={{ ...td, color: '#94a3b8' }}>{p.zone || '—'}</td>
                      <td style={{ ...td, color: '#94a3b8' }}>{p.superviseur || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#4a9eff', fontWeight: 700 }}>{fmtN(p.volume)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#FF6900' }}>{fmtN(p.real)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#ffa502' }}>{fmtN(p.rendement, 3)} %</td>
                      <td style={{ ...td, textAlign: 'right', color: '#8a8a9a' }}>{fmtN(p.operations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── RUPTURES ── */}
      {sous === 'ruptures' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Card label="PDV en rupture" value={ruptData?.nb_ruptures ?? 0} color="#ff4757" sub={`> ${ruptData?.seuil_periodes || 2} périodes sans opération`} />
            <Card label="Taux de rupture" value={`${fmtN(ruptData?.taux_rupture, 2)} %`} color="#ffa502" sub={`sur ${fmtN(ruptData?.nb_pdv_total)} PDV`} />
            <Card label="Ruptures Top 100" value={ruptData?.ruptures_top100 ?? 0} color="#FF6900" sub="cible : 0" />
            <Card label="PDV actifs" value={fmtN(ruptData?.nb_actifs)} color="#22c55e" sub={ruptData?.periode_courante} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>Par zone</div>
              {(ruptData?.par_zone || []).length === 0 ? <div style={{ color: '#64748b', fontSize: 12 }}>Aucune rupture 🎉</div> :
                (ruptData.par_zone).map((z, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#cbd5e1' }}>{z.nom}</span><strong style={{ color: '#ff4757' }}>{z.nb_ruptures}</strong>
                  </div>
                ))}
            </div>
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>Par superviseur</div>
              {(ruptData?.par_superviseur || []).length === 0 ? <div style={{ color: '#64748b', fontSize: 12 }}>Aucune rupture 🎉</div> :
                (ruptData.par_superviseur).slice(0, 10).map((z, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#cbd5e1' }}>{z.nom}</span><strong style={{ color: '#ffa502' }}>{z.nb_ruptures}</strong>
                  </div>
                ))}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>
              🚱 PDV en rupture — {ruptData?.periode_courante || '…'}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '50vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#141422' }}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={th}>PDV</th><th style={th}>Zone</th><th style={th}>Superviseur</th>
                    <th style={th}>Quartier</th><th style={{ ...th, textAlign: 'right' }}>Dernière activité</th>
                    <th style={{ ...th, textAlign: 'right' }}>REAL de référence</th>
                  </tr>
                </thead>
                <tbody>
                  {(ruptData?.pdvs || []).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={td}><div style={{ fontWeight: 700, color: '#e2e8f0' }}>{p.numero_pdv}</div><div style={{ fontSize: 11, color: '#8a8a9a' }}>{p.nom}</div></td>
                      <td style={{ ...td, color: '#94a3b8' }}>{p.zone || '—'}</td>
                      <td style={{ ...td, color: '#94a3b8' }}>{p.superviseur || '—'}</td>
                      <td style={{ ...td, color: '#94a3b8' }}>{p.quartier || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#ffa502' }}>{p.derniere_activite || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#FF6900' }}>{fmtN(p.real_reference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Superviseurs & Rétention ───────────────────────────────────────────
function TabSuperviseurs() {
  const [mode, setMode] = useState('hebdo');
  const { data } = useQuery(['analyse-perf-superviseurs', mode],
    () => api.get('/analyse-perf/superviseurs', { params: { mode } }).then(r => r.data), { staleTime: 30000 });
  const lignes = data?.lignes || [];
  const th = { textAlign: 'left', padding: '9px 8px', color: '#8a8a9a', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11 };
  const td = { padding: '9px 8px', fontSize: 12, whiteSpace: 'nowrap' };
  const cScore = (s) => (s >= 70 ? '#22c55e' : s >= 50 ? '#ffa502' : '#ff4757');
  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13 };

  return (
    <div>
      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={inp} value={mode} onChange={e => setMode(e.target.value)}>
          <option value="hebdo">Hebdomadaire</option>
          <option value="mensuel">Mensuel</option>
        </select>
        <div style={{ fontSize: 12, color: '#8a8a9a' }}>
          Score /100 — poids : <strong style={{ color: '#e2e8f0' }}>{Object.entries(data?.poids || {}).map(([k, v]) => `${k} ${v}%`).join(' · ')}</strong>
        </div>
        <div style={{ fontSize: 12, color: '#8a8a9a' }}>
          Cibles : rendement <strong style={{ color: '#00d68f' }}>{data?.cible_rendement}%</strong> · activation <strong style={{ color: '#a29bfe' }}>{data?.cible_activation}%</strong> · rupture max <strong style={{ color: '#ff4757' }}>{data?.cible_rupture}%</strong>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#141422' }}>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={th}>#</th><th style={th}>Superviseur</th><th style={{ ...th, textAlign: 'center' }}>Score</th>
                <th style={{ ...th, textAlign: 'right' }}>Obj. %</th><th style={{ ...th, textAlign: 'right' }}>Rendement</th>
                <th style={{ ...th, textAlign: 'right' }}>Vol/actif</th><th style={{ ...th, textAlign: 'right' }}>Activation</th>
                <th style={{ ...th, textAlign: 'right' }}>Rétention</th><th style={{ ...th, textAlign: 'right' }}>Solde</th>
                <th style={{ ...th, textAlign: 'right' }}>Ruptures</th><th style={{ ...th, textAlign: 'right' }}>Qualité</th>
                <th style={{ ...th, textAlign: 'right' }}>REAL TTC</th><th style={{ ...th, textAlign: 'right' }}>PDV</th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 30, color: '#8a8a9a' }}>Chargement…</td></tr>
              ) : lignes.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...td, color: '#64748b' }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#e2e8f0' }}>{l.nom}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ fontWeight: 900, color: cScore(l.score) }}>{l.score}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: l.taux_realisation >= 100 ? '#22c55e' : '#ffa502' }}>{fmtN(l.taux_realisation, 1)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#00d68f' }}>{fmtN(l.rendement * 100, 3)} %</td>
                  <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmtN(l.volume_par_actif)}</td>
                  <td style={{ ...td, textAlign: 'right', color: l.activation >= 90 ? '#22c55e' : '#ffa502' }}>{fmtN(l.activation, 1)} %</td>
                  <td style={{ ...td, textAlign: 'right', color: '#a29bfe' }}>{l.retention != null ? `${fmtN(l.retention, 1)} %` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: l.solde >= 0 ? '#22c55e' : '#ff4757' }}>{l.solde > 0 ? '+' : ''}{l.solde}</td>
                  <td style={{ ...td, textAlign: 'right', color: l.nb_ruptures > 0 ? '#ff4757' : '#475569' }}>{l.nb_ruptures}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmtN(l.qualite, 0)} %</td>
                  <td style={{ ...td, textAlign: 'right', color: '#FF6900' }}>{fmtN(l.real)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#8a8a9a' }}>{l.nb_pdv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Onglet Moteurs (décomposition) ────────────────────────────────────────────
function TabMoteurs() {
  const [mode, setMode] = useState('hebdo');
  const { data } = useQuery(['analyse-perf-moteurs', mode],
    () => api.get('/analyse-perf/moteurs', { params: { mode } }).then(r => r.data), { staleTime: 30000 });
  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13 };
  const v = data?.volume || {};
  const rl = data?.real || {};

  const EffetBar = ({ label, valeur, max }) => {
    const pct = max ? Math.min(100, Math.abs(valeur) / max * 100) : 0;
    const positif = valeur >= 0;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: '#cbd5e1' }}>{label}</span>
          <strong style={{ color: positif ? '#22c55e' : '#ff4757' }}>{positif ? '+' : ''}{fmtN(valeur)}</strong>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: positif ? '#22c55e' : '#ff4757', borderRadius: 4 }} />
        </div>
      </div>
    );
  };

  const maxV = Math.max(Math.abs(v.effet_actifs || 0), Math.abs(v.effet_transactions || 0), Math.abs(v.effet_ticket || 0), 1);
  const maxR = Math.max(Math.abs(rl.effet_volume || 0), Math.abs(rl.effet_rendement || 0), 1);

  return (
    <div>
      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <select style={inp} value={mode} onChange={e => setMode(e.target.value)}>
          <option value="hebdo">Hebdomadaire</option>
          <option value="mensuel">Mensuel</option>
        </select>
        <span style={{ fontSize: 12, color: '#8a8a9a' }}>{data?.periode_precedente} → <strong style={{ color: '#FF6900' }}>{data?.periode_courante}</strong></span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#4a9eff', marginBottom: 12 }}>📦 Décomposition du VOLUME</div>
        <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 12 }}>Volume = PDV actifs × Transactions/PDV × Ticket moyen</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[['Actifs', v.actifs?.prec, v.actifs?.cur], ['Tx / actif', v.transactions_par_actif?.prec, v.transactions_par_actif?.cur], ['Ticket moyen', v.ticket_moyen?.prec, v.ticket_moyen?.cur], ['Volume', v.prec, v.cur]].map(([lab, a, b], i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#8a8a9a' }}>{lab}</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>{fmtN(a)}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>→ {fmtN(b)}</div>
            </div>
          ))}
        </div>
        <EffetBar label="Effet nombre de PDV actifs" valeur={v.effet_actifs || 0} max={maxV} />
        <EffetBar label="Effet transactions / PDV" valeur={v.effet_transactions || 0} max={maxV} />
        <EffetBar label="Effet ticket moyen" valeur={v.effet_ticket || 0} max={maxV} />
        <div style={{ textAlign: 'right', fontSize: 13, marginTop: 6, color: '#8a8a9a' }}>Variation totale du volume : <strong style={{ color: (v.delta || 0) >= 0 ? '#22c55e' : '#ff4757' }}>{(v.delta || 0) > 0 ? '+' : ''}{fmtN(v.delta)}</strong></div>
      </div>

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FF6900', marginBottom: 12 }}>💰 Décomposition du REAL TTC</div>
        <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 12 }}>REAL TTC = Volume × Rendement</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a' }}>Rendement</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtN((rl.rendement_prec || 0) * 100, 3)} %</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>→ {fmtN((rl.rendement_cur || 0) * 100, 3)} %</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a' }}>REAL TTC</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtN(rl.prec)}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>→ {fmtN(rl.cur)}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a' }}>Variation</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: (rl.delta || 0) >= 0 ? '#22c55e' : '#ff4757' }}>{(rl.delta || 0) > 0 ? '+' : ''}{fmtN(rl.delta)}</div>
          </div>
        </div>
        <EffetBar label="Effet volume" valeur={rl.effet_volume || 0} max={maxR} />
        <EffetBar label="Effet rendement" valeur={rl.effet_rendement || 0} max={maxR} />
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function AnalysePerformancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('synthese');
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
          { id: 'synthese', label: '📊 Synthèse DG' },
          { id: 'recuperation', label: '🎯 PDV à récupérer' },
          { id: 'analyses', label: '🧭 Analyses' },
          { id: 'superviseurs', label: '🏆 Superviseurs' },
          { id: 'moteurs', label: '🧩 Moteurs' },
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

      {tab === 'synthese' && <TabSynthese />}
      {tab === 'analyses' && <TabAnalyses />}
      {tab === 'superviseurs' && <TabSuperviseurs />}
      {tab === 'moteurs' && <TabMoteurs />}

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
