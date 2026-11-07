/* Composants d'interface partagés par TOUS les écrans mobiles.
   Objectif : un design identique pour chaque rôle (développeur, superviseur,
   commercial, encadrement) — même en-tête, mêmes cartes, mêmes couleurs. */
import React from 'react';
import { Link } from 'react-router-dom';
import { fmtN } from './format';

export const Hero = ({ titre, sousTitre, role, droite, children }) => (
  <div className="m-hero">
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', lineHeight: 1.15 }}>{titre}</div>
        {role && <div className="m-hero-role">{role}</div>}
        {sousTitre && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.62)', marginTop: 4 }}>{sousTitre}</div>}
      </div>
      {droite}
    </div>
    {children}
  </div>
);

export const Kpi = ({ icone, label, valeur, sub, couleur = '#FF6900', to }) => {
  const contenu = (
    <>
      <div className="m-kpi2-ico" style={{ background: `${couleur}33`, border: `1px solid ${couleur}66` }}>{icone}</div>
      <div className="m-kpi2-body">
        <div className="m-kpi2-lbl">{label}</div>
        <div className="m-kpi2-val">{valeur}</div>
        {sub && <div className="m-kpi2-sub">{sub}</div>}
      </div>
      {to && <div className="m-kpi2-chev">›</div>}
    </>
  );
  const style = {
    background: `linear-gradient(140deg, ${couleur}40 0%, ${couleur}14 55%, #101018 100%)`,
    border: `1px solid ${couleur}55`,
  };
  if (to) return <Link to={to} className="m-kpi2" style={style}>{contenu}</Link>;
  return <div className="m-kpi2" style={style}>{contenu}</div>;
};

export const Bloc = ({ titre, sousTitre, action, children }) => (
  <div className="m-card">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div className="m-section-title" style={{ margin: 0 }}>{titre}</div>
        {sousTitre && <div style={{ fontSize: 10.5, color: 'var(--fm-muted)', marginTop: 2 }}>{sousTitre}</div>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

/** Barres horizontales : classement par zone, par superviseur, évolution… */
export const Barres = ({ donnees, format = fmtN, couleur = '#FF6900', maximum = 6 }) => {
  const liste = (donnees || []).filter(d => Number(d.valeur) > 0).slice(0, maximum);
  if (liste.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>Aucune donnée sur la période.</div>;
  }
  const max = Math.max(...liste.map(d => Number(d.valeur) || 0)) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {liste.map(d => (
        <div key={d.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <b style={{ color: 'var(--fm-muted)', flexShrink: 0 }}>{format(d.valeur)}</b>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(4, (Number(d.valeur) / max) * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${couleur}, ${couleur}aa)` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

/** Ligne « rang + nom + valeur » pour les classements de PDV. */
export const LigneClassement = ({ rang, titre, sousTitre, valeur, couleur = '#FF6900' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--fm-border)' }}>
    <div style={{
      width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11.5, fontWeight: 900, color: '#fff',
      background: rang <= 3 ? 'linear-gradient(135deg,#FF6900,#ff8c3a)' : 'rgba(255,255,255,0.08)',
    }}>{rang}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</div>
      {sousTitre && <div style={{ fontSize: 10.5, color: 'var(--fm-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sousTitre}</div>}
    </div>
    <b style={{ fontSize: 12.5, color: couleur, flexShrink: 0 }}>{valeur}</b>
  </div>
);

export const Chargement = ({ texte = 'Chargement…' }) => (
  <div className="m-card" style={{ textAlign: 'center', color: 'var(--fm-muted)', fontSize: 12.5 }}>⏳ {texte}</div>
);

export const Erreur = ({ texte = 'Données indisponibles pour cette période.' }) => (
  <div className="m-card" style={{ textAlign: 'center', color: 'var(--fm-muted)', fontSize: 12.5 }}>⚠️ {texte}</div>
);
