import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import PDVCell from '../components/common/PDVCell';

const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
const NOW_YEAR = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;

function formatCA(v) {
  if (!v) return '0';
  if (v >= 1000000000) return (v/1000000000).toFixed(2) + ' Mds';
  if (v >= 1000000) return (v/1000000).toFixed(1) + ' M';
  if (v >= 1000) return (v/1000).toFixed(0) + ' K';
  return String(Math.round(v));
}

function MonthPicker({ annee, mois, setAnnee, setMois }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <button onClick={() => { if(mois===1){setMois(12);setAnnee(a=>a-1);}else setMois(m=>m-1); }}
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>&lt;</button>
      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>{MONTHS[mois-1]} {annee}</span>
      <button onClick={() => { if(mois===12){setMois(1);setAnnee(a=>a+1);}else setMois(m=>m+1); }}
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>&gt;</button>
    </div>
  );
}

function TauxBar({ taux }) {
  const color = taux >= 80 ? '#00d68f' : taux >= 50 ? '#ffaa00' : '#ff3d71';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(taux, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{taux}%</span>
    </div>
  );
}

function JournalOperations({ annee, mois }) {
  const [zone, setZone] = useState('');
  const [gestionnaire, setGestionnaire] = useState('');
  const [search, setSearch] = useState('');
  const { data: gests } = useQuery('gestionnaires-list', () => api.get('/gestionnaires/').then(r => r.data), { staleTime: 300000 });
  const { data, isLoading } = useQuery(
    ['journal-ops', annee, mois, zone, gestionnaire],
    () => api.get('/envois/journal', { params: { annee, mois, zone: zone||undefined, gestionnaire: gestionnaire||undefined } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const all = Array.isArray(data) ? data : [];
  const zones = [...new Set(all.map(r => r.zone).filter(Boolean))].sort();
  const list = search ? all.filter(r => r.pdv_nom.toLowerCase().includes(search.toLowerCase()) || r.gestionnaire.toLowerCase().includes(search.toLowerCase())) : all;

  const totalEnvoye = all.reduce((s, r) => s + r.montant_envoye, 0);
  const totalRecupere = all.reduce((s, r) => s + r.montant_recupere, 0);
  const totalSolde = totalEnvoye - totalRecupere;
  const tauxGlobal = totalEnvoye > 0 ? (totalRecupere / totalEnvoye * 100).toFixed(1) : 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Envoye', value: formatCA(totalEnvoye) + ' FCFA', color: '#4a9eff' },
          { label: 'Total Recupere', value: formatCA(totalRecupere) + ' FCFA', color: '#00d68f' },
          { label: 'Solde Reseau', value: formatCA(totalSolde) + ' FCFA', color: totalSolde > 0 ? '#ffaa00' : '#00d68f' },
          { label: 'Taux Recouvrement', value: tauxGlobal + '%', color: tauxGlobal >= 80 ? '#00d68f' : tauxGlobal >= 50 ? '#ffaa00' : '#ff3d71' },
        ].map(k => (
          <div key={k.label} className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="Rechercher PDV ou gestionnaire..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }} />
        <select value={zone} onChange={e => setZone(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">Toutes les zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={gestionnaire} onChange={e => setGestionnaire(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">Tous les gestionnaires</option>
          {(Array.isArray(gests) ? gests : []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div> : (
        <div className="card table-wrapper">
          <table>
            <thead>
              <tr><th>PDV</th><th>Zone</th><th>Gestionnaire</th><th>Envoye</th><th>Recupere</th><th>Solde</th><th>Taux</th><th>Nb Ops</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i}>
                  <td><PDVCell nom={r.pdv_nom} numero={r.numero_pdv} /></td>
                  <td style={{ color: '#8a8a9a', fontSize: 11 }}>{r.zone}</td>
                  <td style={{ fontSize: 12 }}>{r.gestionnaire}</td>
                  <td style={{ color: '#4a9eff', fontWeight: 600 }}>{formatCA(r.montant_envoye)}</td>
                  <td style={{ color: '#00d68f', fontWeight: 600 }}>{formatCA(r.montant_recupere)}</td>
                  <td style={{ color: r.solde > 1000000 ? '#ff3d71' : r.solde > 0 ? '#ffaa00' : '#00d68f', fontWeight: 700 }}>{formatCA(r.solde)}</td>
                  <td><TauxBar taux={r.taux_recouvrement} /></td>
                  <td>{r.nb_operations.toLocaleString()}</td>
                  <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                    background: r.est_actif ? 'rgba(0,214,143,0.15)' : 'rgba(255,61,113,0.15)',
                    color: r.est_actif ? '#00d68f' : '#ff3d71' }}>{r.est_actif ? 'Actif' : 'Inactif'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SoldesParPDV({ annee, mois }) {
  const [zone, setZone] = useState('');
  const { data, isLoading } = useQuery(
    ['soldes-pdv', annee, mois, zone],
    () => api.get('/envois/soldes', { params: { annee, mois, zone: zone||undefined } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const all = Array.isArray(data) ? data : [];
  const zones = [...new Set(all.map(r => r.zone).filter(Boolean))].sort();
  const list = zone ? all.filter(r => r.zone === zone) : all;
  const top10 = list.slice(0, 10);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <select value={zone} onChange={e => setZone(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">Toutes les zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Top 10 PDVs par solde (liquidites chez le PDV)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
            <XAxis type="number" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="pdv_nom" stroke="#8a8a9a" tick={{ fontSize: 10 }} width={115} />
            <Tooltip formatter={(v) => formatCA(v) + ' FCFA'} contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Bar dataKey="montant_envoye" name="Envoye" fill="#4a9eff" radius={[0,4,4,0]} />
            <Bar dataKey="montant_recupere" name="Recupere" fill="#00d68f" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div> : (
        <div className="card table-wrapper">
          <table>
            <thead><tr><th>#</th><th>PDV</th><th>Zone</th><th>Gestionnaire</th><th>Envoye</th><th>Recupere</th><th>Solde</th><th>Taux</th></tr></thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: '#8a8a9a', fontSize: 11 }}>{i+1}</td>
                  <td><PDVCell nom={r.pdv_nom} numero={r.numero_pdv} /></td>
                  <td style={{ color: '#8a8a9a', fontSize: 11 }}>{r.zone}</td>
                  <td style={{ fontSize: 12 }}>{r.gestionnaire}</td>
                  <td style={{ color: '#4a9eff' }}>{formatCA(r.montant_envoye)}</td>
                  <td style={{ color: '#00d68f' }}>{formatCA(r.montant_recupere)}</td>
                  <td style={{ fontWeight: 700, color: r.solde > 1000000 ? '#ff3d71' : r.solde > 0 ? '#ffaa00' : '#00d68f' }}>{formatCA(r.solde)}</td>
                  <td><TauxBar taux={r.taux_recouvrement} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ParGestionnaire({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['envois-par-gest', annee, mois],
    () => api.get('/envois/par-gestionnaire', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const list = Array.isArray(data) ? data : [];

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Envois & Recuperations par Gestionnaire</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={list.slice(0,12)} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="gestionnaire" stroke="#8a8a9a" angle={-35} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
            <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => formatCA(v) + ' FCFA'} contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="montant_envoye" name="Envoye" fill="#4a9eff" radius={[4,4,0,0]} />
            <Bar dataKey="montant_recupere" name="Recupere" fill="#00d68f" radius={[4,4,0,0]} />
            <Bar dataKey="solde" name="Solde" fill="#ffaa00" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div> : (
        <div className="card table-wrapper">
          <table>
            <thead><tr><th>Rang</th><th>Gestionnaire</th><th>Envoye</th><th>Recupere</th><th>Solde</th><th>Taux</th><th>Nb PDVs</th><th>Freq. Collecte</th><th>PDVs Solde Eleve</th></tr></thead>
            <tbody>
              {list.map((g, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: '#FF6900' }}>#{i+1}</td>
                  <td style={{ fontWeight: 600 }}>{g.gestionnaire}</td>
                  <td style={{ color: '#4a9eff', fontWeight: 600 }}>{formatCA(g.montant_envoye)}</td>
                  <td style={{ color: '#00d68f', fontWeight: 600 }}>{formatCA(g.montant_recupere)}</td>
                  <td style={{ fontWeight: 700, color: g.solde > 5000000 ? '#ff3d71' : g.solde > 0 ? '#ffaa00' : '#00d68f' }}>{formatCA(g.solde)}</td>
                  <td><TauxBar taux={g.taux_recouvrement} /></td>
                  <td>{g.nb_pdvs}</td>
                  <td style={{ color: '#8a8a9a' }}>{g.frequence_collecte}x/PDV</td>
                  <td style={{ color: g.pdvs_solde_eleve > 0 ? '#ff3d71' : '#00d68f', fontWeight: 700 }}>{g.pdvs_solde_eleve}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AlertesSoldesEleves({ annee, mois }) {
  const [seuil, setSeuil] = useState(1000000);
  const { data, isLoading } = useQuery(
    ['alertes-soldes', annee, mois, seuil],
    () => api.get('/envois/alertes', { params: { annee, mois, seuil_solde: seuil } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const alertes = Array.isArray(data) ? data : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <label style={{ color: '#8a8a9a', fontSize: 13 }}>Seuil solde min (FCFA) :</label>
        <select value={seuil} onChange={e => setSeuil(Number(e.target.value))}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value={500000}>500 000</option>
          <option value={1000000}>1 000 000</option>
          <option value={5000000}>5 000 000</option>
          <option value={10000000}>10 000 000</option>
        </select>
        <span style={{ background: 'rgba(255,61,113,0.15)', color: '#ff3d71', fontWeight: 700, padding: '4px 12px', borderRadius: 12, fontSize: 13 }}>
          {alertes.length} PDV{alertes.length > 1 ? 's' : ''} en alerte
        </span>
      </div>
      {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div> :
        alertes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: 'rgba(0,214,143,0.05)', borderRadius: 12, border: '1px solid rgba(0,214,143,0.2)' }}>
            <div style={{ color: '#00d68f', fontWeight: 600, fontSize: 15 }}>Aucun PDV avec un solde superieur au seuil defini</div>
          </div>
        ) : (
          <div className="card table-wrapper">
            <table>
              <thead><tr><th>#</th><th>PDV</th><th>Zone</th><th>Gestionnaire</th><th>Envoye</th><th>Recupere</th><th>Solde</th><th>Taux Recouv.</th></tr></thead>
              <tbody>
                {alertes.map((a, i) => (
                  <tr key={i}>
                    <td style={{ color: '#8a8a9a', fontSize: 11 }}>{i+1}</td>
                    <td><PDVCell nom={a.pdv_nom} numero={a.numero_pdv} /></td>
                    <td style={{ color: '#8a8a9a', fontSize: 11 }}>{a.zone}</td>
                    <td style={{ fontSize: 12 }}>{a.gestionnaire}</td>
                    <td style={{ color: '#4a9eff' }}>{formatCA(a.montant_envoye)}</td>
                    <td style={{ color: '#00d68f' }}>{formatCA(a.montant_recupere)}</td>
                    <td style={{ fontWeight: 800, color: '#ff3d71', fontSize: 14 }}>{formatCA(a.solde)}</td>
                    <td><TauxBar taux={a.taux_recouvrement} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}

function TauxRecouvrement({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['taux-recouvrement', annee, mois],
    () => api.get('/envois/taux-recouvrement', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  const evo = data?.evolution || [];
  const zones = data?.par_zone || [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Envoye', value: formatCA(data?.total_envoye) + ' FCFA', color: '#4a9eff' },
          { label: 'Total Recupere', value: formatCA(data?.total_recupere) + ' FCFA', color: '#00d68f' },
          { label: 'Solde Global', value: formatCA(data?.total_solde) + ' FCFA', color: '#ffaa00' },
          { label: 'Taux Global', value: (data?.taux_global || 0) + '%', color: (data?.taux_global||0) >= 80 ? '#00d68f' : '#ffaa00' },
        ].map(k => (
          <div key={k.label} className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Evolution du taux de recouvrement (12 mois)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={evo}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} domain={[0, 120]} unit="%" />
            <Tooltip formatter={(v) => v + '%'} contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Line type="monotone" dataKey="taux" name="Taux Recouvrement" stroke="#00d68f" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Envois vs Recuperations sur 12 mois</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={evo}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => formatCA(v) + ' FCFA'} contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="envoye" name="Envoye" fill="#4a9eff" radius={[4,4,0,0]} />
            <Bar dataKey="recupere" name="Recupere" fill="#00d68f" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card table-wrapper">
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Taux de recouvrement par zone</h3>
        <table>
          <thead><tr><th>Zone</th><th>Envoye</th><th>Recupere</th><th>Solde</th><th>Taux Recouvrement</th><th>Nb PDVs</th></tr></thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{z.zone}</td>
                <td style={{ color: '#4a9eff' }}>{formatCA(z.envoye)}</td>
                <td style={{ color: '#00d68f' }}>{formatCA(z.recupere)}</td>
                <td style={{ color: z.solde > 0 ? '#ffaa00' : '#00d68f', fontWeight: 600 }}>{formatCA(z.solde)}</td>
                <td><TauxBar taux={z.taux} /></td>
                <td>{z.nb_pdvs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OngletEnvoisRecuperations() {
  const [annee, setAnnee] = useState(NOW_YEAR);
  const [mois, setMois] = useState(NOW_MONTH);
  const [subTab, setSubTab] = useState('journal');

  const subTabs = [
    { key: 'journal',      label: 'Journal des operations' },
    { key: 'soldes',       label: 'Soldes par PDV' },
    { key: 'gestionnaire', label: 'Par Gestionnaire' },
    { key: 'alertes',      label: 'Alertes soldes eleves' },
    { key: 'taux',         label: 'Taux de recouvrement' },
  ];

  return (
    <div>
      <MonthPicker annee={annee} mois={mois} setAnnee={setAnnee} setMois={setMois} />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '4px' }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: subTab === t.key ? '#FF6900' : 'transparent',
              color: subTab === t.key ? '#fff' : '#8a8a9a', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'journal'      && <JournalOperations annee={annee} mois={mois} />}
      {subTab === 'soldes'       && <SoldesParPDV annee={annee} mois={mois} />}
      {subTab === 'gestionnaire' && <ParGestionnaire annee={annee} mois={mois} />}
      {subTab === 'alertes'      && <AlertesSoldesEleves annee={annee} mois={mois} />}
      {subTab === 'taux'         && <TauxRecouvrement annee={annee} mois={mois} />}
    </div>
  );
}
