import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { fmtN, libelleStatut, classeStatut, nomComplet } from '../format';

const FILTRES = [
  { id: 'TOUS',         label: 'Tous',         icone: '▦', couleur: '#FF6900' },
  { id: 'ACTIF',        label: 'Actifs',       icone: '✓', couleur: '#22c55e' },
  { id: 'RECUPERATION', label: 'À récupérer',  icone: '↻', couleur: '#ffa502' },
  { id: 'INACTIF',      label: 'Inactifs',     icone: '✕', couleur: '#ff4757' },
];

const COULEUR_STATUT = { ACTIF: '#22c55e', INACTIF: '#ff4757', RECUPERATION: '#ffa502', DESACTIVE: '#8a94a6' };

const couleurBordure = (s) => COULEUR_STATUT[(s || '').toUpperCase()] || '#7c5cff';

const libelleEspace = (role) => {
  const r = (role || '').toLowerCase().replace('userrole.', '');
  if (r === 'superviseur') return 'ESPACE SUPERVISEUR';
  if (r === 'developpeur' || r === 'commercial') return 'ESPACE DÉVELOPPEUR';
  if (r === 'teleconseillere') return 'ESPACE TÉLÉCONSEILLÈRE';
  return 'ESPACE ENCADREMENT';
};

export default function MobilePDV() {
  const user = useAuthStore(s => s.user);
  const [paramsUrl] = useSearchParams();
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState((paramsUrl.get('statut') || 'TOUS').toUpperCase());

  const { data, isLoading, isError } = useQuery('m-pdvs',
    () => api.get('/pdvs', { params: { limit: 1000 } }).then(r => r.data), { staleTime: 120000 });

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return (data || []).filter(p => {
      if (statut !== 'TOUS' && (p.statut || '').toUpperCase() !== statut) return false;
      if (!terme) return true;
      return [p.nom, p.numero_pdv, p.numero_personnel, p.quartier, p.zone, p.superviseur, p.nom_gerant, p.telephone]
        .some(v => (v || '').toString().toLowerCase().includes(terme));
    });
  }, [data, q, statut]);

  return (
    <div>
      {/* Héros */}
      <div className="m-hero">
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: "#ffb066", textTransform: "uppercase", marginBottom: 6 }}>Farouk Manager</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.62)' }}>Bonjour 👋</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1, marginTop: 2 }}>
          {nomComplet(user)}
        </div>
        <div className="m-hero-role">{libelleEspace(user?.role)}</div>
      </div>

      {/* Titre + total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>🏪 Mes points de vente</div>
        <span style={{
          fontSize: 11.5, fontWeight: 800, color: '#ffb066',
          background: 'rgba(255,105,0,0.14)', border: '1px solid rgba(255,105,0,0.35)',
          padding: '5px 12px', borderRadius: 999,
        }}>Total : {fmtN((data || []).length)}</span>
      </div>

      {/* Recherche */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="m-search" style={{ flex: 1, marginBottom: 0 }}>
          <span>🔎</span>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Rechercher un PDV (nom, numéro, quartier, gérant…)" inputMode="search" />
          {q && <button className="m-chip" style={{ padding: '4px 9px' }} onClick={() => setQ('')}>✕</button>}
        </div>
        <div style={{
          width: 48, flexShrink: 0, borderRadius: 12, border: '1px solid var(--fm-border)',
          background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
        }}>⚙</div>
      </div>

      {/* Puces */}
      <div className="m-chips">
        {FILTRES.map(f => {
          const actif = statut === f.id;
          return (
            <button key={f.id} className="m-chip" onClick={() => setStatut(f.id)}
              style={actif
                ? { background: 'linear-gradient(135deg,#FF6900,#ff8c3a)', borderColor: '#FF6900', color: '#fff' }
                : { borderColor: `${f.couleur}55`, color: f.couleur }}>
              <span style={{ marginRight: 4 }}>{f.icone}</span>{f.label}
            </button>
          );
        })}
      </div>

      {isLoading && <div className="m-empty">Chargement de votre réseau…</div>}
      {isError && <div className="m-empty">Impossible de charger les PDV.</div>}
      {!isLoading && !isError && liste.length === 0 && <div className="m-empty">Aucun PDV ne correspond.</div>}

      {liste.map(p => {
        const col = couleurBordure(p.statut);
        const statutLabel = libelleStatut(p.statut);
        return (
          <Link key={p.id} to={`/m/pdv/${p.id}`} style={{
            display: 'block', textDecoration: 'none', marginBottom: 11,
            borderRadius: 16, padding: '13px 14px',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #12121c 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderLeft: `4px solid ${col}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                background: `${col}26`, border: `1px solid ${col}66`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
              }}>🏪</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.nom || `PDV ${p.numero_pdv}`}
                </div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  N° {p.numero_pdv}
                  {p.quartier ? ` · ${p.quartier}` : ''}
                  {p.zone ? ` · ${p.zone}` : ''}
                </div>
              </div>

              <span style={{
                fontSize: 9, fontWeight: 900, letterSpacing: 0.4, textTransform: 'uppercase',
                padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                color: col, background: `${col}1f`, border: `1px solid ${col}55`,
              }}>{statutLabel}</span>
            </div>

            <div style={{ display: 'flex', gap: 18, marginTop: 11, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>
                Type<div style={{ fontSize: 12, color: '#e8ecf3', fontWeight: 800 }}>{p.type_pdv || '—'}</div>
              </div>
              {p.medaille && p.medaille !== 'AUCUNE' ? (
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>
                  Médaille<div style={{ fontSize: 12, color: '#e8ecf3', fontWeight: 800 }}>🏅 {p.medaille}</div>
                </div>
              ) : null}
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)', minWidth: 0 }}>
                Gérant<div style={{ fontSize: 12, color: '#e8ecf3', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom_gerant || '—'}</div>
              </div>
              <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>›</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
