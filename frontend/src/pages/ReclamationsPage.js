import React, { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

const STATUT_CFG = {
  OUVERTE:    { color: '#ff4757', bg: 'rgba(255,71,87,0.12)',   icon: '🔴', label: 'Ouverte' },
  EN_COURS:   { color: '#ffa502', bg: 'rgba(255,165,2,0.12)',   icon: '🟡', label: 'En cours' },
  RESOLUE:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: '🟢', label: 'Résolue' },
  CLOTUREE:   { color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: '⛔', label: 'Clôturée' },
  REOUVERTE:  { color: '#a29bfe', bg: 'rgba(162,155,254,0.12)', icon: '🔄', label: 'Réouverte' },
  ESCALADEE:  { color: '#ff6b81', bg: 'rgba(255,107,129,0.12)', icon: '⚠️', label: 'Escaladée' },
};
const PRIORITE_CFG = {
  URGENT: { color: '#ff4757', icon: '🔴' },
  NORMAL: { color: '#ffa502', icon: '🟡' },
  FAIBLE: { color: '#22c55e', icon: '🟢' },
};
const CATEGORIES = ['PDV', 'PERSONNEL', 'LOGISTIQUE', 'FINANCE', 'TECHNIQUE', 'AUTRE'];
const PRIORITES = ['URGENT', 'NORMAL', 'FAIBLE'];

function StatutBadge({ statut }) {
  const cfg = STATUT_CFG[statut] || STATUT_CFG.OUVERTE;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function PrioriteBadge({ priorite }) {
  const cfg = PRIORITE_CFG[priorite] || PRIORITE_CFG.NORMAL;
  return (
    <span style={{ color: cfg.color, fontSize: 11, fontWeight: 700 }}>{cfg.icon} {priorite}</span>
  );
}

// ─── Formulaire nouvelle réclamation ─────────────────────────────────────────
function FormulaireReclamation({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    titre: '', description: '', categorie: 'PDV', priorite: 'NORMAL',
    responsable_id: '', numero_pdv: '', date_limite: '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Charger les vrais admins/managers depuis le logiciel
  const { data: allUsers = [] } = useQuery('auth-users-rec', () =>
    api.get('/auth/users').then(r => Array.isArray(r.data) ? r.data : (r.data?.items || [])).catch(() => []),
    { staleTime: 300000 }
  );
  // Responsables habilités : ADMIN, RC, responsable_produit, conformite
  const ROLES_RESPONSABLES = ['ADMIN', 'MANAGER', 'RC', 'conformite', 'responsable_produit_et_qualit_oprationnelle_'];
  const ROLE_LABELS = {
    'ADMIN': 'Admin',
    'MANAGER': 'Manager',
    'RC': 'Responsable Commercial',
    'conformite': 'Resp. Conformité',
    'responsable_produit_et_qualit_oprationnelle_': 'Resp. Produit & Qualité Opérationnelle',
  };
  const responsables = allUsers
    .filter(u => ROLES_RESPONSABLES.includes(u.role))
    .map(u => ({
      id: String(u.id),
      nom: `${u.prenom || ''} ${u.nom || ''}`.trim(),
      role: ROLE_LABELS[u.role] || u.role,
    }));

  const IS = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const SS = { ...IS, background: '#1a1a2e' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titre || !form.description) return toast.error('Titre et description requis');
    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.responsable_id) payload.responsable_id = parseInt(payload.responsable_id);
      else delete payload.responsable_id;
      if (!payload.date_limite) delete payload.date_limite;
      await api.post('/reclamations', payload);
      toast.success('Réclamation soumise avec succès !');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erreur lors de la soumission');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#0f0f1a', borderRadius: 16, padding: 28, maxWidth: 620, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,105,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid rgba(255,105,0,0.25)' }}>
          <div>
            <div style={{ fontSize: 11, color: '#FF6900', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>📣 Nouvelle Réclamation</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Soumettre une réclamation</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 10, color: '#FF6900', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Titre *</label>
              <input style={IS} placeholder="Résumé de la réclamation" value={form.titre} onChange={e => set('titre', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#FF6900', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Catégorie</label>
              <select style={SS} value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#FF6900', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Priorité</label>
              <select style={SS} value={form.priorite} onChange={e => set('priorite', e.target.value)}>
                {PRIORITES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#FF6900', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Responsable assigné</label>
              <select style={SS} value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)}>
                <option value="">Sélectionner un responsable</option>
                {responsables.map(resp => (
                  <option key={resp.id} value={resp.id}>
                    {resp.role} — {resp.nom}
                  </option>
                ))}
                {responsables.length === 0 && (
                  <option disabled>Chargement...</option>
                )}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#FF6900', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Date limite souhaitée</label>
              <input type="date" style={IS} value={form.date_limite} onChange={e => set('date_limite', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#FF6900', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>PDV concerné (optionnel)</label>
              <input style={IS} placeholder="Numéro PDV" value={form.numero_pdv} onChange={e => set('numero_pdv', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 10, color: '#FF6900', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Description détaillée *</label>
              <textarea rows={5} style={{ ...IS, resize: 'vertical' }} placeholder="Décrivez la situation en détail..." value={form.description} onChange={e => set('description', e.target.value)} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳ Envoi...' : '📣 Soumettre la réclamation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal détail réclamation ─────────────────────────────────────────────────
function ModalDetail({ rec, onClose, onRefresh, currentUser }) {
  const [commentaire, setCommentaire] = useState('');
  const [reponse, setReponse] = useState(rec.reponse || '');
  const [loading, setLoading] = useState(false);
  const isAdmin = ['ADMIN', 'MANAGER'].includes(currentUser?.role);
  const isResponsable = rec.responsable_id === currentUser?.id;
  const isSoumetteur = rec.soumetteur_id === currentUser?.id;

  const { data: details, refetch: refetchDetails } = useQuery(
    ['rec-detail', rec.id],
    () => api.get(`/reclamations/${rec.id}`).then(r => r.data),
    { staleTime: 0 }
  );

  const handleStatut = async (statut, extra = {}) => {
    setLoading(true);
    try {
      await api.patch(`/reclamations/${rec.id}`, { statut, reponse: reponse || undefined, ...extra });
      toast.success(`Statut mis à jour : ${statut}`);
      onRefresh(); refetchDetails();
    } catch { toast.error('Erreur'); }
    finally { setLoading(false); }
  };

  const handleComment = async () => {
    if (!commentaire.trim()) return;
    setLoading(true);
    try {
      await api.post(`/reclamations/${rec.id}/commentaires`, { contenu: commentaire });
      setCommentaire('');
      refetchDetails();
      toast.success('Commentaire ajouté');
    } catch { toast.error('Erreur'); }
    finally { setLoading(false); }
  };

  const cfg = STATUT_CFG[details?.statut || rec.statut] || STATUT_CFG.OUVERTE;
  const commentaires = details?.commentaires || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#0f0f1a', borderRadius: 16, padding: 28, maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${cfg.color}40` }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <StatutBadge statut={details?.statut || rec.statut} />
              <PrioriteBadge priorite={rec.priorite} />
              <span style={{ fontSize: 11, color: '#64748b' }}>#{rec.id} · {new Date(rec.created_at).toLocaleDateString('fr-FR')}</span>
              {(details || rec).en_retard && <span style={{ fontSize: 10, background: 'rgba(255,71,87,0.15)', color: '#ff4757', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>⏰ EN RETARD</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>{rec.titre}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Par <strong style={{ color: '#FF6900' }}>{rec.soumetteur_nom}</strong>
              {rec.responsable_nom && <> → <strong style={{ color: '#a29bfe' }}>{rec.responsable_nom}</strong></>}
              {rec.numero_pdv && <> · PDV: {rec.numero_pdv}</>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>

        {/* Description */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, borderLeft: `3px solid ${cfg.color}` }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>📋 DESCRIPTION</div>
          <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>{rec.description}</div>
        </div>

        {/* Réponse si disponible */}
        {rec.reponse && (
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 6, fontWeight: 700 }}>✅ RÉPONSE DU RESPONSABLE</div>
            <div style={{ fontSize: 13, color: '#e2e8f0' }}>{rec.reponse}</div>
          </div>
        )}

        {/* Actions responsable/admin */}
        {(isAdmin || isResponsable) && (details?.statut || rec.statut) !== 'CLOTUREE' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#FF6900', marginBottom: 12, textTransform: 'uppercase' }}>⚙️ Actions</div>
            
            {/* Champ réponse */}
            {['OUVERTE', 'EN_COURS', 'REOUVERTE'].includes(details?.statut || rec.statut) && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Réponse / Commentaire officiel</label>
                <textarea rows={3} value={reponse} onChange={e => setReponse(e.target.value)} placeholder="Votre réponse à cette réclamation..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(details?.statut || rec.statut) === 'OUVERTE' && (
                <button onClick={() => handleStatut('EN_COURS')} disabled={loading}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(255,165,2,0.15)', color: '#ffa502', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                  🟡 Prendre en charge
                </button>
              )}
              {['EN_COURS', 'REOUVERTE'].includes(details?.statut || rec.statut) && (
                <button onClick={() => handleStatut('RESOLUE', { reponse })} disabled={loading || !reponse}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 700, cursor: !reponse ? 'not-allowed' : 'pointer', fontSize: 12, opacity: !reponse ? 0.5 : 1 }}>
                  ✅ Marquer résolue
                </button>
              )}
              {['RESOLUE', 'EN_COURS'].includes(details?.statut || rec.statut) && isAdmin && (
                <button onClick={() => handleStatut('CLOTUREE')} disabled={loading}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(100,116,139,0.15)', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                  ⛔ Clôturer
                </button>
              )}
              {!['CLOTUREE','ESCALADEE'].includes(details?.statut || rec.statut) && isAdmin && (
                <button onClick={() => { const r = prompt('Raison de l\'escalade ?'); if (r) handleStatut('ESCALADEE', { escalade_raison: r }); }} disabled={loading}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(255,107,129,0.15)', color: '#ff6b81', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                  ⚠️ Escalader
                </button>
              )}
            </div>
          </div>
        )}

        {/* Réouvrir (soumetteur si résolue) */}
        {isSoumetteur && (details?.statut || rec.statut) === 'RESOLUE' && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => handleStatut('REOUVERTE')} disabled={loading}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(162,155,254,0.3)', background: 'rgba(162,155,254,0.08)', color: '#a29bfe', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
              🔄 Réouvrir la réclamation
            </button>
          </div>
        )}

        {/* Commentaires */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>💬 Discussion ({commentaires.length})</div>
          {commentaires.length === 0 && <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 16 }}>Aucun commentaire pour l'instant</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {commentaires.map((c, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', borderLeft: '3px solid rgba(255,105,0,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#FF6900' }}>{c.auteur_nom}</span>
                  <span style={{ fontSize: 10, color: '#64748b' }}>{c.auteur_role} · {new Date(c.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
                <div style={{ fontSize: 13, color: '#e2e8f0' }}>{c.contenu}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Ajouter un commentaire..."
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()} />
            <button onClick={handleComment} disabled={loading || !commentaire.trim()}
              style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#FF6900', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              Envoyer
            </button>
          </div>
        </div>

        {/* Note satisfaction */}
        {isSoumetteur && (details?.statut || rec.statut) === 'RESOLUE' && !rec.note_satisfaction && (
          <div style={{ background: 'rgba(255,165,2,0.06)', border: '1px solid rgba(255,165,2,0.2)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ffa502', marginBottom: 8 }}>⭐ Évaluez la résolution</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={async () => { await api.patch(`/reclamations/${rec.id}`, { note_satisfaction: n }); onRefresh(); onClose(); toast.success('Merci pour votre évaluation !'); }}
                  style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid rgba(255,165,2,0.3)', background: 'rgba(255,165,2,0.08)', color: '#ffa502', fontWeight: 800, cursor: 'pointer', fontSize: 16 }}>
                  {'⭐'.repeat(n).slice(0,1)}{n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Liste réclamations ────────────────────────────────────────────────────────
function ListeReclamations({ queryKey, params, currentUser, onRefresh }) {
  const [selectedRec, setSelectedRec] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtrePriorite, setFiltrePriorite] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery(
    [queryKey, filtreStatut, filtrePriorite],
    () => api.get('/reclamations', { params: { ...params, statut: filtreStatut || undefined, priorite: filtrePriorite || undefined } }).then(r => r.data),
    { staleTime: 30000, refetchOnMount: true }
  );

  const items = (data?.items || []).filter(r =>
    !search || r.titre?.toLowerCase().includes(search.toLowerCase()) ||
    r.soumetteur_nom?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRefresh = () => { refetch(); onRefresh(); };

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Chargement...</div>;

  return (
    <div>
      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="🔍 Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13 }} />
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a2e', color: '#fff', fontSize: 12 }}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUT_CFG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={filtrePriorite} onChange={e => setFiltrePriorite(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a2e', color: '#fff', fontSize: 12 }}>
          <option value="">Toutes priorités</option>
          {PRIORITES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#64748b' }}>{items.length} réclamation(s)</span>
      </div>

      {/* Liste */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, color: '#94a3b8', fontWeight: 700 }}>Aucune réclamation</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(r => {
            const cfg = STATUT_CFG[r.statut] || STATUT_CFG.OUVERTE;
            const pcfg = PRIORITE_CFG[r.priorite] || PRIORITE_CFG.NORMAL;
            return (
              <div key={r.id} onClick={() => setSelectedRec(r)}
                style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${cfg.color}30`,
                  borderLeft: `4px solid ${cfg.color}`, borderRadius: 12, padding: '14px 18px',
                  cursor: 'pointer', transition: 'all 0.2s', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{r.titre}</span>
                    <StatutBadge statut={r.statut} />
                    <span style={{ fontSize: 10, color: pcfg.color, fontWeight: 700 }}>{pcfg.icon} {r.priorite}</span>
                    {r.en_retard && <span style={{ fontSize: 10, background: 'rgba(255,71,87,0.15)', color: '#ff4757', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>⏰ En retard</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    {r.categorie} · Par <strong style={{ color: '#FF6900' }}>{r.soumetteur_nom}</strong>
                    {r.responsable_nom && <> → <strong style={{ color: '#a29bfe' }}>{r.responsable_nom}</strong></>}
                    {r.numero_pdv && <> · PDV: {r.numero_pdv}</>}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                    {r.description}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>#{r.id}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('fr-FR')}</div>
                  {r.jours_depuis_creation > 0 && <div style={{ fontSize: 10, color: r.en_retard ? '#ff4757' : '#64748b' }}>{r.jours_depuis_creation}j</div>}
                  {r.note_satisfaction && <div style={{ fontSize: 12, color: '#ffa502' }}>{'⭐'.repeat(r.note_satisfaction)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedRec && (
        <ModalDetail rec={selectedRec} onClose={() => setSelectedRec(null)} onRefresh={handleRefresh} currentUser={currentUser} />
      )}
    </div>
  );
}

// ─── Dashboard Admin ───────────────────────────────────────────────────────────
function TabDashboard({ onRefresh }) {
  const { data: stats } = useQuery('rec-stats', () =>
    api.get('/reclamations/stats/dashboard').then(r => r.data),
    { staleTime: 60000, refetchOnMount: true }
  );

  if (!stats) return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chargement...</div>;

  const kpis = [
    { label: 'Total', value: stats.total, color: '#FF6900' },
    { label: '🔴 Ouvertes', value: stats.ouvertes, color: '#ff4757' },
    { label: '🟡 En cours', value: stats.en_cours, color: '#ffa502' },
    { label: '🟢 Résolues', value: stats.resolues, color: '#22c55e' },
    { label: '⛔ Clôturées', value: stats.cloturees, color: '#64748b' },
    { label: '⏰ En retard', value: stats.en_retard, color: '#ff4757' },
    { label: '🔴 Urgentes', value: stats.urgentes, color: '#ff6b81' },
    { label: '📈 Taux résolution', value: `${stats.taux_resolution}%`, color: '#22c55e' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: `${k.color}10`, border: `1px solid ${k.color}30`, borderRadius: 12, padding: '14px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📊 Par catégorie</div>
          {Object.entries(stats.par_categorie).map(([cat, count]) => count > 0 && (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>{cat}</span>
              <span style={{ color: '#FF6900', fontWeight: 700 }}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🎯 Par priorité</div>
          {Object.entries(stats.par_priorite).map(([p, count]) => (
            <div key={p} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
              <span style={{ color: PRIORITE_CFG[p]?.color || '#94a3b8' }}>{PRIORITE_CFG[p]?.icon} {p}</span>
              <span style={{ fontWeight: 700, color: '#fff' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page Principale ──────────────────────────────────────────────────────────
export default function ReclamationsPage() {
  const user = useAuthStore(s => s.user);
  const isAdmin = ['ADMIN', 'MANAGER'].includes(user?.role);
  const [activeTab, setActiveTab] = useState(isAdmin ? 'dashboard' : 'mes-reclamations');
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();

  const handleRefresh = () => {
    qc.invalidateQueries('rec-stats');
    qc.invalidateQueries('rec-mes');
    qc.invalidateQueries('rec-a-traiter');
    qc.invalidateQueries('rec-toutes');
  };

  const TABS = [
    ...(isAdmin ? [{ id: 'dashboard', icon: '📊', label: 'Tableau de bord' }] : []),
    { id: 'mes-reclamations', icon: '📋', label: 'Mes Réclamations' },
    { id: 'a-traiter', icon: '📥', label: 'À Traiter' },
    ...(isAdmin ? [{ id: 'toutes', icon: '🗂️', label: 'Toutes' }] : []),
  ];

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">📣 Réclamations</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            Soumettez et suivez les réclamations du réseau
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(255,105,0,0.3)' }}>
          ➕ Nouvelle Réclamation
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 6, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none',
              background: activeTab === tab.id ? 'linear-gradient(135deg,#FF6900,#ff9500)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#64748b', fontWeight: activeTab === tab.id ? 800 : 500,
              fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Contenu */}
      {activeTab === 'dashboard' && isAdmin && <TabDashboard onRefresh={handleRefresh} />}
      {activeTab === 'mes-reclamations' && (
        <ListeReclamations queryKey="rec-mes" params={{ mes_reclamations: true }} currentUser={user} onRefresh={handleRefresh} />
      )}
      {activeTab === 'a-traiter' && (
        <ListeReclamations queryKey="rec-a-traiter" params={{ a_traiter: true }} currentUser={user} onRefresh={handleRefresh} />
      )}
      {activeTab === 'toutes' && isAdmin && (
        <ListeReclamations queryKey="rec-toutes" params={{}} currentUser={user} onRefresh={handleRefresh} />
      )}

      {/* Formulaire */}
      {showForm && <FormulaireReclamation onClose={() => setShowForm(false)} onSuccess={handleRefresh} />}
    </div>
  );
}
