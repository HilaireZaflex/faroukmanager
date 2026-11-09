import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
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

/** Action terrain commune : appeler ou ouvrir la fiche. */
const ActionsPDV = ({ pdv }) => {
  const tel = pdv.telephone || pdv.numero_personnel;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <Link to={`/m/pdv/${pdv.pdv_id}`} className="m-btn secondary" style={{ flex: 1, padding: 9, fontSize: 12.5 }}>
        🏪 Ouvrir la fiche
      </Link>
      {tel && <a className="m-btn" href={`tel:${tel}`} style={{ padding: 9, fontSize: 13, width: 50 }}>📞</a>}
    </div>
  );
};

export default function MobileOMy() {
  const [onglet, setOnglet] = useState('ensemble');
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState(maintenant.getMonth() + 1);

  const decaler = (pas) => {
    let m = mois + pas; let a = annee;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMois(m); setAnnee(a);
  };
  const estMoisCourant = annee === maintenant.getFullYear() && mois === maintenant.getMonth() + 1;

  const { data, isLoading, isError } = useQuery(['m-omy', annee, mois],
    () => api.get('/dashboard/monthly', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 120000 });

  const { data: topData } = useQuery(['m-omy-top', annee, mois],
    () => api.get('/dashboard/classements', { params: { annee, mois, n: 20 } }).then(r => r.data),
    { enabled: onglet === 'top', staleTime: 120000 });

  const { data: inactifs } = useQuery(['m-omy-inactifs', annee, mois],
    () => api.get('/dashboard/monthly-inactive', { params: { annee, mois } }).then(r => r.data),
    { enabled: onglet === 'inactifs', staleTime: 120000 });

  const { data: baisse } = useQuery(['m-omy-baisse', annee, mois],
    () => api.get('/dashboard/monthly-declining', { params: { annee, mois, seuil: -10 } }).then(r => r.data),
    { enabled: onglet === 'baisse', staleTime: 120000 });

  const zones = Object.entries(data?.ca_by_zone || {})
    .map(([label, valeur]) => ({ label, valeur })).sort((a, b) => b.valeur - a.valeur);
  const top = (topData?.top || []).slice(0, 10);

  return (
    <div>
      <Hero titre="Dashboard OMY" role="Mensuel · Mon réseau"
        droite={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="m-chip" onClick={() => decaler(-1)} aria-label="Mois précédent" style={{ padding: '6px 10px' }}>‹</button>
            <div style={{ textAlign: 'center', minWidth: 92 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{MOIS[mois]}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fm-muted)' }}>{annee}</div>
            </div>
            <button className="m-chip" onClick={() => decaler(1)} disabled={estMoisCourant}
              aria-label="Mois suivant" style={{ padding: '6px 10px', opacity: estMoisCourant ? 0.4 : 1 }}>›</button>
          </div>
        }
      />

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
          {data && (
            <>
              <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
                <Kpi icone="💸" label="Montant transaction" valeur={fmtCourt(data.total_montant_transaction || data.total_ca)} sub="Dépôts + retraits" couleur="#FF6900" />
                <Kpi icone="📈" label="Montant CA" valeur={fmtCourt(data.total_montant_ca)} sub={fmtPct(data.ratio_ca_transaction)} couleur="#22c55e" />
                <Kpi icone="🏦" label="Commission PDG" valeur={fmtCourt(data.total_commission_pdg)} sub="Part réseau" couleur="#7c5cff" />
                <Kpi icone="🏪" label="PDV actifs" valeur={fmtN(data.active_pdvs)} sub={`${fmtN(data.total_pdvs)} PDV · ${fmtPct(data.taux_activite)}`} couleur="#4a9eff" to="/m/pdv?actif=1" />
              </div>
              <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
                <Kpi icone="🔄" label="Opérations" valeur={fmtN(data.total_operations)} sub={`${fmtN(data.total_depots)} dépôts`} couleur="#ffa502" />
                <Kpi icone="📊" label="CA moyen / PDV" valeur={fmtCourt(data.average_ca)} sub="Sur le mois" couleur="#00b8a9" />
              </div>
              <Bloc titre="CA par zone" sousTitre={`${MOIS[mois]} ${annee}`}>
                <Barres donnees={zones} format={fmtCourt} maximum={8} />
              </Bloc>
              <Bloc titre="Top 5 PDV" sousTitre="Volume de transactions">
                {top.length === 0 ? <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>Ouvrez l'onglet Top PDV.</div>
                  : top.slice(0, 5).map(p => (
                    <LigneClassement key={p.pdv_id || p.numero_pdv} rang={p.rang} titre={p.nom || '—'}
                      sousTitre={`${p.numero_pdv || ''} · ${p.zone || ''}`} valeur={fmtCourt(p.montant_transaction || p.ca)} />
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
          {topData && top.map(p => (
            <div key={p.pdv_id || p.numero_pdv} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.rang}. {p.nom || '—'}</div>
                <span className="m-badge">{fmtCourt(p.montant_transaction || p.ca)}</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.zone ? ` · ${p.zone}` : ''}{p.superviseur ? ` · ${p.superviseur}` : ''}</div>
              <ActionsPDV pdv={p} />
            </div>
          ))}
        </>
      )}

      {onglet === 'inactifs' && (
        <>
          {!inactifs && <Chargement />}
          {inactifs && (inactifs.pdvs || []).length === 0 && <div className="m-empty">Aucun PDV inactif ce mois. 👍</div>}
          {(inactifs?.pdvs || []).map(p => (
            <div key={p.pdv_id} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.nom || `PDV ${p.numero_pdv}`}</div>
                <span className="m-badge red">{fmtN(p.nb_mois_consecutifs_inactif)} mois</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.zone ? ` · ${p.zone}` : ''}{p.nom_gerant ? ` · ${p.nom_gerant}` : ''}</div>
              <div className="m-item-metrics">
                <div>Dernier CA<b>{fmtCourt(p.ca)}</b></div>
                <div>Type<b>{p.type_pdv || '—'}</b></div>
              </div>
              <ActionsPDV pdv={p} />
            </div>
          ))}
        </>
      )}

      {onglet === 'baisse' && (
        <>
          {!baisse && <Chargement />}
          {baisse && (baisse.pdvs || []).length === 0 && <div className="m-empty">Aucun PDV en baisse ce mois. 👍</div>}
          {(baisse?.pdvs || []).slice(0, 100).map(p => (
            <div key={p.pdv_id} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.nom || `PDV ${p.numero_pdv}`}</div>
                <span className="m-badge red">{fmtPct(p.taux_baisse)}</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.zone ? ` · ${p.zone}` : ''}{p.nom_gerant ? ` · ${p.nom_gerant}` : ''}</div>
              <div className="m-item-metrics">
                <div>CA précédent<b>{fmtCourt(p.ca_precedent)}</b></div>
                <div>CA actuel<b>{fmtCourt(p.ca)}</b></div>
              </div>
              <ActionsPDV pdv={p} />
            </div>
          ))}
          {baisse && (baisse.pdvs || []).length > 100 && (
            <div className="m-empty">{fmtN(baisse.pdvs.length)} PDV en baisse · 100 affichés</div>
          )}
        </>
      )}
    </div>
  );
}
