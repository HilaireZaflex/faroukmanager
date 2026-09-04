/**
 * AccueilTCPage — Page d'accueil dédiée aux Téléconseillères
 * Affiche uniquement leurs KPIs, rappels et historique d'appels
 */
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import AppelTCModal from '../components/common/AppelTCModal';

const COLOR = '#00d68f';

function formatCA(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('fr-FR').format(Math.round(value)) + ' F';
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${days}j`;
}

const STATUT_ICONS = {
  JOIGNABLE_PROMESSE: '✅',
  JOIGNABLE_PAS_INTERESSE: '📞',
  JOIGNABLE_DEJA_ACTIF: '🔄',
  NON_JOIGNABLE_HORS_ZONE: '📵',
  NON_JOIGNABLE_PAS_REPONSE: '🔕',
  NUMERO_INCORRECT: '❌',
  PDV_FERME: '🏪',
  RAPPEL_PROGRAMME: '📅',
};
const STATUT_COLORS = {
  JOIGNABLE_PROMESSE: '#22c55e',
  JOIGNABLE_DEJA_ACTIF: '#00d68f',
  JOIGNABLE_PAS_INTERESSE: '#ffa502',
  RAPPEL_PROGRAMME: '#a29bfe',
  NON_JOIGNABLE_HORS_ZONE: '#ff4757',
  NON_JOIGNABLE_PAS_REPONSE: '#ff4757',
  NUMERO_INCORRECT: '#ff4757',
  PDV_FERME: '#8a8a9a',
};


// ─── File d'appels unifiée TC ──────────────────────────────────────────────────
const ALERTE_COLORS = { rouge: '#ff4757', orange: '#ffa502', vert: '#22c55e' };
const IND_COLORS = { OMY: '#a29bfe', NAFAMA: '#00cec9', KAABU: '#fdcb6e', UNIFIE: '#74b9ff' };
const STATUTS_APPEL = [
  { val: 'JOIGNABLE_PROMESSE',         label: '✅ Joignable — Promesse de relance' },
  { val: 'JOIGNABLE_PAS_INTERESSE',    label: '📞 Joignable — Pas intéressé' },
  { val: 'JOIGNABLE_DEJA_ACTIF',       label: '🔄 Joignable — Déjà actif' },
  { val: 'NON_JOIGNABLE_PAS_REPONSE',  label: '🔕 Pas de réponse' },
  { val: 'NON_JOIGNABLE_HORS_ZONE',    label: '📵 Hors zone / Injoignable' },
  { val: 'NUMERO_INCORRECT',           label: '❌ Numéro incorrect' },
  { val: 'RAPPEL_PROGRAMME',           label: '📅 Rappel programmé' },
  { val: 'PDV_FERME',                  label: '🏪 PDV fermé' },
];

function ScoreBadge({ score }) {
  const color = score >= 60 ? '#ff4757' : score >= 30 ? '#ffa502' : '#22c55e';
  const label = score >= 60 ? 'CRITIQUE' : score >= 30 ? 'URGENT' : 'MODÉRÉ';
  return (
    <span style={{ background: `${color}20`, color, border: `1px solid ${color}40`,
      borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 800 }}>
      {label} {score}pts
    </span>
  );
}

function AlerteBadge({ alerte }) {
  const color = ALERTE_COLORS[alerte.couleur] || '#aaa';
  const indColor = IND_COLORS[alerte.indicateur] || '#aaa';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4,
      background: `${indColor}15`, border: `1px solid ${indColor}40`,
      borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700, margin: '2px' }}>
      <span style={{ color: indColor }}>{alerte.indicateur}</span>
      <span style={{ color: alerte.type === 'INACTIF' ? '#ff4757' : '#ffa502', fontSize: 9 }}>
        {alerte.type === 'INACTIF' ? '🔴 INACTIF' : '🟡 BAISSE'}
      </span>
    </span>
  );
}

function ModalAppelUnifie({ pdv, onClose, onSuccess }) {
  const [statut, setStatut] = React.useState('');
  const [commentaire, setCommentaire] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const indicateurs = pdv.alertes.map(a => a.indicateur).join(',');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!statut) return alert('Sélectionnez un statut');
    setLoading(true);
    try {
      await api.post(`/tc/marquer-appele/${pdv.numero_pdv}`, null, {
        params: { statut, commentaire: commentaire || undefined, indicateurs }
      });
      onSuccess(pdv.numero_pdv);
      onClose();
    } catch { alert("Erreur lors de l'enregistrement"); }
    finally { setLoading(false); }
  };

  // Générer le script suggéré
  const motifs = pdv.alertes.map(a => a.details).join(', ');
  const script = `"Bonjour ${pdv.nom}, nous avons remarqué : ${motifs}. Pouvez-vous nous dire ce qui se passe ?"`;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}>
      <div style={{ background:'#0f0f1a', borderRadius:16, padding:28, maxWidth:520, width:'100%',
        border:'1px solid rgba(255,255,255,0.1)', maxHeight:'90vh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:'#fff' }}>{pdv.nom}</div>
            <div style={{ fontSize:12, color:'#64748b' }}>{pdv.numero_pdv} · {pdv.zone} · 📞 {pdv.telephone || '—'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#aaa', fontSize:20, cursor:'pointer' }}>×</button>
        </div>

        {/* Alertes */}
        <div style={{ background:'rgba(255,71,87,0.06)', border:'1px solid rgba(255,71,87,0.2)',
          borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:11, color:'#ff4757', fontWeight:700, marginBottom:8, textTransform:'uppercase' }}>
            🚨 {pdv.nb_alertes} alerte{pdv.nb_alertes > 1 ? 's' : ''} — 1 seul appel suffit
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
            {pdv.alertes.map((a, i) => <AlerteBadge key={i} alerte={a} />)}
          </div>
          {pdv.alertes.map((a, i) => (
            <div key={i} style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>• {a.details}</div>
          ))}
        </div>

        {/* Script suggéré */}
        <div style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)',
          borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:11, color:'#818cf8', fontWeight:700, marginBottom:6 }}>💬 Script suggéré</div>
          <div style={{ fontSize:12, color:'#c7d2fe', fontStyle:'italic', lineHeight:1.5 }}>{script}</div>
        </div>

        {/* Indicateurs chiffrés */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          {[
            { label:'OMY', curr: pdv.omy_curr, prec: pdv.omy_prec, color: IND_COLORS.OMY },
            { label:'NAFAMA', curr: pdv.nafama_curr, prec: pdv.nafama_prec, color: IND_COLORS.NAFAMA },
            { label:'KAABU', curr: pdv.kaabu_curr, prec: pdv.kaabu_prec, color: IND_COLORS.KAABU },
          ].map(({ label, curr, prec, color }) => (
            <div key={label} style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'10px', textAlign:'center' }}>
              <div style={{ fontSize:10, color, fontWeight:700, marginBottom:4 }}>{label}</div>
              <div style={{ fontSize:13, fontWeight:800, color: curr === 0 ? '#ff4757' : '#fff' }}>
                {curr ? new Intl.NumberFormat('fr-FR').format(curr) : '0'}
              </div>
              <div style={{ fontSize:9, color:'#64748b' }}>vs {prec ? new Intl.NumberFormat('fr-FR').format(prec) : '0'}</div>
            </div>
          ))}
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#FF6900', fontWeight:700, display:'block', marginBottom:6 }}>
              RÉSULTAT DE L'APPEL *
            </label>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {STATUTS_APPEL.map(s => (
                <label key={s.val} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                  padding:'8px 12px', borderRadius:8,
                  background: statut === s.val ? 'rgba(255,105,0,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${statut === s.val ? '#FF6900' : 'rgba(255,255,255,0.08)'}` }}>
                  <input type="radio" name="statut" value={s.val} checked={statut === s.val}
                    onChange={() => setStatut(s.val)} style={{ accentColor:'#FF6900' }} />
                  <span style={{ fontSize:13, color: statut === s.val ? '#FF6900' : '#94a3b8' }}>{s.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#FF6900', fontWeight:700, display:'block', marginBottom:6 }}>NOTES</label>
            <textarea rows={3} value={commentaire} onChange={e => setCommentaire(e.target.value)}
              placeholder="Observations, promesses du PDV, date de rappel..."
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)',
                background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button type="button" onClick={onClose}
              style={{ padding:'9px 20px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'#aaa', cursor:'pointer', fontSize:13 }}>
              Annuler
            </button>
            <button type="submit" disabled={loading || !statut}
              style={{ padding:'9px 24px', borderRadius:8, border:'none',
                background: loading || !statut ? 'rgba(255,105,0,0.3)' : 'linear-gradient(135deg,#FF6900,#ff9500)',
                color:'#fff', fontWeight:800, cursor: loading || !statut ? 'not-allowed' : 'pointer', fontSize:13 }}>
              {loading ? '⏳...' : "📞 Enregistrer l'appel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TabFileUnifiee({ annee, mois: moisInit }) {
  const [mois, setMoisLocal] = React.useState(moisInit);
  const [filtre, setFiltre]   = React.useState('TOUS');
  const [search, setSearch]   = React.useState('');
  const [zoneF, setZoneF]     = React.useState('');
  const [supF, setSupF]       = React.useState('');
  const [modalPDV, setModalPDV] = React.useState(null);
  const [appelsFaits, setAppelsFaits] = React.useState(new Set());
  const [data, setData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const refetch = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await api.get('/tc/liste-unifiee', { params: { annee, mois } });
      setData(resp.data);
    } catch(e) { console.error('TC liste-unifiee error:', e); }
    finally { setIsLoading(false); }
  }, [annee, mois]);

  React.useEffect(() => { refetch(); }, [refetch]);

  const fmtK = v => v ? new Intl.NumberFormat('fr-FR').format(v) : '0';

  const pdvs = (data?.pdvs || [])
    .filter(p => filtre === 'TOUS' || (
      filtre === 'CRITIQUE' ? p.score >= 60 :
      filtre === 'URGENT'   ? p.score >= 30 && p.score < 60 :
      filtre === 'MULTI'    ? p.nb_alertes >= 2 :
      filtre === 'INACTIFS' ? p.alertes.some(a => a.type === 'INACTIF') : true
    ))
    .filter(p => !appelsFaits.has(p.numero_pdv))
    .filter(p => !search || p.nom?.toLowerCase().includes(search.toLowerCase()) || p.numero_pdv?.includes(search))
    .filter(p => !zoneF || p.zone === zoneF)
    .filter(p => !supF || p.superviseur === supF);

  const zones = [...new Set((data?.pdvs||[]).map(p => p.zone).filter(Boolean))].sort();
  const sups  = [...new Set((data?.pdvs||[]).map(p => p.superviseur).filter(Boolean))].sort();

  const handleAppelFait = (num_pdv) => {
    setAppelsFaits(prev => new Set([...prev, num_pdv]));
    refetch();
  };

  if (isLoading) return (
    <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>📞</div>
      <div>Chargement de la file d'appels...</div>
    </div>
  );

  const stats = data?.stats || {};

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:'#fff', marginBottom:4 }}>
            📞 File d'appels unifiée — {stats.mois || '...'} {stats.annee || ''}
          </div>
          <div style={{ fontSize:12, color:'#64748b' }}>
            Chaque PDV n'apparaît qu'une fois · Toutes alertes agrégées · Cooldown 48h actif
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={mois} onChange={e => setMoisLocal(parseInt(e.target.value))}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'#1a1a2e', color:'#fff', fontSize:13 }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
              const noms = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
              return <option key={m} value={m}>{noms[m]}</option>;
            })}
          </select>
          <button onClick={() => refetch()} style={{ padding:'8px 16px', borderRadius:8,
            border:'none', background:'linear-gradient(135deg,#FF6900,#ff9500)',
            color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>🔄 Actualiser</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
        {[
          { label:'PDVs à appeler', val: (data?.pdvs||[]).length - appelsFaits.size, color:'#FF6900', bg:'linear-gradient(135deg,rgba(255,105,0,0.12),rgba(255,105,0,0.04))', icon:'📞', desc:"Priorité aujourd'hui" },
          { label:'Multi-alertes (2+)', val: stats.multi_alertes, color:'#ff4757', bg:'linear-gradient(135deg,rgba(255,71,87,0.12),rgba(255,71,87,0.04))', icon:'⚡', desc:'OMY + NAFAMA + KAABU' },
          { label:'En cooldown 48h', val: stats.en_cooldown, color:'#64748b', bg:'linear-gradient(135deg,rgba(100,116,139,0.12),rgba(100,116,139,0.04))', icon:'⏳', desc:'Déjà appelés récemment' },
        ].map(({ label, val, color, bg, icon, desc }) => (
          <div key={label} style={{ background: bg, border:`1px solid ${color}30`, borderRadius:16, padding:'20px 24px', display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ fontSize:36 }}>{icon}</div>
            <div>
              <div style={{ fontSize:36, fontWeight:900, color, lineHeight:1 }}>{val ?? 0}</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginTop:4 }}>{label}</div>
              <div style={{ fontSize:11, color:'#64748b' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
      {/* KPI secondaires */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Inactifs OMY', val: stats.inactifs_omy, color: IND_COLORS.OMY },
          { label:'Inactifs NAFAMA', val: stats.inactifs_nafama, color: IND_COLORS.NAFAMA },
          { label:'Inactifs KAABU', val: stats.inactifs_kaabu, color: IND_COLORS.KAABU },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background:'rgba(255,255,255,0.02)', border:`1px solid ${color}25`, borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13, color:'#94a3b8' }}>{label}</span>
            <span style={{ fontSize:22, fontWeight:900, color }}>{val ?? 0}</span>
          </div>
        ))}
      </div>

      {/* Filtres — 2 lignes : catégories + recherche/zone/sup */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { id:'TOUS',    label:'Tous' },
            { id:'CRITIQUE',label:'🔴 Critique' },
            { id:'URGENT',  label:'🟡 Urgent' },
            { id:'MULTI',   label:'⚡ Multi-alertes' },
            { id:'INACTIFS',label:'💤 Inactifs' },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltre(f.id)}
              style={{ padding:'7px 16px', borderRadius:20, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
                background: filtre === f.id ? '#FF6900' : 'rgba(255,255,255,0.05)',
                color: filtre === f.id ? '#fff' : '#64748b',
                boxShadow: filtre === f.id ? '0 3px 10px rgba(255,105,0,0.3)' : 'none' }}>
              {f.label}
            </button>
          ))}
          <span style={{ marginLeft:'auto', fontSize:12, color:'#64748b', alignSelf:'center' }}>{pdvs.length} PDVs</span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input placeholder="🔍 Rechercher PDV..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{ flex:1, padding:'9px 14px', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:13 }} />
          <select value={zoneF} onChange={e=>setZoneF(e.target.value)}
            style={{ padding:'9px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'#1a1a2e', color:'#fff', fontSize:13, flex:'0 0 auto' }}>
            <option value="">📍 Toutes zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={supF} onChange={e=>setSupF(e.target.value)}
            style={{ padding:'9px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'#1a1a2e', color:'#fff', fontSize:13, flex:'0 0 auto' }}>
            <option value="">👤 Tous superviseurs</option>
            {sups.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Progress bar */}
      {(data?.pdvs||[]).length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#64748b', marginBottom:4 }}>
            <span>Progression : {appelsFaits.size}/{(data?.pdvs||[]).length} appelés</span>
            <span>{Math.round(appelsFaits.size/(data?.pdvs||[]).length*100)}%</span>
          </div>
          <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', background:'linear-gradient(90deg,#FF6900,#22c55e)',
              width: `${Math.round(appelsFaits.size/(data?.pdvs||[]).length*100)}%`, transition:'width 0.5s' }} />
          </div>
        </div>
      )}

      {/* Liste des PDVs */}
      {pdvs.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#64748b' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>{appelsFaits.size > 0 ? '🎉' : '✅'}</div>
          <div style={{ fontSize:16, color:'#94a3b8', fontWeight:700 }}>
            {appelsFaits.size > 0 ? 'Tous les PDVs filtrés ont été appelés !' : 'Aucun PDV à appeler pour ce filtre'}
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {pdvs.map((p, i) => (
            <div key={p.numero_pdv}
              style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)',
                borderLeft:`4px solid ${p.score >= 60 ? '#ff4757' : p.score >= 30 ? '#ffa502' : '#22c55e'}`,
                borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:16 }}>
              {/* Rang */}
              <div style={{ fontSize:14, fontWeight:900, color:'#64748b', minWidth:24 }}>{i+1}</div>
              {/* Infos PDV */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{p.nom}</span>
                  <span style={{ fontSize:11, color:'#64748b' }}>{p.numero_pdv}</span>
                  <ScoreBadge score={p.score} />
                  {p.dernier_appel && (
                    <span style={{ fontSize:10, color:'#64748b', background:'rgba(255,255,255,0.05)', borderRadius:4, padding:'1px 6px' }}>
                      Dernier appel: {p.dernier_appel}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:6 }}>
                  📍 {p.zone} · {p.sous_zone} · 👤 {p.superviseur} · 📞 {p.telephone || '—'}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
                  {p.alertes.map((a, j) => <AlerteBadge key={j} alerte={a} />)}
                </div>
                <div style={{ display:'flex', gap:16, fontSize:11 }}>
                  <span style={{ color: IND_COLORS.OMY }}>OMY: {fmtK(p.omy_curr)}F <span style={{ color:'#64748b' }}>/ {fmtK(p.omy_prec)}F</span></span>
                  <span style={{ color: IND_COLORS.NAFAMA }}>NAFAMA: {fmtK(p.nafama_curr)}F <span style={{ color:'#64748b' }}>/ {fmtK(p.nafama_prec)}F</span></span>
                  <span style={{ color: IND_COLORS.KAABU }}>KAABU: {fmtK(p.kaabu_curr)} tx <span style={{ color:'#64748b' }}>/ {fmtK(p.kaabu_prec)}</span></span>
                </div>
              </div>
              {/* Bouton Appeler */}
              <button onClick={() => setModalPDV(p)}
                style={{ padding:'10px 20px', borderRadius:10, border:'none',
                  background:'linear-gradient(135deg,#FF6900,#ff9500)', color:'#fff',
                  fontWeight:800, fontSize:13, cursor:'pointer', whiteSpace:'nowrap',
                  boxShadow:'0 4px 12px rgba(255,105,0,0.3)', flexShrink:0 }}>
                📞 Appeler
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal appel */}
      {modalPDV && (
        <ModalAppelUnifie
          pdv={modalPDV}
          onClose={() => setModalPDV(null)}
          onSuccess={handleAppelFait}
        />
      )}
    </div>
  );
}
export default function AccueilTCPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const teleNom = (user?.nom || '').trim();
  const prenom = user?.prenom || user?.nom || 'Téléconseillère';
  const [appelPDV, setAppelPDV] = useState(null);
  const [activeTab, setActiveTab] = useState('unifie');

  const now = new Date();
  const heures = now.getHours();
  const salutation = heures < 12 ? 'Bonjour' : heures < 18 ? 'Bon après-midi' : 'Bonsoir';

  // Mes appels du jour
  const { data: mesAppels } = useQuery(
    'tc-appels-recents',
    () => api.get('/appels-tc', { params: { mes_appels_seulement: true, limit: 10 } }).then(r => r.data),
    { staleTime: 30000, refetchInterval: 60000 }
  );

  // PDVs à rappeler (date de rappel aujourd'hui ou passée)
  const { data: rappels } = useQuery(
    'tc-rappels',
    () => api.get('/appels-tc', { params: { mes_appels_seulement: true, limit: 50 } }).then(r => r.data),
    { staleTime: 30000 }
  );

  // Stats inactifs OMY (mes PDVs)
  const { data: inactifsOMY } = useQuery(
    ['tc-inactifs-omy', teleNom],
    () => api.get('/dashboard/monthly-inactive', { params: { annee: now.getFullYear(), mois: now.getMonth() + 1 } }).then(r => r.data),
    { staleTime: 300000, enabled: !!teleNom }
  );

  // Stats inactifs NAFAMA (mes PDVs)
  const { data: inactifsNAFAMA } = useQuery(
    ['tc-inactifs-nafama', teleNom],
    () => api.get('/nafama/monthly/inactive', { params: { annee: now.getFullYear(), mois: now.getMonth() + 1 } }).then(r => r.data),
    { staleTime: 300000, enabled: !!teleNom }
  );

  // Mes PDVs en baisse OMY
  const { data: baisseOMY } = useQuery(
    ['tc-baisse-omy', teleNom],
    () => api.get('/dashboard/monthly-declining', { params: { annee: now.getFullYear(), mois: now.getMonth() + 1, seuil: -10 } }).then(r => r.data),
    { staleTime: 300000, enabled: !!teleNom }
  );

  // Filtrer par TC
  const myInactifsOMY = (inactifsOMY?.pdvs || []).filter(p =>
    (p.teleconseillere || '').toLowerCase().includes(teleNom.toLowerCase())
  );
  const myInactifsNAFAMA = (inactifsNAFAMA?.pdvs || []).filter(p =>
    (p.teleconseillere || '').toLowerCase().includes(teleNom.toLowerCase())
  );
  const myBaisseOMY = (baisseOMY?.pdvs || []).filter(p =>
    (p.teleconseillere || '').toLowerCase().includes(teleNom.toLowerCase())
  );

  const appelsAujourdHui = (mesAppels?.items || []).filter(a => {
    const d = new Date(a.created_at);
    return d.toDateString() === now.toDateString();
  });

  const rappelsAFaire = (rappels?.items || []).filter(a => {
    if (a.statut !== 'RAPPEL_PROGRAMME' || !a.date_rappel) return false;
    return new Date(a.date_rappel) <= now;
  });

  const totalAAppeler = myInactifsOMY.length + myInactifsNAFAMA.length + myBaisseOMY.length;

  const cardStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '18px 20px',
  };

  return (
    <div style={{ padding: '20px 20px 80px', maxWidth: 900, margin: '0 auto' }}>

      {/* ── Bienvenue ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,214,143,0.15) 0%, rgba(0,214,143,0.03) 100%)',
        border: '1px solid rgba(0,214,143,0.3)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#00d68f,#00b377)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>👋</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
            {salutation}, {prenom} !
          </div>
          <div style={{ fontSize: 12, color: COLOR }}>
            Téléconseillère · Farouk Distribution
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        {appelsAujourdHui.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'center', background: 'rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: COLOR }}>{appelsAujourdHui.length}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>appel{appelsAujourdHui.length > 1 ? 's' : ''} aujourd'hui</div>
          </div>
        )}
      </div>

      {/* ── Tabs Navigation ── */}
      <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap', background:'rgba(255,255,255,0.02)', borderRadius:12, padding:6 }}>
        {[
          { id:'unifie',  icon:'📞', label:"File d'appels unifi\u00e9e", badge: totalAAppeler },
          { id:'kpis',    icon:'📊', label:'Mes KPIs' },
          { id:'rappels', icon:'📅', label:'Rappels', badge: rappelsAFaire.length || null },
          { id:'historique', icon:'📋', label:'Historique' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:9, border:'none',
              background: activeTab === tab.id ? 'linear-gradient(135deg,#FF6900,#ff9500)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#64748b', fontWeight: activeTab === tab.id ? 800 : 500,
              fontSize:13, cursor:'pointer', position:'relative', transition:'all 0.2s' }}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge > 0 && (
              <span style={{ background: activeTab === tab.id ? 'rgba(255,255,255,0.3)' : '#FF6900',
                color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10, fontWeight:900 }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: File d'appels unifiée ── */}
      {activeTab === 'unifie' && <TabFileUnifiee annee={now.getMonth() === 0 ? now.getFullYear()-1 : now.getFullYear()} mois={now.getMonth() === 0 ? 12 : now.getMonth()} />}

      {/* ── Tab: KPIs + Historique ── */}
      {activeTab !== 'unifie' && (

      <div>
      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: '📵', label: 'Inactifs OMY', value: myInactifsOMY.length, color: '#ff4757', onClick: () => navigate('/omy/dashboard') },
          { icon: '🟢', label: 'Inactifs NAFAMA', value: myInactifsNAFAMA.length, color: '#00d68f', onClick: () => navigate('/nafama/dashboard') },
          { icon: '📉', label: 'En Baisse OMY', value: myBaisseOMY.length, color: '#ffa502', onClick: () => navigate('/omy/dashboard') },
          { icon: '📅', label: 'Rappels à faire', value: rappelsAFaire.length, color: '#a29bfe', onClick: null },
        ].map((k, i) => (
          <div key={i} onClick={k.onClick || undefined}
            style={{ ...cardStyle, textAlign: 'center', borderTop: `3px solid ${k.color}`, cursor: k.onClick ? 'pointer' : 'default', transition: 'transform 0.2s' }}
            onMouseOver={e => { if (k.onClick) e.currentTarget.style.transform = 'scale(1.03)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Rappels à faire ── */}
      {rappelsAFaire.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 20, borderLeft: '4px solid #a29bfe' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#a29bfe', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            📅 Rappels à effectuer ({rappelsAFaire.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rappelsAFaire.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(162,155,254,0.08)', borderRadius: 10, border: '1px solid rgba(162,155,254,0.2)' }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.nom_pdv || a.numero_pdv}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{a.indicateur} · Rappel prévu le {new Date(a.date_rappel).toLocaleDateString('fr-FR')}</div>
                  {a.commentaire && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{a.commentaire}</div>}
                </div>
                <button onClick={() => setAppelPDV({ numero_pdv: a.numero_pdv, nom: a.nom_pdv, indicateur: a.indicateur })}
                  style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 8, color: COLOR, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  📞 Appeler
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* ── PDVs inactifs prioritaires ── */}
        <div style={{ ...cardStyle, borderLeft: '4px solid #ff4757' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#ff4757', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>😴 PDVs Inactifs OMY ({myInactifsOMY.length})</span>
            {myInactifsOMY.length > 0 && <button onClick={() => navigate('/omy/dashboard')} style={{ fontSize: 11, background: 'none', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 6, color: '#ff4757', cursor: 'pointer', padding: '3px 8px' }}>Voir tout →</button>}
          </h3>
          {myInactifsOMY.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#22c55e', fontSize: 13 }}>✅ Aucun PDV inactif !</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myInactifsOMY.slice(0, 5).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,71,87,0.05)', borderRadius: 8, border: '1px solid rgba(255,71,87,0.15)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{p.numero_pdv}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{p.nb_mois_consecutifs_inactif} mois inactif · {p.zone}</div>
                  </div>
                  <button onClick={() => setAppelPDV({ ...p, indicateur: 'OMY' })}
                    style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 6, color: COLOR, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}>📞</button>
                </div>
              ))}
              {myInactifsOMY.length > 5 && <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', paddingTop: 4 }}>+{myInactifsOMY.length - 5} autres</div>}
            </div>
          )}
        </div>

        {/* ── PDVs en baisse ── */}
        <div style={{ ...cardStyle, borderLeft: '4px solid #ffa502' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#ffa502', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📉 PDVs En Baisse OMY ({myBaisseOMY.length})</span>
            {myBaisseOMY.length > 0 && <button onClick={() => navigate('/omy/dashboard')} style={{ fontSize: 11, background: 'none', border: '1px solid rgba(255,165,2,0.3)', borderRadius: 6, color: '#ffa502', cursor: 'pointer', padding: '3px 8px' }}>Voir tout →</button>}
          </h3>
          {myBaisseOMY.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#22c55e', fontSize: 13 }}>✅ Aucun PDV en baisse !</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myBaisseOMY.slice(0, 5).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,165,2,0.05)', borderRadius: 8, border: '1px solid rgba(255,165,2,0.15)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{p.numero_pdv}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>↓ {Math.abs(p.taux_baisse || 0).toFixed(1)}% · {p.zone}</div>
                  </div>
                  <button onClick={() => setAppelPDV({ ...p, indicateur: 'OMY' })}
                    style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 6, color: COLOR, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}>📞</button>
                </div>
              ))}
              {myBaisseOMY.length > 5 && <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', paddingTop: 4 }}>+{myBaisseOMY.length - 5} autres</div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Historique de mes appels ── */}
      <div style={{ ...cardStyle }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          📜 Mes derniers appels
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>({mesAppels?.total || 0} au total)</span>
        </h3>
        {!(mesAppels?.items?.length) ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📵</div>
            Vous n'avez pas encore enregistré d'appels.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mesAppels.items.slice(0, 8).map((a, i) => {
              const color = STATUT_COLORS[a.statut] || '#64748b';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `rgba(${color === '#22c55e' ? '34,197,94' : color === '#ffa502' ? '255,165,2' : color === '#ff4757' ? '255,71,87' : '162,155,254'},0.06)`, borderRadius: 10, border: `1px solid ${color}25` }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{STATUT_ICONS[a.statut] || '📞'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{a.nom_pdv || a.numero_pdv}
                      <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: a.indicateur === 'OMY' ? 'rgba(255,105,0,0.2)' : a.indicateur === 'NAFAMA' ? 'rgba(0,214,143,0.2)' : 'rgba(162,155,254,0.2)', color: a.indicateur === 'OMY' ? '#FF6900' : a.indicateur === 'NAFAMA' ? '#00d68f' : '#a29bfe' }}>{a.indicateur}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      <span style={{ color, fontWeight: 600 }}>{a.statut_label}</span>
                      {a.commentaire && ` · ${a.commentaire.slice(0, 50)}${a.commentaire.length > 50 ? '...' : ''}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Accès rapides ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
        {[
          { icon: '🏪', label: 'Mes PDVs', path: '/pdvs', color: '#3742fa' },
          { icon: '📱', label: 'Dashboard OMY', path: '/omy/dashboard', color: '#FF6900' },
          { icon: '🟢', label: 'Dashboard NAFAMA', path: '/nafama/dashboard', color: '#00d68f' },
        ].map((b, i) => (
          <button key={i} onClick={() => navigate(b.path)}
            style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${b.color}30`, borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
            onMouseOver={e => { e.currentTarget.style.background = `${b.color}10`; e.currentTarget.style.borderColor = `${b.color}60`; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = `${b.color}30`; }}>
            <span style={{ fontSize: 22 }}>{b.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: b.color }}>{b.label}</span>
          </button>
        ))}
      </div>

      {/* Modal appel */}
      {appelPDV && (
        <AppelTCModal
          pdv={appelPDV}
          indicateur={appelPDV.indicateur || 'OMY'}
          onClose={() => setAppelPDV(null)}
          onSaved={() => setAppelPDV(null)}
        />
      )}
      </div>
      )} {/* fin tab non-unifie */}
    </div>
  );
}
