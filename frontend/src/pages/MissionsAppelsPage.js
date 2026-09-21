/**
 * 📣 Missions d'appels — écran de l'ENCADREMENT.
 *
 * Créateurs : Admin · RC · Manager · Responsable Conformité · Responsable
 * Produit & Qualité Opérationnelle.
 * Exécutantes : les téléconseillères (elles reçoivent la liste dans Accueil TC).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Plus, Download, X, Search, Send, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import missionService from '../services/missionService';

const ORANGE = '#FF6900';

const fmt = v => Number(v || 0).toLocaleString('fr-FR');
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const PRIO_COUL = { NORMALE: '#64748b', HAUTE: '#f59e0b', URGENTE: '#ef4444' };

// Libellés lisibles des rôles renvoyés par l'API
const ROLE_LABELS = {
  superviseur: 'Superviseur',
  gestionnaire: 'Gestionnaire',
  manager: 'Manager',
  rc: 'Responsable Commercial',
  conformite: 'Responsable Conformité',
  responsable_produit_et_qualit_oprationnelle_: 'Responsable Produit & Qualité',
  developpeur: 'Développeur',
  commercial: 'Commercial',
  teleconseillere: 'Téléconseillère',
  admin: 'Administrateur',
};
const roleLabel = r => ROLE_LABELS[String(r || '').toLowerCase()] || r;
const STATUT_COUL = { BROUILLON: '#64748b', ACTIVE: '#00d68f', TERMINEE: '#3b82f6', ANNULEE: '#ef4444' };

// ── Petits composants réutilisables ───────────────────────────────────────────

function Badge({ children, color = '#64748b' }) {
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}55`,
      borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Barre({ pct, color = ORANGE }) {
  return (
    <div style={{ height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.min(100, pct || 0)}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  );
}

// ── Assistant de création (4 étapes) ─────────────────────────────────────────

const ETAPES = ['L\'appel', 'Qui appeler', 'Objectifs', 'Attribution'];
function AssistantMission({ refs, onClose, onCree }) {
  const [etape, setEtape] = useState(0);
  const [envoi, setEnvoi] = useState(false);

  // ── Étape 1 : l'appel ──
  const [titre, setTitre] = useState('');
  const [typeMission, setTypeMission] = useState('RELANCE_ACTIVITE');
  const [priorite, setPriorite] = useState('NORMALE');
  const [echeance, setEcheance] = useState('');
  const [consigne, setConsigne] = useState('');
  const [objectifTexte, setObjectifTexte] = useState('');

  // ── Étape 2 : qui appeler (simple) ──
  const [mode, setMode] = useState('PDV');          // PDV | PERSONNE
  const [annee, setAnnee] = useState(refs.annee_defaut);
  const [mois, setMois] = useState(refs.mois_defaut);
  const [q, setQ] = useState('');                   // recherche PDV (numéro ou nom)
  const [fSup, setFSup] = useState('');
  const [fGest, setFGest] = useState('');
  const [fQuartier, setFQuartier] = useState('');
  const [fSituation, setFSituation] = useState('');
  const [selPdv, setSelPdv] = useState([]);         // numéros de PDV cochés
  const [qPers, setQPers] = useState('');
  const [fRole, setFRole] = useState('superviseur');
  const [selPers, setSelPers] = useState([]);       // ids utilisateurs cochés

  // ── Étape 3 : objectifs ──
  const [objAppels, setObjAppels] = useState('');
  const [objPromesses, setObjPromesses] = useState('');
  const [objJoignabilite, setObjJoignabilite] = useState('');
  const [commentaireObligatoire, setCommentaireObligatoire] = useState(true);
  const [statutsAutorises, setStatutsAutorises] = useState([]);

  // ── Étape 4 : attribution ──
  const [tcs, setTcs] = useState([]);
  const [strategy, setStrategy] = useState('balanced');
  const [attribuerMaintenant, setAttribuerMaintenant] = useState(true);

  // La liste complète des PDV (chargée une fois, filtrée côté navigateur)
  const chargerPdv = etape === 1 && mode === 'PDV';
  const { data: pdvData, isLoading: chargementPdv } = useQuery(
    ['pdv-candidats', annee, mois],
    () => missionService.pdvCandidats(annee, mois),
    { enabled: chargerPdv, staleTime: 60000 },
  );
  const tousPdv = pdvData?.pdvs || [];

  // Les personnes (superviseurs, gestionnaires…) filtrées par rôle
  const chargerPers = etape === 1 && mode === 'PERSONNE';
  const { data: personnes = [], isLoading: chargementPers } = useQuery(
    ['personnes-candidats', fRole],
    () => missionService.personnes({ role: fRole || undefined }),
    { enabled: chargerPers, staleTime: 120000 },
  );

  // ── Filtrage de la liste des PDV ──
  const pdvFiltres = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return tousPdv.filter(p => {
      if (fSup && p.superviseur !== fSup) return false;
      if (fGest && p.gestionnaire !== fGest) return false;
      if (fQuartier && p.quartier !== fQuartier) return false;
      if (fSituation && !(p.situations || []).includes(fSituation)) return false;
      if (!terme) return true;
      return String(p.pdv_numero || '').toLowerCase().includes(terme)
          || String(p.nom || '').toLowerCase().includes(terme);
    });
  }, [tousPdv, q, fSup, fGest, fQuartier, fSituation]);

  // Toute la liste est affichée (le patron veut voir l'ensemble des PDV) :
  // le filtre par recherche/superviseur/gestionnaire/quartier suffit à réduire.

  const persFiltrees = useMemo(() => {
    const terme = qPers.trim().toLowerCase();
    if (!terme) return personnes;
    return personnes.filter(u => String(u.nom || '').toLowerCase().includes(terme));
  }, [personnes, qPers]);

  const basculerPdv = (num) =>
    setSelPdv(prev => prev.includes(num) ? prev.filter(x => x !== num) : [...prev, num]);
  const basculerPers = (id) =>
    setSelPers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toutCocherPdv = () => setSelPdv(prev =>
    [...new Set([...prev, ...pdvFiltres.map(p => p.pdv_numero)])]);
  const toutDecocherPdv = () => setSelPdv([]);
  const toutCocherPers = () => setSelPers(prev =>
    [...new Set([...prev, ...persFiltrees.map(u => u.user_id)])]);

  const nbSelection = selPdv.length + selPers.length;

  // ── Création ──
  const creer = async () => {
    if (!titre.trim()) { toast.error('Le titre est obligatoire'); setEtape(0); return; }
    if (nbSelection === 0) { toast.error('Cochez au moins un PDV ou une personne'); setEtape(1); return; }
    if (attribuerMaintenant && !tcs.length) { toast.error('Sélectionnez au moins une téléconseillère'); return; }

    const cibles = [
      ...tousPdv.filter(p => selPdv.includes(p.pdv_numero)).map(p => ({
        type_cible: 'PDV', pdv_id: p.pdv_id, pdv_numero: p.pdv_numero,
        motif: p.motif, situation: p.situation,
      })),
      ...personnes.filter(u => selPers.includes(u.user_id)).map(u => ({
        type_cible: 'PERSONNE', target_user_id: u.user_id,
        motif: `Appel direct — ${roleLabel(u.role)}`,
      })),
    ];

    setEnvoi(true);
    try {
      const { id } = await missionService.creer({
        titre, type_mission: typeMission, priorite,
        echeance: echeance || null, consigne, objectif_texte: objectifTexte,
        objectif_nb_appels: objAppels, objectif_nb_promesses: objPromesses,
        objectif_taux_joignabilite: objJoignabilite,
        commentaire_obligatoire: commentaireObligatoire,
        statuts_autorises: statutsAutorises.length ? statutsAutorises : null,
        annee, mois,
        filtres: { mode, superviseur: fSup || null, gestionnaire: fGest || null,
                   quartier: fQuartier || null, situation: fSituation || null,
                   recherche: q || null, role_personne: mode === 'PERSONNE' ? fRole : null },
        cibles,
      });
      if (attribuerMaintenant) {
        await missionService.attribuer(id, { user_ids: tcs, strategy });
      }
      toast.success('✅ Mission créée' + (attribuerMaintenant ? ' et attribuée' : ''));
      onCree();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally { setEnvoi(false); }
  };

  const inp = {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0', fontSize: 13, outline: 'none',
  };
  const sel = { ...inp, cursor: 'pointer' };
  const lab = { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, display: 'block' };

  // Valeurs distinctes pour les listes déroulantes
  const listeSup = useMemo(() => [...new Set(tousPdv.map(p => p.superviseur).filter(Boolean))].sort(), [tousPdv]);
  const listeGest = useMemo(() => [...new Set(tousPdv.map(p => p.gestionnaire).filter(Boolean))].sort(), [tousPdv]);
  const listeQuartiers = useMemo(() => [...new Set(tousPdv.map(p => p.quartier).filter(Boolean))].sort(), [tousPdv]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 980, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>📣 Nouvelle mission d'appels</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {/* Fil des étapes */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {ETAPES.map((t, i) => (
            <button key={t} onClick={() => setEtape(i)} type="button"
              style={{
                flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: i === etape ? ORANGE : 'rgba(255,255,255,0.04)',
                color: i === etape ? '#fff' : '#94a3b8',
                border: `1px solid ${i === etape ? ORANGE : 'rgba(255,255,255,0.1)'}`,
              }}>
              {i + 1}. {t}
            </button>
          ))}
        </div>

        {/* ── Étape 1 : l'appel ── */}
        {etape === 0 && (
          <div className="modal-section">
            <div className="form-grid">
              <label className="full"><span style={lab}>Titre de la mission *</span>
                <input style={inp} value={titre} onChange={e => setTitre(e.target.value)}
                  placeholder="Ex : Relance des PDV OMY inactifs — Août 2026" />
              </label>
              <label><span style={lab}>Type d'appel</span>
                <select style={sel} value={typeMission} onChange={e => setTypeMission(e.target.value)}>
                  {refs.type_missions.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </label>
              <label><span style={lab}>Priorité</span>
                <select style={sel} value={priorite} onChange={e => setPriorite(e.target.value)}>
                  {refs.priorites.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                </select>
              </label>
              <label><span style={lab}>Échéance</span>
                <input type="date" style={inp} value={echeance} onChange={e => setEcheance(e.target.value)} />
              </label>
              <label className="full"><span style={lab}>Consigne à lire à la téléconseillère</span>
                <textarea style={{ ...inp, minHeight: 70 }} value={consigne} onChange={e => setConsigne(e.target.value)}
                  placeholder="Ex : Se présenter, demander pourquoi le PDV n'a pas transacté, proposer un accompagnement…" />
              </label>
              <label className="full"><span style={lab}>Objectif de l'appel (en clair)</span>
                <input style={inp} value={objectifTexte} onChange={e => setObjectifTexte(e.target.value)}
                  placeholder="Ex : Obtenir une promesse de reprise d'activité" />
              </label>
            </div>
          </div>
        )}

        {/* ── Étape 2 : qui appeler (SIMPLE) ── */}
        {etape === 1 && (
          <div className="modal-section">
            {/* Choix : PDV ou personnes */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['PDV', '🏪 Appeler des PDV'], ['PERSONNE', '👤 Appeler des personnes']].map(([code, lbl]) => (
                <button key={code} type="button" onClick={() => setMode(code)}
                  style={{
                    flex: 1, padding: '11px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800,
                    background: mode === code ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${mode === code ? ORANGE : 'rgba(255,255,255,0.1)'}`,
                    color: mode === code ? ORANGE : '#94a3b8',
                  }}>{lbl}</button>
              ))}
            </div>

            {mode === 'PDV' ? (
              <>
                {/* Recherche + listes déroulantes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                  <label style={{ gridColumn: '1 / -1' }}>
                    <span style={lab}>Rechercher un PDV (numéro ou nom)</span>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                      <input style={{ ...inp, paddingLeft: 32 }} value={q} onChange={e => setQ(e.target.value)}
                        placeholder="Tapez un numéro de PDV, ex : 9450…" autoFocus />
                    </div>
                  </label>
                  <label><span style={lab}>Superviseur</span>
                    <select style={sel} value={fSup} onChange={e => setFSup(e.target.value)}>
                      <option value="">Tous les superviseurs</option>
                      {listeSup.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label><span style={lab}>Gestionnaire</span>
                    <select style={sel} value={fGest} onChange={e => setFGest(e.target.value)}>
                      <option value="">Tous les gestionnaires</option>
                      {listeGest.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label><span style={lab}>Quartier</span>
                    <select style={sel} value={fQuartier} onChange={e => setFQuartier(e.target.value)}>
                      <option value="">Tous les quartiers</option>
                      {listeQuartiers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label><span style={lab}>Situation</span>
                    <select style={sel} value={fSituation} onChange={e => setFSituation(e.target.value)}>
                      <option value="">Toutes les situations</option>
                      {refs.situations.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </select>
                  </label>
                  <label><span style={lab}>Mois de référence</span>
                    <select style={sel} value={`${annee}-${mois}`}
                      onChange={e => { const [a, m] = e.target.value.split('-'); setAnnee(parseInt(a)); setMois(parseInt(m)); }}>
                      {Array.from({ length: 12 }, (_, i) => {
                        const d = new Date(refs.annee_defaut, refs.mois_defaut - 1 - i, 1);
                        const a = d.getFullYear(), m = d.getMonth() + 1;
                        return <option key={`${a}-${m}`} value={`${a}-${m}`}>
                          {d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                        </option>;
                      })}
                    </select>
                  </label>
                </div>

                {/* Barre de sélection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13 }}>
                    <b style={{ color: ORANGE }}>{nbSelection}</b> PDV/personne(s) sélectionné(s)
                    <span style={{ color: '#64748b' }}> · {pdvFiltres.length} affiché(s) sur {tousPdv.length}</span>
                  </span>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={toutCocherPdv} disabled={!pdvFiltres.length}>
                    ✅ Tout sélectionner ({pdvFiltres.length})
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={toutDecocherPdv} disabled={!nbSelection}>
                    ✕ Tout décocher
                  </button>
                </div>

                {/* Liste complète des PDV */}
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#1a1a28', zIndex: 2 }}>
                      <tr>
                        <th style={{ padding: 8, width: 34 }}></th>
                        <th style={{ padding: 8, textAlign: 'left' }}>N° PDV</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Nom du PDV</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Quartier</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Superviseur</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Situation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chargementPdv && (
                        <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>⏳ Chargement des PDV…</td></tr>
                      )}
                      {!chargementPdv && pdvFiltres.map(p => {
                        const coche = selPdv.includes(p.pdv_numero);
                        return (
                          <tr key={p.pdv_numero} onClick={() => basculerPdv(p.pdv_numero)}
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
                                     background: coche ? 'rgba(255,105,0,0.10)' : 'transparent' }}>
                            <td style={{ padding: 8, textAlign: 'center' }}>
                              <input type="checkbox" checked={coche} onChange={() => basculerPdv(p.pdv_numero)} onClick={e => e.stopPropagation()} />
                            </td>
                            <td style={{ padding: 8, fontWeight: 700, color: ORANGE }}>{p.pdv_numero}</td>
                            <td style={{ padding: 8, fontWeight: 600 }}>{p.nom}</td>
                            <td style={{ padding: 8, color: '#94a3b8' }}>{p.quartier || '—'}</td>
                            <td style={{ padding: 8, color: '#94a3b8' }}>{p.superviseur || '—'}</td>
                            <td style={{ padding: 8, color: '#ff8a94', fontSize: 11.5 }}>{p.motif}</td>
                          </tr>
                        );
                      })}
                      {!chargementPdv && pdvFiltres.length === 0 && (
                        <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                          Aucun PDV ne correspond à votre recherche.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                {/* Cible PERSONNE : recherche + rôle */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                  <label><span style={lab}>Rechercher une personne</span>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                      <input style={{ ...inp, paddingLeft: 32 }} value={qPers} onChange={e => setQPers(e.target.value)}
                        placeholder="Nom de la personne…" autoFocus />
                    </div>
                  </label>
                  <label><span style={lab}>Rôle</span>
                    <select style={sel} value={fRole} onChange={e => setFRole(e.target.value)}>
                      {refs.roles_personnes.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13 }}>
                    <b style={{ color: ORANGE }}>{selPers.length}</b> personne(s) sélectionnée(s)
                    <span style={{ color: '#64748b' }}> · {persFiltrees.length} affichée(s)</span>
                  </span>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={toutCocherPers} disabled={!persFiltrees.length}>
                    ✅ Tout sélectionner ({persFiltrees.length})
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setSelPers([])} disabled={!selPers.length}>✕ Tout décocher</button>
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#1a1a28' }}>
                      <tr>
                        <th style={{ padding: 8, width: 34 }}></th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Nom</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Rôle</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Téléphone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chargementPers && (
                        <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>⏳ Chargement…</td></tr>
                      )}
                      {!chargementPers && persFiltrees.map(u => {
                        const coche = selPers.includes(u.user_id);
                        return (
                          <tr key={u.user_id} onClick={() => basculerPers(u.user_id)}
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
                                     background: coche ? 'rgba(255,105,0,0.10)' : 'transparent' }}>
                            <td style={{ padding: 8, textAlign: 'center' }}>
                              <input type="checkbox" checked={coche} onChange={() => basculerPers(u.user_id)} onClick={e => e.stopPropagation()} />
                            </td>
                            <td style={{ padding: 8, fontWeight: 600 }}>{u.nom}</td>
                            <td style={{ padding: 8, color: '#94a3b8' }}>{roleLabel(u.role)}</td>
                            <td style={{ padding: 8, color: u.telephone ? '#e2e8f0' : '#f59e0b' }}>
                              {u.telephone || 'aucun — à renseigner sur la fiche'}
                            </td>
                          </tr>
                        );
                      })}
                      {!chargementPers && persFiltrees.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                          Aucune personne pour ce rôle.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 8 }}>
                  ⚠️ Le numéro doit être renseigné sur la fiche de la personne pour pouvoir l'appeler.
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Étape 3 : objectifs ── */}
        {etape === 2 && (
          <div className="modal-section">
            <div className="form-grid">
              <label><span style={lab}>Nombre d'appels à passer</span>
                <input type="number" style={inp} value={objAppels} onChange={e => setObjAppels(e.target.value)} placeholder="Ex : 40" />
              </label>
              <label><span style={lab}>Nombre de promesses visées</span>
                <input type="number" style={inp} value={objPromesses} onChange={e => setObjPromesses(e.target.value)} placeholder="Ex : 10" />
              </label>
              <label><span style={lab}>Taux de joignabilité visé (%)</span>
                <input type="number" style={inp} value={objJoignabilite} onChange={e => setObjJoignabilite(e.target.value)} placeholder="Ex : 60" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
                <input type="checkbox" checked={commentaireObligatoire}
                  onChange={e => setCommentaireObligatoire(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Commentaire obligatoire sur chaque appel</span>
              </label>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                Statuts d'appel autorisés {statutsAutorises.length === 0 && <span style={{ color: '#64748b' }}>(aucun = tous autorisés)</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {refs.statuts_appel.map(s => {
                  const on = statutsAutorises.includes(s.code);
                  return (
                    <button key={s.code} type="button"
                      onClick={() => setStatutsAutorises(on ? statutsAutorises.filter(x => x !== s.code) : [...statutsAutorises, s.code])}
                      style={{
                        padding: '6px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                        background: on ? 'rgba(0,214,143,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${on ? '#00d68f' : 'rgba(255,255,255,0.1)'}`,
                        color: on ? '#00d68f' : '#94a3b8',
                      }}>{s.label}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Étape 4 : attribution ── */}
        {etape === 3 && (
          <div className="modal-section">
            <div style={{ fontSize: 13, marginBottom: 12, color: '#94a3b8' }}>
              <b style={{ color: ORANGE }}>{nbSelection}</b> cible(s) · répartition entre les téléconseillères.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" checked={attribuerMaintenant}
                onChange={e => setAttribuerMaintenant(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Attribuer la mission maintenant aux téléconseillères</span>
            </label>

            {attribuerMaintenant && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                  Téléconseillères * ({tcs.length} sélectionnée(s))
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {refs.teleconseilleres.map(t => {
                    const on = tcs.includes(t.id);
                    return (
                      <button key={t.id} type="button"
                        onClick={() => setTcs(on ? tcs.filter(x => x !== t.id) : [...tcs, t.id])}
                        style={{
                          padding: '8px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: on ? 700 : 400,
                          background: on ? 'rgba(255,105,0,0.18)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${on ? ORANGE : 'rgba(255,255,255,0.1)'}`,
                          color: on ? ORANGE : '#94a3b8',
                        }}>{on ? '✓ ' : ''}{t.nom}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>Répartition</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['balanced', '⚖️ Équilibrée'], ['by_zone', '🌍 Par quartier']].map(([code, lbl]) => (
                    <button key={code} type="button" onClick={() => setStrategy(code)}
                      style={{
                        padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        background: strategy === code ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${strategy === code ? ORANGE : 'rgba(255,255,255,0.1)'}`,
                        color: strategy === code ? ORANGE : '#94a3b8',
                      }}>{lbl}</button>
                  ))}
                </div>
                {tcs.length > 1 && (
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>
                    ≈ {Math.floor(nbSelection / tcs.length)} à {Math.ceil(nbSelection / tcs.length)} cible(s) par téléconseillère.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={() => etape === 0 ? onClose() : setEtape(etape - 1)}>
            {etape === 0 ? 'Annuler' : '← Retour'}
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {etape === 1 && <span style={{ fontSize: 12, color: nbSelection ? '#00d68f' : '#f59e0b' }}>
              {nbSelection ? `${nbSelection} cible(s) cochée(s)` : 'Cochez au moins une cible'}
            </span>}
            {etape < 3 && (
              <button type="button" className="btn btn-primary" onClick={() => setEtape(etape + 1)}>Suivant →</button>
            )}
            {etape === 3 && (
              <button type="button" className="btn btn-primary" onClick={creer} disabled={envoi}>
                {envoi ? '⏳ Création…' : '🚀 Créer la mission'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Détail / pilotage d'une mission ──────────────────────────────────────────

function DetailMission({ missionId, onClose, onMaj }) {
  const qc = useQueryClient();
  const [filtreCt, setFiltreCt] = useState('');
  const [filtreSt, setFiltreSt] = useState('');
  const { data, refetch } = useQuery(['mission-detail', missionId],
    () => missionService.detail(missionId), { staleTime: 10000 });

  const cibles = (data?.cibles || []).filter(c =>
    (!filtreCt || (c.assigned_to_nom || '') === filtreCt) &&
    (!filtreSt || c.statut === filtreSt));

  const cloturer = async (statut) => {
    if (!window.confirm(statut === 'ANNULEE' ? 'Annuler cette mission ?' : 'Clôturer cette mission ?')) return;
    try { await missionService.cloturer(missionId, statut); toast.success('Mission mise à jour'); refetch(); onMaj(); }
    catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  const m = data?.mission;
  const av = data?.avancement;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1000, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>{m?.titre || 'Chargement…'}</h2>
            {m && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Badge color={ORANGE}>{m.type_mission_label}</Badge>
                <Badge color={PRIO_COUL[m.priorite]}>{m.priorite_label}</Badge>
                <Badge color={STATUT_COUL[m.statut]}>{m.statut_label}</Badge>
                <Badge color="#64748b">📅 Échéance : {fmtDate(m.echeance)}</Badge>
                <Badge color="#64748b">👤 {m.created_by_nom || '—'}</Badge>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {m?.consigne && (
          <div className="modal-section" style={{ background: 'rgba(255,105,0,0.06)', borderLeft: `3px solid ${ORANGE}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, marginBottom: 4 }}>CONSIGNE</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.consigne}</div>
          </div>
        )}

        {m?.objectif_texte && (
          <div style={{ fontSize: 13, marginBottom: 14 }}>
            🎯 <b>Objectif :</b> {m.objectif_texte}
          </div>
        )}

        {av && (
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="card"><div style={{ fontSize: 11, color: '#8a8a9a' }}>Avancement</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: ORANGE }}>{av.taux_avancement}%</div>
              <div style={{ fontSize: 11, color: '#8a8a9a' }}>{av.termines} / {av.total} traités</div>
              <Barre pct={av.taux_avancement} /></div>
            <div className="card"><div style={{ fontSize: 11, color: '#8a8a9a' }}>Promesses</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#00d68f' }}>{av.promesses}</div>
              <div style={{ fontSize: 11, color: '#8a8a9a' }}>objectif : {m?.objectif_nb_promesses ?? '—'}</div></div>
            <div className="card"><div style={{ fontSize: 11, color: '#8a8a9a' }}>Joignabilité</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{av.taux_joignabilite}%</div>
              <div style={{ fontSize: 11, color: '#8a8a9a' }}>objectif : {m?.objectif_taux_joignabilite ?? '—'}%</div></div>
            <div className="card"><div style={{ fontSize: 11, color: '#8a8a9a' }}>Restants</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: av.restants ? '#f59e0b' : '#00d68f' }}>{av.restants}</div>
              <div style={{ fontSize: 11, color: '#8a8a9a' }}>{av.injoignables} injoignable(s) · {av.abandonnes} abandon(s)</div></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <select value={filtreCt} onChange={e => setFiltreCt(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: 12.5 }}>
            <option value="">Toutes les téléconseillères</option>
            {[...new Set((data?.cibles || []).map(c => c.assigned_to_nom).filter(Boolean))].map(t =>
              <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filtreSt} onChange={e => setFiltreSt(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: 12.5 }}>
            <option value="">Tous les statuts</option>
            <option value="A_APPELER">À appeler</option>
            <option value="APPELE">Appelé</option>
            <option value="INJOIGNABLE">Injoignable</option>
            <option value="ABANDONNE">Abandonné</option>
          </select>
          <span style={{ fontSize: 12, color: '#64748b' }}>{cibles.length} cible(s) affichée(s)</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => missionService.exportExcel(missionId)}>
              <Download size={14} /> Excel
            </button>
            {m?.statut === 'ACTIVE' && (
              <>
                <button className="btn btn-ghost" onClick={() => cloturer('TERMINEE')}>
                  <CheckCircle2 size={14} /> Clôturer
                </button>
                <button className="btn btn-ghost" style={{ color: '#ef4444' }} onClick={() => cloturer('ANNULEE')}>
                  <Trash2 size={14} /> Annuler
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1a1a28' }}>
              <tr>
                <th style={{ padding: 8, textAlign: 'left' }}>Cible</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Téléphone</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Motif</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Téléconseillère</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Statut</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Dernier appel</th>
              </tr>
            </thead>
            <tbody>
              {cibles.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>
                    {c.type_cible === 'PERSONNE' ? '👤 ' : ''}{c.nom}
                    {c.pdv_numero && <span style={{ color: '#64748b', fontWeight: 400 }}> · {c.pdv_numero}</span>}
                  </td>
                  <td style={{ padding: 8, color: c.telephone ? '#e2e8f0' : '#f59e0b' }}>{c.telephone || '—'}</td>
                  <td style={{ padding: 8, color: '#94a3b8', fontSize: 11.5 }}>{c.motif || '—'}</td>
                  <td style={{ padding: 8, color: '#94a3b8' }}>{c.assigned_to_nom || '—'}</td>
                  <td style={{ padding: 8 }}>
                    {c.statut === 'APPELE' ? <Badge color="#00d68f">Appelé</Badge>
                      : c.statut === 'INJOIGNABLE' ? <Badge color="#f59e0b">Injoignable</Badge>
                        : c.statut === 'ABANDONNE' ? <Badge color="#ef4444">Abandonné</Badge>
                          : <Badge color="#64748b">À appeler</Badge>}
                  </td>
                  <td style={{ padding: 8, color: '#94a3b8', fontSize: 11.5 }}>
                    {c.dernier_appel_at ? `${new Date(c.dernier_appel_at).toLocaleDateString('fr-FR')} — ${c.dernier_statut_label || ''}` : '—'}
                  </td>
                </tr>
              ))}
              {cibles.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Aucune cible</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function MissionsAppelsPage() {
  const qc = useQueryClient();
  const [showAssistant, setShowAssistant] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [statut, setStatut] = useState('ACTIVE');
  const [seulementMiennes, setSeulementMiennes] = useState(false);

  const { data: refs, isLoading: refsLoading } = useQuery('missions-refs',
    () => missionService.filtres(), { staleTime: 300000 });

  const { data: missions = [], isLoading, refetch } = useQuery(
    ['missions', statut, seulementMiennes],
    () => missionService.lister({ statut: statut || undefined, mes_missions: seulementMiennes || undefined }),
    { staleTime: 15000 });

  useEffect(() => { qc.invalidateQueries('missions'); }, [statut, seulementMiennes, qc]);

  const rafraichir = () => { refetch(); qc.invalidateQueries('missions'); };

  if (refsLoading || !refs) return <div className="loading-state">Chargement…</div>;

  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>📣 Missions d'appels</h1>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Composez un lot d'appels, attribuez-le aux téléconseillères et suivez l'avancement.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAssistant(true)}>
          <Plus size={16} /> Nouvelle mission
        </button>
      </div>

      <div className="filters" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Statut :</span>
        {[['ACTIVE', 'Actives'], ['TERMINEE', 'Terminées'], ['', 'Toutes']].map(([code, lbl]) => (
          <button key={lbl} onClick={() => setStatut(code)}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer', fontWeight: statut === code ? 700 : 400,
              background: statut === code ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${statut === code ? ORANGE : 'rgba(255,255,255,0.1)'}`,
              color: statut === code ? ORANGE : '#94a3b8',
            }}>{lbl}</button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12.5 }}>
          <input type="checkbox" checked={seulementMiennes} onChange={e => setSeulementMiennes(e.target.checked)} />
          Créées par moi
        </label>
      </div>

      {isLoading && <div className="loading-state">Chargement des missions…</div>}

      {!isLoading && missions.length === 0 && (
        <div className="empty-state">
          Aucune mission pour le moment.<br />
          <small>Cliquez sur « Nouvelle mission » pour composer votre premier lot d'appels.</small>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {missions.map(m => {
          const av = m.avancement || {};
          const enRetard = av.en_retard || (m.echeance && m.echeance < aujourdhui && m.statut === 'ACTIVE' && av.restants > 0);
          return (
            <div key={m.id} className="card" style={{ borderLeft: `3px solid ${PRIO_COUL[m.priorite] || '#64748b'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.3 }}>{m.titre}</div>
                <Badge color={STATUT_COUL[m.statut]}>{m.statut_label}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 5, margin: '8px 0', flexWrap: 'wrap' }}>
                <Badge color={ORANGE}>{m.type_mission_label}</Badge>
                <Badge color={PRIO_COUL[m.priorite]}>{m.priorite_label}</Badge>
                {m.echeance && <Badge color={enRetard ? '#ef4444' : '#64748b'}>
                  {enRetard ? '⚠️ ' : '📅 '}{fmtDate(m.echeance)}
                </Badge>}
              </div>
              <div style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 10 }}>
                👤 {m.created_by_nom || '—'} · {m.tcs?.length ? `${m.tcs.length} TC` : 'non attribuée'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Barre pct={av.taux_avancement} />
                <span style={{ fontSize: 12, fontWeight: 800, color: ORANGE }}>{av.taux_avancement || 0}%</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#8a8a9a', marginBottom: 12 }}>
                {av.termines || 0}/{av.total || 0} traités · {av.promesses || 0} promesse(s) · {av.restants || 0} restant(s)
                {m.objectif_nb_appels ? ` · objectif ${m.objectif_nb_appels} appels` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, fontSize: 12.5 }}
                  onClick={() => setDetailId(m.id)}>
                  <Send size={13} /> Piloter
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
                  onClick={() => missionService.exportExcel(m.id)}>
                  <Download size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showAssistant && (
        <AssistantMission refs={refs}
          onClose={() => setShowAssistant(false)}
          onCree={() => { setShowAssistant(false); rafraichir(); }} />
      )}
      {detailId && (
        <DetailMission missionId={detailId}
          onClose={() => setDetailId(null)}
          onMaj={rafraichir} />
      )}

      {refs.superviseurs?.length === 0 && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12.5, color: '#f59e0b' }}>
          <AlertTriangle size={13} /> Aucun superviseur trouvé dans les fiches PDV : le ciblage par superviseur sera vide.
        </div>
      )}
    </div>
  );
}
