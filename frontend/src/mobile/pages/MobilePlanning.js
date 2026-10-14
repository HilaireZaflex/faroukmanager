import React, { useMemo } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, fmtDate, lienItineraire } from '../format';

const maintenant = () => new Date();

/**
 * « Planning » — les visites terrain qui me sont affectées (statut « En visite »).
 * Les visites dont l'échéance est dépassée remontent en premier : ce sont les plus urgentes.
 */
export default function MobilePlanning() {
  const { data, isLoading, isError } = useQuery(
    'm-planning',
    () => api.get('/prospects', { params: { status: 'EN_VISITE', assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const liste = useMemo(() => {
    const arr = data || [];
    // Échéance la plus proche d'abord, sans échéance à la fin
    return arr.slice().sort((a, b) => {
      const da = a.sla_visit_due_at ? new Date(a.sla_visit_due_at).getTime() : Infinity;
      const db = b.sla_visit_due_at ? new Date(b.sla_visit_due_at).getTime() : Infinity;
      return da - db;
    });
  }, [data]);

  const enRetard = liste.filter(p => p.sla_visit_due_at && new Date(p.sla_visit_due_at) < maintenant()).length;

  return (
    <div>
      <div className="m-section-title">📅 Mes visites terrain{data ? ` · ${fmtN(liste.length)}` : ''}</div>

      {enRetard > 0 && (
        <div className="m-note err">
          ⏰ {fmtN(enRetard)} visite{enRetard > 1 ? 's' : ''} en retard sur l'échéance. À traiter en priorité.
        </div>
      )}

      {isLoading && <div className="m-empty">Chargement de votre planning…</div>}
      {isError && <div className="m-empty">Impossible de charger le planning.<br />Vérifiez votre connexion.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">Aucune visite ne vous est affectée pour le moment. 👍</div>
      )}

      {liste.map(p => {
        const echeance = p.sla_visit_due_at ? new Date(p.sla_visit_due_at) : null;
        const retard = echeance && echeance < maintenant();
        const itineraire = lienItineraire(p.latitude, p.longitude);
        return (
          <div key={p.id} className="m-item">
            <div className="m-item-top">
              <Link to={`/m/prospect/${p.id}`} className="m-item-title" style={{ color: '#fff', textDecoration: 'none' }}>
                {`${p.prenom || ''} ${p.nom || ''}`.trim() || p.reference}
              </Link>
              {echeance && (
                <span className={'m-badge ' + (retard ? 'red' : 'amber')}>
                  {retard ? 'En retard' : `Échéance ${fmtDate(echeance)}`}
                </span>
              )}
            </div>
            <div className="m-item-sub">
              Réf. {p.reference}
              {p.quartier ? ` · ${p.quartier}` : ''}
            </div>
            {p.pdv_nom_lieu || p.adresse ? (
              <div className="m-item-sub">📍 {p.pdv_nom_lieu || p.adresse}</div>
            ) : null}
            <div className="m-item-sub">
              {p.telephone_principal ? `☎️ ${p.telephone_principal}` : '☎️ Numéro non renseigné'}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Link to={`/m/prospect/${p.id}`} className="m-btn secondary"
                style={{ padding: 10, fontSize: 13, flex: 1, width: 'auto' }}>
                Faire la visite
              </Link>
              {p.telephone_principal && (
                <a className="m-btn" style={{ padding: 10, fontSize: 13, width: 52, flexShrink: 0 }}
                   href={`tel:${p.telephone_principal}`}>📞</a>
              )}
              {itineraire && (
                <a className="m-btn secondary" style={{ padding: 10, fontSize: 13, width: 52, flexShrink: 0 }}
                   href={itineraire} target="_blank" rel="noreferrer">🗺️</a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
