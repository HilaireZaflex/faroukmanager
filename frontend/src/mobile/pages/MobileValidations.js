import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { fmtN, fmtDate, libelleStatutProspect, classeStatutProspect, libelleQualification } from '../format';

const DECISIONS_RC = [
  { value: 'approve', label: 'Approuver', icone: '✅', desc: 'Le dossier passe à l’attribution de puce' },
  { value: 'hold',    label: 'Mettre en attente', icone: '⏸️', desc: 'Manque de puces ou d’informations' },
  { value: 'reject',  label: 'Refuser', icone: '⛔', desc: 'Refus définitif du dossier' },
];

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

const CarteProspect = ({ p, action }) => (
  <div className="m-item">
    <div className="m-item-top">
      <Link to={`/m/prospect/${p.id}`} className="m-item-title" style={{ color: '#fff', textDecoration: 'none' }}>
        {`${p.prenom || ''} ${p.nom || ''}`.trim() || p.reference}
      </Link>
      <span className={'m-badge ' + classeStatutProspect(p.status)}>{libelleStatutProspect(p.status)}</span>
    </div>
    <div className="m-item-sub">
      Réf. {p.reference}
      {p.quartier ? ` · ${p.quartier}` : ''}
      {p.telephone_principal ? ` · ${p.telephone_principal}` : ''}
    </div>
    <div className="m-item-metrics">
      <div>Soumise le<b>{fmtDate(p.submitted_at || p.created_at)}</b></div>
      {p.qualification ? <div>Qualité<b>{libelleQualification(p.qualification)}</b></div> : null}
      {p.puce_numero ? <div>Puce<b>{p.puce_numero}</b></div> : null}
      {p.sla_rc_due_at ? <div>Échéance RC<b>{fmtDate(p.sla_rc_due_at)}</b></div> : null}
    </div>
    {action}
  </div>
);

/**
 * « Validations » — ce qui attend une décision de l'encadrement.
 *   • Décision RC   : approuver / mettre en attente / refuser
 *   • Attribuer une puce : choisir le développeur qui activera
 *   • Conformité    : contrôle champ par champ → volontairement réservé au bureau
 */
export default function MobileValidations() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const estRC = ['rc', 'admin', 'manager'].includes(role);

  const [vue, setVue] = useState(estRC ? 'rc' : 'conformite');
  const [sheet, setSheet] = useState(null);          // { type:'rc'|'puce', p }
  const [decision, setDecision] = useState('approve');
  const [commentaire, setCommentaire] = useState('');
  const [activatorId, setActivatorId] = useState('');
  const [puceNumero, setPuceNumero] = useState('');

  const charger = (statut) => api.get('/prospects', { params: { status: statut, limit: 200 } }).then(r => r.data);

  const { data: valideesDev, isLoading: l1 } = useQuery(['m-val-vdev'], () => charger('VALIDEE_DEV'), { enabled: estRC, staleTime: 60000 });
  const { data: attenteRC, isLoading: l2 } = useQuery(['m-val-arc'], () => charger('EN_ATTENTE_RC'), { enabled: estRC, staleTime: 60000 });
  const { data: aPucer, isLoading: l3 } = useQuery(['m-val-puce'], () => charger('APPROUVEE_RC'), { enabled: estRC, staleTime: 60000 });
  const { data: conformite, isLoading: l4 } = useQuery(['m-val-conf'], () => charger('EN_ATTENTE_CONFORMITE'), { staleTime: 60000 });

  const { data: developers } = useQuery(
    'm-developers',
    () => api.get('/auth/developers').then(r => r.data),
    { enabled: estRC && sheet?.type === 'puce', staleTime: 300000 }
  );

  const listeRC = useMemo(() => [...(valideesDev || []), ...(attenteRC || [])], [valideesDev, attenteRC]);
  // Seuls les développeurs ayant un compte utilisateur peuvent être affectés (règle du serveur)
  const devsComptes = (developers || []).filter(d => d.source === 'user');

  const rafraichir = () => {
    qc.invalidateQueries('m-val-vdev');
    qc.invalidateQueries('m-val-arc');
    qc.invalidateQueries('m-val-puce');
    qc.invalidateQueries('m-val-conf');
    qc.invalidateQueries('m-prospects');
  };

  const fermer = () => { setSheet(null); setCommentaire(''); setActivatorId(''); setPuceNumero(''); setDecision('approve'); };

  const mutationRC = useMutation(
    ({ id }) => api.post(`/prospects/${id}/rc-decision`, { decision, comment: commentaire.trim() || null }).then(r => r.data),
    {
      onSuccess: () => { toast.success('Décision enregistrée ✅'); fermer(); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Décision impossible'),
    }
  );

  const mutationPuce = useMutation(
    ({ id }) => {
      if (!activatorId) throw new Error('Choisissez le développeur qui activera.');
      return api.post(`/prospects/${id}/assign-puce`, {
        activator_id: parseInt(String(activatorId).replace('user_', ''), 10),
        puce_numero: puceNumero.trim() || null,
        comment: commentaire.trim() || null,
      }).then(r => r.data);
    },
    {
      onSuccess: () => { toast.success('Puce attribuée ✅'); fermer(); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || e?.message || 'Attribution impossible'),
    }
  );

  const ouvrirBureau = () => {
    try { localStorage.setItem('fm_force_desktop', '1'); } catch (e) {}
    document.body.classList.remove('fm-mobile');
    navigate('/prospection');
  };

  const compteurs = [
    { id: 'rc', label: `Décision RC (${fmtN(listeRC.length)})`, visible: estRC },
    { id: 'puce', label: `Attribuer puce (${fmtN((aPucer || []).length)})`, visible: estRC },
    { id: 'conformite', label: `Conformité (${fmtN((conformite || []).length)})`, visible: true },
  ].filter(c => c.visible);

  const chargement = l1 || l2 || l3 || l4;

  return (
    <div>
      <div className="m-section-title">📋 Validations en attente</div>

      <div className="m-chips">
        {compteurs.map(c => (
          <button key={c.id} className={'m-chip' + (vue === c.id ? ' active' : '')} onClick={() => setVue(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {chargement && <div className="m-empty">Chargement des dossiers…</div>}

      {/* ── Décision RC ── */}
      {!chargement && vue === 'rc' && (
        <>
          {listeRC.length === 0 && <div className="m-empty">Aucun dossier n'attend de décision RC. 👍</div>}
          {listeRC.map(p => (
            <CarteProspect key={p.id} p={p} action={
              <button className="m-btn" style={{ marginTop: 10, padding: 11, fontSize: 13.5 }}
                onClick={() => { setSheet({ type: 'rc', p }); setDecision('approve'); }}>
                ⚖️ Prendre la décision
              </button>
            } />
          ))}
        </>
      )}

      {/* ── Attribution de puce ── */}
      {!chargement && vue === 'puce' && (
        <>
          {estRC && devsComptes.length === 0 && (
            <div className="m-note warn">
              Aucun développeur n'a de compte utilisateur actif. L'attribution d'une puce doit être faite
              depuis la version bureau, qui peut aussi désigner les développeurs du réseau.
            </div>
          )}
          {(aPucer || []).length === 0 && <div className="m-empty">Aucun dossier approuvé en attente de puce. 👍</div>}
          {(aPucer || []).map(p => (
            <CarteProspect key={p.id} p={p} action={
              <button className="m-btn" style={{ marginTop: 10, padding: 11, fontSize: 13.5 }}
                onClick={() => { setSheet({ type: 'puce', p }); setActivatorId(''); setPuceNumero(''); }}>
                📦 Attribuer une puce
              </button>
            } />
          ))}
        </>
      )}

      {/* ── Conformité (réservée au bureau) ── */}
      {!chargement && vue === 'conformite' && (
        <>
          <div className="m-note">
            🔎 La validation de conformité demande de contrôler <b>chaque champ</b> du dossier
            (pièce d'identité, téléphone, GPS, photos…). Cet écran n'est utilisable que sur ordinateur.
            Vous pouvez ouvrir un dossier ici pour le consulter, puis le valider au bureau.
          </div>
          {(conformite || []).length === 0 && <div className="m-empty">Aucun dossier en attente de conformité. 👍</div>}
          {(conformite || []).map(p => (
            <CarteProspect key={p.id} p={p} action={
              <Link to={`/m/prospect/${p.id}`} className="m-btn secondary"
                style={{ marginTop: 10, padding: 11, fontSize: 13.5 }}>
                👁️ Consulter le dossier
              </Link>
            } />
          ))}
          {(conformite || []).length > 0 && (
            <button className="m-btn" style={{ marginTop: 4 }} onClick={ouvrirBureau}>
              🖥️ Valider sur la version bureau
            </button>
          )}
        </>
      )}

      {/* ── Feuille : décision RC ── */}
      {sheet?.type === 'rc' && (
        <Sheet titre="⚖️ Décision RC" aide={`Dossier ${sheet.p.reference} — la décision est définitive.`}
          onClose={fermer}>
          <div className="m-choix">
            {DECISIONS_RC.map(d => (
              <button key={d.value} className={decision === d.value ? 'active' : ''} onClick={() => setDecision(d.value)}>
                <span>{d.icone}</span>
                <span>{d.label}<small>{d.desc}</small></span>
              </button>
            ))}
          </div>
          <div className="m-field" style={{ marginTop: 12 }}>
            <label>Commentaire (facultatif)</label>
            <textarea className="m-textarea" value={commentaire} onChange={e => setCommentaire(e.target.value)}
              placeholder="Motif de la décision…" />
          </div>
          <button className={'m-btn' + (decision === 'reject' ? ' danger' : decision === 'approve' ? ' vert' : '')}
            disabled={mutationRC.isLoading} onClick={() => mutationRC.mutate({ id: sheet.p.id })}>
            {mutationRC.isLoading ? 'Enregistrement…' : 'Confirmer la décision'}
          </button>
        </Sheet>
      )}

      {/* ── Feuille : attribution de puce ── */}
      {sheet?.type === 'puce' && (
        <Sheet titre="📦 Attribuer une puce" aide={`Dossier ${sheet.p.reference} — choisissez qui activera sur le terrain.`}
          onClose={fermer}>
          <div className="m-field">
            <label>Développeur activateur (obligatoire)</label>
            <div className="m-choix">
              {devsComptes.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--fm-muted)' }}>
                  Aucun développeur avec compte utilisateur disponible.
                </div>
              )}
              {devsComptes.map(d => (
                <button key={d.id} className={activatorId === d.id ? 'active' : ''} onClick={() => setActivatorId(d.id)}>
                  <span>👤</span>
                  <span>{`${d.prenom || ''} ${d.nom || ''}`.trim() || d.nom}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="m-field">
            <label>Numéro de puce (facultatif)</label>
            <input className="m-input" value={puceNumero} onChange={e => setPuceNumero(e.target.value)}
              placeholder="Ex. 0700000000" inputMode="tel" />
          </div>
          <div className="m-field">
            <label>Commentaire (facultatif)</label>
            <textarea className="m-textarea" value={commentaire} onChange={e => setCommentaire(e.target.value)} />
          </div>
          <button className="m-btn vert" disabled={mutationPuce.isLoading || !activatorId}
            onClick={() => mutationPuce.mutate({ id: sheet.p.id })}>
            {mutationPuce.isLoading ? 'Enregistrement…' : 'Confirmer l’attribution'}
          </button>
        </Sheet>
      )}
    </div>
  );
}
