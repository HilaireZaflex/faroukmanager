import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, libelleStatut, classeStatut } from '../format';

const FILTRES = [
  { id: 'TOUS', label: 'Tous' },
  { id: 'ACTIF', label: 'Actifs' },
  { id: 'RECUPERATION', label: 'À récupérer' },
  { id: 'INACTIF', label: 'Inactifs' },
];

/**
 * « Mes PDV » — liste du réseau de l'utilisateur connecté.
 * Le backend restreint déjà la liste à son périmètre (superviseur / gestionnaire / zone).
 */
export default function MobilePDV() {
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('TOUS');

  const { data, isLoading, isError } = useQuery(
    'm-pdvs',
    () => api.get('/pdvs', { params: { limit: 1000 } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return (data || []).filter(p => {
      if (statut !== 'TOUS' && (p.statut || '').toUpperCase() !== statut) return false;
      if (!terme) return true;
      return [p.nom, p.numero_pdv, p.numero_personnel, p.quartier, p.zone, p.superviseur, p.nom_gerant, p.telephone]
        .some(v => (v || '').toString().toLowerCase().includes(terme));
    });
  }, [data, q, statut]);

  return (
    <div>
      <div className="m-section-title">🏪 Mes points de vente{data ? ` · ${fmtN(liste.length)}` : ''}</div>

      <div className="m-search">
        <span>🔎</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Nom, numéro, quartier, gérant…"
          inputMode="search"
        />
        {q && <button className="m-chip" style={{ padding: '4px 9px' }} onClick={() => setQ('')}>✕</button>}
      </div>

      <div className="m-chips">
        {FILTRES.map(f => (
          <button key={f.id} className={'m-chip' + (statut === f.id ? ' active' : '')} onClick={() => setStatut(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="m-empty">Chargement de votre réseau…</div>}
      {isError && <div className="m-empty">Impossible de charger les PDV.<br />Vérifiez votre connexion.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">Aucun PDV ne correspond à votre recherche.</div>
      )}

      {liste.map(p => (
        <Link key={p.id} to={`/m/pdv/${p.id}`} className="m-item">
          <div className="m-item-top">
            <div className="m-item-title">{p.nom || `PDV ${p.numero_pdv}`}</div>
            <span className={'m-badge ' + classeStatut(p.statut)}>{libelleStatut(p.statut)}</span>
          </div>
          <div className="m-item-sub">
            N° {p.numero_pdv}
            {p.quartier ? ` · ${p.quartier}` : ''}
            {p.zone ? ` · ${p.zone}` : ''}
          </div>
          <div className="m-item-metrics">
            <div>Type<b>{p.type_pdv || '—'}</b></div>
            {p.medaille && p.medaille !== 'AUCUNE' ? <div>Médaille<b>{p.medaille}</b></div> : null}
            {p.nom_gerant ? <div>Gérant<b>{p.nom_gerant}</b></div> : null}
          </div>
        </Link>
      ))}

      {liste.length > 0 && (
        <div className="m-empty" style={{ paddingTop: 8 }}>
          {fmtN(liste.length)} PDV affichés. Touchez une ligne pour ouvrir la fiche.
        </div>
      )}
    </div>
  );
}
