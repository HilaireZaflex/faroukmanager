import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct, couleurVariation, libellePriorite, classePriorite } from '../format';

const PRIO_FILTRES = [
  { id: 'TOUS', label: 'Tous' },
  { id: 'P1', label: 'P1 · Urgent' },
  { id: 'P2', label: 'P2 · Élevée' },
  { id: 'P3', label: 'P3 · Moyenne' },
  { id: 'P4', label: 'P4 · Faible' },
];

const METRIQUES = [
  { id: 'volume', label: 'Volume' },
  { id: 'real', label: 'Gain réel' },
];

const KPI = ({ label, value, sub, color }) => (
  <div className="m-kpi" style={{ borderLeftColor: color }}>
    <div className="lbl">{label}</div>
    <div className="val" style={{ color }}>{value}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

/**
 * « PDV à récupérer » — PDV de mon réseau dont l'activité baisse.
 * Le classement vient de l'analyse de performance (score de risque /100 sur 4 critères :
 * intensité de la baisse, persistance, baisse récente, impact financier).
 * Le backend restreint automatiquement aux PDV de l'utilisateur connecté.
 */
export default function MobileRecuperation() {
  const [mode, setMode] = useState('hebdo');
  const [metrique, setMetrique] = useState('volume');
  const [prio, setPrio] = useState('TOUS');

  const { data, isLoading, isError } = useQuery(
    ['m-recup', mode, metrique],
    () => api.get('/analyse-perf/recuperation', { params: { mode, metrique } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const k = data?.kpis || {};
  const liste = useMemo(() => {
    const arr = data?.pdvs || [];
    return prio === 'TOUS' ? arr : arr.filter(p => p.priorite === prio);
  }, [data, prio]);

  const unite = metrique === 'volume' ? 'F' : 'F';
  const libelleMetrique = metrique === 'volume' ? 'Volume' : 'Gain réel';

  return (
    <div>
      <div className="m-section-title">🎯 PDV à récupérer{data ? ` · ${fmtN(k.nb_pdv_analyses || 0)} analysés` : ''}</div>

      <div className="m-toggle">
        <button className={mode === 'hebdo' ? 'active' : ''} onClick={() => setMode('hebdo')}>🗓️ Semaine</button>
        <button className={mode === 'mensuel' ? 'active' : ''} onClick={() => setMode('mensuel')}>📅 Mois</button>
      </div>

      <div className="m-chips">
        {METRIQUES.map(m => (
          <button key={m.id} className={'m-chip' + (metrique === m.id ? ' active' : '')} onClick={() => setMetrique(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="m-grid m-grid-2" style={{ marginBottom: 12 }}>
        <KPI label="PDV en baisse" value={fmtN(k.nb_baisse)} color="#4a9eff" sub={libelleMetrique} />
        <KPI label="Perte de valeur" value={fmtCourt(k.perte_totale)} color="#ff4757" sub={`${unite} · récupérable`} />
        <KPI label="Urgents (P1)" value={fmtN(k.nb_p1)} color="#ff4757" sub="score le plus élevé" />
        <KPI label="Élevés (P2)" value={fmtN(k.nb_p2)} color="#ffa502" sub="à traiter ensuite" />
      </div>

      <div className="m-chips">
        {PRIO_FILTRES.map(p => (
          <button key={p.id} className={'m-chip' + (prio === p.id ? ' active' : '')} onClick={() => setPrio(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="m-empty">Analyse en cours…</div>}
      {isError && <div className="m-empty">Impossible de charger l'analyse.<br />Vérifiez votre connexion.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">
          Aucun PDV de votre réseau n'est en baisse sur cette période. 👍
        </div>
      )}

      {liste.slice(0, 200).map(p => (
        <Link key={p.pdv_id} to={`/m/pdv/${p.pdv_id}`} className="m-item">
          <div className="m-item-top">
            <div className="m-item-title">{p.nom || `PDV ${p.numero_pdv}`}</div>
            <span className={'m-badge ' + classePriorite(p.priorite)}>{libellePriorite(p.priorite)}</span>
          </div>
          <div className="m-item-sub">
            N° {p.numero_pdv}
            {p.quartier ? ` · ${p.quartier}` : ''}
            {p.zone ? ` · ${p.zone}` : ''}
            {p.superviseur ? ` · Sup. ${p.superviseur}` : ''}
          </div>
          <div className="m-item-metrics">
            <div>Score risque<b>{fmtN(p.score)} / 100</b></div>
            <div>Perte<b>{fmtCourt(p.perte_valeur)}</b></div>
            <div>Baisse récente<b style={{ color: couleurVariation(p.var_recente) }}>{fmtPct(p.var_recente)}</b></div>
            <div>Périodes en baisse<b>{fmtN(p.nb_baisses)}</b></div>
          </div>
          <div className="m-progress">
            <i style={{ width: `${Math.max(0, Math.min(100, Number(p.score) || 0))}%` }} />
          </div>
        </Link>
      ))}

      {liste.length > 200 && (
        <div className="m-empty">200 PDV affichés sur {fmtN(liste.length)}. Affinez avec les filtres.</div>
      )}
    </div>
  );
}
