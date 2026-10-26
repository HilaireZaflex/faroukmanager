import React from 'react';

// Éléments partagés par les écrans « Suivi Formation ».

export const STATUTS = {
  VALIDER:    { label: 'Validé',     court: 'V',  couleur: '#00d68f' },
  EN_COURS:   { label: 'En cours',   court: 'EC', couleur: '#ffa502' },
  A_REFORMER: { label: 'À reformer', court: 'R',  couleur: '#ff4757' },
  A_FORMER:   { label: 'À former',   court: 'F',  couleur: '#4a9eff' },
  NA:         { label: 'N/A',        court: '—',  couleur: '#555570' },
};

export const LISTE_STATUTS = ['VALIDER', 'EN_COURS', 'A_REFORMER', 'A_FORMER', 'NA'];

export const EVALUATIONS = ['EXCELLENT', 'TRES_BIEN', 'BIEN', 'MOYEN', 'INSUFFISANT'];

export const LIBELLE_EVAL = {
  EXCELLENT: 'Excellent',
  TRES_BIEN: 'Très bien',
  BIEN: 'Bien',
  MOYEN: 'Moyen',
  INSUFFISANT: 'Insuffisant',
};

export const ALERTES = {
  A_JOUR:          { label: 'À jour',              couleur: '#00d68f', icone: '✅' },
  INCOMPLET:       { label: 'Parcours incomplet',  couleur: '#4a9eff', icone: '📘' },
  SUIVI_EN_COURS:  { label: 'Suivi en cours',      couleur: '#ffa502', icone: '⏳' },
  ACTION_REQUISE:  { label: 'Action requise',      couleur: '#ff4757', icone: '⚠️' },
};

export const infoStatut = (s) => STATUTS[s] || { label: s || '—', court: '·', couleur: '#555570' };

export const tauxCouleur = (t) => (t >= 80 ? '#00d68f' : t >= 40 ? '#ffa502' : '#ff4757');

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

export const fmtDateLongue = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

export const styleChamp = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

export const Champ = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</label>
    {children}
  </div>
);

export const Barre = ({ pct, couleur }) => (
  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
    <div style={{
      width: `${Math.max(0, Math.min(100, Number(pct) || 0))}%`,
      height: '100%', background: couleur, borderRadius: 999,
    }} />
  </div>
);
