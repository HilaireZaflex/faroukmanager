import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US').replace(/,/g, ' ') + ' F';
const pct = n => n == null ? '—' : Number(n).toFixed(1) + '%';

const TASK_TYPES = [
  { value: 'visite',       label: '👟 Visite terrain',   color: '#3b82f6' },
  { value: 'prospection',  label: '🔍 Prospection',       color: '#8b5cf6' },
  { value: 'activation',   label: '⚡ Activation PDV',    color: '#22c55e' },
  { value: 'recuperation', label: '💰 Récupération',      color: '#f59e0b' },
  { value: 'formation',    label: '📚 Formation',          color: '#06b6d4' },
  { value: 'kaabu',        label: '🎯 Activation KAABU',  color: '#f97316' },
  { value: 'autre',        label: '📝 Autre',             color: '#94a3b8' },
];

const TASK_STATUS = {
  en_attente: { label: '⏳ En attente',  color: '#f59e0b' },
  en_cours:   { label: '🔄 En cours',    color: '#3b82f6' },
  termine:    { label: '✅ Terminé',     color: '#22c55e' },
  annule:     { label: '❌ Annulé',      color: '#ef4444' },
};

const PRIORITE = {
  basse:    { label: '🔵 Basse',   color: '#94a3b8' },
  normale:  { label: '🟡 Normale', color: '#f59e0b' },
  haute:    { label: '🟠 Haute',   color: '#f97316' },
  urgente:  { label: '🔴 Urgente', color: '#ef4444' },
};

const card = (bg, border) => ({
  background: bg || 'rgba(255,255,255,0.04)',
  border: `1px solid ${border || 'rgba(255,255,255,0.08)'}`,
  borderRadius: 12, padding: 16,
});

// ── Barre de progression ───────────────────────────────────────────────────
function ProgressBar({ value, max = 100, color = '#3b82f6', height = 8 }) {
  const pct = Math.min(Math.round((value || 0) / Math.max(max, 1) * 100), 100);
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = '#3b82f6', icon }) {
  return (
    <div style={{ ...card(), borderLeft: `3px solid ${color}`, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ONGLET 1 — VUE D'ENSEMBLE
// ══════════════════════════════════════════════════════════════════════════
function OngletOverview({ period }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/developpeurs/overview?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Chargement...</div>;
  if (!data || data.nb_developpeurs === 0) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👨‍💼</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Aucun développeur trouvé</div>
      <div style={{ fontSize: 13 }}>Ajoutez des utilisateurs avec le rôle "Développeur" pour les voir ici.</div>
    </div>
  );

  const t = data.totaux;
  const devs = data.developpeurs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs globaux */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard label="Développeurs actifs" value={data.nb_developpeurs} color="#8b5cf6" icon="👨‍💼" />
        <KpiCard label="Prospects soumis" value={t.total_prospects} color="#3b82f6" icon="📋" sub={`Ce mois (${period})`} />
        <KpiCard label="PDVs activés" value={t.total_actives} color="#22c55e" icon="⚡" />
        <KpiCard label="Visites terrain" value={t.total_visites} color="#f59e0b" icon="👟" />
        <KpiCard label="Taux activation moyen" value={pct(t.taux_activation_moyen)} color="#f97316" icon="🎯" sub="Cible : 80%" />
        <KpiCard label="Taux récupération moyen" value={pct(t.taux_recuperation_moyen)} color="#06b6d4" icon="💰" sub="Cible : 75%" />
      </div>

      {/* Tableau des développeurs */}
      <div style={card()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>📊 Performance individuelle — {period}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Développeur', 'Zone', 'Prospects', 'Activés', 'Taux Act.', 'Visites', 'KAABU', 'Taux Récup.', 'Bonus estimé'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devs.map((d, i) => {
                const actColor = d.taux_activation >= d.taux_activation_cible ? '#22c55e' : d.taux_activation >= 60 ? '#f59e0b' : '#ef4444';
                const recColor = d.taux_recuperation >= d.taux_recuperation_cible ? '#22c55e' : d.taux_recuperation >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '10px', fontWeight: 600 }}>
                      <div>👨‍💼 {d.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.email}</div>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{d.zone}</td>
                    <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700 }}>{d.prospects_soumis}</td>
                    <td style={{ padding: '10px', textAlign: 'center', color: '#22c55e', fontWeight: 700 }}>{d.prospects_actives}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{ color: actColor, fontWeight: 700 }}>{pct(d.taux_activation)}</span>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>cible {d.taux_activation_cible}%</div>
                      <ProgressBar value={d.taux_activation} max={100} color={actColor} height={4} />
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{d.visites_effectuees}</td>
                    <td style={{ padding: '10px', textAlign: 'center', color: '#f97316', fontWeight: 700 }}>{d.activations_kaabu}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{ color: recColor, fontWeight: 700 }}>{pct(d.taux_recuperation)}</span>
                      <ProgressBar value={d.taux_recuperation} max={100} color={recColor} height={4} />
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmt(d.bonus_estime)}</td>
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

// ══════════════════════════════════════════════════════════════════════════
// ONGLET 2 — OBJECTIFS
// ══════════════════════════════════════════════════════════════════════════
function OngletObjectifs({ period }) {
  const [objectifs, setObjectifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [devs, setDevs] = useState([]);
  const [form, setForm] = useState({
    developpeur_id: '', date: `${period}-01`, period_type: 'monthly',
    objectif_prospects: 15, objectif_visites: 20, objectif_activations: 10,
    objectif_kaabu: 5, objectif_recuperations: 8,
    realise_prospects: 0, realise_visites: 0, realise_activations: 0,
    realise_kaabu: 0, realise_recuperations: 0,
    taux_activation_cible: 80, taux_recuperation_cible: 75,
    bonus_activation: 5000, bonus_objectif_atteint: 25000, notes: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/developpeurs/objectifs?period=${period}`)
      .then(r => setObjectifs(r.data.objectifs || []))
      .catch(() => setObjectifs([]))
      .finally(() => setLoading(false));
    api.get('/developpeurs/overview?period=' + period)
      .then(r => setDevs(r.data.developpeurs || []));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editId) {
        await api.put(`/developpeurs/objectifs/${editId}`, form);
      } else {
        await api.post('/developpeurs/objectifs', form);
      }
      setShowForm(false); setEditId(null); load();
    } catch (e) { alert('Erreur lors de la sauvegarde'); }
  };

  const startEdit = (obj) => {
    setForm({
      developpeur_id: obj.developpeur_id, date: obj.date || `${period}-01`,
      period_type: obj.period_type || 'monthly',
      objectif_prospects: obj.objectifs.prospects, objectif_visites: obj.objectifs.visites,
      objectif_activations: obj.objectifs.activations, objectif_kaabu: obj.objectifs.kaabu,
      objectif_recuperations: obj.objectifs.recuperations,
      realise_prospects: obj.realises.prospects, realise_visites: obj.realises.visites,
      realise_activations: obj.realises.activations, realise_kaabu: obj.realises.kaabu,
      realise_recuperations: obj.realises.recuperations,
      taux_activation_cible: obj.taux_activation_cible,
      taux_recuperation_cible: obj.taux_recuperation_cible,
      bonus_activation: obj.bonus_activation, bonus_objectif_atteint: obj.bonus_objectif_atteint,
      notes: obj.notes || '',
    });
    setEditId(obj.id); setShowForm(true);
  };

  const inp = (label, key, type = 'number', extra = {}) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }} {...extra} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>🎯 Objectifs développeurs — {period}</h3>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(f => ({ ...f, date: `${period}-01` })); }}
          style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>
          + Définir objectifs
        </button>
      </div>

      {showForm && (
        <div style={{ ...card('rgba(139,92,246,0.08)', '#8b5cf6'), marginBottom: 8 }}>
          <h4 style={{ margin: '0 0 16px', color: '#8b5cf6' }}>{editId ? '✏️ Modifier objectifs' : '➕ Nouveaux objectifs'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Développeur</label>
              <select value={form.developpeur_id} onChange={e => setForm(f => ({ ...f, developpeur_id: Number(e.target.value) }))}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
                <option value="">— Choisir —</option>
                {devs.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
            </div>
            {inp('Période', 'date', 'date')}
            {inp('Objectif Prospects', 'objectif_prospects')}
            {inp('Objectif Visites', 'objectif_visites')}
            {inp('Objectif Activations', 'objectif_activations')}
            {inp('Objectif KAABU', 'objectif_kaabu')}
            {inp('Objectif Récupérations', 'objectif_recuperations')}
            {inp('Réalisé Prospects', 'realise_prospects')}
            {inp('Réalisé Visites', 'realise_visites')}
            {inp('Réalisé Activations', 'realise_activations')}
            {inp('Réalisé KAABU', 'realise_kaabu')}
            {inp('Réalisé Récupérations', 'realise_recuperations')}
            {inp('Taux Act. cible (%)', 'taux_activation_cible')}
            {inp('Taux Récup. cible (%)', 'taux_recuperation_cible')}
            {inp('Bonus / Activation (FCFA)', 'bonus_activation')}
            {inp('Bonus objectif 100% (FCFA)', 'bonus_objectif_atteint')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>💾 Enregistrer</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Chargement...</div> : objectifs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Aucun objectif défini pour {period}. Cliquez sur "+ Définir objectifs".</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {objectifs.map(obj => {
            const g = obj.taux.global;
            const gColor = g >= 100 ? '#22c55e' : g >= 75 ? '#f59e0b' : '#ef4444';
            return (
              <div key={obj.id} style={card()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>👨‍💼 {obj.developpeur_nom}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{obj.date} · {obj.period_type}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: gColor }}>{pct(g)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Score global</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{fmt(obj.bonus_calcule)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bonus estimé</div>
                    </div>
                    <button onClick={() => startEdit(obj)} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>✏️ Modifier</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginTop: 14 }}>
                  {[
                    { key: 'prospects', label: '📋 Prospects', color: '#3b82f6' },
                    { key: 'visites', label: '👟 Visites', color: '#8b5cf6' },
                    { key: 'activations', label: '⚡ Activations', color: '#22c55e' },
                    { key: 'kaabu', label: '🎯 KAABU', color: '#f97316' },
                    { key: 'recuperations', label: '💰 Récupérations', color: '#f59e0b' },
                  ].map(({ key, label, color }) => {
                    const taux = obj.taux[key];
                    const tc = taux >= 100 ? '#22c55e' : taux >= 70 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={key} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          <span style={{ color }}>{obj.realises[key]}</span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {obj.objectifs[key]}</span>
                        </div>
                        <ProgressBar value={obj.realises[key]} max={obj.objectifs[key]} color={tc} />
                        <div style={{ fontSize: 11, color: tc, marginTop: 3, fontWeight: 600 }}>{pct(taux)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>🎯 Cible activation : <b style={{ color: '#f97316' }}>{obj.taux_activation_cible}%</b></span>
                  <span>💰 Cible récup. : <b style={{ color: '#06b6d4' }}>{obj.taux_recuperation_cible}%</b></span>
                  <span>⚡ Bonus/activ. : <b style={{ color: '#22c55e' }}>{fmt(obj.bonus_activation)}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ONGLET 3 — ATTRIBUTION D'ACTIONS
// ══════════════════════════════════════════════════════════════════════════
function OngletTaches({ period }) {
  const [taches, setTaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [devs, setDevs] = useState([]);
  const [pdvs, setPdvs] = useState([]);
  const [zones, setZones] = useState([]);
  const [filterDev, setFilterDev] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [assignMode, setAssignMode] = useState('pdv'); // 'pdv' ou 'zone'
  const [form, setForm] = useState({
    developpeur_id: '', pdv_id: '', zone: '', type_tache: 'visite',
    titre: '', description: '', priorite: 'normale',
    date_echeance: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
  });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDev) params.set('developpeur_id', filterDev);
    if (filterType) params.set('type_tache', filterType);
    if (filterStatus) params.set('status', filterStatus);
    api.get(`/developpeurs/taches?${params}`).then(r => setTaches(r.data.taches || [])).catch(() => setTaches([])).finally(() => setLoading(false));
    api.get(`/developpeurs/overview?period=${period}`).then(r => setDevs(r.data.developpeurs || []));
    api.get('/developpeurs/zones').then(r => setZones(r.data.zones || []));
    api.get('/developpeurs/pdvs-disponibles').then(r => setPdvs(r.data.pdvs || []));
  }, [period, filterDev, filterType, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.developpeur_id || !form.titre) { alert('Développeur et titre requis'); return; }
    const payload = { ...form, assigned_by_id: 1 };
    if (assignMode === 'zone') payload.pdv_id = null;
    else payload.zone = null;
    try {
      await api.post('/developpeurs/taches', payload);
      setShowForm(false); load();
    } catch { alert('Erreur lors de la création'); }
  };

  const updateStatus = async (id, status) => {
    await api.put(`/developpeurs/taches/${id}`, { status });
    load();
  };

  const inp = (label, key, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtres + bouton */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterDev} onChange={e => setFilterDev(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="">Tous les développeurs</option>
          {devs.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="">Tous les types</option>
          {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => setShowForm(true)} style={{ marginLeft: 'auto', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>
          + Attribuer une action
        </button>
      </div>

      {/* Formulaire d'attribution */}
      {showForm && (
        <div style={{ ...card('rgba(34,197,94,0.06)', '#22c55e') }}>
          <h4 style={{ margin: '0 0 16px', color: '#22c55e' }}>➕ Attribuer une action à un développeur</h4>

          {/* Mode d'attribution */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[{ v: 'pdv', l: '🏪 Par PDV spécifique' }, { v: 'zone', l: '🗺️ Par zone entière' }].map(({ v, l }) => (
              <button key={v} onClick={() => setAssignMode(v)}
                style={{ background: assignMode === v ? '#22c55e' : 'rgba(255,255,255,0.06)', color: assignMode === v ? '#fff' : 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            {/* Développeur */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Développeur *</label>
              <select value={form.developpeur_id} onChange={e => setForm(f => ({ ...f, developpeur_id: e.target.value }))}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
                <option value="">— Choisir —</option>
                {devs.map(d => <option key={d.id} value={d.id}>{d.nom} ({d.zone})</option>)}
              </select>
            </div>

            {/* PDV ou Zone */}
            {assignMode === 'pdv' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PDV cible</label>
                <select value={form.pdv_id} onChange={e => setForm(f => ({ ...f, pdv_id: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
                  <option value="">— Choisir PDV —</option>
                  {pdvs.map(p => <option key={p.id} value={p.id}>{p.nom} — {p.zone}</option>)}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Zone entière</label>
                <select value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
                  <option value="">— Choisir zone —</option>
                  {zones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            )}

            {/* Type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type d'action *</label>
              <select value={form.type_tache} onChange={e => setForm(f => ({ ...f, type_tache: e.target.value }))}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
                {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Priorité */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Priorité</label>
              <select value={form.priorite} onChange={e => setForm(f => ({ ...f, priorite: e.target.value }))}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}>
                {Object.entries(PRIORITE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            {inp('Titre *', 'titre')}
            {inp('Date échéance', 'date_echeance', 'date')}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginTop: 4 }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>✅ Attribuer</button>
            <button onClick={() => setShowForm(false)} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Liste des tâches */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Chargement...</div> : taches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Aucune tâche pour les filtres sélectionnés.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {taches.map(t => {
            const typeInfo = TASK_TYPES.find(tt => tt.value === t.type_tache) || TASK_TYPES[6];
            const statusInfo = TASK_STATUS[t.status] || TASK_STATUS.en_attente;
            const prioInfo = PRIORITE[t.priorite] || PRIORITE.normale;
            return (
              <div key={t.id} style={{ ...card(), borderLeft: `3px solid ${typeInfo.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ background: typeInfo.color + '22', color: typeInfo.color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{typeInfo.label}</span>
                      <span style={{ background: prioInfo.color + '22', color: prioInfo.color, borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>{prioInfo.label}</span>
                      <span style={{ background: statusInfo.color + '22', color: statusInfo.color, borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>{statusInfo.label}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.titre}</div>
                    {t.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{t.description}</div>}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span>👨‍💼 <b>{t.developpeur_nom}</b></span>
                      {t.pdv && <span>🏪 <b>{t.pdv.nom}</b> ({t.pdv.zone})</span>}
                      {t.zone && <span>🗺️ Zone <b>{t.zone}</b></span>}
                      {t.date_echeance && <span>📅 Échéance : <b>{new Date(t.date_echeance).toLocaleDateString('fr-FR')}</b></span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {t.status === 'en_attente' && (
                      <button onClick={() => updateStatus(t.id, 'en_cours')} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>▶ Démarrer</button>
                    )}
                    {t.status === 'en_cours' && (
                      <button onClick={() => updateStatus(t.id, 'termine')} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✅ Terminer</button>
                    )}
                    {t.status !== 'annule' && t.status !== 'termine' && (
                      <button onClick={() => updateStatus(t.id, 'annule')} style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>❌ Annuler</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ONGLET 4 — SUPERVISEURS: 3 PDVs/MOIS
// ══════════════════════════════════════════════════════════════════════════
function OngletSuperviseursPDV({ period }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/developpeurs/superviseurs-pdv-objectifs?period=${period}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Chargement...</div>;
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Erreur de chargement</div>;

  const { superviseurs, summary } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard label="Total superviseurs" value={summary.total_superviseurs} color="#8b5cf6" icon="👔" />
        <KpiCard label="Objectif atteint" value={summary.objectif_atteint} color="#22c55e" icon="✅" sub={`/${summary.total_superviseurs} superviseurs`} />
        <KpiCard label="PDVs remontés total" value={summary.total_pdvs_remontes} color="#3b82f6" icon="🏪" sub={`Ce mois (${period})`} />
        <KpiCard label="Objectif / Superviseur" value="3 PDVs" color="#f59e0b" icon="🎯" sub="Minimum mensuel" />
      </div>

      <div style={card()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>
          📊 Suivi objectif : 3 nouveaux PDVs / mois — {period}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {superviseurs.map(sup => {
            const taux = Math.min(sup.taux_completion, 100);
            const color = taux >= 100 ? '#22c55e' : taux >= 66 ? '#f59e0b' : '#ef4444';
            return (
              <div key={sup.superviseur_id} style={{ ...card('rgba(255,255,255,0.02)'), borderLeft: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>👔 {sup.superviseur_nom}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— Zone : {sup.zone}</span>
                      <span style={{ background: color + '22', color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{sup.statut}</span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <ProgressBar value={sup.nb_remontes} max={sup.objectif_pdvs} color={color} height={8} />
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        <b style={{ color }}>{sup.nb_remontes}</b> / {sup.objectif_pdvs} PDVs remontés
                      </div>
                    </div>
                    {sup.pdvs_details.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {sup.pdvs_details.map((p, i) => (
                          <span key={i} style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                            ✅ {p.nom} ({p.reference})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color }}>{sup.nb_remontes}/{sup.objectif_pdvs}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PDVs</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function OngletDeveloppeurs() {
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('2026-05');

  const tabs = [
    { id: 'overview',     label: '📊 Vue d\'ensemble' },
    { id: 'objectifs',    label: '🎯 Objectifs' },
    { id: 'taches',       label: '📋 Attribution d\'actions' },
    { id: 'superviseurs', label: '👔 Superviseurs (3 PDVs/mois)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>👨‍💼 Gestion des Développeurs</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Pilotage des développeurs terrain — Prospects · Activations · KAABU · Récupérations
          </p>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-primary)', fontSize: 13 }}>
          {['2026-01','2026-02','2026-03','2026-04','2026-05'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: tab === t.id ? '#8b5cf6' : 'var(--text-muted)',
              border: 'none', borderBottom: tab === t.id ? '2px solid #8b5cf6' : '2px solid transparent',
              padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, borderRadius: '8px 8px 0 0',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div>
        {tab === 'overview'     && <OngletOverview period={period} />}
        {tab === 'objectifs'    && <OngletObjectifs period={period} />}
        {tab === 'taches'       && <OngletTaches period={period} />}
        {tab === 'superviseurs' && <OngletSuperviseursPDV period={period} />}
      </div>
    </div>
  );
}
