import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, fmtDate, libelleStatutProspect, classeStatutProspect } from '../format';

// Filtres : un identifiant simple = un statut exact ; `statuts` = plusieurs statuts regroupés.
const FILTRES = [
  { id: 'TOUTES',      label: 'Toutes' },
  { id: 'NOUVELLE',    label: 'Nouvelles' },
  { id: 'EN_VISITE',   label: 'En visite' },
  { id: 'ATTENTE',     label: 'En attente', statuts: ['VALIDEE_DEV', 'EN_ATTENTE_RC', 'APPROUVEE_RC'] },
  { id: 'A_ACTIVER',   label: 'À activer',  statuts: ['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE'] },
  { id: 'PUCE_ACTIVEE', label: 'Activées' },
  { id: 'REFUSEES',    label: 'Refusées',   statuts: ['REFUSEE_DEV', 'REFUSEE_RC'] },
  { id: 'ANNULEE',     label: 'Annulées' },
];

const KPI = ({ label, value, color }) => (
  <div className="m-kpi" style={{ borderLeftColor: color }}>
    <div className="lbl">{label}</div>
    <div className="val" style={{ color }}>{value}</div>
  </div>
);

const correspond = (p, f) =>
  f.statuts ? f.statuts.includes((p.status || '').toUpperCase()) : (p.status || '').toUpperCase() === f.id;

/**
 * « Prospection » — toutes les demandes de puce visibles par le développeur :
 * celles qu'il a soumises lui-même + celles qui lui sont affectées (visite ou activation).
 * Le serveur applique déjà ce périmètre, aucun filtre de rôle n'est fait ici.
 */
export default function MobileProspection() {
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('TOUTES');

  const { data, isLoading, isError } = useQuery(
    'm-prospects',
    () => api.get('/prospects', { params: { limit: 200 } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const tous = data || [];

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    const f = FILTRES.find(x => x.id === filtre) || FILTRES[0];
    return tous.filter(p => {
      if (filtre !== 'TOUTES' && !correspond(p, f)) return false;
      if (!terme) return true;
      return [p.reference, p.nom, p.prenom, p.telephone_principal, p.quartier, p.pdv_nom_lieu]
        .some(v => (v || '').toString().toLowerCase().includes(terme));
    });
  }, [tous, q, filtre]);

  const compte = (statuts) => tous.filter(p => statuts.includes((p.status || '').toUpperCase())).length;

  return (
    <div>
      <div className="m-section-title">👥 Ma prospection{data ? ` · ${fmtN(tous.length)}` : ''}</div>

      <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
        <KPI label="Visites à faire" value={fmtN(compte(['EN_VISITE']))} color="#ffa502" />
        <KPI label="Activations à faire" value={fmtN(compte(['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE']))} color="#4a9eff" />
        <KPI label="En attente RC" value={fmtN(compte(['VALIDEE_DEV', 'EN_ATTENTE_RC', 'APPROUVEE_RC']))} color="#a29bfe" />
        <KPI label="Activées" value={fmtN(compte(['PUCE_ACTIVEE']))} color="#22c55e" />
      </div>

      <div className="m-search">
        <span>🔎</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Référence, nom, téléphone, quartier…"
          inputMode="search"
        />
        {q && <button className="m-chip" style={{ padding: '4px 9px' }} onClick={() => setQ('')}>✕</button>}
      </div>

      <div className="m-chips">
        {FILTRES.map(f => (
          <button key={f.id} className={'m-chip' + (filtre === f.id ? ' active' : '')} onClick={() => setFiltre(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="m-empty">Chargement de vos demandes…</div>}
      {isError && <div className="m-empty">Impossible de charger la prospection.<br />Vérifiez votre connexion.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">Aucune demande ne correspond.</div>
      )}

      {liste.map(p => (
        <Link key={p.id} to={`/m/prospect/${p.id}`} className="m-item">
          <div className="m-item-top">
            <div className="m-item-title">{`${p.prenom || ''} ${p.nom || ''}`.trim() || p.reference}</div>
            <span className={'m-badge ' + classeStatutProspect(p.status)}>{libelleStatutProspect(p.status)}</span>
          </div>
          <div className="m-item-sub">
            Réf. {p.reference}
            {p.quartier ? ` · ${p.quartier}` : ''}
            {p.telephone_principal ? ` · ${p.telephone_principal}` : ''}
          </div>
          <div className="m-item-metrics">
            <div>Soumise le<b>{fmtDate(p.submitted_at || p.created_at)}</b></div>
            {p.qualification ? <div>Qualité<b>{p.qualification}</b></div> : null}
            {p.visit_assigned_to ? <div>Visite<b>{p.visit_assigned_to.nom}</b></div> : null}
            {p.puce_assigned_to ? <div>Activation<b>{p.puce_assigned_to.nom}</b></div> : null}
          </div>
        </Link>
      ))}

      {tous.length >= 200 && (
        <div className="m-empty">200 demandes affichées (maximum). Affinez avec la recherche.</div>
      )}
    </div>
  );
}
