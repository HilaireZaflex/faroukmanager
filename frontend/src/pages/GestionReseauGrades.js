import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../services/api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import PDVCell from '../components/common/PDVCell';

const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
const NOW_YEAR = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;

const GRADE_META = {
  diamant: { emoji: 'Diamant', color: '#00d6ff', bg: 'rgba(0,214,255,0.12)', label: 'Diamant' },
  or:      { emoji: 'Or',      color: '#FFD700', bg: 'rgba(255,215,0,0.12)',  label: 'Or' },
  argent:  { emoji: 'Argent',  color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)', label: 'Argent' },
  fer:     { emoji: 'Fer',     color: '#888888', bg: 'rgba(136,136,136,0.1)', label: 'Fer' },
  cuivre:  { emoji: 'Cuivre',  color: '#CD7F32', bg: 'rgba(205,127,50,0.1)', label: 'Cuivre' },
  inactif: { emoji: 'Inactif', color: '#ff3d71', bg: 'rgba(255,61,113,0.1)', label: 'Inactif' },
};

const GRADE_ICONS = {
  diamant: '💎', or: '🥇', argent: '🥈', fer: '🦾', cuivre: '🟤', inactif: '⬜'
};

function formatCA(v) {
  if (!v) return '0';
  if (v >= 1000000000) return (v/1000000000).toFixed(2) + ' Mds';
  if (v >= 1000000) return (v/1000000).toFixed(1) + ' M';
  if (v >= 1000) return (v/1000).toFixed(0) + ' K';
  return String(v);
}

function MonthPicker({ annee, mois, setAnnee, setMois }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <button onClick={() => { if(mois===1){setMois(12);setAnnee(a=>a-1);}else setMois(m=>m-1); }}
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
        &lt;
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>{MONTHS[mois-1]} {annee}</span>
      <button onClick={() => { if(mois===12){setMois(1);setAnnee(a=>a+1);}else setMois(m=>m+1); }}
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
        &gt;
      </button>
    </div>
  );
}

// ── Sous-onglet 1 : Vue globale des grades ──────────────────────────────────
function VueGlobaleGrades({ annee, mois, seuils }) {
  const [gradeSelec, setGradeSelec] = useState(null);
  const params = { annee, mois, ...buildParams(seuils) };

  const { data, isLoading } = useQuery(
    ['grades-overview', annee, mois, JSON.stringify(seuils)],
    () => api.get('/grades/overview', { params }).then(r => r.data),
    { staleTime: 60000 }
  );

  const summary = data?.summary || [];
  const pieData = summary.filter(g => g.nb_pdvs > 0).map(g => ({
    name: g.label, value: g.nb_pdvs, color: g.color
  }));
  const gradeDetail = gradeSelec ? summary.find(g => g.grade === gradeSelec) : null;

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      {/* Cards grades */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {summary.map((g) => (
          <div key={g.grade} onClick={() => setGradeSelec(gradeSelec === g.grade ? null : g.grade)}
            className="card" style={{
              borderLeft: `3px solid ${g.color}`, background: g.bg, cursor: 'pointer',
              outline: gradeSelec === g.grade ? `2px solid ${g.color}` : 'none'
            }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{GRADE_ICONS[g.grade]}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: g.color }}>{g.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{g.nb_pdvs}</div>
            <div style={{ color: '#8a8a9a', fontSize: 10, marginTop: 2 }}>PDVs</div>
            <div style={{ color: g.color, fontWeight: 600, fontSize: 12, marginTop: 6 }}>{formatCA(g.ca_total)} FCFA</div>
          </div>
        ))}
      </div>

      {/* Graphiques */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Repartition PDVs</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" nameKey="name">
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>CA total par grade</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary.filter(g => g.ca_total > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" stroke="#8a8a9a" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCA(v) + ' FCFA'} contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Bar dataKey="ca_total" name="CA Total" radius={[6,6,0,0]}>
                {summary.filter(g => g.ca_total > 0).map((g, i) => <Cell key={i} fill={g.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail du grade selectionne */}
      {gradeDetail && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700 }}>{GRADE_ICONS[gradeDetail.grade]} PDVs {gradeDetail.label} ({gradeDetail.nb_pdvs})</h3>
            <button onClick={() => setGradeSelec(null)}
              style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: '#8a8a9a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
              Fermer
            </button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>#</th><th>PDV</th><th>Zone</th><th>Gestionnaire</th><th>CA</th><th>Nb Ops</th></tr>
              </thead>
              <tbody>
                {gradeDetail.pdvs.slice(0, 50).map((p, i) => (
                  <tr key={i}>
                    <td style={{ color: '#8a8a9a', fontSize: 11 }}>{i+1}</td>
                    <td><PDVCell nom={p.pdv_nom} numero={p.numero_pdv} /></td>
                    <td style={{ color: '#8a8a9a', fontSize: 12 }}>{p.zone}</td>
                    <td style={{ fontSize: 12 }}>{p.gestionnaire}</td>
                    <td style={{ color: gradeDetail.color, fontWeight: 700 }}>{formatCA(p.ca)} FCFA</td>
                    <td>{p.nb_operations.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sous-onglet 2 : Configurer les seuils ───────────────────────────────────
function ConfigSeuils({ seuils, setSeuils }) {
  const [local, setLocal] = useState({ ...seuils });

  const champs = [
    { key: 'diamant', label: 'Diamant', icon: '💎', color: '#00d6ff', ops_key: 'ops_diamant' },
    { key: 'or',      label: 'Or',      icon: '🥇', color: '#FFD700', ops_key: 'ops_or' },
    { key: 'argent',  label: 'Argent',  icon: '🥈', color: '#C0C0C0', ops_key: 'ops_argent' },
    { key: 'fer',     label: 'Fer',     icon: '🦾', color: '#888888', ops_key: 'ops_fer' },
  ];

  const apply = () => setSeuils({ ...local });
  const reset = () => {
    const def = { diamant: 1800000, or: 1200000, argent: 700000, fer: 300000, cuivre: 1,
                  ops_diamant: 40, ops_or: 25, ops_argent: 15, ops_fer: 5, ops_cuivre: 1 };
    setLocal(def);
    setSeuils(def);
  };

  return (
    <div>
      <div style={{ background: 'rgba(255,105,0,0.06)', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ color: '#8a8a9a', fontSize: 12, margin: 0 }}>
          Definissez les seuils CA (FCFA) et les seuils d'operations minimales pour chaque grade. Ces parametres s'appliquent a tous les onglets en temps reel.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {champs.map(c => (
          <div key={c.key} className="card" style={{ borderLeft: `3px solid ${c.color}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: c.color }}>{c.icon} Grade {c.label}</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#8a8a9a', fontSize: 11, display: 'block', marginBottom: 4 }}>CA minimum (FCFA)</label>
              <input type="number" value={local[c.key] || 0} onChange={e => setLocal(p => ({ ...p, [c.key]: Number(e.target.value) }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ color: '#8a8a9a', fontSize: 11, display: 'block', marginBottom: 4 }}>Operations minimum</label>
              <input type="number" value={local[c.ops_key] || 0} onChange={e => setLocal(p => ({ ...p, [c.ops_key]: Number(e.target.value) }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={apply} style={{ background: '#FF6900', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          Appliquer les seuils
        </button>
        <button onClick={reset} style={{ background: 'rgba(255,255,255,0.07)', color: '#8a8a9a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          Reinitialiser
        </button>
      </div>
    </div>
  );
}

// ── Sous-onglet 3 : Evolution des grades ───────────────────────────────────
function EvolutionGrades({ annee, mois, seuils }) {
  const params = { annee, mois, ...buildParams(seuils) };
  const { data, isLoading } = useQuery(
    ['grades-evolution', annee, mois, JSON.stringify(seuils)],
    () => api.get('/grades/evolution', { params }).then(r => r.data),
    { staleTime: 60000 }
  );

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  const stats = data?.stats || {};
  const montes = data?.montes || [];
  const descendus = data?.descendus || [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'PDVs montes en grade', value: stats.nb_montes, color: '#00d68f', icon: 'PDVs ameliores' },
          { label: 'PDVs descendus en grade', value: stats.nb_descendus, color: '#ff3d71', icon: 'PDVs deteriores' },
          { label: 'PDVs stables', value: stats.nb_stables, color: '#8a8a9a', icon: 'Stables' },
        ].map(k => (
          <div key={k.label} className="card" style={{ textAlign: 'center', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontWeight: 800, fontSize: 28, color: k.color }}>{k.value || 0}</div>
          </div>
        ))}
      </div>

      {montes.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #00d68f' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#00d68f' }}>PDVs qui ont monte en grade</h3>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>PDV</th><th>Zone</th><th>Grade precedent</th><th>Grade actuel</th><th>CA precedent</th><th>CA actuel</th></tr></thead>
              <tbody>
                {montes.slice(0,30).map((p, i) => (
                  <tr key={i}>
                    <td><PDVCell nom={p.pdv_nom} numero={p.numero_pdv} /></td>
                    <td style={{ color: '#8a8a9a', fontSize: 12 }}>{p.zone}</td>
                    <td><span style={{ color: GRADE_META[p.grade_precedent]?.color }}>{GRADE_ICONS[p.grade_precedent]} {p.grade_precedent}</span></td>
                    <td><span style={{ color: GRADE_META[p.grade_actuel]?.color, fontWeight: 700 }}>{GRADE_ICONS[p.grade_actuel]} {p.grade_actuel}</span></td>
                    <td style={{ color: '#8a8a9a' }}>{formatCA(p.ca_precedent)}</td>
                    <td style={{ color: '#00d68f', fontWeight: 700 }}>{formatCA(p.ca_actuel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {descendus.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid #ff3d71' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#ff3d71' }}>PDVs qui ont descend en grade</h3>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>PDV</th><th>Zone</th><th>Grade precedent</th><th>Grade actuel</th><th>CA precedent</th><th>CA actuel</th></tr></thead>
              <tbody>
                {descendus.slice(0,30).map((p, i) => (
                  <tr key={i}>
                    <td><PDVCell nom={p.pdv_nom} numero={p.numero_pdv} /></td>
                    <td style={{ color: '#8a8a9a', fontSize: 12 }}>{p.zone}</td>
                    <td><span style={{ color: GRADE_META[p.grade_precedent]?.color, fontWeight: 700 }}>{GRADE_ICONS[p.grade_precedent]} {p.grade_precedent}</span></td>
                    <td><span style={{ color: GRADE_META[p.grade_actuel]?.color }}>{GRADE_ICONS[p.grade_actuel]} {p.grade_actuel}</span></td>
                    <td style={{ color: '#8a8a9a' }}>{formatCA(p.ca_precedent)}</td>
                    <td style={{ color: '#ff3d71', fontWeight: 700 }}>{formatCA(p.ca_actuel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sous-onglet 4 : Alertes degradation ────────────────────────────────────
function AlertesDegradation({ annee, mois, seuils }) {
  const params = { annee, mois, ...buildParams(seuils) };
  const { data, isLoading } = useQuery(
    ['grades-alertes', annee, mois, JSON.stringify(seuils)],
    () => api.get('/grades/alertes', { params }).then(r => r.data),
    { staleTime: 60000 }
  );

  const alertes = Array.isArray(data) ? data : [];
  const elevees = alertes.filter(a => a.risque === 'eleve');
  const moderees = alertes.filter(a => a.risque === 'modere');

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ borderLeft: '3px solid #ff3d71', textAlign: 'center' }}>
          <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 4 }}>Risque eleve (CA &lt; 90% seuil)</div>
          <div style={{ fontWeight: 800, fontSize: 28, color: '#ff3d71' }}>{elevees.length}</div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #ffaa00', textAlign: 'center' }}>
          <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 4 }}>Risque modere (CA &lt; 110% seuil)</div>
          <div style={{ fontWeight: 800, fontSize: 28, color: '#ffaa00' }}>{moderees.length}</div>
        </div>
      </div>

      {alertes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'rgba(0,214,143,0.05)', borderRadius: 12, border: '1px solid rgba(0,214,143,0.2)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>Aucune alerte</div>
          <div style={{ color: '#00d68f', fontWeight: 600 }}>Tous les PDVs sont bien au-dessus de leur seuil de grade</div>
        </div>
      ) : (
        <div className="card table-wrapper">
          <table>
            <thead>
              <tr><th>PDV</th><th>Zone</th><th>Grade</th><th>CA actuel</th><th>Seuil grade</th><th>% du seuil</th><th>Risque</th></tr>
            </thead>
            <tbody>
              {alertes.map((a, i) => (
                <tr key={i}>
                  <td><PDVCell nom={a.pdv_nom} numero={a.numero_pdv} /></td>
                  <td style={{ color: '#8a8a9a', fontSize: 12 }}>{a.zone}</td>
                  <td><span style={{ color: GRADE_META[a.grade]?.color, fontWeight: 700 }}>{GRADE_ICONS[a.grade]} {a.grade}</span></td>
                  <td style={{ color: '#FF6900', fontWeight: 700 }}>{formatCA(a.ca)} FCFA</td>
                  <td style={{ color: '#8a8a9a' }}>{formatCA(a.seuil_grade)} FCFA</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(a.pct_seuil, 100)}%`, height: '100%', background: a.risque === 'eleve' ? '#ff3d71' : '#ffaa00', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: a.risque === 'eleve' ? '#ff3d71' : '#ffaa00' }}>{a.pct_seuil}%</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: a.risque === 'eleve' ? 'rgba(255,61,113,0.15)' : 'rgba(255,170,0,0.15)',
                      color: a.risque === 'eleve' ? '#ff3d71' : '#ffaa00' }}>
                      {a.risque === 'eleve' ? 'Eleve' : 'Modere'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Helper: convertir seuils state -> query params ───────────────────────────
function buildParams(seuils) {
  return {
    s_diamant: seuils.diamant, s_or: seuils.or,
    s_argent: seuils.argent, s_fer: seuils.fer,
    ops_diamant: seuils.ops_diamant, ops_or: seuils.ops_or,
    ops_argent: seuils.ops_argent, ops_fer: seuils.ops_fer,
    ops_cuivre: seuils.ops_cuivre,
  };
}

// ── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────
const DEFAULT_SEUILS = {
  diamant: 1800000, or: 1200000, argent: 700000, fer: 300000, cuivre: 1,
  ops_diamant: 40, ops_or: 25, ops_argent: 15, ops_fer: 5, ops_cuivre: 1
};

export default function OngletGrades() {
  const [annee, setAnnee] = useState(NOW_YEAR);
  const [mois, setMois] = useState(NOW_MONTH);
  const [subTab, setSubTab] = useState('vue');
  const [seuils, setSeuils] = useState({ ...DEFAULT_SEUILS });

  const subTabs = [
    { key: 'vue',       label: 'Vue globale des grades' },
    { key: 'config',    label: 'Configurer les seuils' },
    { key: 'evolution', label: 'Evolution des grades' },
    { key: 'alertes',   label: 'Alertes degradation' },
  ];

  return (
    <div>
      <MonthPicker annee={annee} mois={mois} setAnnee={setAnnee} setMois={setMois} />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '4px' }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: subTab === t.key ? '#FF6900' : 'transparent',
              color: subTab === t.key ? '#fff' : '#8a8a9a', transition: 'all 0.2s'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'vue'       && <VueGlobaleGrades annee={annee} mois={mois} seuils={seuils} />}
      {subTab === 'config'    && <ConfigSeuils seuils={seuils} setSeuils={setSeuils} />}
      {subTab === 'evolution' && <EvolutionGrades annee={annee} mois={mois} seuils={seuils} />}
      {subTab === 'alertes'   && <AlertesDegradation annee={annee} mois={mois} seuils={seuils} />}
    </div>
  );
}
