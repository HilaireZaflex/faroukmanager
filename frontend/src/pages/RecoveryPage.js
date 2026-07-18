import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Phone, CheckCircle, ArrowRight, X, Info, ChevronDown, ChevronUp, Download } from 'lucide-react';
import api from '../services/api';
import alertService from '../services/alertService';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

function formatCA(v) {
  if (!v || v === 0) return '0 FCFA';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M FCFA`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} K FCFA`;
  return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ') + ' FCFA';
}

// ─── LÉGENDE EXPLICATIVE ─────────────────────────────────────────────────────
function LegendPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'rgba(55,66,250,0.08)', border: '1px solid rgba(55,66,250,0.25)', borderRadius: 14, marginBottom: 24, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: '#a29bfe' }}>
        <Info size={18} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>📖 Comment fonctionne le Programme de Récupération ?</span>
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Objectif */}
          <div>
            <h4 style={{ color: '#a29bfe', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎯 Objectif du Programme</h4>
            <p style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
              Le Programme de Récupération vise à <strong style={{color:'#fff'}}>réactiver les PDVs inactifs</strong> en suivant un processus structuré en 4 étapes.
              Chaque PDV inactif est identifié, contacté, sa SIM est récupérée si nécessaire, puis il est redéployé pour reprendre l'activité.
            </p>
          </div>

          {/* Processus */}
          <div>
            <h4 style={{ color: '#a29bfe', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🔄 Les 4 Étapes du Processus</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {[
                { icon: '🔍', label: 'IDENTIFIÉ', color: '#8a8a9a', desc: 'Le PDV a été détecté comme inactif. Il est enregistré dans le programme pour suivi. Aucune action terrain encore effectuée.' },
                { icon: '📞', label: 'CONTACTÉ', color: '#ffa502', desc: 'Un superviseur a contacté le gérant du PDV (par téléphone ou visite). Le dialogue est en cours pour comprendre la situation.' },
                { icon: '💳', label: 'SIM RÉCUPÉRÉE', color: '#3742fa', desc: "La carte SIM Orange du PDV a été physiquement récupérée au bureau. L'ancienne ligne est désactivée. Préparation du redéploiement." },
                { icon: '✅', label: 'REDÉPLOYÉ', color: '#00d68f', desc: 'Le PDV est de retour en activité avec une nouvelle SIM ou un nouveau gérant. Le processus est terminé avec succès.' },
              ].map((s, i) => (
                <div key={i} style={{ background: `color-mix(in srgb, ${s.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${s.color} 30%, transparent)`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginBottom: 6 }}>{s.label}</div>
                  <p style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5, margin: 0 }}>{s.desc}</p>
                </div>
              ))}
            </div>
            {/* Flèche de progression */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, fontSize: 12, color: '#8a8a9a' }}>
              <span style={{color:'#8a8a9a'}}>🔍 Identifié</span>
              <ArrowRight size={12}/>
              <span style={{color:'#ffa502'}}>📞 Contacté</span>
              <ArrowRight size={12}/>
              <span style={{color:'#3742fa'}}>💳 SIM Récupérée</span>
              <ArrowRight size={12}/>
              <span style={{color:'#00d68f'}}>✅ Redéployé</span>
            </div>
          </div>

          {/* Qui fait quoi */}
          <div>
            <h4 style={{ color: '#a29bfe', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>👥 Rôles et Responsabilités</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {[
                { role: '🏢 Manager', desc: 'Supervise l\'ensemble du programme, valide les redéploiements et analyse les résultats globaux.' },
                { role: '👔 Superviseur', desc: 'Responsable du contact terrain avec les PDVs de sa zone, effectue les visites et suit les dossiers.' },
                { role: '📱 Téléconseillère', desc: 'Assure les appels de suivi réguliers et tient à jour les statuts dans le système.' },
              ].map((r, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#fff', marginBottom: 6 }}>{r.role}</div>
                  <p style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5, margin: 0 }}>{r.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <h4 style={{ color: '#a29bfe', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>⚡ Comment utiliser ce tableau ?</h4>
            <ul style={{ fontSize: 12, color: '#ccc', lineHeight: 2, margin: 0, paddingLeft: 20 }}>
              <li>Cliquez sur <strong style={{color:'#FF6900'}}>le bouton d'action</strong> de chaque carte PDV pour faire avancer son statut</li>
              <li>Ajoutez des <strong style={{color:'#FF6900'}}>notes</strong> à chaque étape pour garder un historique des actions</li>
              <li>Utilisez <strong style={{color:'#FF6900'}}>l'Export Excel</strong> pour partager le rapport avec l'équipe</li>
              <li>Les PDVs en <strong style={{color:'#ff4757'}}>rouge</strong> sont prioritaires (inactifs depuis plusieurs mois)</li>
              <li>Un PDV <strong style={{color:'#00d68f'}}>Redéployé</strong> signifie que la mission est accomplie !</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUTS = [
  { id: 'IDENTIFIE',    label: 'Identifié',      color: 'var(--text-secondary)', icon: '🔍', next: 'CONTACTE' },
  { id: 'CONTACTE',     label: 'Contacté',        color: 'var(--warning)',        icon: '📞', next: 'SIM_RECUPEREE' },
  { id: 'SIM_RECUPEREE',label: 'SIM Récupérée',   color: '#3742fa',               icon: '💳', next: 'REDEPLOYE' },
  { id: 'REDEPLOYE',    label: 'Redéployé',       color: 'var(--success)',        icon: '✅', next: null },
];

const NEXT_LABEL = { IDENTIFIE: 'Contacter', CONTACTE: 'SIM Récupérée', SIM_RECUPEREE: 'Redéployer' };

function ContactModal({ pdv, onClose, onSave }) {
  const [notes, setNotes] = useState('');
  const [statut, setStatut] = useState(pdv.statut_recuperation || pdv.statut || 'IDENTIFIE');
  const nextStatut = STATUTS.find(s => s.id === statut)?.next;
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!nextStatut) { onClose(); return; }
    setLoading(true);
    try {
      // L'API update nécessite recovery_id (= pdv.id qui est l'id de la ligne recovery)
      await onSave({ recovery_id: pdv.id, statut: nextStatut, notes, superviseur_responsable: pdv.superviseur_responsable || '' });
      toast.success(`Statut mis à jour : ${STATUTS.find(s=>s.id===nextStatut)?.label}`);
      onClose();
    } catch {
      toast.error('Erreur lors de la mise à jour');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480, width: '95%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ fontSize:15, fontWeight:700 }}>📞 Action de Récupération</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={15}/></button>
        </div>

        <div style={{ padding:'12px 14px', background:'rgba(255,255,255,0.03)', borderRadius:10, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{pdv.nom || pdv.pdv_nom || `PDV #${pdv.pdv_id}`}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)' }}>📍 {pdv.zone || '—'} · 👤 {pdv.superviseur_responsable || '—'}</div>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Statut actuel</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {STATUTS.map(s => (
              <button key={s.id} onClick={() => setStatut(s.id)}
                style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:600, border:`1px solid ${statut===s.id ? s.color : 'var(--border)'}`, background: statut===s.id ? `color-mix(in srgb, ${s.color} 15%, transparent)` : 'transparent', color: statut===s.id ? s.color : 'var(--text-secondary)', cursor:'pointer' }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Notes / Commentaires</label>
          <textarea rows={3} placeholder="Ex: Client contacté, récupération prévue semaine prochaine..." value={notes} onChange={e => setNotes(e.target.value)} style={{ width:'100%' }} />
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          {nextStatut && (
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Sauvegarde...' : `✅ Passer à "${STATUTS.find(s=>s.id===nextStatut)?.label}"`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecoveryPage() {
  const queryClient = useQueryClient();
  const [modalPdv, setModalPdv] = useState(null);
  const [filterSup, setFilterSup] = useState('');
  const [filterZone, setFilterZone] = useState('');

  // Données de la liste de récupération (vraies données)
  const { data: recoveryData, isLoading } = useQuery(
    'recovery-liste-apercu',
    () => api.get('/alerts/recovery/liste?seuil=5000000').then(r => r.data),
    { staleTime: 60000 }
  );

  // Données du programme de suivi (Kanban)
  const { data: recovery } = useQuery(
    'recovery-list',
    () => api.get('/alerts/recovery').then(r => r.data),
    { staleTime: 30000 }
  );

  const { data: synthese } = useQuery(
    'recovery-synthese',
    () => alertService.getRecoverySynthese(),
    { staleTime: 60000 }
  );

  // Stats du tracking réel
  const { data: trackingData } = useQuery(
    'recovery-tracking-apercu',
    () => api.get('/alerts/recovery/tracking').then(r => r.data),
    { staleTime: 30000 }
  );

  const updateMutation = useMutation(
    (data) => alertService.updateRecovery(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('recovery-list');
        queryClient.invalidateQueries('recovery-synthese');
      },
      onError: () => toast.error('Erreur lors de la mise à jour du statut'),
    }
  );

  const list = recovery?.pdvs || (Array.isArray(recovery) ? recovery : []);
  const listeRecup = recoveryData?.liste || [];
  const getStatut = (r) => r.statut_recuperation || r.statut || 'IDENTIFIE';

  // Filtrage
  const superviseurs = [...new Set([
    ...list.map(r => r.superviseur_responsable),
    ...listeRecup.map(r => r.superviseur)
  ].filter(Boolean))];
  const zones = [...new Set([
    ...list.map(r => r.zone),
    ...listeRecup.map(r => r.zone)
  ].filter(Boolean))];

  const filteredList = list.filter(r =>
    (!filterSup || r.superviseur_responsable === filterSup) &&
    (!filterZone || r.zone === filterZone)
  );

  // Stats par zone depuis les vraies données
  const statsByZone = listeRecup.reduce((acc, p) => {
    const z = p.zone || 'Non défini';
    if (!acc[z]) acc[z] = { zone: z, count: 0, ca: 0 };
    acc[z].count++;
    acc[z].ca += p.ca_total;
    return acc;
  }, {});
  const zoneStats = Object.values(statsByZone).sort((a, b) => b.count - a.count);

  // Stats par superviseur
  const statsBySup = listeRecup.reduce((acc, p) => {
    const s = p.superviseur || 'Non défini';
    if (!acc[s]) acc[s] = { sup: s, count: 0, ca: 0 };
    acc[s].count++;
    acc[s].ca += p.ca_total;
    return acc;
  }, {});
  const supStats = Object.values(statsBySup).sort((a, b) => b.count - a.count).slice(0, 8);

  const nbFlotte = listeRecup.filter(p => p.numero_flotte).length;
  const caTotal = listeRecup.reduce((s, p) => s + p.ca_total, 0);
  const caMoyCourant = listeRecup.length > 0
    ? listeRecup.reduce((s, p) => s + p.ca_mois_courant, 0) / listeRecup.length : 0;

  // Stats tracking réelles
  const tsStats = trackingData?.stats || {};
  const tsTotal = trackingData?.total || 0;

  // KPIs depuis vraies données (basés sur la liste à récupérer)
  const nbZero    = listeRecup.filter(p => p.ca_total === 0).length;
  const nbDeja    = listeRecup.filter(p => p.deja_en_recuperation).length;
  const totalExclus = recoveryData?.exclusions
    ? Object.values(recoveryData.exclusions).reduce((a,b)=>a+b,0) : 0;

  const kpis = [
    { label: 'PDV à récupérer',  value: recoveryData?.total ?? '—',   icon: '🔍', color: '#ff6b81', desc: `${recoveryData?.mois_courant_nom || ''} ${recoveryData?.annee_courante || ''}` },
    { label: 'CA quasi nul',     value: nbZero,                        icon: '💤', color: '#8a8a9a', desc: 'aucune transaction 2 mois' },
    { label: 'Déjà en récup.',   value: nbDeja,                        icon: '🔁', color: '#ffa502', desc: 'récidivistes mois précédent' },
    { label: 'N° Flotte',        value: nbFlotte,                      icon: '🚗', color: '#FF6900', desc: 'lignes Flotte Orange' },
    { label: 'PDV exclus auto',  value: totalExclus,                   icon: '⚙️', color: '#a29bfe', desc: 'filtrés automatiquement' },
    { label: 'CA Moyen/PDV',     value: formatCA(listeRecup.length > 0 ? caTotal / listeRecup.length : 0), icon: '💰', color: '#00b894', desc: 'CA cumulé sur 2 mois' },
  ];

  const redeployes = filteredList.filter(r => getStatut(r) === 'REDEPLOYE').length;
  const tauxSucces = filteredList.length > 0 ? Math.round((redeployes / filteredList.length) * 100) : 0;

  const exportExcel = () => {
    const rows = filteredList.map(r => ({
      'PDV': r.nom || `PDV #${r.pdv_id}`,
      'Zone': r.zone || '-',
      'Superviseur Responsable': r.superviseur_responsable || '-',
      'Statut': getStatut(r),
      'CA 3 Mois (FCFA)': r.ca_cumule_3mois || r.ca_3_mois || 0,
      'Date Identification': r.date_identification ? new Date(r.date_identification).toLocaleDateString('fr-FR') : '-',
      'Date Contact': r.date_contact ? new Date(r.date_contact).toLocaleDateString('fr-FR') : '-',
      'Date SIM': r.date_recuperation_sim ? new Date(r.date_recuperation_sim).toLocaleDateString('fr-FR') : '-',
      'Date Redéploiement': r.date_redeploiement ? new Date(r.date_redeploiement).toLocaleDateString('fr-FR') : '-',
      'Notes': r.notes || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recovery');
    XLSX.writeFile(wb, `programme_recuperation_${new Date().toLocaleDateString('fr-FR').replace(/\//g,'-')}.xlsx`);
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">🔄 Programme de Récupération</h1>
          <p className="page-subtitle">Suivi du processus de récupération des PDVs inactifs Orange Mali</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a' }}>Taux de succès</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#00d68f' }}>{tauxSucces}%</div>
          </div>
          <button className="btn btn-ghost" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* LÉGENDE */}
      <LegendPanel />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{ textAlign:'center', padding: '16px 12px' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: typeof k.value === 'string' ? 13 : 24, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color:'var(--text-secondary)', marginTop: 4, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 10, color:'#555', marginTop: 2 }}>{k.desc}</div>
          </div>
        ))}
      </div>

      {/* Barre de progression globale */}
      <div className="card mb-24" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>📊 Progression globale du programme</span>
          <span style={{ fontSize: 12, color: '#8a8a9a' }}>{filteredList.length} PDVs au total</span>
        </div>
        <div style={{ display: 'flex', height: 28, borderRadius: 14, overflow: 'hidden', gap: 2 }}>
          {STATUTS.map(s => {
            const count = filteredList.filter(r => getStatut(r) === s.id).length;
            const pct = filteredList.length > 0 ? (count / filteredList.length) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div key={s.id} style={{ width: `${pct}%`, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', minWidth: pct > 5 ? 'auto' : 0 }}>
                {pct > 8 ? `${s.icon} ${count}` : ''}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
          {STATUTS.map(s => {
            const count = filteredList.filter(r => getStatut(r) === s.id).length;
            const pct = filteredList.length > 0 ? Math.round((count / filteredList.length) * 100) : 0;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
                <span style={{ color: '#aaa' }}>{s.label}: <strong style={{ color: '#fff' }}>{count} ({pct}%)</strong></span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── STATS PAR ZONE + SUPERVISEUR ── */}
      {listeRecup.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Par Zone */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#fff' }}>
              📍 PDV à récupérer par Zone — <span style={{ color: '#FF6900' }}>{recoveryData?.mois_courant_nom} {recoveryData?.annee_courante}</span>
            </div>
            {zoneStats.map(z => (
              <div key={z.zone} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#ccc', fontWeight: 600 }}>{z.zone}</span>
                  <span style={{ fontSize: 12, color: '#ff6b81', fontWeight: 800 }}>{z.count} PDV</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round((z.count / recoveryData.total) * 100)}%`,
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, #ff4757, #ff6b81)'
                  }}/>
                </div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                  CA cumulé : {formatCA(z.ca)}
                </div>
              </div>
            ))}
          </div>

          {/* Par Superviseur */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#fff' }}>
              👔 PDV à récupérer par Superviseur
            </div>
            {supStats.map(s => (
              <div key={s.sup} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#ccc', fontWeight: 600, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sup}</span>
                  <span style={{ fontSize: 12, color: '#ffa502', fontWeight: 800 }}>{s.count} PDV</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round((s.count / recoveryData.total) * 100)}%`,
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, #ffa502, #ffcc02)'
                  }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#8a8a9a', fontWeight: 600 }}>Filtrer :</span>
        <select value={filterSup} onChange={e => setFilterSup(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', fontSize: 13 }}>
          <option value="">Tous les superviseurs</option>
          {superviseurs.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', fontSize: 13 }}>
          <option value="">Toutes les zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {(filterSup || filterZone) && (
          <button onClick={() => { setFilterSup(''); setFilterZone(''); }}
            style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,71,87,0.15)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', fontSize: 12, cursor: 'pointer' }}>
            ✕ Effacer filtres
          </button>
        )}
      </div>

      {/* Kanban board */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {STATUTS.map(statut => {
          const items = filteredList.filter(r => getStatut(r) === statut.id);
          return (
            <div key={statut.id} style={{ background:'var(--bg-card)', border:`1px solid ${statut.id === 'REDEPLOYE' ? 'rgba(0,214,143,0.3)' : 'var(--border)'}`, borderRadius:'var(--radius)', overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', background:`color-mix(in srgb, ${statut.color} 10%, transparent)`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:20 }}>{statut.icon}</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:statut.color }}>{statut.label}</div>
                    <div style={{ fontSize:10, color:'#555' }}>
                      {statut.id === 'IDENTIFIE' && 'En attente de contact'}
                      {statut.id === 'CONTACTE' && 'Dialogue en cours'}
                      {statut.id === 'SIM_RECUPEREE' && 'SIM au bureau'}
                      {statut.id === 'REDEPLOYE' && 'Mission accomplie ✓'}
                    </div>
                  </div>
                </div>
                <span style={{ background:`color-mix(in srgb, ${statut.color} 25%, transparent)`, color:statut.color, padding:'3px 10px', borderRadius:12, fontSize:13, fontWeight:800 }}>{items.length}</span>
              </div>

              <div style={{ padding:10, display:'flex', flexDirection:'column', gap:8, minHeight:200, maxHeight:620, overflowY:'auto' }}>
                {isLoading ? (
                  <div className="skeleton" style={{ height:90, borderRadius:10 }}/>
                ) : items.length === 0 ? (
                  <div style={{ textAlign:'center', color:'#555', fontSize:12, padding:'40px 0' }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>📭</div>
                    Aucun PDV ici
                  </div>
                ) : items.map((r, i) => {
                  const daysSince = r.date_identification
                    ? Math.floor((new Date() - new Date(r.date_identification)) / 86400000) : null;
                  const isPriority = daysSince && daysSince > 30;
                  const caVal = r.ca_cumule_3mois || r.ca_3_mois || r.ca_3mois || 0;
                  return (
                    <div key={i} style={{ background: isPriority ? 'rgba(255,71,87,0.05)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isPriority ? 'rgba(255,71,87,0.2)' : 'var(--border)'}`, borderRadius:10, padding:12 }}>
                      {isPriority && (
                        <div style={{ fontSize:10, color:'#ff4757', fontWeight:700, marginBottom:4 }}>⚠️ PRIORITAIRE — {daysSince}j</div>
                      )}
                      <div style={{ fontWeight:700, fontSize:12, marginBottom:4 }}>{r.nom || r.pdv_nom || `PDV #${r.pdv_id}`}</div>
                      {r.zone && <div style={{ fontSize:11, color:'#8a8a9a', marginBottom:2 }}>📍 {r.zone}</div>}
                      {r.superviseur_responsable && <div style={{ fontSize:11, color:'#aaa', marginBottom:4 }}>👔 {r.superviseur_responsable}</div>}
                      {caVal > 0 && (
                        <div style={{ fontSize:11, color:'#FF6900', fontWeight:600, marginBottom:6 }}>💰 {formatCA(caVal)}</div>
                      )}
                      {r.notes && (
                        <div style={{ fontSize:10, color:'#666', fontStyle:'italic', marginBottom:6, padding:'6px 8px', background:'rgba(255,255,255,0.03)', borderRadius:6, lineHeight:1.4 }}>
                          "{r.notes.length > 70 ? r.notes.substring(0, 70) + '...' : r.notes}"
                        </div>
                      )}
                      {r.date_identification && (
                        <div style={{ fontSize:10, color:'#555', marginBottom:6 }}>
                          🗓 {new Date(r.date_identification).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                      {statut.next && (
                        <button className="btn btn-ghost btn-sm"
                          style={{ fontSize:10, padding:'5px 8px', width:'100%', marginTop:4, borderColor:statut.color, color:statut.color }}
                          onClick={() => setModalPdv(r)}>
                          <Phone size={10}/> {NEXT_LABEL[statut.id] || 'Avancer'}
                          <ArrowRight size={10} style={{ marginLeft:4 }}/>
                        </button>
                      )}
                      {statut.id === 'REDEPLOYE' && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6, fontSize:11, color:'#00d68f', fontWeight:600 }}>
                          <CheckCircle size={12}/> Récupération réussie 🎉
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modalPdv && (
        <ContactModal
          pdv={modalPdv}
          onClose={() => setModalPdv(null)}
          onSave={(data) => updateMutation.mutateAsync(data)}
        />
      )}
    </div>
  );
}
