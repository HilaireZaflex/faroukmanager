import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Upload } from 'lucide-react';
import indicatorService, { CATEGORY_LABELS, OUTCOME_LABELS } from '../services/indicatorService';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import './ProspectionPage.css';   // Réutilisation du même design
import {
  TabIndicatorView, TabCallCampaigns, TabFieldCampaigns,
  TabIndicatorAI, TabIndicatorEvolution, TabEvaluation, TabSettings,
} from './IndicatorsTabs';

// =============================================================================
// PAGE PRINCIPALE — Module Indicateurs
// =============================================================================
export default function IndicatorsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('liste');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState(null);
  const refresh = () => setRefreshKey(k => k + 1);

  const tabs = [
    { id: 'liste',         label: '📋 Liste & Création' },
    { id: 'vue',           label: '🎯 Vue par indicateur' },
    { id: 'campagnes',     label: '📞 Campagnes d\'appel' },
    { id: 'terrain',       label: '🚶 Campagnes terrain' },
    { id: 'ai',            label: '🤖 IA — Analyse' },
    { id: 'evolution',     label: '📈 Évolution & Compare' },
    { id: 'evaluation',    label: '👥 Évaluation' },
    { id: 'parametres',    label: '⚙️ Paramètres' },
  ];

  return (
    <div className="prospection-page">
      <div className="prospection-header">
        <h1>
          <span>📊 Indicateurs — Gestion intelligente du réseau Orange Mali</span>
          <small>Création libre · Suivi temps réel · Campagnes IA · Évaluation téléconseillères</small>
        </h1>
        <div className="header-actions">
          <button className="btn-secondary" onClick={refresh}><RefreshCw size={14}/> Actualiser</button>
        </div>
      </div>

      <div className="tabs-container mb-24">
        {tabs.map(t => (
          <button key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'liste'      && <TabListIndicators key={refreshKey}
            onSelect={(id) => { setSelectedIndicatorId(id); setActiveTab('vue'); }}/>}
        {activeTab === 'vue'        && <TabIndicatorView key={refreshKey}
            indicatorId={selectedIndicatorId} setIndicatorId={setSelectedIndicatorId}/>}
        {activeTab === 'campagnes'  && <TabCallCampaigns key={refreshKey}/>}
        {activeTab === 'terrain'    && <TabFieldCampaigns key={refreshKey}/>}
        {activeTab === 'ai'         && <TabIndicatorAI key={refreshKey}
            indicatorId={selectedIndicatorId} setIndicatorId={setSelectedIndicatorId}/>}
        {activeTab === 'evolution'  && <TabIndicatorEvolution key={refreshKey}/>}
        {activeTab === 'evaluation' && <TabEvaluation key={refreshKey}/>}
        {activeTab === 'parametres' && <TabSettings key={refreshKey}/>}
      </div>
    </div>
  );
}

// =============================================================================
// ONGLET 1 : LISTE & CRÉATION D'INDICATEURS
// =============================================================================
function TabListIndicators({ onSelect }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(null);

  const reload = () => {
    setLoading(true);
    indicatorService.globalStats()
      .then(setStats)
      .catch(e => alert(e.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  if (loading) return <div className="loading-state">Chargement…</div>;

  return (
    <>
      <div className="filters">
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={14}/> Créer un indicateur
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {stats.length} indicateur(s) actif(s)
        </span>
      </div>

      {/* Cartes indicateurs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {stats.map(s => {
          const color = s.color || 'var(--primary)';
          const active_pct = s.rate_pct;
          return (
            <div key={s.indicator_id}
              onClick={() => onSelect(s.indicator_id)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 16, cursor: 'pointer',
                borderLeft: `4px solid ${color}`,
                transition: 'var(--transition)',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>{s.icon || '📊'}</span>
                <div>
                  <b style={{ color: 'var(--text-primary)', fontSize: 15 }}>{s.name}</b>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {s.code} · {CATEGORY_LABELS[s.category]?.label || s.category}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color }}>
                    {active_pct}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {s.active}/{s.total_pdvs} PDV actifs
                  </div>
                </div>
                {s.target_pct && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Objectif</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {s.target_pct}%
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      color: s.gap_to_target > 0 ? 'var(--danger)' : 'var(--success)',
                    }}>
                      {s.gap_to_target > 0 ? `-${s.gap_to_target}%` : `+${Math.abs(s.gap_to_target || 0)}%`}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${active_pct}%`, height: '100%', background: color, transition: 'width 0.5s' }}/>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }}
                  onClick={(e) => { e.stopPropagation(); onSelect(s.indicator_id); }}>
                  📊 Voir détails
                </button>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }}
                  onClick={(e) => { e.stopPropagation(); setShowImport(s); }}>
                  <Upload size={11}/> Importer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && <CreateIndicatorModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }}/>}
      {showImport && <ImportXlsxModal indicator={showImport} onClose={() => setShowImport(null)} onSaved={() => { setShowImport(null); reload(); }}/>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL : Création d'indicateur
// ─────────────────────────────────────────────────────────────────────────────
function CreateIndicatorModal({ onClose, onSaved }) {
  const [d, setD] = useState({
    code: '', name: '', description: '', category: 'PRODUIT', icon: '📊',
    color: '#FF6900', method: 'MANUAL', metric_field: '', threshold_value: '',
    formula: '', period: 'MONTHLY', target_rate_pct: '', weight: 1,
  });
  const set = (k, v) => setD(s => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...d };
      payload.threshold_value = payload.threshold_value === '' ? null : parseFloat(payload.threshold_value);
      payload.target_rate_pct = payload.target_rate_pct === '' ? null : parseFloat(payload.target_rate_pct);
      await indicatorService.create(payload);
      onSaved();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>📊 Créer un nouvel indicateur</h2>
        <form onSubmit={submit}>
          <div className="modal-section">
            <h3>Identité</h3>
            <div className="form-grid">
              <label>Code (unique) *<input required value={d.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="ex: KAABU"/></label>
              <label>Nom complet *<input required value={d.name} onChange={e => set('name', e.target.value)}/></label>
              <label className="full">Description<textarea value={d.description} onChange={e => set('description', e.target.value)} style={{ minHeight: 50 }}/></label>
              <label>Icône (emoji)<input value={d.icon} onChange={e => set('icon', e.target.value)} maxLength={4}/></label>
              <label>Couleur<input type="color" value={d.color} onChange={e => set('color', e.target.value)}/></label>
              <label>Catégorie
                <select value={d.category} onChange={e => set('category', e.target.value)}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label>Période d'évaluation
                <select value={d.period} onChange={e => set('period', e.target.value)}>
                  <option value="DAILY">Journalier</option>
                  <option value="WEEKLY">Hebdomadaire</option>
                  <option value="MONTHLY">Mensuel</option>
                </select>
              </label>
            </div>
          </div>

          <div className="modal-section">
            <h3>Méthode de calcul</h3>
            <div className="form-grid">
              <label className="full">Mode
                <select value={d.method} onChange={e => set('method', e.target.value)}>
                  <option value="MANUAL">🔢 Manuel (saisie ou import)</option>
                  <option value="THRESHOLD">📊 Seuil sur métrique</option>
                  <option value="FORMULA">🔁 Formule personnalisée</option>
                </select>
              </label>
              {d.method === 'THRESHOLD' && (
                <>
                  <label>Champ métrique<input value={d.metric_field} onChange={e => set('metric_field', e.target.value)} placeholder="ex: ca_kaabu"/></label>
                  <label>Seuil<input type="number" value={d.threshold_value} onChange={e => set('threshold_value', e.target.value)} placeholder="ex: 10000"/></label>
                </>
              )}
              {d.method === 'FORMULA' && (
                <label className="full">Formule<textarea value={d.formula} onChange={e => set('formula', e.target.value)} placeholder="(ca / objectif) * 100 >= 50"/></label>
              )}
            </div>
          </div>

          <div className="modal-section">
            <h3>Objectifs</h3>
            <div className="form-grid">
              <label>Taux cible (%)<input type="number" value={d.target_rate_pct} onChange={e => set('target_rate_pct', e.target.value)} placeholder="70"/></label>
              <label>Poids (indicateur composé)<input type="number" step="0.1" value={d.weight} onChange={e => set('weight', e.target.value)}/></label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary">Créer l'indicateur</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL : Import Excel
// ─────────────────────────────────────────────────────────────────────────────
function ImportXlsxModal({ indicator, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [pdvCol, setPdvCol] = useState('numero_pdv');
  const [valueCol, setValueCol] = useState('valeur');
  const [activeCol, setActiveCol] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return alert('Sélectionnez un fichier');
    setBusy(true);
    try {
      const r = await indicatorService.importXlsx(indicator.indicator_id, file, periodKey,
        { pdv_col: pdvCol, value_col: valueCol, active_col: activeCol });
      alert(`✅ Import : créés ${r.created}, mis à jour ${r.updated}, ignorés ${r.skipped}`);
      onSaved();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>📥 Import Excel — {indicator.name}</h2>
        <form onSubmit={submit}>
          <div className="modal-section">
            <div className="form-grid">
              <label>Fichier Excel *<input type="file" accept=".xlsx,.xls" required onChange={e => setFile(e.target.files[0])}/></label>
              <label>Période (YYYY-MM)<input value={periodKey} onChange={e => setPeriodKey(e.target.value)} placeholder="2026-04"/></label>
              <label>Colonne PDV<input value={pdvCol} onChange={e => setPdvCol(e.target.value)}/></label>
              <label>Colonne valeur<input value={valueCol} onChange={e => setValueCol(e.target.value)}/></label>
              <label className="full">Colonne actif (optionnel, sinon calculé via seuil)<input value={activeCol} onChange={e => setActiveCol(e.target.value)} placeholder="actif (oui/non)"/></label>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
              💡 Le fichier doit avoir une colonne avec le n° de PDV et soit une colonne valeur (CA),
              soit une colonne booléenne (oui/non).
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Import…' : 'Importer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
