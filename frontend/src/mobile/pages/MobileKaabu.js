import React, { useEffect, useState } from 'react';
import { useQuery } from 'react-query';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct } from '../format';
import { Kpi, Bloc, Barres, Chargement, Erreur } from '../dashUi';

export default function MobileKaabu() {
  const { data: periodesData } = useQuery('m-kaabu-periods',
    () => api.get('/kaabu/periods').then(r => r.data), { staleTime: 300000 });

  const periodes = (periodesData?.semaines || []).slice();
  const [index, setIndex] = useState(null);

  // Par défaut : la dernière semaine disponible.
  useEffect(() => {
    if (index === null && periodes.length > 0) setIndex(periodes.length - 1);
  }, [periodes.length, index]);

  const periode = index != null ? periodes[index] : null;
  const annee = periode?.annee || new Date().getFullYear();
  const semaine = periode?.semaine || '';

  const { data, isLoading, isError } = useQuery(
    ['m-kaabu', annee, semaine],
    () => api.get('/kaabu/vue-ensemble', { params: { annee, semaine } }).then(r => r.data),
    { enabled: Boolean(semaine), staleTime: 120000 }
  );

  const { data: evolution } = useQuery(
    ['m-kaabu-evolution', annee],
    () => api.get('/kaabu/evolution', { params: { annee } }).then(r => r.data),
    { enabled: Boolean(annee), staleTime: 300000 }
  );

  const derniers = Array.isArray(evolution) ? evolution.slice(-8) : [];
  const segments = (data?.par_segment || [])
    .map(s => ({ label: s.segment, valeur: s.montant }))
    .sort((a, b) => b.valeur - a.valeur);

  const taux = data?.taux_activite != null
    ? (Number(data.taux_activite) <= 1 ? Number(data.taux_activite) * 100 : Number(data.taux_activite))
    : null;

  return (
    <div>
      <div className="m-hero">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', lineHeight: 1.15 }}>Dashboard KAABU</div>
            <div className="m-hero-role">Hebdomadaire · {annee}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="m-chip" onClick={() => setIndex(i => Math.max(0, (i ?? 0) - 1))}
              disabled={!index} aria-label="Semaine précédente" style={{ padding: '6px 10px', opacity: index ? 1 : 0.4 }}>‹</button>
            <div style={{ textAlign: 'center', minWidth: 88 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{semaine || '—'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fm-muted)' }}>{annee}</div>
            </div>
            <button className="m-chip" onClick={() => setIndex(i => Math.min(periodes.length - 1, (i ?? 0) + 1))}
              disabled={index == null || index >= periodes.length - 1}
              aria-label="Semaine suivante" style={{ padding: '6px 10px', opacity: index != null && index < periodes.length - 1 ? 1 : 0.4 }}>›</button>
          </div>
        </div>
      </div>

      {isLoading && <Chargement />}
      {isError && <Erreur />}

      {data && (
        <>
          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi icone="💵" label="Montant global" valeur={fmtCourt(data.montant_global)}
              sub={data.evolution_montant != null ? `${data.evolution_montant > 0 ? '+' : ''}${fmtPct(data.evolution_montant)} vs S-1` : 'Semaine précédente indisponible'}
              couleur="#FF6900" />
            <Kpi icone="🏪" label="PDV actifs" valeur={fmtN(data.actifs)}
              sub={`${fmtN(data.total_pdv)} PDV`} couleur="#22c55e" to="/m/pdv" />
            <Kpi icone="📶" label="Taux d'activité" valeur={taux != null ? fmtPct(taux) : '—'}
              sub={`${fmtN(data.inactifs)} inactifs`} couleur="#4a9eff" />
            <Kpi icone="🔄" label="Volume" valeur={fmtN(data.volume_kaabu)}
              sub={`${fmtN(data.volume_cashin)} cash-in`} couleur="#7c5cff" />
          </div>

          <Bloc titre="Cash-in / Cash-out" sousTitre={`Semaine ${semaine}`}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, padding: 10, borderRadius: 12, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.30)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--fm-muted)' }}>CASH-IN</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{fmtCourt(data.montant_cashin)}</div>
                <div style={{ fontSize: 10, color: 'var(--fm-muted)' }}>{fmtN(data.volume_cashin)} opérations</div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 12, background: 'rgba(255,105,0,0.10)', border: '1px solid rgba(255,105,0,0.30)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--fm-muted)' }}>CASH-OUT</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{fmtCourt(data.montant_cashout)}</div>
                <div style={{ fontSize: 10, color: 'var(--fm-muted)' }}>{fmtN(data.volume_cashout)} opérations</div>
              </div>
            </div>
          </Bloc>

          <Bloc titre="Par segment" sousTitre="Montants de la semaine">
            <Barres donnees={segments} format={fmtCourt} maximum={6} couleur="#ffa502" />
          </Bloc>

          <Bloc titre="Évolution" sousTitre="8 dernières semaines">
            <Barres
              donnees={derniers.map(s => ({ label: s.label || s.semaine, valeur: s.montant }))}
              format={fmtCourt} maximum={8} couleur="#00b8a9" />
          </Bloc>
        </>
      )}
    </div>
  );
}
