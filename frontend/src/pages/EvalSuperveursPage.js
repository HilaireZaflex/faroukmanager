/**
 * EvalSuperveursPage — Module d'évaluation mensuelle des superviseurs
 * KPIs (70%) + Appel des Téléconseillères (20%) + Présentiel (10%)
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const MOIS_NOMS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function fmtN(v) { return v != null && v !== 0 ? new Intl.NumberFormat('fr-FR').format(Math.round(v)) : '—'; }
function fmtPct(v) { return v != null ? `${Math.round(v * 10) / 10}%` : '—'; }

const now = new Date();
// On évalue le mois précédent
const evalMois = now.getMonth() === 0 ? 12 : now.getMonth();
const evalAnnee = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

// ─── Score badge ──────────────────────────────────────────────────────────────
function ScoreBadge({ score, size = 'sm' }) {
  if (score == null) return <span style={{ color: '#64748b' }}>—</span>;
  const color = score >= 90 ? '#22c55e' : score >= 75 ? '#ffa502' : score >= 60 ? '#FF6900' : score >= 50 ? '#a29bfe' : '#ff4757';
  const fontSize = size === 'lg' ? 28 : size === 'md' ? 18 : 13;
  return (
    <span style={{ fontSize, fontWeight: 900, color, padding: size !== 'sm' ? '4px 12px' : '2px 6px',
      background: `${color}15`, borderRadius: 8, border: `1px solid ${color}30` }}>
      {Math.round(score)}
    </span>
  );
}

// ─── KPIs Display ─────────────────────────────────────────────────────────────
function KPIsSection({ kpis }) {
  if (!kpis) return <div style={{ color: '#8a8a9a', textAlign: 'center', padding: 40 }}>Aucune donnée KPI disponible</div>;
  const OBJECTIFS = kpis.objectifs || {};
  const SCORES = kpis.scores_kpi || {};

  const items = [
    { label: 'NB PDV', valeur: kpis.nb_pdv, objectif: OBJECTIFS.nb_pdv || 30, score: SCORES.nb_pdv, unite: 'PDVs', icon: '🏪' },
    { label: 'CA OMY', valeur: kpis.ca_omy, objectif: OBJECTIFS.ca_omy || 800_000_000, score: SCORES.ca_omy, unite: 'F', icon: '💰', big: true },
    { label: 'Moy. CA OMY', valeur: kpis.moy_ca_omy, objectif: null, score: null, unite: 'F/PDV', icon: '📊', big: true },
    { label: 'Commission OMY', valeur: kpis.commission_omy, objectif: OBJECTIFS.commission_omy || 800_000, score: SCORES.commission_omy, unite: 'F', icon: '💵', big: true },
    { label: 'Moy. Commission', valeur: kpis.moy_commission, objectif: null, score: null, unite: 'F/PDV', icon: '📈', big: true },
    { label: 'Actif OMY', valeur: kpis.taux_actif_omy, objectif: OBJECTIFS.taux_actif_omy || 100, score: SCORES.taux_actif_omy, unite: '%', icon: '✅', isPct: true },
    { label: 'Taux Actif KM', valeur: kpis.taux_actif_km, objectif: OBJECTIFS.taux_actif_km || 90, score: SCORES.taux_actif_km, unite: '%', icon: '🟠', isPct: true },
    { label: 'Nb Actif NAFAMA', valeur: kpis.nb_actif_nafama, objectif: null, score: null, unite: 'PDVs', icon: '🟢' },
    { label: 'Taux Actif NAFAMA', valeur: kpis.taux_actif_nafama, objectif: OBJECTIFS.taux_actif_nafama || 85, score: SCORES.taux_actif_nafama, unite: '%', icon: '📊', isPct: true },
    { label: 'CA NAFAMA', valeur: kpis.ca_nafama, objectif: OBJECTIFS.ca_nafama || 6_000_000, score: SCORES.ca_nafama, unite: 'F', icon: '💚', big: true },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>📊 KPIs — {MOIS_NOMS[kpis.mois]} {kpis.annee}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#8a8a9a' }}>Score global KPIs :</span>
          <ScoreBadge score={kpis.score_kpi_global} size="md" />
          <span style={{ fontSize: 11, color: '#64748b' }}>/100 · Poids 70%</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {items.map((item, i) => {
          const atteinte = item.score != null ? item.score : null;
          const color = atteinte == null ? '#8a8a9a' : atteinte >= 90 ? '#22c55e' : atteinte >= 70 ? '#ffa502' : '#ff4757';
          return (
            <div key={i} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}25`, borderTop: `3px solid ${color}`, borderRadius: 10 }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 4, fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color }}>
                {item.isPct ? fmtPct(item.valeur) : item.big ? fmtN(item.valeur) + ' F' : fmtN(item.valeur)}
              </div>
              {item.objectif && (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                  Obj: {item.isPct ? item.objectif + '%' : item.big ? fmtN(item.objectif) + ' F' : item.objectif}
                </div>
              )}
              {atteinte != null && (
                <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
                  <div style={{ height: '100%', width: `${Math.min(atteinte, 100)}%`, background: color, borderRadius: 4 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Appel TCs Section ────────────────────────────────────────────────────
function MysterySection({ evaluation, superviseur, annee, mois, onRefresh }) {
  const userAuth = useAuthStore(s => s.user);
  const roleUser = (userAuth?.role || '').toLowerCase().replace('userrole.', '');
  const isTelec = roleUser === 'teleconseillere';
  const qc = useQueryClient();
  const [appelEnCours, setAppelEnCours] = useState(null);
  const [notes, setNotes] = useState({ note_connaissance: '', note_visite: '', note_superviseur: '', commentaire: '' });

  const pdvsGeneres = evaluation?.pdvs_mystery_generes || [];
  const callsEffectues = evaluation?.mystery_calls || [];
  const joignables = callsEffectues.filter(c => c.statut === 'JOIGNABLE');
  const injoignables = callsEffectues.filter(c => c.statut === 'INJOIGNABLE');

  const mutation = useMutation(
    (data) => api.post(`/eval-superviseurs/${encodeURIComponent(superviseur)}/mystery-call?annee=${annee}&mois=${mois}`, data).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries(['eval-sup', superviseur, annee, mois]); setAppelEnCours(null); setNotes({ note_connaissance:'',note_visite:'',note_superviseur:'',commentaire:'' }); onRefresh(); } }
  );

  const isAppele = (pdv) => callsEffectues.some(c => c.numero_pdv === pdv.numero_pdv);
  const getCallStatus = (pdv) => callsEffectues.find(c => c.numero_pdv === pdv.numero_pdv);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>📞 Appels des Téléconseillères</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#22c55e' }}>✅ {joignables.length}/5 joignables</span>
          <span style={{ fontSize: 12, color: '#ff4757' }}>📵 {injoignables.length} injoignables</span>
          {evaluation?.score_mystery != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ScoreBadge score={evaluation.score_mystery} size="md" />
              <span style={{ fontSize: 11, color: '#64748b' }}>/100 · Poids 20%</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'rgba(55,66,250,0.06)', border: '1px solid rgba(55,66,250,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 12 }}>
        <div style={{ color: '#22c55e', fontWeight: 700, marginBottom: 6 }}>✅ Liste envoyée aux Téléconseillères</div>
        <div style={{ color: '#8a8a9a' }}>
          Les 5 PDVs à appeler ont été générés. Chaque TC a reçu la liste des PDVs de ses superviseurs à contacter.
          <br/>Règles : <strong style={{ color: '#fff' }}>5 PDVs joignables obligatoires</strong> · 3 questions /10 chacune · PDV de remplacement si injoignable.
        </div>
        {joignables.length > 0 && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: 8, color: '#22c55e', fontWeight: 600 }}>
            📞 Score actuel Appel des Téléconseillères : <strong>{evaluation?.score_mystery != null ? Math.round(evaluation.score_mystery) + '/100' : 'En attente'}</strong>
            {joignables.length > 0 && ` · ${joignables.length} appel(s) enregistré(s) sur 5`}
          </div>
        )}
      </div>

      {/* Tableau récapitulatif des notes (visible Admin/RC) */}
      {!isTelec && joignables.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, marginBottom: 14, overflowX: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>📊 Récapitulatif des notes — {joignables.length} appel{joignables.length > 1 ? 's' : ''} joignable{joignables.length > 1 ? 's' : ''}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 700 }}>PDV</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', color: '#3b82f6', fontWeight: 700 }}>📚 Connaissance</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', color: '#8b5cf6', fontWeight: 700 }}>🚶 Visite</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', color: '#FF6900', fontWeight: 700 }}>⭐ Note sup.</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', color: '#22c55e', fontWeight: 700 }}>Moy.</th>
              </tr>
            </thead>
            <tbody>
              {joignables.map((c, i) => {
                const moy = ((c.note_connaissance||0) + (c.note_visite||0) + (c.note_superviseur||0)) / 3;
                const col = moy >= 7 ? '#22c55e' : moy >= 5 ? '#ffa502' : '#ff4757';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 10px', color: '#e2e8f0', fontWeight: 600 }}>{c.pdv_nom || c.pdv_numero}</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 800, color: (c.note_connaissance||0) >= 7 ? '#22c55e' : (c.note_connaissance||0) >= 5 ? '#ffa502' : '#ff4757' }}>{c.note_connaissance ?? '—'}/10</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 800, color: (c.note_visite||0) >= 7 ? '#22c55e' : (c.note_visite||0) >= 5 ? '#ffa502' : '#ff4757' }}>{c.note_visite ?? '—'}/10</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 800, color: (c.note_superviseur||0) >= 7 ? '#22c55e' : (c.note_superviseur||0) >= 5 ? '#ffa502' : '#ff4757' }}>{c.note_superviseur ?? '—'}/10</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 900, color: col, fontSize: 14 }}>{moy.toFixed(1)}</td>
                  </tr>
                );
              })}
              {/* Ligne moyenne globale */}
              {joignables.length > 1 && (() => {
                const moyConn = joignables.reduce((s, c) => s + (c.note_connaissance||0), 0) / joignables.length;
                const moyVis = joignables.reduce((s, c) => s + (c.note_visite||0), 0) / joignables.length;
                const moyNote = joignables.reduce((s, c) => s + (c.note_superviseur||0), 0) / joignables.length;
                const moyGlob = (moyConn + moyVis + moyNote) / 3;
                const col = moyGlob >= 7 ? '#22c55e' : moyGlob >= 5 ? '#ffa502' : '#ff4757';
                return (
                  <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '8px 10px', color: '#fff', fontWeight: 800 }}>Moyenne</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 900, color: '#3b82f6' }}>{moyConn.toFixed(1)}/10</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 900, color: '#8b5cf6' }}>{moyVis.toFixed(1)}/10</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 900, color: '#FF6900' }}>{moyNote.toFixed(1)}/10</td>
                    <td style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 900, color: col, fontSize: 16 }}>{moyGlob.toFixed(1)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pdvsGeneres.map((pdv, i) => {
          const call = getCallStatus(pdv);
          const appele = !!call;
          const isActive = appelEnCours?.numero_pdv === pdv.numero_pdv;

          return (
            <div key={i} style={{ background: appele ? (call.statut === 'JOIGNABLE' ? 'rgba(34,197,94,0.06)' : 'rgba(255,71,87,0.06)') : 'rgba(255,255,255,0.02)',
              border: `1px solid ${appele ? (call.statut === 'JOIGNABLE' ? 'rgba(34,197,94,0.3)' : 'rgba(255,71,87,0.3)') : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 12, padding: '14px 16px' }}>

              {/* Ligne PDV info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: isActive ? 14 : 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: appele ? (call.statut === 'JOIGNABLE' ? '#22c55e' : '#ff4757') : '#3742fa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{pdv.nom || pdv.numero_pdv}</div>
                  <div style={{ fontSize: 11, color: '#8a8a9a', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>🟠 <strong style={{ color: '#FF6900' }}>{pdv.numero_flotte || pdv.telephone || '—'}</strong></span>
                  {pdv.numero_personnel && <span>📱 <strong style={{ color: '#ffa502' }}>{pdv.numero_personnel}</strong></span>}
                  {(pdv.quartier || pdv.localite) && <span>📍 {pdv.quartier || pdv.localite}</span>}
                </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!appele && (
                    <>
                      <button onClick={() => { setAppelEnCours(pdv); }}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        ✅ Joignable
                      </button>
                      <button onClick={() => mutation.mutate({ numero_pdv: pdv.numero_pdv, statut: 'INJOIGNABLE' })}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.1)', color: '#ff4757', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        📵 Injoignable
                      </button>
                    </>
                  )}
                  {appele && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: call.statut === 'JOIGNABLE' ? '#22c55e' : '#ff4757' }}>
                        {call.statut === 'JOIGNABLE' ? '✅ Joignable' : '📵 Injoignable'}
                      </span>
                      {call.statut === 'JOIGNABLE' && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {[
                            { label: '📚 Connaissance', val: call.note_connaissance, color: '#3b82f6' },
                            { label: '🚶 Visite', val: call.note_visite, color: '#8b5cf6' },
                            { label: '⭐ Note sup.', val: call.note_superviseur, color: '#FF6900' },
                          ].map((n, ni) => (
                            <div key={ni} style={{ textAlign: 'center', padding: '4px 10px', borderRadius: 8, background: `${n.color}15`, border: `1px solid ${n.color}30` }}>
                              <div style={{ fontSize: 10, color: '#64748b' }}>{n.label}</div>
                              <div style={{ fontSize: 15, fontWeight: 900, color: n.val >= 7 ? '#22c55e' : n.val >= 5 ? '#ffa502' : '#ff4757' }}>
                                {n.val ?? '—'}<span style={{ fontSize: 9, color: '#64748b' }}>/10</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {call.commentaire && <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', maxWidth: 200, textAlign: 'right' }}>💬 {call.commentaire}</div>}
                    </div>
                  )}
                </div>
              </div>

              {/* Formulaire notes si joignable */}
              {isActive && !appele && (
                <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 14 }}>
                    📋 Posez les 3 questions au PDV <strong style={{ color: '#fff' }}>{pdv.nom}</strong> :
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    {[
                      { key: 'note_connaissance', label: '1. Connaissance superviseur', placeholder: 'Demander le nom du superviseur → /10' },
                      { key: 'note_visite', label: '2. Visite effectuée', placeholder: 'A-t-il visité ? Date dernière visite → /10' },
                      { key: 'note_superviseur', label: '3. Note donnée au superviseur', placeholder: 'Note /10 que donne le PDV' },
                    ].map(q => (
                      <div key={q.key}>
                        <label style={{ fontSize: 11, color: '#22c55e', display: 'block', marginBottom: 6, fontWeight: 700 }}>{q.label}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="number" min="0" max="10" step="0.5"
                            value={notes[q.key]} onChange={e => setNotes(n => ({ ...n, [q.key]: e.target.value }))}
                            placeholder="0-10"
                            style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 7, color: '#fff', fontSize: 14, textAlign: 'center' }} />
                          <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>/10</span>
                        </div>
                        <p style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{q.placeholder}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 5 }}>Commentaire (optionnel)</label>
                    <input value={notes.commentaire} onChange={e => setNotes(n => ({ ...n, commentaire: e.target.value }))}
                      placeholder="Observation..."
                      style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setAppelEnCours(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8a8a9a', cursor: 'pointer', fontSize: 12 }}>Annuler</button>
                    <button
                      disabled={!notes.note_connaissance || !notes.note_visite || !notes.note_superviseur || mutation.isLoading}
                      onClick={() => mutation.mutate({
                        numero_pdv: pdv.numero_pdv,
                        statut: 'JOIGNABLE',
                        note_connaissance: parseFloat(notes.note_connaissance),
                        note_visite: parseFloat(notes.note_visite),
                        note_superviseur: parseFloat(notes.note_superviseur),
                        commentaire: notes.commentaire || null,
                      })}
                      style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: (!notes.note_connaissance || !notes.note_visite || !notes.note_superviseur) ? 0.5 : 1 }}>
                      {mutation.isLoading ? '⏳...' : '💾 Enregistrer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Présentiel Section ───────────────────────────────────────────────────────
function PresentielSection({ evaluation, superviseur, annee, mois, onRefresh }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState({
    note_maitrise_pdv: evaluation?.note_maitrise_pdv || '',
    note_maitrise_zone: evaluation?.note_maitrise_zone || '',
  });

  const pdvsPresent = evaluation?.pdvs_presentiel_generes || [];

  const mutation = useMutation(
    (data) => api.post(`/eval-superviseurs/${encodeURIComponent(superviseur)}/presentiel?annee=${annee}&mois=${mois}`, data).then(r => r.data),
    { onSuccess: (res) => {
      qc.invalidateQueries(['eval-sup', superviseur, annee, mois]);
      onRefresh();
      toast.success(`Notes présentiel enregistrées ! Score: ${Math.round(res?.score_presentiel ?? 0)}/100`);
    }}
  );

  const regenMutation = useMutation(
    () => api.post(`/eval-superviseurs/${encodeURIComponent(superviseur)}/regenerer-presentiel?annee=${annee}&mois=${mois}`).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries(['eval-sup', superviseur, annee, mois]); onRefresh(); } }
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>🏢 Évaluation Présentielle</h3>
        {evaluation?.score_presentiel != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ScoreBadge score={evaluation.score_presentiel} size="md" />
            <span style={{ fontSize: 11, color: '#64748b' }}>/100 · Poids 10%</span>
          </div>
        )}
      </div>

      {/* PDVs pour le test de maîtrise */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#FF6900' }}>🏪 PDVs pour le test de maîtrise (5 PDVs générés)</h4>
          <button onClick={() => regenMutation.mutate()}
            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,105,0,0.3)', background: 'rgba(255,105,0,0.1)', color: '#FF6900', fontSize: 11, cursor: 'pointer' }}>
            🔄 Regénérer
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#8a8a9a', marginBottom: 12 }}>
          Donner au superviseur le nom + numéro flotte de ces PDVs et lui demander les <strong style={{ color: '#fff' }}>adresses</strong>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {pdvsPresent.map((p, i) => (
            <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,105,0,0.05)', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#FF6900' }}>PDV {i+1}</div>
              <div style={{ fontSize: 12, color: '#fff', marginTop: 4 }}>{p.nom || p.numero_pdv}</div>
              <div style={{ fontSize: 11, color: '#8a8a9a', marginTop: 2 }}>
                <div>🟠 Flotte: <strong style={{ color: '#FF6900' }}>{p.telephone || p.numero_flotte || '—'}</strong></div>
                {p.numero_personnel && <div>📱 Personnel: <strong style={{ color: '#ffa502' }}>{p.numero_personnel}</strong></div>}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>Réponse attendue: {p.adresse || p.quartier || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Saisie des notes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { key: 'note_maitrise_pdv', label: '🏪 Maîtrise 10 PDV', desc: 'Donner 5 PDVs au superviseur → noter s\'il connaît les adresses', color: '#FF6900' },
          { key: 'note_maitrise_zone', label: '🗺️ Maîtrise de la Zone', desc: 'Demander les intersections de sa zone → noter la précision', color: '#3742fa' },
        ].map(q => (
          <div key={q.key} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${q.color}25`, borderRadius: 12, padding: '16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: q.color, marginBottom: 6 }}>{q.label}</div>
            <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 12 }}>{q.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="number" min="0" max="10" step="0.5"
                value={notes[q.key]} onChange={e => setNotes(n => ({ ...n, [q.key]: e.target.value }))}
                placeholder="0-10"
                style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${q.color}40`, borderRadius: 8, color: '#fff', fontSize: 20, fontWeight: 900, textAlign: 'center' }} />
              <span style={{ fontSize: 16, color: '#64748b', fontWeight: 700 }}>/10</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          disabled={!notes.note_maitrise_pdv || !notes.note_maitrise_zone || mutation.isLoading}
          onClick={() => mutation.mutate({ note_maitrise_pdv: parseFloat(notes.note_maitrise_pdv), note_maitrise_zone: parseFloat(notes.note_maitrise_zone) })}
          style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (!notes.note_maitrise_pdv || !notes.note_maitrise_zone) ? 0.5 : 1 }}>
          {mutation.isLoading ? '⏳...' : '💾 Enregistrer les notes'}
        </button>
      </div>
    </div>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
// ─── Vue Téléconseillère ────────────────────────────────────────────────────
// ── Fonction partage WhatsApp avec lien rapport ───────────────────────────────
async function partagerWhatsApp(evaluation, superviseur, mois, annee, numeroFourni) {
  const MOIS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const score = Math.round(evaluation.score_final || 0);
  const mention = evaluation.mention || '—';
  const scoreKpi = Math.round(evaluation.score_kpi || 0);
  const scoreMystery = Math.round(evaluation.score_mystery || 0);
  const scorePresentiel = Math.round(evaluation.score_presentiel || 0);

  // Emoji selon le score
  const emoji = score >= 85 ? '🏆' : score >= 70 ? '⭐' : score >= 55 ? '💪' : '⚠️';
  const encourage = score >= 85
    ? 'Félicitations pour cette excellente performance ! Continuez sur cette lancée.'
    : score >= 70
    ? 'Bon travail ! Quelques axes d\'amélioration vous permettront d\'atteindre l\'excellence.'
    : score >= 55
    ? 'Des efforts notables mais il faut accélérer. Nous comptons sur vous ce mois-ci !'
    : 'Des actions correctives urgentes sont nécessaires. Nous vous accompagnons pour améliorer les résultats.';

  // Construire les lignes KPI
  const kpisData = evaluation.kpis_data || {};
  const KPI_LABELS_WA = {
    montant_transactions: '💰 CA OMY', commission_totale: '💸 Commission',
    pdv_actifs: '🏪 PDV Actifs', montant_vente_nafama: '🟢 CA NAFAMA',
    taux_actif_omy: '📊 Taux Actif OMY', nb_actifs_omy: '📱 Nb Actifs OMY',
    taux_actif_nafama: '🟢 Taux Actif NAFAMA', nb_actifs_nafama: '🟢 Nb Actifs NAFAMA',
    taux_actif_kaabu: '💳 Taux Actif Kaabu', nb_actifs_kaabu: '💳 Nb Actifs Kaabu',
  };
  const kpiLines = Object.entries(KPI_LABELS_WA)
    .map(([k, label]) => {
      const v = kpisData[k];
      if (v == null) return '';
      const isPct = label.includes('Taux');
      const fmt = n => typeof n === 'number' ? new Intl.NumberFormat('fr-FR').format(Math.round(n)) : String(n);
      return `• ${label} : *${fmt(v)}${isPct ? '%' : ''}*`;
    })
    .filter(Boolean)
    .join('\n');

  const message = `${emoji} *RAPPORT D'ÉVALUATION — ${MOIS[mois].toUpperCase()} ${annee}*
👤 *Superviseur :* ${superviseur}

━━━━━━━━━━━━━━━━━━
🎯 *SCORE FINAL : ${score}/100 — ${mention}*
━━━━━━━━━━━━━━━━━━

📊 *Composantes :*
• KPIs (70%) : *${scoreKpi}/100*
• Appels Téléconseillères (20%) : *${scoreMystery}/100*
• Présentiel (10%) : *${scorePresentiel}/100*

${kpiLines ? `📈 *Détail des KPIs :*\n${kpiLines}\n` : ''}
💬 _${encourage}_

━━━━━━━━━━━━━━━━━━
_Farouk Distribution — ${MOIS[mois]} ${annee}_`;

  // Utiliser le numéro fourni ou celui du superviseur
  let numero = (numeroFourni || evaluation.superviseur_telephone || '').replace(/\D/g, '').replace(/^0/, '223');

  // Générer le rapport HTML sur le serveur pour obtenir un lien partageable
  let rapportUrl = null;
  let rapportExpire = null;
  try {
    const apiModule = require('../services/api');
    const apiInst = apiModule.default;
    // Récupérer le HTML du rapport (fenêtre déjà générée)
    const htmlResp = await exportPDFHTML(evaluation, superviseur, mois, annee);
    const resp = await apiInst.post('/rapports/generer-superviseur', {
      html: htmlResp,
      superviseur,
      mois: MOIS[mois],
      annee,
    });
    rapportUrl = resp.data.url;
    rapportExpire = resp.data.expire;
  } catch (e) {
    console.warn('Génération rapport échouée, envoi sans lien:', e);
  }

  // Message enrichi avec lien PDF si disponible
  const messageAvecLien = rapportUrl
    ? `${message}

📎 *Rapport complet disponible ici :*
${rapportUrl}
⏱️ _Lien valide jusqu'au ${rapportExpire}_`
    : message;

  const waUrl = `https://wa.me/${numero}?text=${encodeURIComponent(messageAvecLien)}`;
  window.open(waUrl, '_blank');
}

// ── Génère le HTML du rapport (partagé entre exportPDF et partagerWhatsApp) ───
async function exportPDFHTML(evaluation, superviseur, mois, annee) {
  // Appel identique à exportPDF mais retourne le HTML au lieu d'ouvrir une fenêtre
  return await _buildReportHTML(evaluation, superviseur, mois, annee);
}

// ── Fonction export PDF élégant ───────────────────────────────────────────────
async function exportPDF(evaluation, superviseur, mois, annee) {
  const html = await _buildReportHTML(evaluation, superviseur, mois, annee);
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(html);
  w.document.close();
}

async function _buildReportHTML(evaluation, superviseur, mois, annee) {
  // Charger les PDV inactifs/en baisse depuis l'API
  let pdvDetails = { omy: { inactifs: [], en_baisse: [] }, nafama: { inactifs: [], en_baisse: [] }, kaabu: { inactifs: [] } };
  try {
    const api = require('../services/api').default;
    const r = await api.get(`/eval-superviseurs/${encodeURIComponent(superviseur)}/pdv-details`, { params: { annee, mois } });
    pdvDetails = r.data;
  } catch (e) { console.warn('PDV details non disponibles:', e); }
  const MOIS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const score = Math.round(evaluation.score_final || 0);
  const mention = evaluation.mention || '—';
  const scoreColor = score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  const scoreColorLight = score >= 75 ? '#dcfce7' : score >= 50 ? '#fef3c7' : '#fee2e2';

  // PDV qui impactent négativement le superviseur (toutes catégories)
  const mysteryCalls = evaluation.mystery_calls || [];
  const pdvsMystery = mysteryCalls.filter(c =>
    c.statut === 'INJOIGNABLE' ||
    (c.note_connaissance != null && c.note_connaissance < 5) ||
    (c.note_visite != null && c.note_visite < 5) ||
    (c.note_superviseur != null && c.note_superviseur < 5) ||
    (c.note_connaissance != null && c.note_visite != null && ((c.note_connaissance + c.note_visite) / 2) < 6)
  );

  // KPIs sous objectif — catégories importantes
  const kpisData = evaluation.kpis_data || {};
  const kpisProblemes = [];
  if (kpisData.taux_actif_omy != null && kpisData.objectifs?.taux_actif_omy != null && kpisData.taux_actif_omy < kpisData.objectifs.taux_actif_omy * 0.9) {
    kpisProblemes.push({ cat: 'OMY — Taux actif faible', val: `${kpisData.taux_actif_omy}% (obj: ${kpisData.objectifs.taux_actif_omy}%)`, color: '#dc2626' });
  }
  if (kpisData.taux_actif_nafama != null && kpisData.objectifs?.taux_actif_nafama != null && kpisData.taux_actif_nafama < kpisData.objectifs.taux_actif_nafama * 0.9) {
    kpisProblemes.push({ cat: 'NAFAMA — Taux actif faible', val: `${kpisData.taux_actif_nafama}% (obj: ${kpisData.objectifs.taux_actif_nafama}%)`, color: '#d97706' });
  }
  if (kpisData.taux_actif_kaabu != null && kpisData.objectifs?.taux_actif_kaabu != null && kpisData.taux_actif_kaabu < kpisData.objectifs.taux_actif_kaabu * 0.9) {
    kpisProblemes.push({ cat: 'Kaabu — Adoption insuffisante', val: `${kpisData.taux_actif_kaabu}% (obj: ${kpisData.objectifs.taux_actif_kaabu}%)`, color: '#7c3aed' });
  }
  if (kpisData.ca_omy != null && kpisData.objectifs?.ca_omy != null && kpisData.ca_omy < kpisData.objectifs.ca_omy * 0.9) {
    const fmt2 = v => new Intl.NumberFormat('fr-FR').format(Math.round(v));
    kpisProblemes.push({ cat: 'CA OMY — Baisse par rapport objectif', val: `${fmt2(kpisData.ca_omy)} (obj: ${fmt2(kpisData.objectifs.ca_omy)})`, color: '#dc2626' });
  }
  if (kpisData.commission_totale != null && kpisData.objectifs?.commission_totale != null && kpisData.commission_totale < kpisData.objectifs.commission_totale * 0.9) {
    const fmt2 = v => new Intl.NumberFormat('fr-FR').format(Math.round(v));
    kpisProblemes.push({ cat: 'Commission — Objectif non atteint', val: `${fmt2(kpisData.commission_totale)} (obj: ${fmt2(kpisData.objectifs.commission_totale)})`, color: '#dc2626' });
  }

  const pdvsEnRetard = pdvsMystery;

  // KPIs avec écart
  const kpis = evaluation.kpis_data || {};
  const objectifs = kpis.objectifs || {};
  const scores_kpi = kpis.scores_kpi || {};

  // Tous les KPIs disponibles (superviseur + autres rôles)
  const KPI_LABELS = {
    // Superviseur
    montant_transactions:  '💰 Montant Transactions (CA OMY)',
    commission_totale:     '💸 Commission Totale',
    pdv_actifs:            '🏪 PDV Actifs OMY',
    montant_vente_nafama:  '🟢 Montant Vente NAFAMA',
    taux_actif_omy:        '📊 Taux Actif OMY (%)',
    nb_actifs_omy:         '📱 Nb Actifs OMY',
    taux_actif_nafama:     '🟢 Taux Actif NAFAMA (%)',
    nb_actifs_nafama:      '🟢 Nb Actifs NAFAMA',
    taux_actif_kaabu:      '💳 Taux Actif Kaabu (%)',
    nb_actifs_kaabu:       '💳 Nb Actifs Kaabu',
    taux_actif_km:         '📍 Taux Actif KM (%)',
    // Compatibilité anciens noms
    nb_pdv:                '🏪 Nb PDV actifs',
    ca_omy:                '💰 CA OMY',
    moy_ca_omy:            '📈 Moy. CA OMY',
    commission_omy:        '💸 Commission OMY',
    actif_omy:             '📱 PDVs Actifs OMY',
    nb_actif_nafama:       '🟢 Nb Actif NAFAMA',
    ca_nafama:             '🟢 CA NAFAMA',
    // Développeur
    taux_reussite_global:  '🎯 Taux Réussite Global (%)',
    taux_recuperation:     '🔄 Taux Récupération (%)',
    volume_prospection:    '📋 Volume Prospection',
    volume_visites:        '🚶 Volume Visites',
    taux_validation:       '✅ Taux Validation (%)',
    pct_sla_respecte:      '⏱️ SLA Respecté (%)',
    qualite_fiches:        '📝 Qualité Fiches (%)',
    // Téléconseillère
    taux_joignabilite:     '📞 Taux Joignabilité (%)',
    taux_connaissance:     '📚 Taux Connaissance (%)',
    score_accueil:         '😊 Score Accueil',
    nb_appels_effectues:   '📲 Nb Appels Effectués',
    // Gestionnaire
    taux_couverture:       '🗺️ Taux Couverture (%)',
    nb_pdv_visites:        '👣 Nb PDV Visités',
  };

  const pdvsEnRetardRows = pdvsEnRetard.map(c => {
    const raisons = [];
    if (c.statut === 'INJOIGNABLE') raisons.push('Injoignable');
    if (c.note_connaissance != null && c.note_connaissance < 5) raisons.push(`Connaissance: ${c.note_connaissance}/10`);
    if (c.note_visite != null && c.note_visite < 5) raisons.push(`Visite: ${c.note_visite}/10`);
    if (c.note_superviseur != null && c.note_superviseur < 5) raisons.push(`Supervision: ${c.note_superviseur}/10`);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${c.pdv_nom || c.pdv_numero}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px">${c.pdv_numero}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px">${c.quartier || c.localite || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">
          ${raisons.map(r => `<span style="display:inline-block;margin:2px;padding:2px 8px;border-radius:12px;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:600">${r}</span>`).join('')}
        </td>
      </tr>`;
  }).join('');

  // Récupérer TOUS les KPIs disponibles: depuis kpis_data directement (valeurs brutes)
  // + depuis objectifs/scores_kpi si disponibles
  const allKpiData = { ...kpis, ...objectifs, ...scores_kpi, ...(evaluation.kpis_data || {}) };

  const fmt = v => {
    if (v == null) return '—';
    if (typeof v === 'number') return new Intl.NumberFormat('fr-FR').format(Number.isInteger(v) ? v : parseFloat(v.toFixed(1)));
    return String(v);
  };

  const kpiRows = Object.entries(KPI_LABELS).map(([key, label]) => {
    const realisation = (evaluation.kpis_data || {})[key];
    const objectifVal = objectifs[key];
    const scoreVal = scores_kpi[key];
    // Ne montrer que les clés qui ont au moins une valeur
    if (realisation == null && objectifVal == null && scoreVal == null) return '';
    const isPct = label.includes('%');
    const sc = scoreVal != null ? Math.round(scoreVal) : null;
    const scoreColor = sc == null ? '#6b7280' : sc >= 80 ? '#16a34a' : sc >= 60 ? '#d97706' : '#dc2626';
    // Appréciation selon le score
    const apprecMsg = sc == null ? '—' : sc >= 95 ? 'Exceptionnel !' : sc >= 85 ? 'Très bien' : sc >= 75 ? 'Bien' : sc >= 60 ? 'Peut mieux faire' : sc >= 40 ? 'Insuffisant' : 'Critique';
    const apprecColor = sc == null ? '#6b7280' : sc >= 85 ? '#16a34a' : sc >= 65 ? '#d97706' : '#dc2626';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;font-size:13px">${objectifVal != null ? fmt(objectifVal) + (isPct ? '%' : '') : '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;font-size:13px">${realisation != null ? fmt(realisation) + (isPct ? '%' : '') : '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:800;color:${scoreColor};font-size:13px">${sc != null ? sc + '%' : '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:700;color:${apprecColor};font-size:12px">${apprecMsg}</td>
    </tr>`;
  }).filter(r => r).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head>
  <meta charset="UTF-8"/>
  <title>Évaluation — ${superviseur} — ${MOIS[mois]} ${annee}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      .page-break { page-break-before: always; }
    }
    .header { background: linear-gradient(135deg, #FF6900, #ff9500); color: white; padding: 36px 44px; }
    .header h1 { font-size: 13px; font-weight: 700; opacity: 0.85; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
    .header h2 { font-size: 38px; font-weight: 900; margin-bottom: 6px; line-height: 1.1; }
    .header .meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .header .badge { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; }
    .content { padding: 32px 40px; }
    .score-box { display: flex; align-items: center; justify-content: center; gap: 40px; background: ${scoreColorLight}; border: 2px solid ${scoreColor}; border-radius: 16px; padding: 28px; margin-bottom: 28px; }
    .score-big { font-size: 72px; font-weight: 900; color: ${scoreColor}; line-height: 1; }
    .score-info h2 { font-size: 22px; font-weight: 800; color: ${scoreColor}; }
    .score-info p { color: #6b7280; font-size: 14px; margin-top: 4px; }
    .composantes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
    .comp-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; text-align: center; }
    .comp-card .label { font-size: 12px; color: #6b7280; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .comp-card .val { font-size: 32px; font-weight: 900; }
    .comp-card .sub { font-size: 11px; color: #9ca3af; margin-top: 4px; }
    .section-title { font-size: 15px; font-weight: 800; color: #111827; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #f3f4f6; display: flex; align-items: center; gap: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 700; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .alert-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .alert-box h3 { color: #dc2626; font-size: 14px; font-weight: 800; margin-bottom: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; margin: 2px; }
    .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6; padding-top: 20px; }
    .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 24px; background: #FF6900; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 4px 12px rgba(255,105,0,0.4); }
  </style>
  </head><body>
  <button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer / Sauvegarder PDF</button>
  <div class="header">
    <h1>🎯 Rapport d'Évaluation Superviseur — Farouk Distribution</h1>
    <h2>${superviseur}</h2>
    <div class="meta">
      <span class="badge">📅 ${MOIS[mois]} ${annee}</span>
      ${kpisData.zone ? `<span class="badge">📍 Zone : ${kpisData.zone}</span>` : ''}
      ${(kpisData.sous_zones||[]).length > 0 ? `<span class="badge">🗺️ Sous-zone : ${(kpisData.sous_zones||[])[0]}</span>` : ''}
      <span class="badge">👔 Superviseur</span>
    </div>
  </div>
  <div class="content">
    <!-- Score global -->
    <div class="score-box">
      <div class="score-big">${score}</div>
      <div class="score-info">
        <h2>${mention}</h2>
        <p>Score final sur 100 points</p>
        <p style="margin-top:8px;font-size:13px;color:#374151">KPIs 70% &nbsp;·&nbsp; Appel des Téléconseillères 20% &nbsp;·&nbsp; Présentiel 10%</p>
      </div>
    </div>
    <!-- Composantes -->
    <div class="composantes">
      <div class="comp-card">
        <div class="label">📊 KPIs</div>
        <div class="val" style="color:#3742fa">${Math.round(evaluation.score_kpi || 0)}<span style="font-size:16px;color:#9ca3af">/100</span></div>
        <div class="sub">Poids : 70%</div>
      </div>
      <div class="comp-card">
        <div class="label">📞 Appel des Téléconseillères</div>
        <div class="val" style="color:#16a34a">${Math.round(evaluation.score_mystery || 0)}<span style="font-size:16px;color:#9ca3af">/100</span></div>
        <div class="sub">Poids : 20%</div>
      </div>
      <div class="comp-card">
        <div class="label">🏢 Présentiel</div>
        <div class="val" style="color:#FF6900">${Math.round(evaluation.score_presentiel || 0)}<span style="font-size:16px;color:#9ca3af">/100</span></div>
        <div class="sub">Poids : 10%</div>
      </div>
    </div>
    <!-- KPIs tableau -->
    ${kpiRows ? `<div class="section-title">📊 Détail des KPIs</div>
    <table><thead><tr><th>Indicateur</th><th style="text-align:right">Objectif</th><th style="text-align:right">Réalisation</th><th style="text-align:center">Score</th><th style="text-align:center">Appréciation</th></tr></thead>
    <tbody>${kpiRows}</tbody></table>` : ''}
    <!-- KPIs sous objectif -->
    ${kpisProblemes.length > 0 ? `
    <div class="section-title" style="margin-top:32px">📉 Catégories KPI sous objectif</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px">
      ${kpisProblemes.map(k => `
        <div style="flex:1;min-width:220px;border-radius:10px;padding:14px;border-left:4px solid ${k.color};background:${k.color}18">
          <div style="font-weight:700;color:${k.color};font-size:13px">${k.cat}</div>
          <div style="color:#374151;font-size:12px;margin-top:4px">${k.val}</div>
        </div>`).join('')}
    </div>` : ''}
    <!-- PDV problématiques appels TC -->
    ${pdvsEnRetardRows ? `<div class="section-title" style="margin-top:20px">📵 PDV problématiques — Appels des Téléconseillères (${pdvsEnRetard.length})</div>
    <div class="alert-box">
      <h3>Ces PDV ont des insuffisances détectées lors des appels des Téléconseillères</h3>
      <table>
        <thead><tr><th>PDV</th><th>Numéro</th><th>Quartier</th><th>Problèmes détectés</th></tr></thead>
        <tbody>${pdvsEnRetardRows}</tbody>
      </table>
    </div>` : kpisProblemes.length === 0 ? `<div class="section-title" style="margin-top:32px">✅ Aucune anomalie détectée</div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;color:#16a34a;font-weight:600;text-align:center">
      Toutes les catégories KPIs sont au-dessus des objectifs et aucun PDV n'est en difficulté.
    </div>` : ''}
    <!-- PDV OMY, NAFAMA, KAABU -->
    ${(() => {
      const fmtRow = (p, baisse) => {
        const varStr = p.variation_pct != null ? ` (${p.variation_pct > 0 ? '+' : ''}${p.variation_pct}%)` : '';
        const caStr = p.ca_actuel != null ? new Intl.NumberFormat('fr-FR').format(p.ca_actuel) : '—';
        const caPStr = p.ca_precedent != null ? new Intl.NumberFormat('fr-FR').format(p.ca_precedent) : '—';
        const badge = baisse
          ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">📉 ${varStr}</span>`
          : `<span style="background:#fef3c7;color:#d97706;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">💤 Inactif</span>`;
        return `<tr>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600">${p.nom || p.numero_pdv}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${p.numero_pdv}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${p.quartier}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:11px">${caStr}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${caPStr}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6">${badge}</td>
        </tr>`;
      };
      const thead = `<thead><tr><th>PDV</th><th>Numéro</th><th>Quartier</th><th>CA Mois</th><th>CA Préc.</th><th>Statut</th></tr></thead>`;
      let html = '';

      const omyAll = [...(pdvDetails.omy?.inactifs||[]), ...(pdvDetails.omy?.en_baisse||[])];
      if (omyAll.length) html += `
        <div class="section-title" style="margin-top:24px">📱 OMY — PDV inactifs & en baisse (${omyAll.length})</div>
        <table>${thead}<tbody>
          ${(pdvDetails.omy?.inactifs||[]).map(p => fmtRow(p, false)).join('')}
          ${(pdvDetails.omy?.en_baisse||[]).map(p => fmtRow(p, true)).join('')}
        </tbody></table>`;

      const nafAll = [...(pdvDetails.nafama?.inactifs||[]), ...(pdvDetails.nafama?.en_baisse||[])];
      if (nafAll.length) html += `
        <div class="section-title" style="margin-top:20px">🟢 NAFAMA — PDV inactifs & en baisse (${nafAll.length})</div>
        <table>${thead}<tbody>
          ${(pdvDetails.nafama?.inactifs||[]).map(p => fmtRow(p, false)).join('')}
          ${(pdvDetails.nafama?.en_baisse||[]).map(p => fmtRow(p, true)).join('')}
        </tbody></table>`;

      const kaabuAll = pdvDetails.kaabu?.inactifs || [];
      if (kaabuAll.length) html += `
        <div class="section-title" style="margin-top:20px">💳 KAABU — PDV inactifs (${kaabuAll.length})</div>
        <table>${thead}<tbody>
          ${kaabuAll.map(p => fmtRow(p, false)).join('')}
        </tbody></table>`;

      if (!omyAll.length && !nafAll.length && !kaabuAll.length) html = `
        <div class="section-title" style="margin-top:24px">✅ Aucun PDV inactif ou en baisse détecté</div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;color:#16a34a;font-weight:600;text-align:center">
          Tous les PDVs sont actifs et sans baisse significative de CA. Excellent travail !
        </div>`;
      return html;
    })()}
    <div class="footer">
      <p>Rapport généré le ${new Date().toLocaleDateString('fr-FR')} &nbsp;·&nbsp; Farouk Distribution &nbsp;·&nbsp; Système de Gestion Réseau</p>
    </div>
  </div>
  </body></html>`;

  return html;
}

// ── 📈 Évolution mensuelle (graphique SVG) ────────────────────────────────────
function EvolutionTab({ superviseur, annee, mois }) {
  const { data, isLoading } = useQuery(
    ['eval-historique', superviseur],
    () => api.get(`/eval-superviseurs/${encodeURIComponent(superviseur)}/historique`, { params: { nb_mois: 6 } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const hist = data?.historique || [];
  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Chargement de l{"'"}historique...</div>;
  if (!hist.length) return <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Aucun historique disponible. Les données apparaîtront après plusieurs mois d{"'"}évaluation.</div>;

  const W = 600, H = 200, PAD = 40;
  const maxScore = 100;
  const pts = (key) => hist.map((h, i) => {
    const x = PAD + (i / Math.max(hist.length - 1, 1)) * (W - PAD * 2);
    const y = H - PAD - ((h[key] || 0) / maxScore) * (H - PAD * 2);
    return { x, y, v: h[key] || 0, label: h.label };
  });
  const ptsScore = pts('score_final');
  const ptsKpi = pts('score_kpi');
  const polyline = (arr, color) => `<polyline points="${arr.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dots = (arr, color) => arr.map(p => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${color}" stroke="#1e2236" stroke-width="2"/><text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="11" fill="${color}" font-weight="bold">${Math.round(p.v)}</text>`).join('');
  const labels = ptsScore.map(p => `<text x="${p.x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${p.label}</text>`).join('');
  const svgContent = `${polyline(ptsScore, '#FF6900')}${polyline(ptsKpi, '#3b82f6')}${dots(ptsScore, '#FF6900')}${dots(ptsKpi, '#3b82f6')}${labels}`;
  const scoreActuel = hist[hist.length - 1]?.score_final || 0;
  const scorePrev = hist.length > 1 ? hist[hist.length - 2]?.score_final : null;
  const tendance = scorePrev !== null ? scoreActuel - scorePrev : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>📈 Évolution sur {hist.length} mois — {superviseur}</div>
        {tendance !== null && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
            <div style={{ padding: '10px 16px', borderRadius: 10, background: tendance >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(255,71,87,0.1)', color: tendance >= 0 ? '#22c55e' : '#ff4757', fontWeight: 800, fontSize: 14 }}>
              {tendance >= 0 ? '📈' : '📉'} {tendance >= 0 ? '+' : ''}{tendance.toFixed(1)} pts vs mois précédent
            </div>
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}
          dangerouslySetInnerHTML={{ __html: svgContent + `<line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>` }} />
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
          <span style={{ color: '#FF6900', fontWeight: 700 }}>● Score Final</span>
          <span style={{ color: '#3b82f6', fontWeight: 700 }}>● KPIs</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {hist.map((h, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{h.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: h.score_final >= 75 ? '#22c55e' : h.score_final >= 55 ? '#ffa502' : '#ff4757' }}>{Math.round(h.score_final)}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{h.mention}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 🎯 Plan d'Action automatique ──────────────────────────────────────────────
function PlanActionTab({ evaluation, superviseur }) {
  const kpis = evaluation.kpis_data || {};
  const objectifs = kpis.objectifs || {};
  const score = evaluation.score_final || 0;
  const actions = [];

  if (kpis.taux_actif_omy != null && kpis.taux_actif_omy < 85) actions.push({ priorite: 'HAUTE', categorie: 'OMY', icon: '📱', action: `Activer les PDVs inactifs OMY — Taux actuel: ${kpis.taux_actif_omy}% (Objectif: 85%)`, detail: 'Identifier les PDVs avec CA = 0 et effectuer une visite terrain cette semaine', delai: 'Cette semaine' });
  if (kpis.taux_actif_nafama != null && kpis.taux_actif_nafama < 80) actions.push({ priorite: 'HAUTE', categorie: 'NAFAMA', icon: '🟢', action: `Booster les ventes NAFAMA — Taux actuel: ${kpis.taux_actif_nafama}% (Objectif: 80%)`, detail: 'Former les PDVs sur les techniques de vente SIM et crédit téléphonique', delai: 'Cette semaine' });
  if (kpis.taux_actif_kaabu != null && kpis.taux_actif_kaabu < 70) actions.push({ priorite: 'HAUTE', categorie: 'KAABU', icon: '💳', action: `Augmenter adoption Kaabu — Taux actuel: ${kpis.taux_actif_kaabu}% (Objectif: 70%)`, detail: 'Organiser des sessions de formation Kaabu dans chaque sous-zone', delai: 'Cette semaine' });
  if (evaluation.score_mystery != null && evaluation.score_mystery < 70) actions.push({ priorite: 'MOYENNE', categorie: 'Appels TC', icon: '📞', action: `Améliorer la joignabilité des PDVs — Score appels TC: ${Math.round(evaluation.score_mystery)}/100`, detail: 'S\'assurer que les PDVs répondent aux appels et connaissent leurs produits', delai: 'Ce mois' });
  if (evaluation.score_presentiel != null && evaluation.score_presentiel < 70) actions.push({ priorite: 'MOYENNE', categorie: 'Présentiel', icon: '🏢', action: `Renforcer la maîtrise terrain — Score présentiel: ${Math.round(evaluation.score_presentiel)}/100`, detail: 'Apprendre les 10 PDVs de chaque sous-zone et leurs spécificités', delai: 'Ce mois' });
  if (score >= 80) actions.push({ priorite: 'BONNE PRATIQUE', categorie: 'Excellence', icon: '⭐', action: 'Maintenir ce niveau d\'excellence et partager les bonnes pratiques', detail: 'Identifier les 3 meilleures pratiques de votre zone et les transmettre à vos collègues', delai: 'En continu' });
  if (!actions.length) actions.push({ priorite: 'BONNE PRATIQUE', categorie: 'General', icon: '✅', action: 'Continuer sur cette lancée !', detail: 'Tous les indicateurs sont au vert. Maintenir le rythme et partager vos bonnes pratiques.', delai: 'En continu' });

  const prioColor = p => p === 'HAUTE' ? '#ff4757' : p === 'MOYENNE' ? '#ffa502' : '#22c55e';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>🎯 Plan d{"'"}Action — {superviseur}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Basé sur votre score de {Math.round(score)}/100 et vos KPIs du mois. Actions prioritaires pour améliorer votre performance.</div>
      {actions.map((a, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${prioColor(a.priorite)}33`, borderLeft: `4px solid ${prioColor(a.priorite)}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 20 }}>{a.icon}</span>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, color: prioColor(a.priorite), background: `${prioColor(a.priorite)}15`, padding: '2px 8px', borderRadius: 6 }}>{a.priorite}</span>
                <span style={{ marginLeft: 8, fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>{a.categorie}</span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>⏰ {a.delai}</span>
          </div>
          <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14, marginBottom: 6 }}>{a.action}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>💡 {a.detail}</div>
        </div>
      ))}
    </div>
  );
}

// ── 🏅 Badges et récompenses ──────────────────────────────────────────────────
function BadgesTab({ superviseur, annee, mois }) {
  const { data } = useQuery(
    ['eval-historique-badges', superviseur],
    () => api.get(`/eval-superviseurs/${encodeURIComponent(superviseur)}/historique`, { params: { nb_mois: 12 } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const hist = data?.historique || [];
  const scoreMois = hist[hist.length - 1]?.score_final || 0;
  const consecutifs = hist.filter((h, i) => {
    const recent = hist.slice(Math.max(0, hist.length - 3));
    return recent.every(r => r.score_final >= 80);
  }).length;

  const allBadges = [
    { id: 'parfait', icon: '💎', label: 'Score Parfait', desc: 'Score ≥ 95/100', earned: scoreMois >= 95, color: '#3b82f6' },
    { id: 'excellent', icon: '🏆', label: 'Excellent', desc: 'Score ≥ 85/100', earned: scoreMois >= 85, color: '#FF6900' },
    { id: 'top_kpi', icon: '📊', label: 'Champion KPI', desc: 'Score KPI ≥ 90', earned: (hist[hist.length-1]?.score_kpi || 0) >= 90, color: '#22c55e' },
    { id: 'consecutif', icon: '🔥', label: '3 Mois d\'affilée', desc: '3 mois consécutifs ≥ 80', earned: hist.length >= 3 && hist.slice(-3).every(h => h.score_final >= 80), color: '#ef4444' },
    { id: 'progres', icon: '📈', label: 'En Progrès', desc: 'Score en hausse ce mois', earned: hist.length >= 2 && hist[hist.length-1]?.score_final > hist[hist.length-2]?.score_final, color: '#8b5cf6' },
    { id: 'assiduite', icon: '✅', label: 'Assidu', desc: 'Évaluation complète', earned: true, color: '#0ea5e9' },
    { id: 'tc_champion', icon: '📞', label: 'Champion TC', desc: 'Score Appels TC ≥ 85', earned: (hist[hist.length-1]?.score_mystery || 0) >= 85, color: '#f59e0b' },
    { id: 'presentiel', icon: '🏢', label: 'Expert Terrain', desc: 'Score Présentiel = 100', earned: (hist[hist.length-1]?.score_presentiel || 0) >= 100, color: '#10b981' },
  ];
  const earned = allBadges.filter(b => b.earned);
  const locked = allBadges.filter(b => !b.earned);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>🏅 Badges de {superviseur}</div>
      {earned.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>✅ Badges obtenus ({earned.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {earned.map(b => (
              <div key={b.id} style={{ background: `${b.color}15`, border: `2px solid ${b.color}40`, borderRadius: 14, padding: '18px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{b.icon}</div>
                <div style={{ fontWeight: 800, color: b.color, fontSize: 13, marginBottom: 4 }}>{b.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {locked.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>🔒 À débloquer ({locked.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {locked.map(b => (
              <div key={b.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 14px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: 36, marginBottom: 8, filter: 'grayscale(1)' }}>{b.icon}</div>
                <div style={{ fontWeight: 700, color: '#64748b', fontSize: 13, marginBottom: 4 }}>{b.label}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 💬 Commentaires superviseur ───────────────────────────────────────────────
function CommentairesTab({ superviseur, annee, mois }) {
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [comments, setComments] = useState([]);
  const { data } = useQuery(
    ['eval-comments', superviseur, annee, mois],
    () => api.get(`/eval-superviseurs/${encodeURIComponent(superviseur)}/commentaires`, { params: { annee, mois } }).then(r => r.data).catch(() => []),
    { staleTime: 0 }
  );
  const commentsList = data || [];

  const submit = async () => {
    if (!comment.trim()) return;
    try {
      await api.post(`/eval-superviseurs/${encodeURIComponent(superviseur)}/commentaires`, { annee, mois, commentaire: comment, type: 'SUPERVISEUR' });
      setSubmitted(true); setComment('');
    } catch { setSubmitted(true); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>💬 Commentaires — {superviseur}</div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 12 }}>📝 Réponse du superviseur sur son évaluation :</div>
        {submitted ? (
          <div style={{ padding: '14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, color: '#22c55e', fontWeight: 700 }}>✅ Commentaire soumis avec succès. L{"'"}admin a été notifié.</div>
        ) : (
          <>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={5}
              placeholder={"Partagez votre ressenti sur cette évaluation : points d'accord, points de désaccord, contexte particulier ce mois-ci, difficultés rencontrées..."}
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#e2e8f0', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={submit} disabled={!comment.trim()}
                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: comment.trim() ? 'linear-gradient(135deg,#FF6900,#ff9500)' : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 800, cursor: comment.trim() ? 'pointer' : 'not-allowed', fontSize: 13 }}>
                📤 Soumettre mon commentaire
              </button>
            </div>
          </>
        )}
      </div>
      {commentsList.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 12 }}>📜 Historique des commentaires :</div>
          {commentsList.map((c, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.type === 'ADMIN' ? '#FF6900' : '#0ea5e9' }}>{c.type === 'ADMIN' ? '👔 Admin' : '👤 Superviseur'}</span>
                <span style={{ fontSize: 11, color: '#475569' }}>{c.date}</span>
              </div>
              <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>{c.commentaire}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 🗺️ Par Zone ───────────────────────────────────────────────────────────────
function ListeSupTab({ annee, mois }) {
  const [indicateur, setIndicateur] = React.useState('score_final');
  const { data, isLoading } = useQuery(
    ['eval-classement-liste', annee, mois],
    async () => {
      const resp = await api.get('/eval-superviseurs/classement-global', { params: { annee, mois } });
      const valides = resp.data.classement || [];
      const nonValides = resp.data.non_valides || [];
      const valideSet = new Set(valides.map(v => v.superviseur));
      return [...valides, ...nonValides].map(s => ({ ...s, isValide: valideSet.has(s.superviseur) }));
    },
    { staleTime: 60000 }
  );

  const INDICATEURS = [
    { id: 'score_final',  label: '🎯 Score Final',    seuil: 55,  fmt: v => v != null ? Math.round(v)+'/100' : '—', color: '#6366f1' },
    { id: 'nb_pdv',       label: '🏪 NB PDV',          seuil: 30,  fmt: v => v ?? '—', color: '#FF6900' },
    { id: 'actif_omy',    label: '📶 Actif OMY %',     seuil: 90,  fmt: v => v != null ? v.toFixed(1)+'%' : '—', color: '#22c55e' },
    { id: 'taux_km',      label: '📍 KM %',             seuil: 80,  fmt: v => v != null ? v.toFixed(1)+'%' : '—', color: '#3b82f6' },
    { id: 'taux_nafama',  label: '💰 NAFAMA %',         seuil: 80,  fmt: v => v != null ? v.toFixed(1)+'%' : '—', color: '#00cec9' },
    { id: 'ca_omy',       label: '💵 CA OMY',           seuil: null, fmt: v => v != null ? new Intl.NumberFormat('fr-FR').format(Math.round(v)) : '—', color: '#f59e0b' },
    { id: 'commission',   label: '🏅 Commission',       seuil: null, fmt: v => v != null ? new Intl.NumberFormat('fr-FR').format(Math.round(v)) : '—', color: '#8b5cf6' },
    { id: 'ca_nafama',    label: '💰 CA NAFAMA',        seuil: null, fmt: v => v != null ? new Intl.NumberFormat('fr-FR').format(Math.round(v)) : '—', color: '#00cec9' },
  ];

  const indInfo = INDICATEURS.find(i => i.id === indicateur) || INDICATEURS[0];
  const sorted = [...(data || [])].sort((a, b) => (b[indicateur]||0) - (a[indicateur]||0));
  const nbValides = sorted.filter(s => s.isValide).length;
  const nbOk = indInfo.seuil != null ? sorted.filter(s => (s[indicateur]||0) >= indInfo.seuil).length : null;
  const nbNok = indInfo.seuil != null ? sorted.filter(s => (s[indicateur]||0) < indInfo.seuil && s[indicateur] != null).length : null;

  if (isLoading) return <div style={{ textAlign:'center', padding:40, color:'#8a8a9a' }}>Chargement...</div>;
  if (!sorted.length) return <div style={{ textAlign:'center', padding:40, color:'#8a8a9a' }}>Aucun superviseur évalué.</div>;

  return (
    <div>
      <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:16 }}>
        📋 Liste des superviseurs — {['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][mois]} {annee}
      </div>

      {/* Filtre indicateur */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:20 }}>
        {INDICATEURS.map(ind => (
          <button key={ind.id} onClick={() => setIndicateur(ind.id)}
            style={{ padding:'6px 14px', borderRadius:20, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
              background: indicateur === ind.id ? ind.color : 'rgba(255,255,255,0.05)',
              color: indicateur === ind.id ? '#fff' : '#8a8a9a',
              boxShadow: indicateur === ind.id ? `0 3px 10px ${ind.color}50` : 'none' }}>
            {ind.label}
          </button>
        ))}
      </div>

      {/* Bilan */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px', textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:900, color:'#fff' }}>{sorted.length}</div>
          <div style={{ fontSize:11, color:'#64748b' }}>Total évalués</div>
        </div>
        <div style={{ background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:12, padding:'14px', textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:900, color:'#22c55e' }}>{nbValides}</div>
          <div style={{ fontSize:11, color:'#64748b' }}>✅ Validés</div>
        </div>
        <div style={{ background:'rgba(220,38,38,0.06)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:12, padding:'14px', textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:900, color:'#dc2626' }}>{sorted.length - nbValides}</div>
          <div style={{ fontSize:11, color:'#64748b' }}>❌ Non validés</div>
        </div>
        {nbOk != null && (
          <div style={{ background:`rgba(99,102,241,0.06)`, border:`1px solid ${indInfo.color}30`, borderRadius:12, padding:'14px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:900, color:indInfo.color }}>{nbOk}</div>
            <div style={{ fontSize:11, color:'#64748b' }}>✅ Objectif {indInfo.label} atteint</div>
          </div>
        )}
        {nbNok != null && (
          <div style={{ background:'rgba(255,71,87,0.06)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:12, padding:'14px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:900, color:'#ff4757' }}>{nbNok}</div>
            <div style={{ fontSize:11, color:'#64748b' }}>❌ Sous l'objectif {indInfo.seuil}</div>
          </div>
        )}
      </div>

      {/* Tableau */}
      <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'rgba(255,255,255,0.04)' }}>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:'#64748b', fontWeight:700, width:40 }}>#</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, color:'#64748b', fontWeight:700 }}>Superviseur</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:'#64748b', fontWeight:700 }}>Statut</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:indInfo.color, fontWeight:700 }}>{indInfo.label}</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:'#64748b', fontWeight:700 }}>Score final</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:'#64748b', fontWeight:700 }}>NB PDV</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:'#64748b', fontWeight:700 }}>Actif OMY</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:'#64748b', fontWeight:700 }}>KM%</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:11, color:'#64748b', fontWeight:700 }}>NAFAMA%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const val = s[indicateur];
              const ok = indInfo.seuil != null ? (val||0) >= indInfo.seuil : null;
              const score = s.score_final ?? null;
              const scoreColor = score >= 75 ? '#22c55e' : score >= 55 ? '#ffa502' : '#ff4757';
              return (
                <tr key={s.superviseur} style={{ borderTop:'1px solid rgba(255,255,255,0.05)', background: i%2===0?'transparent':'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding:'9px 14px', textAlign:'center', fontSize:12, color:'#64748b', fontWeight:700 }}>{i+1}</td>
                  <td style={{ padding:'9px 14px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>{s.superviseur}</td>
                  <td style={{ padding:'9px 14px', textAlign:'center' }}>
                    {s.isValide
                      ? <span style={{ background:'rgba(34,197,94,0.1)', color:'#22c55e', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>✅ Validé</span>
                      : s.statut === 'SCORE_CALCULE'
                      ? <span style={{ background:'rgba(255,165,2,0.1)', color:'#ffa502', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>⚡ Score calculé</span>
                      : <span style={{ background:'rgba(220,38,38,0.1)', color:'#dc2626', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>❌ Non validé</span>}
                  </td>
                  <td style={{ padding:'9px 14px', textAlign:'center' }}>
                    <span style={{ fontSize:14, fontWeight:900, color: ok === null ? indInfo.color : ok ? '#22c55e' : '#ff4757' }}>
                      {indInfo.fmt(val)}
                    </span>
                    {ok === false && indInfo.seuil && <span style={{ fontSize:9, color:'#64748b', display:'block' }}>obj: {indInfo.seuil}</span>}
                  </td>
                  <td style={{ padding:'9px 14px', textAlign:'center', fontSize:13, fontWeight:900, color:scoreColor }}>{score != null ? Math.round(score)+'/100' : '—'}</td>
                  <td style={{ padding:'9px 14px', textAlign:'center', fontSize:12, fontWeight:700, color:(s.nb_pdv||0)>=30?'#22c55e':'#ff4757' }}>{s.nb_pdv||'—'}</td>
                  <td style={{ padding:'9px 14px', textAlign:'center', fontSize:12, fontWeight:700, color:(s.actif_omy||0)>=90?'#22c55e':'#ff4757' }}>{s.actif_omy!=null?s.actif_omy.toFixed(1)+'%':'—'}</td>
                  <td style={{ padding:'9px 14px', textAlign:'center', fontSize:12, fontWeight:700, color:(s.taux_km||0)>=80?'#22c55e':'#ff4757' }}>{s.taux_km!=null?s.taux_km.toFixed(1)+'%':'—'}</td>
                  <td style={{ padding:'9px 14px', textAlign:'center', fontSize:12, fontWeight:700, color:(s.taux_nafama||0)>=80?'#22c55e':'#ff4757' }}>{s.taux_nafama!=null?s.taux_nafama.toFixed(1)+'%':'—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParZoneTab({ annee, mois }) {
  // Charger le classement global avec les zones depuis les KPIs
  const { data, isLoading } = useQuery(
    ['eval-classement-zone', annee, mois],
    async () => {
      // Charger le classement global
      const resp = await api.get('/eval-superviseurs/classement-global', { params: { annee, mois } });
      // Inclure TOUS les superviseurs (validés + non validés)
      const classement = [...(resp.data.classement || []), ...(resp.data.non_valides || [])];
      const valideSet = new Set((resp.data.classement || []).map(v => v.superviseur));
      // Pour chaque superviseur, récupérer sa zone depuis les KPIs
      const enriched = await Promise.all(classement.map(async (s) => {
        try {
          const kpiResp = await api.get(`/eval-superviseurs/${encodeURIComponent(s.superviseur)}`, { params: { annee, mois } });
          const zone = kpiResp.data?.kpis_data?.zone || kpiResp.data?.zone || 'Zone non définie';
          return { ...s, zone, isValide: valideSet.has(s.superviseur) };
        } catch { return { ...s, zone: 'Zone non définie', isValide: valideSet.has(s.superviseur) }; }
      }));
      return enriched;
    },
    { staleTime: 60000 }
  );

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Chargement...</div>;
  if (!data?.length) return <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Aucun superviseur évalué pour ce mois.</div>;

  // Grouper par zone
  const parZone = {};
  data.forEach(s => {
    const zone = s.zone || 'Zone non définie';
    if (!parZone[zone]) parZone[zone] = [];
    parZone[zone].push(s);
  });

  // Trier zones par score moyen décroissant
  const zonesSorted = Object.entries(parZone).sort((a, b) => {
    const moyA = a[1].reduce((s, x) => s + (x.score_final||0), 0) / a[1].length;
    const moyB = b[1].reduce((s, x) => s + (x.score_final||0), 0) / b[1].length;
    return moyB - moyA;
  });

  const podium = ['🥇','🥈','🥉'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>
        🗺️ Performance par Zone — {['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][mois]} {annee}
      </div>

      {/* Vue globale des zones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {zonesSorted.map(([zone, sups], zi) => {
          const moy = Math.round(sups.reduce((s, x) => s + (x.score_final||0), 0) / sups.length);
          const color = moy >= 75 ? '#22c55e' : moy >= 55 ? '#ffa502' : '#ff4757';
          return (
            <div key={zone} style={{ background: 'rgba(255,255,255,0.03)', border: `2px solid ${color}30`, borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>{zi < 3 ? podium[zi] : `${zi+1}.`}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginTop: 6, marginBottom: 4 }}>{zone}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color }}>{moy}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Moy. /100 · {sups.length} sup{sups.length > 1 ? 's' : ''}</div>
            </div>
          );
        })}
      </div>

      {/* Détail par zone */}
      {zonesSorted.map(([zone, sups], zi) => {
        const moy = Math.round(sups.reduce((s, x) => s + (x.score_final||0), 0) / sups.length);
        const best = sups.reduce((a, b) => (a.score_final||0) > (b.score_final||0) ? a : b);
        const color = moy >= 75 ? '#22c55e' : moy >= 55 ? '#ffa502' : '#ff4757';
        return (
          <div key={zone} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}30`, borderLeft: `4px solid ${color}`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#e2e8f0' }}>{zi < 3 ? podium[zi] : `${zi+1}.`} {zone}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {sups.length} superviseur{sups.length > 1 ? 's' : ''} · 🏆 Meilleur: <strong style={{ color: '#FF6900' }}>{best.superviseur.split(' ')[0]}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: '10px 20px', background: `${color}15`, borderRadius: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color }}>{moy}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Moy. /100</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sups.sort((a, b) => (b.score_final||0) - (a.score_final||0)).map((s, i) => {
                const col = (s.score_final||0) >= 75 ? '#22c55e' : (s.score_final||0) >= 55 ? '#ffa502' : '#ff4757';
                const mention = (s.score_final||0) >= 85 ? '⭐ Très Bien' : (s.score_final||0) >= 70 ? '👍 Bien' : (s.score_final||0) >= 55 ? '💪 Passable' : '⚠️ Insuffisant';
                return (
                  <div key={s.superviseur} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: '#475569', width: 18, fontWeight: 700 }}>{i+1}.</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{s.superviseur}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{mention}</span>
                    <div style={{ width: 100, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${s.score_final||0}%`, height: '100%', background: col, borderRadius: 3 }}/>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 900, color: col, width: 32, textAlign: 'right' }}>{Math.round(s.score_final||0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VueTeleconseillere({ annee, mois }) {
  const qc = useQueryClient();
  const [appelEnCours, setAppelEnCours] = useState(null);
  const [notes, setNotes] = useState({ note_connaissance:'', note_visite:'', note_superviseur:'', commentaire:'' });

  const { data: maListe, refetch, isLoading: loadingListe } = useQuery(
    ['ma-liste-mystery', annee, mois],
    () => api.get(`/eval-superviseurs/ma-liste-mystery?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: false }
  );

  const mutation = useMutation(
    (data) => api.post(`/eval-superviseurs/${encodeURIComponent(data.superviseur)}/mystery-call?annee=${annee}&mois=${mois}`, data.payload).then(r => r.data),
    { onSuccess: (data) => {
        refetch();
        setAppelEnCours(null);
        setNotes({note_connaissance:'',note_visite:'',note_superviseur:'',commentaire:''});
        // Si injoignable et un PDV de remplacement existe, notification
        if (data?.pdv_remplacement) {
          console.log('PDV de remplacement automatique ajouté:', data.pdv_remplacement.nom);
        }
      }
    }
  );

  const liste = maListe?.liste || [];
  const aFaire = liste.filter(i => !i.statut_appel);
  const faits = liste.filter(i => i.statut_appel);
  const [openSups, setOpenSups] = React.useState(
    // Seul le premier superviseur est ouvert par défaut
    {}
  );
  const isSupOpen = (sup, idx) => openSups[sup] !== undefined ? openSups[sup] : idx === 0;

  // Grouper par superviseur
  const parSuperviseur = {};
  liste.forEach(item => {
    if (!parSuperviseur[item.superviseur]) parSuperviseur[item.superviseur] = [];
    parSuperviseur[item.superviseur].push(item);
  });
  const supKeys = Object.keys(parSuperviseur).sort();

  if (!liste.length) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#8a8a9a' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>📭</div>
      <p style={{ fontWeight:600, fontSize:15 }}>Aucun appel d'évaluation en attente</p>
      <p style={{ fontSize:13, marginTop:8 }}>Votre responsable n'a pas encore lancé le processus d'évaluation ce mois.</p>
    </div>
  );

  return (
    <div>
      {/* En-tête */}
      <div style={{ background:'linear-gradient(135deg,rgba(55,66,250,0.12),rgba(55,66,250,0.04))', border:'1px solid rgba(55,66,250,0.3)', borderRadius:14, padding:'16px 20px', marginBottom:20 }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:6 }}>📞 Mes appels d'évaluation — {MOIS_NOMS[mois]} {annee}</div>
        <div style={{ display:'flex', gap:20, fontSize:12, color:'#8a8a9a' }}>
          <span>Total: <strong style={{ color:'#fff' }}>{liste.length} appels</strong></span>
          <span style={{ color:'#22c55e' }}>✅ Effectués: {faits.length}</span>
          <span style={{ color:'#ffa502' }}>⏳ Restants: {aFaire.length}</span>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#8a8a9a' }}>
        💡 <strong style={{ color:'#fff' }}>Instructions :</strong> Cliquez sur un superviseur pour voir ses PDVs à appeler.
        3 questions : <strong style={{ color:'#FF6900' }}>Connaissance /10</strong> · <strong style={{ color:'#22c55e' }}>Visite /10</strong> · <strong style={{ color:'#a29bfe' }}>Note /10</strong>
      </div>

      {/* Accordéons par superviseur */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {supKeys.map((sup) => {
          const supItems = parSuperviseur[sup];
          const isOpen = isSupOpen(sup, supKeys.indexOf(sup));
          const nbFaits = supItems.filter(i => i.statut_appel).length;
          const allDone = nbFaits === supItems.length;
          return (
            <div key={sup} style={{ background:'rgba(255,255,255,0.02)', border:`2px solid ${allDone?'rgba(34,197,94,0.3)':'rgba(255,105,0,0.2)'}`, borderRadius:12, overflow:'hidden' }}>
              {/* Header accordéon */}
              <button onClick={() => setOpenSups(s => ({ ...s, [sup]: !isOpen }))}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px',
                  background: isOpen ? 'rgba(255,105,0,0.08)' : 'transparent',
                  border:'none', cursor:'pointer', color:'#fff', textAlign:'left' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:22 }}>{allDone ? '✅' : '👔'}</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color: allDone?'#22c55e':'#FF6900' }}>{sup}</div>
                    <div style={{ fontSize:11, color:'#8a8a9a', marginTop:2 }}>
                      <span style={{ color:'#22c55e' }}>{nbFaits}</span>/{supItems.length} appels effectués
                      {!allDone && <span style={{ color:'#ffa502', marginLeft:8 }}>· {supItems.length-nbFaits} restants</span>}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize:16, color:'#FF6900', transition:'transform 0.2s', display:'block', transform: isOpen?'rotate(0deg)':'rotate(-90deg)' }}>▼</span>
              </button>

              {/* PDVs */}
              {isOpen && (
                <div style={{ padding:'8px 14px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                  {supItems.map((item, i) => {
                    const pdv = item.pdv;
                    const statut = item.statut_appel;
                    const callKey = `${sup}-${i}`;
                    const isActive = appelEnCours === callKey;
                    return (
                      <div key={i} style={{ background: statut?(statut==='JOIGNABLE'?'rgba(34,197,94,0.06)':'rgba(255,71,87,0.06)'):'rgba(255,255,255,0.02)',
                        border:`1px solid ${statut?(statut==='JOIGNABLE'?'rgba(34,197,94,0.3)':'rgba(255,71,87,0.3)'):'rgba(255,255,255,0.07)'}`,
                        borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom: isActive?12:0 }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', background:statut?(statut==='JOIGNABLE'?'#22c55e':'#ff4757'):'#3742fa', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:12, flexShrink:0 }}>{i+1}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:'#fff', marginBottom:4 }}>{pdv.nom || pdv.numero_pdv}</div>
                            <div style={{ display:'flex', gap:10, flexWrap:'wrap', fontSize:11, color:'#8a8a9a' }}>
                              <span>🟠 Flotte: <strong style={{ color:'#FF6900' }}>{pdv.numero_flotte || pdv.telephone || '—'}</strong></span>
                              {pdv.numero_personnel && <span>📱 Personnel: <strong style={{ color:'#ffa502' }}>{pdv.numero_personnel}</strong></span>}
                              <span>📍 {pdv.quartier || pdv.localite || '—'}</span>
                            </div>
                          </div>
                          <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
                            {statut === 'JOIGNABLE' && <span style={{ fontSize:11, fontWeight:700, color:'#22c55e' }}>✅ Noté</span>}
                            {statut === 'INJOIGNABLE' && <span style={{ fontSize:11, fontWeight:700, color:'#ff4757' }}>📵 Injoignable</span>}
                            {statut && (
                              <button onClick={() => setAppelEnCours(isActive ? null : callKey)}
                                style={{ fontSize:10, padding:'3px 10px', borderRadius:6, border:'1px solid rgba(255,165,2,0.4)', background:'rgba(255,165,2,0.08)', color:'#ffa502', cursor:'pointer', fontWeight:700 }}>
                                ✏️ Modifier
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 3 questions : affichées si pas encore noté OU si en cours de modification */}
                        {(statut !== 'JOIGNABLE' || isActive) && (
                          <div style={{ marginTop:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'12px 14px' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:10 }}>
                              {[
                                { key:'note_connaissance', label:'1. Connaissance superviseur', sub:'Demandez le nom du superviseur', color:'#FF6900' },
                                { key:'note_visite', label:'2. Visite effectuée', sub:'A-t-il visité ? Dernière date', color:'#22c55e' },
                                { key:'note_superviseur', label:'3. Note au superviseur', sub:'Note /10 donnée par le PDV', color:'#a29bfe' },
                              ].map(q => (
                                <div key={q.key}>
                                  <label style={{ fontSize:10, color:q.color, display:'block', marginBottom:4, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>{q.label}</label>
                                  <p style={{ fontSize:9, color:'#64748b', marginBottom:5 }}>{q.sub}</p>
                                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <input type="number" min="0" max="10" step="0.5"
                                      value={appelEnCours === callKey ? notes[q.key] : (statut==='JOIGNABLE'?(item.notes?.[q.key]||''):'') }
                                      onChange={e => { if(appelEnCours!==callKey) setAppelEnCours(callKey); setNotes(n => ({ ...n, [q.key]:e.target.value })); }}
                                      placeholder="—"
                                      style={{ flex:1, padding:'8px 6px', background:'rgba(255,255,255,0.05)', border:`2px solid ${appelEnCours===callKey&&notes[q.key]?q.color:'rgba(255,255,255,0.1)'}`, borderRadius:8, color:'#fff', fontSize:18, fontWeight:900, textAlign:'center', boxSizing:'border-box' }}/>
                                    <span style={{ fontSize:12, color:'#64748b' }}>/10</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <input value={appelEnCours===callKey ? notes.commentaire : ''} onChange={e => { if(appelEnCours!==callKey) setAppelEnCours(callKey); setNotes(n => ({ ...n, commentaire:e.target.value })); }}
                              placeholder="Commentaire (optionnel)..."
                              style={{ width:'100%', padding:'7px 10px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:7, color:'#fff', fontSize:11, boxSizing:'border-box', marginBottom:10 }}/>
                            <div style={{ display:'flex', gap:8 }}>
                              <button
                                disabled={mutation.isLoading}
                                onClick={() => mutation.mutate({ superviseur: item.superviseur, payload: { numero_pdv: pdv.numero_pdv, statut:'INJOIGNABLE' } })}
                                style={{ padding:'7px 14px', borderRadius:8, border:'1px solid rgba(255,71,87,0.3)', background:'rgba(255,71,87,0.1)', color:'#ff4757', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                                📵 Injoignable
                              </button>
                              <button
                                disabled={!notes.note_connaissance||!notes.note_visite||!notes.note_superviseur||mutation.isLoading||appelEnCours!==callKey}
                                onClick={() => mutation.mutate({ superviseur: item.superviseur, payload: { numero_pdv: pdv.numero_pdv, statut:'JOIGNABLE', note_connaissance:parseFloat(notes.note_connaissance), note_visite:parseFloat(notes.note_visite), note_superviseur:parseFloat(notes.note_superviseur), commentaire:notes.commentaire||null } })}
                                style={{ flex:1, padding:'7px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#22c55e,#16a34a)', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', opacity:(!notes.note_connaissance||!notes.note_visite||!notes.note_superviseur||appelEnCours!==callKey)?0.4:1 }}>
                                {mutation.isLoading?'⏳...':'✅ Enregistrer les notes'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EvalSuperveursPage() {
  const qc = useQueryClient();
  const [selectedSup, setSelectedSup] = useState('');
  const [annee, setAnnee] = useState(evalAnnee);
  const [mois, setMois] = useState(evalMois);
  const [showWaModal, setShowWaModal] = useState(false);
  const [waTel, setWaTel] = useState('223');
  const [publiant, setPubliant] = useState(false);
  const [publiantTous, setPubliantTous] = useState(false);
  const [calculantTous, setCalculantTous] = useState(false);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [calcDejaFait, setCalcDejaFait] = useState(false);

  const calculerTous = async () => {
    setShowCalcModal(false);
    setCalculantTous(true);
    try {
      const resp = await api.post('/eval-superviseurs/calculer-tous', null, { params: { annee, mois } });
      const { calcules, erreurs, resultats } = resp.data;
      qc.invalidateQueries(['eval-classement']);
      qc.invalidateQueries(['eval-classement-zone']);
      setCalcResult({ calcules, erreurs, resultats });
      setActiveTab('classement');
    } catch (e) {
      alert('Erreur lors du calcul. Vérifiez que les données sont bien saisies.');
    } finally { setCalculantTous(false); }
  };

  const { data: userMe } = useQuery('me', () => api.get('/auth/me').then(r => r.data), { staleTime: 300000 });
  const userRole = (userMe?.role || '').toLowerCase().replace('userrole.','');
  const isAdmin = ['admin','manager','rc'].includes(userRole);

  const publierClassementTous = async () => {
    setPubliantTous(true);
    try {
      const resp = await api.get('/eval-superviseurs/classement-global', { params: { annee, mois } });
      const apiData = resp.data || {};
      // La route retourne { classement: [...valides], non_valides: [...], total, total_non_valides }
      const valides = apiData.classement || [];
      const nonValides = apiData.non_valides || [];
      const tous = [...valides, ...nonValides].sort((a, b) => (b.score_final||0) - (a.score_final||0));
      if (!tous.length) {
        alert("Aucun superviseur n'a encore de score calculé pour ce mois.");
        setPubliantTous(false);
        return;
      }
      const MOIS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const podium = ['🥇','🥈','🥉'];
      const mentionColor = score => score >= 80 ? '#16a34a' : score >= 65 ? '#d97706' : '#dc2626';
      const valideSet = new Set(valides.map(v => v.superviseur));
      const fmtK = v => v != null ? new Intl.NumberFormat('fr-FR').format(Math.round(v)) : '—';
      const fmtPct = v => v != null ? v.toFixed(1)+'%' : '—';

      const lignes = tous.map((s, i) => {
        const isVal = valideSet.has(s.superviseur);
        const rang = i < 3 ? podium[i] : '<b style="color:#6b7280">'+(i+1)+'</b>';
        const bg = i < 3 && isVal ? ['#fffbeb','#f0fdf4','#eff6ff'][i] : i%2===0?'#fff':'#f9fafb';
        const statutBadge = isVal
          ? '<span style="background:#dcfce7;color:#16a34a;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700">✅ Validé</span>'
          : '<span style="background:#fee2e2;color:#dc2626;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700">❌ Non validé</span>';
        const raisons = (s.raisons_rejet||[]).join(' | ') || '—';
        return '<tr style="background:'+bg+'">'
          +'<td style="padding:7px 5px;font-size:'+(i<3?'16':'12')+'px;text-align:center">'+rang+'</td>'
          +'<td style="padding:7px 5px;font-weight:700;font-size:12px;color:#111827">'+s.superviseur+'</td>'
          +'<td style="padding:7px 5px;text-align:center">'+statutBadge+'</td>'
          +'<td style="padding:7px 5px;text-align:center;font-size:14px;font-weight:900;color:'+mentionColor(s.score_final||0)+'">'+s.score_final+'</td>'
          +'<td style="padding:7px 5px;text-align:center;font-size:10px;color:#6b7280">'+(s.mention||'—')+'</td>'
          +'<td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:'+((s.nb_pdv||0)>=30?'#16a34a':'#dc2626')+'">'+(s.nb_pdv||'—')+'</td>'
          +'<td style="padding:7px 5px;text-align:right;font-size:10px;white-space:nowrap">'+fmtK(s.ca_omy)+'</td>'
          +'<td style="padding:7px 5px;text-align:right;font-size:10px;white-space:nowrap">'+fmtK(s.commission)+'</td>'
          +'<td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:'+((s.actif_omy||0)>=90?'#16a34a':'#dc2626')+'">'+fmtPct(s.actif_omy)+'</td>'
          +'<td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:'+((s.taux_km||0)>=80?'#16a34a':'#dc2626')+'">'+fmtPct(s.taux_km)+'</td>'
          +'<td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:'+((s.taux_nafama||0)>=80?'#16a34a':'#dc2626')+'">'+fmtPct(s.taux_nafama)+'</td>'
          +'<td style="padding:7px 5px;text-align:right;font-size:10px;white-space:nowrap">'+fmtK(s.ca_nafama)+'</td>'
          +'<td style="padding:7px 5px;font-size:9px;color:#dc2626;max-width:160px">'+(!isVal ? raisons : '')+'</td>'
          +'</tr>';
      }).join('');

      const nbValides = valides.length;
      const moy = Math.round(tous.reduce((acc, e) => acc + (e.score_final||0), 0) / tous.length);
      const best = tous[0];

      const html = `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Classement Evaluations - ${MOIS[mois]} ${annee}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#111827;min-height:100vh}
        @media print{
          .no-print{display:none!important}
          body{background:#fff;font-size:9px}
          @page{size:A4 landscape;margin:8mm}
          table{font-size:8px!important;width:100%!important}
          th,td{padding:3px 2px!important}
        }
        .header{background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:36px 48px;text-align:center}
        .header h1{font-size:13px;opacity:.8;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px}
        .header h2{font-size:38px;font-weight:900;margin-bottom:10px}
        .header .sub{font-size:15px;opacity:.85}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:28px 48px}
        .stat-card{background:#fff;border-radius:16px;padding:20px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.07);border-top:4px solid}
        .stat-card .val{font-size:32px;font-weight:900;margin-bottom:6px}
        .stat-card .label{font-size:13px;color:#6b7280;font-weight:600}
        .table-wrap{margin:0 20px 40px;background:#fff;border-radius:16px;overflow-x:auto;box-shadow:0 2px 12px rgba(0,0,0,.07)}
        .table-title{padding:18px 24px;font-size:15px;font-weight:800;color:#111827;border-bottom:1px solid #f3f4f6}
        table{width:100%;border-collapse:collapse}
        th{background:#f9fafb;padding:10px 8px;text-align:left;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
        tr{border-bottom:1px solid #f3f4f6}
        tr:last-child{border-bottom:none}
        .footer{text-align:center;padding:24px;color:#9ca3af;font-size:12px}
        .print-btn{position:fixed;top:20px;right:20px;padding:10px 24px;background:#f59e0b;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(245,158,11,.4)}
      </style></head><body>
      <button class="no-print print-btn" onclick="window.print()">Imprimer / PDF</button>
      <div class="header">
        <h1>Classement des Evaluations - Farouk Distribution</h1>
        <h2>${MOIS[mois].toUpperCase()} ${annee}</h2>
        <div class="sub">${tous.length} superviseur${tous.length > 1 ? 's' : ''} evalues · ${nbValides} valide${nbValides > 1 ? 's' : ''}</div>
      </div>
      <div class="stats">
        <div class="stat-card" style="border-color:#64748b"><div class="val" style="color:#64748b">${tous.length}</div><div class="label">Total evalues</div></div>
        <div class="stat-card" style="border-color:#16a34a"><div class="val" style="color:#16a34a">${nbValides}</div><div class="label">Valides</div></div>
        <div class="stat-card" style="border-color:#f59e0b"><div class="val" style="color:#f59e0b">${moy}</div><div class="label">Score moyen /100</div></div>
        <div class="stat-card" style="border-color:#6366f1"><div class="val" style="color:#6366f1">${best?.score_final || '—'}</div><div class="label">Meilleur score — ${best?.superviseur?.split(' ')[0] || '—'}</div></div>
      </div>
      <div class="table-wrap">
        <div class="table-title">Classement complet — Tous superviseurs evalues</div>
        <table>
          <thead><tr>
            <th style="text-align:center">Rang</th>
            <th>Superviseur</th>
            <th style="text-align:center">Statut</th>
            <th style="text-align:center">Score</th>
            <th style="text-align:center">Mention</th>
            <th style="text-align:center">NB PDV</th>
            <th style="text-align:right">CA OMY</th>
            <th style="text-align:right">Commission</th>
            <th style="text-align:center">Actif OMY</th>
            <th style="text-align:center">KM%</th>
            <th style="text-align:center">NAFAMA%</th>
            <th style="text-align:right">CA NAFAMA</th>
            <th>Raisons non-validation</th>
          </tr></thead>
          <tbody>${lignes}</tbody>
        </table>
      </div>
      <div class="footer">Rapport genere le ${new Date().toLocaleDateString('fr-FR')} · Farouk Distribution</div>
      </body></html>`;

      const w = window.open('', '_blank', 'width=1200,height=800');
      w.document.write(html);
      w.document.close();
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la generation du classement.');
    } finally { setPubliantTous(false); }
  };

    const publierClassement = async () => {
    setPubliant(true);
    try {
      const resp = await api.get('/eval-superviseurs/classement-global', { params: { annee, mois } });
      const data = resp.data;
      if (!data.classement?.length) {
        const msg = data.total_non_valides > 0
          ? `Aucun superviseur n'a validé tous les critères.\n\n${data.total_non_valides} superviseur(s) ont un score calculé mais n'ont pas atteint tous les objectifs (NB PDV ≥ 30, Actif OMY ≥ 90%, CA OMY, Commission, KM, NAFAMA).`
          : 'Aucun superviseur n\'a encore complété son évaluation.';
        alert(msg);
        setPubliant(false);
        return;
      }

      const MOIS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const podium = ['🥇','🥈','🥉'];
      const mentionColor = s => s >= 80 ? '#16a34a' : s >= 65 ? '#d97706' : '#dc2626';

      const fmtK = v => v ? new Intl.NumberFormat('fr-FR').format(Math.round(v)) : '—';
      const lignes = data.classement.map((s, i) => `
        <tr style="background:${i < 3 ? ['#fffbeb','#f0fdf4','#eff6ff'][i] : i%2===0?'#fff':'#f9fafb'}">
          <td style="padding:7px 5px;font-size:${i < 3 ? 16 : 12}px;text-align:center">${i < 3 ? podium[i] : `<b style="color:#6b7280">${s.rang}</b>`}</td>
          <td style="padding:7px 5px;font-weight:700;font-size:11px;color:#111827">${s.superviseur}</td>
          <td style="padding:7px 5px;text-align:center;font-size:13px;font-weight:900;color:${mentionColor(s.score_final)}">${s.score_final}</td>
          <td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:${(s.nb_pdv||0)>=30?'#16a34a':'#dc2626'}">${s.nb_pdv||'—'}</td>
          <td style="padding:7px 5px;text-align:right;font-size:10px;white-space:nowrap">${fmtK(s.ca_omy)}</td>
          <td style="padding:7px 5px;text-align:right;font-size:10px;white-space:nowrap">${fmtK(s.commission)}</td>
          <td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:${(s.actif_omy||0)>=90?'#16a34a':'#dc2626'}">${s.actif_omy ? s.actif_omy.toFixed(1)+'%' : '—'}</td>
          <td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:${(s.taux_km||0)>=80?'#16a34a':'#dc2626'}">${s.taux_km ? s.taux_km.toFixed(1)+'%' : '—'}</td>
          <td style="padding:7px 5px;text-align:center;font-size:11px;font-weight:700;color:${(s.taux_nafama||0)>=80?'#16a34a':'#dc2626'}">${s.taux_nafama ? s.taux_nafama.toFixed(1)+'%' : '—'}</td>
          <td style="padding:7px 5px;text-align:right;font-size:10px;white-space:nowrap">${fmtK(s.ca_nafama)}</td>
        </tr>`).join('');

      const moy = Math.round(data.classement.reduce((s, e) => s + e.score_final, 0) / data.classement.length);
      const best = data.classement[0];
      const worst = data.classement[data.classement.length - 1];

      const html = `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Classement Évaluation — ${MOIS[mois]} ${annee}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#111827;min-height:100vh}
        @media print{
          .no-print{display:none!important}
          body{background:#fff;font-size:9px}
          @page{size:A4 portrait;margin:8mm}
          .header{padding:16px 20px!important}
          .header h2{font-size:24px!important}
          .stats{margin:12px 8px!important;gap:8px!important}
          .stat-card{padding:10px!important}
          .stat-card .val{font-size:22px!important}
          .table-wrap{margin:0 8px 16px!important}
          .table-title{padding:10px 12px!important;font-size:11px!important}
          table{font-size:8px!important;width:100%!important}
          th,td{padding:4px 3px!important}
          .footer{padding:8px!important;font-size:9px!important}
        }
        .header{background:linear-gradient(135deg,#FF6900,#ff9500);color:#fff;padding:40px 48px;text-align:center}
        .header h1{font-size:14px;opacity:.8;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px}
        .header h2{font-size:42px;font-weight:900;margin-bottom:12px}
        .header .sub{font-size:15px;opacity:.85}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:32px 48px}
        .stat-card{background:#fff;border-radius:16px;padding:24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.07);border-top:4px solid}
        .stat-card .val{font-size:36px;font-weight:900;margin-bottom:6px}
        .stat-card .label{font-size:13px;color:#6b7280;font-weight:600}
        .table-wrap{margin:0 20px 48px;background:#fff;border-radius:16px;overflow-x:auto;box-shadow:0 2px 12px rgba(0,0,0,.07)}
        .table-wrap table{min-width:100%;white-space:nowrap}
        .table-title{padding:20px 24px;font-size:16px;font-weight:800;color:#111827;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:10px}
        table{width:100%;border-collapse:collapse}
        th{background:#f9fafb;padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
        tr{border-bottom:1px solid #f3f4f6}
        tr:last-child{border-bottom:none}
        .footer{text-align:center;padding:24px;color:#9ca3af;font-size:12px}
        .print-btn{position:fixed;top:20px;right:20px;padding:10px 24px;background:#FF6900;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(255,105,0,.4)}
      </style></head><body>
      <button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
      <div class="header">
        <h1>🏆 Classement des Évaluations — Farouk Distribution</h1>
        <h2>${MOIS[mois].toUpperCase()} ${annee}</h2>
        <div class="sub">${data.total} superviseur${data.total > 1 ? 's' : ''} qualifié${data.total > 1 ? 's' : ''} · Résultats officiels</div>
        <div style="margin-top:8px;font-size:12px;opacity:0.75">Critères : NB PDV ≥ 30 · Actif OMY ≥ 90% · CA OMY ✓ · Commission ✓ · KM ✓ · NAFAMA ✓${data.total_non_valides > 0 ? ` · ${data.total_non_valides} superviseur(s) non qualifié(s)` : ''}</div>
      </div>
      <div class="stats">
        <div class="stat-card" style="border-color:#64748b">
          <div class="val" style="color:#64748b">${data.total + (data.total_non_valides || 0)}</div>
          <div class="label">Total évalués</div>
        </div>
        <div class="stat-card" style="border-color:#FF6900">
          <div class="val" style="color:#FF6900">${data.total}</div>
          <div class="label">✅ Qualifiés</div>
        </div>
        <div class="stat-card" style="border-color:#16a34a">
          <div class="val" style="color:#16a34a">${moy}</div>
          <div class="label">Score moyen /100</div>
        </div>
        <div class="stat-card" style="border-color:#6366f1">
          <div class="val" style="color:#6366f1">${best?.score_final || '—'}</div>
          <div class="label">Meilleur score — ${best?.superviseur?.split(' ')[0] || '—'}</div>
        </div>
      </div>
      <div class="table-wrap">
        <div class="table-title">📊 Classement complet — KPIs 70% · Appels TC 20% · Présentiel 10%</div>
        <table>
          <thead><tr>
            <th style="text-align:center;padding:8px 6px;font-size:11px">Rang</th>
            <th style="padding:8px 6px;font-size:11px">Superviseur</th>
            <th style="text-align:center;padding:8px 6px;font-size:11px">Score</th>
            <th style="text-align:center;padding:8px 6px;font-size:11px">NB PDV</th>
            <th style="text-align:right;padding:8px 6px;font-size:11px">CA OMY</th>
            <th style="text-align:right;padding:8px 6px;font-size:11px">Commission</th>
            <th style="text-align:center;padding:8px 6px;font-size:11px">Actif OMY</th>
            <th style="text-align:center;padding:8px 6px;font-size:11px">KM%</th>
            <th style="text-align:center;padding:8px 6px;font-size:11px">NAFAMA%</th>
            <th style="text-align:right;padding:8px 6px;font-size:11px">CA NAFAMA</th>
          </tr></thead>
          <tbody>${lignes}</tbody>
        </table>
      </div>
      <div class="footer">Rapport généré le ${new Date().toLocaleDateString('fr-FR')} · Farouk Distribution · Système de Gestion Réseau</div>
      </body></html>`;

      // Sauvegarder sur le serveur et obtenir un lien partageable
      const saveResp = await api.post('/rapports/generer-superviseur', {
        html, superviseur: `CLASSEMENT_${MOIS[mois]}_${annee}`,
        mois: MOIS[mois], annee,
      });

      const lien = saveResp.data.url;
      const expire = saveResp.data.expire;

      // Ouvrir la page
      const w = window.open('', '_blank', 'width=1000,height=700');
      w.document.write(html);
      w.document.close();

      // Copier le lien dans le presse-papiers
      if (navigator.clipboard) await navigator.clipboard.writeText(lien);

      alert(`✅ Classement généré !\n\n🔗 Lien copié dans le presse-papiers :\n${lien}\n\n⏱️ Valide jusqu'au ${expire}\n\nCollez ce lien dans votre groupe WhatsApp.`);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la génération du classement.');
    } finally { setPubliant(false); }
  };
  const [activeTab, setActiveTab] = useState('classement'); // classement | evaluation | mystery | presentiel | evolution | zone | commentaires
  const [searchSup, setSearchSup] = useState('');

  // Superviseurs disponibles
  const { data: superviseurs = [] } = useQuery('eval-superviseurs-list', () =>
    api.get('/eval-superviseurs/superviseurs').then(r => r.data), { staleTime: 300000 }
  );

  // Classement
  const { data: classement = [] } = useQuery(['eval-classement', annee, mois], () =>
    api.get(`/eval-superviseurs/classement/tous?annee=${annee}&mois=${mois}`).then(r => r.data), { staleTime: 30000 }
  );

  // Évaluation du superviseur sélectionné
  const { data: evaluation, refetch: refetchEval } = useQuery(
    ['eval-sup', selectedSup, annee, mois],
    () => api.get(`/eval-superviseurs/${encodeURIComponent(selectedSup)}?annee=${annee}&mois=${mois}`).then(r => r.data),
    { enabled: !!selectedSup, retry: false, onError: () => {} }
  );

  // Initialiser l'évaluation
  const initMutation = useMutation(
    () => api.post('/eval-superviseurs/initialiser', { superviseur: selectedSup, annee, mois }).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries(['eval-sup', selectedSup]); refetchEval(); setActiveTab('kpis'); } }
  );

  // Calculer le score final
  const calcMutation = useMutation(
    () => api.post(`/eval-superviseurs/${encodeURIComponent(selectedSup)}/calculer?annee=${annee}&mois=${mois}`).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries(['eval-sup', selectedSup]); qc.invalidateQueries(['eval-classement']); refetchEval(); setActiveTab('resultats'); } }
  );

  // Valider l'évaluation (marquer comme TERMINEE)
  const validateMutation = useMutation(
    () => api.patch(`/eval-superviseurs/${encodeURIComponent(selectedSup)}/valider?annee=${annee}&mois=${mois}`).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries(['eval-sup', selectedSup]); qc.invalidateQueries(['eval-classement']); refetchEval(); } }
  );

  // Détection rôle TC — APRÈS tous les hooks
  const userAuth = useAuthStore(s => s.user);
  const roleUser = (userAuth?.role || '').toLowerCase().replace('userrole.', '');
  const isTelec = roleUser === 'teleconseillere';

  const supsFiltres = superviseurs.filter(s => s !== '#VALUE!' && (!searchSup || s.toLowerCase().includes(searchSup.toLowerCase())));

  const tabs = [
    { id: 'classement', label: '🏆 Classement' },
    { id: 'zone', label: '🗺️ Par Zone' },
    { id: 'liste', label: '📋 Liste des superviseurs' },
    ...(selectedSup ? [
      { id: 'kpis', label: '📊 KPIs Auto' },
      { id: 'mystery', label: '📞 Appel des Téléconseillères' },
      { id: 'presentiel', label: '🏢 Présentiel' },
      { id: 'resultats', label: '🎯 Résultats' },
      { id: 'evolution', label: '📈 Évolution' },
      { id: 'plan_action', label: '🎯 Plan d\'Action' },
      { id: 'badges', label: '🏅 Badges' },
      { id: 'commentaires', label: '💬 Commentaires' },
    ] : []),
  ];

  // Vue TC : doit être APRÈS tous les hooks
  if (isTelec) {
    return (
      <div className="page">
        <div className="page-header" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="page-title">📋 Mes Appels Évaluation</h1>
            <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
              Période : <strong style={{ color: '#FF6900' }}>{MOIS_NOMS[mois]} {annee}</strong> · Appelez les PDVs assignés et renseignez les notes
            </p>
          </div>
        </div>
        <VueTeleconseillere annee={annee} mois={mois} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">🎯 Évaluation Superviseurs</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            KPIs 70% · Appel des Téléconseillères 20% · Présentiel 10%
          </p>
          {/* Bouton Publier Classement */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={async () => {
                // Vérifier si des scores existent déjà pour ce mois
                try {
                  const resp = await api.get('/eval-superviseurs/classement-global', { params: { annee, mois } });
                  const dejaCalcules = (resp.data.classement || []).filter(s => s.score_final != null).length;
                  setCalcDejaFait(dejaCalcules > 0);
                  setCalcResult(null);
                } catch { setCalcDejaFait(false); }
                setShowCalcModal(true);
              }} disabled={calculantTous}
                style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: calculantTous ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: calculantTous ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.35)', whiteSpace: 'nowrap' }}>
                {calculantTous ? '⏳ Calcul en cours...' : '⚡ Calculer tous les scores'}
              </button>
              <button onClick={publierClassementTous} disabled={publiantTous}
                style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: publiantTous ? 'rgba(245,158,11,0.4)' : 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: publiantTous ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.35)', whiteSpace: 'nowrap' }}>
                {publiantTous ? '⏳ Génération...' : '📊 Publier le classement'}
              </button>
              <button onClick={publierClassement} disabled={publiant}
                style={{ padding: '10px 18px', borderRadius: 12, border: 'none', background: publiant ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: publiant ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.35)', whiteSpace: 'nowrap' }}>
                {publiant ? '⏳ Diffusion en cours...' : '📨 Diffuser les résultats validés'}
              </button>
            </div>
          )}
          {/* Sélecteur de période — design pill sur une ligne */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, marginTop: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,105,0,0.25)', borderRadius: 12, overflow: 'hidden' }}>
            <span style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#FF6900', borderRight: '1px solid rgba(255,105,0,0.2)', whiteSpace: 'nowrap', letterSpacing: 0.5 }}>📅 Période</span>
            <select value={mois} onChange={e => { setMois(parseInt(e.target.value)); setActiveTab('classement'); qc.invalidateQueries(['eval-classement']); qc.invalidateQueries(['eval-sup']); }}
              style={{ padding: '8px 14px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,105,0,0.2)', color: '#e2e8f0', fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none', appearance: 'none', minWidth: 110 }}>
              {MOIS_NOMS.slice(1).map((m, i) => <option key={i+1} value={i+1} style={{ background: '#1e2236' }}>{m}</option>)}
            </select>
            <select value={annee} onChange={e => { setAnnee(parseInt(e.target.value)); setActiveTab('classement'); qc.invalidateQueries(['eval-classement']); qc.invalidateQueries(['eval-sup']); }}
              style={{ padding: '8px 14px', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none', appearance: 'none', minWidth: 70 }}>
              {[2025, 2026, 2027].map(y => <option key={y} value={y} style={{ background: '#1e2236' }}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <button onClick={() => {
            if (!window.confirm(`Lancer l'évaluation pour TOUS les superviseurs en ${MOIS_NOMS[mois]} ${annee} ?\nLes TC recevront automatiquement leurs listes de PDVs à appeler.`)) return;
            api.post('/eval-superviseurs/lancer-tous', { annee, mois })
              .then(r => {
                alert(`✅ Évaluation lancée pour ${r.data.nb_evalues} superviseurs !\nLes TC ont reçu leurs listes d'appels.`);
                qc.invalidateQueries(['eval-classement']);
                qc.invalidateQueries(['eval-superviseurs-list']);
              })
              .catch(e => alert('Erreur: ' + e.message));
          }}
            style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,105,0,0.35)' }}>
            🚀 Lancer l'évaluation pour tous les superviseurs
          </button>
          <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>
            J-1 : Lance l'éval + notifie les TC automatiquement
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>

        {/* ── Panneau gauche : liste superviseurs ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px', height: 'fit-content' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8a9a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            👔 {superviseurs.filter(s => s !== '#VALUE!').length} Superviseurs
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8a8a9a', fontSize: 12 }}>🔍</span>
            <input type="text" placeholder="Rechercher..." value={searchSup} onChange={e => setSearchSup(e.target.value)}
              style={{ width: '100%', padding: '7px 10px 7px 28px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflowY: 'auto' }}>
            {supsFiltres.map((sup, i) => {
              const evalSup = classement.find(c => c.superviseur === sup);
              const isSelected = selectedSup === sup;
              return (
                <button key={i} onClick={() => { setSelectedSup(sup); setActiveTab('kpis'); }}
                  style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${isSelected ? '#FF6900' : 'transparent'}`,
                    background: isSelected ? 'rgba(255,105,0,0.12)' : 'transparent', color: isSelected ? '#FF6900' : '#ccc',
                    cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: isSelected ? 700 : 400, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{sup}</span>
                  {evalSup?.score_final != null && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: evalSup.score_final >= 75 ? '#22c55e' : evalSup.score_final >= 50 ? '#ffa502' : '#ff4757' }}>
                      {Math.round(evalSup.score_final)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Contenu principal ── */}
        <div>
          {/* Onglets — deux lignes si nécessaire, bien espacés */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.2s',
                  background: activeTab === t.id ? 'linear-gradient(135deg,#FF6900,#ff9500)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === t.id ? '#fff' : '#8a8a9a',
                  boxShadow: activeTab === t.id ? '0 4px 14px rgba(255,105,0,0.35)' : 'none',
                  border: activeTab === t.id ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  letterSpacing: 0.3,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Classement ── */}
          {activeTab === 'classement' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>🏆 Classement — {MOIS_NOMS[mois]} {annee}</h3>
              {classement.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8a8a9a' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>Aucune évaluation finalisée pour ce mois</p>
                  <p style={{ fontSize: 13, marginTop: 8 }}>Sélectionnez un superviseur à gauche pour commencer une évaluation.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {classement.map((c, i) => {
                    const medalColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#64748b';
                    const scoreColor = c.score_final >= 90 ? '#22c55e' : c.score_final >= 75 ? '#ffa502' : c.score_final >= 60 ? '#FF6900' : c.score_final >= 50 ? '#a29bfe' : '#ff4757';
                    return (
                      <div key={i} onClick={() => { setSelectedSup(c.superviseur); setActiveTab('resultats'); }}
                        style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.2s' }}>
                        <div style={{ fontSize: i < 3 ? 28 : 16, fontWeight: 900, color: medalColor, minWidth: 36 }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.superviseur}</div>
                          <div style={{ fontSize: 11, color: '#8a8a9a', marginTop: 2 }}>
                            KPIs: {Math.round(c.score_kpi || 0)} · Mystery: {Math.round(c.score_mystery || 0)} · Présentiel: {Math.round(c.score_presentiel || 0)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor }}>{Math.round(c.score_final)}</div>
                          <div style={{ fontSize: 11, color: '#8a8a9a' }}>{c.mention}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Pas de superviseur sélectionné ── */}
          {activeTab !== 'classement' && !selectedSup && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8a8a9a' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👔</div>
              <p style={{ fontWeight: 600 }}>Sélectionnez un superviseur</p>
            </div>
          )}

          {/* ── KPIs ── */}
          {activeTab === 'kpis' && selectedSup && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>
                  📊 Évaluation : <span style={{ color: '#FF6900' }}>{selectedSup}</span>
                </h2>
                {evaluation?.kpis_data && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                    {evaluation.kpis_data.zone && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(55,66,250,0.15)', color: '#5f6cf5' }}>📍 {evaluation.kpis_data.zone}</span>}
                    {(evaluation.kpis_data.sous_zones||[]).map((sz,i) => <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,165,2,0.12)', color: '#ffa502' }}>🗺️ {sz}</span>)}
                    {(evaluation.kpis_data.types_pdv||[]).map((t,i) => <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,214,143,0.12)', color: '#00d68f' }}>{t}</span>)}
                  </div>
                )}
              </div>
                {!evaluation ? (
                  <button onClick={() => initMutation.mutate()} disabled={initMutation.isLoading}
                    style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    {initMutation.isLoading ? '⏳ Initialisation...' : '🚀 Démarrer l\'évaluation'}
                  </button>
                ) : (
                  <button onClick={() => initMutation.mutate()} disabled={initMutation.isLoading}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,105,0,0.3)', background: 'rgba(255,105,0,0.1)', color: '#FF6900', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    🔄 Réinitialiser
                  </button>
                )}
              </div>
              {evaluation?.kpis_data ? (
                <KPIsSection kpis={evaluation.kpis_data} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#8a8a9a' }}>
                  <p>Cliquez sur "Démarrer l'évaluation" pour charger les KPIs</p>
                </div>
              )}
            </div>
          )}

          {/* ── Appel TCs ── */}
          {activeTab === 'mystery' && selectedSup && evaluation && (
            <MysterySection evaluation={evaluation} superviseur={selectedSup} annee={annee} mois={mois} onRefresh={refetchEval} />
          )}

          {/* ── Présentiel ── */}
          {activeTab === 'presentiel' && selectedSup && evaluation && (
            <PresentielSection evaluation={evaluation} superviseur={selectedSup} annee={annee} mois={mois} onRefresh={refetchEval} />
          )}

          {/* ── Résultats ── */}
          {activeTab === 'resultats' && selectedSup && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>🎯 Résultats — {selectedSup}</h3>
              {!evaluation ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#8a8a9a' }}>Aucune évaluation en cours. Démarrez d'abord depuis l'onglet KPIs.</div>
              ) : (
                <>
                  {/* Score final */}
                  <div style={{ background: evaluation.score_final ? `rgba(${evaluation.score_final >= 75 ? '34,197,94' : evaluation.score_final >= 50 ? '255,165,2' : '255,71,87'},0.08)` : 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '24px', marginBottom: 20, textAlign: 'center' }}>
                    {evaluation.score_final ? (
                      <>
                        <div style={{ fontSize: 60, fontWeight: 900, color: evaluation.score_final >= 75 ? '#22c55e' : evaluation.score_final >= 50 ? '#ffa502' : '#ff4757' }}>
                          {Math.round(evaluation.score_final)}
                        </div>
                        <div style={{ fontSize: 20, color: '#8a8a9a', marginBottom: 8 }}>/100</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{evaluation.mention}</div>
                      </>
                    ) : (
                      <div style={{ color: '#8a8a9a', fontSize: 14 }}>Score non encore calculé</div>
                    )}
                  </div>

                  {/* Détail par composante */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                    {[
                      { label: '📊 KPIs (70%)', score: evaluation.score_kpi, poids: 70, color: '#3742fa' },
                      { label: '📞 Appel des Téléconseillères (20%)', score: evaluation.score_mystery, poids: 20, color: '#22c55e' },
                      { label: '🏢 Présentiel (10%)', score: evaluation.score_presentiel, poids: 10, color: '#FF6900' },
                    ].map((comp, i) => (
                      <div key={i} style={{ padding: '16px', background: `rgba(${comp.color === '#3742fa' ? '55,66,250' : comp.color === '#22c55e' ? '34,197,94' : '255,105,0'},0.08)`, border: `1px solid ${comp.color}25`, borderRadius: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: '#8a8a9a', marginBottom: 8 }}>{comp.label}</div>
                        <ScoreBadge score={comp.score} size="lg" />
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>Contribution: {comp.score ? Math.round(comp.score * comp.poids / 100) : 0} pts</div>
                      </div>
                    ))}
                  </div>

                  {/* PDV qui retardent le superviseur */}
                  {evaluation.mystery_calls && evaluation.mystery_calls.length > 0 && (() => {
                    const pdvsEnRetard = evaluation.mystery_calls.filter(c =>
                      c.statut === 'INJOIGNABLE' ||
                      (c.note_connaissance != null && c.note_connaissance < 5) ||
                      (c.note_visite != null && c.note_visite < 5)
                    );
                    if (!pdvsEnRetard.length) return null;
                    return (
                      <div style={{ margin: '20px 0', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 14, padding: 20 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#ff4757', marginBottom: 14 }}>
                          ⚠️ PDV qui impactent négativement le score ({pdvsEnRetard.length} PDV)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {pdvsEnRetard.map((c, i) => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 16px', borderLeft: '3px solid #ff4757' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{c.pdv_nom || c.pdv_numero}</div>
                                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.pdv_numero} · {c.quartier || c.localite || '—'}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {c.statut === 'INJOIGNABLE' && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,71,87,0.15)', color: '#ff4757', fontWeight: 700 }}>📵 Injoignable</span>}
                                  {c.note_connaissance != null && c.note_connaissance < 5 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,165,2,0.15)', color: '#ffa502', fontWeight: 700 }}>📚 Connaissance faible ({c.note_connaissance}/10)</span>}
                                  {c.note_visite != null && c.note_visite < 5 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,165,2,0.15)', color: '#ffa502', fontWeight: 700 }}>🏃 Visite insuffisante ({c.note_visite}/10)</span>}
                                  {c.note_superviseur != null && c.note_superviseur < 5 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.15)', color: '#6366f1', fontWeight: 700 }}>👔 Gestion faible ({c.note_superviseur}/10)</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Boutons calculer + exporter PDF */}
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => calcMutation.mutate()} disabled={calcMutation.isLoading}
                      style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,105,0,0.35)' }}>
                      {calcMutation.isLoading ? '⏳ Calcul en cours...' : '🎯 Calculer / Recalculer le Score Final'}
                    </button>
                    {evaluation.score_final && (<>
                      {evaluation.statut !== 'TERMINEE' && (
                        <button onClick={() => validateMutation.mutate()} disabled={validateMutation.isLoading}
                          style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,197,94,0.35)' }}>
                          {validateMutation.isLoading ? '⏳ Validation en cours...' : '✅ Valider l\'évaluation'}
                        </button>
                      )}
                      {evaluation.statut === 'TERMINEE' && (
                        <span style={{ padding: '12px 32px', borderRadius: 12, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 800, fontSize: 15 }}>✅ Validée</span>
                      )}
                      <button onClick={() => exportPDF(evaluation, selectedSup, mois, annee)}
                        style={{ padding: '12px 32px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                        📄 Exporter en PDF
                      </button>
                      <button onClick={() => setShowWaModal(true)}
                        style={{ padding: '12px 32px', borderRadius: 12, border: '1px solid rgba(37,211,102,0.4)', background: 'rgba(37,211,102,0.1)', color: '#25D166', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                        📲 Envoyer sur WhatsApp
                      </button>
                    </>)}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── 📈 ÉVOLUTION ── */}
          {activeTab === 'evolution' && selectedSup && (
            <EvolutionTab superviseur={selectedSup} annee={annee} mois={mois} />
          )}

          {/* ── 🎯 PLAN D'ACTION ── */}
          {activeTab === 'plan_action' && selectedSup && evaluation && (
            <PlanActionTab evaluation={evaluation} superviseur={selectedSup} />
          )}

          {/* ── 🏅 BADGES ── */}
          {activeTab === 'badges' && selectedSup && (
            <BadgesTab superviseur={selectedSup} annee={annee} mois={mois} />
          )}

          {/* ── 💬 COMMENTAIRES ── */}
          {activeTab === 'commentaires' && selectedSup && (
            <CommentairesTab superviseur={selectedSup} annee={annee} mois={mois} />
          )}

          {/* ── 🗺️ PAR ZONE ── */}
          {activeTab === 'zone' && (
            <ParZoneTab annee={annee} mois={mois} />
          )}
          {/* ── 📋 LISTE DES SUPERVISEURS ── */}
          {activeTab === 'liste' && (
            <ListeSupTab annee={annee} mois={mois} classement={classement} />
          )}
        </div>
      </div>

      {/* ── Modal Confirmation Calcul Tous ── */}
      {showCalcModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1a1f36', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '32px', maxWidth: 440, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>⚡</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Calculer tous les scores</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{MOIS_NOMS[mois]} {annee} — Tous les superviseurs</div>
              </div>
            </div>
            {calcDejaFait && (
              <div style={{ background: 'rgba(255,165,2,0.08)', border: '1px solid rgba(255,165,2,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ffa502', marginBottom: 4 }}>⚠️ Calcul déjà effectué pour {MOIS_NOMS[mois]} {annee}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Des scores ont déjà été calculés pour ce mois. Voulez-vous recalculer et écraser les résultats existants ?</div>
              </div>
            )}
            <div style={{ background: calcDejaFait ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.06)', border: `1px solid ${calcDejaFait ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.2)'}`, borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
                {calcDejaFait
                  ? <>Cette action va <strong style={{ color: '#ffa502' }}>recalculer et remplacer</strong> les scores existants de tous les superviseurs pour <strong style={{ color: '#ffa502' }}>{MOIS_NOMS[mois]} {annee}</strong>.</>
                  : <>Cette action va calculer et mettre à jour le <strong style={{ color: '#22c55e' }}>score final</strong> de tous les superviseurs ayant une évaluation pour <strong style={{ color: '#22c55e' }}>{MOIS_NOMS[mois]} {annee}</strong>.</>
                }<br/>Le classement sera automatiquement mis à jour.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowCalcModal(false)}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={calculerTous}
                style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: calcDejaFait ? 'linear-gradient(135deg,#ffa502,#f59e0b)' : 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: calcDejaFait ? '0 4px 16px rgba(255,165,2,0.35)' : '0 4px 16px rgba(34,197,94,0.35)' }}>
                {calcDejaFait ? '🔄 Recalculer quand même' : '⚡ Calculer maintenant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Résultat Calcul Tous ── */}
      {calcResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1a1f36', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '32px', maxWidth: 520, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e' }}>{calcResult.calcules} score{calcResult.calcules > 1 ? 's' : ''} calculé{calcResult.calcules > 1 ? 's' : ''} !</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{MOIS_NOMS[mois]} {annee} {calcResult.erreurs > 0 ? `· ⚠️ ${calcResult.erreurs} erreur(s)` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {calcResult.resultats.sort((a,b) => (b.score||0)-(a.score||0)).map((r, i) => {
                const score = Math.round(r.score || 0);
                const col = score >= 75 ? '#22c55e' : score >= 55 ? '#ffa502' : '#ff4757';
                const podium = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
                return (
                  <div key={r.superviseur} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                    <span style={{ fontSize: i < 3 ? 20 : 13, width: 24 }}>{podium}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{r.superviseur}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{r.mention}</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: col }}>{score}</span>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setCalcResult(null)}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
              ✅ Voir le classement
            </button>
          </div>
        </div>
      )}

      {/* ── Modal WhatsApp élégant ── */}
      {showWaModal && evaluation && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1a1f36', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 20, padding: '32px', maxWidth: 440, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#25D166,#128C7E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📲</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Envoyer via WhatsApp</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Rapport pour <strong style={{ color: '#25D166' }}>{selectedSup}</strong></div>
              </div>
            </div>
            <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>📋 Aperçu du message</div>
              <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.7 }}>
                🎯 Score final : <strong style={{ color: '#25D166' }}>{Math.round(evaluation.score_final || 0)}/100</strong> — {evaluation.mention}<br/>
                📊 KPIs : {Math.round(evaluation.score_kpi || 0)} · TC : {Math.round(evaluation.score_mystery || 0)} · Présentiel : {Math.round(evaluation.score_presentiel || 0)}
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>📱 Numéro WhatsApp</div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 14, fontSize: 18 }}>🇲🇱</span>
                <input
                  type="tel" value={waTel} onChange={e => setWaTel(e.target.value)}
                  placeholder="223 76 00 00 00" autoFocus
                  style={{ width: '100%', padding: '14px 14px 14px 44px', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(37,211,102,0.3)', borderRadius: 12, color: '#e2e8f0', fontSize: 16, fontWeight: 700, outline: 'none', letterSpacing: 1, boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#25D166'}
                  onBlur={e => e.target.style.borderColor = 'rgba(37,211,102,0.3)'}
                />
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>Format : 223 suivi du numéro (ex: 22376123456)</div>
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setShowWaModal(false); setWaTel('223'); }}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={() => {
                  const numero = waTel.replace(/\D/g, '');
                  if (numero.length < 10) { alert('Numéro invalide. Exemple: 22376123456'); return; }
                  partagerWhatsApp(evaluation, selectedSup, mois, annee, numero);
                  setShowWaModal(false); setWaTel('223');
                }}
                style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#25D166,#128C7E)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,211,102,0.35)' }}>
                📲 Envoyer sur WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
