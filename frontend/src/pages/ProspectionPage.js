import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, RefreshCw, MapPin, User as UserIcon,
  CheckCircle, XCircle, Clock, Send, Search,
} from 'lucide-react';
import api from '../services/api';
import prospectService, { STATUS_LABELS } from '../services/prospectService';
import useAuthStore from '../store/authStore';
import './ProspectionPage.css';

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

// =============================================================================
// PAGE PRINCIPALE
// =============================================================================
export default function ProspectionPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('demandes');
  const [modalCreate, setModalCreate] = useState(false);
  const [modalDetail, setModalDetail] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  const isAdminOrRC = ['admin', 'rc', 'manager'].includes(user?.role);
  const isDev = user?.role === 'developpeur' || isAdminOrRC;

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
        {safeTab === 'workflow'   && <TabWorkflow key={refreshKey} onOpen={p => setModalDetail(p)} currentUser={user} onRefresh={refresh}/>}
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
function TabDemandes({ onOpen, currentUser, onRefresh }) {
  const [prospects, setProspects] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', search: '' });

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
      setProspects(list); setStats(st);
    } catch (e) {
      alert('Erreur : ' + (errMsg(e)));
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { reload(); }, [reload]);

  const canDelete = ['admin', 'manager', 'rc'].includes(currentUser?.role);

  const handleDelete = async (e, p) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer définitivement la demande ${p.reference} (${p.prenom} ${p.nom}) ?`)) return;
    try { await prospectService.delete(p.id); reload(); }
    catch (err) { alert('Erreur suppression : ' + errMsg(err)); }
  };

  return (
    <>
      {/* Légende étape */}
      <StepLegend
        step={1}
        title="Saisie des demandes"
        desc="Les superviseurs et développeurs soumettent les fiches de prospection. Le RC affectera ensuite chaque demande à un développeur pour visite terrain."
        next="➡️ Prochaine étape : Le RC affecte les demandes aux développeurs (onglet Workflow)"
        color="#0ea5e9"
      />

      {/* Stats */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <Stat label="Total" value={stats.total}/>
          <Stat label="🆕 Nouvelles" value={stats.nouvelles}/>
          <Stat label="🔍 En visite" value={stats.en_visite}/>
          <Stat label="✅ Validées Dev" value={stats.en_attente_rc}/>
          <Stat label="🟢 Approuvées RC" value={stats.puce_attribuees}/>
          <Stat label="⚡ Activées" value={stats.activees} variant="ok"/>
          <Stat label="🚫 Refusées" value={stats.refusees}/>
          <Stat label="⚠️ SLA en retard" value={stats.sla_en_retard} variant="warn"/>
          <Stat label="Taux activation" value={`${stats.taux_activation || 0}%`} variant="ok"/>
        </div>
      )}

      {/* Filtres */}
      <div className="filters">
        <Search size={14} color="var(--text-muted)"/>
        <input
          placeholder="Rechercher (réf, nom, téléphone, quartier)..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">— Tous statuts —</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
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
              {prospects.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Aucune demande trouvée.</td></tr>
              ) : prospects.map(p => {
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
function TabWorkflow({ onOpen, currentUser, onRefresh }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [workflowStep, setWorkflowStep] = useState('etape2');

  const isAdmin = ['admin', 'manager'].includes(currentUser?.role);
  const isRC = currentUser?.role === 'rc' || isAdmin;
  const isDev = currentUser?.role === 'developpeur' || isAdmin;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, devs] = await Promise.all([
        prospectService.list({ limit: 200 }),
        api.get('/auth/developers').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
      ]);
      setProspects(list);
      setUsers(devs);
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // /auth/developers retourne déjà uniquement les devs {id:"user_X"|"reseau_X", nom, prenom, zone, source}
  const developers = users;

  // Filtres par étape
  const nouvelles = prospects.filter(p => p.status === 'NOUVELLE' || p.status === 'REFUSEE_DEV');
  const enVisite = prospects.filter(p => p.status === 'EN_VISITE');
  const validesDev = prospects.filter(p => ['VALIDEE_DEV', 'EN_ATTENTE_RC'].includes(p.status));
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
  const st = STATUS_LABELS[p.status] || { label: p.status, color: '#94a3b8' };

  const submit = async () => {
    if (!devId) return;
    setBusy(true);
    try {
      // id peut être "user_X" ou "reseau_X"
      let payload;
      if (devId.startsWith('user_')) {
        payload = { developer_id: parseInt(devId.replace('user_', '')) };
      } else {
        const dev = developers.find(d => d.id === devId);
        payload = { developer_nom: `${dev?.nom || ''} ${dev?.prenom || ''}`.trim() };
      }
      await prospectService.assignVisit(p.id, payload);
      onDone();
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
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
  );
}

// ── Étape 3 : Développeurs valident ou rejettent après visite ─────────────────
function Etape3DecisionDev({ prospects, currentUser, onDone, onOpen }) {
  const isAdmin = ['admin', 'manager'].includes(currentUser?.role);

  // Séparer les validées et refusées (historique) des en attente
  const enAttente = prospects.filter(p =>
    isAdmin || p.visit_assigned_to?.id === currentUser?.id
  );

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
  const isAdmin = ['admin', 'manager'].includes(currentUser?.role);
  const isAssigned = p.visit_assigned_to?.id === currentUser?.id;
  const canDecide = isAdmin || isAssigned;

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
      onDone();
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setBusy(false); }
  };

  return (
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
  const st = STATUS_LABELS[p.status] || { label: p.status, color: '#94a3b8' };

  const decide = async (decision) => {
    setBusy(true);
    try {
      await prospectService.rcDecision(p.id, { decision, comment });
      onDone();
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setBusy(false); }
  };

  // Récupérer la dernière décision du dev depuis l'historique
  const devComment = p.history?.find(h => h.decision_type === 'DEV_DECISION')?.comment || '—';

  return (
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
            💬 <b>Avis du développeur :</b> {devComment}
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
  const [puceNumero, setPuceNumero] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!devId || !puceNumero) { alert('Veuillez sélectionner un développeur et saisir un numéro de puce.'); return; }
    setBusy(true);
    try {
      await prospectService.assignPuce(p.id, {
        activator_id: parseInt(devId),
        puce_numero: puceNumero,
      });
      onDone();
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 16, borderLeft: '4px solid #22c55e' }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.reference} — {p.prenom} {p.nom}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        📞 {p.telephone_principal} · 📍 {p.quartier || '—'}
      </div>
      <div className="action-bar">
        <input
          placeholder="N° de puce OM"
          value={puceNumero} onChange={e => setPuceNumero(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={devId} onChange={e => setDevId(e.target.value)} style={{ flex: 1 }}>
          <option value="">— Développeur activateur —</option>
          {developers.map(d => <option key={d.id} value={d.id}>{d.nom} {d.prenom || ''}{d.zone ? ` (${d.zone})` : ''}</option>)}
        </select>
        <button className="btn-primary" disabled={!devId || !puceNumero || busy} onClick={submit}>
          <Send size={12}/> {busy ? 'Attribution…' : 'Attribuer'}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// ONGLET 3 : ACTIVATION — Étape 6
// =============================================================================
function TabActivation({ currentUser, onRefresh }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const isAdmin = ['admin', 'manager'].includes(currentUser?.role);

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

function ActivationCard({ prospect: p, currentUser, onDone }) {
  const [form, setForm] = useState({
    gestionnaire: '',
    superviseur: '',
    teleconseillere: '',
    zone: '',
    sous_zone: '',
    quartier_pdv: p.quartier || '',
    comment: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.gestionnaire || !form.superviseur || !form.zone) {
      alert('Veuillez renseigner au minimum le gestionnaire, le superviseur et la zone.');
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
        quartier_pdv: form.quartier_pdv || null,
      });
      onDone();
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, borderLeft: '4px solid #f97316' }}>
      {/* En-tête prospect */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{p.reference} — {p.prenom} {p.nom}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          📞 {p.telephone_principal} · 📍 {p.quartier || '—'} · 🔑 Puce : <b>{p.puce_numero}</b>
        </div>
        {p.puce_assigned_to && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            👤 Dev activateur : <b>{p.puce_assigned_to.nom} {p.puce_assigned_to.prenom || ''}</b>
          </div>
        )}
      </div>

      {/* Formulaire attribution PDV */}
      <div style={{ background: 'rgba(249,115,22,0.06)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 10 }}>
          📋 Informations du Point de Vente (obligatoires pour créer le PDV)
        </div>
        <div className="form-grid">
          <label>Gestionnaire *
            <input value={form.gestionnaire} onChange={e => set('gestionnaire', e.target.value)}
              placeholder="Nom du gestionnaire"/>
          </label>
          <label>Superviseur *
            <input value={form.superviseur} onChange={e => set('superviseur', e.target.value)}
              placeholder="Nom du superviseur"/>
          </label>
          <label>Téléconseillère
            <input value={form.teleconseillere} onChange={e => set('teleconseillere', e.target.value)}
              placeholder="Nom de la téléconseillère"/>
          </label>
          <label>Zone *
            <input value={form.zone} onChange={e => set('zone', e.target.value)}
              placeholder="Ex: Zone Nord"/>
          </label>
          <label>Sous-zone
            <input value={form.sous_zone} onChange={e => set('sous_zone', e.target.value)}
              placeholder="Ex: Sous-zone Banconi"/>
          </label>
          <label>Quartier PDV
            <input value={form.quartier_pdv} onChange={e => set('quartier_pdv', e.target.value)}
              placeholder="Quartier du PDV"/>
          </label>
          <label className="full">Commentaire d'activation
            <input value={form.comment} onChange={e => set('comment', e.target.value)}
              placeholder="Observation terrain (optionnel)"/>
          </label>
        </div>
      </div>

      <button className="btn-primary" disabled={busy} onClick={submit}
        style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14, fontWeight: 700 }}>
        <CheckCircle size={16}/> {busy ? 'Activation en cours…' : '⚡ Confirmer l\'activation & créer le PDV'}
      </button>
    </div>
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
    pdv_adresse: '', pdv_nom_lieu: '',
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
      ['om_commission_mensuelle','om_ca_mensuel','capital_demarrage','latitude','longitude'].forEach(k => {
        payload[k] = payload[k] === '' ? null : parseFloat(payload[k]);
      });
      ['telephone_secondaire','quartier','adresse','piece_identite_numero',
       'om_ancienne_puce','om_raison_changement','source_financement',
       'pdv_adresse','pdv_nom_lieu','frequentation','notes'].forEach(k => {
        if (payload[k] === '') payload[k] = null;
      });
      if (!payload.piece_identite_type) payload.piece_identite_type = null;
      if (!payload.frequentation) payload.frequentation = null;
      if (typeof payload.concurrents === 'string' && payload.concurrents.trim()) {
        payload.concurrents = payload.concurrents.split(',').map(s => s.trim()).filter(Boolean);
      } else payload.concurrents = null;
      await prospectService.create(payload);
      onSaved();
    } catch (err) {
      alert('Erreur : ' + errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>🆕 Nouvelle demande de puce Orange Money</h2>
        <form onSubmit={submit}>
          <div className="modal-section">
            <h3><UserIcon size={12}/> Informations personnelles</h3>
            <div className="form-grid">
              <label>Nom *<input required value={data.nom} onChange={e => set('nom', e.target.value)}/></label>
              <label>Prénom *<input required value={data.prenom} onChange={e => set('prenom', e.target.value)}/></label>
              <label>Téléphone principal *<input required value={data.telephone_principal} onChange={e => set('telephone_principal', e.target.value)}/></label>
              <label>Téléphone secondaire<input value={data.telephone_secondaire} onChange={e => set('telephone_secondaire', e.target.value)}/></label>
              <label>Quartier<input value={data.quartier} onChange={e => set('quartier', e.target.value)}/></label>
              <label>Adresse<input value={data.adresse} onChange={e => set('adresse', e.target.value)}/></label>
              <label>Type pièce
                <select value={data.piece_identite_type} onChange={e => set('piece_identite_type', e.target.value)}>
                  <option value="">—</option>
                  <option value="CNI">CNI</option><option value="NINA">NINA</option>
                  <option value="PASSEPORT">Passeport</option><option value="PERMIS">Permis</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </label>
              <label>N° pièce<input value={data.piece_identite_numero} onChange={e => set('piece_identite_numero', e.target.value)}/></label>
            </div>
          </div>

          <div className="modal-section">
            <h3>💰 Historique Orange Money</h3>
            <label style={{ display:'flex', flexDirection:'row', gap:8, alignItems:'center', marginBottom:10, fontSize:13, color:'var(--text-primary)' }}>
              <input type="checkbox" checked={data.fait_om}
                onChange={e => set('fait_om', e.target.checked)}
                style={{ width:'auto', accentColor:'var(--primary)' }}/>
              Le prospect faisait déjà OM ?
            </label>
            {data.fait_om ? (
              <div className="form-grid">
                <label>Commission mensuelle (FCFA)<input type="number" value={data.om_commission_mensuelle} onChange={e => set('om_commission_mensuelle', e.target.value)}/></label>
                <label>CA moyen mensuel (FCFA)<input type="number" value={data.om_ca_mensuel} onChange={e => set('om_ca_mensuel', e.target.value)}/></label>
                <label>Ancienne puce (n°)<input value={data.om_ancienne_puce} onChange={e => set('om_ancienne_puce', e.target.value)}/></label>
                <label className="full">Raison du changement<textarea value={data.om_raison_changement} onChange={e => set('om_raison_changement', e.target.value)}/></label>
              </div>
            ) : (
              <div className="form-grid">
                <label>Capital de démarrage (FCFA, min 50 000)<input type="number" value={data.capital_demarrage} onChange={e => set('capital_demarrage', e.target.value)}/></label>
                <label>Source du financement<input value={data.source_financement} onChange={e => set('source_financement', e.target.value)}/></label>
              </div>
            )}
          </div>

          <div className="modal-section">
            <h3><MapPin size={12}/> Localisation du futur PDV</h3>
            <div className="form-grid">
              <label>Latitude<input type="number" step="any" value={data.latitude} onChange={e => set('latitude', e.target.value)}/></label>
              <label>Longitude<input type="number" step="any" value={data.longitude} onChange={e => set('longitude', e.target.value)}/></label>
              <div className="full">
                <button type="button" className="btn-secondary" onClick={captureGPS}>
                  <MapPin size={12}/> Capturer ma position GPS
                </button>
              </div>
              <label>Nom du lieu<input value={data.pdv_nom_lieu} onChange={e => set('pdv_nom_lieu', e.target.value)}/></label>
              <label>Adresse précise<input value={data.pdv_adresse} onChange={e => set('pdv_adresse', e.target.value)}/></label>
              <label>Type de local
                <select value={data.type_local} onChange={e => set('type_local', e.target.value)}>
                  <option value="BOUTIQUE_FIXE">Boutique fixe</option>
                  <option value="KIOSQUE">Kiosque</option>
                  <option value="TABLE">Table</option>
                  <option value="MOBILE">Mobile</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </label>
              <label>Fréquentation
                <select value={data.frequentation} onChange={e => set('frequentation', e.target.value)}>
                  <option value="">—</option>
                  <option value="TRES_FREQUENTE">Très fréquentée</option>
                  <option value="MOYENNE">Moyenne</option>
                  <option value="FAIBLE">Faible</option>
                </select>
              </label>
              <label className="full">Concurrents présents (séparés par virgules)
                <input value={data.concurrents} onChange={e => set('concurrents', e.target.value)} placeholder="Moov, Wave, Sama Money"/>
              </label>
            </div>
          </div>

          <div className="modal-section">
            <h3>📝 Notes</h3>
            <textarea value={data.notes} onChange={e => set('notes', e.target.value)}
              style={{ width:'100%', minHeight:70 }}/>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={busy}>
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <h2>{p.reference} — {p.prenom} {p.nom}</h2>
          <span className="status-badge" style={{ background: st.color }}>{st.label}</span>
        </div>

        <div className="modal-section">
          <h3>👤 Informations</h3>
          <div className="form-grid">
            <div><b>Téléphone</b> {p.telephone_principal} {p.telephone_secondaire && `/ ${p.telephone_secondaire}`}</div>
            <div><b>Quartier</b> {p.quartier || '—'}</div>
            <div><b>OM avant</b> {p.fait_om ? `Oui (CA ${p.om_ca_mensuel || '?'} F)` : `Non (Capital ${p.capital_demarrage || '?'} F)`}</div>
            <div><b>GPS</b> {p.latitude ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : <span style={{ color:'var(--danger)' }}>⚠ manquant</span>}</div>
            <div><b>Soumis par</b> {p.submitted_by ? `${p.submitted_by.nom} ${p.submitted_by.prenom||''}` : '—'}</div>
            <div><b>Tentatives visite</b> {p.visit_attempts}</div>
            <div className="full"><b>Type local / Fréquentation</b> {p.type_local || '—'} · {p.frequentation || '—'}</div>
          </div>
        </div>

        <div className="modal-section">
          <h3>📜 Historique ({p.history?.length || 0})</h3>
          {(p.history || []).map(h => (
            <div key={h.id} className="history-item">
              <div className="when">{new Date(h.created_at).toLocaleString('fr-FR')}</div>
              <div className="what">{h.decision_type} · {h.from_status || '—'} → {h.to_status || '—'}</div>
              {h.comment && <div style={{ fontSize:13, color:'var(--text-secondary)', marginTop:4, fontStyle:'italic' }}>« {h.comment} »</div>}
              <div className="who">par {h.user ? `${h.user.nom} ${h.user.prenom||''}` : 'système'}</div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
