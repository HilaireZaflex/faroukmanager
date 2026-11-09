import React, { useEffect, useState } from 'react';
import { useQuery } from 'react-query';
import api from '../../services/api';
import { fmtN, fmtCourt, fmtPct } from '../format';
import { Hero, Kpi, Bloc, Barres, Chargement, Erreur } from '../ui';

const ONGLETS = [
  { id: 'ensemble', label: "Vue d'ensemble" },
  { id: 'inactifs', label: 'Inactifs' },
  { id: 'baisse',   label: 'En baisse' },
];

const Appel = ({ tel }) => tel
  ? <a className="m-btn" href={`tel:${tel}`} style={{ marginTop: 10, padding: 9, fontSize: 12.5 }}>📞 Appeler</a>
  : null;

export default function MobileKaabu() {
  const [onglet, setOnglet] = useState('ensemble');
  const [mode, setMode] = useState('hebdo');            // hebdo | mensuel
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const { data: periodesData } = useQuery('m-kaabu-periods',
    () => api.get('/kaabu/periods').then(r => r.data), { staleTime: 300000 });

  const periodes = (periodesData?.semaines || []).slice();
  const [index, setIndex] = useState(null);
  useEffect(() => {
    if (index === null && periodes.length > 0) setIndex(periodes.length - 1);
  }, [periodes.length, index]);

  const periode = index != null ? periodes[index] : null;
  const annee = periode?.annee || new Date().getFullYear();
  const semaine = periode?.semaine || '';
  const estMensuel = mode === 'mensuel';
  const base = estMensuel ? '/kaabu/mensuel' : '/kaabu';
  const params = estMensuel ? { annee, mois } : { annee, semaine };

  const { data, isLoading, isError } = useQuery(['m-kaabu', annee, semaine],
    () => api.get(`${base}/vue-ensemble`, { params }).then(r => r.data),
    { enabled: estMensuel || Boolean(semaine), staleTime: 120000 });

  const { data: inactifs } = useQuery(['m-kaabu-inactifs', annee, semaine],
    () => api.get(`${base}/inactifs`, { params }).then(r => r.data),
    { enabled: onglet === 'inactifs' && (estMensuel || Boolean(semaine)), staleTime: 120000 });

  const { data: baisse } = useQuery(['m-kaabu-baisse', annee, semaine],
    () => api.get(`${base}/en-baisse`, { params: { ...params, seuil: -10 } }).then(r => r.data),
    { enabled: onglet === 'baisse' && (estMensuel || Boolean(semaine)), staleTime: 120000 });



  const taux = data?.taux_activite != null
    ? (Number(data.taux_activite) <= 1 ? Number(data.taux_activite) * 100 : Number(data.taux_activite))
    : null;
  const segments = (data?.par_segment || []).map(s => ({ label: s.segment, valeur: s.montant })).sort((a, b) => b.valeur - a.valeur);
  const listeInactifs = inactifs?.pdvs || [];
  const listeBaisse = baisse?.pdvs || [];

  return (
    <div>
      <Hero titre="Dashboard KAABU" role="Hebdomadaire · Mon réseau"
        droite={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="m-chip" onClick={() => (estMensuel ? setMois(m => Math.max(1, m - 1)) : setIndex(i => Math.max(0, (i ?? 0) - 1)))}
              disabled={!estMensuel && !index} style={{ padding: '6px 10px', opacity: (!estMensuel && !index) ? 0.4 : 1 }}>‹</button>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{estMensuel ? `Mois ${mois}` : (semaine || '—')}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fm-muted)' }}>{annee}</div>
            </div>
            <button className="m-chip" onClick={() => (estMensuel ? setMois(m => Math.min(12, m + 1)) : setIndex(i => Math.min(periodes.length - 1, (i ?? 0) + 1)))}
              disabled={!estMensuel && (index == null || index >= periodes.length - 1)}
              style={{ padding: '6px 10px', opacity: (!estMensuel && (index == null || index >= periodes.length - 1)) ? 0.4 : 1 }}>›</button>
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {['hebdo', 'mensuel'].map(m => (
          <button key={m} className={'m-chip' + (mode === m ? ' active' : '')} onClick={() => setMode(m)} style={{ flex: 1 }}>
            {m === 'hebdo' ? '🗓️ Hebdo' : '📅 Mensuel'}
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
          {data && (
            <>
              <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
                <Kpi icone="💵" label="Montant global" valeur={fmtCourt(data.montant_global)}
                  sub={data.evolution_montant != null ? `${data.evolution_montant > 0 ? '+' : ''}${fmtPct(data.evolution_montant)} vs S-1` : undefined} couleur="#FF6900" />
                <Kpi icone="🏪" label="PDV actifs" valeur={fmtN(data.actifs)} sub={`${fmtN(data.total_pdv)} PDV`} couleur="#22c55e" to="/m/pdv?actif=1" />
                <Kpi icone="📶" label="Taux d'activité" valeur={taux != null ? fmtPct(taux) : '—'} sub={`${fmtN(data.inactifs)} inactifs`} couleur="#4a9eff" />
                <Kpi icone="🔄" label="Volume" valeur={fmtN(data.volume_kaabu)} sub={`${fmtN(data.volume_cashin)} cash-in`} couleur="#7c5cff" />
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
            </>
          )}
        </>
      )}

      {onglet === 'inactifs' && (
        <>
          {!inactifs && <Chargement />}
          {inactifs && listeInactifs.length === 0 && <div className="m-empty">Aucun PDV inactif cette semaine. 👍</div>}
          {listeInactifs.slice(0, 100).map((p, i) => (
            <div key={p.numero_pdv || i} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.login || p.numero_pdv}</div>
                <span className="m-badge red">{p.segment || 'Inactif'}</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.superviseur ? ` · ${p.superviseur}` : ''}{p.quartier ? ` · ${p.quartier}` : ''}</div>
              <div className="m-item-metrics">
                <div>Montant S-1<b>{fmtCourt(p.montant_precedent)}</b></div>
                <div>Situation<b>{p.situation_login || '—'}</b></div>
              </div>
            </div>
          ))}
          {listeInactifs.length > 100 && <div className="m-empty">{fmtN(listeInactifs.length)} PDV · 100 affichés</div>}
        </>
      )}

      {onglet === 'baisse' && (
        <>
          {!baisse && <Chargement />}
          {baisse && listeBaisse.length === 0 && <div className="m-empty">Aucun PDV en baisse cette semaine. 👍</div>}
          {listeBaisse.slice(0, 100).map((p, i) => (
            <div key={p.numero_pdv || i} className="m-item">
              <div className="m-item-top">
                <div className="m-item-title">{p.login || p.nom || p.numero_pdv}</div>
                <span className="m-badge red">{p.variation_pct != null ? fmtPct(p.variation_pct) : (p.alerte || '−')}</span>
              </div>
              <div className="m-item-sub">N° {p.numero_pdv}{p.superviseur ? ` · ${p.superviseur}` : ''}</div>
              <div className="m-item-metrics">
                <div>Montant S-1<b>{fmtCourt(p.montant_precedent ?? p.montant_s1)}</b></div>
                <div>Montant S<b>{fmtCourt(p.montant_actuel ?? p.montant)}</b></div>
              </div>
              <Appel tel={p.telephone} />
            </div>
          ))}
        </>
      )}

    </div>
  );
}
