/**
 * EvalSuperveursPage — Module d'évaluation mensuelle des superviseurs
 * KPIs (70%) + Mystery TC (20%) + Présentiel (10%)
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../services/api';

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

// ─── Mystery Calls Section ────────────────────────────────────────────────────
function MysterySection({ evaluation, superviseur, annee, mois, onRefresh }) {
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
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>📞 Mystery Calls TC</h3>
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
            📞 Score actuel Mystery TC : <strong>{evaluation?.score_mystery != null ? Math.round(evaluation.score_mystery) + '/100' : 'En attente'}</strong>
            {joignables.length > 0 && ` · ${joignables.length} appel(s) enregistré(s) sur 5`}
          </div>
        )}
      </div>

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
                  <div style={{ fontSize: 11, color: '#8a8a9a' }}>📞 {pdv.telephone || '—'} · {pdv.quartier || pdv.localite || '—'}</div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: call.statut === 'JOIGNABLE' ? '#22c55e' : '#ff4757' }}>
                        {call.statut === 'JOIGNABLE' ? '✅ Joignable' : '📵 Injoignable'}
                      </span>
                      {call.statut === 'JOIGNABLE' && (
                        <div style={{ fontSize: 11, color: '#8a8a9a' }}>
                          Conn:{call.note_connaissance}/10 · Vis:{call.note_visite}/10 · Note:{call.note_superviseur}/10
                        </div>
                      )}
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
    { onSuccess: () => { qc.invalidateQueries(['eval-sup', superviseur, annee, mois]); onRefresh(); } }
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
              <div style={{ fontSize: 11, color: '#8a8a9a', marginTop: 2 }}>📞 Flotte: <strong style={{ color: '#ffa502' }}>{p.telephone || p.flotte || '—'}</strong></div>
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
export default function EvalSuperveursPage() {
  const qc = useQueryClient();
  const [selectedSup, setSelectedSup] = useState('');
  const [annee] = useState(evalAnnee);
  const [mois] = useState(evalMois);
  const [activeTab, setActiveTab] = useState('classement'); // classement | evaluation | mystery | presentiel
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

  const supsFiltres = superviseurs.filter(s => s !== '#VALUE!' && (!searchSup || s.toLowerCase().includes(searchSup.toLowerCase())));

  const tabs = [
    { id: 'classement', label: '🏆 Classement' },
    ...(selectedSup ? [
      { id: 'kpis', label: '📊 KPIs Auto' },
      { id: 'mystery', label: '📞 Mystery TC' },
      { id: 'presentiel', label: '🏢 Présentiel' },
      { id: 'resultats', label: '🎯 Résultats' },
    ] : []),
  ];

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">🎯 Évaluation Superviseurs</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            Période évaluée : <strong style={{ color: '#FF6900' }}>{MOIS_NOMS[mois]} {annee}</strong> · 
            KPIs 70% · Mystery TC 20% · Présentiel 10%
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
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 5 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: activeTab === t.id ? 'linear-gradient(135deg,#FF6900,#ff9500)' : 'transparent',
                  color: activeTab === t.id ? '#fff' : '#8a8a9a', transition: 'all 0.2s',
                  boxShadow: activeTab === t.id ? '0 4px 12px rgba(255,105,0,0.3)' : 'none' }}>
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

          {/* ── Mystery Calls ── */}
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
                      { label: '📞 Mystery TC (20%)', score: evaluation.score_mystery, poids: 20, color: '#22c55e' },
                      { label: '🏢 Présentiel (10%)', score: evaluation.score_presentiel, poids: 10, color: '#FF6900' },
                    ].map((comp, i) => (
                      <div key={i} style={{ padding: '16px', background: `rgba(${comp.color === '#3742fa' ? '55,66,250' : comp.color === '#22c55e' ? '34,197,94' : '255,105,0'},0.08)`, border: `1px solid ${comp.color}25`, borderRadius: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: '#8a8a9a', marginBottom: 8 }}>{comp.label}</div>
                        <ScoreBadge score={comp.score} size="lg" />
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>Contribution: {comp.score ? Math.round(comp.score * comp.poids / 100) : 0} pts</div>
                      </div>
                    ))}
                  </div>

                  {/* Bouton calculer */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button onClick={() => calcMutation.mutate()} disabled={calcMutation.isLoading}
                      style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF6900,#ff9500)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,105,0,0.35)' }}>
                      {calcMutation.isLoading ? '⏳ Calcul en cours...' : '🎯 Calculer / Recalculer le Score Final'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
