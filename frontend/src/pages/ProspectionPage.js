import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, RefreshCw, MapPin, Phone, User as UserIcon,
  CheckCircle, XCircle, Clock, Send, AlertTriangle, Search,
  List, Brain, ThumbsUp, TrendingUp, Copy,
  Map, BarChart3, Package, Activity, Bell, Trophy, Shield
} from 'lucide-react';
import api from '../services/api';
import prospectService, { STATUS_LABELS } from '../services/prospectService';
import useAuthStore from '../store/authStore';
import {
  TabCarte, TabReporting, TabStock, TabPostActivation,
  TabNotifications, TabGamification, TabAudit,
} from './ProspectionTabs';
import './ProspectionPage.css';

// =============================================================================
// PAGE PRINCIPALE - Module Prospection (puces Orange Money)
// =============================================================================
export default function ProspectionPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('liste');
  const [modalCreate, setModalCreate] = useState(false);
  const [modalDetail, setModalDetail] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  // Seuls admin et RC voient tous les onglets
  const isAdminOrRC = user?.role === 'admin' || user?.role === 'rc' || user?.role === 'manager';

  const allTabs = [
    { id: 'liste',         label: '📋 Liste & Workflow',       adminOnly: false },
    { id: 'ai',            label: '🤖 IA — Vue d\'ensemble',   adminOnly: true  },
    { id: 'carte',         label: '🗺️ Carte & Géoloc',         adminOnly: true  },
    { id: 'reporting',     label: '📊 Reporting & Analytics',  adminOnly: true  },
    { id: 'stock',         label: '📦 Stock de Puces',         adminOnly: true  },
    { id: 'postact',       label: '🎯 Suivi Post-Activation',  adminOnly: true  },
    { id: 'notifications', label: '🔔 Notifications & Comm',   adminOnly: true  },
    { id: 'gamification',  label: '🏆 Gamification',           adminOnly: true  },
    { id: 'audit',         label: '🔐 Audit & Conformité',     adminOnly: true  },
  ];

  const tabs = allTabs.filter(t => !t.adminOnly || isAdminOrRC);

  // Si l'onglet actif n'est plus visible (changement de rôle), revenir à liste
  const safeTab = tabs.find(t => t.id === activeTab) ? activeTab : 'liste';

  return (
    <div className="prospection-page">
      <div className="prospection-header">
        <h1>
          <span>📋 Prospection — Demandes de puce OM</span>
          <small>Workflow collaboratif Superviseur → Dev → RC → Activation · IA intégrée</small>
        </h1>
        <div className="header-actions">
          <button className="btn-secondary" onClick={refresh}><RefreshCw size={14}/> Actualiser</button>
          <button className="btn-primary" onClick={() => setModalCreate(true)}>
            <Plus size={16}/> Nouvelle demande
          </button>
        </div>
      </div>

      {/* Onglets filtrés selon le rôle */}
      <div className="tabs-container mb-24">
        {tabs.map((tab) => (
          <button key={tab.id}
            className={`tab-btn ${safeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {safeTab === 'liste' && (
          <TabListe key={refreshKey}
            onOpen={(p) => setModalDetail(p)}
            currentUser={user}
          />
        )}
        {safeTab === 'ai' && (
          <TabIA key={refreshKey} onOpen={(p) => setModalDetail(p)}/>
        )}
        {safeTab === 'carte'         && <TabCarte key={refreshKey} onOpen={(p) => setModalDetail(p)}/>}
        {safeTab === 'reporting'     && <TabReporting key={refreshKey}/>}
        {safeTab === 'stock'         && <TabStock key={refreshKey}/>}
        {safeTab === 'postact'       && <TabPostActivation key={refreshKey}/>}
        {safeTab === 'notifications' && <TabNotifications key={refreshKey}/>}
        {safeTab === 'gamification'  && <TabGamification key={refreshKey}/>}
        {safeTab === 'audit'         && <TabAudit key={refreshKey}/>}
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
          onChanged={() => { refresh(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// ONGLET 1 : Liste & Workflow (extrait du code initial)
// =============================================================================
function TabListe({ onOpen, currentUser }) {
  const [prospects, setProspects] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: '', search: '', assigned_to_me: false, submitted_by_me: false,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      if (filters.assigned_to_me) params.assigned_to_me = true;
      if (filters.submitted_by_me) params.submitted_by_me = true;
      const [list, st] = await Promise.all([
        prospectService.list(params),
        prospectService.stats(),
      ]);
      setProspects(list); setStats(st);
    } catch (e) {
      alert('Erreur de chargement : ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <>
      {stats && <StatsBar stats={stats}/>}
      <FiltersBar filters={filters} setFilters={setFilters}/>
      <ProspectsTable loading={loading} prospects={prospects} onOpen={onOpen} currentUser={currentUser} onDeleted={reload}/>
    </>
  );
}

// =============================================================================
// SOUS-COMPOSANTS
// =============================================================================
function StatsBar({ stats }) {
  return (
    <div className="stats-grid">
      <Stat label="Total" value={stats.total}/>
      <Stat label="🆕 Nouvelles" value={stats.nouvelles}/>
      <Stat label="🔍 En visite" value={stats.en_visite}/>
      <Stat label="⏳ En attente RC" value={stats.en_attente_rc}/>
      <Stat label="📦 Puce attribuée" value={stats.puce_attribuees}/>
      <Stat label="⚡ Activées" value={stats.activees} variant="ok"/>
      <Stat label="🚫 Refusées" value={stats.refusees}/>
      <Stat label="⚠️ SLA en retard" value={stats.sla_en_retard} variant="warn"/>
      <Stat label="Taux activation" value={`${stats.taux_activation || 0}%`} variant="ok"/>
      <Stat label="Délai moyen" value={stats.delai_moyen_activation_h ? `${stats.delai_moyen_activation_h} h` : '—'}/>
    </div>
  );
}
function Stat({ label, value, variant }) {
  return (
    <div className={`stat-card ${variant || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function FiltersBar({ filters, setFilters }) {
  return (
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
      <label>
        <input type="checkbox" checked={filters.assigned_to_me}
          onChange={e => setFilters(f => ({ ...f, assigned_to_me: e.target.checked }))}/>
        Affectés à moi
      </label>
      <label>
        <input type="checkbox" checked={filters.submitted_by_me}
          onChange={e => setFilters(f => ({ ...f, submitted_by_me: e.target.checked }))}/>
        Mes soumissions
      </label>
    </div>
  );
}

function ProspectsTable({ loading, prospects, onOpen, currentUser, onDeleted }) {
  if (loading) return <div className="loading-state">Chargement…</div>;
  if (!prospects.length) return (
    <div className="empty-state">Aucun prospect trouvé.</div>
  );
  const now = new Date();
  const canDelete = ['admin','manager','rc'].includes(currentUser?.role);

  const handleDelete = async (e, p) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer définitivement la demande ${p.reference} (${p.prenom} ${p.nom}) ?`)) return;
    try {
      await prospectService.delete(p.id);
      onDeleted && onDeleted();
    } catch (err) {
      alert('Erreur suppression : ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="prospects-table">
      <table>
        <thead>
          <tr>
            <th>Référence</th><th>Prospect</th><th>Téléphone</th>
            <th>Quartier</th><th>OM</th><th>Statut</th>
            <th>SLA</th><th>Soumis le</th>
            {canDelete && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {prospects.map(p => {
            const st = STATUS_LABELS[p.status] || { label: p.status, color: '#94a3b8' };
            const sla = nextSLA(p);
            const late = sla && new Date(sla) < now;
            return (
              <tr key={p.id} onClick={() => onOpen(p)}>
                <td><b>{p.reference}</b></td>
                <td>{p.prenom} {p.nom}</td>
                <td>{p.telephone_principal}</td>
                <td>{p.quartier || '—'}</td>
                <td>{p.fait_om ? '✅ Oui' : '➖ Non'}</td>
                <td>
                  <span className="status-badge" style={{ background: st.color }}>
                    {st.label}
                  </span>
                </td>
                <td className={late ? 'sla-warn' : ''}>
                  {sla ? new Date(sla).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '—'}
                  {late && <AlertTriangle size={12} style={{ marginLeft:4 }}/>}
                </td>
                <td>{new Date(p.submitted_at).toLocaleDateString('fr-FR')}</td>
                {canDelete && (
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleDelete(e, p)}
                      style={{ background:'#ef4444', color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:12 }}
                      title="Supprimer définitivement"
                    >
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
  );
}

function nextSLA(p) {
  if (p.status === 'EN_VISITE') return p.sla_visit_due_at;
  if (['VALIDEE_DEV','EN_ATTENTE_RC'].includes(p.status)) return p.sla_rc_due_at;
  if (p.status === 'PUCE_ATTRIBUEE') return p.sla_activation_due_at;
  return null;
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
      // nettoyer les vides / convertir nombres
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
      alert('Erreur : ' + (err.response?.data?.detail || err.message));
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
              <label>Latitude
                <input type="number" step="any" value={data.latitude} onChange={e => set('latitude', e.target.value)}/>
              </label>
              <label>Longitude
                <input type="number" step="any" value={data.longitude} onChange={e => set('longitude', e.target.value)}/>
              </label>
              <div className="full">
                <button type="button" className="btn-secondary" onClick={captureGPS}>
                  <MapPin size={12}/> Capturer ma position GPS
                </button>
                <small style={{ marginLeft:8, color:'var(--text-muted)' }}>(Obligatoire pour valider la fiche)</small>
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
// MODAL : Détail + actions workflow
// =============================================================================
function ProspectDetailModal({ prospectId, currentUser, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [aiReco, setAiReco] = useState(null);
  const [aiForecast, setAiForecast] = useState(null);
  const [aiDups, setAiDups] = useState([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await prospectService.get(prospectId);
      setP(data);
      // Charger les insights IA en parallèle (best-effort)
      Promise.all([
        prospectService.aiRecommendation(prospectId).catch(() => null),
        prospectService.aiForecast(prospectId).catch(() => null),
        prospectService.aiDuplicates(prospectId).catch(() => []),
      ]).then(([r, f, d]) => { setAiReco(r); setAiForecast(f); setAiDups(d); });
    } catch (e) { alert('Erreur : ' + (e.response?.data?.detail || e.message)); }
    finally { setLoading(false); }
  }, [prospectId]);

  useEffect(() => { reload(); }, [reload]);

  // Charger la liste des développeurs pour les sélecteurs (admin/manager/RC uniquement)
  useEffect(() => {
    const role = currentUser?.role;
    if (['admin','manager','rc'].includes(role)) {
      api.get('/auth/developers').then(r => setUsers(r.data)).catch(() => setUsers([]));
    }
  }, [currentUser]);

  if (loading || !p) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="loading-state" style={{ background:'transparent', border:'none' }}>Chargement…</div>
        </div>
      </div>
    );
  }

  const status = p.status;
  const role = currentUser?.role;
  const developers = users.filter(u => u.role === 'developpeur');
  const isAdmin = ['admin','manager'].includes(role);
  const isRC = role === 'rc' || isAdmin;
  const isSup = role === 'superviseur' || isAdmin;
  const isDev = role === 'developpeur' || isAdmin;
  const st = STATUS_LABELS[status] || { label: status, color:'#94a3b8' };

  const refresh = () => { reload(); onChanged?.(); };

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
            <div><b>Téléphone</b>📞 {p.telephone_principal} {p.telephone_secondaire && `/ ${p.telephone_secondaire}`}</div>
            <div><b>Quartier</b>{p.quartier || '—'}</div>
            <div><b>OM avant</b>{p.fait_om ? `Oui (CA ${p.om_ca_mensuel || '?'} F)` : `Non (Capital ${p.capital_demarrage || '?'} F)`}</div>
            <div><b>GPS</b>{p.latitude ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : <span style={{ color:'var(--danger)' }}>⚠ manquant</span>}</div>
            <div><b>Soumis par</b>{p.submitted_by ? `${p.submitted_by.nom} ${p.submitted_by.prenom||''}` : '—'}</div>
            <div><b>Tentatives visite</b>{p.visit_attempts}</div>
            <div className="full"><b>Type local / Fréquentation</b>
              {p.type_local || '—'} · {p.frequentation || '—'}
              {p.concurrents?.length ? ` · Concurrents: ${p.concurrents.join(', ')}` : ''}
            </div>
          </div>
        </div>

        {/* ── Insights IA ──────────────────────────────────────────── */}
        {aiReco && (
          <div className="modal-section" style={{ borderLeft:`3px solid ${aiReco.color}` }}>
            <h3>🤖 Insights IA</h3>
            <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:10 }}>
              <div style={{
                width:70, height:70, borderRadius:'50%',
                background:`conic-gradient(${aiReco.color} ${aiReco.score * 3.6}deg, rgba(255,255,255,0.06) 0)`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <div style={{
                  width:54, height:54, borderRadius:'50%', background:'#14141f',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                }}>
                  <div style={{ fontSize:18, fontWeight:800, color:aiReco.color }}>{aiReco.score}</div>
                  <div style={{ fontSize:9, color:'var(--text-muted)' }}>/100</div>
                </div>
              </div>
              <div style={{ flex:1 }}>
                <span className="status-badge" style={{ background: aiReco.color }}>
                  {aiReco.decision === 'GO' ? '🟢 GO recommandé' :
                   aiReco.decision === 'NO_GO' ? '🔴 NO-GO recommandé' :
                   '🟡 Investigation nécessaire'}
                </span>
                <div style={{ fontSize:13, color:'var(--text-secondary)', marginTop:6 }}>{aiReco.message}</div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <b style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase' }}>✨ Forces</b>
                {aiReco.strengths.map((f, i) => (
                  <div key={i} style={{ fontSize:12, color:'var(--text-primary)', marginTop:4 }}>
                    • {f.reason} <span style={{ color:'var(--success)' }}>(+{f.points}/{f.max})</span>
                  </div>
                ))}
              </div>
              <div>
                <b style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase' }}>⚠️ Faiblesses</b>
                {aiReco.weaknesses.map((f, i) => (
                  <div key={i} style={{ fontSize:12, color:'var(--text-primary)', marginTop:4 }}>
                    • {f.reason} <span style={{ color:'var(--warning)' }}>({f.points}/{f.max})</span>
                  </div>
                ))}
              </div>
            </div>

            {aiForecast && (
              <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                <b style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase' }}>📈 Projection CA 3 mois</b>
                <div style={{ display:'flex', gap:8, marginTop:6 }}>
                  {aiForecast.forecast.map(f => (
                    <div key={f.month} style={{ flex:1, padding:8, background:'rgba(255,255,255,0.03)', borderRadius:6, textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'var(--text-muted)' }}>Mois {f.month}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--success)' }}>
                        {(f.ca / 1000).toLocaleString('en-US').replace(/,/g, ' ')} kF
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
                  Total 3M projeté : <b style={{ color:'var(--success)' }}>{aiForecast.ca_total_3m.toLocaleString('en-US').replace(/,/g, ' ')} F</b> · Confiance : {aiForecast.confidence}
                </div>
              </div>
            )}

            {aiDups.length > 0 && (
              <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                <b style={{ fontSize:11, color:'var(--danger)', textTransform:'uppercase' }}>
                  ⚠ {aiDups.length} doublon(s) potentiel(s) détecté(s)
                </b>
                {aiDups.slice(0, 3).map(m => (
                  <div key={m.id} style={{ fontSize:12, color:'var(--text-primary)', marginTop:4 }}>
                    • <b>{m.prenom} {m.nom}</b> ({m.reference}) — {m.match_score}% — {m.reasons[0]}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Actions selon statut + rôle ──────────────────────────── */}
        <div className="modal-section">
          <h3>⚙️ Actions disponibles</h3>
          <ActionPanel
            prospect={p}
            developers={developers}
            isAdmin={isAdmin} isRC={isRC} isSup={isSup} isDev={isDev}
            currentUser={currentUser}
            onDone={refresh}
          />
        </div>

        {/* ── Historique ─────────────────────────────────────────── */}
        <div className="modal-section">
          <h3>📜 Historique ({p.history?.length || 0})</h3>
          {(p.history || []).map(h => (
            <div key={h.id} className="history-item">
              <div className="when">{new Date(h.created_at).toLocaleString('en-US').replace(/,/g, ' ')}</div>
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

function ActionPanel({ prospect: p, developers, isAdmin, isRC, isSup, isDev, currentUser, onDone }) {
  const [busy, setBusy] = useState(false);
  const wrap = async (fn) => {
    setBusy(true);
    try { await fn(); onDone(); }
    catch (e) { alert('Erreur : ' + (e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  // ── ASSIGN VISIT (RC et Admin uniquement — pas les superviseurs ni développeurs) ───────
  const [devId, setDevId] = useState('');
  const canAssign = (p.status === 'NOUVELLE' || p.status === 'REFUSEE_DEV') && (isRC || isAdmin);

  // ── DEV DECISION ─────────────────────
  const [devApproved, setDevApproved] = useState(true);
  const [devComment, setDevComment] = useState('');
  const canDevDecide = p.status === 'EN_VISITE' && isDev &&
    (currentUser?.role === 'admin' || p.visit_assigned_to?.id === currentUser?.id);

  const captureAndDecide = (approved) => {
    if (approved && (!p.latitude || !p.longitude)) {
      // Forcer la capture GPS lors de la validation
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await wrap(() => prospectService.devDecision(p.id, {
            approved, comment: devComment || (approved ? 'Validé après visite' : 'Refusé'),
            latitude: pos.coords.latitude, longitude: pos.coords.longitude,
          }));
        },
        () => alert('Géolocalisation obligatoire pour valider.')
      );
    } else {
      wrap(() => prospectService.devDecision(p.id, {
        approved, comment: devComment || (approved ? 'Validé après visite' : 'Refusé'),
      }));
    }
  };

  // ── RC DECISION ─────────────────────
  const [rcComment, setRcComment] = useState('');
  const canRC = ['VALIDEE_DEV','EN_ATTENTE_RC'].includes(p.status) && isRC;

  // ── ASSIGN PUCE ─────────────────────
  const [activatorId, setActivatorId] = useState('');
  const [puceNumero, setPuceNumero] = useState('');
  const canAssignPuce = p.status === 'APPROUVEE_RC' && isRC;

  // ── ACTIVATE ──────────────────────
  const canActivate = p.status === 'PUCE_ATTRIBUEE' && isDev &&
    (currentUser?.role === 'admin' || p.puce_assigned_to?.id === currentUser?.id);

  // ── CANCEL ──────────────────────
  const canCancel = !['PUCE_ACTIVEE','REFUSEE_RC','ANNULEE'].includes(p.status);

  return (
    <div>
      {canAssign && (
        <div style={{ marginBottom:14 }}>
          <b style={{ color:'var(--text-primary)', fontSize:13 }}>📤 Affecter à un développeur :</b>
          <div className="action-bar">
            <select value={devId} onChange={e => setDevId(e.target.value)}>
              <option value="">— choisir un développeur —</option>
              {developers.map(d => <option key={d.id} value={d.id}>{d.nom} {d.prenom||''}{d.zone ? ` (${d.zone})` : ''}</option>)}
            </select>
            <button className="btn-primary" disabled={!devId || busy}
              onClick={() => {
                const payload = devId.toString().startsWith('reseau_')
                  ? { developer_nom: developers.find(d => d.id === devId)?.nom + ' ' + (developers.find(d => d.id === devId)?.prenom || '') }
                  : { developer_id: parseInt(devId) };
                wrap(() => prospectService.assignVisit(p.id, payload));
              }}>
              <Send size={12}/> Affecter
            </button>
          </div>
        </div>
      )}

      {canDevDecide && (
        <div style={{ marginBottom:14 }}>
          <b style={{ color:'var(--text-primary)', fontSize:13 }}>🔍 Ma décision après visite :</b>
          <textarea placeholder="Commentaire obligatoire (justification)…"
            value={devComment} onChange={e => setDevComment(e.target.value)}
            style={{ width:'100%', marginTop:6, minHeight:60 }}/>
          <div className="action-bar">
            <button className="btn-success" disabled={busy || devComment.length < 3}
              onClick={() => captureAndDecide(true)}>
              <CheckCircle size={14}/> Valider
            </button>
            <button className="btn-danger" disabled={busy || devComment.length < 3}
              onClick={() => captureAndDecide(false)}>
              <XCircle size={14}/> Refuser
            </button>
          </div>
        </div>
      )}

      {canRC && (
        <div style={{ marginBottom:14 }}>
          <b style={{ color:'var(--text-primary)', fontSize:13 }}>👔 Décision RC :</b>
          <textarea placeholder="Commentaire (optionnel)…" value={rcComment}
            onChange={e => setRcComment(e.target.value)}
            style={{ width:'100%', marginTop:6, minHeight:60 }}/>
          <div className="action-bar">
            <button className="btn-success" disabled={busy}
              onClick={() => wrap(() => prospectService.rcDecision(p.id, { decision: 'approve', comment: rcComment }))}>
              <CheckCircle size={14}/> Approuver
            </button>
            <button className="btn-secondary" disabled={busy}
              onClick={() => wrap(() => prospectService.rcDecision(p.id, { decision: 'hold', comment: rcComment }))}>
              <Clock size={14}/> Mettre en attente
            </button>
            <button className="btn-danger" disabled={busy}
              onClick={() => wrap(() => prospectService.rcDecision(p.id, { decision: 'reject', comment: rcComment }))}>
              <XCircle size={14}/> Refuser
            </button>
          </div>
        </div>
      )}

      {canAssignPuce && (
        <div style={{ marginBottom:14 }}>
          <b style={{ color:'var(--text-primary)', fontSize:13 }}>📦 Attribuer une puce :</b>
          <div className="action-bar">
            <input placeholder="N° de puce" value={puceNumero}
              onChange={e => setPuceNumero(e.target.value)}/>
            <select value={activatorId} onChange={e => setActivatorId(e.target.value)}>
              <option value="">— développeur activateur —</option>
              {developers.map(d => <option key={d.id} value={d.id}>{d.nom} {d.prenom||''}</option>)}
            </select>
            <button className="btn-primary" disabled={!activatorId || !puceNumero || busy}
              onClick={() => wrap(() => prospectService.assignPuce(p.id, {
                activator_id: parseInt(activatorId), puce_numero: puceNumero,
              }))}>
              <Send size={12}/> Attribuer
            </button>
          </div>
        </div>
      )}

      {canActivate && (
        <div style={{ marginBottom:14 }}>
          <b style={{ color:'var(--text-primary)', fontSize:13 }}>⚡ Activer la puce {p.puce_numero}</b>
          <div className="action-bar">
            <button className="btn-success" disabled={busy}
              onClick={() => wrap(() => prospectService.activate(p.id, { create_pdv: true }))}>
              <CheckCircle size={14}/> Confirmer activation (créer PDV)
            </button>
          </div>
        </div>
      )}

      {canCancel && (
        <div style={{ marginTop:14, paddingTop:10, borderTop:'1px solid var(--border)' }}>
          <button className="btn-secondary" disabled={busy}
            onClick={() => {
              const reason = window.prompt('Raison de l\'annulation ?');
              if (reason && reason.length >= 3) {
                wrap(() => prospectService.cancel(p.id, { comment: reason }));
              }
            }}>
            ❎ Annuler le prospect
          </button>
        </div>
      )}

      {!canAssign && !canDevDecide && !canRC && !canAssignPuce && !canActivate && !canCancel && (
        <div style={{ color:'var(--text-muted)', fontStyle:'italic', fontSize:13 }}>Aucune action disponible à cet état pour votre rôle.</div>
      )}
    </div>
  );
}

// =============================================================================
// ONGLET 2 : IA — Conteneur principal avec sous-menu
// =============================================================================
function TabIA({ onOpen }) {
  const [aiTab, setAiTab] = useState('overview');

  const subtabs = [
    { id: 'overview', label: '📊 Vue d\'ensemble' },
    { id: 'go-nogo',  label: '🎯 Recommandations Go/NoGo' },
    { id: 'forecast', label: '📈 Prédictions CA' },
    { id: 'doublons', label: '🔁 Doublons détectés' },
  ];

  return (
    <>
      {/* Sub-menu IA (style cohérent avec design system) */}
      <div className="subtabs-container mb-24">
        {subtabs.map(t => (
          <button key={t.id}
            className={`subtab-btn ${aiTab === t.id ? 'active' : ''}`}
            onClick={() => setAiTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {aiTab === 'overview' && <TabAIOverview onOpen={onOpen}/>}
      {aiTab === 'go-nogo'  && <TabAIGoNoGo onOpen={onOpen}/>}
      {aiTab === 'forecast' && <TabAIForecast onOpen={onOpen}/>}
      {aiTab === 'doublons' && <TabAIDoublons onOpen={onOpen}/>}
    </>
  );
}

// =============================================================================
// SOUS-ONGLET IA : Vue d'ensemble (distribution Go/NoGo, top 5)
// =============================================================================
function TabAIOverview({ onOpen }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    prospectService.aiOverview()
      .then(setData)
      .catch(e => alert('Erreur IA : ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Calcul des scores IA en cours…</div>;
  if (!data || !data.total_evalues) return <div className="empty-state">Aucun prospect actif à évaluer.</div>;

  const { distribution, score_moyen, total_evalues, top_go, top_nogo } = data;
  const pct = (n) => total_evalues ? Math.round(n / total_evalues * 100) : 0;

  return (
    <>
      {/* Stats IA */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Prospects évalués</div><div className="stat-value">{total_evalues}</div></div>
        <div className="stat-card ok"><div className="stat-label">Score moyen IA</div><div className="stat-value">{score_moyen}/100</div></div>
        <div className="stat-card ok"><div className="stat-label">🟢 GO recommandés</div><div className="stat-value">{distribution.GO}</div><small style={{ color:'var(--text-muted)' }}>{pct(distribution.GO)}%</small></div>
        <div className="stat-card warn"><div className="stat-label">🟡 Conditionnels</div><div className="stat-value">{distribution.CONDITIONAL}</div><small style={{ color:'var(--text-muted)' }}>{pct(distribution.CONDITIONAL)}%</small></div>
        <div className="stat-card" style={{ borderLeftColor:'var(--danger)' }}><div className="stat-label">🔴 NO-GO</div><div className="stat-value" style={{ color:'var(--danger)' }}>{distribution.NO_GO}</div><small style={{ color:'var(--text-muted)' }}>{pct(distribution.NO_GO)}%</small></div>
      </div>

      {/* Distribution graphique simple */}
      <div className="modal-section" style={{ background:'var(--bg-card)', marginBottom:16 }}>
        <h3>📊 Distribution des recommandations</h3>
        <div style={{ display:'flex', height:24, borderRadius:6, overflow:'hidden', marginTop:10 }}>
          <div style={{ width:`${pct(distribution.GO)}%`, background:'var(--success)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#fff' }}>
            {distribution.GO > 0 && `${pct(distribution.GO)}%`}
          </div>
          <div style={{ width:`${pct(distribution.CONDITIONAL)}%`, background:'var(--warning)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#000' }}>
            {distribution.CONDITIONAL > 0 && `${pct(distribution.CONDITIONAL)}%`}
          </div>
          <div style={{ width:`${pct(distribution.NO_GO)}%`, background:'var(--danger)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#fff' }}>
            {distribution.NO_GO > 0 && `${pct(distribution.NO_GO)}%`}
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div className="modal-section" style={{ background:'var(--bg-card)', margin:0 }}>
          <h3>🏆 Top 5 — Meilleurs prospects (GO)</h3>
          <RankedList items={top_go} onOpen={onOpen} color="var(--success)"/>
        </div>
        <div className="modal-section" style={{ background:'var(--bg-card)', margin:0 }}>
          <h3>⚠️ Top 5 — Plus risqués (NO-GO)</h3>
          <RankedList items={top_nogo} onOpen={onOpen} color="var(--danger)" empty="Aucun NO-GO 🎉"/>
        </div>
      </div>
    </>
  );
}

function RankedList({ items, onOpen, color, empty='Aucun prospect.' }) {
  if (!items || !items.length) return <div style={{ color:'var(--text-muted)', fontStyle:'italic', padding:8 }}>{empty}</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
      {items.map((s, i) => (
        <div key={s.id} onClick={() => onOpen(s)} style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'8px 10px', background:'rgba(255,255,255,0.03)', borderRadius:6, cursor:'pointer',
          borderLeft:`3px solid ${color}`,
        }}>
          <div>
            <div style={{ fontWeight:600 }}>{i+1}. {s.prenom} {s.nom}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{s.reference} · {s.quartier || '—'}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:18, fontWeight:700, color }}>{s.score}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)' }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// ONGLET 3 : Recommandations Go / Conditional / NoGo (table triable)
// =============================================================================
function TabAIGoNoGo({ onOpen }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { prospectService.aiOverview().then(setData); }, []);
  if (!data) return <div className="loading-state">Calcul…</div>;
  const all = data.all || [];
  const filtered = filter === 'all' ? all : all.filter(x => x.decision === filter);

  const colors = { GO: 'var(--success)', CONDITIONAL: 'var(--warning)', NO_GO: 'var(--danger)' };
  const labels = { GO: '🟢 GO', CONDITIONAL: '🟡 Conditional', NO_GO: '🔴 NO-GO' };

  return (
    <>
      <div className="filters">
        <span style={{ color:'var(--text-secondary)', fontSize:13 }}>Filtrer :</span>
        {['all','GO','CONDITIONAL','NO_GO'].map(k => (
          <button key={k} onClick={() => setFilter(k)}
            className={filter === k ? 'btn-primary' : 'btn-secondary'}>
            {k === 'all' ? `Tous (${all.length})` : `${labels[k]} (${data.distribution[k]})`}
          </button>
        ))}
      </div>

      <div className="prospects-table">
        <table>
          <thead>
            <tr><th>Référence</th><th>Prospect</th><th>Quartier</th><th>Statut</th><th>Score IA</th><th>Recommandation</th></tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} onClick={() => onOpen(s)}>
                <td><b>{s.reference}</b></td>
                <td>{s.prenom} {s.nom}</td>
                <td>{s.quartier || '—'}</td>
                <td><span className="status-badge" style={{ background: STATUS_LABELS[s.status]?.color || '#94a3b8' }}>{STATUS_LABELS[s.status]?.label || s.status}</span></td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${s.score}%`, height:'100%', background: colors[s.decision] }}/>
                    </div>
                    <b style={{ color: colors[s.decision], minWidth:36 }}>{s.score}</b>
                  </div>
                </td>
                <td><span className="status-badge" style={{ background: colors[s.decision] }}>{labels[s.decision]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =============================================================================
// ONGLET 4 : Prédictions CA (3 mois)
// =============================================================================
function TabAIForecast({ onOpen }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const overview = await prospectService.aiOverview();
        // Charger le forecast en parallèle pour le top 30 par score
        const top = (overview.all || []).slice(0, 30);
        const forecasts = await Promise.all(top.map(s =>
          prospectService.aiForecast(s.id).then(f => ({ ...s, ...f })).catch(() => null)
        ));
        if (mounted) setList(forecasts.filter(Boolean));
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="loading-state">Chargement des prédictions IA…</div>;
  if (!list.length) return <div className="empty-state">Aucune prédiction disponible.</div>;

  const totalProj = list.reduce((s, x) => s + x.ca_total_3m, 0);
  const fmt = (n) => `${(n / 1000).toLocaleString('en-US').replace(/,/g, ' ')} k F`;

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Prospects projetés</div><div className="stat-value">{list.length}</div></div>
        <div className="stat-card ok"><div className="stat-label">CA total 3M projeté</div><div className="stat-value">{fmt(totalProj)}</div></div>
        <div className="stat-card"><div className="stat-label">CA moyen / prospect</div><div className="stat-value">{fmt(totalProj / list.length)}</div></div>
        <div className="stat-card"><div className="stat-label">Confiance haute</div><div className="stat-value">{list.filter(x => x.confidence === 'HIGH').length}</div></div>
      </div>

      <div className="prospects-table">
        <table>
          <thead>
            <tr><th>Prospect</th><th>Score</th><th>Mois 1</th><th>Mois 2</th><th>Mois 3</th><th>Total 3M</th><th>Confiance</th></tr>
          </thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id} onClick={() => onOpen(s)}>
                <td>
                  <b>{s.prenom} {s.nom}</b>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{s.reference} · {s.quartier || '—'}</div>
                </td>
                <td><b>{s.score}</b></td>
                <td>{fmt(s.forecast[0].ca)}</td>
                <td>{fmt(s.forecast[1].ca)}</td>
                <td>{fmt(s.forecast[2].ca)}</td>
                <td><b style={{ color:'var(--success)' }}>{fmt(s.ca_total_3m)}</b></td>
                <td>
                  <span className="status-badge" style={{
                    background: s.confidence === 'HIGH' ? 'var(--success)' :
                                s.confidence === 'MEDIUM' ? 'var(--warning)' : 'var(--danger)'
                  }}>{s.confidence}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =============================================================================
// ONGLET 5 : Détection des doublons
// =============================================================================
function TabAIDoublons({ onOpen }) {
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await prospectService.list({ limit: 200 });
        const found = [];
        for (const p of all) {
          const dups = await prospectService.aiDuplicates(p.id);
          if (dups.length > 0) {
            found.push({ source: p, matches: dups });
          }
        }
        if (mounted) setDuplicates(found);
      } catch (e) {
        alert('Erreur : ' + (e.response?.data?.detail || e.message));
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="loading-state">Recherche de doublons en cours…</div>;
  if (!duplicates.length) return (
    <div className="empty-state">
      ✅ Aucun doublon suspect détecté parmi les prospects actuels.
    </div>
  );

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card warn"><div className="stat-label">⚠️ Cas de doublons détectés</div><div className="stat-value">{duplicates.length}</div></div>
        <div className="stat-card"><div className="stat-label">Total fiches concernées</div><div className="stat-value">{duplicates.reduce((s,d) => s + d.matches.length, 0) + duplicates.length}</div></div>
      </div>

      {duplicates.map((d, i) => (
        <div key={i} className="modal-section" style={{ background:'var(--bg-card)' }}>
          <h3>🔁 Cas #{i + 1} — Source : <span style={{ color:'var(--primary)' }}>{d.source.reference}</span></h3>
          <div onClick={() => onOpen(d.source)} style={{
            padding:10, background:'rgba(255,105,0,0.08)', borderRadius:6, marginBottom:8,
            cursor:'pointer', borderLeft:'3px solid var(--primary)',
          }}>
            <b>{d.source.prenom} {d.source.nom}</b> · 📞 {d.source.telephone_principal} · {d.source.quartier || '—'}
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>Soumis le {new Date(d.source.submitted_at).toLocaleDateString('fr-FR')}</div>
          </div>
          <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:6 }}>
            <b>Doublons potentiels ({d.matches.length}) :</b>
          </div>
          {d.matches.map(m => (
            <div key={m.id} onClick={() => onOpen(m)} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'8px 10px', background:'rgba(239,68,68,0.06)', borderRadius:6, marginBottom:4,
              cursor:'pointer', borderLeft:'3px solid var(--danger)',
            }}>
              <div>
                <b>{m.prenom} {m.nom}</b> · {m.reference}
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  📞 {m.telephone} · {m.quartier || '—'} · {m.reasons.join(' · ')}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:18, fontWeight:700, color:'var(--danger)' }}>{m.match_score}%</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>match</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
