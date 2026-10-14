import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct, couleurVariation, classePriorite, libellePriorite } from '../format';

const KPI = ({ label, value, sub, color }) => (
  <div className="m-kpi" style={{ borderLeftColor: color }}>
    <div className="lbl">{label}</div>
    <div className="val" style={{ color }}>{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

const Barre = ({ pct, color }) => (
  <div className="m-progress">
    <i style={{ width: `${Math.max(0, Math.min(100, Number(pct) || 0))}%`, background: color }} />
  </div>
);

/**
 * « Pilotage » — le tableau de bord stratégique du directeur.
 * Chaque indicateur est accompagné d'une explication en français simple (bouton « Que veulent dire ces chiffres ? »).
 */
export default function MobilePilotage() {
  const [mode, setMode] = useState('hebdo');
  const [legende, setLegende] = useState(false);

  const { data, isLoading, isError } = useQuery(
    ['m-pilotage', mode],
    () => api.get('/analyse-perf/synthese', { params: { mode, niveau: 'zone' } }).then(r => r.data),
    { staleTime: 180000 }
  );
  const { data: recup } = useQuery(
    ['m-pilotage-recup', mode],
    () => api.get('/analyse-perf/recuperation', { params: { mode, metrique: 'volume' } }).then(r => r.data),
    { staleTime: 180000 }
  );

  const k = data?.kpis || {};
  const zones = data?.lignes || [];
  const topRecup = (recup?.pdvs || []).slice(0, 5);
  const maxZoneReal = Math.max(1, ...zones.map(z => Number(z.real) || 0));

  return (
    <div>
      <div className="m-section-title">
        📊 Pilotage{data?.periode_courante ? ` · ${data.periode_courante}` : ''}
      </div>

      <div className="m-toggle">
        <button className={mode === 'hebdo' ? 'active' : ''} onClick={() => setMode('hebdo')}>🗓️ Semaine</button>
        <button className={mode === 'mensuel' ? 'active' : ''} onClick={() => setMode('mensuel')}>📅 Mois</button>
      </div>

      <button className="m-btn secondary" style={{ marginBottom: 12, padding: 11, fontSize: 13 }}
        onClick={() => setLegende(v => !v)}>
        ❓ Que veulent dire ces chiffres ?
      </button>

      {legende && (
        <div className="m-card" style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--fm-text)' }}>
          <div><b>Gain réel</b> : ce que l'entreprise gagne réellement sur la période.</div>
          <div><b>Gain / million</b> : ce qu'on gagne pour chaque million échangé. Plus c'est haut, mieux c'est.</div>
          <div><b>Volume</b> : le total des transactions réalisées.</div>
          <div><b>Activation</b> : la part des PDV qui ont fait au moins une opération.</div>
          <div><b>Gisements</b> : des PDV qui font beaucoup de volume mais rapportent peu — du gain à aller chercher.</div>
          <div><b>Ruptures</b> : des PDV importants (Top 100) qui n'ont plus rien fait depuis 2 semaines ou plus.</div>
          <div><b>Concentration Top 100</b> : la part du volume qui dépend des 100 plus gros PDV. Trop élevée = risque.</div>
        </div>
      )}

      {isLoading && <div className="m-empty">Chargement du pilotage…</div>}
      {isError && <div className="m-empty">Impossible de charger le pilotage.<br />Vérifiez votre connexion.</div>}

      {!isLoading && !isError && (
        <>
          <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
            <KPI label="Gain réel" value={fmtCourt(k.real)} color="#FF6900"
              sub={k.var_real == null ? 'période précédente inconnue' : `${fmtPct(k.var_real)} vs préc.`} />
            <KPI label="Gain / million" value={fmtN(k.real_par_million, 0)} color="#00d68f"
              sub={k.var_rendement == null ? 'rendement' : `${fmtPct(k.var_rendement)} vs préc.`} />
            <KPI label="Volume" value={fmtCourt(k.volume)} color="#4a9eff"
              sub={k.var_volume == null ? 'transactions' : `${fmtPct(k.var_volume)} vs préc.`} />
            <KPI label="Activation" value={`${fmtN(k.activation, 1)} %`} color="#a29bfe"
              sub={`${fmtN(k.nb_actifs)} / ${fmtN(k.nb_pdv_total)} PDV`} />
            <KPI label="Gisements" value={fmtN(k.nb_gisements)} color="#ffa502"
              sub={`${fmtN(k.pct_volume_gisements, 1)} % du volume`} />
            <KPI label="Ruptures Top 100" value={fmtN(k.ruptures_top100)} color="#ff4757"
              sub="à relancer vite" />
          </div>

          <div className="m-card">
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              🎯 Objectif de gain réel
            </div>
            {k.objectif ? (
              <>
                <div className="m-kv"><span>Objectif</span><b>{fmtCourt(k.objectif)}</b></div>
                <div className="m-kv"><span>Réalisé</span><b>{fmtCourt(k.real)}</b></div>
                <div className="m-kv"><span>Taux de réalisation</span><b>{fmtPct(k.taux_realisation)}</b></div>
                <Barre pct={k.taux_realisation} color={Number(k.taux_realisation) >= 100 ? '#22c55e' : '#FF6900'} />
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--fm-muted)' }}>
                Aucun objectif défini pour cette période. Il se règle dans l'onglet Configuration du bureau.
              </div>
            )}
          </div>

          <div className="m-card">
            <div className="m-kv"><span>Concentration Top 100</span><b>{fmtPct(k.concentration_top100)}</b></div>
            <div className="m-kv"><span>Flux net (dépôts − retraits)</span><b>{fmtCourt(k.flux_net)}</b></div>
            <div className="m-kv"><span>Volume par PDV actif</span><b>{fmtCourt(k.volume_par_actif)}</b></div>
            <div className="m-kv"><span>Gain par PDV actif</span><b>{fmtN(k.real_par_actif, 0)}</b></div>
          </div>

          <div className="m-section-title">🗺️ Par zone ({fmtN(zones.length)})</div>
          {zones.length === 0 && <div className="m-empty">Aucune donnée par zone sur cette période.</div>}
          {zones.map(z => (
            <div key={z.nom} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{z.nom}</div>
                <span className={'m-badge ' + (Number(z.var_real) < 0 ? 'red' : 'green')}>
                  {z.var_real == null ? '—' : fmtPct(z.var_real)}
                </span>
              </div>
              <div className="m-item-metrics">
                <div>Gain réel<b>{fmtCourt(z.real)}</b></div>
                <div>Activation<b>{fmtN(z.activation, 1)} %</b></div>
                <div>PDV<b>{fmtN(z.nb_pdv)}</b></div>
                <div>Ruptures<b>{fmtN(z.nb_ruptures)}</b></div>
              </div>
              <Barre pct={(Number(z.real) / maxZoneReal) * 100} color="#4a9eff" />
            </div>
          ))}

          <div className="m-section-title">🎯 Les 5 PDV les plus à risque</div>
          {topRecup.length === 0 && <div className="m-empty">Aucun PDV en baisse détecté. 👍</div>}
          {topRecup.map(p => (
            <Link key={p.pdv_id} to={`/m/pdv/${p.pdv_id}`} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.nom || `PDV ${p.numero_pdv}`}</div>
                <span className={'m-badge ' + classePriorite(p.priorite)}>{libellePriorite(p.priorite)}</span>
              </div>
              <div className="m-item-sub">
                N° {p.numero_pdv}
                {p.quartier ? ` · ${p.quartier}` : ''}
                {p.superviseur ? ` · Sup. ${p.superviseur}` : ''}
              </div>
              <div className="m-item-metrics">
                <div>Score risque<b>{fmtN(p.score)} / 100</b></div>
                <div>Perte<b>{fmtCourt(p.perte_valeur)}</b></div>
                <div>Baisse récente<b style={{ color: couleurVariation(p.var_recente) }}>{fmtPct(p.var_recente)}</b></div>
              </div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
