import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, fmtDate, fmtDateHeure } from '../format';

const A_ACTIVER = ['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE'];
const ACTIVEE = 'PUCE_ACTIVEE';

const maintenant = () => new Date();

/**
 * « Activations » — les puces qui me sont attribuées.
 * Deux vues : celles restant à poser, et celles déjà activées (avec le PDV créé).
 */
export default function MobileActivations() {
  const [vue, setVue] = useState('a_faire');

  const { data, isLoading, isError } = useQuery(
    'm-activations',
    () => api.get('/prospects', { params: { assigned_to_me: true, limit: 200 } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const tous = data || [];
  const aFaire = useMemo(
    () => tous.filter(p => A_ACTIVER.includes((p.status || '').toUpperCase()))
      .sort((a, b) => {
        const da = a.sla_activation_due_at ? new Date(a.sla_activation_due_at).getTime() : Infinity;
        const db = b.sla_activation_due_at ? new Date(b.sla_activation_due_at).getTime() : Infinity;
        return da - db;
      }),
    [tous]
  );
  const faites = useMemo(
    () => tous.filter(p => (p.status || '').toUpperCase() === ACTIVEE)
      .sort((a, b) => new Date(b.activated_at || 0) - new Date(a.activated_at || 0)),
    [tous]
  );

  const enRetard = aFaire.filter(p => p.sla_activation_due_at && new Date(p.sla_activation_due_at) < maintenant()).length;
  const liste = vue === 'a_faire' ? aFaire : faites;

  return (
    <div>
      <div className="m-section-title">✅ Mes activations</div>

      <div className="m-toggle">
        <button className={vue === 'a_faire' ? 'active' : ''} onClick={() => setVue('a_faire')}>
          À activer ({fmtN(aFaire.length)})
        </button>
        <button className={vue === 'faites' ? 'active' : ''} onClick={() => setVue('faites')}>
          Activées ({fmtN(faites.length)})
        </button>
      </div>

      {vue === 'a_faire' && enRetard > 0 && (
        <div className="m-note err">
          ⏰ {fmtN(enRetard)} activation{enRetard > 1 ? 's' : ''} en retard sur l'échéance. À traiter en priorité.
        </div>
      )}
      {vue === 'a_faire' && aFaire.length > 0 && enRetard === 0 && (
        <div className="m-note">
          ✅ Confirmez l'activation une fois la puce réellement posée : la fiche PDV se crée automatiquement.
        </div>
      )}

      {isLoading && <div className="m-empty">Chargement de vos activations…</div>}
      {isError && <div className="m-empty">Impossible de charger les activations.<br />Vérifiez votre connexion.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">
          {vue === 'a_faire'
            ? 'Aucune puce en attente d’activation. 👍'
            : 'Aucune activation enregistrée pour le moment.'}
        </div>
      )}

      {liste.map(p => {
        const echeance = p.sla_activation_due_at ? new Date(p.sla_activation_due_at) : null;
        const retard = echeance && echeance < maintenant();
        return (
          <Link key={p.id} to={`/m/prospect/${p.id}`} className="m-item">
            <div className="m-item-top">
              <div className="m-item-title">{`${p.prenom || ''} ${p.nom || ''}`.trim() || p.reference}</div>
              <span className={'m-badge ' + (vue === 'faites' ? 'green' : retard ? 'red' : 'blue')}>
                {vue === 'faites' ? 'Activée' : retard ? 'En retard' : p.status === 'EN_ATTENTE_CONFORMITE' ? 'Conformité' : 'À activer'}
              </span>
            </div>
            <div className="m-item-sub">
              Réf. {p.reference}
              {p.quartier ? ` · ${p.quartier}` : ''}
              {p.puce_numero ? ` · Puce ${p.puce_numero}` : ''}
            </div>
            <div className="m-item-metrics">
              <div>Numéro<b>{p.telephone_principal || '—'}</b></div>
              {vue === 'a_faire'
                ? <div>Échéance<b>{echeance ? fmtDate(echeance) : '—'}</b></div>
                : <div>Activation<b>{p.activated_at ? fmtDateHeure(p.activated_at) : '—'}</b></div>}
              {p.pdv_nom_lieu ? <div>Lieu<b>{p.pdv_nom_lieu}</b></div> : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
