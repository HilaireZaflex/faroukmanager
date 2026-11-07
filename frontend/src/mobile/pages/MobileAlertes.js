import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtDate, classePrioriteAlerte } from '../format';
import { Hero, Kpi } from '../ui';

const FILTRES = [
  { id: 'TOUS', label: 'Tous' },
  { id: 'CRITIQUE', label: '🔴 Critique' },
  { id: 'HAUTE', label: '🟠 Haute' },
  { id: 'NORMALE', label: '🔵 Normale' },
];

/**
 * « Alertes » — PDV de mon réseau sans aucune opération.
 * Trié du plus longtemps inactif au plus récent ; la priorité est calculée par le backend.
 */
export default function MobileAlertes() {
  const [prio, setPrio] = useState('TOUS');

  const { data, isLoading, isError } = useQuery(
    'm-alertes-inactifs',
    () => api.get('/alerts/inactive').then(r => r.data),
    { staleTime: 120000 }
  );

  const liste = useMemo(() => {
    const arr = data?.pdvs || [];
    return prio === 'TOUS' ? arr : arr.filter(p => (p.priorite || '').toUpperCase() === prio);
  }, [data, prio]);

  const total = data?.pdvs?.length || 0;
  const critiques = (data?.pdvs || []).filter(p => (p.priorite || '').toUpperCase() === 'CRITIQUE').length;

  return (
    <div>
      <Hero
        titre="Alertes"
        role="PDV inactifs · Mon réseau"
        sousTitre={data?.semaine ? `Semaine ${data.semaine} ${data.annee}` : undefined}
      />

      <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
        <Kpi icone="🔕" label="Sans activité" valeur={fmtN(total)} sub="PDV de mon réseau" couleur="#ff4757" />
        <Kpi icone="🔴" label="Critiques" valeur={fmtN(critiques)} sub="inactifs depuis longtemps" couleur="#ffa502" />
      </div>

      <div className="m-chips">
        {FILTRES.map(f => (
          <button key={f.id} className={'m-chip' + (prio === f.id ? ' active' : '')} onClick={() => setPrio(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="m-empty">Chargement des alertes…</div>}
      {isError && <div className="m-empty">Impossible de charger les alertes.<br />Vérifiez votre connexion.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">Aucune alerte : tous vos PDV ont de l'activité. 👍</div>
      )}

      {liste.map(p => (
        <div key={p.pdv_id} className="m-item">
          <div className="m-item-top">
            <Link to={`/m/pdv/${p.pdv_id}`} className="m-item-title" style={{ color: '#fff', textDecoration: 'none' }}>
              {p.nom || `PDV ${p.numero_pdv}`}
            </Link>
            <span className={'m-badge ' + classePrioriteAlerte(p.priorite)}>{p.priorite || '—'}</span>
          </div>
          <div className="m-item-sub">
            N° {p.numero_pdv}
            {p.zone ? ` · ${p.zone}` : ''}
            {p.sous_zone ? ` · ${p.sous_zone}` : ''}
            {p.type_pdv ? ` · ${p.type_pdv}` : ''}
          </div>
          <div className="m-item-metrics">
            <div>Inactif depuis<b>{fmtN(p.semaines_consecutives_inactif)} sem.</b></div>
            <div>CA précédent<b>{fmtCourt(p.ca_precedent)}</b></div>
            <div>Dernière activité<b>{fmtDate(p.derniere_activite)}</b></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Link to={`/m/pdv/${p.pdv_id}`} className="m-btn secondary" style={{ padding: 10, fontSize: 13, flex: 1, width: 'auto' }}>
              Ouvrir la fiche
            </Link>
            {p.telephone && (
              <a className="m-btn" style={{ padding: 10, fontSize: 13, width: 52, flexShrink: 0 }} href={`tel:${p.telephone}`}>📞</a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
