import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { fmtN, fmtDate, libelleStatutProspect, classeStatutProspect, nomComplet } from '../format';

const FILTRES = [
  { id: 'TOUTES',      label: 'Toutes',    icone: '▦' },
  { id: 'NOUVELLE',    label: 'Nouvelles', icone: '✦' },
  { id: 'EN_VISITE',   label: 'En visite', icone: '📍' },
  { id: 'ATTENTE',     label: 'En attente', icone: '◷', statuts: ['VALIDEE_DEV', 'EN_ATTENTE_RC', 'APPROUVEE_RC'] },
  { id: 'A_ACTIVER',   label: 'À activer', icone: '✓', statuts: ['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE'] },
];

const correspond = (p, f) =>
  f.statuts ? f.statuts.includes((p.status || '').toUpperCase())
            : (p.status || '').toUpperCase() === f.id;

const KpiCard = ({ icone, label, valeur, couleur, to }) => (
  <Link to={to} className="m-kpi2" style={{
    background: `linear-gradient(140deg, ${couleur}40 0%, ${couleur}14 55%, #101018 100%)`,
    border: `1px solid ${couleur}55`,
  }}>
    <div className="m-kpi2-ico" style={{ background: `${couleur}33`, border: `1px solid ${couleur}66` }}>{icone}</div>
    <div className="m-kpi2-body">
      <div className="m-kpi2-lbl">{label}</div>
      <div className="m-kpi2-val">{valeur}</div>
    </div>
    <div className="m-kpi2-chev">›</div>
  </Link>
);

export default function MobileProspection() {
  const user = useAuthStore(s => s.user);
  const [q, setQ] = useState('');
  const [parametres] = useSearchParams();
  // Une notification push peut ouvrir directement la liste filtrée
  // (ex. « visite terrain à effectuer » → /m/prospection?filtre=EN_VISITE).
  const filtreDemande = (parametres.get('filtre') || '').toUpperCase();
  const [filtre, setFiltre] = useState(
    FILTRES.some(f => f.id === filtreDemande) ? filtreDemande : 'TOUTES'
  );

  const { data, isLoading, isError } = useQuery('m-prospects',
    () => api.get('/prospects', { params: { limit: 200 } }).then(r => r.data), { staleTime: 60000 });

  const tous = data || [];

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    const f = FILTRES.find(x => x.id === filtre) || FILTRES[0];
    return tous.filter(p => {
      if (filtre !== 'TOUTES' && !correspond(p, f)) return false;
      if (!terme) return true;
      return [p.reference, p.nom, p.prenom, p.telephone_principal, p.quartier, p.pdv_nom_lieu]
        .some(v => (v || '').toString().toLowerCase().includes(terme));
    });
  }, [tous, q, filtre]);

  const compte = (statuts) => tous.filter(p => statuts.includes((p.status || '').toUpperCase())).length;

  return (
    <div>
      <div className="m-hero">
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: "#ffb066", textTransform: "uppercase", marginBottom: 6 }}>Farouk Manager</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.62)' }}>Bonjour 👋</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1, marginTop: 2 }}>
          {nomComplet(user)}
        </div>
        <div className="m-hero-role">ESPACE DÉVELOPPEUR</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>👥 Ma prospection</div>
        <span style={{
          fontSize: 11.5, fontWeight: 800, color: '#ffb066',
          background: 'rgba(255,105,0,0.14)', border: '1px solid rgba(255,105,0,0.35)',
          padding: '5px 12px', borderRadius: 999,
        }}>Total : {fmtN(tous.length)}</span>
      </div>

      <div className="m-kpi-grid">
        <KpiCard icone="📋" label="Visites à faire" valeur={fmtN(compte(['EN_VISITE']))} couleur="#ffa502" to="/m/planning" />
        <KpiCard icone="⚡" label="Activations à faire" valeur={fmtN(compte(['PUCE_ATTRIBUEE', 'EN_ATTENTE_CONFORMITE']))} couleur="#4a9eff" to="/m/activations" />
        <KpiCard icone="📁" label="En attente RC" valeur={fmtN(compte(['VALIDEE_DEV', 'EN_ATTENTE_RC', 'APPROUVEE_RC']))} couleur="#a855f7" to="/m/prospection" />
        <KpiCard icone="✅" label="Activées" valeur={fmtN(compte(['PUCE_ACTIVEE']))} couleur="#22c55e" to="/m/activations" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="m-search" style={{ flex: 1, marginBottom: 0 }}>
          <span>🔎</span>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Référence, nom, téléphone, quartier…" inputMode="search" />
          {q && <button className="m-chip" style={{ padding: '4px 9px' }} onClick={() => setQ('')}>✕</button>}
        </div>
        <div style={{
          width: 48, flexShrink: 0, borderRadius: 12, border: '1px solid var(--fm-border)',
          background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
        }}>⚙</div>
      </div>

      <div className="m-chips">
        {FILTRES.map(f => (
          <button key={f.id} className={'m-chip' + (filtre === f.id ? ' active' : '')} onClick={() => setFiltre(f.id)}
            style={filtre === f.id ? { background: 'linear-gradient(135deg,#FF6900,#ff8c3a)', borderColor: '#FF6900', color: '#fff' } : {}}>
            {f.icone} {f.label}
          </button>
        ))}
      </div>

      <Link to="/m/prospect/nouveau" className="m-btn" style={{ marginBottom: 14 }}>➕ Nouveau prospect</Link>

      {isLoading && <div className="m-empty">Chargement de vos demandes…</div>}
      {isError && <div className="m-empty">Impossible de charger la prospection.</div>}
      {!isLoading && !isError && liste.length === 0 && <div className="m-empty">Aucune demande ne correspond.</div>}

      {liste.map(p => (
        <Link key={p.id} to={`/m/prospect/${p.id}`} style={{
          display: 'block', textDecoration: 'none', marginBottom: 11,
          borderRadius: 16, padding: '13px 14px',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #12121c 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderLeft: `4px solid ${p.status === 'EN_VISITE' ? '#ffa502' : p.status === 'PUCE_ACTIVEE' ? '#22c55e' : '#7c5cff'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 11, flexShrink: 0,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>👤</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {`${p.prenom || ''} ${p.nom || ''}`.trim() || p.reference}
              </div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                Réf. {p.reference}{p.quartier ? ` · ${p.quartier}` : ''}{p.telephone_principal ? ` · ${p.telephone_principal}` : ''}
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: 0.4, textTransform: 'uppercase',
              padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap',
              color: '#ffc048', background: 'rgba(255,165,2,0.16)', border: '1px solid rgba(255,165,2,0.45)',
            }}>{libelleStatutProspect(p.status)}</span>
          </div>

          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>
              📅 Soumise le<div style={{ fontSize: 11.5, color: '#e8ecf3', fontWeight: 700 }}>{fmtDate(p.submitted_at || p.created_at)}</div>
            </div>
            {p.qualification ? (
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>
                🏅 Qualité<div style={{ fontSize: 11.5, color: '#e8ecf3', fontWeight: 700 }}>{p.qualification}</div>
              </div>
            ) : null}
            {p.visit_assigned_to ? (
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>
                📍 Visite<div style={{ fontSize: 11.5, color: '#e8ecf3', fontWeight: 700 }}>{p.visit_assigned_to.nom}</div>
              </div>
            ) : null}
            {p.puce_assigned_to ? (
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>
                ⚡ Activation<div style={{ fontSize: 11.5, color: '#e8ecf3', fontWeight: 700 }}>{p.puce_assigned_to.nom}</div>
              </div>
            ) : null}
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>›</span>
          </div>
        </Link>
      ))}

      {tous.length >= 200 && <div className="m-empty">200 demandes affichées (maximum). Affinez avec la recherche.</div>}
    </div>
  );
}
