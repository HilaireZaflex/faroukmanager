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

/** Liste déroulante à cases à cocher avec recherche (superviseurs, quartiers…) */
function MultiSelect({ label, options, value, onChange, placeholder = 'Rechercher…', height = 150 }) {
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const filtres = useMemo(
    () => (options || []).filter(o => !q || String(o).toLowerCase().includes(q.toLowerCase())),
    [options, q],
  );
  const toggle = (o) => onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o]);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
        {label}{value.length > 0 && <span style={{ color: ORANGE }}> · {value.length} sélectionné(s)</span>}
      </div>
      <button type="button" onClick={() => setOuvert(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
          background: value.length ? 'rgba(255,105,0,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${value.length ? 'rgba(255,105,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
          color: value.length ? ORANGE : '#94a3b8', fontSize: 13,
        }}>
        {value.length ? value.slice(0, 2).join(', ') + (value.length > 2 ? ` +${value.length - 2}` : '') : 'Tous'}
        <span style={{ float: 'right', opacity: 0.6 }}>▾</span>
      </button>
      {ouvert && (
        <div style={{
          position: 'absolute', zIndex: 60, marginTop: 4, width: '100%', background: '#161622',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 8,
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        }}>
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
              style={{ width: '100%', padding: '7px 8px 7px 28px', fontSize: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
          </div>
          <div style={{ maxHeight: height, overflowY: 'auto' }}>
            {filtres.length === 0 && <div style={{ fontSize: 12, color: '#64748b', padding: 6 }}>Aucun résultat</div>}
            {filtres.map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6 }}>
                <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => onChange(filtres.slice())}>Tout cocher</button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => onChange([])}>Tout décocher</button>
            <button type="button" className="btn btn-primary" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setOuvert(false)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assistant de création (4 étapes) ─────────────────────────────────────────

const ETAPES = ['L\'appel', 'Qui appeler', 'Objectifs', 'Attribution'];

function AssistantMission({ refs, onClose, onCree }) {
  const [etape, setEtape] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [apercu, setApercu] = useState(null);
  const [chargementApercu, setChargementApercu] = useState(false);
  const [exclus, setExclus] = useState([]);   // clés des cibles décochées dans l'aperçu

  const [f, setF] = useState({
    titre: '',
    type_mission: 'RELANCE_ACTIVITE',
    priorite: 'NORMALE',
    echeance: '',
    consigne: '',
    objectif_texte: '',
    mode: 'PDV',
    superviseurs: [], gestionnaires: [], zones: [], quartiers: [],
    situations: [], jours_sans_appel: '',
    roles_personnes: ['superviseur', 'gestionnaire'],
    user_ids: [],
    annee: refs.annee_defaut, mois: refs.mois_defaut,
    objectif_nb_appels: '', objectif_nb_promesses: '', objectif_taux_joignabilite: '',
    commentaire_obligatoire: true, statuts_autorises: [],
    tcs: [], strategy: 'balanced', attribuer_maintenant: true,
  });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const filtresPayload = () => ({
    mode: f.mode,
    superviseurs: f.superviseurs, gestionnaires: f.gestionnaires,
    zones: f.zones, quartiers: f.quartiers,
    situations: f.situations,
    jours_sans_appel: f.jours_sans_appel ? parseInt(f.jours_sans_appel) : null,
    roles_personnes: f.roles_personnes,
    user_ids: f.user_ids,
  });

  const lancerApercu = async () => {
    setChargementApercu(true);
    try {
      const r = await missionService.apercu({ filtres: filtresPayload(), annee: f.annee, mois: f.mois });
      setApercu(r);
      setExclus([]);
      toast.success(`${r.total} cible(s) trouvée(s)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally { setChargementApercu(false); }
  };

  const cleCible = (c) => c.type_cible === 'PDV' ? `P${c.pdv_numero}` : `U${c.target_user_id}`;
  const ciblesGardees = (apercu?.cibles || []).filter(c => !exclus.includes(cleCible(c)));

  const creer = async () => {
    if (!f.titre.trim()) { toast.error('Le titre est obligatoire'); setEtape(0); return; }
    if (!ciblesGardees.length) { toast.error('Aucune cible sélectionnée'); setEtape(1); return; }
    if (f.attribuer_maintenant && !f.tcs.length) { toast.error('Sélectionnez au moins une téléconseillère'); return; }
    setEnvoi(true);
    try {
      const { id } = await missionService.creer({
        titre: f.titre, type_mission: f.type_mission, priorite: f.priorite,
        echeance: f.echeance || null, consigne: f.consigne, objectif_texte: f.objectif_texte,
        objectif_nb_appels: f.objectif_nb_appels, objectif_nb_promesses: f.objectif_nb_promesses,
        objectif_taux_joignabilite: f.objectif_taux_joignabilite,
        commentaire_obligatoire: f.commentaire_obligatoire,
        statuts_autorises: f.statuts_autorises.length ? f.statuts_autorises : null,
        annee: f.annee, mois: f.mois,
        filtres: filtresPayload(),
        cibles: ciblesGardees.map(c => ({
          type_cible: c.type_cible, pdv_id: c.pdv_id, pdv_numero: c.pdv_numero,
          target_user_id: c.target_user_id, motif: c.motif, situation: c.situation,
        })),
      });
      if (f.attribuer_maintenant) {
        await missionService.attribuer(id, { user_ids: f.tcs, strategy: f.strategy });
      }
      toast.success('✅ Mission créée' + (f.attribuer_maintenant ? ' et attribuée' : ''));
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
  const lab = { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, display: 'block' };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '92vh', overflowY: 'auto' }}>
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

        {/* ── Étape 1 ── */}
        {etape === 0 && (
          <div className="modal-section">
            <div className="form-grid">
              <label className="full"><span style={lab}>Titre de la mission *</span>
                <input style={inp} value={f.titre} onChange={e => set('titre', e.target.value)}
                  placeholder="Ex : Relance des PDV OMY inactifs — Août 2026" />
              </label>
              <label><span style={lab}>Type d'appel</span>
                <select style={inp} value={f.type_mission} onChange={e => set('type_mission', e.target.value)}>
                  {refs.type_missions.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </label>
              <label><span style={lab}>Priorité</span>
                <select style={inp} value={f.priorite} onChange={e => set('priorite', e.target.value)}>
                  {refs.priorites.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                </select>
              </label>
              <label><span style={lab}>Échéance</span>
                <input type="date" style={inp} value={f.echeance} onChange={e => set('echeance', e.target.value)} />
              </label>
              <label className="full"><span style={lab}>Consigne à lire à la téléconseillère</span>
                <textarea style={{ ...inp, minHeight: 70 }} value={f.consigne}
                  onChange={e => set('consigne', e.target.value)}
                  placeholder="Ex : Se présenter, demander pourquoi le PDV n'a pas transacté, proposer un accompagnement…" />
              </label>
              <label className="full"><span style={lab}>Objectif de l'appel (en clair)</span>
                <input style={inp} value={f.objectif_texte} onChange={e => set('objectif_texte', e.target.value)}
                  placeholder="Ex : Obtenir une promesse de reprise d'activité" />
              </label>
            </div>
          </div>
        )}

        {/* ── Étape 2 ── */}
        {etape === 1 && (
          <div className="modal-section">
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['PDV', '🏪 Appeler des PDV'], ['PERSONNE', '👤 Appeler des personnes'], ['MIXTE', '🔀 Les deux']].map(([code, lbl]) => (
                <button key={code} type="button" onClick={() => set('mode', code)}
                  style={{
                    padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    background: f.mode === code ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${f.mode === code ? ORANGE : 'rgba(255,255,255,0.1)'}`,
                    color: f.mode === code ? ORANGE : '#94a3b8',
                  }}>{lbl}</button>
              ))}
            </div>

            {f.mode !== 'PERSONNE' && (
              <>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                  Période de référence pour détecter les alertes :
                  <select value={f.mois} onChange={e => set('mois', parseInt(e.target.value))}
                    style={{ ...inp, width: 'auto', display: 'inline-block', marginLeft: 8, padding: '4px 8px' }}>
                    {['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
                      .map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={f.annee} onChange={e => set('annee', parseInt(e.target.value))}
                    style={{ ...inp, width: 'auto', display: 'inline-block', marginLeft: 6, padding: '4px 8px' }}>
                    {[refs.annee_defaut - 1, refs.annee_defaut, refs.annee_defaut + 1].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <MultiSelect label="Superviseurs" options={refs.superviseurs} value={f.superviseurs} onChange={v => set('superviseurs', v)} />
                  <MultiSelect label="Gestionnaires" options={refs.gestionnaires} value={f.gestionnaires} onChange={v => set('gestionnaires', v)} />
                  <MultiSelect label="Zones" options={refs.zones} value={f.zones} onChange={v => set('zones', v)} height={120} />
                  <MultiSelect label="Quartiers" options={refs.quartiers} value={f.quartiers} onChange={v => set('quartiers', v)} />
                  <label><span style={lab}>Pas appelé depuis (jours)</span>
                    <input type="number" style={inp} value={f.jours_sans_appel}
                      onChange={e => set('jours_sans_appel', e.target.value)} placeholder="Ex : 30" />
                  </label>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                    Situations détectées {f.situations.length === 0 && <span style={{ color: '#64748b' }}>(aucune = tous les PDV des filtres ci-dessus)</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {refs.situations.map(s => {
                      const on = f.situations.includes(s.code);
                      return (
                        <button key={s.code} type="button"
                          onClick={() => set('situations', on ? f.situations.filter(x => x !== s.code) : [...f.situations, s.code])}
                          style={{
                            padding: '6px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                            background: on ? 'rgba(255,71,87,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${on ? '#ff4757' : 'rgba(255,255,255,0.1)'}`,
                            color: on ? '#ff4757' : '#94a3b8',
                          }}>{s.label}</button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {f.mode !== 'PDV' && (
              <div style={{ marginTop: 14 }}>
                <MultiSelect label="Rôles à appeler" options={refs.roles_personnes.map(roleLabel)} value={f.roles_personnes.map(roleLabel)}
                  onChange={v => set('roles_personnes', v.map(x => (refs.roles_personnes.find(r => roleLabel(r) === x) || x)))} height={130} />
                {f.mode === 'PERSONNE' && (
                  <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6 }}>
                    ⚠️ Le numéro doit être renseigné sur la fiche de la personne (champ « Téléphone »).
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={lancerApercu} disabled={chargementApercu}>
                {chargementApercu ? '⏳ Calcul…' : '🔍 Aperçu des cibles'}
              </button>
              {apercu && (
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  <b style={{ color: ORANGE }}>{apercu.total}</b> cible(s) ·
                  {' '}{apercu.total_pdv} PDV · {apercu.total_personnes} personne(s)
                  {apercu.sans_telephone > 0 && <span style={{ color: '#f59e0b' }}> · {apercu.sans_telephone} sans téléphone</span>}
                </span>
              )}
            </div>

            {apercu && (
              <div style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#1a1a28' }}>
                    <tr>
                      <th style={{ padding: 8 }}></th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Cible</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Quartier / Rôle</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Téléphone</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apercu.cibles.map(c => {
                      const k = cleCible(c);
                      return (
                        <tr key={k} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', opacity: exclus.includes(k) ? 0.35 : 1 }}>
                          <td style={{ padding: 8, textAlign: 'center' }}>
                            <input type="checkbox" checked={!exclus.includes(k)}
                              onChange={() => setExclus(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])} />
                          </td>
                          <td style={{ padding: 8, fontWeight: 600 }}>{c.nom}</td>
                          <td style={{ padding: 8, color: '#94a3b8' }}>{c.quartier || roleLabel(c.role) || '—'}</td>
                          <td style={{ padding: 8, color: c.telephone ? '#e2e8f0' : '#f59e0b' }}>{c.telephone || '—'}</td>
                          <td style={{ padding: 8, color: '#94a3b8', fontSize: 11.5 }}>{c.motif}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Étape 3 ── */}
        {etape === 2 && (
          <div className="modal-section">
            <div className="form-grid">
              <label><span style={lab}>Nombre d'appels à passer</span>
                <input type="number" style={inp} value={f.objectif_nb_appels}
                  onChange={e => set('objectif_nb_appels', e.target.value)} placeholder="Ex : 40" />
              </label>
              <label><span style={lab}>Nombre de promesses visées</span>
                <input type="number" style={inp} value={f.objectif_nb_promesses}
                  onChange={e => set('objectif_nb_promesses', e.target.value)} placeholder="Ex : 10" />
              </label>
              <label><span style={lab}>Taux de joignabilité visé (%)</span>
                <input type="number" style={inp} value={f.objectif_taux_joignabilite}
                  onChange={e => set('objectif_taux_joignabilite', e.target.value)} placeholder="Ex : 60" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
                <input type="checkbox" checked={f.commentaire_obligatoire}
                  onChange={e => set('commentaire_obligatoire', e.target.checked)} />
                <span style={{ fontSize: 13 }}>Commentaire obligatoire sur chaque appel</span>
              </label>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                Statuts d'appel autorisés {f.statuts_autorises.length === 0 && <span style={{ color: '#64748b' }}>(aucun = tous autorisés)</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {refs.statuts_appel.map(s => {
                  const on = f.statuts_autorises.includes(s.code);
                  return (
                    <button key={s.code} type="button"
                      onClick={() => set('statuts_autorises', on ? f.statuts_autorises.filter(x => x !== s.code) : [...f.statuts_autorises, s.code])}
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

        {/* ── Étape 4 ── */}
        {etape === 3 && (
          <div className="modal-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" checked={f.attribuer_maintenant}
                onChange={e => set('attribuer_maintenant', e.target.checked)} />
              <span style={{ fontSize: 13 }}>Attribuer la mission maintenant aux téléconseillères</span>
            </label>

            {f.attribuer_maintenant && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                  Téléconseillères * ({f.tcs.length} sélectionnée(s))
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {refs.teleconseilleres.map(t => {
                    const on = f.tcs.includes(t.id);
                    return (
                      <button key={t.id} type="button"
                        onClick={() => set('tcs', on ? f.tcs.filter(x => x !== t.id) : [...f.tcs, t.id])}
                        style={{
                          padding: '8px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: on ? 700 : 400,
                          background: on ? 'rgba(255,105,0,0.18)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${on ? ORANGE : 'rgba(255,255,255,0.1)'}`,
                          color: on ? ORANGE : '#94a3b8',
                        }}>{on ? '✓ ' : ''}{t.nom}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                  Répartition
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['balanced', '⚖️ Équilibrée'], ['by_zone', '🌍 Par quartier']].map(([code, lbl]) => (
                    <button key={code} type="button" onClick={() => set('strategy', code)}
                      style={{
                        padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        background: f.strategy === code ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${f.strategy === code ? ORANGE : 'rgba(255,255,255,0.1)'}`,
                        color: f.strategy === code ? ORANGE : '#94a3b8',
                      }}>{lbl}</button>
                  ))}
                </div>
                {f.tcs.length > 1 && apercu && (
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>
                    ≈ {Math.floor(ciblesGardees.length / f.tcs.length)} à {Math.ceil(ciblesGardees.length / f.tcs.length)} cible(s) par téléconseillère.
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
          <div style={{ display: 'flex', gap: 8 }}>
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
