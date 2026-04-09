import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Phone, MapPin, User, Zap, TrendingUp, TrendingDown, AlertTriangle, Edit2, Save, X, ArrowLeft, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import pdvService from '../services/pdvService';
import alertService from '../services/alertService';
import toast from 'react-hot-toast';
import './PDVDetailPage.css';

// ── Modal Édition PDV ─────────────────────────────────────────────────────
function EditPDVModal({ pdv, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nom: pdv?.nom || '',
    type_pdv: pdv?.type_pdv || 'RS',
    zone: pdv?.zone || '',
    sous_zone: pdv?.sous_zone || '',
    quartier: pdv?.quartier || '',
    superviseur: pdv?.superviseur || '',
    teleconseillere: pdv?.teleconseillere || '',
    telephone: pdv?.telephone || '',
    nom_gerant: pdv?.nom_gerant || '',
    statut: pdv?.statut || 'ACTIF',
    sim_au_bureau: pdv?.sim_au_bureau || false,
    sim_coupee: pdv?.sim_coupee || false,
    notes: pdv?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/pdvs/${pdv.id}`, form);
      toast.success(`PDV "${form.nom}" mis à jour avec succès !`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erreur lors de la mise à jour');
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer définitivement le PDV "${pdv.nom}" ? Cette action est irréversible.`)) return;
    setLoading(true);
    try {
      await api.delete(`/pdvs/${pdv.id}`);
      toast.success('PDV supprimé');
      onSuccess();
      onClose();
    } catch { toast.error('Erreur lors de la suppression'); setLoading(false); }
  };

  const Field = ({ label, k, type='text', options }) => (
    <div>
      <label style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:5, textTransform:'uppercase' }}>{label}</label>
      {options ? (
        <select value={form[k]} onChange={e => set(k, e.target.value)}>
          {options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={label} />
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth:680, width:'95%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ fontSize:16, fontWeight:700 }}>✏️ Modifier le PDV — {pdv?.numero_pdv}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={15}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <Field label="Nom PDV *" k="nom" />
            <Field label="Type PDV" k="type_pdv" options={[['RS','RS'],['RSF','RSF'],['RNS','RNS'],['KIOSQUE','Kiosque']]} />
            <Field label="Zone" k="zone" />
            <Field label="Sous-zone" k="sous_zone" />
            <Field label="Quartier" k="quartier" />
            <Field label="Statut" k="statut" options={[['ACTIF','Actif'],['INACTIF','Inactif'],['RECUPERATION','Récupération'],['DESACTIVE','Désactivé']]} />
            <Field label="Superviseur" k="superviseur" />
            <Field label="Téléconseillère" k="teleconseillere" />
            <Field label="Téléphone" k="telephone" />
            <Field label="Nom Gérant" k="nom_gerant" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            {[['sim_au_bureau','SIM au Bureau'],['sim_coupee','SIM Coupée']].map(([k,l]) => (
              <label key={k} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} style={{ width:16, height:16 }} />
                {l}
              </label>
            ))}
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:5, textTransform:'uppercase' }}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observations, remarques..." style={{ width:'100%' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={loading} style={{ color:'var(--danger)' }}>
              <Trash2 size={13}/> Supprimer
            </button>
            <div style={{ display:'flex', gap:10 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Save size={14}/> {loading ? 'Sauvegarde...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const MOIS_NOMS = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function formatCA(value) {
  if (!value) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Gauge Health Score (semi-cercle)
function HealthScoreGauge({ score }) {
  const percentage = (score || 0) / 100;
  let color = '#00d68f';
  if (score < 40) color = '#ff4757';
  else if (score < 70) color = '#ffa502';

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <div
        style={{
          width: '150px',
          height: '75px',
          margin: '0 auto',
          borderRadius: '150px 150px 0 0',
          background: `conic-gradient(${color} 0deg ${percentage * 180}deg, rgba(255,255,255,0.1) ${percentage * 180}deg 180deg)`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '10px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: '-5px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '24px',
            fontWeight: 700,
            color: color,
          }}
        >
          {score}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '16px' }}>
        {score >= 70 ? '✅ Excellent' : score >= 40 ? '⚠️ À améliorer' : '🔴 Critique'}
      </div>
    </div>
  );
}

// ============ ONGLET 1: INFORMATIONS ============
function TabInformations({ pdv }) {
  return (
    <div>
      <div className="grid-2" style={{ gap: '24px', marginBottom: '24px' }}>
        {/* Colonne 1: Infos identité */}
        <div className="card">
          <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px', color: 'var(--primary)' }}>
            Informations Identité
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <InfoRow label="Zone" value={pdv?.zone} />
            <InfoRow label="Sous-zone" value={pdv?.sous_zone} />
            <InfoRow label="Quartier" value={pdv?.quartier} />
            <InfoRow label="Superviseur" value={pdv?.superviseur} />
            <InfoRow label="Gestionnaire" value={pdv?.gestionnaire} />
            <InfoRow label="Téléconseillère" value={pdv?.teleconseillere} />
            <InfoRow label="Téléphone" value={pdv?.telephone} />
            <InfoRow label="Nom gérant" value={pdv?.nom_gerant} />
            <InfoRow label="Numéro personnel" value={pdv?.numero_personnel} />
          </div>
        </div>

        {/* Colonne 2: Infos techniques */}
        <div className="card">
          <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px', color: 'var(--primary)' }}>
            Informations Techniques
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <InfoRow label="Type PDV" value={pdv?.type_pdv} />
            <InfoRow label="Statut" value={pdv?.statut} badge />
            <InfoRow label="Date activation" value={formatDate(pdv?.date_activation)} />
            <InfoRow label="Numéro flotte" value={pdv?.numero_flotte ? '✅ Oui' : '❌ Non'} />
            <InfoRow label="SIM au bureau" value={pdv?.sim_bureau ? '✅ Oui' : '❌ Non'} />
            <InfoRow label="SIM coupée" value={pdv?.sim_coupee ? '⚠️ Oui' : '✅ Non'} />
            <InfoRow label="Nouvelle création" value={pdv?.nouvelle_creation ? '✅ Oui' : '❌ Non'} />
            <InfoRow label="Segment IA" value={pdv?.segment_ia} />
            <InfoRow label="Score risque" value={`${pdv?.score_risque || 0}/100`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
      {badge ? (
        <span
          className="badge"
          style={{
            background: 'var(--success-bg)',
            color: 'var(--success)',
            padding: '3px 10px',
          }}
        >
          {value || '—'}
        </span>
      ) : (
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{value || '—'}</span>
      )}
    </div>
  );
}

// ============ ONGLET 2: PERFORMANCES ============
function TabPerformances({ pdv }) {
  const historique = pdv?.historique_mensuel || [];
  const caMax = Math.max(...historique.map((h) => h.ca || 0));
  const caMin = Math.min(...historique.map((h) => h.ca || 0));
  const caMoyenne = historique.length > 0 ? historique.reduce((sum, h) => sum + (h.ca || 0), 0) / historique.length : 0;
  const caTotal = historique.reduce((sum, h) => sum + (h.ca || 0), 0);

  return (
    <div>
      {/* Résumés */}
      <div className="grid-4 mb-24">
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>CA Max</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--success)' }}>{formatCA(caMax)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>CA Min</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--danger)' }}>{formatCA(caMin)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>CA Moyenne</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary)' }}>{formatCA(caMoyenne)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>CA Total</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--info)' }}>{formatCA(caTotal)}</div>
        </div>
      </div>

      {/* Table historique */}
      <div className="card table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Année</th>
              <th>Mois</th>
              <th>CA</th>
              <th>Nb Opérations</th>
              <th>Dépôts</th>
              <th>Retraits</th>
              <th>Variation</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {historique.map((h, i) => (
              <tr key={i}>
                <td>{h.annee}</td>
                <td>{MOIS_NOMS[h.mois]}</td>
                <td style={{ fontWeight: 600 }}>{formatCA(h.ca)}</td>
                <td>{h.nb_operations || '—'}</td>
                <td>{h.depots || '—'}</td>
                <td>{h.retraits || '—'}</td>
                <td>
                  <span style={{ color: h.variation >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {h.variation >= 0 ? '+' : ''}{h.variation}%
                  </span>
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background:
                        h.statut === 'actif'
                          ? 'var(--success-bg)'
                          : h.statut === 'inactif'
                            ? 'var(--danger-bg)'
                            : 'var(--warning-bg)',
                      color:
                        h.statut === 'actif'
                          ? 'var(--success)'
                          : h.statut === 'inactif'
                            ? 'var(--danger)'
                            : 'var(--warning)',
                    }}
                  >
                    {h.statut}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ ONGLET 3: COURBES ============
function TabCourbes({ pdv }) {
  const monthly = pdv?.historique_mensuel || [];
  const weekly = pdv?.historique_hebdomadaire || [];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: 'rgba(10, 10, 20, 0.95)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
          }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>{payload[0].payload.label}</p>
          <p style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCA(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {/* LineChart CA Mensuel */}
      <div className="card mb-24">
        <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>CA Mensuel (12 derniers mois)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={monthly.map((m) => ({
              label: MOIS_NOMS[m.mois],
              value: m.ca,
            }))}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" stroke="var(--text-secondary)" />
            <YAxis stroke="var(--text-secondary)" />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#FF6900"
              strokeWidth={2}
              dot={{ fill: '#FF6900', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* BarChart CA Hebdomadaire */}
      <div className="card">
        <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>CA Hebdomadaire (8 dernières semaines)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={weekly.map((w) => ({
              label: `S${w.semaine}`,
              value: w.ca,
            }))}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" stroke="var(--text-secondary)" />
            <YAxis stroke="var(--text-secondary)" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#FF6900" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============ ONGLET 4: ACTIONS TERRAIN ============
function TabActionsTerrain({ pdv }) {
  const queryClient = useQueryClient();
  const [actionForm, setActionForm] = useState({ type_action: 'appel', resultat: '', notes: '' });

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['alerts/actions', pdv?.id],
    queryFn: () => alertService.getActions(pdv?.id),
    enabled: !!pdv?.id,
  });

  const createActionMutation = useMutation({
    mutationFn: (data) => alertService.createAction(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['alerts/actions', pdv?.id]);
      setActionForm({ type_action: 'appel', resultat: '', notes: '' });
    },
  });

  const handleCreateAction = () => {
    createActionMutation.mutate({
      pdv_id: pdv?.id,
      type_action: actionForm.type_action,
      resultat: actionForm.resultat,
      notes: actionForm.notes,
    });
  };

  const getActionIcon = (type) => {
    switch (type) {
      case 'appel':
        return '📞';
      case 'visite':
        return '🚗';
      case 'whatsapp':
        return '💬';
      default:
        return '📋';
    }
  };

  const getResultatBadge = (resultat) => {
    let bg = 'var(--warning-bg)',
      color = 'var(--warning)';
    if (resultat === 'succes') (bg = 'var(--success-bg)'), (color = 'var(--success)');
    else if (resultat === 'echec') (bg = 'var(--danger-bg)'), (color = 'var(--danger)');
    return { background: bg, color: color };
  };

  return (
    <div>
      {/* Timeline */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement des actions...</div>
      ) : actions.length > 0 ? (
        <div className="timeline" style={{ marginBottom: '24px' }}>
          {actions.map((action, i) => (
            <div key={i} className="timeline-item">
              <div className="timeline-marker">{getActionIcon(action.type_action)}</div>
              <div className="timeline-content">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{action.type_action.toUpperCase()}</div>
                  <span className="badge" style={getResultatBadge(action.resultat)}>
                    {action.resultat === 'succes' ? '✅ Succès' : action.resultat === 'echec' ? '❌ Échec' : '📵 Non joint'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  {formatDate(action.date_action)}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{action.notes || '(Pas de notes)'}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Aucune action enregistrée
        </div>
      )}

      {/* Formulaire */}
      <div className="card">
        <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>Enregistrer une nouvelle action</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Type d'action
            </label>
            <select value={actionForm.type_action} onChange={(e) => setActionForm({ ...actionForm, type_action: e.target.value })}>
              <option value="appel">📞 Appel</option>
              <option value="visite">🚗 Visite</option>
              <option value="whatsapp">💬 WhatsApp</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Résultat
            </label>
            <select value={actionForm.resultat} onChange={(e) => setActionForm({ ...actionForm, resultat: e.target.value })}>
              <option value="">Sélectionner un résultat</option>
              <option value="succes">✅ Succès</option>
              <option value="echec">❌ Échec</option>
              <option value="non_joint">📵 Non joint</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Notes
            </label>
            <textarea
              value={actionForm.notes}
              onChange={(e) => setActionForm({ ...actionForm, notes: e.target.value })}
              placeholder="Détails de l'action..."
              style={{ minHeight: '100px' }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleCreateAction}
            disabled={createActionMutation.isPending || !actionForm.resultat}
            style={{ alignSelf: 'flex-end' }}
          >
            {createActionMutation.isPending ? 'Enregistrement...' : 'Enregistrer l\'action'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ MAIN PAGE ============
export default function PDVDetailPage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('infos');
  const [showEdit, setShowEdit] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: pdv, isLoading, error } = useQuery({
    queryKey: ['pdv', id],
    queryFn: () => pdvService.getPDV(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="page">
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div>
      </div>
    );
  }

  if (error || !pdv) {
    return (
      <div className="page">
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
          Erreur: PDV non trouvé
        </div>
      </div>
    );
  }

  const getMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  const tabs = [
    { id: 'infos', label: 'ℹ️ Informations' },
    { id: 'performances', label: '📊 Performances' },
    { id: 'courbes', label: '📈 Courbes' },
    { id: 'actions', label: '🎯 Actions Terrain' },
  ];

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h1 className="page-title">
              {pdv?.nom} {getMedal(pdv?.rank)}
            </h1>
            <p className="page-subtitle">
              PDV #{pdv?.numero} • {pdv?.zone} • {pdv?.type_pdv || 'Type inconnu'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="badge" style={{ background: pdv?.statut==='ACTIF'?'rgba(0,214,143,0.15)':'rgba(255,71,87,0.15)', color: pdv?.statut==='ACTIF'?'var(--success)':'var(--danger)' }}>
              {pdv?.statut || 'ACTIF'}
            </span>
            <span className="badge" style={{ background: 'rgba(55,66,250,0.15)', color: '#74b9ff' }}>
              {pdv?.type_pdv || 'Standard'}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pdvs')} style={{ marginLeft:4 }}>
              <ArrowLeft size={14}/> Retour
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowEdit(true)}>
              <Edit2 size={14}/> Modifier
            </button>
          </div>
        </div>

        {/* Health Score Gauge */}
        <div className="card">
          <HealthScoreGauge score={pdv?.health_score || 0} />
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container mb-24">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'infos' && <TabInformations pdv={pdv} />}
        {activeTab === 'performances' && <TabPerformances pdv={pdv} />}
        {activeTab === 'courbes' && <TabCourbes pdv={pdv} />}
        {activeTab === 'actions' && <TabActionsTerrain pdv={pdv} />}
      </div>

      {showEdit && pdv && (
        <EditPDVModal
          pdv={pdv}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            queryClient.invalidateQueries(['pdv', id]);
            queryClient.invalidateQueries(['pdvs']);
          }}
        />
      )}
    </div>
  );
}
