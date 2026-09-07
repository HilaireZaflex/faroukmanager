/**
 * ProspectionEnergiaPage — Page dédiée à la prospection Vente ENERGIA
 * Redirige vers ProspectionPage avec la vue ENERGIA activée par défaut
 * mais affichée comme page indépendante dans le menu principal.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import api from '../services/api';
import toast from 'react-hot-toast';

const ENERGIA_GREEN = '#22c55e';
const BACKEND = process.env.REACT_APP_API_URL?.replace('/api', '') || '';

// Composants form utilitaires
function AFL({ label, required, children }) {
  return (
    <div>
      <label style={{ fontSize: 10, color: ENERGIA_GREEN, display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: '#ff4757', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}
function AFI({ type = 'text', ...props }) {
  return (
    <input type={type} {...props}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', ...props.style }} />
  );
}

function KPICard({ icon, label, value, color, sub }) {
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 14, padding: '18px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value ?? '—'}</div>
      <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function ProspectionEnergiaPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editProspect, setEditProspect] = useState(null);
  const [search, setSearch] = useState('');
  const [filtreKit, setFiltreKit] = useState('');

  // Données ENERGIA
  const { data: energiaProspects = [], isLoading, refetch } = useQuery(
    'energia-prospects',
    () => api.get('/energia/prospects?limit=500').then(r => r.data),
    { staleTime: 30000 }
  );
  const { data: energiaStats } = useQuery(
    'energia-stats',
    () => api.get('/energia/stats').then(r => r.data),
    { staleTime: 30000 }
  );

  // Filtrage
  const filtered = (energiaProspects || []).filter(p => {
    if (search && !(p.nom||'').toLowerCase().includes(search.toLowerCase()) &&
        !(p.prenom||'').toLowerCase().includes(search.toLowerCase()) &&
        !(p.telephone||'').includes(search)) return false;
    if (filtreKit && p.nom_kit !== filtreKit) return false;
    return true;
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce prospect ENERGIA ?')) return;
    try {
      await api.delete('/energia/prospects/' + id);
      toast.success('Prospect supprimé');
      refetch();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">☀️ Prospection ENERGIA</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            Gestion des prospects pour les kits solaires Orange ENERGIA (DIABARANI & YELEN)
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setEditProspect(null); }}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          + Nouveau Prospect ENERGIA
        </button>
      </div>

      {/* KPI Cards */}
      {energiaStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          <KPICard icon="☀️" label="Total Prospects" value={energiaStats.total} color={ENERGIA_GREEN} sub="Tous les prospects"/>
          <KPICard icon="🌞" label="DIABARANI" value={energiaStats.diabarani} color="#ffa502" sub="Kit solaire standard"/>
          <KPICard icon="💡" label="YELEN" value={energiaStats.yelen} color="#a29bfe" sub="Kit solaire premium"/>
          <KPICard icon="✅" label="Prêts à Payer"
            value={`${energiaStats.prets_payer} (${energiaStats.taux_pret}%)`}
            color={energiaStats.taux_pret > 50 ? ENERGIA_GREEN : '#ff4757'}
            sub="Intéressés immédiatement"/>
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input placeholder="🔍 Rechercher nom, prénom, téléphone..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '9px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13 }}/>
        <select value={filtreKit} onChange={e => setFiltreKit(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a2e', color: '#fff', fontSize: 13 }}>
          <option value="">Tous les kits</option>
          <option value="DIABARANI">🌞 DIABARANI</option>
          <option value="YELEN">💡 YELEN</option>
        </select>
        <span style={{ fontSize: 12, color: '#64748b' }}>{filtered.length} prospect(s)</span>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>☀️</div>
          <div>Chargement des prospects ENERGIA...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>☀️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>Aucun prospect ENERGIA</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>Cliquez sur <strong>"+ Nouveau Prospect ENERGIA"</strong> pour commencer</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {filtered.map((p, i) => (
            <div key={p.id} style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{p.nom} {p.prenom}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>📞 {p.telephone}</div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 700,
                  background: p.nom_kit === 'DIABARANI' ? 'rgba(255,165,2,0.15)' : 'rgba(162,155,254,0.15)',
                  color: p.nom_kit === 'DIABARANI' ? '#ffa502' : '#a29bfe' }}>
                  {p.nom_kit === 'DIABARANI' ? '🌞' : '💡'} {p.nom_kit}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                📍 {p.quartier || '—'} · 📅 {p.date_prospection ? p.date_prospection.slice(0, 10) : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                  background: p.pret_payer_immediatement ? 'rgba(34,197,94,0.15)' : 'rgba(255,71,87,0.15)',
                  color: p.pret_payer_immediatement ? '#22c55e' : '#ff4757' }}>
                  {p.pret_payer_immediatement ? '✅ Prêt à payer' : '⏳ Pas encore'}
                </span>
                {p.a_electricite !== undefined && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                    background: p.a_electricite ? 'rgba(255,165,2,0.15)' : 'rgba(34,197,94,0.15)',
                    color: p.a_electricite ? '#ffa502' : '#22c55e' }}>
                    {p.a_electricite ? '⚡ A l\'électricité' : '☀️ Sans électricité'}
                  </span>
                )}
              </div>
              {p.notes && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, fontStyle: 'italic' }}>{p.notes.slice(0, 80)}{p.notes.length > 80 ? '...' : ''}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditProspect(p); setShowForm(true); }}
                  style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: ENERGIA_GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ✏️ Modifier
                </button>
                <button onClick={() => handleDelete(p.id)}
                  style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.08)', color: '#ff4757', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Formulaire */}
      {showForm && (
        <EnergiaFormModal
          prospect={editProspect}
          onClose={() => { setShowForm(false); setEditProspect(null); }}
          onSuccess={() => { refetch(); setShowForm(false); setEditProspect(null); }}
        />
      )}
    </div>
  );
}

// Modal formulaire ENERGIA
function EnergiaFormModal({ prospect, onClose, onSuccess }) {
  const isEdit = !!prospect;
  const [data, setData] = useState({
    nom: prospect?.nom || '',
    prenom: prospect?.prenom || '',
    telephone: prospect?.telephone || '',
    quartier: prospect?.quartier || '',
    nom_kit: prospect?.nom_kit || 'DIABARANI',
    pret_payer_immediatement: prospect?.pret_payer_immediatement ?? false,
    a_electricite: prospect?.a_electricite ?? false,
    revenu_mensuel: prospect?.revenu_mensuel || '',
    date_prospection: prospect?.date_prospection ? prospect.date_prospection.slice(0,10) : new Date().toISOString().slice(0,10),
    latitude: prospect?.latitude || '',
    longitude: prospect?.longitude || '',
    notes: prospect?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/energia/prospects/${prospect.id}`, data);
        toast.success('Prospect mis à jour !');
      } else {
        await api.post('/energia/prospects', data);
        toast.success('Prospect ENERGIA ajouté !');
      }
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erreur');
    } finally { setLoading(false); }
  };

  const IS = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const SS = { ...IS, background: '#1a1a2e' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#0f0f1a', borderRadius: 16, padding: 28, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(34,197,94,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid rgba(34,197,94,0.2)' }}>
          <div>
            <div style={{ fontSize: 11, color: ENERGIA_GREEN, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>☀️ Prospection ENERGIA</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{isEdit ? 'Modifier le prospect' : 'Nouveau prospect'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <AFL label="Nom *" required><input style={IS} placeholder="Nom de famille" value={data.nom} onChange={e => set('nom', e.target.value)} required /></AFL>
            <AFL label="Prénom *" required><input style={IS} placeholder="Prénom" value={data.prenom} onChange={e => set('prenom', e.target.value)} required /></AFL>
            <AFL label="Téléphone *" required><input style={IS} placeholder="7X XX XX XX" value={data.telephone} onChange={e => set('telephone', e.target.value)} required /></AFL>
            <AFL label="Quartier *" required><input style={IS} placeholder="Quartier / Commune" value={data.quartier} onChange={e => set('quartier', e.target.value)} required /></AFL>
            <AFL label="Kit ENERGIA *">
              <select style={SS} value={data.nom_kit} onChange={e => set('nom_kit', e.target.value)}>
                <option value="DIABARANI">🌞 DIABARANI</option>
                <option value="YELEN">💡 YELEN</option>
              </select>
            </AFL>
            <AFL label="Date de prospection"><input type="date" style={IS} value={data.date_prospection} onChange={e => set('date_prospection', e.target.value)} /></AFL>
            <AFL label="Revenu mensuel estimé"><input style={IS} placeholder="Ex: 50000 FCFA" value={data.revenu_mensuel} onChange={e => set('revenu_mensuel', e.target.value)} /></AFL>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <input type="checkbox" checked={data.pret_payer_immediatement} onChange={e => set('pret_payer_immediatement', e.target.checked)} style={{ width: 18, height: 18, accentColor: ENERGIA_GREEN }} />
              <span style={{ color: '#fff', fontSize: 13 }}>✅ Prêt à payer immédiatement</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <input type="checkbox" checked={data.a_electricite} onChange={e => set('a_electricite', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#ffa502' }} />
              <span style={{ color: '#fff', fontSize: 13 }}>⚡ A déjà l'électricité</span>
            </label>
          </div>
          <div style={{ marginBottom: 20 }}>
            <AFL label="Notes"><textarea rows={3} value={data.notes} onChange={e => set('notes', e.target.value)} placeholder="Observations, remarques..."
              style={{ ...IS, resize: 'vertical' }} /></AFL>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#aaa', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={loading} style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳...' : isEdit ? '💾 Mettre à jour' : '+ Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
