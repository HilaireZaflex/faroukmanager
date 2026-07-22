import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, RefreshCw, MapPin, User as UserIcon,
  CheckCircle, XCircle, Clock, Send, Search,
} from 'lucide-react';
import api from '../services/api';
import prospectService, { STATUS_LABELS } from '../services/prospectService';
import useAuthStore from '../store/authStore';
import useNotifStore from '../store/notifStore';
import './ProspectionPage.css';

// ─── Modale de confirmation personnalisée ────────────────────────────────────
function ConfirmDeleteModal({ prospect, onConfirm, onCancel }) {
  const st = STATUS_LABELS[prospect.status];
  const enCours = !['NOUVELLE', 'REFUSE', 'ACTIVE'].includes(prospect.status);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#1e1e2e', border: '1px solid #3f3f5a',
        borderRadius: 16, padding: '32px 36px', maxWidth: 480, width: '90%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        animation: 'fadeInScale 0.18s ease',
      }}>
        {/* Icône */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: '50%',
            background: enCours ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
            fontSize: 28,
          }}>
            {enCours ? '⚠️' : '🗑️'}
          </div>
        </div>

        {/* Titre */}
        <h3 style={{
          textAlign: 'center', margin: '0 0 8px',
          color: enCours ? '#fbbf24' : '#ef4444',
          fontSize: 18, fontWeight: 700,
        }}>
          {enCours ? 'Suppression forcée' : 'Supprimer la demande'}
        </h3>

        {/* Référence prospect */}
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, margin: '0 0 20px' }}>
          <b style={{ color: '#e2e8f0' }}>{prospect.reference}</b> — {prospect.prenom} {prospect.nom}
        </p>

        {/* Avertissement si en cours */}
        {enCours && (
          <div style={{
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13,
          }}>
            <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>
              Demande en cours : <span style={{ color: '#fff' }}>{st?.label || prospect.status}</span>
            </div>
            <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
              Cette demande est actuellement dans le workflow. La supprimer effacera
              <b style={{ color: '#e2e8f0' }}> toutes les notifications associées</b> chez tous les utilisateurs.
            </div>
          </div>
        )}

        {/* Message simple si pas en cours */}
        {!enCours && (
          <div style={{
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 20,
            color: '#94a3b8', fontSize: 13, lineHeight: 1.6,
          }}>
            Cette action est <b style={{ color: '#ef4444' }}>irréversible</b>. La demande et toutes ses données seront définitivement supprimées.
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid #3f3f5a',
            background: 'transparent', color: '#94a3b8', fontWeight: 600,
            fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
          }}
            onMouseOver={e => { e.target.style.background='#2a2a3e'; e.target.style.color='#e2e8f0'; }}
            onMouseOut={e => { e.target.style.background='transparent'; e.target.style.color='#94a3b8'; }}>
            Annuler
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
            background: enCours ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : '#ef4444',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(239,68,68,0.35)', transition: 'opacity 0.15s',
          }}
            onMouseOver={e => e.target.style.opacity='0.85'}
            onMouseOut={e => e.target.style.opacity='1'}>
            {enCours ? '🗑️ Supprimer quand même' : '🗑️ Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Utilitaire d'extraction d'erreur robuste
const errMsg = (e) => {
  if (!e) return 'Erreur inconnue';
  const d = e.response?.data;
  if (typeof d === 'string') return d;
  if (d?.detail) return typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail);
  if (d?.message) return d.message;
  if (e.message) return e.message;
  return JSON.stringify(e);
};

// Popup de succès entre étapes
function SuccessModal({ title, message, next, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
        <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>{title}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>{message}</p>
        {next && (
          <div style={{
            background: 'rgba(16,185,129,0.08)', borderLeft: '4px solid var(--success)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 20, textAlign: 'left',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>➡️ Prochaine étape</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{next}</div>
          </div>
        )}
        <button className="btn-primary" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
          Compris !
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// PAGE PRINCIPALE
// =============================================================================
export default function ProspectionPage() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  // Lecture des query params depuis les notifications (?tab=workflow&step=etape3)
  const tabFromUrl = searchParams.get('tab') || 'demandes';
  const stepFromUrl = searchParams.get('step') || null;
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [modalCreate, setModalCreate] = useState(false);
  const [modalDetail, setModalDetail] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  // Quand l'URL change (navigation depuis notif), mettre à jour l'onglet ET le step
  useEffect(() => {
    if (tabFromUrl) setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  // Passer stepFromUrl au workflow via context si nécessaire
  const currentStepFromUrl = stepFromUrl;

  const isAdminOrRC = ['admin', 'rc', 'manager', 'ADMIN', 'RC', 'MANAGER'].includes(user?.role);
  const isDev = ['developpeur', 'DEVELOPPEUR', 'superviseur', 'SUPERVISEUR'].includes(user?.role) || isAdminOrRC;

  const allTabs = [
    { id: 'demandes',   label: '📋 Demandes',           show: true },
    { id: 'workflow',   label: '🔄 Workflow',            show: isAdminOrRC || isDev },
    { id: 'activation', label: '⚡ Activation',          show: true },
  ];
  const tabs = allTabs.filter(t => t.show);
  const safeTab = tabs.find(t => t.id === activeTab) ? activeTab : 'demandes';

  return (
    <div className="prospection-page">
      <div className="prospection-header">
        <h1>
          <span>📋 Prospection — Demandes de puce Orange Money</span>
          <small>Workflow collaboratif en 6 étapes · Superviseur → Dev → RC → Activation</small>
        </h1>
        <div className="header-actions">
          <button className="btn-secondary" onClick={refresh}><RefreshCw size={14}/> Actualiser</button>
          <button className="btn-primary" onClick={() => setModalCreate(true)}>
            <Plus size={16}/> Nouvelle demande
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs-container mb-24">
        {tabs.map(tab => (
          <button key={tab.id}
            className={`tab-btn ${safeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {safeTab === 'demandes'   && <TabDemandes key={refreshKey} onOpen={p => setModalDetail(p)} currentUser={user} onRefresh={refresh}/>}
        {safeTab === 'workflow'   && <TabWorkflow key={`${refreshKey}-${stepFromUrl}`} onOpen={p => setModalDetail(p)} currentUser={user} onRefresh={refresh} initialStep={stepFromUrl}/>}
        {safeTab === 'activation' && <TabActivation key={refreshKey} currentUser={user} onRefresh={refresh}/>}
      </div>

      {modalCreate && (
        <CreateProspectModal
          onClose={() => setModalCreate(false)}
          onSaved={() => { setModalCreate(false); refresh(); }}
        />
      )}
      {modalDetail && (
        <ProspectDetailModal
          prospectId={modalDetail.id}
          currentUser={user}
          onClose={() => setModalDetail(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// =============================================================================
// ONGLET 1 : DEMANDES — Liste complète de toutes les demandes
// =============================================================================
// Mapping KPI → statut pour filtrage par clic
const KPI_STATUS_MAP = {
  nouvelles:       'NOUVELLE',
  en_visite:       'EN_VISITE',
  en_attente_rc:   'VISITE_VALIDEE',
  puce_attribuees: 'PUCE_ATTRIBUEE',
  activees:        'PUCE_ACTIVEE',
  refusees:        'REFUSE',
};

function TabDemandes({ onOpen, currentUser, onRefresh }) {
  const [prospects, setProspects] = useState([]);
  const [allProspects, setAllProspects] = useState([]); // liste complète pour extraire superviseurs/devs
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', search: '', superviseur: '', developpeur: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const [list, st] = await Promise.all([
        prospectService.list(params),
        prospectService.stats(),
      ]);
      setAllProspects(list);
      setProspects(list);
      setStats(st);
    } catch (e) {
      alert('Erreur : ' + (errMsg(e)));
    } finally { setLoading(false); }
  }, [filters.status, filters.search]);

  useEffect(() => { reload(); }, [reload]);

  // Filtrage local par superviseur et développeur
  const filtered = allProspects.filter(p => {
    if (filters.superviseur && p.submitted_by?.role === 'superviseur' &&
        `${p.submitted_by?.nom} ${p.submitted_by?.prenom||''}`.toLowerCase() !== filters.superviseur.toLowerCase()) return false;
    if (filters.developpeur && p.visit_assigned_to &&
        `${p.visit_assigned_to?.nom} ${p.visit_assigned_to?.prenom||''}`.toLowerCase() !== filters.developpeur.toLowerCase()) return false;
    return true;
  });

  // Extraire superviseurs et développeurs uniques depuis la liste
  const superviseurs = [...new Set(allProspects
    .filter(p => p.submitted_by?.nom)
    .map(p => `${p.submitted_by.nom} ${p.submitted_by.prenom||''}`.trim())
  )].sort();
  const developpeurs = [...new Set(allProspects
    .filter(p => p.visit_assigned_to?.nom)
    .map(p => `${p.visit_assigned_to.nom} ${p.visit_assigned_to.prenom||''}`.trim())
  )].sort();

  const canDelete = ['admin', 'manager', 'rc'].includes(currentUser?.role);

  const handleDelete = (e, p) => { e.stopPropagation(); setConfirmDelete(p); };
  const doDelete = async () => {
    const p = confirmDelete;
    setConfirmDelete(null);
    try { await prospectService.delete(p.id); reload(); onRefresh && onRefresh(); }
    catch (err) { alert('Erreur suppression : ' + errMsg(err)); }
  };

  // Clic sur un KPI → filtre par statut correspondant
  const handleKpiClick = (kpiKey) => {
    const status = KPI_STATUS_MAP[kpiKey] || '';
    setFilters(f => ({ ...f, status: f.status === status ? '' : status }));
  };

  return (
    <>
      {confirmDelete && (
        <ConfirmDeleteModal prospect={confirmDelete} onConfirm={doDelete} onCancel={() => setConfirmDelete(null)}/>
      )}

      <StepLegend
        step={1}
        title="Saisie des demandes"
        desc="Les superviseurs et développeurs soumettent les fiches de prospection. Le RC affectera ensuite chaque demande à un développeur pour visite terrain."
        next="➡️ Prochaine étape : Le RC affecte les demandes aux développeurs (onglet Workflow)"
        color="#0ea5e9"
      />

      {/* KPIs cliquables */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          {[
            { key: 'total',           label: 'Total',            value: stats.total,                  variant: null },
            { key: 'nouvelles',       label: '🆕 Nouvelles',     value: stats.nouvelles,              variant: null },
            { key: 'en_visite',       label: '🔍 En visite',     value: stats.en_visite,              variant: null },
            { key: 'en_attente_rc',   label: '✅ Validées Dev',  value: stats.en_attente_rc,          variant: null },
            { key: 'puce_attribuees', label: '🟢 Approuvées RC', value: stats.puce_attribuees,        variant: null },
            { key: 'activees',        label: '⚡ Activées',      value: stats.activees,               variant: 'ok' },
            { key: 'refusees',        label: '🚫 Refusées',      value: stats.refusees,               variant: null },
            { key: 'sla_en_retard',   label: '⚠️ SLA retard',   value: stats.sla_en_retard,          variant: 'warn' },
            { key: 'taux_activation', label: 'Taux activation',  value: `${stats.taux_activation||0}%`, variant: 'ok' },
          ].map(({ key, label, value, variant }) => {
            const isClickable = !!KPI_STATUS_MAP[key];
            const isActive = filters.status === KPI_STATUS_MAP[key];
            return (
              <div key={key}
                onClick={() => isClickable && handleKpiClick(key)}
                style={{ cursor: isClickable ? 'pointer' : 'default', transition: 'all 0.15s',
                  outline: isActive ? '2px solid #FF6900' : 'none', borderRadius: 10,
                  transform: isActive ? 'scale(1.03)' : 'scale(1)',
                }}>
                <Stat label={label} value={value} variant={isActive ? 'ok' : variant}/>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtres sur une ligne */}
      <div className="filters" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <Search size={14} color="var(--text-muted)"/>
        <input
          placeholder="Rechercher (réf, nom, téléphone, quartier)..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={{ flex: 2, minWidth: 180 }}
        />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={{ flex: 1, minWidth: 130 }}>
          <option value="">— Tous statuts —</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={filters.superviseur} onChange={e => setFilters(f => ({ ...f, superviseur: e.target.value }))} style={{ flex: 1, minWidth: 130 }}>
          <option value="">— Superviseur —</option>
          {superviseurs.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.developpeur} onChange={e => setFilters(f => ({ ...f, developpeur: e.target.value }))} style={{ flex: 1, minWidth: 130 }}>
          <option value="">— Développeur —</option>
          {developpeurs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(filters.status || filters.search || filters.superviseur || filters.developpeur) && (
          <button onClick={() => setFilters({ status:'', search:'', superviseur:'', developpeur:'' })}
            style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, padding:'6px 12px', color:'#94a3b8', cursor:'pointer', fontSize:12, whiteSpace:'nowrap' }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* Compteur résultats */}
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        {filtered.length} demande{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
        {filters.status && <span style={{ color: '#FF6900', marginLeft: 6 }}>· filtrée par statut</span>}
        {filters.superviseur && <span style={{ color: '#FF6900', marginLeft: 6 }}>· superviseur: {filters.superviseur}</span>}
        {filters.developpeur && <span style={{ color: '#FF6900', marginLeft: 6 }}>· développeur: {filters.developpeur}</span>}
      </div>

      {/* Table */}
      {loading ? <div className="loading-state">Chargement…</div> : (
        <div className="prospects-table">
          <table>
            <thead>
              <tr>
                <th>Référence</th><th>Prospect</th><th>Téléphone</th>
                <th>Quartier</th><th>OM avant</th><th>Statut</th>
                <th>Soumis le</th>
                {canDelete && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Aucune demande trouvée.</td></tr>
              ) : filtered.map(p => {
                const st = STATUS_LABELS[p.status] || { label: p.status, color: '#94a3b8' };
                return (
                  <tr key={p.id} onClick={() => onOpen(p)}>
                    <td><b>{p.reference}</b></td>
                    <td>{p.prenom} {p.nom}</td>
                    <td>{p.telephone_principal}</td>
                    <td>{p.quartier || '—'}</td>
                    <td>{p.fait_om ? '✅ Oui' : '➖ Non'}</td>
                    <td><span className="status-badge" style={{ background: st.color }}>{st.label}</span></td>
                    <td>{new Date(p.submitted_at).toLocaleDateString('fr-FR')}</td>
                    {canDelete && (
                      <td onClick={e => e.stopPropagation()}>
                        <button onClick={e => handleDelete(e, p)}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// =============================================================================
// ONGLET 2 : WORKFLOW — Étapes 2 → 3 → 4 → 5
// =============================================================================
function TabWorkflow({ onOpen, currentUser, onRefresh, initialStep }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const isAdmin = ['admin', 'manager', 'ADMIN', 'MANAGER'].includes(currentUser?.role);
  const isRC = ['rc', 'RC'].includes(currentUser?.role) || isAdmin;
  const isDev = ['developpeur', 'DEVELOPPEUR', 'superviseur', 'SUPERVISEUR'].includes(currentUser?.role) || isAdmin;

  // Si navigation depuis notification, utiliser l'étape indiquée
  const defaultStep = initialStep || (isRC ? 'etape2' : 'etape3');
  const [workflowStep, setWorkflowStep] = useState(defaultStep);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await prospectService.list({ limit: 200 });
      setProspects(list);
      // /auth/developers est réservé au RC/admin — silencieux si 403
      try {
        const r = await api.get('/auth/developers');
        setUsers(Array.isArray(r.data) ? r.data : []);
      } catch (_) { setUsers([]); }
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // /auth/developers retourne déjà uniquement les devs {id:"user_X"|"reseau_X", nom, prenom, zone, source}
  const developers = users;

  // Filtres par étape
  const nouvelles = prospects.filter(p => p.status === 'NOUVELLE' || p.status === 'REFUSEE_DEV');
  const enVisite = prospects.filter(p => p.status === 'EN_VISITE');
  const validesDev = prospects.filter(p => ['VALIDEE_DEV', 'EN_ATTENTE_RC', 'REFUSEE_RC'].includes(p.status));
  const approuveesRC = prospects.filter(p => p.status === 'APPROUVEE_RC');

  const workflowTabs = [
    { id: 'etape2', label: '📤 Étape 2 — Attribution visite', count: nouvelles.length, show: isRC },
    { id: 'etape3', label: '🔍 Étape 3 — Décision Dev', count: enVisite.length, show: isDev },
    { id: 'etape4', label: '👔 Étape 4 — Validation RC', count: validesDev.length, show: isRC },
    { id: 'etape5', label: '📦 Étape 5 — Attribution activation', count: approuveesRC.length, show: isRC },
  ].filter(t => t.show);

  return (
    <>
      {/* Sous-menu étapes */}
      <div className="subtabs-container mb-24">
        {workflowTabs.map(t => (
          <button key={t.id}
            className={`subtab-btn ${workflowStep === t.id ? 'active' : ''}`}
            onClick={() => setWorkflowStep(t.id)}>
            {t.label}
            {t.count > 0 && <span style={{ marginLeft: 6, background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? <div className="loading-state">Chargement…</div> : (
        <>
          {workflowStep === 'etape2' && (
            <Etape2Attribution
              prospects={nouvelles}
              developers={developers}
              onDone={reload}
              onOpen={onOpen}
            />
          )}
          {workflowStep === 'etape3' && (
            <Etape3DecisionDev
              prospects={enVisite}
              currentUser={currentUser}
              onDone={reload}
              onOpen={onOpen}
            />
          )}
          {workflowStep === 'etape4' && (
            <Etape4ValidationRC
              prospects={validesDev}
              onDone={reload}
              onOpen={onOpen}
            />
          )}
          {workflowStep === 'etape5' && (
            <Etape5AttributionActivation
              prospects={approuveesRC}
              developers={developers}
              onDone={reload}
            />
          )}
        </>
      )}
    </>
  );
}

// ── Étape 2 : RC affecte les demandes NOUVELLES aux développeurs ──────────────
function Etape2Attribution({ prospects, developers, onDone, onOpen }) {
  return (
    <>
      <StepLegend
        step={2}
        title="Attribution aux développeurs pour visite terrain"
        desc="Le Responsable Commercial affecte chaque nouvelle demande à un développeur qui devra se rendre sur le terrain pour valider ou rejeter le lieu."
        next="➡️ Après attribution : le développeur effectue la visite et donne sa décision (Étape 3)"
        color="#f59e0b"
      />
      {prospects.length === 0 ? (
        <div className="empty-state">✅ Aucune demande en attente d'attribution.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prospects.map(p => <Attribution2Card key={p.id} prospect={p} developers={developers} onDone={onDone} onOpen={onOpen}/>)}
        </div>
      )}
    </>
  );
}

function Attribution2Card({ prospect: p, developers, onDone, onOpen }) {
  const [devId, setDevId] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const st = STATUS_LABELS[p.status] || { label: p.status, color: '#94a3b8' };
  const { fetchNotifications } = useNotifStore();

  const submit = async () => {
    if (!devId) return;
    setBusy(true);
    try {
      let payload;
      if (devId.startsWith('user_')) {
        payload = { developer_id: parseInt(devId.replace('user_', '')) };
      } else {
        const dev = developers.find(d => d.id === devId);
        payload = { developer_nom: `${dev?.nom || ''} ${dev?.prenom || ''}`.trim() };
      }
      await prospectService.assignVisit(p.id, payload);
      fetchNotifications(); // fetch immédiat après action
      setSuccess(true);
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      {success && (
        <SuccessModal
          title="Développeur affecté !"
          message={`Le prospect ${p.reference} — ${p.prenom} ${p.nom} a bien été assigné pour visite terrain.`}
          next="Le développeur doit maintenant effectuer la visite et donner sa décision (Étape 3 — Décision Dev)."
          onClose={() => { setSuccess(false); onDone(); }}
        />
      )}
      <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 16, borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.reference} — {p.prenom} {p.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              📞 {p.telephone_principal} · 📍 {p.quartier || '—'} · {p.fait_om ? '✅ OM avant' : '🆕 Nouveau'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Soumis le {new Date(p.submitted_at).toLocaleDateString('fr-FR')}
              {p.type_local && ` · ${p.type_local}`}
            </div>
            {p.notes && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                📝 {p.notes.substring(0, 120)}{p.notes.length > 120 ? '…' : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span className="status-badge" style={{ background: st.color }}>{st.label}</span>
            <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => onOpen(p)}>
              🔍 Voir détails
            </button>
          </div>
        </div>
        <div className="action-bar" style={{ marginTop: 12 }}>
          <select value={devId} onChange={e => setDevId(e.target.value)} style={{ flex: 1 }}>
            <option value="">— Choisir un développeur —</option>
            {developers.length === 0 && <option disabled>Aucun développeur disponible</option>}
            {developers.map(d => (
              <option key={d.id} value={d.id}>
                {d.nom} {d.prenom || ''}{d.zone ? ` · ${d.zone}` : ''}{d.source === 'reseau' ? ' (Réseau)' : ''}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={!devId || busy} onClick={submit}>
            <Send size={12}/> {busy ? 'Attribution…' : 'Affecter pour visite'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Étape 3 : Développeurs valident ou rejettent après visite ─────────────────
function Etape3DecisionDev({ prospects, currentUser, onDone, onOpen }) {
  const isAdmin = ['admin', 'manager', 'ADMIN', 'MANAGER'].includes(currentUser?.role);

  // Le backend filtre déjà les prospects selon le rôle - on affiche tout ce qu'on reçoit
  // Seuls les prospects EN_VISITE sont pertinents pour l'étape 3
  const enAttente = prospects.filter(p => p.status === 'EN_VISITE');

  return (
    <>
      <StepLegend
        step={3}
        title="Décision du développeur après visite terrain"
        desc="Le développeur visite le lieu et valide ou rejette la demande avec une justification obligatoire. Les décisions sont visibles par le RC."
        next="➡️ Après décision : le RC reçoit la liste des prospects validés pour sa propre validation (Étape 4)"
        color="#10b981"
      />
      {enAttente.length === 0 ? (
        <div className="empty-state">✅ Aucune visite en attente de décision.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {enAttente.map(p => <Decision3Card key={p.id} prospect={p} currentUser={currentUser} onDone={onDone} onOpen={onOpen}/>)}
        </div>
      )}
    </>
  );
}

function Decision3Card({ prospect: p, currentUser, onDone, onOpen }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = ['admin', 'manager', 'ADMIN', 'MANAGER', 'rc', 'RC'].includes(currentUser?.role);
  const isAssignedById = p.visit_assigned_to?.id === currentUser?.id;
  // Vérifier aussi par nom dans les notes (cas dev réseau sans visit_assigned_to_id)
  const currentNomFull = `${currentUser?.prenom || ''} ${currentUser?.nom || ''}`.trim().toUpperCase();
  const currentNomInv = `${currentUser?.nom || ''} ${currentUser?.prenom || ''}`.trim().toUpperCase();
  const isAssignedByName = p.notes && (
    p.notes.toUpperCase().includes(currentNomFull) ||
    p.notes.toUpperCase().includes(currentNomInv)
  );
  // Le dev peut décider s'il est assigné (par ID ou par nom) ou s'il est admin/RC
  const canDecide = isAdmin || isAssignedById || isAssignedByName ||
    // Si le backend lui a déjà retourné ce prospect, c'est qu'il est assigné
    ['developpeur', 'DEVELOPPEUR', 'superviseur', 'SUPERVISEUR'].includes(currentUser?.role);

  const [success, setSuccess] = useState(null); // {approved: bool}
  const { fetchNotifications } = useNotifStore();

  const decide = async (approved) => {
    if (comment.trim().length < 3) { alert('Veuillez saisir un commentaire (min 3 caractères).'); return; }
    setBusy(true);
    try {
      await prospectService.devDecision(p.id, {
        approved,
        comment,
        latitude: p.latitude,
        longitude: p.longitude,
      });
      fetchNotifications(); // fetch immédiat après action
      setSuccess({ approved });
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setBusy(false); }
  };

  return (
    <>
      {success && (
        <SuccessModal
          title={success.approved ? '✅ Prospect validé !' : '❌ Prospect rejeté'}
          message={success.approved
            ? `Le prospect ${p.reference} — ${p.prenom} ${p.nom} a été validé après visite terrain.`
            : `Le prospect ${p.reference} — ${p.prenom} ${p.nom} a été rejeté. Le motif a été enregistré.`}
          next={success.approved
            ? "Le Responsable Commercial va examiner ce prospect et donner sa validation finale (Étape 4 — Validation RC)."
            : "Le Responsable Commercial sera notifié du rejet avec votre justification."}
          onClose={() => { setSuccess(null); onDone(); }}
        />
      )}
      <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 16, borderLeft: '4px solid #0ea5e9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.reference} — {p.prenom} {p.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              📞 {p.telephone_principal} · 📍 {p.quartier || '—'}
            </div>
            {p.visit_assigned_to && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                👤 Assigné à : <b>{p.visit_assigned_to.nom} {p.visit_assigned_to.prenom || ''}</b>
              </div>
            )}
          </div>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => onOpen(p)}>Voir détails</button>
        </div>
        {canDecide && (
          <>
            <textarea
              placeholder="Justification obligatoire (ex: lieu accessible, bon emplacement, zone concurrentielle…)"
              value={comment} onChange={e => setComment(e.target.value)}
              style={{ width: '100%', marginTop: 12, minHeight: 70, boxSizing: 'border-box' }}
            />
            <div className="action-bar" style={{ marginTop: 8 }}>
              <button className="btn-success" disabled={busy || comment.trim().length < 3} onClick={() => decide(true)}>
                <CheckCircle size={14}/> Valider le prospect
              </button>
              <button className="btn-danger" disabled={busy || comment.trim().length < 3} onClick={() => decide(false)}>
                <XCircle size={14}/> Rejeter le prospect
              </button>
            </div>
          </>
        )}
        {!canDecide && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            En attente de décision du développeur assigné.
          </div>
        )}
      </div>
    </>
  );
}

// ── Étape 4 : RC valide ou refuse les prospects validés par les devs ──────────
function Etape4ValidationRC({ prospects, onDone, onOpen }) {
  return (
    <>
      <StepLegend
        step={4}
        title="Validation finale par le Responsable Commercial"
        desc="Le RC examine les prospects validés par les développeurs et sélectionne les meilleurs pour activation. Seuls les prospects approuvés ici passeront à l'étape d'activation."
        next="➡️ Après validation RC : les prospects approuvés sont affectés pour activation (Étape 5)"
        color="#6366f1"
      />
      {prospects.length === 0 ? (
        <div className="empty-state">✅ Aucun prospect en attente de validation RC.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prospects.map(p => <Validation4Card key={p.id} prospect={p} onDone={onDone} onOpen={onOpen}/>)}
        </div>
      )}
    </>
  );
}

function Validation4Card({ prospect: p, onDone, onOpen }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const st = STATUS_LABELS[p.status] || { label: p.status, color: '#94a3b8' };
  const { fetchNotifications } = useNotifStore();

  const decide = async (decision) => {
    setBusy(true);
    try {
      await prospectService.rcDecision(p.id, { decision, comment });
      fetchNotifications(); // fetch immédiat après action
      setSuccess({ decision });
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  // Récupérer la dernière décision du dev depuis l'historique
  const devHistory = p.history?.find(h => ['DEV_VALIDATE', 'DEV_REJECT'].includes(h.decision_type));
  const devComment = devHistory?.comment || '—';
  const devDecision = devHistory?.decision_type === 'DEV_VALIDATE' ? '✅ Validé' : devHistory?.decision_type === 'DEV_REJECT' ? '❌ Rejeté' : '';

  return (
    <>
      {success && (
        <SuccessModal
          title={success.decision === 'approve' ? '✅ Prospect approuvé !' : success.decision === 'hold' ? '⏸️ Mis en attente' : '❌ Prospect refusé'}
          message={success.decision === 'approve'
            ? `Le prospect ${p.reference} — ${p.prenom} ${p.nom} a été approuvé par le RC.`
            : success.decision === 'hold'
            ? `Le prospect ${p.reference} a été mis en attente pour examen ultérieur.`
            : `Le prospect ${p.reference} a été refusé par le RC.`}
          next={success.decision === 'approve'
            ? "Attribuer ce prospect à un développeur pour l'activation de la puce (Étape 5 — Attribution activation)."
            : "Le prospect reste disponible pour un réexamen ultérieur."}
          onClose={() => { setSuccess(null); onDone(); }}
        />
      )}
      <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 16, borderLeft: '4px solid #6366f1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.reference} — {p.prenom} {p.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              📞 {p.telephone_principal} · 📍 {p.quartier || '—'} · {p.type_local || '—'}
            </div>
            {p.visit_assigned_to && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                👤 Visité par : <b>{p.visit_assigned_to.nom} {p.visit_assigned_to.prenom || ''}</b>
              </div>
            )}
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 6, fontSize: 12, borderLeft: '3px solid #10b981' }}>
              💬 <b>Avis du développeur {devDecision} :</b> {devComment}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span className="status-badge" style={{ background: st.color }}>{st.label}</span>
            <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => onOpen(p)}>Voir détails</button>
          </div>
        </div>
        <textarea
          placeholder="Commentaire RC (optionnel)..."
          value={comment} onChange={e => setComment(e.target.value)}
          style={{ width: '100%', marginTop: 12, minHeight: 60, boxSizing: 'border-box' }}
        />
        <div className="action-bar" style={{ marginTop: 8 }}>
          <button className="btn-success" disabled={busy} onClick={() => decide('approve')}>
            <CheckCircle size={14}/> Approuver
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => decide('hold')}>
            <Clock size={14}/> Mettre en attente
          </button>
          <button className="btn-danger" disabled={busy} onClick={() => decide('reject')}>
            <XCircle size={14}/> Refuser
          </button>
        </div>
      </div>
    </>
  );
}

// ── Étape 5 : RC affecte les prospects approuvés à des devs pour activation ───
function Etape5AttributionActivation({ prospects, developers, onDone }) {
  return (
    <>
      <StepLegend
        step={5}
        title="Attribution des prospects approuvés pour activation"
        desc="Le RC affecte chaque prospect approuvé à un développeur qui ira activer la puce sur le terrain. Un numéro de puce doit être attribué."
        next="➡️ Prochaine étape : Le développeur active la puce et renseigne les informations du PDV (onglet Activation)"
        color="#22c55e"
      />
      {prospects.length === 0 ? (
        <div className="empty-state">✅ Aucun prospect approuvé en attente d'attribution d'activation.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prospects.map(p => <Attribution5Card key={p.id} prospect={p} developers={developers} onDone={onDone}/>)}
        </div>
      )}
    </>
  );
}

function Attribution5Card({ prospect: p, developers, onDone }) {
  const [devId, setDevId] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const { fetchNotifications } = useNotifStore();

  const submit = async () => {
    if (!devId) { alert('Veuillez sélectionner un développeur.'); return; }
    setBusy(true);
    try {
      let payload = {};
      if (devId.startsWith('user_')) {
        payload.activator_id = parseInt(devId.replace('user_', ''));
      } else {
        const dev = developers.find(d => d.id === devId);
        payload.activator_nom = `${dev?.nom || ''} ${dev?.prenom || ''}`.trim();
      }
      await prospectService.assignPuce(p.id, payload);
      fetchNotifications();
      setSuccess(true);
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      {success && (
        <SuccessModal
          title="📦 Développeur assigné !"
          message={`Le développeur a été affecté pour l'activation du prospect ${p.reference} — ${p.prenom} ${p.nom}.`}
          next="Le développeur assigné doit maintenant se rendre sur le terrain pour activer la puce et renseigner les informations du PDV (onglet Activation)."
          onClose={() => { setSuccess(false); onDone(); }}
        />
      )}
      <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 16, borderLeft: '4px solid #22c55e' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.reference} — {p.prenom} {p.nom}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          📞 {p.telephone_principal} · 📍 {p.quartier || '—'}
        </div>
        <div className="action-bar">
          <select value={devId} onChange={e => setDevId(e.target.value)} style={{ flex: 1 }}>
            <option value="">— Choisir un développeur activateur —</option>
            {developers.map(d => <option key={d.id} value={d.id}>{d.nom} {d.prenom || ''}{d.zone ? ` (${d.zone})` : ''}</option>)}
          </select>
          <button className="btn-primary" disabled={!devId || busy} onClick={submit}>
            <Send size={12}/> {busy ? 'Attribution…' : 'Attribuer'}
          </button>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// ONGLET 3 : ACTIVATION — Étape 6
// =============================================================================
function TabActivation({ currentUser, onRefresh }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const isAdmin = ['admin', 'manager', 'ADMIN', 'MANAGER', 'rc', 'RC'].includes(currentUser?.role);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await prospectService.list({ status: 'PUCE_ATTRIBUEE', limit: 200 });
      setProspects(list);
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Filtrer selon le rôle
  const visible = isAdmin
    ? prospects
    : prospects.filter(p => p.puce_assigned_to?.id === currentUser?.id);

  return (
    <>
      <StepLegend
        step={6}
        title="Activation de la puce & création automatique du PDV"
        desc="Le développeur se rend sur le terrain, active la puce et renseigne toutes les informations du point de vente : gestionnaire, superviseur, téléconseillère, zone, sous-zone et quartier. Le PDV est créé automatiquement dans le menu Points de Vente."
        next="✅ Fin du processus : le PDV est créé et visible dans le menu Points de Vente."
        color="#f97316"
      />
      {loading ? <div className="loading-state">Chargement…</div> :
        visible.length === 0 ? (
          <div className="empty-state">✅ Aucune puce en attente d'activation.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {visible.map(p => <ActivationCard key={p.id} prospect={p} currentUser={currentUser} onDone={reload}/>)}
          </div>
        )
      }
    </>
  );
}

// Composants formulaire identiques à NouveauPDVModal (PDVsPage)
const AFL = ({ label, required, children }) => (
  <div style={{ marginBottom: 4 }}>
    <label style={{ fontSize: 10, color: '#FF6900', display:'block', marginBottom: 3, fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
      {label}{required && <span style={{ color:'#ff4757' }}> *</span>}
    </label>
    {children}
  </div>
);
const INPUT_STYLE = {
  width:'100%', padding:'8px 12px', borderRadius:8,
  border:'1px solid rgba(255,255,255,0.12)',
  background:'rgba(255,255,255,0.06)', color:'#fff',
  fontSize:'16px', /* 16px empêche le zoom auto sur iOS/Safari */
  outline:'none', boxSizing:'border-box',
  height:38, fontFamily:'inherit',
  appearance:'none', WebkitAppearance:'none',
};
const AFI = ({ placeholder, value, onChange, type='text', required }) => (
  <input type={type} placeholder={placeholder} value={value} onChange={onChange} required={required}
    style={INPUT_STYLE} />
);
const AFS = ({ value, onChange, children }) => (
  <select value={value} onChange={onChange}
    style={{ ...INPUT_STYLE, cursor:'pointer' }}>
    {children}
  </select>
);
const ASection = ({ title, icon, children, cols=2 }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:8, borderBottom:'1px solid rgba(255,105,0,0.2)' }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <span style={{ fontSize:12, fontWeight:800, color:'#FF6900', textTransform:'uppercase', letterSpacing:'1px' }}>{title}</span>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:10 }}>
      {children}
    </div>
  </div>
);

// ── Autocomplete PDV (Numéro Flotte) ────────────────────────────────────────
function PDVSearchInput({ value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);

  // Fermer si clic extérieur
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (!q || q.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/pdvs?search=${encodeURIComponent(q)}&limit=20`);
        const data = Array.isArray(res.data) ? res.data : [];
        setResults(data);
        setOpen(data.length > 0);
      } catch (e) { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  };

  const select = (pdv) => {
    setQuery(pdv.numero_pdv);
    onChange(pdv.numero_pdv, pdv);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Taper le N° PDV ou nom pour rechercher..."
          value={query}
          onChange={e => search(e.target.value)}
          style={{ ...INPUT_STYLE, paddingRight: 36 }}
        />
        {loading && (
          <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'#FF6900' }}>⏳</div>
        )}
        {!loading && query && (
          <div onClick={() => { setQuery(''); onChange('', null); setResults([]); setOpen(false); }}
            style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', cursor:'pointer', color:'#64748b', fontSize:16 }}>✕</div>
        )}
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#1e293b', border: '1px solid rgba(255,105,0,0.3)',
          borderRadius: 10, marginTop: 4, maxHeight: 260, overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {results.map(pdv => (
            <div key={pdv.id} onClick={() => select(pdv)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
                transition: 'background 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.background='rgba(255,105,0,0.12)'}
              onMouseOut={e => e.currentTarget.style.background='transparent'}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#FF6900' }}>{pdv.numero_pdv}</span>
                <span style={{ fontSize:10, color:'#64748b', background:'rgba(255,255,255,0.06)', borderRadius:4, padding:'2px 6px' }}>
                  {pdv.type_pdv}
                </span>
              </div>
              <div style={{ fontSize:12, color:'#e2e8f0', marginTop:2 }}>{pdv.nom}</div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>
                {pdv.zone || '—'} {pdv.sous_zone ? `· ${pdv.sous_zone}` : ''} {pdv.quartier ? `· ${pdv.quartier}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivationCard({ prospect: p, currentUser, onDone }) {
  const [form, setForm] = useState({
    // Gérant (pré-rempli depuis prospect)
    prenom: p.prenom || '', nom: p.nom || '',
    nationalite: '', date_naissance: '',
    type_piece: '', numero_piece: '', date_delivrance: '',
    domicile: '',
    telephone: p.telephone_principal || '',
    numero_personnel: p.telephone_secondaire || '',
    // PDV
    numero_pdv: p.puce_numero || '',
    type_pdv: 'RS', type_activite: '',
    adresse_pdv: p.adresse || '', date_activation: new Date().toISOString().split('T')[0],
    montant_activation: '',
    // Localisation
    zone: '', sous_zone: '', quartier: p.quartier || '',
    // Garant
    nom_garant: '', tel_garant: '',
    // Équipe
    developpeur: p.puce_assigned_to ? `${p.puce_assigned_to.nom} ${p.puce_assigned_to.prenom||''}`.trim() : '',
    tel_developpeur: '',
    gestionnaire: '', tel_gestionnaire: '',
    superviseur: '', tel_superviseur: '',
    teleconseillere: '', tel_teleconseillere: '',
    // Formations
    kaabu: false, nafama: false, omy: false, lbft: false,
    comment: '',
    piece_fichier: null,
  });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Charger équipe réseau (comme NouveauPDVModal)
  const { data: equipe } = useQuery('equipe-reseau-activation',
    () => api.get('/reseau/equipe').then(r => r.data).catch(() => ({ superviseurs:[], gestionnaires:[], developpeurs:[], teleconseilleres:[] })),
    { staleTime: 300000 }
  );
  const { data: zonesData } = useQuery('zones-activation',
    () => api.get('/pdvs/zones').then(r => r.data).catch(() => []),
    { staleTime: 300000 }
  );
  const zones = zonesData || [];

  // Sous-zones filtrées selon la zone sélectionnée
  const { data: sousZonesData } = useQuery(
    ['sous-zones-activation', form.zone],
    () => api.get(`/pdvs/sous-zones${form.zone ? `?zone=${encodeURIComponent(form.zone)}` : ''}`).then(r => r.data).catch(() => []),
    { staleTime: 60000, enabled: true }
  );

  const ATeamSelect = ({ label, nameKey, telKey, options=[] }) => (
    <AFL label={label}>
      <AFS value={form[nameKey]} onChange={e => {
        const nom = e.target.value;
        const found = options.find(o => o.nom === nom);
        setForm(f => ({ ...f, [nameKey]: nom, [telKey]: found?.telephone || '' }));
      }}>
        <option value="">-- Sélectionner --</option>
        {options.map(o => <option key={o.nom} value={o.nom}>{o.nom}</option>)}
      </AFS>
    </AFL>
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!form.numero_pdv || !form.zone) {
      alert('Numéro de puce (Flotte) et Zone sont obligatoires.');
      return;
    }
    setBusy(true);
    try {
      await prospectService.activate(p.id, {
        create_pdv: true,
        comment: form.comment || 'Puce activée sur le terrain',
        gestionnaire: form.gestionnaire,
        superviseur: form.superviseur,
        teleconseillere: form.teleconseillere || null,
        zone: form.zone,
        sous_zone: form.sous_zone || null,
        quartier_pdv: form.quartier || null,
        puce_numero: form.numero_pdv || null,
        // Données complètes gérant pour le PDV
        nom_gerant: `${form.prenom} ${form.nom}`.trim(),
        telephone: form.telephone,
        numero_personnel: form.numero_personnel,
        type_pdv: form.type_pdv,
        adresse: form.adresse_pdv,
        date_activation: form.date_activation || null,
        developpeur: form.developpeur,
        nom_garant: form.nom_garant,
        tel_garant: form.tel_garant,
      });
      setSuccess(true);
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setBusy(false); }
  };

  return (
    <>
      {success && (
        <SuccessModal
          title="⚡ Puce activée ! PDV créé !"
          message={`La puce du prospect ${p.reference} — ${p.prenom} ${p.nom} a été activée avec succès. Le Point de Vente a été créé automatiquement.`}
          next="✅ Fin du processus. Le nouveau PDV est maintenant visible dans le menu Points de Vente."
          onClose={() => { setSuccess(false); onDone(); }}
        />
      )}
      <div style={{
        background: 'linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)',
        border: '1px solid rgba(255,105,0,0.3)',
        borderRadius: 16, padding: '24px 28px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        marginBottom: 4,
      }}>
        {/* Header prospect */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, paddingBottom:16, borderBottom:'1px solid rgba(255,105,0,0.2)' }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#FF6900,#ff9500)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📋</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>FICHE DE RENSEIGNEMENTS</div>
            <div style={{ fontSize:11, color:'#FF6900', fontWeight:600, letterSpacing:'1px' }}>
              {p.reference} — {p.prenom} {p.nom} · 📞 {p.telephone_principal}
            </div>
          </div>
        </div>

        <form onSubmit={submit}>

          {/* SECTION 1 — Informations Gérant */}
          <ASection title="Informations du Gérant" icon="👤" cols={3}>
            <AFL label="Prénom"><AFI placeholder="Prénom" value={form.prenom} onChange={e=>set('prenom',e.target.value)} /></AFL>
            <AFL label="Nom"><AFI placeholder="Nom" value={form.nom} onChange={e=>set('nom',e.target.value)} /></AFL>
            <AFL label="Nationalité"><AFI placeholder="Nationalité" value={form.nationalite} onChange={e=>set('nationalite',e.target.value)} /></AFL>
            <AFL label="Date de naissance"><AFI type="date" value={form.date_naissance} onChange={e=>set('date_naissance',e.target.value)} /></AFL>
            <AFL label="Type de pièce">
              <AFS value={form.type_piece} onChange={e=>set('type_piece',e.target.value)}>
                <option value="">Sélectionner</option>
                <option value="CNI">CNI</option>
                <option value="Passeport">Passeport</option>
                <option value="Permis">Permis de conduire</option>
                <option value="Autre">Autre</option>
              </AFS>
            </AFL>
            <AFL label="Numéro de pièce"><AFI placeholder="N° pièce d'identité" value={form.numero_piece} onChange={e=>set('numero_piece',e.target.value)} /></AFL>
            <AFL label="Date de délivrance"><AFI type="date" value={form.date_delivrance} onChange={e=>set('date_delivrance',e.target.value)} /></AFL>
            <AFL label="Domicile"><AFI placeholder="Adresse domicile" value={form.domicile} onChange={e=>set('domicile',e.target.value)} /></AFL>
            {/* Upload pièce d'identité */}
            <AFL label={`Photo / Scan ${form.type_piece || 'Pièce'} d'identité`}>
              <div style={{
                border: '2px dashed rgba(255,105,0,0.3)', borderRadius: 8,
                padding: '10px 12px', cursor: 'pointer', textAlign: 'center',
                background: form.piece_fichier ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                transition: 'all 0.2s',
              }}
                onClick={() => document.getElementById('piece-upload').click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#FF6900'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor='rgba(255,105,0,0.3)'; }}
                onDrop={e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) set('piece_fichier', file);
                }}>
                <input id="piece-upload" type="file" accept="image/*,.pdf" style={{ display:'none' }}
                  onChange={e => { if (e.target.files[0]) set('piece_fichier', e.target.files[0]); }} />
                {form.piece_fichier ? (
                  <div style={{ fontSize:12, color:'#10b981', fontWeight:600 }}>
                    ✅ {form.piece_fichier.name}
                    <span style={{ color:'#64748b', marginLeft:8, fontWeight:400 }}>
                      ({(form.piece_fichier.size/1024).toFixed(0)} Ko)
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:'#64748b' }}>
                    📎 Cliquer ou glisser le fichier ici<br/>
                    <span style={{ fontSize:10 }}>JPG, PNG, PDF acceptés</span>
                  </div>
                )}
              </div>
            </AFL>
          </ASection>

          {/* SECTION 2 — Informations PDV */}
          <ASection title="Informations du PDV" icon="🏪" cols={3}>
            <AFL label="Numéro Flotte (PDV) *" required>
              <PDVSearchInput
                value={form.numero_pdv}
                onChange={(num, pdv) => {
                  setForm(f => ({
                    ...f,
                    numero_pdv: num,
                    zone: pdv?.zone || f.zone,
                    sous_zone: pdv?.sous_zone || f.sous_zone,
                    // Quartier : priorité au quartier du prospect (p.quartier), sinon PDV
                    quartier: p.quartier || pdv?.quartier || f.quartier,
                    type_pdv: pdv?.type_pdv || f.type_pdv,
                    gestionnaire: pdv?.gestionnaire || f.gestionnaire,
                    superviseur: pdv?.superviseur || f.superviseur,
                    teleconseillere: pdv?.teleconseillere || f.teleconseillere,
                    nom: pdv?.nom_gerant || f.nom,
                    telephone: pdv?.telephone || f.telephone,
                  }));
                }}
              />
            </AFL>
            <AFL label="N° Personnel"><AFI placeholder="N° Personnel gérant" value={form.numero_personnel} onChange={e=>set('numero_personnel',e.target.value)} /></AFL>
            <AFL label="Type de réseau">
              <AFS value={form.type_pdv} onChange={e=>set('type_pdv',e.target.value)}>
                <option value="RS">RS (Revendeur Spécial)</option>
                <option value="RSF">RSF</option>
                <option value="RNS">RNS</option>
                <option value="KIOSQUE">Kiosque</option>
                <option value="DEALER">Dealer</option>
              </AFS>
            </AFL>
            <AFL label="Type d'activité"><AFI placeholder="Ex: Commerce, Boutique..." value={form.type_activite} onChange={e=>set('type_activite',e.target.value)} /></AFL>
            <AFL label="Zone *" required>
              <AFS value={form.zone} onChange={e=>{ set('zone',e.target.value); set('sous_zone',''); }} required>
                <option value="">Sélectionner une zone</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </AFS>
            </AFL>
            <AFL label="Sous-Zone">
              <AFS value={form.sous_zone} onChange={e=>set('sous_zone',e.target.value)}>
                <option value="">Sélectionner une sous-zone</option>
                {(sousZonesData || []).map(sz => <option key={sz} value={sz}>{sz}</option>)}
              </AFS>
            </AFL>
            <AFL label="Quartier">
              <AFI
                placeholder="Quartier / Commune"
                value={form.quartier}
                onChange={e=>set('quartier',e.target.value)}
              />
              {p.quartier && form.quartier === p.quartier && (
                <div style={{ fontSize:10, color:'#10b981', marginTop:3 }}>✅ Pré-rempli depuis la demande</div>
              )}
            </AFL>
            <AFL label="Adresse PDV"><AFI placeholder="Adresse complète du PDV" value={form.adresse_pdv} onChange={e=>set('adresse_pdv',e.target.value)} /></AFL>
            <AFL label="Date d'activation"><AFI type="date" value={form.date_activation} onChange={e=>set('date_activation',e.target.value)} /></AFL>
            <AFL label="Montant d'activation (FCFA)"><AFI type="number" placeholder="0" value={form.montant_activation} onChange={e=>set('montant_activation',e.target.value)} /></AFL>
          </ASection>

          {/* SECTION 3 — Le Garant */}
          <ASection title="Le Garant" icon="🤝" cols={2}>
            <AFL label="Nom du Garant"><AFI placeholder="Nom complet du garant" value={form.nom_garant} onChange={e=>set('nom_garant',e.target.value)} /></AFL>
            <AFL label="Téléphone du Garant"><AFI placeholder="+223 XX XX XX XX" value={form.tel_garant} onChange={e=>set('tel_garant',e.target.value)} /></AFL>
          </ASection>

          {/* SECTION 4 — Équipe Réseau */}
          <ASection title="Équipe Réseau" icon="👥" cols={2}>
            <ATeamSelect label="Développeur" nameKey="developpeur" telKey="tel_developpeur" options={equipe?.developpeurs || []} />
            <AFL label="Tél. Développeur"><AFI placeholder="Auto-rempli ou saisir" value={form.tel_developpeur} onChange={e=>set('tel_developpeur',e.target.value)} /></AFL>
            <ATeamSelect label="Gestionnaire" nameKey="gestionnaire" telKey="tel_gestionnaire" options={equipe?.gestionnaires || []} />
            <AFL label="Tél. Gestionnaire"><AFI placeholder="Auto-rempli ou saisir" value={form.tel_gestionnaire} onChange={e=>set('tel_gestionnaire',e.target.value)} /></AFL>
            <ATeamSelect label="Superviseur" nameKey="superviseur" telKey="tel_superviseur" options={equipe?.superviseurs || []} />
            <AFL label="Tél. Superviseur"><AFI placeholder="Auto-rempli ou saisir" value={form.tel_superviseur} onChange={e=>set('tel_superviseur',e.target.value)} /></AFL>
            <ATeamSelect label="Téléconseillère" nameKey="teleconseillere" telKey="tel_teleconseillere" options={equipe?.teleconseilleres || []} />
            <AFL label="Tél. Téléconseillère"><AFI placeholder="Auto-rempli ou saisir" value={form.tel_teleconseillere} onChange={e=>set('tel_teleconseillere',e.target.value)} /></AFL>
          </ASection>

          {/* SECTION 5 — Formations */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:8, borderBottom:'1px solid rgba(255,105,0,0.2)' }}>
              <span style={{ fontSize:16 }}>🎓</span>
              <span style={{ fontSize:12, fontWeight:800, color:'#FF6900', textTransform:'uppercase', letterSpacing:'1px' }}>Formations Suivies</span>
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {[
                { key:'kaabu', label:'KAABU', color:'#00d68f', desc:'Formation Kaabu' },
                { key:'nafama', label:'NAFAMA', color:'#a29bfe', desc:'Formation Nafama' },
                { key:'omy', label:'OMY/ARNAQUE', color:'#FF6900', desc:'Formation OMY' },
                { key:'lbft', label:'LBFT', color:'#fd79a8', desc:'Formation LBFT' },
              ].map(s => (
                <div key={s.key} onClick={() => set(s.key, !form[s.key])}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderRadius:10, cursor:'pointer',
                    border:`2px solid ${form[s.key] ? s.color : 'rgba(255,255,255,0.08)'}`,
                    background: form[s.key] ? `${s.color}20` : 'rgba(255,255,255,0.03)',
                    transition:'all 0.2s', userSelect:'none' }}>
                  <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${s.color}`,
                    background: form[s.key] ? s.color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {form[s.key] && <span style={{ color:'#fff', fontSize:12, fontWeight:800 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color: form[s.key] ? s.color : '#aaa' }}>{s.label}</div>
                    <div style={{ fontSize:10, color:'#666' }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commentaire + Bouton */}
          <AFL label="Commentaire d'activation">
            <AFI placeholder="Observation terrain (optionnel)" value={form.comment} onChange={e=>set('comment',e.target.value)} />
          </AFL>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:16, marginTop:12, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            <button type="submit" disabled={busy}
              style={{ padding:'12px 32px', borderRadius:10, border:'none',
                background:'linear-gradient(135deg,#FF6900,#ff9500)', color:'#fff',
                fontSize:14, cursor:'pointer', fontWeight:700, opacity: busy ? 0.7 : 1,
                boxShadow:'0 4px 16px rgba(255,105,0,0.35)' }}>
              {busy ? '⏳ Activation en cours…' : '⚡ Confirmer l\'activation & créer le PDV'}
            </button>
          </div>

        </form>
      </div>
    </>
  );
}

// =============================================================================
// COMPOSANTS PARTAGÉS
// =============================================================================

function StepLegend({ step, title, desc, next, color }) {
  return (
    <div style={{
      background: `rgba(${hexToRgb(color)}, 0.07)`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 8, padding: '14px 18px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{
          background: color, color: '#fff', borderRadius: '50%',
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, flexShrink: 0,
        }}>{step}</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{desc}</div>
      <div style={{ fontSize: 12, color, fontWeight: 600 }}>{next}</div>
    </div>
  );
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '100,100,100';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

function Stat({ label, value, variant }) {
  return (
    <div className={`stat-card ${variant || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

// =============================================================================
// MODAL : Création d'un prospect
// =============================================================================
function CreateProspectModal({ onClose, onSaved }) {
  const [data, setData] = useState({
    nom: '', prenom: '', telephone_principal: '', telephone_secondaire: '',
    quartier: '', adresse: '',
    piece_identite_type: '', piece_identite_numero: '',
    fait_om: false,
    om_commission_mensuelle: '', om_ca_mensuel: '',
    om_ancienne_puce: '', om_raison_changement: '',
    capital_demarrage: '', source_financement: '',
    latitude: '', longitude: '',
    type_local: 'BOUTIQUE_FIXE',
    frequentation: '', concurrents: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const captureGPS = () => {
    if (!navigator.geolocation) return alert("Géolocalisation non disponible");
    navigator.geolocation.getCurrentPosition(
      pos => { set('latitude', pos.coords.latitude); set('longitude', pos.coords.longitude); },
      err => alert("Impossible : " + err.message),
      { enableHighAccuracy: true }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...data };
      // Convertir les champs numériques
      ['om_commission_mensuelle','om_ca_mensuel','capital_demarrage','latitude','longitude'].forEach(k => {
        payload[k] = payload[k] === '' || payload[k] === null ? null : parseFloat(payload[k]);
      });
      // Mettre les champs optionnels vides à null
      ['telephone_secondaire','quartier','adresse','piece_identite_numero',
       'om_ancienne_puce','om_raison_changement','source_financement',
       'frequentation','notes'].forEach(k => {
        if (payload[k] === '') payload[k] = null;
      });
      // Champs optionnels non envoyés si vides
      if (!payload.piece_identite_type) payload.piece_identite_type = null;
      if (!payload.frequentation) payload.frequentation = null;
      if (!payload.type_local) payload.type_local = 'BOUTIQUE_FIXE';
      // Concurrents : convertir string → array ou null
      if (typeof payload.concurrents === 'string' && payload.concurrents.trim()) {
        payload.concurrents = payload.concurrents.split(',').map(s => s.trim()).filter(Boolean);
      } else { payload.concurrents = null; }
      // Supprimer les champs non reconnus par le backend
      delete payload.piece_fichier;
      console.log('Payload envoyé:', payload); // Debug temporaire
      await prospectService.create(payload);
      onSaved();
    } catch (err) {
      console.error('Erreur create prospect:', err?.response?.data || err?.message || err);
      alert('Erreur : ' + errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 1000, overflowY: 'auto', padding: '16px',
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)',
        border: '1px solid rgba(255,105,0,0.3)',
        borderRadius: 16, width: '100%', maxWidth: 820,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        margin: '0 auto 80px auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,105,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#FF6900,#ff9500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🆕</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Nouvelle demande de puce Orange Money</div>
              <div style={{ fontSize: 11, color: '#FF6900', fontWeight: 600 }}>Remplissez les informations du prospect</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px 24px' }}>

          {/* SECTION 1 — Infos personnelles */}
          <ASection title="Informations personnelles" icon="👤" cols={2}>
            <AFL label="Nom *" required><AFI required placeholder="Nom de famille" value={data.nom} onChange={e=>set('nom',e.target.value)}/></AFL>
            <AFL label="Prénom *" required><AFI required placeholder="Prénom" value={data.prenom} onChange={e=>set('prenom',e.target.value)}/></AFL>
            <AFL label="Téléphone principal *" required><AFI required placeholder="7X XX XX XX" value={data.telephone_principal} onChange={e=>set('telephone_principal',e.target.value)}/></AFL>
            <AFL label="Téléphone secondaire"><AFI placeholder="7X XX XX XX" value={data.telephone_secondaire} onChange={e=>set('telephone_secondaire',e.target.value)}/></AFL>
            <AFL label="Quartier"><AFI placeholder="Quartier de résidence" value={data.quartier} onChange={e=>set('quartier',e.target.value)}/></AFL>
            <AFL label="Adresse"><AFI placeholder="Adresse complète" value={data.adresse} onChange={e=>set('adresse',e.target.value)}/></AFL>
          </ASection>

          {/* SECTION 2 — Historique OM */}
          <ASection title="Historique Orange Money" icon="💰" cols={2}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => set('fait_om', !data.fait_om)}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, border: `2px solid ${data.fait_om ? '#FF6900' : 'rgba(255,255,255,0.2)'}`,
                  background: data.fait_om ? '#FF6900' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {data.fait_om && <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>Le prospect faisait déjà Orange Money ?</span>
              </label>
            </div>
            {data.fait_om ? (<>
              <AFL label="Commission mensuelle (FCFA)"><AFI type="number" placeholder="0" value={data.om_commission_mensuelle} onChange={e=>set('om_commission_mensuelle',e.target.value)}/></AFL>
              <AFL label="CA moyen mensuel (FCFA)"><AFI type="number" placeholder="0" value={data.om_ca_mensuel} onChange={e=>set('om_ca_mensuel',e.target.value)}/></AFL>
              <AFL label="Ancienne puce (n°)"><AFI placeholder="N° ancienne puce" value={data.om_ancienne_puce} onChange={e=>set('om_ancienne_puce',e.target.value)}/></AFL>
              <AFL label="Raison du changement">
                <textarea value={data.om_raison_changement} onChange={e=>set('om_raison_changement',e.target.value)}
                  placeholder="Pourquoi changer de puce ?"
                  style={{ ...INPUT_STYLE, height: 'auto', minHeight: 70, resize: 'vertical' }}/>
              </AFL>
            </>) : (<>
              <AFL label="Capital de démarrage (FCFA, min 50 000)"><AFI type="number" placeholder="50000" value={data.capital_demarrage} onChange={e=>set('capital_demarrage',e.target.value)}/></AFL>
              <AFL label="Source du financement"><AFI placeholder="Personnel, famille, crédit..." value={data.source_financement} onChange={e=>set('source_financement',e.target.value)}/></AFL>
            </>)}
          </ASection>

          {/* SECTION 3 — Localisation PDV */}
          <ASection title="Localisation du futur PDV" icon="📍" cols={2}>
            <AFL label="Latitude"><AFI type="number" step="any" placeholder="12.3456" value={data.latitude} onChange={e=>set('latitude',e.target.value)}/></AFL>
            <AFL label="Longitude"><AFI type="number" step="any" placeholder="-8.0000" value={data.longitude} onChange={e=>set('longitude',e.target.value)}/></AFL>
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="button" onClick={captureGPS} style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,105,0,0.4)',
                background: 'rgba(255,105,0,0.1)', color: '#FF6900', fontWeight: 700,
                fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <MapPin size={14}/> Capturer ma position GPS
              </button>
            </div>
            <AFL label="Type de local">
              <AFS value={data.type_local} onChange={e=>set('type_local',e.target.value)}>
                <option value="BOUTIQUE_FIXE">Boutique fixe</option>
                <option value="KIOSQUE">Kiosque</option>
                <option value="TABLE">Table</option>
                <option value="MOBILE">Mobile</option>
                <option value="AUTRE">Autre</option>
              </AFS>
            </AFL>
            <AFL label="Fréquentation">
              <AFS value={data.frequentation} onChange={e=>set('frequentation',e.target.value)}>
                <option value="">—</option>
                <option value="TRES_FREQUENTE">Très fréquentée</option>
                <option value="MOYENNE">Moyenne</option>
                <option value="FAIBLE">Faible</option>
              </AFS>
            </AFL>
            <AFL label="Concurrents présents (séparés par virgules)" style={{ gridColumn: '1 / -1' }}>
              <AFI placeholder="Moov, Wave, Sama Money..." value={data.concurrents} onChange={e=>set('concurrents',e.target.value)}/>
            </AFL>
          </ASection>

          {/* SECTION 4 — Notes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:8, borderBottom:'1px solid rgba(255,105,0,0.2)' }}>
              <span style={{ fontSize:16 }}>📝</span>
              <span style={{ fontSize:12, fontWeight:800, color:'#FF6900', textTransform:'uppercase', letterSpacing:'1px' }}>Notes</span>
            </div>
            <textarea value={data.notes} onChange={e=>set('notes',e.target.value)}
              placeholder="Observations, remarques..."
              style={{ ...INPUT_STYLE, height: 'auto', minHeight: 70, resize: 'vertical' }}/>
          </div>

          {/* Footer boutons */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:16, borderTop:'1px solid rgba(255,255,255,0.06)', flexWrap:'wrap' }}>
            <button type="button" onClick={onClose} style={{
              padding:'10px 24px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)',
              background:'transparent', color:'#94a3b8', fontWeight:600, fontSize:14, cursor:'pointer',
            }}>Annuler</button>
            <button type="submit" disabled={busy} style={{
              padding:'10px 28px', borderRadius:10, border:'none',
              background:'linear-gradient(135deg,#FF6900,#ff9500)', color:'#fff',
              fontWeight:700, fontSize:14, cursor:'pointer', opacity: busy ? 0.7 : 1,
              boxShadow:'0 4px 16px rgba(255,105,0,0.35)',
              display:'flex', alignItems:'center', gap:8,
            }}>
              <Send size={14}/> {busy ? 'Soumission…' : 'Soumettre la demande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL : Détail prospect
// =============================================================================
function InfoChip({ icon, label, value, accent }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      background: accent ? `${accent}12` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent ? `${accent}30` : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 13, color: accent || '#e2e8f0', fontWeight: 600, lineHeight: 1.4 }}>
        {value}
      </div>
    </div>
  );
}

const DECISION_ICONS = {
  SUBMIT: '📤', ASSIGN_VISIT: '🔍', REASSIGN: '🔄',
  DEV_VALIDATE: '✅', DEV_REJECT: '❌', RC_APPROVE: '🟢',
  RC_HOLD: '⏸️', RC_REJECT: '🔴', PUCE_ASSIGN: '📦',
  PUCE_ACTIVATE: '⚡', CANCEL: '🚫',
};

function ProspectDetailModal({ prospectId, currentUser, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setP(await prospectService.get(prospectId)); }
    catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setLoading(false); }
  }, [prospectId]);

  useEffect(() => { reload(); }, [reload]);

  if (loading || !p) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="loading-state">Chargement…</div>
      </div>
    </div>
  );

  const st = STATUS_LABELS[p.status] || { label: p.status, color: '#94a3b8' };
  const gpsOk = p.latitude && p.longitude;
  const gpsUrl = gpsOk ? `https://maps.google.com/?q=${p.latitude},${p.longitude}` : null;
  const devNomFromNotes = (p.notes?.match(/\[Développeur affecté: (.+?)\]/) || [])[1];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{
        maxWidth: 680, width: '96vw', maxHeight: '92vh',
        overflowY: 'auto', background: '#0f172a',
        borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        padding: 0,
      }}>

        {/* HEADER */}
        <div style={{
          background: `linear-gradient(135deg, ${st.color}22, ${st.color}08)`,
          borderBottom: `1px solid ${st.color}33`,
          padding: '24px 28px 20px',
          position: 'relative',
        }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#94a3b8',
            fontSize: 14, fontWeight: 700,
          }}>✕</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{
              background: `${st.color}22`, border: `1px solid ${st.color}55`,
              color: st.color, borderRadius: 8, padding: '4px 12px',
              fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
            }}>{st.label}</span>
            <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
              Soumis le {new Date(p.submitted_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}
            </span>
            {p.visit_attempts > 0 && (
              <span style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>
                {p.visit_attempts} visite{p.visit_attempts > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', letterSpacing: -0.3 }}>
            {p.prenom} {p.nom}
          </div>
          <div style={{ fontSize: 13, color: st.color, fontWeight: 700, marginTop: 2 }}>
            {p.reference}
          </div>
        </div>

        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* SECTION LABEL */}
          {[
            { key: 'contact', label: 'Contact', icon: '📞' },
          ].map(() => null)}

          {/* CONTACT */}
          <div>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              📞 Contact — Localisation
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              <InfoChip icon="📱" label="Tel. principal" value={p.telephone_principal} accent="#0ea5e9"/>
              {p.telephone_secondaire && <InfoChip icon="📱" label="Tel. secondaire" value={p.telephone_secondaire}/>}
              <InfoChip icon="📍" label="Quartier" value={p.quartier}/>
              <InfoChip icon="🏘️" label="Adresse" value={p.adresse}/>
              {gpsOk ? (
                <div style={{
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                }} onClick={() => window.open(gpsUrl, '_blank')}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>📡 GPS</div>
                  <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 3 }}>
                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                  </div>
                  <div style={{ fontSize: 10, color: '#10b981', marginTop: 2, opacity: 0.7 }}>Ouvrir Maps →</div>
                </div>
              ) : (
                <InfoChip icon="📡" label="GPS" value="Non renseigne" accent="#ef4444"/>
              )}
            </div>
          </div>

          {/* PROFIL COMMERCIAL */}
          <div>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              💰 Profil Commercial
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              <InfoChip icon="🟠" label="Experience OM" value={p.fait_om ? 'A deja fait OM' : 'Nouveau client'} accent={p.fait_om ? '#10b981' : '#0ea5e9'}/>
              {p.fait_om && <InfoChip icon="📊" label="CA mensuel OM" value={p.om_ca_mensuel ? `${Number(p.om_ca_mensuel).toLocaleString('fr-FR')} FCFA` : '—'} accent="#f59e0b"/>}
              {!p.fait_om && <InfoChip icon="💵" label="Capital demarrage" value={p.capital_demarrage ? `${Number(p.capital_demarrage).toLocaleString('fr-FR')} FCFA` : '—'} accent="#a78bfa"/>}
              <InfoChip icon="🏪" label="Type de local" value={p.type_local}/>
              <InfoChip icon="👥" label="Frequentation" value={p.frequentation}/>
              <InfoChip icon="📈" label="Potentiel" value={p.potentiel}/>
            </div>
          </div>

          {/* WORKFLOW */}
          <div>
            <div style={{ fontSize: 11, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Suivi Workflow
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              <InfoChip icon="👤" label="Soumis par" value={p.submitted_by ? `${p.submitted_by.nom} ${p.submitted_by.prenom||''}` : '—'}/>
              <InfoChip icon="🔍" label="Dev assigne" value={p.visit_assigned_to ? `${p.visit_assigned_to.nom} ${p.visit_assigned_to.prenom||''}` : devNomFromNotes || '—'}/>
              {p.dev_decision_comment && <InfoChip icon="💬" label="Decision dev" value={p.dev_decision_comment} accent="#f59e0b"/>}
              {p.rc_decision_comment && <InfoChip icon="📋" label="Decision RC" value={p.rc_decision_comment} accent={st.color}/>}
              {p.puce_numero && <InfoChip icon="📦" label="N Puce OM" value={p.puce_numero} accent="#FF6900"/>}
              {p.notes && !p.notes.startsWith('[Développeur') && <InfoChip icon="📝" label="Notes" value={p.notes.substring(0, 100) + (p.notes.length > 100 ? '…' : '')}/>}
            </div>
          </div>

          {/* HISTORIQUE */}
          {p.history && p.history.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Historique ({p.history.length} etapes)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 19, top: 20, bottom: 20,
                  width: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1,
                }}/>
                {p.history.map(h => (
                  <div key={h.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingBottom: 14, position: 'relative' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      background: '#1e293b', border: '2px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, zIndex: 1,
                    }}>
                      {DECISION_ICONS[h.decision_type] || '•'}
                    </div>
                    <div style={{
                      flex: 1, background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10, padding: '10px 14px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                          {h.decision_type?.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: '#475569' }}>
                          {new Date(h.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                        {h.from_status ? `${h.from_status} → ` : ''}{h.to_status}
                        {h.user && <span style={{ marginLeft: 8 }}>· par <b style={{ color: '#94a3b8' }}>{h.user.nom} {h.user.prenom||''}</b></span>}
                      </div>
                      {h.comment && (
                        <div style={{
                          marginTop: 6, fontSize: 12, color: '#94a3b8',
                          fontStyle: 'italic', lineHeight: 1.5,
                          borderLeft: '2px solid rgba(255,105,0,0.4)', paddingLeft: 8,
                        }}>
                          « {h.comment} »
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FOOTER */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={{
              padding: '10px 24px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}>
              Fermer
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
