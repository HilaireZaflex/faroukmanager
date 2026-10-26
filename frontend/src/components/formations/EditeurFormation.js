import React, { useState } from 'react';
import { useMutation, useQuery } from 'react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import {
  LISTE_STATUTS, EVALUATIONS, LIBELLE_EVAL, infoStatut, fmtDate, styleChamp, Champ,
} from './commun';

/**
 * Éditeur d'une formation (agent + module).
 *
 * Utilisé depuis la matrice (clic sur une cellule) et depuis la fiche
 * individuelle (bouton ✏️ d'une ligne du parcours).
 *
 * `cellule` = { session_id, statut, date_session, evaluation, note, observation }
 *             ou null s'il n'existe encore aucune formation.
 */
export default function EditeurFormation({ personne, module, cellule, onClose, onSaved }) {
  const [statut, setStatut] = useState(cellule?.statut || 'VALIDER');
  const [dateSession, setDate] = useState(cellule?.date_session || '');
  const [evaluation, setEvaluation] = useState(cellule?.evaluation || '');
  const [note, setNote] = useState(cellule?.note != null ? String(cellule.note) : '');
  const [observation, setObservation] = useState(cellule?.observation || '');

  const { data: historique = [] } = useQuery(
    ['formations-historique', personne.id, module.id],
    () => api.get('/formations/sessions', { params: { personnel_id: personne.id, module_id: module.id } }).then(r => r.data),
    { staleTime: 0 }
  );

  const corps = () => ({
    statut,
    date_session: dateSession || null,
    evaluation: evaluation || null,
    note: note === '' ? null : Number(note),
    observation: observation || null,
  });

  const enregistrer = useMutation(
    () => (cellule?.session_id
      ? api.put(`/formations/sessions/${cellule.session_id}`, corps()).then(r => r.data)
      : api.post('/formations/sessions', { personnel_id: personne.id, module_id: module.id, ...corps() }).then(r => r.data)),
    {
      onSuccess: () => { toast.success('Formation enregistrée'); onSaved(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Enregistrement impossible'),
    }
  );

  const supprimer = useMutation(
    () => api.delete(`/formations/sessions/${cellule.session_id}`).then(r => r.data),
    {
      onSuccess: () => { toast.success('Formation supprimée'); onSaved(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Suppression impossible'),
    }
  );

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', background: '#141420' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{personne.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {personne.matricule} · {module.nom}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Champ label="Statut">
            <select style={styleChamp} value={statut} onChange={e => setStatut(e.target.value)}>
              {LISTE_STATUTS.map(s => <option key={s} value={s}>{infoStatut(s).label}</option>)}
            </select>
          </Champ>
          <Champ label="Date de formation">
            <input type="date" style={styleChamp} value={dateSession || ''} onChange={e => setDate(e.target.value)} />
          </Champ>
          <Champ label="Évaluation (facultatif)">
            <select style={styleChamp} value={evaluation} onChange={e => setEvaluation(e.target.value)}>
              <option value="">—</option>
              {EVALUATIONS.map(ev => <option key={ev} value={ev}>{LIBELLE_EVAL[ev]}</option>)}
            </select>
          </Champ>
          <Champ label="Note / 20 (facultatif)">
            <input type="number" min="0" max="20" step="0.5" style={styleChamp}
              value={note} onChange={e => setNote(e.target.value)} />
          </Champ>
          <div style={{ gridColumn: '1 / -1' }}>
            <Champ label="Observation">
              <textarea style={{ ...styleChamp, minHeight: 70 }} value={observation}
                onChange={e => setObservation(e.target.value)} />
            </Champ>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          {cellule?.session_id && (
            <button className="btn btn-danger" disabled={supprimer.isLoading}
              onClick={() => { if (window.confirm('Supprimer cette formation ?')) supprimer.mutate(); }}>
              Supprimer
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={enregistrer.isLoading} onClick={() => enregistrer.mutate()}>
            {enregistrer.isLoading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {historique.length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              Historique sur ce module ({historique.length})
            </div>
            {historique.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{fmtDate(h.date_session) || 'sans date'}</span>
                <span style={{ color: infoStatut(h.statut).couleur }}>{infoStatut(h.statut).label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
