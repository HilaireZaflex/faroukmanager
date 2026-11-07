import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct, MOIS } from '../format';
import { Kpi, Bloc, Barres, LigneClassement, Chargement, Erreur } from '../dashUi';

const aujourdHui = new Date();

export default function MobileOMy() {
  const [annee, setAnnee] = useState(aujourdHui.getFullYear());
  const [mois, setMois] = useState(aujourdHui.getMonth() + 1);

  const { data, isLoading, isError } = useQuery(
    ['m-omy', annee, mois],
    () => api.get('/dashboard/monthly', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: classement } = useQuery(
    ['m-omy-top', annee, mois],
    () => api.get('/dashboard/classements', { params: { annee, mois, n: 5 } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const decaler = (pas) => {
    let m = mois + pas;
    let a = annee;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMois(m); setAnnee(a);
  };

  const estMoisCourant = annee === aujourdHui.getFullYear() && mois === aujourdHui.getMonth() + 1;

  const zones = Object.entries(data?.ca_by_zone || {})
    .map(([label, valeur]) => ({ label, valeur }))
    .sort((a, b) => b.valeur - a.valeur);

  const top = (classement?.top || []).slice(0, 5);

  return (
    <div>
      <div className="m-hero">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', lineHeight: 1.15 }}>Dashboard OMY</div>
            <div className="m-hero-role">Mensuel · Réseau Orange Money</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="m-chip" onClick={() => decaler(-1)} aria-label="Mois précédent" style={{ padding: '6px 10px' }}>‹</button>
            <div style={{ textAlign: 'center', minWidth: 96 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{MOIS[mois]}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fm-muted)' }}>{annee}</div>
            </div>
            <button className="m-chip" onClick={() => decaler(1)} disabled={estMoisCourant}
              aria-label="Mois suivant" style={{ padding: '6px 10px', opacity: estMoisCourant ? 0.4 : 1 }}>›</button>
          </div>
        </div>
      </div>

      {isLoading && <Chargement />}
      {isError && <Erreur />}

      {data && (
        <>
          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi icone="💸" label="Montant transaction" valeur={fmtCourt(data.total_montant_transaction || data.total_ca)}
              sub="Dépôts + retraits" couleur="#FF6900" />
            <Kpi icone="📈" label="Montant CA" valeur={fmtCourt(data.total_montant_ca)}
              sub={fmtPct(data.ratio_ca_transaction)} couleur="#22c55e" />
            <Kpi icone="🏦" label="Commission PDG" valeur={fmtCourt(data.total_commission_pdg)}
              sub="Part réseau" couleur="#7c5cff" />
            <Kpi icone="🏪" label="PDV actifs" valeur={fmtN(data.active_pdvs)}
              sub={`${fmtN(data.total_pdvs)} PDV · ${fmtPct(data.taux_activite)}`} couleur="#4a9eff" to="/m/pdv" />
          </div>

          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi icone="🔄" label="Opérations" valeur={fmtN(data.total_operations)}
              sub={`${fmtN(data.total_depots)} dépôts`} couleur="#ffa502" />
            <Kpi icone="📊" label="CA moyen / PDV" valeur={fmtCourt(data.average_ca)}
              sub="Sur le mois" couleur="#00b8a9" />
          </div>

          <Bloc titre="CA par zone" sousTitre={`${MOIS[mois]} ${annee}`}>
            <Barres donnees={zones} format={fmtCourt} maximum={8} />
          </Bloc>

          <Bloc titre="Top 5 PDV" sousTitre="Classement par volume de transactions" action={
            <span style={{ fontSize: 10.5, color: 'var(--fm-orange)', fontWeight: 800 }}>TOP {top.length}</span>
          }>
            {top.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>Classement indisponible.</div>
              : top.map(p => (
                <LigneClassement key={p.pdv_id || p.numero_pdv} rang={p.rang}
                  titre={p.nom || '—'}
                  sousTitre={`${p.numero_pdv || ''} · ${p.zone || p.quartier || ''}`}
                  valeur={fmtCourt(p.montant_transaction || p.ca)} />
              ))}
          </Bloc>
        </>
      )}
    </div>
  );
}
