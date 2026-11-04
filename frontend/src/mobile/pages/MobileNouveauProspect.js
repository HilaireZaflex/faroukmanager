import React, { useState } from 'react';
import { useMutation } from 'react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Création d'un prospect — équivalent mobile du formulaire web de Prospection.
// ─────────────────────────────────────────────────────────────────────────────

const TYPES_LOCAL = [
  { v: 'BOUTIQUE_FIXE', l: 'Boutique fixe' },
  { v: 'KIOSQUE', l: 'Kiosque' },
  { v: 'TABLE', l: 'Table' },
  { v: 'MOBILE', l: 'Mobile' },
  { v: 'AUTRE', l: 'Autre' },
];

const FREQUENTATIONS = [
  { v: 'TRES_FREQUENTE', l: 'Très fréquenté' },
  { v: 'MOYENNE', l: 'Moyennement fréquenté' },
  { v: 'FAIBLE', l: 'Peu fréquenté' },
];

const champ = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1px solid var(--fm-border)', background: 'rgba(255,255,255,0.05)',
  color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box',
};

const Champ = ({ label, children, aide }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--fm-muted)', marginBottom: 6 }}>
      {label}
    </label>
    {children}
    {aide && <div style={{ fontSize: 10.5, color: 'var(--fm-muted)', marginTop: 4 }}>{aide}</div>}
  </div>
);

const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(/\s/g, '')));

export default function MobileNouveauProspect() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    nom: '', prenom: '', telephone_principal: '', telephone_secondaire: '',
    quartier: '', adresse: '',
    fait_om: false, om_commission_mensuelle: '', om_ca_mensuel: '',
    om_ancienne_puce: '', om_raison_changement: '',
    capital_demarrage: '', source_financement: '',
    pdv_nom_lieu: '', pdv_adresse: '',
    type_local: 'BOUTIQUE_FIXE', frequentation: '', notes: '',
  });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const creer = useMutation(
    () => api.post('/prospects', {
      nom: f.nom.trim(),
      prenom: f.prenom.trim(),
      telephone_principal: f.telephone_principal.trim(),
      telephone_secondaire: f.telephone_secondaire.trim() || null,
      quartier: f.quartier.trim() || null,
      adresse: f.adresse.trim() || null,
      fait_om: f.fait_om,
      om_commission_mensuelle: num(f.om_commission_mensuelle),
      om_ca_mensuel: num(f.om_ca_mensuel),
      om_ancienne_puce: f.om_ancienne_puce.trim() || null,
      om_raison_changement: f.om_raison_changement.trim() || null,
      capital_demarrage: num(f.capital_demarrage),
      source_financement: f.source_financement.trim() || null,
      pdv_nom_lieu: f.pdv_nom_lieu.trim() || null,
      pdv_adresse: f.pdv_adresse.trim() || null,
      type_local: f.type_local,
      frequentation: f.frequentation || null,
      notes: f.notes.trim() || null,
    }).then(r => r.data),
    {
      onSuccess: (p) => {
        toast.success('Prospect enregistré ✅');
        navigate(`/m/prospect/${p.id}`, { replace: true });
      },
      onError: (e) => {
        const d = e?.response?.data?.detail;
        toast.error(typeof d === 'string' ? d : 'Enregistrement impossible');
      },
    }
  );

  const valide = f.nom.trim() && f.prenom.trim() && f.telephone_principal.trim().length >= 6;

  return (
    <div>
      <button className="m-back" onClick={() => navigate(-1)}>‹ Retour</button>
      <div className="m-section-title">➕ Nouveau prospect</div>

      <div className="m-note">Renseignez les informations recueillies sur le terrain. Les champs marqués * sont obligatoires.</div>

      <div className="m-card">
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', marginBottom: 10 }}>👤 Identité</div>
        <Champ label="Nom *"><input style={champ} value={f.nom} onChange={e => set('nom', e.target.value)} /></Champ>
        <Champ label="Prénom *"><input style={champ} value={f.prenom} onChange={e => set('prenom', e.target.value)} /></Champ>
        <Champ label="Téléphone principal *">
          <input style={champ} inputMode="tel" value={f.telephone_principal}
            onChange={e => set('telephone_principal', e.target.value)} placeholder="Ex. 70000000" />
        </Champ>
        <Champ label="Téléphone secondaire">
          <input style={champ} inputMode="tel" value={f.telephone_secondaire}
            onChange={e => set('telephone_secondaire', e.target.value)} />
        </Champ>
        <Champ label="Quartier"><input style={champ} value={f.quartier} onChange={e => set('quartier', e.target.value)} /></Champ>
        <Champ label="Adresse"><input style={champ} value={f.adresse} onChange={e => set('adresse', e.target.value)} /></Champ>
      </div>

      <div className="m-card">
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', marginBottom: 10 }}>🟠 Orange Money</div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#fff', marginBottom: 12 }}>
          <input type="checkbox" checked={f.fait_om} onChange={e => set('fait_om', e.target.checked)}
            style={{ width: 18, height: 18 }} />
          Fait déjà Orange Money
        </label>
        <Champ label="CA mensuel OM (F)"><input style={champ} inputMode="numeric" value={f.om_ca_mensuel} onChange={e => set('om_ca_mensuel', e.target.value)} /></Champ>
        <Champ label="Commission mensuelle (F)"><input style={champ} inputMode="numeric" value={f.om_commission_mensuelle} onChange={e => set('om_commission_mensuelle', e.target.value)} /></Champ>
        <Champ label="Ancienne puce"><input style={champ} value={f.om_ancienne_puce} onChange={e => set('om_ancienne_puce', e.target.value)} /></Champ>
        <Champ label="Raison du changement"><input style={champ} value={f.om_raison_changement} onChange={e => set('om_raison_changement', e.target.value)} /></Champ>
      </div>

      <div className="m-card">
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', marginBottom: 10 }}>💰 Financement</div>
        <Champ label="Capital de démarrage (F)" aide={!f.fait_om ? 'Minimum 50 000 F si le prospect ne fait pas encore OM' : null}>
          <input style={champ} inputMode="numeric" value={f.capital_demarrage} onChange={e => set('capital_demarrage', e.target.value)} />
        </Champ>
        <Champ label="Source de financement">
          <input style={champ} value={f.source_financement} onChange={e => set('source_financement', e.target.value)} />
        </Champ>
      </div>

      <div className="m-card">
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', marginBottom: 10 }}>🏪 Point de vente</div>
        <Champ label="Nom du lieu"><input style={champ} value={f.pdv_nom_lieu} onChange={e => set('pdv_nom_lieu', e.target.value)} /></Champ>
        <Champ label="Adresse du PDV"><input style={champ} value={f.pdv_adresse} onChange={e => set('pdv_adresse', e.target.value)} /></Champ>
        <Champ label="Type de local">
          <select style={champ} value={f.type_local} onChange={e => set('type_local', e.target.value)}>
            {TYPES_LOCAL.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </Champ>
        <Champ label="Fréquentation">
          <select style={champ} value={f.frequentation} onChange={e => set('frequentation', e.target.value)}>
            <option value="">—</option>
            {FREQUENTATIONS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </Champ>
        <Champ label="Notes">
          <textarea style={{ ...champ, minHeight: 80 }} value={f.notes} onChange={e => set('notes', e.target.value)} />
        </Champ>
      </div>

      <button className="m-btn" disabled={!valide || creer.isLoading} onClick={() => creer.mutate()}>
        {creer.isLoading ? 'Enregistrement…' : '✅ Enregistrer le prospect'}
      </button>
    </div>
  );
}
