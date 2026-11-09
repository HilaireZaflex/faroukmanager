import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct, MOIS } from '../format';
import { Hero, Kpi, Bloc, Barres, LigneClassement, Chargement, Erreur } from '../ui';

const maintenant = new Date();

const ONGLETS = [
  { id: 'ensemble', label: "Vue d'ensemble" },
  { id: 'top',      label: 'Top PDV' },
  { id: 'inactifs', label: 'Inactifs' },
  { id: 'baisse',   label: 'En baisse' },
];

const Appel = ({ tel }) => tel
  ? <a className="m-btn" href={`tel:${tel}`} style={{ marginTop: 10, padding: 9, fontSize: 12.5 }}>📞 Appeler le gérant</a>
  : null;

export default function MobileNafama() {
  const [onglet, setOnglet] = useState('ensemble');
  const [mode, setMode] = useState('mensuel');       // mensuel | hebdo
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState(maintenant.getMonth() + 1);
  const [semaine, setSemaine] = useState(44);
  const estHebdo = mode === 'hebdo';
  const base = estHebdo ? '/nafama/weekly' : '/nafama/monthly';
  const periode = estHebdo ? { annee, semaine } : { annee, mois };

  const decaler = (pas) => {
    let m = mois + pas; let a = annee;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMois(m); setAnnee(a);
  };
  const estMoisCourant = annee === maintenant.getFullYear() && mois === maintenant.getMonth() + 1;
  const reculer = () => (estHebdo ? setSemaine(v => Math.max(1, v - 1)) : decaler(-1));
  const avancer = () => (estHebdo ? setSemaine(v => Math.min(52, v + 1)) : decaler(1));
  const donnees = estHebdo ? dataSem : data;

  const { data, isLoading, isError } = useQuery(['m-nafama', annee, mois],
    () => api.get('/nafama/monthly/overview', { params: { annee, mois } }).then(r => r.data),
    { enabled: !estHebdo, staleTime: 120000 });

  const { data: dataSem } = useQuery(['m-nafama-sem', annee, semaine],
    () => api.get('/nafama/weekly/overview', { params: { annee, semaine } }).then(r => r.data),
    { staleTime: 120000 });

  const { data: topData } = useQuery(['m-nafama-top', mode, annee, mois, semaine],
    () => api.get(`${base}/top`, { params: { ...periode, limit: 20 } }).then(r => r.data),
    { enabled: onglet === 'top', staleTime: 120000 });

  const { data: inactifs } = useQuery(['m-nafama-inactifs', mode, annee, mois, semaine],
    () => api.get(`${base}/inactive`, { params: periode }).then(r => r.data),
    { enabled: onglet === 'inactifs', staleTime: 120000 });

  const { data: baisse } = useQuery(['m-nafama-baisse', mode, annee, mois, semaine],
    () => api.get(`${base}/declining`, { params: { ...periode, seuil_pct: -10 } }).then(r => r.data),
    { enabled: onglet === 'baisse', staleTime: 120000 });

  const superviseurs = Object.entries(data?.ca_by_superviseur || {})
    .map(([label, valeur]) => ({ label, valeur })).sort((a, b) => b.valeur - a.valeur);
  const top = Array.isArray(topData) ? topData.slice(0, 10) : (topData?.top || []).slice(0, 10);

  return (
    <div>
      <Hero titre="Dashboard NAFAMA" role="Mensuel · Mon réseau"
        droite={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="m-chip" onClick={reculer} style={{ padding: '6px 10px' }}>‹</button>
            <div style={{ textAlign: 'center', minWidth: 92 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{estHebdo ? `S${String(semaine).padStart(2, '0')}` : MOIS[mois]}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fm-muted)' }}>{annee}</div>
            </div>
            <button className="m-chip" onClick={avancer} disabled={!estHebdo && estMoisCourant}
              style={{ padding: '6px 10px', opacity: !estHebdo && estMoisCourant ? 0.4 : 1 }}>›</button>
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {['mensuel', 'hebdo'].map(m => (
          <button key={m} className={'m-chip' + (mode === m ? ' active' : '')} onClick={() => setMode(m)} style={{ flex: 1 }}>
            {m === 'mensuel' ? '📅 Mensuel' : '🗓️ Hebdo'}
          </button>
        ))}
      </div>

      <div className="m-chips" style={{ marginBottom: 12 }}>
        {ONGLETS.map(o => (
          <button key={o.id} className={'m-chip' + (onglet === o.id ? ' active' : '')}
            onClick={() => setOnglet(o.id)}>{o.label}</button>
        ))}
      </div>

      {onglet === 'ensemble' && (
        <>
          {isLoading && <Chargement />}
          {isError && <Erreur />}
          {donnees && (
            <>
              <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
                <Kpi icone="💰" label={estHebdo ? 'CA de la semaine' : 'CA du mois'} valeur={fmtCourt(donnees.ca_total)}
                  sub={donnees.evolution_pct != null ? `${donnees.evolution_pct > 0 ? '+' : ''}${fmtPct(donnees.evolution_pct)} vs ${estHebdo ? 'S-1' : 'M-1'}` : undefined} couleur="#FF6900" />
                <Kpi icone="🏪" label="PDV actifs" valeur={fmtN(donnees.nb_pdv_actifs)}
                  sub={`${fmtN(donnees.nb_pdv_inactifs)} inactifs`} couleur="#22c55e" to="/m/pdv?actif=1" />
                <Kpi icone="📊" label="CA moyen / PDV" valeur={fmtCourt(donnees.ca_moyen)} sub={estHebdo ? 'Sur la semaine' : 'Sur le mois'} couleur="#7c5cff" />
                <Kpi icone="✨" label="Nouveaux PDV" valeur={fmtN(donnees.nb_nouveaux_pdv)} sub={estHebdo ? 'Ouverts cette semaine' : 'Ouverts ce mois'} couleur="#4a9eff" />
              </div>
              <Bloc titre="CA par superviseur" sousTitre={`${MOIS[mois]} ${annee}`}>
                <Barres donnees={superviseurs} format={fmtCourt} maximum={6} couleur="#00b8a9" />
              </Bloc>
              <Bloc titre="Top 5 PDV" sousTitre="Meilleurs chiffres d'affaires">
                {top.length === 0 ? <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>Ouvrez l'onglet Top PDV.</div>
                  : top.slice(0, 5).map((p, i) => (
                    <LigneClassement key={p.numero_pdv || i} rang={p.rang || i + 1}
                      titre={p.nom || '—'} sousTitre={`${p.numero_pdv || ''} · ${p.zone || p.quartier || ''}`}
                      valeur={fmtCourt(p.ca)} couleur="#63e6a0" />
                  ))}
              </Bloc>
            </>
          )}
        </>
      )}

      {onglet === 'top' && (
        <>
          {!topData && <Chargement />}
          {topData && top.length === 0 && <div className="m-empty">Aucun classement pour cette période.</div>}
          {top.map((p, i) => (
            <div key={p.numero_pdv || i} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.rang || i + 1}. {p.nom || '—'}</div>
                <span className="m-badge">{fmtCourt(p.ca)}</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.zone ? ` · ${p.zone}` : ''}{p.quartier ? ` · ${p.quartier}` : ''}</div>
              <Appel tel={p.telephone} />
            </div>
          ))}
        </>
      )}

      {onglet === 'inactifs' && (
        <>
          {!inactifs && <Chargement />}
          {inactifs && (inactifs.pdvs || []).length === 0 && <div className="m-empty">Aucun PDV inactif ce mois. 👍</div>}
          {(inactifs?.pdvs || []).map((p, i) => (
            <div key={p.numero_pdv || i} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.nom || `PDV ${p.numero_pdv}`}</div>
                <span className="m-badge red">{fmtN(p.nb_mois_consecutifs_inactif)} mois</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.zone ? ` · ${p.zone}` : ''}{p.quartier ? ` · ${p.quartier}` : ''}</div>
              <div className="m-item-metrics">
                <div>Dernier CA<b>{fmtCourt(p.ca_dernier_mois)}</b></div>
                <div>Alerte<b>{p.alerte || '—'}</b></div>
              </div>
              <Appel tel={p.telephone} />
            </div>
          ))}
        </>
      )}

      {onglet === 'baisse' && (
        <>
          {!baisse && <Chargement />}
          {baisse && (baisse.pdvs || []).length === 0 && <div className="m-empty">Aucun PDV en baisse ce mois. 👍</div>}
          {(baisse?.pdvs || []).slice(0, 100).map((p, i) => (
            <div key={p.numero_pdv || i} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.nom || `PDV ${p.numero_pdv}`}</div>
                <span className="m-badge red">{fmtPct(p.variation_pct)}</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.zone ? ` · ${p.zone}` : ''}{p.quartier ? ` · ${p.quartier}` : ''}</div>
              <div className="m-item-metrics">
                <div>CA précédent<b>{fmtCourt(p.ca_precedent)}</b></div>
                <div>CA actuel<b>{fmtCourt(p.ca_actuel)}</b></div>
                <div>Action<b>{p.action || '—'}</b></div>
              </div>
              <Appel tel={p.telephone} />
            </div>
          ))}
          {baisse && (baisse.pdvs || []).length > 100 && <div className="m-empty">{fmtN(baisse.pdvs.length)} PDV affichés : 100 premiers</div>}
        </>
      )}
    </div>
  );
}
