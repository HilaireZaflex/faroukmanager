import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct } from '../format';

const COULEUR_SCORE = (s) => (s >= 70 ? '#22c55e' : s >= 50 ? '#ffa502' : '#ff4757');

const LIBELLES_DETAIL = {
  objectif: "Atteinte de l'objectif",
  rendement: 'Rendement (gain/million)',
  productivite: 'Productivité (volume/PDV actif)',
  activation_retention: 'Activation et rétention',
  ruptures: 'Ruptures (PDV à l’arrêt)',
  qualite: 'Qualité',
};

const TRIS = [
  { id: 'score', label: 'Score' },
  { id: 'activation', label: 'Activation' },
  { id: 'real', label: 'Gain réel' },
  { id: 'volume', label: 'Volume' },
];

/**
 * « Équipe & Réseau » — le classement des superviseurs avec leur score /100.
 * Le score est calculé par le serveur sur 6 critères pondérés ; le détail est affiché
 * pour que chacun comprenne d'où vient sa note.
 */
export default function MobileEquipe() {
  const [mode, setMode] = useState('hebdo');
  const [tri, setTri] = useState('score');
  const [ouvert, setOuvert] = useState(null);

  const { data, isLoading, isError } = useQuery(
    ['m-equipe', mode],
    () => api.get('/analyse-perf/superviseurs', { params: { mode } }).then(r => r.data),
    { staleTime: 180000 }
  );

  const lignes = useMemo(() => {
    const arr = data?.lignes || [];
    const cle = { score: 'score', activation: 'activation', real: 'real', volume: 'volume' }[tri] || 'score';
    return arr.slice().sort((a, b) => (Number(b[cle]) || 0) - (Number(a[cle]) || 0));
  }, [data, tri]);

  const poids = data?.poids || {};
  const reseau = data?.reseau || {};
  const moyenne = lignes.length
    ? Math.round(lignes.reduce((s, l) => s + (Number(l.score) || 0), 0) / lignes.length)
    : null;

  return (
    <div>
      <div className="m-section-title">
        👥 Équipe &amp; Réseau{data?.periode_courante ? ` · ${data.periode_courante}` : ''}
      </div>

      <div className="m-toggle">
        <button className={mode === 'hebdo' ? 'active' : ''} onClick={() => setMode('hebdo')}>🗓️ Semaine</button>
        <button className={mode === 'mensuel' ? 'active' : ''} onClick={() => setMode('mensuel')}>📅 Mois</button>
      </div>

      <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
        <div className="m-kpi" style={{ borderLeftColor: moyenne == null ? '#8a94a6' : COULEUR_SCORE(moyenne) }}>
          <div className="lbl">Score moyen</div>
          <div className="val" style={{ color: moyenne == null ? 'var(--fm-muted)' : COULEUR_SCORE(moyenne) }}>
            {moyenne == null ? '—' : `${moyenne} / 100`}
          </div>
          <div className="sub">{fmtN(lignes.length)} superviseur(s)</div>
        </div>
        <div className="m-kpi" style={{ borderLeftColor: '#4a9eff' }}>
          <div className="lbl">Activation réseau</div>
          <div className="val" style={{ color: '#4a9eff' }}>{fmtPct(reseau.activation)}</div>
          <div className="sub">PDV ayant opéré</div>
        </div>
      </div>

      <div className="m-chips">
        {TRIS.map(t => (
          <button key={t.id} className={'m-chip' + (tri === t.id ? ' active' : '')} onClick={() => setTri(t.id)}>
            Trier : {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="m-empty">Chargement de l'équipe…</div>}
      {isError && <div className="m-empty">Impossible de charger l'équipe.<br />Vérifiez votre connexion.</div>}
      {!isLoading && !isError && lignes.length === 0 && (
        <div className="m-empty">Aucune donnée superviseur sur cette période.</div>
      )}

      {lignes.map((l, i) => {
        const score = Number(l.score) || 0;
        const estOuvert = ouvert === l.nom;
        return (
          <div key={l.nom} className="m-item" onClick={() => setOuvert(estOuvert ? null : l.nom)}
            style={{ cursor: 'pointer' }}>
            <div className="m-item-top">
              <div className="m-item-title">
                <span style={{ color: 'var(--fm-muted)', fontWeight: 800, marginRight: 6 }}>
                  {tri === 'score' ? `#${i + 1}` : ''}
                </span>
                {l.nom}
              </div>
              <span className="m-badge" style={{ background: `${COULEUR_SCORE(score)}22`, color: COULEUR_SCORE(score), borderColor: `${COULEUR_SCORE(score)}66` }}>
                {fmtN(score)} / 100
              </span>
            </div>
            <div className="m-item-sub">{fmtN(l.nb_pdv)} PDV · {fmtN(l.nb_actifs)} actifs</div>

            <div className="m-item-metrics">
              <div>Activation<b>{fmtPct(l.activation)}</b></div>
              <div>Gain réel<b>{fmtCourt(l.real)}</b></div>
              <div>Gain / million<b>{fmtN(l.real_par_million, 0)}</b></div>
              <div>Ruptures<b>{fmtN(l.nb_ruptures)}</b></div>
            </div>
            <div className="m-progress">
              <i style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: COULEUR_SCORE(score) }} />
            </div>

            {estOuvert && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--fm-border)', paddingTop: 10 }}>
                <div className="m-kv"><span>Objectif de gain</span><b>{l.objectif ? fmtCourt(l.objectif) : 'Non défini'}</b></div>
                <div className="m-kv"><span>Réalisation</span><b>{l.objectif ? fmtPct(l.taux_realisation) : '—'}</b></div>
                <div className="m-kv"><span>Rendement</span><b>{fmtN(l.rendement != null ? l.rendement * 100 : null, 3)} %</b></div>
                <div className="m-kv"><span>Volume par PDV actif</span><b>{fmtCourt(l.volume_par_actif)}</b></div>
                <div className="m-kv"><span>Rétention</span><b>{fmtPct(l.retention)}</b></div>
                <div className="m-kv"><span>Nouveaux / perdus</span><b>{fmtN(l.nouveaux)} / {fmtN(l.perdus)}</b></div>
                <div className="m-kv"><span>Taux de rupture</span><b>{fmtPct(l.taux_rupture)}</b></div>
                <div className="m-kv"><span>Qualité</span><b>{fmtPct(l.qualite)}</b></div>

                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', margin: '12px 0 6px' }}>
                  D'où vient le score ?
                </div>
                {Object.entries(l.score_detail || {}).map(([cle, val]) => (
                  <div key={cle} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                      <span style={{ color: 'var(--fm-muted)' }}>
                        {LIBELLES_DETAIL[cle] || cle}
                        {poids[cle] ? ` (sur ${poids[cle]})` : ''}
                      </span>
                      <b>{fmtN(val, 1)}</b>
                    </div>
                    <div className="m-progress" style={{ height: 4 }}>
                      <i style={{ width: `${poids[cle] ? (Number(val) / Number(poids[cle])) * 100 : 0}%`, background: '#4a9eff' }} />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--fm-muted)', marginTop: 8, lineHeight: 1.5 }}>
                  Touchez la carte pour replier le détail.
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
