/**
 * Helpers de formatage partagés par les écrans mobiles.
 * Objectif : affichage court et lisible sur téléphone (pas de chiffres bruts).
 */

export const fmtN = (v, d = 0) =>
  v == null || v === '' || isNaN(Number(v))
    ? '—'
    : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtF = (v, d = 0) => (v == null || v === '' ? '—' : `${fmtN(v, d)} F`);

/** Montants en millions / milliards, pour tenir sur un écran de téléphone. */
export const fmtCourt = (v) => {
  const n = Number(v || 0);
  if (!n) return '0';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)} Md`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)} k`;
  return fmtN(n);
};

export const fmtPct = (v, d = 1) => (v == null || v === '' || isNaN(Number(v)) ? '—' : `${fmtN(v, d)} %`);

export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtDateHeure = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const MOIS = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Libellé d'une période d'historique de PDV (mensuel ou hebdo). */
export const periodeLabel = (p, mode) =>
  mode === 'hebdo' ? `S${p.semaine} ${p.annee}` : `${(MOIS[p.mois] || '').slice(0, 3)} ${p.annee}`;

/** Vert si la variation est positive, rouge si négative, gris si inconnue. */
export const couleurVariation = (v) => {
  if (v == null || v === '' || isNaN(Number(v))) return 'var(--fm-muted)';
  const n = Number(v);
  if (n > 0) return '#63e6a0';
  if (n < 0) return '#ff8b96';
  return 'var(--fm-muted)';
};

export const PRIORITES = {
  P1: { label: 'P1 · Urgent', classe: 'red', couleur: '#ff4757' },
  P2: { label: 'P2 · Élevée', classe: 'amber', couleur: '#ffa502' },
  P3: { label: 'P3 · Moyenne', classe: 'blue', couleur: '#4a9eff' },
  P4: { label: 'P4 · Faible', classe: '', couleur: '#8a94a6' },
};

export const classePriorite = (p) => (PRIORITES[p] || {}).classe || '';
export const libellePriorite = (p) => (PRIORITES[p] || {}).label || p || '—';

export const STATUTS_PDV = {
  ACTIF: { classe: 'green', label: 'Actif' },
  INACTIF: { classe: 'red', label: 'Inactif' },
  RECUPERATION: { classe: 'amber', label: 'À récupérer' },
  DESACTIVE: { classe: '', label: 'Désactivé' },
  NEANT: { classe: '', label: '—' },
};

export const classeStatut = (s) => (STATUTS_PDV[(s || '').toUpperCase()] || {}).classe || '';
export const libelleStatut = (s) => (STATUTS_PDV[(s || '').toUpperCase()] || {}).label || s || '—';

export const classePrioriteAlerte = (p) =>
  ({ CRITIQUE: 'red', HAUTE: 'amber', NORMALE: 'blue' }[(p || '').toUpperCase()] || '');

/* ── Prospection ────────────────────────────────────────────────────────── */

export const STATUTS_PROSPECT = {
  NOUVELLE:              { label: 'Nouvelle',            classe: 'blue' },
  EN_VISITE:             { label: 'En visite',           classe: 'amber' },
  VALIDEE_DEV:           { label: 'Validée dev',         classe: 'green' },
  REFUSEE_DEV:           { label: 'Refusée dev',         classe: 'red' },
  EN_ATTENTE_RC:         { label: 'Attente RC',          classe: 'amber' },
  APPROUVEE_RC:          { label: 'Approuvée RC',        classe: 'green' },
  REFUSEE_RC:            { label: 'Refusée RC',          classe: 'red' },
  PUCE_ATTRIBUEE:        { label: 'Puce attribuée',      classe: 'blue' },
  EN_ATTENTE_CONFORMITE: { label: 'Attente conformité',  classe: 'amber' },
  PUCE_ACTIVEE:          { label: 'Activée',             classe: 'green' },
  ANNULEE:               { label: 'Annulée',             classe: '' },
};

export const libelleStatutProspect = (s) =>
  (STATUTS_PROSPECT[(s || '').toUpperCase()] || {}).label || s || '—';

export const classeStatutProspect = (s) =>
  (STATUTS_PROSPECT[(s || '').toUpperCase()] || {}).classe || '';

/** Qualité du prospect évaluée sur le terrain (obligatoire pour valider une visite). */
export const QUALIFICATIONS = [
  { value: 'EXCELLENT', label: 'Excellent',  icone: '🟢', desc: 'Emplacement idéal, forte affluence' },
  { value: 'TRES_BON',  label: 'Très bon',   icone: '🟩', desc: 'Très bon potentiel' },
  { value: 'BON',       label: 'Bon',        icone: '🟡', desc: 'Potentiel correct' },
  { value: 'MOYEN',     label: 'Moyen',      icone: '🟠', desc: 'Potentiel limité' },
  { value: 'FAIBLE',    label: 'Faible',     icone: '🔴', desc: 'Potentiel insuffisant' },
];

export const libelleQualification = (q) =>
  (QUALIFICATIONS.find(x => x.value === q) || {}).label || q || '—';

/** Lien d'itinéraire Google Maps vers un point GPS. */
export const lienItineraire = (lat, lng) =>
  lat != null && lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : null;

