import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import {
  fmtN, fmtF, fmtDate, fmtDateHeure,
  libelleStatutProspect, classeStatutProspect,
  QUALIFICATIONS, libelleQualification, lienItineraire,
} from '../format';

const KV = ({ k, v }) => (
  <div className="m-kv"><span>{k}</span><b>{v == null || v === '' ? '—' : v}</b></div>
);

/** Feuille d'action qui remonte du bas de l'écran. */
const Sheet = ({ titre, aide, onClose, children }) => (
  <div className="m-overlay" onClick={onClose}>
    <div className="m-sheet" onClick={e => e.stopPropagation()}>
      <h3>{titre}</h3>
      {aide && <p className="aide">{aide}</p>}
      {children}
      <div className="m-sheet-actions">
        <button className="m-btn secondary" onClick={onClose}>Annuler</button>
      </div>
    </div>
  </div>
);

const Geo = () => (
  <div className="m-note">
    📍 La position GPS du téléphone sera enregistrée avec votre décision.
    Autorisez la localisation si le navigateur la demande.
  </div>
);

export default function MobileProspectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);

  const [sheet, setSheet] = useState(null); // 'decision' | 'activation'
  const [approuve, setApprouve] = useState(true);
  const [qualification, setQualification] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [puceNumero, setPuceNumero] = useState('');

  const { data: p, isLoading, isError } = useQuery(
    ['m-prospect', id],
    () => api.get(`/prospects/${id}`).then(r => r.data)
  );

  const rafraichir = () => {
    qc.invalidateQueries(['m-prospect', id]);
    qc.invalidateQueries('m-prospects');
    qc.invalidateQueries('m-planning');
    qc.invalidateQueries('m-activations');
  };

  /** Récupère la position GPS du téléphone (obligatoire pour valider une visite). */
  const position = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => reject(new Error("Position GPS introuvable. Activez la localisation du téléphone puis réessayez.")),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  const decision = useMutation(
    async () => {
      if (!commentaire.trim() || commentaire.trim().length < 3) {
        throw new Error('Le commentaire est obligatoire (3 caractères minimum).');
      }
      const corps = { approved: approuve, comment: commentaire.trim() };
      if (approuve) {
        if (!qualification) throw new Error('Choisissez la qualité du prospect (obligatoire pour valider).');
        const gps = await position();
        corps.qualification = qualification;
        corps.latitude = gps.latitude;
        corps.longitude = gps.longitude;
      }
      return api.post(`/prospects/${id}/dev-decision`, corps).then(r => r.data);
    },
    {
      onSuccess: () => {
        toast.success(approuve ? 'Visite validée ✅' : 'Visite refusée');
        setSheet(null); setCommentaire(''); setQualification('');
        rafraichir();
      },
      onError: (e) => toast.error(e?.message || e?.response?.data?.detail || 'Action impossible'),
    }
  );

  const activation = useMutation(
    () => api.post(`/prospects/${id}/activate`, {
      comment: commentaire.trim() || null,
      create_pdv: true,
      puce_numero: puceNumero.trim() || null,
    }).then(r => r.data),
    {
      onSuccess: () => {
        toast.success('Activation enregistrée ✅');
        setSheet(null); setCommentaire('');
        rafraichir();
      },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Activation impossible'),
    }
  );

  if (isLoading) return <div className="m-empty">Chargement de la demande…</div>;
  if (isError || !p) return (
    <div>
      <button className="m-back" onClick={() => navigate(-1)}>‹ Retour</button>
      <div className="m-empty">Demande introuvable.</div>
    </div>
  );

  const monId = user?.id;
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const statut = (p.status || '').toUpperCase();
  const jeSuisVisiteur = p.visit_assigned_to?.id === monId;
  const jeSuisActivateur = p.puce_assigned_to?.id === monId;
  const peutDecider = statut === 'EN_VISITE' && (jeSuisVisiteur || role === 'admin');
  const peutActiver = ['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE'].includes(statut)
    && (jeSuisActivateur || ['admin', 'manager', 'rc', 'conformite'].includes(role));

  const gps = p.latitude != null && p.longitude != null;
  const itineraire = lienItineraire(p.latitude, p.longitude);

  return (
    <div>
      <button className="m-back" onClick={() => navigate(-1)}>‹ Retour</button>

      <div className="m-card">
        <div className="m-item-top">
          <div className="m-item-title" style={{ fontSize: 17 }}>
            {`${p.prenom || ''} ${p.nom || ''}`.trim() || p.reference}
          </div>
          <span className={'m-badge ' + classeStatutProspect(p.status)}>{libelleStatutProspect(p.status)}</span>
        </div>
        <div className="m-item-sub">Réf. {p.reference} · {fmtDate(p.submitted_at || p.created_at)}</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {p.telephone_principal && (
            <a className="m-btn" style={{ padding: 11, fontSize: 13.5, flex: 1, width: 'auto' }}
               href={`tel:${p.telephone_principal}`}>📞 Appeler</a>
          )}
          {itineraire && (
            <a className="m-btn secondary" style={{ padding: 11, fontSize: 13.5, flex: 1, width: 'auto' }}
               href={itineraire} target="_blank" rel="noreferrer">🗺️ Itinéraire</a>
          )}
        </div>
      </div>

      {peutDecider && (
        <div className="m-note warn">
          🧭 Cette visite vous est affectée. Après votre passage, enregistrez votre décision :
          approuver (avec la qualité du PDV) ou refuser, avec un commentaire.
        </div>
      )}
      {peutActiver && (
        <div className="m-note ok">
          ✅ Cette puce vous est attribuée. Confirmez l'activation une fois la puce posée :
          la fiche PDV sera créée automatiquement.
        </div>
      )}

      {peutDecider && (
        <button className="m-btn" style={{ marginBottom: 12 }} onClick={() => { setSheet('decision'); setApprouve(true); }}>
          🧭 Enregistrer ma décision de visite
        </button>
      )}
      {peutActiver && (
        <button className="m-btn vert" style={{ marginBottom: 12 }}
          onClick={() => { setSheet('activation'); setPuceNumero(p.puce_numero || ''); }}>
          ✅ Finaliser l'activation
        </button>
      )}

      <div className="m-section-title">👤 Le prospect</div>
      <div className="m-card">
        <KV k="Nom" v={`${p.prenom || ''} ${p.nom || ''}`.trim()} />
        <KV k="Téléphone" v={p.telephone_principal} />
        <KV k="Téléphone 2" v={p.telephone_secondaire} />
        <KV k="Quartier" v={p.quartier} />
        <KV k="Adresse" v={p.adresse} />
        <KV k="Nom du lieu" v={p.pdv_nom_lieu} />
        <KV k="Type de local" v={p.type_local} />
        <KV k="Fréquentation" v={p.frequentation} />
        <KV k="Fait Orange Money" v={p.fait_om ? 'Oui' : 'Non'} />
        <KV k="CA mensuel OM" v={p.om_ca_mensuel == null ? '—' : fmtF(p.om_ca_mensuel)} />
        <KV k="Commission mensuelle" v={p.om_commission_mensuelle == null ? '—' : fmtF(p.om_commission_mensuelle)} />
        <KV k="Ancienne puce" v={p.om_ancienne_puce} />
        <KV k="Raison du changement" v={p.om_raison_changement} />
        <KV k="Capital de démarrage" v={p.capital_demarrage == null ? '—' : fmtF(p.capital_demarrage)} />
        <KV k="Source de financement" v={p.source_financement} />
        <KV k="Pièce" v={p.piece_identite_type ? `${p.piece_identite_type} · ${p.piece_identite_numero || '—'}` : null} />
        <KV k="Position GPS" v={gps ? `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}` : 'Non renseignée'} />
        {p.notes ? <KV k="Notes" v={p.notes} /> : null}
      </div>

      <div className="m-section-title">🔀 Suivi</div>
      <div className="m-card">
        <KV k="Soumise par" v={p.submitted_by ? `${p.submitted_by.prenom || ''} ${p.submitted_by.nom || ''}`.trim() : null} />
        <KV k="Visite affectée à" v={p.visit_assigned_to ? `${p.visit_assigned_to.prenom || ''} ${p.visit_assigned_to.nom || ''}`.trim() : 'Personne'} />
        <KV k="Décision dev" v={p.dev_decision_at ? fmtDateHeure(p.dev_decision_at) : 'En attente'} />
        <KV k="Commentaire dev" v={p.dev_decision_comment} />
        <KV k="Qualité évaluée" v={p.qualification ? libelleQualification(p.qualification) : null} />
        <KV k="Décision RC" v={p.rc_decision_at ? fmtDateHeure(p.rc_decision_at) : 'En attente'} />
        <KV k="Commentaire RC" v={p.rc_decision_comment} />
        <KV k="Puce attribuée à" v={p.puce_assigned_to ? `${p.puce_assigned_to.prenom || ''} ${p.puce_assigned_to.nom || ''}`.trim() : null} />
        <KV k="N° de puce" v={p.puce_numero} />
        <KV k="Activée le" v={p.activated_at ? fmtDateHeure(p.activated_at) : null} />
        <KV k="Échéance visite" v={p.sla_visit_due_at ? fmtDate(p.sla_visit_due_at) : null} />
      </div>

      {p.activated_pdv_id && (
        <button className="m-btn secondary" style={{ marginBottom: 12 }}
          onClick={() => navigate(`/m/pdv/${p.activated_pdv_id}`)}>
          🏪 Voir le PDV créé
        </button>
      )}

      {p.history?.length > 0 && (
        <>
          <div className="m-section-title">🕓 Historique ({fmtN(p.history.length)})</div>
          {p.history.slice().reverse().map(h => (
            <div key={h.id} className="m-card" style={{ marginBottom: 9 }}>
              <div className="m-item-top">
                <div className="m-item-title" style={{ fontSize: 13.5 }}>{h.decision_type || 'Étape'}</div>
                <span className="m-badge">{fmtDate(h.created_at)}</span>
              </div>
              {(h.from_status || h.to_status) && (
                <div className="m-item-sub">
                  {h.from_status ? libelleStatutProspect(h.from_status) : '—'} → {h.to_status ? libelleStatutProspect(h.to_status) : '—'}
                </div>
              )}
              {h.comment ? <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>💬 {h.comment}</div> : null}
              {h.user ? <div className="m-item-sub">{`${h.user.prenom || ''} ${h.user.nom || ''}`.trim()}</div> : null}
            </div>
          ))}
        </>
      )}

      {/* ── Décision de visite ── */}
      {sheet === 'decision' && (
        <Sheet
          titre="🧭 Décision après visite"
          aide="Votre décision est définitive pour cette étape. Un commentaire est obligatoire."
          onClose={() => setSheet(null)}
        >
          <div className="m-toggle">
            <button className={approuve ? 'active' : ''} onClick={() => setApprouve(true)}>✅ Approuver</button>
            <button className={!approuve ? 'active' : ''} onClick={() => setApprouve(false)}>⛔ Refuser</button>
          </div>

          {approuve && (
            <>
              <Geo />
              <div className="m-field">
                <label>Qualité du PDV (obligatoire)</label>
                <div className="m-choix">
                  {QUALIFICATIONS.map(q => (
                    <button key={q.value} className={qualification === q.value ? 'active' : ''}
                      onClick={() => setQualification(q.value)}>
                      <span>{q.icone}</span>
                      <span>{q.label}<small>{q.desc}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="m-field">
            <label>Commentaire (obligatoire)</label>
            <textarea className="m-textarea" value={commentaire} onChange={e => setCommentaire(e.target.value)}
              placeholder="Ce que vous avez constaté sur place…" />
          </div>

          <button className={'m-btn' + (approuve ? ' vert' : ' danger')} disabled={decision.isLoading}
            onClick={() => decision.mutate()}>
            {decision.isLoading ? 'Enregistrement…' : (approuve ? '✅ Valider la visite' : '⛔ Refuser la visite')}
          </button>
        </Sheet>
      )}

      {/* ── Activation ── */}
      {sheet === 'activation' && (
        <Sheet
          titre="✅ Finaliser l'activation"
          aide="À faire uniquement quand la puce est réellement posée et active. La fiche PDV sera créée automatiquement."
          onClose={() => setSheet(null)}
        >
          <div className="m-field">
            <label>Numéro de puce / flotte</label>
            <input className="m-input" value={puceNumero} onChange={e => setPuceNumero(e.target.value)}
              placeholder="Ex. 0700000000" inputMode="tel" />
          </div>
          <div className="m-field">
            <label>Commentaire (facultatif)</label>
            <textarea className="m-textarea" value={commentaire} onChange={e => setCommentaire(e.target.value)}
              placeholder="Remarques éventuelles…" />
          </div>
          <button className="m-btn vert" disabled={activation.isLoading} onClick={() => activation.mutate()}>
            {activation.isLoading ? 'Enregistrement…' : '✅ Confirmer l’activation'}
          </button>
        </Sheet>
      )}
    </div>
  );
}
