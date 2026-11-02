import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { fmtDateHeure } from '../format';

// ─── Réclamations — liste + création (miroir de la version web) ──────────────

const STATUTS = {
  OUVERTE:    { label: 'Ouverte',    couleur: '#4a9eff' },
  EN_COURS:   { label: 'En cours',   couleur: '#ffa502' },
  RESOLUE:    { label: 'Résolue',    couleur: '#22c55e' },
  CLOTUREE:   { label: 'Clôturée',   couleur: '#8a94a6' },
  REOUVERTE:  { label: 'Réouverte',  couleur: '#ffa502' },
  ESCALADEE:  { label: 'Escaladée',  couleur: '#ff4757' },
};

const PRIORITES = {
  BASSE:   { label: 'Basse',   couleur: '#8a94a6' },
  NORMALE: { label: 'Normale', couleur: '#4a9eff' },
  HAUTE:   { label: 'Haute',   couleur: '#ffa502' },
  URGENTE: { label: 'Urgente', couleur: '#ff4757' },
};

export const CATEGORIES = ['PDV', 'PERSONNEL', 'LOGISTIQUE', 'FINANCE', 'TECHNIQUE', 'AUTRE'];

const FILTRES = [
  { id: null,       label: 'Toutes' },
  { id: 'OUVERTE',  label: 'Ouvertes' },
  { id: 'EN_COURS', label: 'En cours' },
  { id: 'RESOLUE',  label: 'Résolues' },
  { id: 'CLOTUREE', label: 'Clôturées' },
];

export default function MobileReclamations() {
  const qc = useQueryClient();
  const [filtre, setFiltre] = useState(null);
  const [creation, setCreation] = useState(false);

  const { data, isLoading, isError } = useQuery(
    ['m-reclamations', filtre],
    () => api.get('/reclamations', { params: { statut: filtre || undefined, limit: 200 } }).then(r => r.data),
    { staleTime: 30000 }
  );

  const liste = data?.items || [];

  const creer = useMutation(
    (corps) => api.post('/reclamations', corps).then(r => r.data),
    {
      onSuccess: () => {
        toast.success('Réclamation envoyée');
        setCreation(false);
        qc.invalidateQueries('m-reclamations');
      },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Envoi impossible'),
    }
  );

  return (
    <div>
      <div className="m-section-title">📣 Mes réclamations{data ? ` · ${liste.length}` : ''}</div>

      <div className="m-chips">
        {FILTRES.map(f => (
          <button key={String(f.id)} className={'m-chip' + (filtre === f.id ? ' active' : '')}
            onClick={() => setFiltre(f.id)}>{f.label}</button>
        ))}
      </div>

      <button className="m-btn" style={{ marginBottom: 12 }} onClick={() => setCreation(true)}>
        ➕ Nouvelle réclamation
      </button>

      {isLoading && <div className="m-empty">Chargement…</div>}
      {isError && <div className="m-empty">Impossible de charger les réclamations.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">Aucune réclamation pour ce filtre.</div>
      )}

      {liste.map(r => {
        const st = STATUTS[r.statut] || { label: r.statut, couleur: '#8a94a6' };
        const pr = PRIORITES[r.priorite] || { label: r.priorite, couleur: '#8a94a6' };
        return (
          <Link key={r.id} to={`/m/reclamation/${r.id}`} className="m-item">
            <div className="m-item-top">
              <div className="m-item-title">{r.titre}</div>
              <span className="m-badge" style={{ color: st.couleur, borderColor: `${st.couleur}66`, background: `${st.couleur}1f` }}>
                {st.label}
              </span>
            </div>
            <div className="m-item-sub">
              {r.categorie} · {fmtDateHeure(r.created_at)}
              {r.responsable_nom ? ` · ${r.responsable_nom}` : ''}
            </div>
            <div className="m-item-metrics">
              <div>Priorité<b style={{ color: pr.couleur }}>{pr.label}</b></div>
              {r.numero_pdv ? <div>PDV<b>{r.numero_pdv}</b></div> : null}
              <div>Ancienneté<b>{r.jours_depuis_creation} j</b></div>
            </div>
          </Link>
        );
      })}

      {creation && (
        <FormulaireReclamation
          onClose={() => setCreation(false)}
          onSave={(c) => creer.mutate(c)}
          enCours={creer.isLoading}
        />
      )}
    </div>
  );
}

function FormulaireReclamation({ onClose, onSave, enCours }) {
  const [f, setF] = useState({ titre: '', description: '', categorie: 'TECHNIQUE', priorite: 'NORMALE' });
  const valide = f.titre.trim() && f.description.trim();

  return (
    <div className="m-overlay" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
        <h3>Nouvelle réclamation</h3>
        <p className="aide">Décrivez le problème : il sera transmis au responsable concerné.</p>

        <div className="m-field">
          <label>Titre *</label>
          <input className="m-input" value={f.titre} onChange={e => setF({ ...f, titre: e.target.value })}
            placeholder="Ex. PDV sans puce depuis 3 jours" />
        </div>

        <div className="m-field">
          <label>Description *</label>
          <textarea className="m-textarea" value={f.description}
            onChange={e => setF({ ...f, description: e.target.value })}
            placeholder="Expliquez la situation…" />
        </div>

        <div className="m-field">
          <label>Catégorie</label>
          <select className="m-input" value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="m-field">
          <label>Priorité</label>
          <select className="m-input" value={f.priorite} onChange={e => setF({ ...f, priorite: e.target.value })}>
            {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="m-btn secondary" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button className="m-btn" style={{ flex: 1 }} disabled={!valide || enCours}
            onClick={() => onSave(f)}>{enCours ? 'Envoi…' : 'Envoyer'}</button>
        </div>
      </div>
    </div>
  );
}
