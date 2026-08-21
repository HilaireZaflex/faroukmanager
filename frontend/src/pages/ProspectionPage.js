import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, RadialBarChart, RadialBar,
} from 'recharts';
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

  const isAdminOrRC = ['admin', 'rc', 'manager', 'ADMIN', 'RC', 'MANAGER', 'conformite', 'CONFORMITE', 'responsable_produit_et_qualit_oprationnelle_'].includes(user?.role);
  const isDev = ['developpeur', 'DEVELOPPEUR', 'superviseur', 'SUPERVISEUR'].includes(user?.role) || isAdminOrRC;
  const isCommercial = ['commercial', 'COMMERCIAL'].includes(user?.role);

  const allTabs = [
    { id: 'demandes',   label: '📋 Demandes',           show: true },
    { id: 'workflow',   label: '🔄 Workflow',            show: isAdminOrRC || isDev },
    { id: 'activation',   label: '⚡ Activation',          show: !isCommercial },
    { id: 'conformite',   label: '✅ Conformité',           show: isAdminOrRC },
    { id: 'repartition', label: '📊 Répartition Agents',  show: isAdminOrRC },
  ];
  const tabs = allTabs.filter(t => t.show);
  const safeTab = tabs.find(t => t.id === activeTab) ? activeTab : 'demandes';

  const isDeveloppeur = ['developpeur', 'DEVELOPPEUR'].includes(user?.role);

  return (
    <div className="prospection-page">
      {/* Message de bienvenue pour les commerciaux */}
      {isCommercial && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,105,0,0.15), rgba(255,149,0,0.08))',
          border: '1px solid rgba(255,105,0,0.3)', borderRadius: 14,
          padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg,#FF6900,#ff9500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>👋</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>
              Bonjour, {user?.prenom || user?.nom || 'Commercial'} !
            </div>
            <div style={{ fontSize: 12, color: '#FF6900', fontWeight: 600 }}>
              Commercial · Farouk Distribution
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Bienvenue sur votre espace de prospection. Soumettez vos demandes de puce OM ici.
            </div>
          </div>
        </div>
      )}

      {/* Message de bienvenue pour les développeurs */}
      {isDeveloppeur && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(55,66,250,0.15), rgba(55,66,250,0.05))',
          border: '1px solid rgba(55,66,250,0.35)', borderRadius: 14,
          padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg,#3742fa,#5f6cf5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>👋</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>
              Bonjour, {user?.prenom || user?.nom || 'Développeur'} !
            </div>
            <div style={{ fontSize: 12, color: '#5f6cf5', fontWeight: 600 }}>
              Développeur · Farouk Distribution
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Bienvenue sur votre espace de prospection. Retrouvez ici vos demandes assignées et soumettez de nouvelles fiches.
            </div>
          </div>
        </div>
      )}

      <div className="prospection-header">
        <h1>
          <span>📋 Prospection — Demandes de puce Orange Money</span>
          {!isCommercial && <small>Workflow collaboratif en 6 étapes · Superviseur → Dev → RC → Activation</small>}
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
        {safeTab === 'activation'   && <TabActivation key={refreshKey} currentUser={user} onRefresh={refresh}/>}
        {safeTab === 'conformite'   && <TabConformite key={refreshKey} currentUser={user} onRefresh={refresh}/>}
        {safeTab === 'repartition' && (
          <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>}>
            <TabRepartition />
          </React.Suspense>
        )}
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
  total:           '__ALL__',     // spécial: efface le filtre
  nouvelles:       'NOUVELLE',
  en_visite:       'EN_VISITE',
  en_attente_rc:   'VALIDEE_DEV',
  puce_attribuees: 'PUCE_ATTRIBUEE',
  activees:        'PUCE_ACTIVEE',
  conformite:      '__CONFORMITE__',
  refusees:        'REFUSEE_RC',
  sla_en_retard:   '__SLA__',    // spécial: filtre EN_VISITE
  taux_activation: '__NONE__',   // non filtrable
};


// ─── Modal de modification d'une demande (Commercial/Développeur) ─────────────


// ─── Modal affichage pièces Energia ──────────────────────────────────────────
function PiecesEnergiaModal({ prospect, onClose }) {
  const { useState: useSt, useEffect: useEff } = React;
  const [pieces, setPieces] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const BACKEND = 'https://faroukmanager-backend-production-feb9.up.railway.app';

  React.useEffect(() => {
    api.get(`/energia/prospects/${prospect.id}/pieces`)
      .then(r => setPieces(r.data || []))
      .catch(() => setPieces([]))
      .finally(() => setLoading(false));
  }, [prospect.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg,#0f0f1e,#1a1a2e)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16, width: '90%', maxWidth: 640, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(34,197,94,0.2)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>📎 Pièces Jointes — {prospect.reference}</div>
            <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>{prospect.prenom} {prospect.nom} · Kit {prospect.nom_kit}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
        </div>
        {/* Contenu */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Chargement...</div>
          ) : !pieces.length ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8a8a9a' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <p style={{ fontWeight: 600 }}>Aucune pièce jointe</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Le commercial n'a pas encore uploadé de pièces pour ce prospect.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {pieces.map((p, i) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(p.filename || '');
                const fileUrl = `${BACKEND}/uploads/energia/${prospect.id}/${p.filename}`;
                return (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Aperçu */}
                    <div style={{ height: 140, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {isImage ? (
                        <img src={fileUrl} alt={p.filename}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { e.target.style.display='none'; }}
                        />
                      ) : (
                        <span style={{ fontSize: 40 }}>📄</span>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>{p.filename}</div>
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'block', padding: '5px 8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, color: '#22c55e', fontSize: 11, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>
                        👁️ Voir
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal de modification d'un prospect Energia ─────────────────────────────
function EditEnergiaModal({ prospect, onClose, onSaved }) {
  const [data, setData] = useState({
    nom_kit: prospect?.nom_kit || '',
    pret_payer_immediatement: prospect?.pret_payer_immediatement ?? null,
    date_prospection: prospect?.date_prospection || '',
    nom: prospect?.nom || '',
    prenom: prospect?.prenom || '',
    telephone: prospect?.telephone || '',
    quartier: prospect?.quartier || '',
    piece_identite: prospect?.piece_identite || '',
    notes: prospect?.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const IS = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const GREEN = '#22c55e';

  const submit = async (e) => {
    e.preventDefault();
    if (!data.nom_kit) return alert('Veuillez sélectionner un kit');
    if (!data.nom || !data.prenom || !data.telephone) return alert('Nom, Prénom et Téléphone sont obligatoires');
    setBusy(true);
    try {
      await api.patch(`/energia/prospects/${prospect.id}`, data);
      onSaved();
    } catch (err) { alert('Erreur : ' + errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '16px' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg, #0f0f1e, #1a1a2e)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16, width: '100%', maxWidth: 560, margin: '0 auto 80px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 14px', borderBottom: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✏️</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Modifier — {prospect?.reference}</div>
              <div style={{ fontSize: 11, color: GREEN }}>Vente ENERGIA · {prospect?.nom_kit}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
        </div>
        <form onSubmit={submit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Kit */}
          <div>
            <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>Kit *</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['DIABARANI','YELEN'].map(kit => (
                <button key={kit} type="button" onClick={() => setData(d => ({ ...d, nom_kit: kit }))}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: `2px solid ${data.nom_kit===kit?GREEN:'rgba(255,255,255,0.1)'}`, background: data.nom_kit===kit?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.03)', color: data.nom_kit===kit?GREEN:'#94a3b8', fontWeight: 800, cursor: 'pointer' }}>
                  {kit==='DIABARANI'?'🌞 DIABARANI':'💡 YELEN'}
                </button>
              ))}
            </div>
          </div>
          {/* Prêt payer */}
          <div>
            <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>Prêt à payer immédiatement ?</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{val:true,label:'✅ OUI',color:'#22c55e'},{val:false,label:'❌ NON',color:'#ef4444'}].map(opt => (
                <button key={String(opt.val)} type="button" onClick={() => setData(d => ({ ...d, pret_payer_immediatement: opt.val }))}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${data.pret_payer_immediatement===opt.val?opt.color:'rgba(255,255,255,0.1)'}`, background: data.pret_payer_immediatement===opt.val?opt.color+'20':'rgba(255,255,255,0.03)', color: data.pret_payer_immediatement===opt.val?opt.color:'#94a3b8', fontWeight: 700, cursor: 'pointer' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Infos client */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['nom','Nom *'],['prenom','Prénom *'],['telephone','Téléphone *'],['quartier','Quartier'],['date_prospection','Date'],['piece_identite','Pièce / RCCM']].map(([k,lbl]) => (
              <div key={k}>
                <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>{lbl}</label>
                <input style={IS} type={k==='date_prospection'?'date':'text'} value={data[k]||''} onChange={e => setData(d => ({ ...d, [k]: e.target.value }))} required={lbl.includes('*')} />
              </div>
            ))}
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Notes</label>
            <textarea style={{ ...IS, minHeight: 60, resize: 'vertical' }} value={data.notes||''} onChange={e => setData(d => ({ ...d, notes: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={busy} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy?0.7:1 }}>
              {busy ? '⏳ Enregistrement...' : '💾 Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditProspectModal({ prospect, onClose, onSaved }) {
  const [data, setData] = useState({
    prenom: prospect?.prenom || '',
    nom: prospect?.nom || '',
    telephone_principal: prospect?.telephone_principal || '',
    telephone_secondaire: prospect?.telephone_secondaire || '',
    quartier: prospect?.quartier || '',
    adresse: prospect?.adresse || '',
    notes: prospect?.notes || '',
    capital_demarrage: prospect?.capital_demarrage || '',
    source_financement: prospect?.source_financement || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/prospects/${prospect.id}`, data);
      onSaved();
      onClose();
    } catch (err) { alert('Erreur : ' + errMsg(err)); }
    finally { setBusy(false); }
  };

  const IS = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '16px' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg, #0f0f1e, #1a1a2e)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 16, width: '100%', maxWidth: 600, margin: '0 auto 80px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 14px', borderBottom: '1px solid rgba(255,105,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#FF6900,#ff9500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✏️</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Modifier la demande — {prospect?.reference}</div>
              <div style={{ fontSize: 11, color: '#FF6900' }}>Informations modifiables</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
        </div>
        <form onSubmit={submit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Prénom *</label>
              <input style={IS} value={data.prenom} onChange={e => set('prenom', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Nom *</label>
              <input style={IS} value={data.nom} onChange={e => set('nom', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Téléphone Principal *</label>
              <input style={IS} value={data.telephone_principal} onChange={e => set('telephone_principal', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Téléphone Secondaire</label>
              <input style={IS} value={data.telephone_secondaire} onChange={e => set('telephone_secondaire', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Quartier <span style={{color:'#ff4757'}}>*</span></label>
              <QuartierInput value={data.quartier} onChange={v => set('quartier', v)} required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Capital Démarrage</label>
              <input style={IS} value={data.capital_demarrage} onChange={e => set('capital_demarrage', e.target.value)} placeholder="Montant..." />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Adresse complète</label>
            <input style={IS} value={data.adresse} onChange={e => set('adresse', e.target.value)} placeholder="Rue, bâtiment, repère..." />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Notes / Observations</label>
            <textarea style={{ ...IS, minHeight: 70, resize: 'vertical' }} value={data.notes} onChange={e => set('notes', e.target.value)} placeholder="Informations complémentaires..." />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={busy} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? '⏳ Enregistrement...' : '💾 Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TabDemandes({ onOpen, currentUser, onRefresh }) {
  const [typeVue, setTypeVue] = useState('OM'); // 'OM' | 'ENERGIA'
  const [periode, setPeriode] = useState('tout');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [prospects, setProspects] = useState([]);
  const [allProspects, setAllProspects] = useState([]);
  const [energiaProspects, setEnergiaProspects] = useState([]);
  const [energiaLoading, setEnergiaLoading] = useState(false);
  const [energiaStats, setEnergiaStats] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: '', search: '', superviseur: '', developpeur: '', zone: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editProspect, setEditProspect] = useState(null); // Prospect en cours de modification
  const [editEnergiaProspect, setEditEnergiaProspect] = useState(null); // Prospect Energia en cours de modification
  const [viewPiecesEnergia, setViewPiecesEnergia] = useState(null); // Prospect Energia dont on voit les pièces

  // Détecter si l'utilisateur est un développeur
  const isDeveloppeur = ['developpeur', 'DEVELOPPEUR'].includes(currentUser?.role);
  const devFullName = isDeveloppeur
    ? `${currentUser?.nom || ''} ${currentUser?.prenom || ''}`.trim().toLowerCase()
    : '';

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

  // Charger les prospects Energia
  const reloadEnergia = useCallback(async () => {
    setEnergiaLoading(true);
    try {
      const [list, st] = await Promise.all([
        api.get('/energia/prospects?limit=200').then(r => r.data),
        api.get('/energia/stats').then(r => r.data),
      ]);
      // Filtrer par développeur si rôle developpeur
      const isDev = ['developpeur', 'DEVELOPPEUR'].includes(currentUser?.role);
      const devName = isDev ? `${currentUser?.nom||''} ${currentUser?.prenom||''}`.trim().toLowerCase() : '';
      const filtered = isDev
        ? (list.items || []).filter(p => {
            const creator = p.created_by_name || '';
            return creator.toLowerCase().includes(devName) || String(p.created_by) === String(currentUser?.id);
          })
        : (list.items || []);
      setEnergiaProspects(filtered);
      setEnergiaStats(st);
    } catch (e) {
      console.error('Erreur Energia:', e);
    } finally { setEnergiaLoading(false); }
  }, [currentUser]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { reloadEnergia(); }, [reloadEnergia]);

  const deleteEnergia = async (id) => {
    if (!window.confirm('Supprimer ce prospect Energia ? Cette action est irréversible.')) return;
    try {
      await api.delete('/energia/prospects/' + id);
      reloadEnergia();
    } catch (e) { alert('Erreur suppression : ' + (e?.response?.data?.detail || e.message)); }
  };

  // Calcul de la plage de dates selon la période
  const today = new Date();
  const getPeriodeDates = () => {
    if (periode === 'aujourd_hui') {
      const d = today.toISOString().slice(0,10);
      return { debut: d, fin: d };
    }
    if (periode === 'cette_semaine') {
      const day = today.getDay() || 7;
      const lundi = new Date(today); lundi.setDate(today.getDate() - day + 1);
      return { debut: lundi.toISOString().slice(0,10), fin: today.toISOString().slice(0,10) };
    }
    if (periode === 'ce_mois') {
      return { debut: `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`, fin: today.toISOString().slice(0,10) };
    }
    if (periode === 'custom') return { debut: dateDebut, fin: dateFin };
    return { debut: null, fin: null };
  };
  const { debut: filterDebut, fin: filterFin } = getPeriodeDates();

  // Filtrage local — si développeur : seulement ses propres prospects
  const filtered = allProspects.filter(p => {
    // Filtre développeur : ne voir que ses propres prospects
    if (isDeveloppeur) {
      const assignedName = p.visit_assigned_to
        ? `${p.visit_assigned_to.nom || ''} ${p.visit_assigned_to.prenom || ''}`.trim().toLowerCase()
        : '';
      const submittedName = p.submitted_by
        ? `${p.submitted_by.nom || ''} ${p.submitted_by.prenom || ''}`.trim().toLowerCase()
        : '';
      if (assignedName !== devFullName && submittedName !== devFullName) return false;
    }
    // Filtre période — basé sur submitted_at
    if (filterDebut || filterFin) {
      const dateP = p.submitted_at ? p.submitted_at.slice(0,10) : null;
      if (!dateP) return false;
      if (filterDebut && dateP < filterDebut) return false;
      if (filterFin && dateP > filterFin) return false;
    }
    if (filters.superviseur && p.submitted_by?.role === 'superviseur' &&
        `${p.submitted_by?.nom} ${p.submitted_by?.prenom||''}`.toLowerCase() !== filters.superviseur.toLowerCase()) return false;
    if (filters.developpeur && p.visit_assigned_to &&
        `${p.visit_assigned_to?.nom} ${p.visit_assigned_to?.prenom||''}`.toLowerCase() !== filters.developpeur.toLowerCase()) return false;
    // Filtre par zone (seulement pour PUCE_ACTIVEE et PUCE_ATTRIBUEE)
    if (filters.zone) {
      // On ne filtre que si le prospect est activé ou attribué (on connaît la zone)
      if (!['PUCE_ACTIVEE','PUCE_ATTRIBUEE'].includes(p.status)) return false;
      const pdvZone = (p.activated_pdv?.zone || p.pdv_zone || '').toLowerCase();
      if (!pdvZone.includes(filters.zone.toLowerCase())) return false;
    }
    return true;
  });

  // KPIs = depuis allProspects avec SEULEMENT filtre période + dev (PAS filtre statut)
  const kpiBase = allProspects.filter(p => {
    if (isDeveloppeur) {
      const assignedName = p.visit_assigned_to ? `${p.visit_assigned_to.nom||''} ${p.visit_assigned_to.prenom||''}`.trim().toLowerCase() : '';
      const submittedName = p.submitted_by ? `${p.submitted_by.nom||''} ${p.submitted_by.prenom||''}`.trim().toLowerCase() : '';
      if (assignedName !== devFullName && submittedName !== devFullName) return false;
    }
    if (filterDebut || filterFin) {
      const dateP = p.submitted_at ? p.submitted_at.slice(0,10) : null;
      if (!dateP) return false;
      if (filterDebut && dateP < filterDebut) return false;
      if (filterFin && dateP > filterFin) return false;
    }
    return true;
  });

  const periodeActive = periode !== 'tout' || filterDebut || filterFin;
  const filteredStats = (periodeActive || isDeveloppeur) && kpiBase.length > 0 ? {
    ...(stats || {}),
    total: kpiBase.length,
    nouvelles: kpiBase.filter(p => p.status === 'NOUVELLE').length,
    en_visite: kpiBase.filter(p => p.status === 'EN_VISITE').length,
    en_attente_rc: kpiBase.filter(p => p.status === 'VALIDEE_DEV').length,
    puce_attribuees: kpiBase.filter(p => p.status === 'PUCE_ATTRIBUEE').length,
    activees: kpiBase.filter(p => p.status === 'PUCE_ACTIVEE').length,
    refusees: kpiBase.filter(p => p.status === 'REFUSEE_RC').length,
    sla_en_retard: kpiBase.filter(p => p.status === 'PUCE_ATTRIBUEE').length,
    taux_activation: kpiBase.length > 0 ? Math.round(kpiBase.filter(p => p.status === 'PUCE_ACTIVEE').length / kpiBase.length * 100) : 0,
  } : null;

  const displayStats = filteredStats || stats;

  // Extraire superviseurs et développeurs uniques depuis la liste
  const superviseurs = [...new Set(allProspects
    .filter(p => p.submitted_by?.nom)
    .map(p => `${p.submitted_by.nom} ${p.submitted_by.prenom||''}`.trim())
  )].sort();
  const developpeurs = [...new Set(allProspects
    .filter(p => p.visit_assigned_to?.nom)
    .map(p => `${p.visit_assigned_to.nom} ${p.visit_assigned_to.prenom||''}`.trim())
  )].sort();

  const canDelete = ['admin', 'manager', 'rc', 'ADMIN', 'MANAGER', 'RC', 'UserRole.admin', 'UserRole.manager', 'UserRole.rc'].includes(currentUser?.role) ||
    (currentUser?.role || '').toLowerCase().replace('userrole.', '') === 'rc' ||
    (currentUser?.role || '').toLowerCase().replace('userrole.', '') === 'admin' ||
    (currentUser?.role || '').toLowerCase().replace('userrole.', '') === 'conformite' ||
    (currentUser?.role || '').toLowerCase().startsWith('responsable_produit') ||
    (currentUser?.role || '').toLowerCase().replace('userrole.', '') === 'manager';

  const handleDelete = (e, p) => { e.stopPropagation(); setConfirmDelete(p); };
  const doDelete = async () => {
    const p = confirmDelete;
    setConfirmDelete(null);
    try { await prospectService.delete(p.id); reload(); onRefresh && onRefresh(); }
    catch (err) { alert('Erreur suppression : ' + errMsg(err)); }
  };

  // Export Excel des prospects du statut sélectionné
  const exportExcel = async (kpiKey) => {
    const mapped = KPI_STATUS_MAP[kpiKey];
    if (!mapped || mapped === '__NONE__') return;

    // Charger TOUS les prospects depuis l'API par lots de 200 (limite API)
    const statusFilter = mapped === '__SLA__' ? 'PUCE_ATTRIBUEE' : (mapped !== '__ALL__' ? mapped : '');
    let allData = [];
    try {
      let skip = 0;
      while (true) {
        const params = { limit: 200, skip };
        if (statusFilter) params.status = statusFilter;
        const batch = await prospectService.list(params);
        if (!batch?.length) break;
        allData = allData.concat(batch);
        if (batch.length < 200) break;
        skip += 200;
      }
      
    } catch (e) {
      
      return alert('Erreur chargement : ' + errMsg(e));
    }

    // Appliquer filtre période côté client
    let dataToExport = allData.filter(p => {
      if (filterDebut || filterFin) {
        const dateP = p.submitted_at ? p.submitted_at.slice(0,10) : null;
        if (!dateP) return false;
        if (filterDebut && dateP < filterDebut) return false;
        if (filterFin && dateP > filterFin) return false;
      }
      return true;
    });

    if (!dataToExport.length) return alert('Aucune donnée à exporter pour ce filtre et cette période.');

    const label = {
      '__ALL__': 'Tous les prospects',
      NOUVELLE: 'Nouvelles demandes',
      EN_VISITE: 'En visite terrain',
      VALIDEE_DEV: 'Validées développeur',
      PUCE_ATTRIBUEE: 'Puces attribuées',
      PUCE_ACTIVEE: 'Puces activées',
      REFUSEE_RC: 'Refusées RC',
      '__SLA__': 'Délais dépassés',
    }[mapped] || mapped;

    // Préparer les données pour Excel
    const rows = dataToExport.map(p => ({
      'Référence': p.reference || '',
      'Statut': p.status || '',
      'Nom': p.nom || '',
      'Prénom': p.prenom || '',
      'Téléphone Principal': p.telephone_principal || '',
      'Téléphone Secondaire': p.telephone_secondaire || '',
      'Quartier': p.quartier || '',
      'Adresse': p.adresse || '',
      'Type Local': p.type_local || '',
      'N° Puce': p.puce_numero || '',
      'ID PDV Activé': p.activated_pdv_id || '',
      'Pièce Identité Type': p.piece_identite_type || '',
      'Pièce Identité N°': p.piece_identite_numero || '',
      'Fait OM': p.fait_om ? 'Oui' : 'Non',
      'CA Mensuel OM': p.om_ca_mensuel || '',
      'Commission Mensuelle OM': p.om_commission_mensuelle || '',
      'Ancienne Puce': p.om_ancienne_puce || '',
      'Capital Démarrage': p.capital_demarrage || '',
      'Source Financement': p.source_financement || '',
      'Latitude': p.latitude || '',
      'Longitude': p.longitude || '',
      'Soumis Par': p.submitted_by ? `${p.submitted_by.prenom || ''} ${p.submitted_by.nom || ''}`.trim() : '',
      'Date Soumission': p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('fr-FR') : '',
      'Dev Visite': p.visit_assigned_to ? `${p.visit_assigned_to.prenom || ''} ${p.visit_assigned_to.nom || ''}`.trim() : '',
      'Date Visite': p.visit_assigned_at ? new Date(p.visit_assigned_at).toLocaleDateString('fr-FR') : '',
      'Décision Dev': p.dev_decision_comment || '',
      'Date Décision Dev': p.dev_decision_at ? new Date(p.dev_decision_at).toLocaleDateString('fr-FR') : '',
      'RC Décision Par': p.rc_decision_by ? `${p.rc_decision_by.prenom || ''} ${p.rc_decision_by.nom || ''}`.trim() : '',
      'Commentaire RC': p.rc_decision_comment || '',
      'Type de Réseau': p.activation_type_pdv || '',
      'Superviseur': p.activation_superviseur || '',
      'Gestionnaire': p.activation_gestionnaire || '',
      'Téléconseillère': p.activation_teleconseillere || '',
      'Développeur': p.activation_developpeur || '',
      'Date Activation': p.activated_at ? new Date(p.activated_at).toLocaleDateString('fr-FR') : '',
      'Notes': p.notes || '',
    }));

    // Générer le fichier Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    // Ajuster les largeurs de colonnes
    const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, 15) }));
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));

    const filename = `Prospection_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    alert(`✅ Export réussi : ${rows.length} prospect(s) exportés`);
  };

  // Clic sur un KPI → filtre par statut correspondant
  const handleKpiClick = (kpiKey) => {
    const mapped = KPI_STATUS_MAP[kpiKey];
    if (!mapped || mapped === '__NONE__') return;
    if (mapped === '__ALL__') { setFilters(f => ({ ...f, status: '' })); return; }
    if (mapped === '__SLA__') { setFilters(f => ({ ...f, status: f.status === 'PUCE_ATTRIBUEE' ? '' : 'PUCE_ATTRIBUEE' })); return; }
    setFilters(f => ({ ...f, status: f.status === mapped ? '' : mapped }));
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

      {/* ── Sélecteur de type de vue ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 5 }}>
        <button onClick={() => setTypeVue('OM')}
          style={{ flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: typeVue === 'OM' ? 'linear-gradient(135deg,#FF6900,#ff9500)' : 'transparent',
            color: typeVue === 'OM' ? '#fff' : '#8a8a9a', transition: 'all 0.2s' }}>
          📱 Puce Orange Money {displayStats ? `(${displayStats.total || 0})` : ''}
        </button>
        <button onClick={() => setTypeVue('ENERGIA')}
          style={{ flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: typeVue === 'ENERGIA' ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'transparent',
            color: typeVue === 'ENERGIA' ? '#fff' : '#8a8a9a', transition: 'all 0.2s' }}>
          ☀️ Vente ENERGIA {energiaStats ? `(${energiaStats.total || 0})` : ''}
        </button>
      </div>

      {/* ══ VUE ENERGIA ══════════════════════════════════════════════════════ */}
      {typeVue === 'ENERGIA' && (
        <div>
          {energiaStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Prospects', value: energiaStats.total, color: '#22c55e', icon: '☀️' },
                { label: 'DIABARANI', value: energiaStats.diabarani, color: '#ffa502', icon: '🌞' },
                { label: 'YELEN', value: energiaStats.yelen, color: '#a29bfe', icon: '💡' },
                { label: 'Prêts à Payer', value: `${energiaStats.prets_payer} (${energiaStats.taux_pret}%)`, color: energiaStats.taux_pret > 50 ? '#22c55e' : '#ff4757', icon: '✅' },
              ].map((k, i) => (
                <div key={i} style={{ padding: '16px 18px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderLeft: `4px solid ${k.color}`, borderRadius: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{k.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: '#8a8a9a', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}
          {energiaLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Chargement...</div>
          ) : energiaProspects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#8a8a9a' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>☀️</div>
              <p style={{ fontWeight: 600, fontSize: 15 }}>Aucune prospection Energia enregistrée</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Utilisez <strong>+ Nouvelle Prospection → ☀️ Vente ENERGIA</strong></p>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>☀️ Prospects Vente ENERGIA</span>
                <span style={{ fontSize: 12, color: '#22c55e' }}>{energiaProspects.length} prospect(s)</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Réf.','Kit','Client','Téléphone','Quartier','Prêt payer','Date','GPS','📎',...(canDelete?['Action']:[])].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {energiaProspects.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#22c55e' }}>{p.reference}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                            background: p.nom_kit === 'DIABARANI' ? 'rgba(255,165,2,0.15)' : 'rgba(162,155,254,0.15)',
                            color: p.nom_kit === 'DIABARANI' ? '#ffa502' : '#a29bfe' }}>
                            {p.nom_kit === 'DIABARANI' ? '🌞' : '💡'} {p.nom_kit}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.prenom} {p.nom}</td>
                        <td style={{ padding: '10px 12px', color: '#8a8a9a' }}>{p.telephone}</td>
                        <td style={{ padding: '10px 12px', color: '#8a8a9a' }}>{p.quartier || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                            background: p.pret_payer_immediatement ? 'rgba(34,197,94,0.15)' : 'rgba(255,71,87,0.15)',
                            color: p.pret_payer_immediatement ? '#22c55e' : '#ff4757' }}>
                            {p.pret_payer_immediatement ? '✅ OUI' : '❌ NON'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#8a8a9a' }}>
                          {p.date_prospection ? new Date(p.date_prospection).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {p.latitude && p.longitude ? (
                            <a href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, color: '#22c55e', textDecoration: 'none' }}>📍 Voir</a>
                          ) : <span style={{ color: '#555' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => setViewPiecesEnergia(p)}
                            style={{ background: 'rgba(255,165,2,0.1)', border: '1px solid rgba(255,165,2,0.3)', borderRadius: 6, color: '#ffa502', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>
                            📎
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                            <button onClick={() => setEditEnergiaProspect(p)}
                              style={{ background: 'rgba(255,165,2,0.15)', border: '1px solid rgba(255,165,2,0.3)', borderRadius: 6, color: '#ffa502', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>
                              ✏️
                            </button>
                            {canDelete && (
                              <button onClick={() => deleteEnergia(p.id)}
                                style={{ background: 'rgba(255,71,87,0.15)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 6, color: '#ff4757', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {viewPiecesEnergia && (
        <PiecesEnergiaModal
          prospect={viewPiecesEnergia}
          onClose={() => setViewPiecesEnergia(null)}
        />
      )}
      {editEnergiaProspect && (
        <EditEnergiaModal
          prospect={editEnergiaProspect}
          onClose={() => setEditEnergiaProspect(null)}
          onSaved={() => { setEditEnergiaProspect(null); reloadEnergia(); }}
        />
      )}

      {/* ══ VUE PUCE OM ══════════════════════════════════════════════════════ */}
      {typeVue === 'OM' && <>

      {/* ── Filtre Période ── */}
      <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
          🗓️ Période d'analyse —{' '}
          <span style={{ color: '#FF6900' }}>
            {periode === 'aujourd_hui' ? "Aujourd'hui" : periode === 'cette_semaine' ? 'Cette semaine' : periode === 'ce_mois' ? 'Ce mois' : periode === 'custom' ? `${dateDebut||'...'} → ${dateFin||'...'}` : 'Toute la période'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'tout',          label: 'Tout' },
            { key: 'aujourd_hui',   label: "☀️ Aujourd'hui" },
            { key: 'cette_semaine', label: '📆 Cette semaine' },
            { key: 'ce_mois',       label: '🗓️ Ce mois' },
            { key: 'custom',        label: '🔧 Personnalisé' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriode(p.key)}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                background: periode === p.key ? '#FF6900' : 'rgba(255,255,255,0.05)',
                color: periode === p.key ? '#fff' : '#8a8a9a',
                boxShadow: periode === p.key ? '0 4px 12px rgba(255,105,0,0.3)' : 'none' }}>
              {p.label}
            </button>
          ))}
        </div>
        {periode === 'custom' && (
          <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#8a8a9a', whiteSpace: 'nowrap' }}>Du :</label>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 8, color: '#fff', fontSize: 12, colorScheme: 'dark' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#8a8a9a', whiteSpace: 'nowrap' }}>Au :</label>
              <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 8, color: '#fff', fontSize: 12, colorScheme: 'dark' }} />
            </div>
            {(dateDebut || dateFin) && (
              <button onClick={() => { setDateDebut(''); setDateFin(''); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.1)', color: '#ff4757', cursor: 'pointer', fontSize: 12 }}>
                ✕ Effacer
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPIs cliquables */}
      {displayStats && (
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          {[
            { key: 'total',           label: isDeveloppeur ? 'Mes Demandes' : 'Total', value: displayStats.total, variant: null },
            { key: 'nouvelles',       label: '🆕 Nouvelles',     value: displayStats.nouvelles,              variant: null },
            { key: 'en_visite',       label: '🔍 En visite',     value: displayStats.en_visite,              variant: null },
            { key: 'en_attente_rc',   label: '✅ Validées Dev',  value: displayStats.en_attente_rc,          variant: null },
            { key: 'puce_attribuees', label: '🟢 Approuvées RC', value: displayStats.puce_attribuees,        variant: null },
            { key: 'activees',        label: '⚡ Activées',      value: displayStats.activees,               variant: 'ok' },
            { key: 'refusees',        label: '🚫 Refusées',      value: displayStats.refusees,               variant: null },
            ...(!isDeveloppeur ? [
              { key: 'sla_en_retard',   label: '⏰ Délais dépassés',   value: displayStats.sla_en_retard, variant: 'warn' },
              { key: 'taux_activation', label: 'Taux activation',  value: `${displayStats.taux_activation||0}%`, variant: 'ok' },
            ] : []),
          ].map(({ key, label, value, variant }) => {
            const mapped = KPI_STATUS_MAP[key];
            const isClickable = !!mapped && mapped !== '__NONE__';
            const isActive = mapped === '__ALL__' ? !filters.status :
                             mapped === '__SLA__' ? filters.status === 'PUCE_ATTRIBUEE' :
                             filters.status === mapped;
            const exportCount = mapped === '__ALL__' ? filtered.length :
                                mapped === '__SLA__' ? filtered.filter(p => p.status === 'PUCE_ATTRIBUEE').length :
                                mapped && mapped !== '__NONE__' ? filtered.filter(p => p.status === mapped).length : 0;
            return (
              <div key={key} style={{ position: 'relative', cursor: isClickable ? 'pointer' : 'default', transition: 'all 0.15s',
                  outline: isActive ? '2px solid #FF6900' : 'none', borderRadius: 10,
                  transform: isActive ? 'scale(1.03)' : 'scale(1)' }}
                onClick={() => isClickable && handleKpiClick(key)}>
                <Stat label={label} value={value} variant={isActive ? 'ok' : variant}/>
                {/* Bouton export Excel */}
                {isClickable && exportCount > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); exportExcel(key); }}
                    title={`📥 Exporter ${exportCount} prospects en Excel`}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,214,143,0.15)', border: '1px solid rgba(0,214,143,0.35)', borderRadius: 6, color: '#00d68f', padding: '3px 7px', cursor: 'pointer', fontSize: 11, fontWeight: 700, lineHeight: 1, zIndex: 2 }}>
                    📥
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Barre de filtres ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, width: '100%' }}>
        {/* Recherche */}
        <div style={{ position: 'relative', flex: '2 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }}/>
          <input
            placeholder="Réf, nom, téléphone, quartier…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
            onFocus={e => e.target.style.borderColor = '#FF6900'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
        </div>
        {/* Zone */}
        <select value={filters.zone} onChange={e => setFilters(f => ({ ...f, zone: e.target.value }))}
          style={{ flex: '1 1 130px', padding: '9px 10px', background: filters.zone ? 'rgba(255,105,0,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${filters.zone ? 'rgba(255,105,0,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: filters.zone ? '#FF6900' : '#94a3b8', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
          <option value="">📍 Zone</option>
          {['ZONE A','ZONE B','ZONE C','ZONE D','ZONE E','AU BUREAU'].map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {/* Statut */}
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ flex: '1 1 150px', padding: '9px 10px', background: filters.status ? 'rgba(255,105,0,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${filters.status ? 'rgba(255,105,0,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: filters.status ? '#FF6900' : '#94a3b8', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
          <option value="">🔖 Statut</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {/* Superviseur */}
        <select value={filters.superviseur} onChange={e => setFilters(f => ({ ...f, superviseur: e.target.value }))}
          style={{ flex: '1 1 140px', padding: '9px 10px', background: filters.superviseur ? 'rgba(255,105,0,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${filters.superviseur ? 'rgba(255,105,0,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: filters.superviseur ? '#FF6900' : '#94a3b8', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
          <option value="">👤 Superviseur</option>
          {superviseurs.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Développeur */}
        <select value={filters.developpeur} onChange={e => setFilters(f => ({ ...f, developpeur: e.target.value }))}
          style={{ flex: '1 1 140px', padding: '9px 10px', background: filters.developpeur ? 'rgba(255,105,0,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${filters.developpeur ? 'rgba(255,105,0,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: filters.developpeur ? '#FF6900' : '#94a3b8', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
          <option value="">🚀 {"D\u00e9veloppeur"}</option>
          {developpeurs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {/* Reset */}
        {(filters.status || filters.search || filters.superviseur || filters.developpeur || filters.zone) && (
          <button onClick={() => setFilters({ status:'', search:'', superviseur:'', developpeur:'', zone:'' })}
            style={{ padding: '9px 14px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 10, color: '#ff4757', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
            ✕ Effacer
          </button>
        )}
      </div>

      {/* Compteur résultats */}
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        {filtered.length} demande{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
        {filters.status && <span style={{ color: '#FF6900', marginLeft: 6 }}>· filtrée par statut</span>}
        {filters.superviseur && <span style={{ color: '#FF6900', marginLeft: 6 }}>· superviseur: {filters.superviseur}</span>}
        {filters.zone && <span style={{ color: '#FF6900', marginLeft: 6 }}>· zone: {filters.zone}</span>}
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
                <th>Actions</th>
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
                    <td>
                      <span className="status-badge" style={{ background: st.color }}>{st.label}</span>
                      {/* Badge délai dépassé pour PUCE_ATTRIBUEE */}
                      {p.status === 'PUCE_ATTRIBUEE' && p.submitted_at && (() => {
                        // Calculer depuis submitted_at (date de soumission de la demande)
                        const jours = Math.floor((Date.now() - new Date(p.submitted_at).getTime()) / 86400000);
                        if (jours < 1) return null;
                        const urgent = jours >= 5;
                        const warning = jours >= 2;
                        return (
                          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5,
                            background: urgent ? 'rgba(255,71,87,0.12)' : warning ? 'rgba(255,165,2,0.1)' : 'rgba(255,193,7,0.08)',
                            border: `1px solid ${urgent ? 'rgba(255,71,87,0.35)' : warning ? 'rgba(255,165,2,0.3)' : 'rgba(255,193,7,0.25)'}`,
                            borderRadius: 6, padding: '3px 8px', width: 'fit-content' }}>
                            <span style={{ fontSize: 12 }}>{urgent ? '🔴' : warning ? '🟠' : '🟡'}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: urgent ? '#ff4757' : warning ? '#ffa502' : '#fbbf24' }}>
                              {urgent
                                ? `⚡ Urgent ! En attente depuis ${jours} jours`
                                : warning
                                ? `⏰ En attente depuis ${jours} jour${jours > 1 ? 's' : ''}`
                                : `🕐 Soumis il y a ${jours} jour${jours > 1 ? 's' : ''}`}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td>{new Date(p.submitted_at).toLocaleDateString('fr-FR')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {['NOUVELLE','EN_VISITE'].includes(p.status) && (
                        <button onClick={() => setEditProspect(p)}
                          style={{ background: 'rgba(255,165,2,0.15)', color: '#ffa502', border: '1px solid rgba(255,165,2,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 }}>
                          ✏️
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={e => handleDelete(e, p)}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editProspect && (
        <EditProspectModal
          prospect={editProspect}
          onClose={() => setEditProspect(null)}
          onSaved={() => { setEditProspect(null); reload(); }}
        />
      )}
    </>} {/* fin typeVue OM */}
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

  const isAdmin = ['admin', 'manager', 'ADMIN', 'MANAGER', 'conformite', 'CONFORMITE', 'responsable_produit_et_qualit_oprationnelle_'].includes(currentUser?.role);
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
  const nouvelles = prospects.filter(p => p.status === 'NOUVELLE');
  const refuseesDev = prospects.filter(p => p.status === 'REFUSEE_DEV');
  const etape2Count = nouvelles.length + refuseesDev.length;
  const enVisite = prospects.filter(p => p.status === 'EN_VISITE');
  const validesDev = prospects.filter(p => ['VALIDEE_DEV', 'EN_ATTENTE_RC'].includes(p.status));
  const approuveesRC = prospects.filter(p => p.status === 'APPROUVEE_RC');

  const workflowTabs = [
    { id: 'etape2', label: '📤 Étape 2 — Attribution visite',   count: etape2Count, show: isRC },
    { id: 'etape3', label: '🔍 Étape 3 — Décision Dev',         count: enVisite.length,  show: isDev || isRC },
    { id: 'etape4', label: '👔 Étape 4 — Validation RC',        count: validesDev.length, show: isRC },
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
              refuseesDev={refuseesDev}
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
function Etape2Attribution({ prospects, refuseesDev = [], developers, onDone, onOpen }) {
  return (
    <>
      <StepLegend
        step={2}
        title="Attribution aux développeurs pour visite terrain"
        desc="Le Responsable Commercial affecte chaque nouvelle demande à un développeur qui devra se rendre sur le terrain pour valider ou rejeter le lieu."
        next="➡️ Après attribution : le développeur effectue la visite et donne sa décision (Étape 3)"
        color="#f59e0b"
      />

      {/* ── Refus Dev à confirmer ── */}
      {refuseesDev.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#ff4757' }}>{refuseesDev.length} demande{refuseesDev.length > 1 ? 's' : ''} refusée{refuseesDev.length > 1 ? 's' : ''} par le développeur</div>
              <div style={{ fontSize: 12, color: '#8a8a9a' }}>Confirmer le refus définitif ou réaffecter à un autre développeur</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {refuseesDev.map(p => <RefusDevCard key={p.id} prospect={p} developers={developers} onDone={onDone} onOpen={onOpen} />)}
          </div>
        </div>
      )}

      {/* ── Nouvelles demandes ── */}
      {prospects.length === 0 ? (
        <div className="empty-state">✅ Aucune nouvelle demande en attente d'attribution.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prospects.map(p => <Attribution2Card key={p.id} prospect={p} developers={developers} onDone={onDone} onOpen={onOpen}/>)}
        </div>
      )}
    </>
  );
}

// ── Carte Refus Dev : RC confirme ou réaffecte ────────────────────────────────
function RefusDevCard({ prospect: p, developers, onDone, onOpen }) {
  const [devId, setDevId] = useState('');
  const [busy, setBusy] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const confirmerRefus = async () => {
    setBusy(true);
    setShowConfirmModal(false);
    try {
      await api.post(`/prospects/${p.id}/confirm-refus-dev`);
      onDone();
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  const reaffecter = async () => {
    if (!devId) return alert('Choisissez un développeur');
    setBusy(true);
    try {
      let payload;
      if (devId.startsWith('user_')) {
        payload = { developer_id: parseInt(devId.replace('user_', '')) };
      } else {
        const dev = developers.find(d => d.id === devId);
        payload = { developer_nom: `${dev?.nom || ''} ${dev?.prenom || ''}`.trim() };
      }
      await api.post(`/prospects/${p.id}/assign-visit`, payload);
      onDone();
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.2)', borderLeft: '4px solid #ff4757', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.reference} — {p.prenom} {p.nom}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 2 }}>📞 {p.telephone_principal} · 📍 {p.quartier || '—'}</div>
          {p.visit_assigned_to && (
            <div style={{ fontSize: 12, color: '#ff4757', marginTop: 4 }}>
              ❌ Refusé par : {p.visit_assigned_to.prenom || ''} {p.visit_assigned_to.nom || ''}
            </div>
          )}
          {p.submitted_by && (
            <div style={{ fontSize: 11, color: '#5f6cf5', marginTop: 4 }}>
              👤 Soumis par : {p.submitted_by.prenom || ''} {p.submitted_by.nom || ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,71,87,0.15)', color: '#ff4757' }}>❌ Refusé Dev</span>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => onOpen(p)}>Voir détails</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setShowConfirmModal(true)} disabled={busy}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ff4757', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: busy ? 0.7 : 1, whiteSpace: 'nowrap' }}>
          {busy ? '⏳...' : '✅ Confirmer le refus'}
        </button>
        <select value={devId} onChange={e => setDevId(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 12 }}>
          <option value="">— Réaffecter à un autre développeur —</option>
          {developers.map(d => <option key={d.id} value={d.id}>{d.nom} {d.prenom || ''}{d.zone ? ` · ${d.zone}` : ''}</option>)}
        </select>
        <button onClick={reaffecter} disabled={!devId || busy}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: devId && !busy ? '#0ea5e9' : 'rgba(14,165,233,0.3)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: devId ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
          🔄 Réaffecter
        </button>
      </div>

      {/* ── Modal de confirmation personnalisé ── */}
      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
          onClick={() => setShowConfirmModal(false)}>
          <div style={{ background: 'linear-gradient(135deg, #1a0a0a 0%, #1a1a2e 100%)', border: '2px solid rgba(255,71,87,0.4)', borderRadius: 20, padding: '32px 36px', maxWidth: 440, width: '90%', boxShadow: '0 24px 80px rgba(255,71,87,0.2)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            {/* Icône */}
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,71,87,0.15)', border: '2px solid rgba(255,71,87,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 20px' }}>⚠️</div>
            {/* Titre */}
            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 10 }}>Confirmer le refus définitif ?</h3>
            {/* Infos prospect */}
            <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>{p.reference} — {p.prenom} {p.nom}</div>
              {p.visit_assigned_to && (
                <div style={{ fontSize: 12, color: '#ff4757' }}>❌ Refusé par : {p.visit_assigned_to.prenom || ''} {p.visit_assigned_to.nom || ''}</div>
              )}
            </div>
            {/* Message */}
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
              Cette action est <strong style={{ color: '#ff4757' }}>irréversible</strong>.<br/>
              La demande passera au statut <strong style={{ color: '#fff' }}>Refusée RC</strong> et quittera le workflow.
            </p>
            {/* Boutons */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setShowConfirmModal(false)}
                style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                Annuler
              </button>
              <button onClick={confirmerRefus}
                style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#ff4757,#c0392b)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,71,87,0.4)' }}>
                ✅ Oui, confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
            {/* Développeur qui a soumis la demande - identique à l'étape 4 */}
            {p.submitted_by && (
              <div style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(55,66,250,0.15)', color: '#5f6cf5', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                  👤 Soumis par : {p.submitted_by.prenom || ''} {p.submitted_by.nom || ''}
                </span>
                {p.submitted_by.zone && (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {p.submitted_by.zone}</span>
                )}
              </div>
            )}
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
  const [cancelMotif, setCancelMotif] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [gpsLat, setGpsLat] = useState(p.latitude || null);
  const [gpsLng, setGpsLng] = useState(p.longitude || null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const hasGps = p.latitude && p.longitude;

  const captureGPS = () => {
    if (!navigator.geolocation) { alert('Géolocalisation non disponible sur cet appareil'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); setGpsLoading(false); },
      () => { alert('Impossible de récupérer la position. Vérifiez les permissions GPS.'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };
  const isAdmin = ['admin', 'manager', 'ADMIN', 'MANAGER', 'rc', 'RC', 'conformite', 'CONFORMITE', 'responsable_produit_et_qualit_oprationnelle_'].includes(currentUser?.role);
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

  const cancelVisit = async () => {
    setBusy(true);
    try {
      await api.post(`/prospects/${p.id}/cancel-visit`, { motif: cancelMotif });
      setShowCancelForm(false);
      setCancelMotif('');
      onDone();
    } catch (e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  const [success, setSuccess] = useState(null); // {approved: bool}
  const { fetchNotifications } = useNotifStore();

  const decide = async (approved) => {
    if (comment.trim().length < 3) { alert('Veuillez saisir un commentaire (min 3 caractères).'); return; }
    if (!gpsLat || !gpsLng) {
      return alert('⚠️ La géolocalisation est obligatoire. Appuyez sur "📍 Capturer ma position" avant de valider.');
    }
    setBusy(true);
    try {
      await prospectService.devDecision(p.id, {
        approved,
        comment,
        latitude: gpsLat,
        longitude: gpsLng,
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

        {/* ── Annulation attribution visite (RC/Admin) ── */}
        {isAdmin && !success && (
          <div style={{ marginTop: 10 }}>
            {!showCancelForm ? (
              <button onClick={() => setShowCancelForm(true)}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,71,87,0.35)', background: 'rgba(255,71,87,0.07)', color: '#ff4757', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ↩️ Annuler l'attribution de visite
              </button>
            ) : (
              <div style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 10, padding: '12px 14px', marginTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ff4757', marginBottom: 8 }}>↩️ Annuler l'attribution</div>
                <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 8 }}>La demande reviendra à <strong style={{ color: '#fff' }}>Nouvelle</strong> et le développeur sera libéré.</div>
                <textarea value={cancelMotif} onChange={e => setCancelMotif(e.target.value)}
                  placeholder="Motif optionnel (ex: mauvaise affectation, erreur de zone…)"
                  rows={2} style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, color: '#fff', fontSize: 12, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowCancelForm(false)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8a8a9a', cursor: 'pointer', fontSize: 12 }}>Retour</button>
                  <button onClick={cancelVisit} disabled={busy}
                    style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: busy ? 'rgba(255,71,87,0.3)' : '#ff4757', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                    {busy ? '⏳...' : '✅ Confirmer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {canDecide && (
          <>
            {/* ── Bloc GPS : obligatoire si le prospect n'a pas encore de géoloc ── */}
            <div style={{ marginTop: 12, background: gpsLat && gpsLng ? 'rgba(34,197,94,0.08)' : 'rgba(255,71,87,0.08)', border: `1px solid ${gpsLat && gpsLng ? 'rgba(34,197,94,0.3)' : 'rgba(255,71,87,0.3)'}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: gpsLat && gpsLng ? '#22c55e' : '#ff4757' }}>
                    {gpsLat && gpsLng ? `✅ Position capturée : ${parseFloat(gpsLat).toFixed(4)}, ${parseFloat(gpsLng).toFixed(4)}` : '⚠️ Position GPS obligatoire pour valider'}
                  </div>
                  {hasGps && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>GPS déjà enregistré — vous pouvez re-capturer sur place si besoin</div>}
                </div>
                <button type="button" onClick={captureGPS} disabled={gpsLoading}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: gpsLoading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    background: gpsLat && gpsLng ? 'rgba(34,197,94,0.15)' : 'linear-gradient(135deg,#FF6900,#ff9500)',
                    color: gpsLat && gpsLng ? '#22c55e' : '#fff' }}>
                  {gpsLoading ? '⏳ Localisation…' : gpsLat && gpsLng ? '🔄 Re-capturer' : '📍 Capturer ma position'}
                </button>
              </div>
            </div>

            <textarea
              placeholder="Justification obligatoire (ex: lieu accessible, bon emplacement, zone concurrentielle…)"
              value={comment} onChange={e => setComment(e.target.value)}
              style={{ width: '100%', marginTop: 8, minHeight: 70, boxSizing: 'border-box' }}
            />
            <div className="action-bar" style={{ marginTop: 8 }}>
              <button className="btn-success" disabled={busy || comment.trim().length < 3 || !gpsLat || !gpsLng} onClick={() => decide(true)}>
                <CheckCircle size={14}/> Valider le prospect
              </button>
              <button className="btn-danger" disabled={busy || comment.trim().length < 3 || !gpsLat || !gpsLng} onClick={() => decide(false)}>
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
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
          📞 {p.telephone_principal} · 📍 {p.quartier || '—'}
        </div>
        {/* Développeur qui a soumis la demande */}
        {p.submitted_by && (
          <div style={{ fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: 'rgba(55,66,250,0.15)', color: '#5f6cf5', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
              👤 Soumis par : {p.submitted_by.prenom || ''} {p.submitted_by.nom || ''}
            </span>
            {p.submitted_by.zone && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {p.submitted_by.zone}</span>
            )}
          </div>
        )}
        {/* Développeur de visite */}
        {p.visit_assigned_to && (
          <div style={{ fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: 'rgba(255,105,0,0.12)', color: '#FF6900', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
              🔍 Visite effectuée par : {p.visit_assigned_to.prenom || ''} {p.visit_assigned_to.nom || ''}
            </span>
          </div>
        )}
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
  const isAdmin = ['admin', 'manager', 'ADMIN', 'MANAGER', 'rc', 'RC', 'conformite', 'CONFORMITE', 'responsable_produit_et_qualit_oprationnelle_'].includes(currentUser?.role);

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
    pieces_fichiers: [],  // Multi-fichiers obligatoires
    // Géolocalisation (pré-remplie depuis le prospect si disponible)
    gps_lat: p.latitude || '',
    gps_lng: p.longitude || '',
  });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const hasGps = p.latitude && p.longitude; // Prospect a déjà une géoloc

  const captureGPSActivation = () => {
    if (!navigator.geolocation) { alert('Géolocalisation non disponible sur cet appareil'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({ ...f, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }));
        setGpsLoading(false);
      },
      err => { alert('Impossible de récupérer la position. Vérifiez les permissions GPS.'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

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
    if (!form.pieces_fichiers || form.pieces_fichiers.length === 0) {
      return alert('Les documents / pièces d\'identité sont obligatoires. Ajoutez au moins un fichier.');
    }
    // Vérification géolocalisation obligatoire
    if (!form.gps_lat || !form.gps_lng) {
      return alert('⚠️ La géolocalisation est obligatoire. Appuyez sur "📍 Capturer ma position" pour enregistrer les coordonnées GPS du local.');
    }
    setBusy(true);
    try {
      // 0) Mettre à jour la géolocalisation du prospect si elle manquait
      if (!hasGps && form.gps_lat && form.gps_lng) {
        await api.patch(`/prospects/${p.id}`, {
          latitude: parseFloat(form.gps_lat),
          longitude: parseFloat(form.gps_lng),
        });
      }
      // 1) Uploader d'abord les pièces obligatoires (le backend exige un champ "kind")
      let uploadFailures = 0;
      for (const file of form.pieces_fichiers) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('kind', file.type?.startsWith('image/') ? 'PHOTO_LOCAL_FACADE' : 'PIECE_IDENTITE');
          await api.post(`/prospects/${p.id}/attachments`, fd, { headers: {'Content-Type':'multipart/form-data'} });
        } catch(err) { uploadFailures++; console.warn('Upload pièce erreur:', file.name, err); }
      }
      if (uploadFailures === form.pieces_fichiers.length) {
        throw new Error("Échec de l'envoi des pièces jointes. Vérifiez le format (JPG, PNG, PDF · max 5 Mo) et réessayez.");
      }
      // 2) Puis soumettre pour validation RC/Admin (avec les infos équipe)
      await api.post(`/prospects/${p.id}/soumettre-conformite`, {
        activation_superviseur: form.superviseur || '',
        activation_gestionnaire: form.gestionnaire || '',
        activation_teleconseillere: form.teleconseillere || '',
        activation_developpeur: form.developpeur || '',
        activation_type_pdv: form.type_pdv || '',
      });
      setSuccess(true);
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setBusy(false); }
  };

  return (
    <>
      {success && (
        <SuccessModal
          title="📤 Formulaire soumis pour validation"
          message={`Le formulaire d'activation du prospect ${p.reference} — ${p.prenom} ${p.nom} a été transmis. Il est maintenant en attente de validation par le RC, le Responsable de Conformité ou l'Admin.`}
          next="⏳ Rendez-vous dans l'onglet « ✅ Conformité » : après vérification des informations et des pièces, l'activation sera confirmée et le PDV créé."
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
            <AFL label="📎 Documents & Pièces d'identité (plusieurs fichiers) *" required>
              <div
                onClick={() => document.getElementById('pieces-multi-upload').click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='rgba(255,105,0,0.8)'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor='rgba(255,105,0,0.3)'; }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor='rgba(255,105,0,0.3)';
                  const files = Array.from(e.dataTransfer.files);
                  setForm(f => ({ ...f, pieces_fichiers: [...(f.pieces_fichiers||[]), ...files] }));
                }}
                style={{
                  border: `2px dashed ${form.pieces_fichiers?.length ? 'rgba(34,197,94,0.6)' : 'rgba(255,105,0,0.4)'}`,
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'center',
                  background: form.pieces_fichiers?.length ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.2s',
                }}>
                <input
                  id="pieces-multi-upload"
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files);
                    setForm(f => ({ ...f, pieces_fichiers: [...(f.pieces_fichiers||[]), ...files] }));
                    e.target.value = '';
                  }}
                />
                {(!form.pieces_fichiers || form.pieces_fichiers.length === 0) ? (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                    <div style={{ fontSize: 13, color: '#ffa502', fontWeight: 700 }}>Cliquer ou glisser les fichiers ici</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>CNI, RCCM, reçus · JPG, PNG, PDF · <strong style={{ color: '#ff4757' }}>Obligatoire</strong></div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700, marginBottom: 8 }}>✅ {form.pieces_fichiers.length} fichier{form.pieces_fichiers.length > 1 ? 's' : ''} sélectionné{form.pieces_fichiers.length > 1 ? 's' : ''}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                      {form.pieces_fichiers.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 7, padding: '3px 8px', fontSize: 11 }}>
                          <span>{f.type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                          <span style={{ color: '#22c55e', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <button type="button" onClick={ev => { ev.stopPropagation(); setForm(fm => ({ ...fm, pieces_fichiers: fm.pieces_fichiers.filter((_,j)=>j!==i) })); }}
                            style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Cliquer pour ajouter d'autres fichiers</div>
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

          {/* ── GPS OBLIGATOIRE si pas de géoloc ── */}
          {!hasGps && (
            <div style={{ background: form.gps_lat && form.gps_lng ? 'rgba(34,197,94,0.08)' : 'rgba(255,71,87,0.08)', border: `2px solid ${form.gps_lat && form.gps_lng ? '#22c55e' : '#ff4757'}`, borderRadius: 14, padding: '18px 20px', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>📍</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: form.gps_lat && form.gps_lng ? '#22c55e' : '#ff4757' }}>
                    {form.gps_lat && form.gps_lng ? '✅ Position GPS capturée' : '⚠️ Géolocalisation obligatoire — non enregistrée'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {form.gps_lat && form.gps_lng
                      ? `${parseFloat(form.gps_lat).toFixed(5)}, ${parseFloat(form.gps_lng).toFixed(5)}`
                      : "Ce PDV n'a pas de coordonn\u00e9es GPS. Vous devez capturer la position GPS du local avant de soumettre."}
                  </div>
                </div>
              </div>
              <button type="button" onClick={captureGPSActivation} disabled={gpsLoading}
                style={{ width: '100%', padding: '13px', background: gpsLoading ? 'rgba(255,255,255,0.05)' : form.gps_lat && form.gps_lng ? 'rgba(34,197,94,0.15)' : 'linear-gradient(135deg, #FF6900, #ff9500)', border: `1px solid ${form.gps_lat && form.gps_lng ? 'rgba(34,197,94,0.4)' : 'transparent'}`, borderRadius: 10, color: gpsLoading ? '#64748b' : form.gps_lat && form.gps_lng ? '#22c55e' : '#fff', fontSize: 14, fontWeight: 800, cursor: gpsLoading ? 'not-allowed' : 'pointer' }}>
                {gpsLoading ? '⏳ Localisation en cours...' : form.gps_lat && form.gps_lng ? '🔄 Re-capturer la position GPS' : '📍 Capturer ma position GPS (obligatoire)'}
              </button>
            </div>
          )}
          {/* ── GPS déjà enregistré ── */}
          {hasGps && (
            <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, color: '#22c55e' }}>
                ✅ Position GPS : <strong>{parseFloat(p.latitude).toFixed(5)}, {parseFloat(p.longitude).toFixed(5)}</strong>
              </div>
              <a href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0ea5e9' }}>Voir carte →</a>
            </div>
          )}

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
              {busy ? '⏳ Envoi en cours…' : '📤 Soumettre pour validation RC/Admin'}
            </button>
          </div>

        </form>
      </div>
    </>
  );
}


// =============================================================================
// ONGLET CONFORMITÉ & VALIDATION FINALE (RC / Admin / Resp. Conformité)
// =============================================================================

// Galerie des pièces jointes soumises par le développeur
function AttachmentGallery({ prospectId }) {
  const [items, setItems] = useState(null);

  // Base fichiers = base API sans le suffixe /api
  const FILE_BASE = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');

  useEffect(() => {
    let alive = true;
    api.get(`/prospects/${prospectId}/attachments`)
      .then(r => { if (alive) setItems(r.data || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [prospectId]);

  if (items === null) return <div style={{ fontSize: 12, color: '#8a8a9a' }}>Chargement des pièces…</div>;
  if (items.length === 0) return <div style={{ fontSize: 12, color: '#ff4757' }}>⚠️ Aucune pièce jointe soumise.</div>;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {items.map(a => {
        const href = a.url ? `${FILE_BASE}${a.url.replace('/static/', '/')}` : null;
        const isImg = (a.mime_type || '').startsWith('image/');
        return (
          <a key={a.id} href={href || '#'} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', textDecoration: 'none', width: 120 }}>
            <div style={{ width: 120, height: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isImg && href
                ? <img src={href} alt={a.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 34 }}>📄</span>}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</div>
          </a>
        );
      })}
    </div>
  );
}

function TabConformite({ currentUser, onRefresh }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewProspect, setViewProspect] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await prospectService.list({ status: 'EN_ATTENTE_CONFORMITE', limit: 200 });
      setProspects(list);
    } catch (e) { alert('Erreur : ' + (errMsg(e))); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const valider = async (p) => {
    if (!window.confirm(`Confirmer l'activation définitive de ${p.prenom} ${p.nom} (${p.reference}) ?\nCela créera le PDV dans le système.`)) return;
    setBusy(true);
    try {
      await api.post(`/prospects/${p.id}/valider-conformite`);
      setViewProspect(null);
      await reload();
      onRefresh && onRefresh();
      alert('✅ Activation confirmée ! Le PDV a été créé dans le système.');
    } catch(e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  const rejeter = async (p) => {
    const motif = prompt('Motif de rejet (informera le développeur) :');
    if (motif === null) return;
    setBusy(true);
    try {
      await api.post(`/prospects/${p.id}/rejeter-conformite`, { motif });
      setViewProspect(null);
      await reload();
      onRefresh && onRefresh();
      alert('↩️ Formulaire retourné au développeur pour correction.');
    } catch(e) { alert('Erreur : ' + errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <StepLegend
        step={6}
        title="Conformité & Validation Finale"
        desc="Le développeur a soumis le formulaire d'activation. Le RC, le Responsable de Conformité ou l'Admin doit vérifier toutes les informations et les pièces jointes avant de confirmer l'activation définitive."
        next="✅ Après validation : le PDV est créé dans le système et la puce est activée."
        color="#22c55e"
      />

      {loading ? (
        <div className="loading-state">Chargement…</div>
      ) : prospects.length === 0 ? (
        <div className="empty-state">✅ Aucun formulaire en attente de validation.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {prospects.map(p => (
            <div key={p.id} style={{ background: 'rgba(34,197,94,0.04)', border: '2px solid rgba(34,197,94,0.25)', borderRadius: 14, padding: '18px 20px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', marginBottom: 4 }}>
                    {p.reference} — {p.prenom} {p.nom}
                  </div>
                  <div style={{ fontSize: 12, color: '#8a8a9a' }}>
                    📞 {p.telephone_principal} · 📍 {p.quartier || '—'} · {p.type_local || '—'}
                  </div>
                  {p.submitted_by && (
                    <div style={{ fontSize: 12, color: '#5f6cf5', marginTop: 4 }}>
                      👤 Soumis par : {p.submitted_by.prenom || ''} {p.submitted_by.nom || ''}
                    </div>
                  )}
                  {p.activation_assigned_to && (
                    <div style={{ fontSize: 12, color: '#FF6900', marginTop: 2 }}>
                      ⚡ Formulaire soumis par : {p.activation_assigned_to.prenom || ''} {p.activation_assigned_to.nom || ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 700 }}>
                    📋 En attente de conformité
                  </span>
                  <button onClick={() => setViewProspect(viewProspect?.id === p.id ? null : p)}
                    style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>
                    {viewProspect?.id === p.id ? 'Masquer détails' : '📋 Voir détails'}
                  </button>
                </div>
              </div>

              {/* Infos activation (puce, PDV) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'N° Puce', value: p.puce_numero || '—', color: '#22c55e' },
                  { label: 'Type PDV', value: p.puce_type || p.type_local || '—', color: '#ffa502' },
                  { label: 'Zone', value: p.puce_zone || '—', color: '#3742fa' },
                ].map((info, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 9, border: `1px solid ${info.color}20` }}>
                    <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 3 }}>{info.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: info.color }}>{info.value}</div>
                  </div>
                ))}
              </div>

              {/* Pièces jointes */}
              {viewProspect?.id === p.id && (
                <div style={{ marginBottom: 16, padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>📎 Pièces jointes soumises</div>
                  <AttachmentGallery prospectId={p.id} />
                </div>
              )}

              {/* Boutons d'action */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button onClick={() => rejeter(p)} disabled={busy}
                  style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,71,87,0.4)', background: 'rgba(255,71,87,0.08)', color: '#ff4757', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  ↩️ Renvoyer pour correction
                </button>
                <button onClick={() => valider(p)} disabled={busy}
                  style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                  {busy ? '⏳ Confirmation...' : '✅ Confirmer l\'activation définitive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// =============================================================================
// ONGLET RÉPARTITION PAR AGENT
// =============================================================================
const COLORS_CHART = ['#FF6900','#3742fa','#22c55e','#ffa502','#a29bfe','#00d68f','#ff4757','#fd79a8','#0ea5e9','#f59e0b'];

function AgentBar({ data, valueKey }) {
  if (!data?.length) return <div style={{ textAlign: 'center', padding: '30px', color: '#8a8a9a', fontSize: 13 }}>📭 Aucune donnée</div>;
  const max = Math.max(...data.map(d => d[valueKey] || 0)) || 1;
  return (
    <div>
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const pct = Math.round(val / max * 100);
        const clr = COLORS_CHART[i % COLORS_CHART.length];
        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: clr + '20', border: '2px solid ' + clr + '50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: clr }}>{i + 1}</div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{d.agent}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {d.activees !== undefined && <span style={{ fontSize: 11, color: '#22c55e' }}>✅ {d.activees}</span>}
                {d.refusees !== undefined && d.refusees > 0 && <span style={{ fontSize: 11, color: '#ff4757' }}>❌ {d.refusees}</span>}
                {d.validees !== undefined && <span style={{ fontSize: 11, color: '#00d68f' }}>✔ {d.validees}</span>}
                <span style={{ fontWeight: 800, color: clr, fontSize: 16, minWidth: 24, textAlign: 'right' }}>{val}</span>
              </div>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg,' + clr + ',' + clr + '99)', borderRadius: 6, transition: 'width 0.8s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentSection({ title, data, valueKey, color }) {
  const max = data.length ? Math.max(...data.map(d => d[valueKey]||0)) : 1;
  const totalVal = data.reduce((s, d) => s + (d[valueKey]||0), 0);
  const hasActivees = data.some(d => d.activees !== undefined);
  const hasRefusees = data.some(d => d.refusees > 0);
  const hasValidees = data.some(d => d.validees !== undefined);
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, color: '#fff' }}>{title}</h3>
      {data.length > 0 && (hasActivees || hasRefusees || hasValidees) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 600 }}>Légende :</span>
          <span style={{ fontSize: 11, color: '#8a8a9a' }}><span style={{ fontWeight: 800, color: '#fff' }}>N°</span> = Total</span>
          {hasActivees && <span style={{ fontSize: 11, color: '#8a8a9a' }}>✅ = Activées</span>}
          {hasRefusees && <span style={{ fontSize: 11, color: '#8a8a9a' }}>❌ = Refusées</span>}
          {hasValidees && <span style={{ fontSize: 11, color: '#8a8a9a' }}>✔ = Validées</span>}
        </div>
      )}
      {!data.length ? <div style={{ color: '#8a8a9a', fontSize: 13, textAlign: 'center', padding: '20px' }}>📭 Aucune donnée</div> :
        data.map((d, i) => {
          const val = d[valueKey]||0;
          const pct = Math.round(val/max*100);
          const clrs = ['#FF6900','#3742fa','#22c55e','#ffa502','#a29bfe','#00d68f'];
          const clr = clrs[i%clrs.length];
          return (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: clr+'20', border: '2px solid '+clr+'50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: clr }}>{i+1}</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{d.agent}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {d.activees !== undefined && <span style={{ fontSize: 11, color: '#22c55e' }}>✅ {d.activees}</span>}
                  {d.refusees > 0 && <span style={{ fontSize: 11, color: '#ff4757' }}>❌ {d.refusees}</span>}
                  {d.validees !== undefined && <span style={{ fontSize: 11, color: '#00d68f' }}>✔ {d.validees}</span>}
                  <span style={{ fontWeight: 800, color: clr, fontSize: 15 }}>{val}</span>
                </div>
              </div>
              <div style={{ height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct+'%', background: clr, borderRadius: 8, transition: 'width 0.8s ease' }} />
              </div>
            </div>
          );
        })
      }
      {data.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#8a8a9a', fontWeight: 600 }}>TOTAL — {data.length} agent{data.length > 1 ? 's' : ''}</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{totalVal}</span>
        </div>
      )}
    </div>
  );
}

function TabRepartition() {
  const [periode, setPeriode] = React.useState('tout');
  const [dateDebut, setDateDebut] = React.useState('');
  const [dateFin, setDateFin] = React.useState('');

  const periodes = [
    { key: 'tout',           label: '📅 Toute la période' },
    { key: 'aujourd_hui',   label: "☀️ Aujourd'hui" },
    { key: 'cette_semaine', label: '📆 Cette semaine' },
    { key: 'ce_mois',       label: '🗓️ Ce mois' },
    { key: 'ce_trimestre',  label: '📊 Ce trimestre' },
    { key: 'custom',        label: '🔧 Dates personnalisées' },
  ];

  const buildParams = () => {
    if (periode === 'custom') {
      const p = {};
      if (dateDebut) p.date_debut = dateDebut;
      if (dateFin) p.date_fin = dateFin;
      return p;
    }
    if (periode === 'tout') return {};
    return { periode };
  };

  const { data, isLoading } = useQuery(['repartition-agents', periode, dateDebut, dateFin],
    () => api.get('/prospects/stats/repartition-agents', { params: buildParams() }).then(r => r.data),
    { staleTime: 30000 }
  );
  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement des statistiques...</div>;
  const prospections = data?.prospections || [];
  const visites = data?.visites || [];
  const activations = data?.activations || [];
  const total = data?.total_prospects || 0;
  const periodeLabel = data?.periode?.label || 'Toute la période';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Filtres Période ── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, color: '#8a8a9a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
          🗓️ Période d'analyse — <span style={{ color: '#FF6900' }}>{periodeLabel}</span>
        </div>
        {/* Boutons de période rapide */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: periode === 'custom' ? 14 : 0 }}>
          {[
            { key: 'tout',           label: 'Tout' },
            { key: 'aujourd_hui',    label: "☀️ Aujourd'hui" },
            { key: 'cette_semaine',  label: '📆 Cette semaine' },
            { key: 'ce_mois',        label: '🗓️ Ce mois' },
            { key: 'ce_trimestre',   label: '📊 Ce trimestre' },
            { key: 'custom',         label: '🔧 Personnalisé' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriode(p.key)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                background: periode === p.key ? '#FF6900' : 'rgba(255,255,255,0.05)',
                color: periode === p.key ? '#fff' : '#8a8a9a',
                boxShadow: periode === p.key ? '0 4px 12px rgba(255,105,0,0.3)' : 'none',
              }}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Dates personnalisées */}
        {periode === 'custom' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#8a8a9a', whiteSpace: 'nowrap' }}>Du :</label>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 8, color: '#fff', fontSize: 12, colorScheme: 'dark' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#8a8a9a', whiteSpace: 'nowrap' }}>Au :</label>
              <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 8, color: '#fff', fontSize: 12, colorScheme: 'dark' }} />
            </div>
            {(dateDebut || dateFin) && (
              <button onClick={() => { setDateDebut(''); setDateFin(''); }}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.1)', color: '#ff4757', cursor: 'pointer', fontSize: 12 }}>
                ✕ Effacer
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { icon: '📋', label: 'Total Demandes', value: total, color: '#3742fa' },
          { icon: '👥', label: 'Agents Prospecteurs', value: prospections.length, color: '#FF6900' },
          { icon: '🔍', label: 'Agents Visiteurs', value: visites.length, color: '#ffa502' },
          { icon: '✅', label: 'Agents Activateurs', value: activations.length, color: '#22c55e' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderTop: '3px solid '+k.color, borderRadius: 14, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#8a8a9a', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <AgentSection title="📋 Prospections par Agent" data={prospections} valueKey="total" color="#FF6900" />
        <AgentSection title="🔍 Visites Terrain par Agent" data={visites} valueKey="total" color="#ffa502" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <AgentSection title="⚡ Activations par Agent" data={activations} valueKey="total" color="#22c55e" />
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16, color: '#fff' }}>🎯 Par Statut</h3>
          {Object.entries(data?.par_statut || {}).map(([s, v], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 12, color: '#aaa' }}>{s.replace(/_/g,' ')}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: s==='PUCE_ACTIVEE'?'#22c55e':s==='REFUSEE_RC'?'#ff4757':'#ffa502' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Répartition par Zone — Activations seulement */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, color: '#fff' }}>📍 Activations & Taux par Zone</h3>
        <p style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 16 }}>
          Utilise le filtre <strong style={{ color: '#FF6900' }}>📍 Zone</strong> dans l'onglet Demandes pour voir les {(data?.par_statut?.PUCE_ACTIVEE || 0) + (data?.par_statut?.PUCE_ATTRIBUEE || 0)} activations par zone.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { zone: 'ZONE A', color: '#FF6900' },
            { zone: 'ZONE B', color: '#3742fa' },
            { zone: 'ZONE C', color: '#22c55e' },
            { zone: 'ZONE D', color: '#ffa502' },
            { zone: 'ZONE E', color: '#a29bfe' },
            { zone: 'AU BUREAU', color: '#8a8a9a' },
          ].map((z, i) => (
            <div key={z.zone} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${z.color}25`, borderLeft: `4px solid ${z.color}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontWeight: 800, color: z.color, fontSize: 13, minWidth: 80 }}>{z.zone}</span>
              <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${(6 - i) * 14}%`, background: z.color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, color: '#8a8a9a', whiteSpace: 'nowrap' }}>Voir dans Demandes →</span>
            </div>
          ))}
        </div>
      </div>
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
function SuccessDemandeModal({ prospect, onClose, onNewDemande }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000, padding: 16,
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1a1a2e 100%)',
        border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20,
        maxWidth: 480, width: '100%', padding: '36px 32px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        textAlign: 'center',
      }}>
        {/* Icône animée */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))',
          border: '2px solid rgba(16,185,129,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
        }}>✅</div>

        {/* Titre */}
        <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981', marginBottom: 8 }}>
          Demande envoyée avec succès !
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
          Votre demande pour <b style={{ color: '#e2e8f0' }}>{prospect?.prenom} {prospect?.nom}</b> a bien été reçue par l'équipe.
        </div>

        {/* Étapes suivantes */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '16px 18px', marginBottom: 24, textAlign: 'left',
        }}>
          <div style={{ fontSize: 11, color: '#FF6900', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            ⚙️ Prochaines étapes
          </div>
          {[
            { icon: '🔍', step: '1', label: 'Attribution visite', desc: 'Le RC va affecter un développeur pour effectuer la visite terrain.' },
            { icon: '🏃', step: '2', label: 'Visite terrain', desc: 'Le développeur se rend sur place pour vérifier le lieu et rencontrer le prospect.' },
            { icon: '✅', step: '3', label: 'Validation RC', desc: 'Le RC examine le rapport de visite et prend une décision.' },
            { icon: '⚡', step: '4', label: 'Activation puce', desc: 'Si approuvé, la puce Orange Money est activée et le PDV créé.' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < 3 ? 10 : 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,105,0,0.12)', border: '1px solid rgba(255,105,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Étape {s.step} — {s.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#475569', marginBottom: 20 }}>
          Vous pouvez suivre l'avancement dans l'onglet <b style={{ color: '#FF6900' }}>Workflow</b>.
        </div>

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{
            padding: '10px 24px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: '#94a3b8',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            Fermer
          </button>
          <button onClick={onNewDemande} style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#FF6900,#ff9500)',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(255,105,0,0.35)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ➕ Nouvelle demande
          </button>
        </div>
      </div>
    </div>
  );
}

// Composant autocomplete pour le champ Quartier
function QuartierInput({ value, onChange, required, style }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const ref = useRef(null);

  const IS_Q = {
    width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${required && !value ? 'rgba(255,71,87,0.5)' : 'rgba(255,255,255,0.12)'}`,
    borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    ...style,
  };

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await api.get('/prospects/quartiers', { params: { q } });
      setSuggestions(res.data || []);
    } catch { setSuggestions([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchSuggestions(value), 200);
    return () => clearTimeout(t);
  }, [value, fetchSuggestions]);

  // Fermer suggestions au clic extérieur
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowSugg(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        style={IS_Q}
        value={value}
        onChange={e => { onChange(e.target.value); setShowSugg(true); }}
        onFocus={() => { setShowSugg(true); fetchSuggestions(value); }}
        placeholder={required ? 'Quartier *' : 'Quartier / Commune'}
        required={required}
      />
      {showSugg && suggestions.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 999, top: '100%', left: 0, right: 0, marginTop: 2,
          background: '#1e2236', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
          {suggestions.map((s, i) => (
            <div key={i} onMouseDown={() => { onChange(s); setSuggestions([]); setShowSugg(false); }}
              style={{ padding: '9px 14px', fontSize: 13, color: '#e2e8f0', cursor: 'pointer',
                borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                background: 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,105,0,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              📍 {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateProspectModal({ onClose, onSaved }) {
  // ── Sélection du type de prospection ──
  const [typeProspection, setTypeProspection] = useState(null); // 'OM' | 'ENERGIA'

  // ── État formulaire OM ──
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

  // ── État formulaire Energia ──
  const [energiaData, setEnergiaData] = useState({
    nom_kit: '',
    pret_payer_immediatement: null, // true | false
    date_prospection: new Date().toISOString().slice(0, 10),
    nom: '', prenom: '', telephone: '',
    quartier: '',
    latitude: '', longitude: '',
    piece_identite: '',
    notes: '',
  });
  const [energiaPieces, setEnergiaPieces] = useState([]); // Array de fichiers images

  const [busy, setBusy] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const setE = (k, v) => setEnergiaData(d => ({ ...d, [k]: v }));

  const captureGPS = (forEnergia = false) => {
    if (!navigator.geolocation) return alert("Géolocalisation non disponible");
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (forEnergia) {
          setE('latitude', pos.coords.latitude);
          setE('longitude', pos.coords.longitude);
        } else {
          set('latitude', pos.coords.latitude);
          set('longitude', pos.coords.longitude);
        }
      },
      err => alert("Impossible : " + err.message),
      { enableHighAccuracy: true }
    );
  };

  const submitEnergia = async (e) => {
    e.preventDefault();
    if (!energiaData.nom_kit) return alert('Veuillez sélectionner un kit (DIABARANI ou YELEN)');
    if (energiaData.pret_payer_immediatement === null) return alert('Veuillez indiquer si le client est prêt à payer immédiatement');
    if (!energiaData.nom || !energiaData.prenom || !energiaData.telephone) return alert('Nom, Prénom et Téléphone sont obligatoires');
    if (!energiaData.quartier) return alert('⚠️ Le quartier est obligatoire');
    setBusy(true);
    try {
      const payload = {
        ...energiaData,
        latitude: energiaData.latitude === '' ? null : parseFloat(energiaData.latitude),
        longitude: energiaData.longitude === '' ? null : parseFloat(energiaData.longitude),
        quartier: energiaData.quartier || null,
        piece_identite: energiaData.piece_identite || null,
        notes: energiaData.notes || null,
      };
      const resp = await api.post('/energia/prospects', payload);
      const prospectId = resp.data?.id;

      // Upload des pièces justificatives (multi-images)
      if (prospectId && energiaPieces.length > 0) {
        for (const file of energiaPieces) {
          try {
            const fd = new FormData();
            fd.append('file', file);
            await api.post(`/energia/prospects/${prospectId}/pieces`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch (uploadErr) {
            console.warn('Erreur upload pièce:', file.name, uploadErr);
          }
        }
      }

      setSuccessData({ prenom: energiaData.prenom, nom: energiaData.nom, type: 'ENERGIA' });
      setEnergiaPieces([]);
      onSaved();
    } catch (err) {
      alert('Erreur : ' + errMsg(err));
    } finally { setBusy(false); }
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
      // Afficher la modale de succès au lieu de fermer directement
      setSuccessData({ prenom: data.prenom, nom: data.nom });
    } catch (err) {
      console.error('Erreur create prospect:', err?.response?.data || err?.message || err);
      alert('Erreur : ' + errMsg(err));
    } finally { setBusy(false); }
  };

  // Réinitialiser le formulaire pour une nouvelle demande
  const handleNewDemande = () => {
    setSuccessData(null);
    setData({
      nom: '', prenom: '', telephone_principal: '', telephone_secondaire: '',
      quartier: '', adresse: '', piece_identite_type: '', piece_identite_numero: '',
      fait_om: false, om_commission_mensuelle: '', om_ca_mensuel: '',
      om_ancienne_puce: '', om_raison_changement: '', capital_demarrage: '',
      source_financement: '', latitude: '', longitude: '', type_local: 'BOUTIQUE_FIXE',
      frequentation: '', concurrents: '', notes: '',
    });
    onSaved(); // rafraîchir la liste
  };

  // Afficher la modale de succès si demande soumise
  if (successData) {
    return (
      <SuccessDemandeModal
        prospect={successData}
        onClose={() => { onSaved(); onClose(); }}
        onNewDemande={handleNewDemande}
      />
    );
  }

  // ── Si aucun type sélectionné → afficher le sélecteur ──
  if (!typeProspection) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
        <div style={{ background: 'linear-gradient(135deg, #0f0f1e, #1a1a2e)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '36px 32px', width: '90%', maxWidth: 520, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Nouvelle Prospection</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>Choisissez le type de prospection à effectuer</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Option 1 : Demande Puce OM */}
            <button onClick={() => setTypeProspection('OM')} style={{
              padding: '20px 24px', borderRadius: 14, border: '2px solid rgba(255,105,0,0.3)',
              background: 'rgba(255,105,0,0.06)', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 16,
            }}
              onMouseOver={e => { e.currentTarget.style.border = '2px solid rgba(255,105,0,0.7)'; e.currentTarget.style.background = 'rgba(255,105,0,0.12)'; }}
              onMouseOut={e => { e.currentTarget.style.border = '2px solid rgba(255,105,0,0.3)'; e.currentTarget.style.background = 'rgba(255,105,0,0.06)'; }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(135deg,#FF6900,#ff9500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📱</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Demande Puce Orange Money</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Prospection pour une nouvelle puce OM · Workflow complet</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 20, color: '#FF6900' }}>›</div>
            </button>

            {/* Option 2 : Vente Energia */}
            <button onClick={() => setTypeProspection('ENERGIA')} style={{
              padding: '20px 24px', borderRadius: 14, border: '2px solid rgba(34,197,94,0.3)',
              background: 'rgba(34,197,94,0.06)', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 16,
            }}
              onMouseOver={e => { e.currentTarget.style.border = '2px solid rgba(34,197,94,0.7)'; e.currentTarget.style.background = 'rgba(34,197,94,0.12)'; }}
              onMouseOut={e => { e.currentTarget.style.border = '2px solid rgba(34,197,94,0.3)'; e.currentTarget.style.background = 'rgba(34,197,94,0.06)'; }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>☀️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Vente ENERGIA</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Kit solaire DIABARANI ou YELEN · Saisie rapide</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 20, color: '#22c55e' }}>›</div>
            </button>
          </div>
          <button onClick={onClose} style={{ marginTop: 20, width: '100%', padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>Annuler</button>
        </div>
      </div>
    );
  }

  // ── Formulaire ENERGIA ──
  if (typeProspection === 'ENERGIA') {
    const ENERGIA_GREEN = '#22c55e';
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '16px' }} onClick={onClose}>
        <div style={{ background: 'linear-gradient(135deg, #0f0f1e, #1a1a2e)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16, width: '100%', maxWidth: 760, margin: '0 auto 80px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☀️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Prospection Vente ENERGIA</div>
                <div style={{ fontSize: 11, color: ENERGIA_GREEN, fontWeight: 600 }}>Kit solaire DIABARANI ou YELEN</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTypeProspection(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}>← Retour</button>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>✕</button>
            </div>
          </div>

          <form onSubmit={submitEnergia} style={{ padding: '20px 24px' }}>

            {/* NOM DU KIT */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(34,197,94,0.2)` }}>
                <span style={{ fontSize: 16 }}>☀️</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: ENERGIA_GREEN, textTransform: 'uppercase', letterSpacing: '1px' }}>Kit Energia</span>
              </div>
              <AFL label="Nom du Kit *" required>
                <div style={{ display: 'flex', gap: 12 }}>
                  {['DIABARANI', 'YELEN'].map(kit => (
                    <button key={kit} type="button" onClick={() => setE('nom_kit', kit)}
                      style={{ flex: 1, padding: '12px 20px', borderRadius: 10, border: `2px solid ${energiaData.nom_kit === kit ? ENERGIA_GREEN : 'rgba(255,255,255,0.1)'}`, background: energiaData.nom_kit === kit ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)', color: energiaData.nom_kit === kit ? ENERGIA_GREEN : '#94a3b8', fontWeight: 800, fontSize: 15, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {kit === 'DIABARANI' ? '🌞 DIABARANI' : '💡 YELEN'}
                    </button>
                  ))}
                </div>
              </AFL>
            </div>

            {/* PRET A PAYER */}
            <div style={{ marginBottom: 24 }}>
              <AFL label="Est-il prêt à payer l'argent immédiatement ? *" required>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[{ val: true, label: '✅ OUI', color: '#22c55e' }, { val: false, label: '❌ NON', color: '#ef4444' }].map(opt => (
                    <button key={String(opt.val)} type="button" onClick={() => setE('pret_payer_immediatement', opt.val)}
                      style={{ flex: 1, padding: '12px 20px', borderRadius: 10, border: `2px solid ${energiaData.pret_payer_immediatement === opt.val ? opt.color : 'rgba(255,255,255,0.1)'}`, background: energiaData.pret_payer_immediatement === opt.val ? `${opt.color}15` : 'rgba(255,255,255,0.03)', color: energiaData.pret_payer_immediatement === opt.val ? opt.color : '#94a3b8', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </AFL>
            </div>

            {/* DATE */}
            <ASection title="Date de prospection" icon="📅" cols={1}>
              <AFL label="Date *" required>
                <input type="date" value={energiaData.date_prospection} onChange={e => setE('date_prospection', e.target.value)}
                  required style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
              </AFL>
            </ASection>

            {/* INFOS CLIENT */}
            <ASection title="Informations du Client" icon="👤" cols={2}>
              <AFL label="Nom *" required><AFI required placeholder="Nom de famille" value={energiaData.nom} onChange={e => setE('nom', e.target.value)}/></AFL>
              <AFL label="Prénom *" required><AFI required placeholder="Prénom" value={energiaData.prenom} onChange={e => setE('prenom', e.target.value)}/></AFL>
              <AFL label="Numéro de téléphone *" required><AFI required placeholder="7X XX XX XX" value={energiaData.telephone} onChange={e => setE('telephone', e.target.value)}/></AFL>
              <AFL label="Quartier *" required><QuartierInput value={energiaData.quartier} onChange={v => setE('quartier', v)} required /></AFL>
            </ASection>

            {/* LOCALISATION */}
            <ASection title="Localisation" icon="📍" cols={2}>
              <AFL label="Latitude"><AFI type="number" step="any" placeholder="12.3456" value={energiaData.latitude} onChange={e => setE('latitude', e.target.value)}/></AFL>
              <AFL label="Longitude"><AFI type="number" step="any" placeholder="-8.0000" value={energiaData.longitude} onChange={e => setE('longitude', e.target.value)}/></AFL>
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="button" onClick={() => captureGPS(true)} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid rgba(34,197,94,0.4)`, background: 'rgba(34,197,94,0.1)', color: ENERGIA_GREEN, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14}/> Capturer ma position GPS
                </button>
                {energiaData.latitude && energiaData.longitude && (
                  <div style={{ marginTop: 8, fontSize: 12, color: ENERGIA_GREEN }}>
                    ✅ Position capturée : {parseFloat(energiaData.latitude).toFixed(5)}, {parseFloat(energiaData.longitude).toFixed(5)}
                  </div>
                )}
              </div>
            </ASection>

            {/* PIECE D'IDENTITE */}
            <ASection title="Pièce d'Identité ou RCCM" icon="🪪" cols={1}>
              <AFL label="Numéro de pièce / RCCM">
                <AFI placeholder="Ex: CNI 123456789 ou RCCM ML-BKO-2024-A-12345" value={energiaData.piece_identite} onChange={e => setE('piece_identite', e.target.value)}/>
              </AFL>
            </ASection>

            {/* PHOTOS DES PIECES */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: 'rgba(34,197,94,0.2) 1px solid' }}>
                <span style={{ fontSize: 16 }}>📸</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '1px' }}>Photos / Scans des pièces</span>
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>(optionnel · plusieurs images acceptées)</span>
              </div>
              {/* Zone de drop / clic pour sélectionner plusieurs images */}
              <div
                onClick={() => document.getElementById('energia-pieces-input').click()}
                style={{ border: '2px dashed rgba(34,197,94,0.35)', borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', background: energiaPieces.length > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
                  setEnergiaPieces(prev => [...prev, ...files]);
                }}>
                <input
                  id="energia-pieces-input"
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files);
                    setEnergiaPieces(prev => [...prev, ...files]);
                    e.target.value = '';
                  }}
                />
                {energiaPieces.length === 0 ? (
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                    <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700 }}>Cliquer ou glisser les images ici</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>CNI, RCCM, reçus... · JPG, PNG, PDF · Plusieurs fichiers acceptés</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700, marginBottom: 8 }}>✅ {energiaPieces.length} fichier{energiaPieces.length > 1 ? 's' : ''} sélectionné{energiaPieces.length > 1 ? 's' : ''}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                      {energiaPieces.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '4px 10px', fontSize: 11 }}>
                          <span>{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                          <span style={{ color: '#22c55e', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <span style={{ color: '#64748b' }}>({(f.size/1024).toFixed(0)}Ko)</span>
                          <button type="button" onClick={e => { e.stopPropagation(); setEnergiaPieces(prev => prev.filter((_, j) => j !== i)); }}
                            style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Cliquer pour ajouter d'autres fichiers</div>
                  </div>
                )}
              </div>
            </div>

            {/* NOTES */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid rgba(34,197,94,0.2)` }}>
                <span style={{ fontSize: 16 }}>📝</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: ENERGIA_GREEN, textTransform: 'uppercase', letterSpacing: '1px' }}>Notes</span>
              </div>
              <textarea value={energiaData.notes} onChange={e => setE('notes', e.target.value)}
                placeholder="Observations, remarques..."
                style={{ ...INPUT_STYLE, height: 'auto', minHeight: 70, resize: 'vertical', borderColor: 'rgba(34,197,94,0.2)' }}/>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setTypeProspection(null)} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>← Retour</button>
              <button type="submit" disabled={busy} style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: busy ? 0.7 : 1, boxShadow: '0 4px 16px rgba(34,197,94,0.35)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Send size={14}/> {busy ? 'Enregistrement…' : 'Enregistrer le prospect'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Formulaire OM (existant) ──
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTypeProspection(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}>← Retour</button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>✕</button>
          </div>
        </div>

        <form onSubmit={submit} style={{ padding: '20px 24px' }}>

          {/* SECTION 1 — Infos personnelles */}
          <ASection title="Informations personnelles" icon="👤" cols={2}>
            <AFL label="Nom *" required><AFI required placeholder="Nom de famille" value={data.nom} onChange={e=>set('nom',e.target.value)}/></AFL>
            <AFL label="Prénom *" required><AFI required placeholder="Prénom" value={data.prenom} onChange={e=>set('prenom',e.target.value)}/></AFL>
            <AFL label="Téléphone principal *" required><AFI required placeholder="7X XX XX XX" value={data.telephone_principal} onChange={e=>set('telephone_principal',e.target.value)}/></AFL>
            <AFL label="Téléphone secondaire"><AFI placeholder="7X XX XX XX" value={data.telephone_secondaire} onChange={e=>set('telephone_secondaire',e.target.value)}/></AFL>
            <AFL label="Quartier *" required><QuartierInput value={data.quartier} onChange={v=>set('quartier',v)} required /></AFL>
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
              <button type="button" onClick={() => captureGPS(false)} style={{
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
