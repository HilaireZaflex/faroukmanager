import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { fmtDateHeure } from '../format';

const STATUTS = {
  OUVERTE:    { label: 'Ouverte',    couleur: '#4a9eff' },
  EN_COURS:   { label: 'En cours',   couleur: '#ffa502' },
  RESOLUE:    { label: 'Résolue',    couleur: '#22c55e' },
  CLOTUREE:   { label: 'Clôturée',   couleur: '#8a94a6' },
  REOUVERTE:  { label: 'Réouverte',  couleur: '#ffa502' },
  ESCALADEE:  { label: 'Escaladée',  couleur: '#ff4757' },
};
const PRIORITES = {
  BASSE: '#8a94a6', NORMALE: '#4a9eff', HAUTE: '#ffa502', URGENTE: '#ff4757',
};

export default function MobileReclamationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [commentaire, setCommentaire] = useState('');

  const { data: r, isLoading, isError } = useQuery(
    ['m-reclamation', id],
    () => api.get(`/reclamations/${id}`).then(res => res.data),
    { staleTime: 0 }
  );

  const commenter = useMutation(
    (contenu) => api.post(`/reclamations/${id}/commentaires`, { contenu }).then(res => res.data),
    {
      onSuccess: () => {
        toast.success('Commentaire ajouté');
        setCommentaire('');
        qc.invalidateQueries(['m-reclamation', id]);
      },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Impossible'),
    }
  );

  if (isLoading) return <div className="m-empty">Chargement…</div>;
  if (isError || !r) return (
    <div>
      <button className="m-back" onClick={() => navigate(-1)}>‹ Retour</button>
      <div className="m-empty">Réclamation introuvable.</div>
    </div>
  );

  const st = STATUTS[r.statut] || { label: r.statut, couleur: '#8a94a6' };

  return (
    <div>
      <button className="m-back" onClick={() => navigate(-1)}>‹ Retour</button>

      <div className="m-card">
        <div className="m-item-top">
          <div className="m-item-title" style={{ fontSize: 16 }}>{r.titre}</div>
          <span className="m-badge" style={{ color: st.couleur, borderColor: `${st.couleur}66`, background: `${st.couleur}1f` }}>
            {st.label}
          </span>
        </div>
        <div className="m-item-sub">
          {r.categorie} · ouverte le {fmtDateHeure(r.created_at)}
        </div>
        <div style={{ fontSize: 13, color: 'var(--fm-text)', marginTop: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {r.description}
        </div>
      </div>

      <div className="m-card">
        <div className="m-kv"><span>Priorité</span><b style={{ color: PRIORITES[r.priorite] || '#fff' }}>{r.priorite}</b></div>
        <div className="m-kv"><span>Responsable</span><b>{r.responsable_nom || '—'}</b></div>
        <div className="m-kv"><span>Soumise par</span><b>{r.soumetteur_nom || '—'}</b></div>
        {r.numero_pdv ? <div className="m-kv"><span>PDV</span><b>{r.numero_pdv}</b></div> : null}
        <div className="m-kv"><span>Ancienneté</span><b>{r.jours_depuis_creation} jour(s)</b></div>
        {r.date_limite ? <div className="m-kv"><span>Échéance</span><b>{fmtDateHeure(r.date_limite)}</b></div> : null}
      </div>

      {r.reponse ? (
        <div className="m-card">
          <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 6 }}>Réponse</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.reponse}</div>
        </div>
      ) : null}

      <div className="m-section-title">💬 Échanges ({r.commentaires?.length || 0})</div>

      {(r.commentaires || []).length === 0 && (
        <div className="m-empty">Aucun commentaire pour l'instant.</div>
      )}

      {(r.commentaires || []).map(c => (
        <div key={c.id} className="m-card" style={{ marginBottom: 9 }}>
          <div className="m-item-top">
            <div className="m-item-title" style={{ fontSize: 13 }}>
              {c.auteur_nom || 'Utilisateur'}
              {c.est_interne ? ' · note interne' : ''}
            </div>
            <span className="m-badge">{fmtDateHeure(c.created_at)}</span>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.contenu}</div>
        </div>
      ))}

      <div className="m-card">
        <div className="m-field" style={{ marginBottom: 8 }}>
          <label>Ajouter un commentaire</label>
          <textarea className="m-textarea" value={commentaire} onChange={e => setCommentaire(e.target.value)}
            placeholder="Votre message…" />
        </div>
        <button className="m-btn" disabled={!commentaire.trim() || commenter.isLoading}
          onClick={() => commenter.mutate(commentaire.trim())}>
          {commenter.isLoading ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>

      {(r.historique || []).length > 0 && (
        <>
          <div className="m-section-title">🕓 Historique</div>
          {r.historique.slice().reverse().map(h => (
            <div key={h.id} className="m-card" style={{ marginBottom: 8 }}>
              <div className="m-item-top">
                <div className="m-item-title" style={{ fontSize: 12.5 }}>{h.action}</div>
                <span className="m-badge">{fmtDateHeure(h.created_at)}</span>
              </div>
              <div className="m-item-sub">
                {h.auteur_nom || '—'}
                {h.ancienne_valeur || h.nouvelle_valeur ? ` · ${h.ancienne_valeur || '—'} → ${h.nouvelle_valeur || '—'}` : ''}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
