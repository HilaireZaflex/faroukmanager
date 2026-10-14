import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import {
  fmtN, fmtF, fmtCourt, fmtPct, fmtDate, fmtDateHeure, periodeLabel,
  couleurVariation, libelleStatut, classeStatut,
} from '../format';

const KPI = ({ label, value, sub, color }) => (
  <div className="m-kpi" style={{ borderLeftColor: color }}>
    <div className="lbl">{label}</div>
    <div className="val" style={{ color }}>{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

const KV = ({ k, v }) => (
  <div className="m-kv"><span>{k}</span><b>{v == null || v === '' ? '—' : v}</b></div>
);

/** Couleur du badge selon l'issue de l'appel (les libellés métier viennent du backend). */
const classeAppel = (statut) => {
  const s = (statut || '').toUpperCase();
  if (s === 'JOIGNABLE_PROMESSE' || s === 'JOIGNABLE_DEJA_ACTIF') return 'green';
  if (s === 'JOIGNABLE_PAS_INTERESSE' || s === 'RAPPEL_PROGRAMME') return 'blue';
  if (!s) return '';
  return 'red';
};

export default function MobilePDVDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('hebdo');

  const { data: pdv, isLoading, isError } = useQuery(
    ['m-pdv', id],
    () => api.get(`/pdvs/${id}`).then(r => r.data)
  );

  const numero = pdv?.numero_pdv;
  const { data: appels } = useQuery(
    ['m-appels-pdv', numero],
    () => api.get(`/appels-tc/pdv/${numero}`).then(r => r.data),
    { enabled: !!numero, staleTime: 60000 }
  );

  if (isLoading) return <div className="m-empty">Chargement de la fiche…</div>;
  if (isError || !pdv) return (
    <div>
      <button className="m-back" onClick={() => navigate(-1)}>‹ Retour</button>
      <div className="m-empty">PDV introuvable.</div>
    </div>
  );

  const histo = (mode === 'hebdo' ? pdv.historique_hebdo : pdv.historique_mensuel) || [];
  const cour = histo[0];
  const prec = histo[1];
  const varPct = cour?.taux_variation != null
    ? cour.taux_variation
    : (prec?.ca > 0 ? ((cour.ca - prec.ca) / prec.ca) * 100 : null);

  return (
    <div>
      <button className="m-back" onClick={() => navigate(-1)}>‹ Retour à la liste</button>

      <div className="m-card">
        <div className="m-item-top">
          <div className="m-item-title" style={{ fontSize: 17 }}>{pdv.nom || `PDV ${pdv.numero_pdv}`}</div>
          <span className={'m-badge ' + classeStatut(pdv.statut)}>{libelleStatut(pdv.statut)}</span>
        </div>
        <div className="m-item-sub">N° {pdv.numero_pdv}{pdv.numero_personnel ? ` · Perso ${pdv.numero_personnel}` : ''}</div>
        {pdv.telephone && (
          <a className="m-btn m-tel" style={{ marginTop: 12, marginBottom: 0 }} href={`tel:${pdv.telephone}`}>
            📞 Appeler le {pdv.telephone}
          </a>
        )}
      </div>

      <div className="m-section-title">📈 Performance</div>
      <div className="m-toggle">
        <button className={mode === 'hebdo' ? 'active' : ''} onClick={() => setMode('hebdo')}>🗓️ Semaine</button>
        <button className={mode === 'mensuel' ? 'active' : ''} onClick={() => setMode('mensuel')}>📅 Mois</button>
      </div>

      {!cour && (
        <div className="m-empty">Aucune donnée de performance {mode === 'hebdo' ? 'hebdomadaire' : 'mensuelle'} pour ce PDV.</div>
      )}

      {cour && (
        <>
          <div className="m-grid m-grid-2" style={{ marginBottom: 10 }}>
            <KPI label={mode === 'hebdo' ? 'CA semaine' : 'CA mois'} value={fmtCourt(cour.ca)} color="#4a9eff"
              sub={periodeLabel(cour, mode)} />
            <KPI label="Variation" value={varPct == null ? '—' : fmtPct(varPct)} color={couleurVariation(varPct)}
              sub={prec ? `vs ${periodeLabel(prec, mode)}` : 'pas de période précédente'} />
            <KPI label="Opérations" value={fmtN(cour.nb_operations)} color="#a29bfe" />
            <KPI label="Statut période" value={cour.est_actif ? 'Actif' : 'Inactif'}
              color={cour.est_actif ? '#22c55e' : '#ff4757'} />
          </div>

          {mode === 'mensuel' && (cour.nb_depots != null || cour.nb_retraits != null) && (
            <div className="m-card">
              <KV k="Dépôts (nb)" v={fmtN(cour.nb_depots)} />
              <KV k="Montant dépôts" v={fmtF(cour.montant_depots)} />
              <KV k="Retraits (nb)" v={fmtN(cour.nb_retraits)} />
              <KV k="Montant retraits" v={fmtF(cour.montant_retraits)} />
            </div>
          )}

          <div className="m-card">
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              Historique {mode === 'hebdo' ? 'des 8 dernières semaines' : 'des 12 derniers mois'}
            </div>
            <table className="m-tbl">
              <thead>
                <tr>
                  <th>Période</th>
                  <th className="num">CA</th>
                  <th className="num">Opér.</th>
                  <th className="num">Var.</th>
                </tr>
              </thead>
              <tbody>
                {histo.map((p, i) => (
                  <tr key={i}>
                    <td>{periodeLabel(p, mode)}</td>
                    <td className="num">{fmtCourt(p.ca)}</td>
                    <td className="num">{fmtN(p.nb_operations)}</td>
                    <td className="num" style={{ color: couleurVariation(p.taux_variation) }}>
                      {p.taux_variation == null ? '—' : fmtPct(p.taux_variation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="m-section-title">🧾 Fiche PDV</div>
      <div className="m-card">
        <KV k="Type de PDV" v={pdv.type_pdv} />
        <KV k="Médaille" v={pdv.medaille} />
        <KV k="Segment" v={pdv.segment} />
        <KV k="Zone" v={pdv.zone} />
        <KV k="Sous-zone" v={pdv.sous_zone} />
        <KV k="Quartier" v={pdv.quartier} />
        <KV k="Commune" v={pdv.commune} />
        <KV k="Superviseur" v={pdv.superviseur} />
        <KV k="Gestionnaire" v={pdv.gestionnaire} />
        <KV k="Téléconseillère" v={pdv.teleconseillere} />
        <KV k="Développeur" v={pdv.developpeur} />
        <KV k="Gérant" v={pdv.nom_gerant} />
        <KV k="Téléphone" v={pdv.telephone} />
        <KV k="Flotte" v={pdv.numero_flotte ? 'Oui' : 'Non'} />
        <KV k="SIM au bureau" v={pdv.sim_au_bureau ? 'Oui' : 'Non'} />
        <KV k="Date d'activation" v={fmtDate(pdv.date_activation)} />
        <KV k="Santé (health score)" v={pdv.health_score == null ? '—' : `${fmtN(pdv.health_score, 0)} / 100`} />
        <KV k="Score de risque" v={pdv.score_risque == null ? '—' : `${fmtN(pdv.score_risque, 0)} / 100`} />
        {pdv.adresse ? <KV k="Adresse" v={pdv.adresse} /> : null}
        {pdv.notes ? <KV k="Notes" v={pdv.notes} /> : null}
      </div>

      <div className="m-section-title">☎️ Derniers appels ({fmtN(appels?.length || 0)})</div>
      {(!appels || appels.length === 0) && (
        <div className="m-empty">Aucun appel enregistré sur ce PDV.</div>
      )}
      {appels?.map(a => (
        <div key={a.id} className="m-card" style={{ marginBottom: 9 }}>
          <div className="m-item-top">
            <div className="m-item-title" style={{ fontSize: 13.5 }}>
              {(a.indicateurs || []).join(' · ') || a.indicateur || 'Appel'}
            </div>
            <span className={'m-badge ' + classeAppel(a.statut)}>
              {a.statut_label || a.statut || '—'}
            </span>
          </div>
          <div className="m-item-sub">
            {fmtDateHeure(a.created_at)}{a.tc_nom ? ` · ${a.tc_nom}` : ''}
          </div>
          {a.commentaire ? (
            <div style={{ fontSize: 12.5, color: 'var(--fm-text)', marginTop: 8, lineHeight: 1.5 }}>💬 {a.commentaire}</div>
          ) : null}
          {a.date_rappel ? <div className="m-item-sub">🔁 Rappel prévu : {fmtDate(a.date_rappel)}</div> : null}
        </div>
      ))}
    </div>
  );
}
