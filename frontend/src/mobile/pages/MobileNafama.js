import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct, MOIS } from '../format';
import { Kpi, Bloc, Barres, LigneClassement, Chargement, Erreur } from '../dashUi';

const aujourdHui = new Date();

export default function MobileNafama() {
  const [annee, setAnnee] = useState(aujourdHui.getFullYear());
  const [mois, setMois] = useState(aujourdHui.getMonth() + 1);

  const { data, isLoading, isError } = useQuery(
    ['m-nafama', annee, mois],
    () => api.get('/nafama/monthly/overview', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: topData } = useQuery(
    ['m-nafama-top', annee, mois],
    () => api.get('/nafama/monthly/top', { params: { annee, mois, limit: 5 } }).then(r => r.data),
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

  const superviseurs = Object.entries(data?.ca_by_superviseur || {})
    .map(([label, valeur]) => ({ label, valeur }))
    .sort((a, b) => b.valeur - a.valeur);

  const top = Array.isArray(topData) ? topData.slice(0, 5) : (topData?.top || []).slice(0, 5);

  return (
    <div>
      <div className="m-hero">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', lineHeight: 1.15 }}>Dashboard NAFAMA</div>
            <div className="m-hero-role">Mensuel · Chiffre d'affaires</div>
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
            <Kpi icone="💰" label="CA du mois" valeur={fmtCourt(data.ca_total)}
              sub={data.evolution_pct != null ? `${data.evolution_pct > 0 ? '+' : ''}${fmtPct(data.evolution_pct)} vs mois -1` : 'Mois précédent indisponible'}
              couleur="#FF6900" />
            <Kpi icone="🏪" label="PDV actifs" valeur={fmtN(data.nb_pdv_actifs)}
              sub={`${fmtN(data.nb_pdv_inactifs)} inactifs`} couleur="#22c55e" to="/m/pdv" />
            <Kpi icone="📊" label="CA moyen / PDV" valeur={fmtCourt(data.ca_moyen)}
              sub="Sur le mois" couleur="#7c5cff" />
            <Kpi icone="✨" label="Nouveaux PDV" valeur={fmtN(data.nb_nouveaux_pdv)}
              sub="Ouverts ce mois" couleur="#4a9eff" />
          </div>

          <Bloc titre="CA par superviseur" sousTitre={`Top ${Math.min(6, superviseurs.length)} · ${MOIS[mois]} ${annee}`}>
            <Barres donnees={superviseurs} format={fmtCourt} maximum={6} couleur="#00b8a9" />
          </Bloc>

          <Bloc titre="Top 5 PDV" sousTitre="Meilleurs chiffres d'affaires">
            {top.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>Classement indisponible.</div>
              : top.map((p, i) => (
                <LigneClassement key={p.numero_pdv || i} rang={p.rang || i + 1}
                  titre={p.nom || '—'}
                  sousTitre={`${p.numero_pdv || ''} · ${p.zone || p.quartier || ''}`}
                  valeur={fmtCourt(p.ca)} couleur="#63e6a0" />
              ))}
          </Bloc>
        </>
      )}
    </div>
  );
}
