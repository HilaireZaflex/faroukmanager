import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtDate, classePrioriteAlerte } from '../format';

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
      <div className="m-section-title">
        🔔 PDV inactifs{data ? ` · ${fmtN(total)}` : ''}
        {data?.semaine ? ` (S${data.semaine} ${data.annee})` : ''}
      </div>

      <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
        <div className="m-kpi" style={{ borderLeftColor: '#ff4757' }}>
          <div className="lbl">Sans activité</div>
          <div className="val" style={{ color: '#ff4757' }}>{fmtN(total)}</div>
          <div className="sub">PDV de votre réseau</div>
        </div>
        <div className="m-kpi" style={{ borderLeftColor: '#ffa502' }}>
          <div className="lbl">Critiques</div>
          <div className="val" style={{ color: '#ffa502' }}>{fmtN(critiques)}</div>
          <div className="sub">inactifs depuis longtemps</div>
        </div>
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
