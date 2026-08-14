import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { RefreshCw, Trophy, Target, TrendingUp, AlertTriangle, Plus, Download, Users, Package, MapPin, Star, Clock } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import './ChallengePage.css';

// ── Constantes ──────────────────────────────────────────────────────────────
const MOIS_CHALLENGE = ["2026-07", "2026-08", "2026-09", "2026-10"];
const MOIS_LABELS = { "2026-07": "Juillet", "2026-08": "Août", "2026-09": "Septembre", "2026-10": "Octobre" };
const CHALLENGE_END = new Date("2026-10-31");

// ── Utilitaires ──────────────────────────────────────────────────────────────
const fmtNum = (n) => Number(n || 0).toLocaleString('fr-FR');
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`;

function getColor(taux) {
  if (taux >= 95) return '#10b981';
  if (taux >= 70) return '#f59e0b';
  return '#ef4444';
}

function getEmoji(taux) {
  if (taux >= 95) return '✅';
  if (taux >= 70) return '⚠️';
  return '🔴';
}

// ── Composants UI ─────────────────────────────────────────────────────────────
function ScoreJauge({ label, score, max = 100, color }) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 12px' }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${pct * 3.14} 314`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color }}>{score.toFixed(1)}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>/ {max}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{label}</div>
    </div>
  );
}

function KPIBar({ label, realise, objectif, taux, unite, poids }) {
  const color = getColor(taux);
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '14px 16px', border: `1px solid ${color}22` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{label}</div>
          {poids && <div style={{ fontSize: 10, color: '#64748b' }}>Poids : {poids}%</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color }}>{fmtPct(taux)}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>{fmtNum(realise)} / {fmtNum(objectif)} {unite}</div>
        </div>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(taux, 100)}%`, background: color, borderRadius: 4, transition: 'width 0.8s ease' }}/>
      </div>
      {taux < 95 && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 6 }}>
          ⚡ Il manque {fmtNum(Math.max(0, objectif - realise))} {unite} pour atteindre l'objectif
        </div>
      )}
    </div>
  );
}

function CountdownTimer({ joursRestants }) {
  const [heures, setHeures] = useState(0);
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      // Fin du jour courant = minuit ce soir
      const finJour = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      const diff = finJour - now;
      setHeures(Math.floor(diff / 3600000));
      setMinutes(Math.floor((diff % 3600000) / 60000));
    };
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, []);

  // Utiliser les jours du backend (source de vérité unique)
  const jours = joursRestants ?? '—';

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
      {[{ val: jours, label: 'Jours' }, { val: String(heures).padStart(2,'0'), label: 'Heures' }, { val: String(minutes).padStart(2,'0'), label: 'Minutes' }].map(({ val, label }) => (
        <div key={label} style={{ textAlign: 'center', background: 'rgba(255,105,0,0.1)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 10, padding: '10px 16px' }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#FF6900' }}>{val}</div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
const INDICATEURS_LIST = ["OMY", "KAABU MOBILE", "NAFAMA", "TERMINAUX", "ORANGE ENERGIE"];
const MOIS_CHALLENGE_LIST = ["JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE"];

const INDICATEUR_CONFIG = {
  "OMY":            { icon: "📱", color: "#FF6900", unite: "FCFA", hasFarouk: true },
  "KAABU MOBILE":  { icon: "💳", color: "#0ea5e9", unite: "PDVs actifs", hasFarouk: false },
  "NAFAMA":         { icon: "🟢", color: "#00d68f", unite: "FCFA", hasFarouk: true },
  "TERMINAUX":      { icon: "🖥️", color: "#a29bfe", unite: "terminaux", hasFarouk: true },
  "ORANGE ENERGIE": { icon: "☀️", color: "#22c55e", unite: "kits", hasFarouk: true },
};

function fmtV(v, unite) {
  if (v === null || v === undefined) return '—';
  if (unite === 'FCFA') return new Intl.NumberFormat('fr-FR').format(Math.round(v)) + ' F';
  return Math.round(v).toLocaleString('fr-FR') + (unite ? ' ' + unite : '');
}

function TauxBadge({ taux }) {
  if (taux === null || taux === undefined) return <span style={{ color: '#64748b' }}>—</span>;
  const pct = Math.round(taux * 100);
  const color = pct >= 95 ? '#22c55e' : pct >= 80 ? '#ffa502' : '#ff4757';
  return (
    <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
      background: `rgba(${pct>=95?'34,197,94':pct>=80?'255,165,2':'255,71,87'},0.12)`, color }}>
      {pct >= 95 ? '✅' : pct >= 80 ? '⚠️' : '🔴'} {pct}%
    </span>
  );
}

function BarreProg({ taux, color }) {
  const pct = Math.min(100, Math.round((taux || 0) * 100));
  const c = pct >= 95 ? '#22c55e' : pct >= 80 ? '#ffa502' : '#ff4757';
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

// ── Tab Indicateurs ───────────────────────────────────────────────────────────
function TabIndicateurs({ filter }) {
  // filter = 'TELCO' → NAFAMA, TERMINAUX, ORANGE ENERGIE
  // filter = 'OM' → OMY, KAABU MOBILE
  const FILTER_MAP = {
    TELCO: ['NAFAMA', 'TERMINAUX', 'ORANGE ENERGIE'],
    OM: ['OMY', 'KAABU MOBILE'],
  };
  const filteredList = filter ? FILTER_MAP[filter] || INDICATEURS_LIST : INDICATEURS_LIST;
  const [activeInd, setActiveInd] = useState(null); // null = vue globale
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading } = useQuery('award-dashboard',
    () => api.get('/award/dashboard').then(r => r.data), { staleTime: 60000 }
  );

  if (isLoading) return <div className="ch-loading">⏳ Chargement des indicateurs…</div>;

  // ── Vue globale ──────────────────────────────────────────────────────────
  if (!activeInd) {
    return (
      <div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => setShowImport(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,105,0,0.4)', background: 'rgba(255,105,0,0.1)', color: '#FF6900', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            📂 Importer Excel
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            ✏️ Saisie Manuelle
          </button>
        </div>

        {/* Cartes par indicateur */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredList.map(ind => {
            const cfg = INDICATEUR_CONFIG[ind];
            const data = dashboard?.[ind] || {};
            const totaux = data.totaux || [];
            const semaines = data.semaines || [];
            // Dernier total disponible (données réelles)
            const lastTotal = totaux.filter(t => t.realisation !== null).slice(-1)[0];
            // Toutes semaines avec données
            const semAvecData = semaines.filter(s => s.realisation !== null);
            const derniereSem = semAvecData.slice(-1)[0];
            return (
              <div key={ind} onClick={() => setActiveInd(ind)}
                style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.08)`, borderTop: `3px solid ${cfg.color}`, borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseOver={e => e.currentTarget.style.background = `rgba(${cfg.color.replace('#','').match(/.{2}/g).map(h=>parseInt(h,16)).join(',')},0.06)`}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 24 }}>{cfg.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{ind}</div>
                    <div style={{ fontSize: 11, color: cfg.color }}>{cfg.unite}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>Voir détail →</span>
                </div>

                {lastTotal ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, textTransform: 'uppercase' }}>Objectif {lastTotal.mois}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtV(lastTotal.objectif_orange, cfg.unite)}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, textTransform: 'uppercase' }}>Réalisation</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{fmtV(lastTotal.realisation, cfg.unite)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Taux Orange</span>
                      <TauxBadge taux={lastTotal.taux_orange} />
                    </div>
                    <BarreProg taux={lastTotal.taux_orange} color={cfg.color} />
                    {cfg.hasFarouk && lastTotal.taux_farouk !== null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Taux Farouk</span>
                        <TauxBadge taux={lastTotal.taux_farouk} />
                      </div>
                    )}
                    {derniereSem && (
                      <div style={{ marginTop: 10, fontSize: 11, color: '#64748b', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                        Dernière sem. renseignée : <strong style={{ color: '#aaa' }}>{derniereSem.semaine}</strong>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748b', fontSize: 13 }}>
                    Aucune réalisation saisie
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showForm && <FormulaireManuel onClose={() => setShowForm(false)} onSaved={() => { queryClient.invalidateQueries('award-dashboard'); setShowForm(false); }} />}
        {showImport && <ImportExcelModal onClose={() => setShowImport(false)} onSaved={() => { queryClient.invalidateQueries('award-dashboard'); setShowImport(false); }} />}
      </div>
    );
  }

  // ── Détail d'un indicateur ──────────────────────────────────────────────
  return <DetailIndicateur nom={activeInd} onBack={() => setActiveInd(null)} queryClient={queryClient} />;
}

function DetailIndicateur({ nom, onBack, queryClient }) {
  const cfg = INDICATEUR_CONFIG[nom];
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery(['award-detail', nom],
    () => api.get(`/award/indicateur/${encodeURIComponent(nom)}`).then(r => r.data),
    { staleTime: 30000 }
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button onClick={onBack} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>← Retour</button>
        <span style={{ fontSize: 28 }}>{cfg.icon}</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{nom}</div>
          <div style={{ fontSize: 12, color: cfg.color }}>Suivi hebdomadaire · Orange Awards 2026</div>
        </div>
        <button onClick={() => setShowForm(true)} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          ✏️ Saisir données
        </button>
      </div>

      {isLoading ? <div className="ch-loading">Chargement…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(data?.mois || []).map(moisData => (
            <div key={moisData.mois} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Header mois */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: cfg.color }}>📅 {moisData.mois}</span>
                {moisData.total && (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Total : {fmtV(moisData.total.realisation, cfg.unite)} / {fmtV(moisData.total.objectif_orange, cfg.unite)}</span>
                    <TauxBadge taux={moisData.total.taux_orange} />
                    {cfg.hasFarouk && moisData.total.taux_farouk !== null && <TauxBadge taux={moisData.total.taux_farouk} />}
                  </div>
                )}
              </div>
              {/* Tableau semaines */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b' }}>Semaine</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>Objectif Orange</th>
                      {nom === 'KAABU MOBILE' && <th style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>Nb PDV</th>}
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: cfg.color }}>Réalisation</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>Taux Orange</th>
                      {cfg.hasFarouk && <th style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>Obj. Farouk</th>}
                      {cfg.hasFarouk && <th style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>Taux Farouk</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(moisData.semaines || []).map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#fff' }}>{s.semaine}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8' }}>{fmtV(s.objectif_orange, cfg.unite)}</td>
                        {nom === 'KAABU MOBILE' && <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0ea5e9' }}>{s.nombre_pdv || '—'}</td>}
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: s.realisation !== null ? cfg.color : '#64748b' }}>
                          {fmtV(s.realisation, cfg.unite)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}><TauxBadge taux={s.taux_orange} /></td>
                        {cfg.hasFarouk && <td style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8' }}>{fmtV(s.objectif_farouk, cfg.unite)}</td>}
                        {cfg.hasFarouk && <td style={{ padding: '10px 14px', textAlign: 'center' }}><TauxBadge taux={s.taux_farouk} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && <FormulaireManuel indicateurDefaut={nom} onClose={() => setShowForm(false)} onSaved={() => { queryClient.invalidateQueries(['award-detail', nom]); setShowForm(false); }} />}
    </div>
  );
}

function FormulaireManuel({ indicateurDefaut, onClose, onSaved }) {
  const [form, setForm] = useState({
    indicateur: indicateurDefaut || 'OMY',
    mois: 'JUILLET', semaine: 'S27',
    objectif_orange: '', realisation: '', taux_orange: '',
    objectif_farouk: '', taux_farouk: '', nombre_pdv: '',
  });
  const [busy, setBusy] = useState(false);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const cfg = INDICATEUR_CONFIG[form.indicateur] || {};

  const semaines = ['S27','S28','S29','S30','S31','S32','S33','S34','S35','S36','S37','S38','S39','S40','S41','S42','TOTAL'];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        indicateur: form.indicateur, mois: form.mois, semaine: form.semaine,
        est_total: form.semaine === 'TOTAL',
        objectif_orange: form.objectif_orange ? parseFloat(form.objectif_orange) : null,
        realisation: form.realisation ? parseFloat(form.realisation) : null,
        taux_orange: form.taux_orange ? parseFloat(form.taux_orange) / 100 : null,
        objectif_farouk: form.objectif_farouk ? parseFloat(form.objectif_farouk) : null,
        taux_farouk: form.taux_farouk ? parseFloat(form.taux_farouk) / 100 : null,
        nombre_pdv: form.nombre_pdv ? parseInt(form.nombre_pdv) : null,
      };
      await api.post('/award/upsert', payload);
      onSaved();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setBusy(false); }
  };

  const IS = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg,#0f0f1e,#1a1a2e)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 16, padding: '24px 28px', width: '90%', maxWidth: 560, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>✏️ Saisie Manuelle Indicateur</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Indicateur</label>
              <select value={form.indicateur} onChange={e => sf('indicateur', e.target.value)} style={{ ...IS }}>
                {INDICATEURS_LIST.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Mois</label>
              <select value={form.mois} onChange={e => sf('mois', e.target.value)} style={{ ...IS }}>
                {MOIS_CHALLENGE_LIST.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Semaine</label>
              <select value={form.semaine} onChange={e => sf('semaine', e.target.value)} style={{ ...IS }}>
                {semaines.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Objectif Orange</label>
              <input type="number" step="any" value={form.objectif_orange} onChange={e => sf('objectif_orange', e.target.value)} placeholder="Ex: 16190484" style={{ ...IS }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Réalisation</label>
              <input type="number" step="any" value={form.realisation} onChange={e => sf('realisation', e.target.value)} placeholder="Ex: 15705945" style={{ ...IS }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Taux Orange (%)</label>
              <input type="number" step="0.01" value={form.taux_orange} onChange={e => sf('taux_orange', e.target.value)} placeholder="Ex: 97 (pour 97%)" style={{ ...IS }} />
            </div>
            {cfg.hasFarouk && <>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Objectif Farouk</label>
                <input type="number" step="any" value={form.objectif_farouk} onChange={e => sf('objectif_farouk', e.target.value)} style={{ ...IS }} />
              </div>
              <div style={{ gridColumn: '1' }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Taux Farouk (%)</label>
                <input type="number" step="0.01" value={form.taux_farouk} onChange={e => sf('taux_farouk', e.target.value)} placeholder="Ex: 80.8 (pour 80.8%)" style={{ ...IS }} />
              </div>
            </>}
            {form.indicateur === 'KAABU MOBILE' && (
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 5 }}>Nombre PDV</label>
                <input type="number" value={form.nombre_pdv} onChange={e => sf('nombre_pdv', e.target.value)} style={{ ...IS }} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={busy} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Enregistrement…' : '💾 Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportExcelModal({ onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = React.useRef();

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Sélectionnez un fichier Excel');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/award/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
      onSaved();
    } catch (e) { alert('Erreur: ' + (e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg,#0f0f1e,#1a1a2e)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 16, padding: '28px 32px', width: '90%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>📂 Import Excel Indicateurs</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          Importez le fichier <strong style={{ color: '#FF6900' }}>Suivi_Indicateur challenge.xlsx</strong>.<br/>
          Chaque feuille correspond à un indicateur (OMY, KAABU MOBILE, NAFAMA, TERMINAUX, ORANGE ENERGIE).
        </p>
        {result ? (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '14px', marginBottom: 16, fontSize: 13 }}>
            ✅ <strong style={{ color: '#22c55e' }}>{result.inserted} lignes ajoutées</strong>, {result.updated} mises à jour<br/>
            Indicateurs : {result.indicateurs?.join(', ')}
          </div>
        ) : null}
        <div style={{ marginBottom: 16 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ fontSize: 13, color: '#fff', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleImport} disabled={busy} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Import en cours…' : '📂 Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}

const MAIN_TABS = [
  { id: 'dashboard', label: '\uD83C\uDFC6 Score Global' },
  { id: 'telco',     label: '\uD83D\uDD35 Challenge PDG TELCO', color: '#0ea5e9' },
  { id: 'om',        label: '\uD83D\uDFE0 Challenge Orange Money', color: '#FF6900' },
  { id: 'classement', label: '\u2B50 Classement' },
  { id: 'alertes',   label: '\uD83D\uDEA8 Alertes' },
];

const SUB_TABS = {
  telco: [
    { id: 'telco_indicateurs', label: '\uD83D\uDCC8 Indicateurs TELCO' },
    { id: 'telco_points',      label: '\uD83D\uDCCD Points Contr\u00f4l\u00e9s' },
    { id: 'telco_kpis',        label: '\uD83D\uDCCA Suivi KPIs' },
  ],
  om: [
    { id: 'om_indicateurs', label: '\uD83D\uDCC8 Indicateurs OM' },
    { id: 'om_recrutement', label: '\uD83D\uDC65 Recrutement OMY' },
    { id: 'om_plv',         label: '\uD83D\uDCE6 Visibilit\u00e9 PLV' },
    { id: 'om_kpis',        label: '\uD83D\uDCCA Suivi KPIs' },
  ],
};

// ── Page Principale ───────────────────────────────────────────────────────────
export default function ChallengePage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState('');
  const [moisSelectionne, setMoisSelectionne] = useState('2026-07');

  // Quand on change de tab principal, activer le premier sous-tab
  const handleMainTab = (id) => {
    setActiveTab(id);
    if (SUB_TABS[id]) {
      setActiveSubTab(SUB_TABS[id][0].id);
    } else {
      setActiveSubTab('');
    }
  };
  const user = useAuthStore(s => s.user);
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading: loadDash, refetch } = useQuery('challenge-dashboard',
    () => api.get('/challenge/dashboard').then(r => r.data),
    { staleTime: 60000 }
  );

  const { data: alertes } = useQuery('challenge-alertes',
    () => api.get('/challenge/alertes').then(r => r.data),
    { staleTime: 60000 }
  );

  // Charger les données Award pour calculer le vrai nombre d'actions
  const { data: awardDataMain } = useQuery('award-dashboard',
    () => api.get('/award/dashboard').then(r => r.data),
    { staleTime: 60000 }
  );

  // Calculer le nb total d'actions urgentes (indicateurs Award + KPIs OM)
  const nbCritiques = React.useMemo(() => {
    let count = 0;
    // Indicateurs Award
    INDICATEURS_LIST.forEach(ind => {
      const data = awardDataMain?.[ind] || {};
      const total = (data.totaux || []).filter(t => t.realisation !== null).slice(-1)[0];
      if (!total) return;
      const pctO = total.taux_orange != null ? Math.round(total.taux_orange * 100) : null;
      const pctF = total.taux_farouk != null ? Math.round(total.taux_farouk * 100) : null;
      const cfg = INDICATEUR_CONFIG[ind];
      if (pctO !== null && pctO < 95) count++;
      if (cfg.hasFarouk && pctF !== null && pctF < 80) count++;
    });
    // KPIs Challenge OM
    const kpis = dashboard?.kpis || {};
    if ((kpis?.recrutement_omy?.taux || 0) < 0.95) count++;
    if ((kpis?.deploiement_plv?.taux || 0) < 0.95) count++;
    if ((kpis?.points_controles?.taux || 0) < 0.95) count++;
    return count;
  }, [awardDataMain, dashboard]);

  return (
    <div className="challenge-page">
      {/* Header */}
      <div className="challenge-header">
        <div className="challenge-title">
          <div className="challenge-badge">🏆 ORANGE AWARDS 2026</div>
          <h1>Challenge Partenaires Distributeurs</h1>
          <p>Période : 1er Juillet → 31 Octobre 2026 · Farouk Distribution SARL · BAMAKO RG</p>
        </div>
        <div className="challenge-header-actions">
          <CountdownTimer joursRestants={dashboard?.periode?.jours_restants} />
          <button onClick={() => refetch()} className="ch-btn ch-btn-secondary">
            <RefreshCw size={14}/> Actualiser
          </button>
        </div>
      </div>

      {/* Alertes critiques */}
      {nbCritiques > 0 && (
        <div className="challenge-alerte-banner">
          <AlertTriangle size={16}/>
          <span><b>{nbCritiques} KPI(s) en situation critique !</b> Cliquez sur "Alertes" pour voir les actions prioritaires.</span>
          <button onClick={() => setActiveTab('alertes')} className="ch-btn-alerte">Voir les alertes →</button>
        </div>
      )}

      {/* Tabs principaux */}
      <div className="challenge-tabs">
        {MAIN_TABS.map(t => (
          <button key={t.id} onClick={() => handleMainTab(t.id)}
            className={`challenge-tab${activeTab === t.id ? ' active' : ''}`}
            style={activeTab === t.id && t.color ? { borderColor: t.color, color: t.color } : {}}>
            {t.label}
            {t.id === 'alertes' && nbCritiques > 0 && (
              <span className="ch-badge-critiques">{nbCritiques}</span>
            )}
          </button>
        ))}
      </div>

      {/* Sous-tabs (si applicable) */}
      {SUB_TABS[activeTab] && (
        <div style={{ display: 'flex', gap: 6, padding: '0 0 12px 0', overflowX: 'auto', flexWrap: 'wrap' }}>
          {SUB_TABS[activeTab].map(st => {
            const mainColor = MAIN_TABS.find(t => t.id === activeTab)?.color || '#64748b';
            return (
              <button key={st.id} onClick={() => setActiveSubTab(st.id)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: `1px solid ${activeSubTab === st.id ? mainColor : 'rgba(255,255,255,0.08)'}`,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  background: activeSubTab === st.id ? `${mainColor}18` : 'rgba(255,255,255,0.03)',
                  color: activeSubTab === st.id ? mainColor : '#8a8a9a',
                }}>
                {st.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Contenu */}
      <div className="challenge-content">
        {loadDash ? (
          <div className="ch-loading">{"\u23F3"} Chargement des donn{"\u00e9"}es du challenge{"\u2026"}</div>
        ) : (
          <>
            {activeTab === 'dashboard' && <TabDashboard dashboard={dashboard} />}
            {/* Challenge PDG TELCO */}
            {activeSubTab === 'telco_indicateurs' && <TabIndicateurs filter="TELCO" />}
            {activeSubTab === 'telco_points' && <TabPointsControles />}
            {activeSubTab === 'telco_kpis' && <TabKPIs dashboard={dashboard} moisSelectionne={moisSelectionne} setMoisSelectionne={setMoisSelectionne} filter="TELCO" />}
            {/* Challenge Orange Money */}
            {activeSubTab === 'om_indicateurs' && <TabIndicateurs filter="OM" />}
            {activeSubTab === 'om_recrutement' && <TabRecrutement />}
            {activeSubTab === 'om_plv' && <TabPLV />}
            {activeSubTab === 'om_kpis' && <TabKPIs dashboard={dashboard} moisSelectionne={moisSelectionne} setMoisSelectionne={setMoisSelectionne} filter="OM" />}
            {/* Commun */}
            {activeTab === 'classement' && <TabClassement />}
            {activeTab === 'alertes' && <TabAlertes alertes={alertes} dashboard={dashboard} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab Dashboard ─────────────────────────────────────────────────────────────
function TabDashboard({ dashboard }) {
  const { kpis, scores, periode } = dashboard || {};

  // Charger les donn\u00e9es des indicateurs Award
  const { data: awardData } = useQuery('award-dashboard',
    () => api.get('/award/dashboard').then(r => r.data), { staleTime: 60000 }
  );

  // Extraire le dernier total disponible pour chaque indicateur
  const getLastTotal = (ind) => {
    const data = awardData?.[ind] || {};
    return (data.totaux || []).filter(t => t.realisation !== null).slice(-1)[0] || null;
  };

  const getIndTaux = (ind) => {
    const total = getLastTotal(ind);
    return total?.taux_orange != null ? Math.min(1, total.taux_orange) : null;
  };

  const indData = INDICATEURS_LIST.map(ind => ({
    nom: ind,
    cfg: INDICATEUR_CONFIG[ind],
    total: getLastTotal(ind),
  }));

  // === CHALLENGE 1 : PDG TELCO (100%) ===
  const telcoSousCriteres = [
    { key: 'ca_sell_out',   label: '\uD83D\uDFE2 CA Sell out (NAFAMA)',     poids: 40, taux: getIndTaux('NAFAMA'),         objectif: 'Taux >= 95%' },
    { key: 'vente_term',    label: '\uD83D\uDDA5\uFE0F Vente terminaux',    poids: 15, taux: getIndTaux('TERMINAUX'),      objectif: 'Min 100 terminaux / DZ' },
    { key: 'creation_pts',  label: '\uD83D\uDCCD Cr\u00e9ation Points contr\u00f4l\u00e9s', poids: 15, taux: kpis?.points_controles?.taux || null, objectif: 'Min 25 / DZ, activer >= 80%' },
    { key: 'kit_energie',   label: '\u2600\uFE0F Kit Orange \u00c9nergie',   poids: 15, taux: getIndTaux('ORANGE ENERGIE'), objectif: '>= 80% objectif + >= 80% utilisation' },
    { key: 'note_dz',       label: '\u2B50 Note DZ',                         poids: 15, taux: null,                        objectif: '\u00c9valuation visibilit\u00e9 & animation' },
  ];

  // === CHALLENGE 2 : ORANGE MONEY (100%) ===
  const omSousCriteres = [
    { key: 'ca_cashout',     label: '\uD83D\uDCF1 CA Cash-out (OMY)',              poids: 30, taux: getIndTaux('OMY'),               objectif: 'Taux >= 95%' },
    { key: 'pdv_actif',      label: '\uD83C\uDFEA PDV actif (nouveaut\u00e9)',      poids: 10, taux: kpis?.pdv_actifs?.taux || null,  objectif: '>= 90% PDV actifs, CA >= 1000F/mois' },
    { key: 'recrutement',    label: '\uD83D\uDC65 Recrutement Orange Money',        poids: 15, taux: kpis?.recrutement_omy?.taux || null, objectif: '1000 clients actifs / DZ (250/mois)' },
    { key: 'adoption_kaabu', label: '\uD83D\uDCB3 Adoption Kaabu',                  poids: 15, taux: getIndTaux('KAABU MOBILE'),     objectif: 'Min 10 tx/PDV/mois, taux actif atteint' },
    { key: 'risque_fintech', label: '\uD83D\uDD12 Ma\u00eetrise risque fintech',     poids: 15, taux: null,                           objectif: 'P\u00e9n\u00e9tration fintech < 2%' },
    { key: 'deploiement_plv', label: '\uD83D\uDCE6 D\u00e9ploiement support visibilit\u00e9', poids: 15, taux: kpis?.deploiement_plv?.taux || null, objectif: 'Min 100 PLV / DZ (25/mois)' },
  ];

  // Calcul des scores pond\u00e9r\u00e9s
  const calcScorePondere = (criteres) => {
    let totalPoids = 0, totalScore = 0;
    criteres.forEach(c => {
      if (c.taux !== null && c.taux !== undefined) {
        totalPoids += c.poids;
        totalScore += Math.min(1, c.taux) * c.poids;
      }
    });
    return totalPoids > 0 ? Math.round(totalScore / totalPoids * 100) : 0;
  };

  const scoreTelco = calcScorePondere(telcoSousCriteres);
  const scoreOM = calcScorePondere(omSousCriteres);
  const scoreGlobal = Math.round((scoreTelco + scoreOM) / 2);

  // Composant sous-crit\u00e8re
  const SousCritereRow = ({ c }) => {
    const pct = c.taux !== null && c.taux !== undefined ? Math.round(Math.min(1, c.taux) * 100) : null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{c.label}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{c.objectif}</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 50 }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>Poids</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>{c.poids}%</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>Taux</div>
          {pct !== null ? (
            <div style={{ fontSize: 14, fontWeight: 900, color: pct >= 95 ? '#22c55e' : pct >= 80 ? '#ffa502' : '#ff4757' }}>
              {pct}%
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#475569' }}>{'\u2014'}</div>
          )}
        </div>
        <div style={{ width: 100 }}>
          <BarreProg taux={c.taux} color={pct >= 95 ? '#22c55e' : pct >= 80 ? '#ffa502' : '#ff4757'} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* JAUGES GLOBALES */}
      <div className="ch-card">
        <h3 className="ch-section-title">{'\uD83C\uDFC6'} Score Global Challenge {'\u2014'} Orange AWARDS 2026</h3>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', padding: '20px 0' }}>
          <ScoreJauge label="PDG TELCO" score={scoreTelco} color="#0ea5e9"/>
          <ScoreJauge label="Orange Money" score={scoreOM} color="#FF6900"/>
          <ScoreJauge label="Score Global" score={scoreGlobal} color="#10b981"/>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          {scoreGlobal >= 95 ? (
            <div style={{ color: '#10b981', fontWeight: 700 }}>{'\uD83C\uDF89'} Excellente performance ! Vous {'\u00ea'}tes sur la bonne voie pour remporter le prix !</div>
          ) : scoreGlobal >= 70 ? (
            <div style={{ color: '#f59e0b', fontWeight: 700 }}>{'\u26A0\uFE0F'} Performance correcte mais des efforts suppl{'\u00e9'}mentaires sont n{'\u00e9'}cessaires</div>
          ) : (
            <div style={{ color: '#ef4444', fontWeight: 700 }}>{'\uD83D\uDD34'} Situation critique {'\u2014'} Des actions imm{'\u00e9'}diates sont n{'\u00e9'}cessaires !</div>
          )}
        </div>

      </div>

      {/* CHALLENGE 1 : PDG TELCO */}
      <div className="ch-card" style={{ borderLeft: '4px solid #0ea5e9' }}>
        <h3 className="ch-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{"🔵"} 1. Challenge PDG TELCO</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#0ea5e9' }}>{scoreTelco}%</span>
        </h3>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          {"Performance commerciale | Qualit\u00e9 d'ex\u00e9cution r\u00e9seau | Relais de croissance | \u00c9valuation"}
        </div>
        {telcoSousCriteres.map(c => <SousCritereRow key={c.key} c={c} />)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(14,165,233,0.2)' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>{"Score pond\u00e9r\u00e9 : "}<strong style={{ color: '#0ea5e9', fontSize: 16 }}>{scoreTelco} / 100</strong></div>
        </div>
      </div>

      {/* CHALLENGE 2 : ORANGE MONEY */}
      <div className="ch-card" style={{ borderLeft: '4px solid #FF6900' }}>
        <h3 className="ch-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{"🟠"} 2. Challenge Orange Money</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#FF6900' }}>{scoreOM}%</span>
        </h3>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          {"Performance commerciale | Qualit\u00e9 d'ex\u00e9cution r\u00e9seau | Digitalisation et transformation | Visibilit\u00e9"}
        </div>
        {omSousCriteres.map(c => <SousCritereRow key={c.key} c={c} />)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,105,0,0.2)' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>{"Score pond\u00e9r\u00e9 : "}<strong style={{ color: '#FF6900', fontSize: 16 }}>{scoreOM} / 100</strong></div>
        </div>
      </div>

      {/* Avancement période */}
      <div className="ch-card">
        <h3 className="ch-section-title">📅 Avancement de la Période</h3>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: '#64748b' }}>1er Juillet 2026</span>
          <span style={{ color: '#FF6900', fontWeight: 700 }}>{fmtPct(periode?.avancement_pct)} écoulé</span>
          <span style={{ color: '#64748b' }}>31 Octobre 2026</span>
        </div>
        <div style={{ height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${periode?.avancement_pct || 0}%`, background: 'linear-gradient(90deg, #FF6900, #ff9500)', borderRadius: 6, transition: 'width 1s ease' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Jours restants', value: periode?.jours_restants, color: '#FF6900' },
            { label: 'Jours écoulés', value: periode?.jours_ecoules, color: '#64748b' },
            { label: 'Mois passés', value: (periode?.mois_ecoules || []).length, color: '#0ea5e9' },
            { label: 'Mois restants', value: 4 - (periode?.mois_ecoules || []).length, color: '#10b981' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 20px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color }}>{value}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Tab KPIs ──────────────────────────────────────────────────────────────────
function TabKPIs({ dashboard, moisSelectionne, setMoisSelectionne, filter }) {
  const { data: kpisMois } = useQuery(['challenge-kpis', moisSelectionne],
    () => api.get(`/challenge/objectifs/${moisSelectionne}`).then(r => r.data),
    { staleTime: 60000 }
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sélecteur mois */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {MOIS_CHALLENGE.map(m => (
          <button key={m} onClick={() => setMoisSelectionne(m)}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: moisSelectionne === m ? '#FF6900' : 'rgba(255,255,255,0.06)',
              color: moisSelectionne === m ? '#fff' : '#94a3b8',
              boxShadow: moisSelectionne === m ? '0 2px 8px rgba(255,105,0,0.4)' : 'none',
            }}>
            {MOIS_LABELS[m]}
          </button>
        ))}
      </div>

      {/* KPIs du mois */}
      <div className="ch-card">
        <h3 className="ch-section-title">📊 KPIs — {MOIS_LABELS[moisSelectionne]} 2026</h3>
        {kpisMois ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {kpisMois.kpis?.map(kpi => (
              <KPIBar key={kpi.kpi} label={kpi.kpi} realise={kpi.realise} objectif={kpi.objectif} taux={kpi.taux} unite={kpi.unite} poids={kpi.poids_om || kpi.poids_telco}/>
            ))}
          </div>
        ) : <div className="ch-loading">Chargement…</div>}
      </div>

      {/* Tableau TELCO */}
      {filter === 'TELCO' && <KPITable color="#0ea5e9" title={"Challenge PDG TELCO"} icon={"🔵"} rows={[
        { label: '🟢 CA Sell out (NAFAMA)', poids: '40%', obj_par_mois: '95%', total: '95%', unite: '' },
        { label: '🖥️ Vente terminaux', poids: '15%', obj_par_mois: 25, total: 100, unite: 'terminaux' },
        { label: '📍 Points contrôlés', poids: '15%', obj_par_mois: '5-10', total: 25, unite: 'points' },
        { label: '☀️ Kit Orange Énergie', poids: '15%', obj_par_mois: '80%', total: '80%', unite: '' },
        { label: '⭐ Note DZ', poids: '15%', obj_par_mois: '-', total: '-', unite: '' },
      ]} />}

      {/* Tableau OM */}
      {filter === 'OM' && <KPITable color="#FF6900" title={"Challenge Orange Money"} icon={"🟠"} rows={[
        { label: '📱 CA Cash-out (OMY)', poids: '30%', obj_par_mois: '95%', total: '95%', unite: '' },
        { label: '🏪 PDV actif', poids: '10%', obj_par_mois: '90%', total: '90%', unite: '' },
        { label: '👥 Recrutement OMY', poids: '15%', obj_par_mois: 250, total: 1000, unite: 'clients' },
        { label: '💳 Adoption Kaabu', poids: '15%', obj_par_mois: '10 tx/PDV', total: '40 tx/PDV', unite: '' },
        { label: '🔒 Risque fintech', poids: '15%', obj_par_mois: '< 2%', total: '< 2%', unite: '' },
        { label: '📦 Support visibilité', poids: '15%', obj_par_mois: 25, total: 100, unite: 'PLV' },
      ]} />}
    </div>
  );
}

function KPITable({ color, title, icon, rows }) {
  return (
    <div className="ch-card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 className="ch-section-title">{icon} {title} — Objectifs par mois</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 700 }}>{"Sous-crit\u00e8re"}</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#64748b', fontWeight: 700 }}>Poids</th>
              {MOIS_CHALLENGE.map(m => (
                <th key={m} style={{ textAlign: 'center', padding: '10px 12px', color: '#64748b', fontWeight: 700 }}>{MOIS_LABELS[m]}</th>
              ))}
              <th style={{ textAlign: 'center', padding: '10px 12px', color, fontWeight: 700 }}>{"Total P\u00e9riode"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e2e8f0' }}>{row.label}</td>
                <td style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 800, color }}>{row.poids}</td>
                {MOIS_CHALLENGE.map(m => (
                  <td key={m} style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8', fontSize: 11 }}>{row.obj_par_mois}</td>
                ))}
                <td style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 800, color }}>{row.total} {row.unite}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab Recrutement ───────────────────────────────────────────────────────────
function TabRecrutement() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [mois, setMois] = useState('2026-07');
  const [form, setForm] = useState({ numero_client: '', nom_client: '', pdv_numero: '', pdv_nom: '', superviseur: '', developpeur: '', zone: '', mois: '2026-07' });

  const { data } = useQuery(['challenge-recrutements', mois],
    () => api.get(`/challenge/recrutements?mois=${mois}`).then(r => r.data),
    { staleTime: 30000 }
  );

  const mutation = useMutation(
    (payload) => api.post('/challenge/recrutements', payload).then(r => r.data),
    { onSuccess: () => { queryClient.invalidateQueries('challenge-recrutements'); queryClient.invalidateQueries('challenge-dashboard'); setShowForm(false); setForm({ numero_client: '', nom_client: '', pdv_numero: '', pdv_nom: '', superviseur: '', developpeur: '', zone: '', mois: '2026-07' }); } }
  );

  const stats = data?.stats_par_mois || {};
  const recs = data?.recrutements || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Banner Challenge OM */}
      <div style={{ background: 'rgba(255,105,0,0.08)', border: '1px solid rgba(255,105,0,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>{"🟠"}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6900' }}>Challenge Orange Money | Poids : 15%</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Objectif : recruter 1000 nouveaux clients actifs sur la p{"é"}riode (250/mois par DZ)</div>
        </div>
      </div>

      {/* Stats par mois */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {MOIS_CHALLENGE.map(m => {
          const s = stats[m] || { realise: 0, objectif: 250, taux: 0 };
          const c = getColor(s.taux);
          return (
            <div key={m} onClick={() => setMois(m)} className="ch-stat-card" style={{ borderColor: mois === m ? '#FF6900' : `${c}33`, cursor: 'pointer', background: mois === m ? 'rgba(255,105,0,0.1)' : 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>{MOIS_LABELS[m]}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{s.realise}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>/ {s.objectif} clients</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c, marginTop: 4 }}>{getEmoji(s.taux)} {fmtPct(s.taux)}</div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 className="ch-section-title" style={{ margin: 0 }}>{"👥"} Recrutements — {MOIS_LABELS[mois]}</h3>
        <button className="ch-btn ch-btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={14}/> Nouveau recrutement
        </button>
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div className="ch-card" style={{ border: '1px solid rgba(255,105,0,0.3)' }}>
          <h4 style={{ color: '#FF6900', marginBottom: 16 }}>➕ Enregistrer un nouveau client OM</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { key: 'numero_client', label: 'N° Client OM', placeholder: '7X XXX XXX' },
              { key: 'nom_client', label: 'Nom du Client', placeholder: 'Nom complet' },
              { key: 'pdv_numero', label: 'N° PDV', placeholder: 'Numéro flotte' },
              { key: 'pdv_nom', label: 'Nom PDV', placeholder: 'Nom du point de vente' },
              { key: 'superviseur', label: 'Superviseur', placeholder: 'Nom superviseur' },
              { key: 'developpeur', label: 'Développeur', placeholder: 'Nom développeur' },
              { key: 'zone', label: 'Zone', placeholder: 'Zone' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}/>
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>Mois</label>
              <select value={form.mois} onChange={e => setForm(f => ({ ...f, mois: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,20,30,1)', color: '#fff', fontSize: 13 }}>
                {MOIS_CHALLENGE.map(m => <option key={m} value={m}>{MOIS_LABELS[m]} 2026</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="ch-btn ch-btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
            <button className="ch-btn ch-btn-primary" onClick={() => mutation.mutate(form)} disabled={mutation.isLoading}>
              {mutation.isLoading ? '⏳ Enregistrement…' : '✅ Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="ch-card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['N° Client', 'Nom Client', 'PDV', 'Zone', 'Superviseur', 'Développeur', 'Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recs.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#475569' }}>Aucun recrutement enregistré pour {MOIS_LABELS[mois]}</td></tr>
              ) : recs.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 12px', color: '#FF6900', fontWeight: 700 }}>{r.numero_client || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{r.nom_client || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{r.pdv_numero} {r.pdv_nom && `· ${r.pdv_nom}`}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{r.zone || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{r.superviseur || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{r.developpeur || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{r.date_recrutement ? new Date(r.date_recrutement).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab PLV ───────────────────────────────────────────────────────────────────
function TabPLV() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [mois, setMois] = useState('2026-07');
  const [form, setForm] = useState({ pdv_numero: '', pdv_nom: '', zone: '', superviseur: '', type_plv: 'Kakemono', quantite: 1, mois: '2026-07' });

  const { data } = useQuery(['challenge-plv', mois],
    () => api.get(`/challenge/plv?mois=${mois}`).then(r => r.data),
    { staleTime: 30000 }
  );

  const mutation = useMutation(
    (payload) => api.post('/challenge/plv', payload).then(r => r.data),
    { onSuccess: () => { queryClient.invalidateQueries('challenge-plv'); queryClient.invalidateQueries('challenge-dashboard'); setShowForm(false); } }
  );

  const stats = data?.stats_par_mois || {};
  const plvs = data?.plv || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Banner Challenge OM */}
      <div style={{ background: 'rgba(255,105,0,0.08)', border: '1px solid rgba(255,105,0,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>{"🟠"}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6900' }}>Challenge Orange Money | Poids : 15%</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{"Objectif : d\u00e9ployer 100 PLV par partenaire et par DZ (25 PLV/mois)"}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {MOIS_CHALLENGE.map(m => {
          const s = stats[m] || { realise: 0, objectif: 25, taux: 0 };
          const c = getColor(s.taux);
          return (
            <div key={m} onClick={() => setMois(m)} className="ch-stat-card" style={{ borderColor: mois === m ? '#FF6900' : `${c}33`, cursor: 'pointer', background: mois === m ? 'rgba(255,105,0,0.1)' : 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>{MOIS_LABELS[m]}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{s.realise}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>/ {s.objectif} PLV</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c, marginTop: 4 }}>{getEmoji(s.taux)} {fmtPct(s.taux)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 className="ch-section-title" style={{ margin: 0 }}>📦 PLV déployées — {MOIS_LABELS[mois]}</h3>
        <button className="ch-btn ch-btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={14}/> Ajouter PLV</button>
      </div>

      {showForm && (
        <div className="ch-card" style={{ border: '1px solid rgba(255,105,0,0.3)' }}>
          <h4 style={{ color: '#FF6900', marginBottom: 16 }}>➕ Enregistrer un déploiement PLV</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { key: 'pdv_numero', label: 'N° PDV', placeholder: 'Numéro flotte' },
              { key: 'pdv_nom', label: 'Nom PDV', placeholder: 'Nom du PDV' },
              { key: 'zone', label: 'Zone', placeholder: 'Zone' },
              { key: 'superviseur', label: 'Superviseur', placeholder: 'Nom superviseur' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}/>
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>Type PLV</label>
              <select value={form.type_plv} onChange={e => setForm(f => ({ ...f, type_plv: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,20,30,1)', color: '#fff', fontSize: 13 }}>
                {['Kakemono', 'Affiche', 'Roll-up', 'Banderole', 'Sticker', 'Enseigne', 'Autre'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>Quantité</label>
              <input type="number" min="1" value={form.quantite} onChange={e => setForm(f => ({ ...f, quantite: parseInt(e.target.value) || 1 }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}/>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>Mois</label>
              <select value={form.mois} onChange={e => setForm(f => ({ ...f, mois: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,20,30,1)', color: '#fff', fontSize: 13 }}>
                {MOIS_CHALLENGE.map(m => <option key={m} value={m}>{MOIS_LABELS[m]} 2026</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="ch-btn ch-btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
            <button className="ch-btn ch-btn-primary" onClick={() => mutation.mutate(form)} disabled={mutation.isLoading}>
              {mutation.isLoading ? '⏳ Enregistrement…' : '✅ Enregistrer'}
            </button>
          </div>
        </div>
      )}

      <div className="ch-card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['N° PDV', 'Nom PDV', 'Type PLV', 'Qté', 'Zone', 'Superviseur', 'Statut', 'Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plvs.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: '#475569' }}>Aucune PLV enregistrée pour {MOIS_LABELS[mois]}</td></tr>
              ) : plvs.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 12px', color: '#FF6900', fontWeight: 700 }}>{p.pdv_numero || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{p.pdv_nom || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{p.type_plv || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#fff', fontWeight: 700, textAlign: 'center' }}>{p.quantite}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{p.zone || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{p.superviseur || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: p.valide ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: p.valide ? '#10b981' : '#f59e0b' }}>
                      {p.valide ? '✅ Validé' : '⏳ En attente'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{p.date_deploiement ? new Date(p.date_deploiement).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab Points Contrôlés ──────────────────────────────────────────────────────
function TabPointsControles() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ pdv_numero: '', pdv_nom: '', zone: '', superviseur: '', mois: '2026-07', ca_mensuel: '' });

  const { data } = useQuery('challenge-points',
    () => api.get('/challenge/points-controles').then(r => r.data),
    { staleTime: 30000 }
  );

  const mutation = useMutation(
    (payload) => api.post('/challenge/points-controles', payload).then(r => r.data),
    { onSuccess: () => { queryClient.invalidateQueries('challenge-points'); queryClient.invalidateQueries('challenge-dashboard'); setShowForm(false); } }
  );

  const stats = data?.stats_par_mois || {};
  const points = data?.points || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Banner Challenge TELCO */}
      <div style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>{"🔵"}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0ea5e9' }}>{"Challenge PDG TELCO | Poids : 15%"}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{"Objectif : cr\u00e9er 25 nouveaux points contr\u00f4l\u00e9s par DZ et activer au moins 80%"}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {MOIS_CHALLENGE.map(m => {
          const s = stats[m] || { realise: 0, objectif: 5, taux: 0 };
          const c = getColor(s.taux);
          return (
            <div key={m} className="ch-stat-card" style={{ borderColor: `${c}33` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>{MOIS_LABELS[m]}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{s.realise}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>/ {s.objectif} points</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c, marginTop: 4 }}>{getEmoji(s.taux)} {fmtPct(s.taux)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 className="ch-section-title" style={{ margin: 0 }}>📍 Points Contrôlés — Période</h3>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Total : {data?.total || 0} / 25 · Actifs : {data?.actifs || 0}</div>
        </div>
        <button className="ch-btn ch-btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={14}/> Nouveau point</button>
      </div>

      {showForm && (
        <div className="ch-card" style={{ border: '1px solid rgba(255,105,0,0.3)' }}>
          <h4 style={{ color: '#FF6900', marginBottom: 16 }}>➕ Nouveau Point Contrôlé</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { key: 'pdv_numero', label: 'N° PDV', placeholder: 'Numéro flotte' },
              { key: 'pdv_nom', label: 'Nom PDV', placeholder: 'Nom du PDV' },
              { key: 'zone', label: 'Zone', placeholder: 'Zone' },
              { key: 'superviseur', label: 'Superviseur', placeholder: 'Nom superviseur' },
              { key: 'ca_mensuel', label: 'CA Mensuel (FCFA)', placeholder: '0' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}/>
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: '#FF6900', display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>Mois</label>
              <select value={form.mois} onChange={e => setForm(f => ({ ...f, mois: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,20,30,1)', color: '#fff', fontSize: 13 }}>
                {MOIS_CHALLENGE.map(m => <option key={m} value={m}>{MOIS_LABELS[m]} 2026</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="ch-btn ch-btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
            <button className="ch-btn ch-btn-primary" onClick={() => mutation.mutate(form)} disabled={mutation.isLoading}>
              {mutation.isLoading ? '⏳ Enregistrement…' : '✅ Enregistrer'}
            </button>
          </div>
        </div>
      )}

      <div className="ch-card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['N° PDV', 'Nom PDV', 'Zone', 'Superviseur', 'CA/mois', 'Mois', 'Statut'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#475569' }}>Aucun point contrôlé enregistré</td></tr>
              ) : points.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 12px', color: '#FF6900', fontWeight: 700 }}>{p.pdv_numero || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{p.pdv_nom || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{p.zone || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{p.superviseur || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#10b981', fontWeight: 700 }}>{p.ca_mensuel ? fmtNum(p.ca_mensuel) + ' F' : '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{MOIS_LABELS[p.mois]}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: p.est_actif ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: p.est_actif ? '#10b981' : '#ef4444' }}>
                      {p.est_actif ? '✅ Actif' : '❌ Inactif'}
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

// ── Tab Classement ────────────────────────────────────────────────────────────
function TabClassement() {
  const { data } = useQuery('challenge-classement',
    () => api.get('/challenge/classement').then(r => r.data),
    { staleTime: 60000 }
  );

  const recrutement = data?.recrutement || [];
  const plv = data?.plv || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="ch-card">
        <h3 className="ch-section-title">🏆 Classement Recrutement OMY</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {recrutement.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#475569', padding: 20 }}>Aucune donnée disponible</div>
          ) : recrutement.map((r, i) => {
            const color = getColor(r.taux);
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return (
              <div key={r.superviseur} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${color}22` }}>
                <div style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{medal}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{r.superviseur}</div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(r.taux, 100)}%`, background: color, borderRadius: 3 }}/>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color }}>{r.total}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>/ {r.objectif_cumule} clients</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmtPct(r.taux)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ch-card">
        <h3 className="ch-section-title">📦 Classement Déploiement PLV</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {plv.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#475569', padding: 20 }}>Aucune donnée disponible</div>
          ) : plv.map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return (
              <div key={p.superviseur} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{medal}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{p.superviseur}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#0ea5e9' }}>{p.total}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>PLV déployées</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tab Alertes ───────────────────────────────────────────────────────────────
function TabAlertes({ alertes, dashboard }) {
  // Charger les indicateurs Award pour analyses
  const { data: awardData } = useQuery('award-dashboard',
    () => api.get('/award/dashboard').then(r => r.data), { staleTime: 60000 }
  );

  const kpis = dashboard?.kpis || {};
  const scores = dashboard?.scores || {};
  const periode = dashboard?.periode || {};

  // Générer toutes les actions à partir de toutes les sources
  const actions = [];

  // ── Indicateurs Award ──────────────────────────────────────────────────────
  INDICATEURS_LIST.forEach(ind => {
    const cfg = INDICATEUR_CONFIG[ind];
    const data = awardData?.[ind] || {};
    const total = (data.totaux || []).filter(t => t.realisation !== null).slice(-1)[0];
    if (!total) return;

    const pctO = total.taux_orange != null ? Math.round(total.taux_orange * 100) : null;
    const pctF = total.taux_farouk != null ? Math.round(total.taux_farouk * 100) : null;
    const ecart = total.objectif_orange && total.realisation
      ? Math.round(total.objectif_orange - total.realisation)
      : null;

    // Action basée sur taux Orange
    if (pctO !== null && pctO < 95) {
      const urgence = pctO < 70 ? 'critique' : pctO < 85 ? 'haute' : 'normale';
      const manquant = ecart && ecart > 0 ? ` Il manque ${fmtV(ecart, cfg.unite)} pour atteindre l'objectif.` : '';
      actions.push({
        source: ind,
        icon: cfg.icon,
        color: urgence === 'critique' ? '#ff4757' : urgence === 'haute' ? '#ffa502' : '#f59e0b',
        urgence,
        titre: `${cfg.icon} ${ind} — Taux Orange ${pctO}%`,
        situation: `Réalisation : ${fmtV(total.realisation, cfg.unite)} / Objectif : ${fmtV(total.objectif_orange, cfg.unite)}.${manquant}`,
        actions: pctO < 70 ? [
          `🚨 Réunion d'urgence avec l'équipe terrain pour analyser les blocages sur ${ind}`,
          `📞 Appels quotidiens aux superviseurs pour suivi hebdomadaire`,
          `🎯 Identifier les top 20% PDVs qui peuvent booster rapidement le ${ind}`,
          `📊 Comparer avec la semaine S30 pour identifier la tendance`,
        ] : pctO < 85 ? [
          `⚡ Mobiliser les superviseurs sur les zones les plus actives ${ind}`,
          `📈 Analyser les PDVs en baisse pour les récupérer en urgence`,
          `💬 Communication directe avec les gestionnaires de zone`,
        ] : [
          `✅ Bon niveau ! Maintenir le rythme pour atteindre 95%`,
          `🔍 Focus sur les PDVs inactifs pour gagner les derniers points`,
        ],
      });
    }

    // Action basée sur taux Farouk (si disponible et en retard)
    if (cfg.hasFarouk && pctF !== null && pctF < 80) {
      actions.push({
        source: `${ind} Farouk`,
        icon: '🏢',
        color: '#ffa502',
        urgence: pctF < 60 ? 'haute' : 'normale',
        titre: `🏢 ${ind} — Objectif Farouk ${pctF}%`,
        situation: `Notre performance interne Farouk est à ${pctF}% de l'objectif fixé.`,
        actions: [
          `📋 Revoir la stratégie interne de vente ${ind} avec l'équipe`,
          `🎯 Fixer des sous-objectifs hebdomadaires par superviseur`,
          `📊 Comparer notre performance avec les données Orange pour ajuster`,
        ],
      });
    }
  });

  // ── KPIs Challenge OM ──────────────────────────────────────────────────────
  const tauxRecrut = kpis?.recrutement_omy?.taux || 0;
  const manqRecr = kpis?.recrutement_omy
    ? Math.max(0, Math.round((kpis.recrutement_omy.objectif_cumule || 0) - (kpis.recrutement_omy.realise || 0)))
    : 0;
  if (tauxRecrut < 0.95) {
    actions.push({
      source: 'Recrutement OMY',
      icon: '👥',
      color: tauxRecrut < 0.5 ? '#ff4757' : '#ffa502',
      urgence: tauxRecrut < 0.5 ? 'critique' : 'haute',
      titre: `👥 Recrutement OMY — ${Math.round(tauxRecrut * 100)}%`,
      situation: `${kpis?.recrutement_omy?.realise || 0} clients recrutés sur ${kpis?.recrutement_omy?.objectif_cumule || 0} attendus.${manqRecr > 0 ? ` Il manque ${manqRecr} recrutements.` : ''}`,
      actions: [
        `🎯 Chaque développeur doit prospecter au moins 3 nouveaux clients par jour`,
        `📍 Cibler les quartiers à forte densité commerciale non encore couverts`,
        `🤝 Incentiver les PDVs actifs à recommander des nouveaux commerçants`,
        `📱 Organiser des sessions de démonstration Orange Money dans les marchés`,
        `📋 Suivre quotidiennement le tableau de bord Prospection`,
      ],
    });
  }

  const tauxPLV = kpis?.deploiement_plv?.taux || 0;
  if (tauxPLV < 0.95) {
    actions.push({
      source: 'PLV',
      icon: '📦',
      color: tauxPLV < 0.5 ? '#ff4757' : '#ffa502',
      urgence: tauxPLV < 0.5 ? 'critique' : 'haute',
      titre: `📦 Déploiement PLV — ${Math.round(tauxPLV * 100)}%`,
      situation: `${kpis?.deploiement_plv?.realise || 0} PLV déployés sur ${kpis?.deploiement_plv?.objectif_cumule || 0} attendus.`,
      actions: [
        `🚗 Planifier des tournées PLV avec les superviseurs dès cette semaine`,
        `📦 Prioriser les PDVs à fort CA qui n'ont pas encore leur PLV`,
        `📸 Prendre des photos de preuve pour chaque PLV installée`,
        `🗺️ Cartographier les zones non couvertes et affecter des responsables`,
      ],
    });
  }

  const tauxPoints = kpis?.points_controles?.taux || 0;
  if (tauxPoints < 0.95) {
    actions.push({
      source: 'Points Contrôle',
      icon: '📍',
      color: tauxPoints < 0.5 ? '#ff4757' : '#ffa502',
      urgence: tauxPoints < 0.5 ? 'critique' : 'haute',
      titre: `📍 Points de Contrôle — ${Math.round(tauxPoints * 100)}%`,
      situation: `${kpis?.points_controles?.realise || 0} points créés sur ${kpis?.points_controles?.objectif_cumule || 0} attendus.`,
      actions: [
        `🏪 Identifier et enregistrer tous les nouveaux PDVs actifs comme points de contrôle`,
        `📋 Faire une tournée complète de vérification terrain chaque semaine`,
        `✅ Mettre à jour le tableau de bord après chaque point validé`,
      ],
    });
  }

  // Ajouter des conseils généraux si tout va bien
  const nbCritiques = actions.filter(a => a.urgence === 'critique').length;
  const nbHaute = actions.filter(a => a.urgence === 'haute').length;

  // Trier : critique > haute > normale
  const ordre = { critique: 0, haute: 1, normale: 2 };
  actions.sort((a, b) => ordre[a.urgence] - ordre[b.urgence]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header motivant */}
      <div style={{
        background: nbCritiques > 0
          ? 'linear-gradient(135deg, rgba(255,71,87,0.12), rgba(255,71,87,0.04))'
          : nbHaute > 0
          ? 'linear-gradient(135deg, rgba(255,165,2,0.12), rgba(255,165,2,0.04))'
          : 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
        border: `1px solid ${nbCritiques > 0 ? 'rgba(255,71,87,0.3)' : nbHaute > 0 ? 'rgba(255,165,2,0.3)' : 'rgba(34,197,94,0.3)'}`,
        borderRadius: 14, padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 40 }}>
            {nbCritiques > 0 ? '🚨' : nbHaute > 0 ? '⚡' : '🏆'}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
              {nbCritiques > 0
                ? `${nbCritiques} point${nbCritiques > 1 ? 's' : ''} critique${nbCritiques > 1 ? 's' : ''} — Mobilisation immédiate !`
                : nbHaute > 0
                ? `${actions.length} action${actions.length > 1 ? 's' : ''} à prioriser cette semaine`
                : '🎉 Performance dans les objectifs — Maintenez le cap !'}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              {periode?.jours_restants ? `Il reste ${periode.jours_restants} jours pour remporter le challenge Orange Awards 2026` : 'Challenge Orange Awards 2026 — Farouk Distribution SARL'}
            </div>
          </div>
        </div>
      </div>

      {/* Actions par urgence */}
      {actions.length === 0 ? (
        <div className="ch-card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>Félicitations ! Tous les indicateurs sont dans les objectifs !</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Continuez sur cette lancée — vous êtes sur la bonne voie pour remporter le prix Orange Awards 2026.</div>
        </div>
      ) : (
        actions.map((a, i) => (
          <div key={i} style={{
            background: a.urgence === 'critique' ? 'rgba(255,71,87,0.06)' : a.urgence === 'haute' ? 'rgba(255,165,2,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${a.urgence === 'critique' ? 'rgba(255,71,87,0.25)' : a.urgence === 'haute' ? 'rgba(255,165,2,0.25)' : 'rgba(255,255,255,0.08)'}`,
            borderLeft: `4px solid ${a.color}`,
            borderRadius: 12, padding: '16px 20px',
          }}>
            {/* Header action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{a.titre}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{a.situation}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                background: `rgba(${a.urgence === 'critique' ? '255,71,87' : a.urgence === 'haute' ? '255,165,2' : '255,193,7'},0.15)`,
                color: a.color }}>
                {a.urgence === 'critique' ? '🔴 URGENT' : a.urgence === 'haute' ? '🟠 HAUTE' : '🟡 NORMALE'}
              </span>
            </div>

            {/* Barre progression si disponible */}
            <BarreProg taux={a.taux} color={a.color} />

            {/* Liste des actions */}
            <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                💡 Actions recommandées
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {a.actions.map((act, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                    <span style={{ color: a.color, fontWeight: 700, marginTop: 1, flexShrink: 0 }}>{j + 1}.</span>
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Conseil final si des actions existent */}
      {actions.length > 0 && (
        <div style={{ background: 'rgba(255,105,0,0.06)', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>🏆</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FF6900', marginBottom: 6 }}>Message du Manager</div>
            <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.7 }}>
              Chaque point gagné sur un indicateur rapproche Farouk Distribution du prix Orange Awards 2026.
              {' '}<strong style={{ color: '#FF6900' }}>Il reste encore {periode?.jours_restants || '—'} jours</strong> pour inverser la tendance et montrer de quoi notre équipe est capable.
              Chaque action terrain compte. <strong style={{ color: '#ffa502' }}>L'effort d'aujourd'hui sera récompensé demain.</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
