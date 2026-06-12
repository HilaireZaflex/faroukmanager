import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Plus, Store, ChevronRight, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import toast from 'react-hot-toast';
import './PDVsPage.css';

const STATUT_CONFIG = {
  ACTIF: { label: 'Actif', className: 'badge-success' },
  INACTIF: { label: 'Inactif', className: 'badge-danger' },
  RECUPERATION: { label: 'Récup.', className: 'badge-warning' },
  DESACTIVE: { label: 'Désactivé', className: 'badge-neutral' },
};

const TYPE_CONFIG = {
  RS: { label: 'RS', className: 'badge-info' },
  RSF: { label: 'RSF', className: 'badge-orange' },
  RNS: { label: 'RNS', className: 'badge-neutral' },
  KIOSQUE: { label: 'Kiosque', className: 'badge-warning' },
};

const MEDAILLE = { OR: '🥇', ARGENT: '🥈', BRONZE: '🥉', AUCUNE: '' };

// Nettoyer les valeurs "nan" (venant d'imports pandas) → afficher "—"
const clean = (val) => (!val || val === 'nan' || val === 'NaN' || val === 'None') ? null : val;

function HealthBar({ score }) {
  const color = score >= 70 ? '#00d68f' : score >= 40 ? '#ffa502' : '#ff4757';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-bar" style={{ width: 80 }}>
        <div className="progress-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{score?.toFixed(0)}</span>
    </div>
  );
}

const INITIAL_FORM = {
  // Infos gérant
  prenom: '', nom: '', numero_pdv: '', numero_personnel: '',
  date_naissance: '', nationalite: '', type_piece: '', date_delivrance: '', numero_piece: '',
  domicile: '', telephone: '',
  // Infos PDV
  type_activite: '', adresse_pdv: '', type_pdv: 'RS', date_activation: '',
  montant_activation: '',
  // Réseau
  zone: '', sous_zone: '', quartier: '',
  nom_garant: '', tel_garant: '',
  developpeur: '', tel_developpeur: '',
  gestionnaire: '', tel_gestionnaire: '',
  superviseur: '', tel_superviseur: '',
  teleconseillere: '', tel_teleconseillere: '',
  // Formations suivies
  kaabu: false, nafama: false, omy: false, lbft: false,
  statut: 'ACTIF',
};

// Composants UI réutilisables
const FL = ({ label, required, children }) => (
  <div style={{ marginBottom: 4 }}>
    <label style={{ fontSize: 10, color: '#FF6900', display:'block', marginBottom: 3, fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
      {label}{required && <span style={{ color:'#ff4757' }}> *</span>}
    </label>
    {children}
  </div>
);
const FI = ({ placeholder, value, onChange, type='text', required }) => (
  <input type={type} placeholder={placeholder} value={value} onChange={onChange} required={required}
    style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)',
      background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:13, outline:'none',
      boxSizing:'border-box' }} />
);
const FS = ({ value, onChange, children }) => (
  <select value={value} onChange={onChange}
    style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)',
      background:'rgba(20,20,35,0.9)', color:'#fff', fontSize:13 }}>
    {children}
  </select>
);
const Section = ({ title, icon, children, cols=2 }) => (
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

function NouveauPDVModal({ onClose, onSuccess, zones }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Charger l'équipe réseau depuis le backend
  const { data: equipe } = useQuery('equipe-reseau',
    () => api.get('/reseau/equipe').then(r => r.data).catch(() => ({ superviseurs:[], gestionnaires:[], developpeurs:[], teleconseilleres:[] })),
    { staleTime: 300000 }
  );

  // Sélecteur avec auto-remplissage du téléphone
  const TeamSelect = ({ label, nameKey, telKey, options=[] }) => (
    <FL label={label}>
      <FS value={form[nameKey]} onChange={e => {
        const nom = e.target.value;
        const found = options.find(o => o.nom === nom);
        setForm(f => ({ ...f, [nameKey]: nom, [telKey]: found?.telephone || '' }));
      }}>
        <option value="">-- Sélectionner --</option>
        {options.map(o => <option key={o.nom} value={o.nom}>{o.nom}</option>)}
      </FS>
    </FL>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.numero_pdv || !form.zone) {
      toast.error('Numéro PDV et Zone sont obligatoires');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        numero_pdv: form.numero_pdv,
        nom: `${form.prenom} ${form.nom}`.trim() || form.numero_pdv,
        numero_personnel: form.numero_personnel,
        type_pdv: form.type_pdv || 'RS',
        zone: form.zone,
        sous_zone: form.sous_zone,
        quartier: form.quartier,
        adresse: form.adresse_pdv,
        telephone: form.telephone,
        nom_gerant: `${form.prenom} ${form.nom}`.trim(),
        superviseur: form.superviseur,
        gestionnaire: form.gestionnaire,
        developpeur: form.developpeur,
        teleconseillere: form.teleconseillere,
        statut: 'ACTIF',
        nouvelle_creation: true,
        date_activation: form.date_activation || null,
      };
      await api.post('/pdvs', payload);
      toast.success(`PDV "${payload.nom}" créé avec succès !`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)',
        border: '1px solid rgba(255,105,0,0.3)',
        borderRadius: 16, width: '95%', maxWidth: 780,
        maxHeight: '92vh', overflowY: 'auto',
        padding: '28px 32px', position: 'relative',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#FF6900,#ff9500)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📋</div>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>FICHE DE RENSEIGNEMENTS</div>
              <div style={{ fontSize:11, color:'#FF6900', fontWeight:600, letterSpacing:'1px' }}>FAROUK DISTRIBUTION — NOUVELLE ACTIVATION</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#aaa', padding:'6px 10px', cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>

          {/* SECTION 1 — Informations Gérant */}
          <Section title="Informations du Gérant" icon="👤" cols={3}>
            <FL label="Prénom"><FI placeholder="Prénom" value={form.prenom} onChange={e=>set('prenom',e.target.value)} /></FL>
            <FL label="Nom"><FI placeholder="Nom" value={form.nom} onChange={e=>set('nom',e.target.value)} /></FL>
            <FL label="Nationalité"><FI placeholder="Nationalité" value={form.nationalite} onChange={e=>set('nationalite',e.target.value)} /></FL>
            <FL label="Date de naissance"><FI type="date" value={form.date_naissance} onChange={e=>set('date_naissance',e.target.value)} /></FL>
            <FL label="Type de pièce">
              <FS value={form.type_piece} onChange={e=>set('type_piece',e.target.value)}>
                <option value="">Sélectionner</option>
                <option value="CNI">CNI</option>
                <option value="Passeport">Passeport</option>
                <option value="Permis">Permis de conduire</option>
                <option value="Autre">Autre</option>
              </FS>
            </FL>
            <FL label="Numéro de pièce"><FI placeholder="N° pièce d'identité" value={form.numero_piece} onChange={e=>set('numero_piece',e.target.value)} /></FL>
            <FL label="Date de délivrance"><FI type="date" value={form.date_delivrance} onChange={e=>set('date_delivrance',e.target.value)} /></FL>
            <FL label="Domicile"><FI placeholder="Adresse domicile" value={form.domicile} onChange={e=>set('domicile',e.target.value)} /></FL>
          </Section>

          {/* SECTION 2 — Informations PDV */}
          <Section title="Informations du PDV" icon="🏪" cols={3}>
            <FL label="Numéro Flotte *" required><FI placeholder="N° Flotte" value={form.numero_pdv} onChange={e=>set('numero_pdv',e.target.value)} required /></FL>
            <FL label="N° Personnel"><FI placeholder="N° Personnel" value={form.numero_personnel} onChange={e=>set('numero_personnel',e.target.value)} /></FL>
            <FL label="Type de réseau">
              <FS value={form.type_pdv} onChange={e=>set('type_pdv',e.target.value)}>
                <option value="RS">RS (Revendeur Spécial)</option>
                <option value="RSF">RSF</option>
                <option value="RNS">RNS</option>
                <option value="KIOSQUE">Kiosque</option>
                <option value="DEALER">Dealer</option>
              </FS>
            </FL>
            <FL label="Type d'activité"><FI placeholder="Ex: Commerce, Boutique..." value={form.type_activite} onChange={e=>set('type_activite',e.target.value)} /></FL>
            <FL label="Zone *" required>
              <FS value={form.zone} onChange={e=>set('zone',e.target.value)} required>
                <option value="">Sélectionner une zone</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </FS>
            </FL>
            <FL label="Quartier"><FI placeholder="Quartier / Commune" value={form.quartier} onChange={e=>set('quartier',e.target.value)} /></FL>
            <FL label="Adresse PDV" required><FI placeholder="Adresse complète du PDV" value={form.adresse_pdv} onChange={e=>set('adresse_pdv',e.target.value)} /></FL>
            <FL label="Date d'activation"><FI type="date" value={form.date_activation} onChange={e=>set('date_activation',e.target.value)} /></FL>
            <FL label="Montant d'activation (FCFA)"><FI type="number" placeholder="0" value={form.montant_activation} onChange={e=>set('montant_activation',e.target.value)} /></FL>
          </Section>

          {/* SECTION 3 — Le Garant */}
          <Section title="Le Garant" icon="🤝" cols={2}>
            <FL label="Nom du Garant"><FI placeholder="Nom complet du garant" value={form.nom_garant} onChange={e=>set('nom_garant',e.target.value)} /></FL>
            <FL label="Téléphone du Garant"><FI placeholder="+223 XX XX XX XX" value={form.tel_garant} onChange={e=>set('tel_garant',e.target.value)} /></FL>
          </Section>

          {/* SECTION 4 — Équipe Réseau */}
          <Section title="Équipe Réseau" icon="👥" cols={2}>
            <TeamSelect label="Développeur" nameKey="developpeur" telKey="tel_developpeur" options={equipe?.developpeurs || []} />
            <FL label="Tél. Développeur">
              <FI placeholder="Auto-rempli ou saisir" value={form.tel_developpeur} onChange={e=>set('tel_developpeur',e.target.value)} />
            </FL>
            <TeamSelect label="Gestionnaire" nameKey="gestionnaire" telKey="tel_gestionnaire" options={equipe?.gestionnaires || []} />
            <FL label="Tél. Gestionnaire">
              <FI placeholder="Auto-rempli ou saisir" value={form.tel_gestionnaire} onChange={e=>set('tel_gestionnaire',e.target.value)} />
            </FL>
            <TeamSelect label="Superviseur" nameKey="superviseur" telKey="tel_superviseur" options={equipe?.superviseurs || []} />
            <FL label="Tél. Superviseur">
              <FI placeholder="Auto-rempli ou saisir" value={form.tel_superviseur} onChange={e=>set('tel_superviseur',e.target.value)} />
            </FL>
            <TeamSelect label="Téléconseillère" nameKey="teleconseillere" telKey="tel_teleconseillere" options={equipe?.teleconseilleres || []} />
            <FL label="Tél. Téléconseillère">
              <FI placeholder="Auto-rempli ou saisir" value={form.tel_teleconseillere} onChange={e=>set('tel_teleconseillere',e.target.value)} />
            </FL>
          </Section>

          {/* SECTION 4 — Formations suivies */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, paddingBottom:8, borderBottom:'1px solid rgba(255,105,0,0.2)' }}>
              <span style={{ fontSize:16 }}>🎓</span>
              <span style={{ fontSize:12, fontWeight:800, color:'#FF6900', textTransform:'uppercase', letterSpacing:'1px' }}>Formations Suivies</span>
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {[
                { key:'kaabu',     label:'KAABU',       color:'#00d68f', desc:'Formation Kaabu' },
                { key:'nafama',    label:'NAFAMA',       color:'#a29bfe', desc:'Formation Nafama' },
                { key:'omy',       label:'OMY/ARNAQUE',  color:'#FF6900', desc:'Formation OMY & Arnaque' },
                { key:'lbft',      label:'LBFT',         color:'#fd79a8', desc:'Formation LBFT' },
              ].map(s => (
                <div key={s.key} onClick={() => set(s.key, !form[s.key])}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderRadius:10, cursor:'pointer',
                    border: `2px solid ${form[s.key] ? s.color : 'rgba(255,255,255,0.08)'}`,
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

          {/* Boutons */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:16, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose}
              style={{ padding:'10px 24px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#aaa', fontSize:13, cursor:'pointer', fontWeight:600 }}>
              Annuler
            </button>
            <button type="submit" disabled={loading}
              style={{ padding:'10px 28px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#FF6900,#ff9500)', color:'#fff', fontSize:13, cursor:'pointer', fontWeight:700, opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳ Création...' : '✅ Créer le PDV'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PDVsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [periodeType, setPeriodeType] = useState('mensuel');
  const [selectedMois, setSelectedMois] = useState(null);
  const [selectedSemaine, setSelectedSemaine] = useState(null);
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [statut, setStatut] = useState('');
  const [typePdv, setTypePdv] = useState('');
  const [service, setService] = useState('OMY');
  const [page, setPage] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const limit = 20;

  const params = { limit, skip: page * limit };
  if (search) params.search = search;
  if (zone) params.zone = zone;
  if (statut) params.statut = statut;
  if (typePdv) params.type_pdv = typePdv;

  const { data: pdvs = [], isLoading } = useQuery(
    ['pdvs', params],
    () => api.get('/pdvs', { params }).then(r => r.data),
    { keepPreviousData: true, staleTime: 300000 }
  );

  const { data: lastAvailable } = useQuery('last-available', () => api.get('/dashboard/last-available').then(r => r.data), { staleTime: 300000 });
  const mois = selectedMois || lastAvailable?.last_month?.mois || new Date().getMonth() + 1;
  const annee = lastAvailable?.last_month?.annee || new Date().getFullYear();
  const lastSemaine = selectedSemaine || lastAvailable?.last_week?.semaine;
  const lastSemaineAnnee = lastAvailable?.last_week?.annee;
  const MOIS_NOMS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const moisDisponibles = lastAvailable?.mois_disponibles || [];
  const semainesDisponibles = lastAvailable?.semaines_disponibles || [];
  
  const { data: statsBase } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 300000 });
  const { data: dashboardMonthly } = useQuery(['pdv-dashboard-monthly', annee, mois, zone, typePdv, service], () =>
    api.get('/dashboard/monthly', { params: { annee, mois, ...(zone ? { zone } : {}), ...(typePdv ? { type_pdv: typePdv } : {}), service } }).then(r => r.data),
    { staleTime: 0, enabled: periodeType === 'mensuel' && !!lastAvailable });
  const { data: dashboardWeekly } = useQuery(['pdv-dashboard-weekly', lastSemaineAnnee, lastSemaine, zone, typePdv, service], () =>
    api.get('/dashboard/weekly', { params: { annee: lastSemaineAnnee, semaine: lastSemaine, ...(zone ? { zone } : {}), ...(typePdv ? { type_pdv: typePdv } : {}), service } }).then(r => r.data),
    { staleTime: 0, enabled: periodeType === 'hebdo' && !!lastAvailable && !!lastSemaine });
  
  const activeDash = periodeType === 'mensuel' ? dashboardMonthly : dashboardWeekly;

  // Stats dynamiques selon TOUS les filtres actifs (zone, type, statut)
  const { data: dynamicStatsRaw } = useQuery(
    ['pdvs-stats-filtres', zone, typePdv, statut],
    () => api.get('/pdvs/stats', { params: { 
      ...(zone ? { zone } : {}), 
      ...(typePdv ? { type_pdv: typePdv } : {}),
      ...(statut ? { statut } : {}),
    }}).then(r => r.data),
    { staleTime: 0, cacheTime: 0 }
  );

  // KPIs dynamiques — réagissent à zone, type, statut, service ET période
  // - total_pdvs : total réseau filtré (backend filtre par zone/type)
  // - actifs : PDVs avec transactions ce mois/semaine (activeDash)
  // - inactifs : PDVs sans transactions ce mois/semaine (activeDash)
  // - en_recuperation, nouvelles_creations : depuis /pdvs/stats (filtré par zone/type/statut)
  const dynamicStats = {
    total_pdvs: activeDash?.total_pdvs ?? dynamicStatsRaw?.total_pdvs ?? 0,
    actifs: activeDash?.active_pdvs ?? dynamicStatsRaw?.actifs ?? 0,
    inactifs: (activeDash?.inactive_pdvs ?? 0) + (activeDash?.pdvs_sans_donnees ?? 0),
    en_recuperation: dynamicStatsRaw?.en_recuperation ?? 0,
    nouvelles_creations: dynamicStatsRaw?.nouvelles_creations ?? 0,
  };

  const zones = statsBase?.pdvs_par_zone ? Object.keys(statsBase.pdvs_par_zone) : [];

  const handleExportExcel = async () => {
    try {
      // Fetch all PDVs for export (no pagination limit)
      const allPDVs = await api.get('/pdvs', { params: { limit: 1000, ...( zone ? { zone } : {}), ...(statut ? { statut } : {}), ...(typePdv ? { type_pdv: typePdv } : {}), ...(search ? { search } : {}) } }).then(r => r.data);
      const rows = allPDVs.map(p => ({
        'Numéro PDV': p.numero_pdv,
        'Nom': p.nom,
        'Type': p.type_pdv,
        'Zone': p.zone,
        'Sous-zone': p.sous_zone || '',
        'Superviseur': p.superviseur || '',
        'Téléconseillère': p.teleconseillere || '',
        'Statut': p.statut,
        'Health Score': p.health_score?.toFixed(0) || 0,
        'Médaille': p.medaille || 'AUCUNE',
        'Téléphone': p.telephone || '',
        'Gérant': p.nom_gerant || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PDVs');
      XLSX.writeFile(wb, `pdvs_export_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast.success(`${rows.length} PDVs exportés avec succès !`);
    } catch (err) {
      toast.error('Erreur lors de l\'export');
    }
  };

  return (
    <div className="page pdvs-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Points de Vente</h1>
          <p className="page-subtitle">{dynamicStats.total_pdvs || 0} PDVs enregistrés · {dynamicStats.actifs || 0} actifs</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleExportExcel}><Download size={14}/> Exporter Excel</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus size={14}/> Nouveau PDV</button>
        </div>
      </div>

      {/* Stats mini */}
      {/* ── Sélecteur de période ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 8, padding: 4, gap: 4 }}>
          <button onClick={() => setPeriodeType('mensuel')} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: periodeType === 'mensuel' ? 'var(--primary)' : 'transparent', color: periodeType === 'mensuel' ? '#fff' : 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📅 Mensuel
          </button>
          <button onClick={() => setPeriodeType('hebdo')} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: periodeType === 'hebdo' ? 'var(--primary)' : 'transparent', color: periodeType === 'hebdo' ? '#fff' : 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📆 Hebdomadaire
          </button>
        </div>
        {periodeType === 'mensuel' ? (
          <select value={selectedMois || mois} onChange={e => setSelectedMois(Number(e.target.value))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
            {moisDisponibles.map(m => (
              <option key={m.mois} value={m.mois}>{MOIS_NOMS[m.mois-1]} {m.annee}</option>
            ))}
          </select>
        ) : (
          <select value={selectedSemaine || lastSemaine} onChange={e => setSelectedSemaine(Number(e.target.value))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
            {semainesDisponibles.map(s => (
              <option key={s.semaine} value={s.semaine}>Semaine {s.semaine} · {s.annee}</option>
            ))}
          </select>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {periodeType === 'mensuel' ? `📊 ${MOIS_NOMS[(selectedMois||mois)-1]} ${annee}` : `📊 Semaine ${selectedSemaine||lastSemaine} · ${lastSemaineAnnee}`}
        </span>
      </div>

      {/* ── Sélecteur de service (comme dans OMY) ── */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>Service :</span>
        {[
          { key: 'OMY',    label: 'PDV OMY',    color: '#FF6900' },
          { key: 'KAABU',  label: 'PDV KAABU',  color: '#00d68f' },
          { key: 'NAFAMA', label: 'PDV NAFAMA',  color: '#a29bfe' },
        ].map(s => (
          <button key={s.key} onClick={() => { setService(s.key); setPage(0); }}
            style={{
              padding: '6px 18px', borderRadius: 8, border: `1px solid ${service === s.key ? s.color : 'var(--border)'}`,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
              background: service === s.key ? s.color : 'rgba(255,255,255,0.06)',
              color: service === s.key ? '#fff' : 'var(--text-secondary)',
            }}>
            {s.label}
          </button>
        ))}
        {service !== 'OMY' && (
          <span style={{ fontSize:11, color:'var(--text-secondary)', fontStyle:'italic', marginLeft:8 }}>
            ⚠️ Données {service} non encore importées — affichage en attente
          </span>
        )}
      </div>

      <div className="pdv-mini-stats mb-24">
        <div className="mini-stat-card" style={{ '--color': '#00d68f', cursor: 'pointer', outline: statut === '' ? '2px solid #00d68f' : 'none' }} onClick={() => { setStatut(''); setPage(0); }}>
          <span className="mini-stat-val">{dynamicStats.total_pdvs || 0}</span>
          <span className="mini-stat-label">Total PDVs</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#10b981', cursor: 'pointer', outline: statut === 'ACTIF' ? '2px solid #10b981' : 'none' }} onClick={() => { setStatut('ACTIF'); setPage(0); }}>
          <span className="mini-stat-val">{dynamicStats.actifs || 0}</span>
          <span className="mini-stat-label">✅ Actifs</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#ef4444', cursor: 'pointer', outline: statut === 'INACTIF' ? '2px solid #ef4444' : 'none' }} onClick={() => { setStatut('INACTIF'); setPage(0); }}>
          <span className="mini-stat-val">{dynamicStats.inactifs || 0}</span>
          <span className="mini-stat-label">🔴 Inactifs</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#f59e0b', cursor: 'pointer', outline: statut === 'RECUPERATION' ? '2px solid #f59e0b' : 'none' }} onClick={() => { setStatut('RECUPERATION'); setPage(0); }}>
          <span className="mini-stat-val">{dynamicStats.en_recuperation || 0}</span>
          <span className="mini-stat-label">⚠️ Récupération</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#3b82f6', cursor: 'pointer', outline: statut === 'NOUVELLE' ? '2px solid #3b82f6' : 'none' }} onClick={() => { setStatut(''); setPage(0); /* filtre nouvelles créations */ }}>
          <span className="mini-stat-val">{dynamicStats.nouvelles_creations || 0}</span>
          <span className="mini-stat-label">🆕 Nvelles Créations</span>
        </div>
      </div>

      {/* Filters */}
      <div className="pdv-filters card mb-16">
        <div className="filter-search">
          <Search size={15} className="search-icon"/>
          <input
            type="text"
            placeholder="Rechercher un PDV, numéro, superviseur..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div className="filter-selects">
          <select value={zone} onChange={e => { setZone(e.target.value); setPage(0); }}>
            <option value="">Toutes les zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={statut} onChange={e => { setStatut(e.target.value); setPage(0); }}>
            <option value="">Tous les statuts</option>
            <option value="ACTIF">Actif</option>
            <option value="INACTIF">Inactif</option>
            <option value="RECUPERATION">Récupération</option>
          </select>
          <select value={typePdv} onChange={e => { setTypePdv(e.target.value); setPage(0); }}>
            <option value="">Tous les types</option>
            <option value="RS">RS</option>
            <option value="RSF">RSF</option>
            <option value="RNS">RNS</option>
            <option value="KIOSQUE">Kiosque</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PDV</th>
                <th>Zone</th>
                <th>Type</th>
                <th>Single Wallet</th>
                <th>Statut</th>
                <th>Superviseur</th>
                <th>Médaille</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16, width: j === 0 ? 160 : 80 }}/></td>
                    ))}
                  </tr>
                ))
              ) : pdvs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <Store size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 10px' }}/>
                    Aucun PDV trouvé
                  </td>
                </tr>
              ) : (
                pdvs.map(pdv => (
                  <tr key={pdv.id} onClick={() => navigate(`/pdvs/${pdv.id}`)}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.3px' }}>{pdv.numero_pdv}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{clean(pdv.nom) || pdv.numero_pdv}</div>
                      </div>
                    </td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{clean(pdv.zone) || '—'}</span></td>
                    <td>
                      <span className={`badge ${TYPE_CONFIG[pdv.type_pdv]?.className || 'badge-neutral'}`}>
                        {TYPE_CONFIG[pdv.type_pdv]?.label || pdv.type_pdv}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUT_CONFIG[pdv.statut]?.className || 'badge-neutral'}`}>
                        {STATUT_CONFIG[pdv.statut]?.label || pdv.statut}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${pdv.single_wallet ? 'badge-success' : 'badge-neutral'}`}
                        style={{ fontSize: 11 }}>
                        {pdv.single_wallet ? '✓ OUI' : '✗ NON'}
                      </span>
                    </td>
                    <td><span style={{ fontSize: 12 }}>{clean(pdv.superviseur) || '—'}</span></td>
                    <td style={{ fontSize: 18 }}>{MEDAILLE[pdv.medaille] || ''}</td>
                    <td><ChevronRight size={16} style={{ color: 'var(--text-muted)' }}/></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pdv-pagination">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Page {page + 1} · {pdvs.length} résultats
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}>← Préc.</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={pdvs.length < limit}>Suiv. →</button>
          </div>
        </div>
      </div>

      {/* Modal Nouveau PDV */}
      {showModal && (
        <NouveauPDVModal
          zones={zones}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries(['pdvs']);
            queryClient.invalidateQueries('pdv-stats');
          }}
        />
      )}
    </div>
  );
}
