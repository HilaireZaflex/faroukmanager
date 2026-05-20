import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line
} from 'recharts';

const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
const NOW_YEAR = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;

function formatCA(v) {
  if (!v) return '0';
  if (v >= 1000000) return (v/1000000).toFixed(1) + ' M';
  if (v >= 1000) return (v/1000).toFixed(0) + ' K';
  return String(v);
}

function ScoreBadge({ score, max = 100 }) {
  const pct = Math.min(score / max * 100, 100);
  const color = pct >= 70 ? '#00d68f' : pct >= 40 ? '#ffaa00' : '#ff3d71';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>{score}</span>
    </div>
  );
}

function MonthPicker({ annee, mois, setAnnee, setMois }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <button onClick={() => { if(mois===1){setMois(12);setAnnee(a=>a-1);}else setMois(m=>m-1); }}
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 14 }}>
        &lt;
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>{MONTHS[mois-1]} {annee}</span>
      <button onClick={() => { if(mois===12){setMois(1);setAnnee(a=>a+1);}else setMois(m=>m+1); }}
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 14 }}>
        &gt;
      </button>
    </div>
  );
}

// Sous-onglet 1 : Carte des zones chaudes
function CarteZonesChaudes({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['zones-heatmap', annee, mois],
    () => api.get('/potentialites/zones-heatmap', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const zones = Array.isArray(data) ? data : [];
  const maxScore = Math.max(...zones.map(z => z.score_chaleur), 1);

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        {zones.map((z, i) => {
          const pct = z.score_chaleur / maxScore;
          const heat = pct >= 0.7 ? { emoji: 'Zone chaude', color: '#ff3d71', bg: 'rgba(255,61,113,0.1)' }
                     : pct >= 0.4 ? { emoji: 'Zone tiede', color: '#ffaa00', bg: 'rgba(255,170,0,0.1)' }
                     : { emoji: 'Zone froide', color: '#4a9eff', bg: 'rgba(74,158,255,0.1)' };
          return (
            <div key={z.zone} className="card" style={{ borderLeft: `3px solid ${heat.color}`, background: heat.bg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{z.zone}</div>
                <span style={{ fontSize: 10, color: heat.color, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.08)' }}>
                  {heat.emoji}
                </span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: '#8a8a9a', fontSize: 10, marginBottom: 4 }}>Score chaleur</div>
                <ScoreBadge score={z.score_chaleur} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                <div><span style={{ color: '#8a8a9a' }}>CA : </span><span style={{ fontWeight: 700, color: '#FF6900' }}>{formatCA(z.ca)}</span></div>
                <div><span style={{ color: '#8a8a9a' }}>Ops : </span><span style={{ fontWeight: 700 }}>{z.nb_operations.toLocaleString()}</span></div>
                <div><span style={{ color: '#8a8a9a' }}>Actifs : </span><span style={{ fontWeight: 700, color: '#00d68f' }}>{z.nb_pdvs_actifs}/{z.nb_pdvs_total}</span></div>
                <div><span style={{ color: '#8a8a9a' }}>Taux : </span><span style={{ fontWeight: 700, color: z.taux_actif >= 70 ? '#00d68f' : '#ffaa00' }}>{z.taux_actif}%</span></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Score de chaleur par zone</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={zones} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="zone" stroke="#8a8a9a" tick={{ fontSize: 12 }} />
            <YAxis stroke="#8a8a9a" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="score_chaleur" name="Score Chaleur" fill="#FF6900" radius={[6,6,0,0]} />
            <Bar dataKey="taux_actif" name="Taux Actifs %" fill="#4a9eff" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Sous-onglet 2 : Analyse Depots & Retraits
function AnalyseDepotsRetraits({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['comparatif-zones', annee, mois],
    () => api.get('/potentialites/comparatif', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const zones = Array.isArray(data) ? data : [];

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Depots vs Retraits par zone</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={zones} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="zone" stroke="#8a8a9a" tick={{ fontSize: 12 }} />
            <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v) => formatCA(v) + ' FCFA'}
              contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            />
            <Legend />
            <Bar dataKey="montant_depots" name="Depots" fill="#4a9eff" radius={[6,6,0,0]} />
            <Bar dataKey="montant_retraits" name="Retraits" fill="#00d68f" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card table-wrapper">
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Ratio Depot/Retrait par zone</h3>
        <table>
          <thead>
            <tr>
              <th>Zone</th><th>Depots</th><th>Retraits</th>
              <th>Ratio Retrait/Depot</th><th>Nb Ops</th><th>PDVs Actifs</th><th>CA</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{z.zone}</td>
                <td style={{ color: '#4a9eff' }}>{formatCA(z.montant_depots)} FCFA</td>
                <td style={{ color: '#00d68f' }}>{formatCA(z.montant_retraits)} FCFA</td>
                <td>
                  <span style={{ fontWeight: 700, color: z.ratio_depot_retrait >= 80 ? '#00d68f' : z.ratio_depot_retrait >= 50 ? '#ffaa00' : '#ff3d71' }}>
                    {z.ratio_depot_retrait}%
                  </span>
                </td>
                <td>{z.nb_operations.toLocaleString()}</td>
                <td style={{ color: '#00d68f', fontWeight: 600 }}>{z.nb_pdvs_actifs}/{z.nb_pdvs_total}</td>
                <td style={{ color: '#FF6900', fontWeight: 600 }}>{formatCA(z.ca)} FCFA</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sous-onglet 3 : Score de Potentiel
function ScorePotentiel({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['score-potentiel', annee, mois],
    () => api.get('/potentialites/score-potentiel', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const list = Array.isArray(data) ? data : [];
  const top10 = list.slice(0, 10);

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Top 10 sous-zones par score de potentiel</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
            <XAxis type="number" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="sous_zone" stroke="#8a8a9a" tick={{ fontSize: 11 }} width={55} />
            <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Bar dataKey="score_potentiel" name="Score" fill="#FF6900" radius={[0,6,6,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Rang</th><th>Sous-zone</th><th>Zone</th>
              <th>Score Potentiel</th><th>CA</th><th>Nb Ops</th>
              <th>Ops/PDV</th><th>Taux Actifs</th><th>Ratio D/R</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700, color: '#FF6900' }}>#{i+1}</td>
                <td style={{ fontWeight: 600 }}>{s.sous_zone}</td>
                <td style={{ color: '#8a8a9a' }}>{s.zone}</td>
                <td><ScoreBadge score={s.score_potentiel} /></td>
                <td style={{ color: '#FF6900' }}>{formatCA(s.ca)}</td>
                <td>{s.nb_operations.toLocaleString()}</td>
                <td style={{ fontWeight: 600 }}>{s.ops_par_pdv}</td>
                <td>
                  <span style={{ color: s.taux_actif >= 70 ? '#00d68f' : s.taux_actif >= 50 ? '#ffaa00' : '#ff3d71', fontWeight: 700 }}>
                    {s.taux_actif}%
                  </span>
                </td>
                <td>{s.ratio_depot_retrait}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sous-onglet 4 : Opportunites d'expansion
function OpportunitesExpansion({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['opportunites', annee, mois],
    () => api.get('/potentialites/opportunites', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const list = Array.isArray(data) ? data : [];
  const sous_exploites = list.filter(o => o.type === 'sous_exploite');
  const fort_potentiel = list.filter(o => o.type === 'fort_potentiel');

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      {sous_exploites.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid #FF6900' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Zones sous-exploitees (peu de PDVs, beaucoup d'operations)</h3>
          <p style={{ color: '#8a8a9a', fontSize: 12, marginBottom: 16 }}>Ces zones ont un volume d'operations eleve mais peu de PDVs. Opportunite d'expansion !</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {sous_exploites.map((o, i) => (
              <div key={i} style={{ background: 'rgba(255,105,0,0.08)', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{o.quartier}</div>
                <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 8 }}>{o.zone}</div>
                <div style={{ fontSize: 12 }}>
                  <div><span style={{ color: '#8a8a9a' }}>PDVs : </span><span style={{ fontWeight: 700, color: '#ff3d71' }}>{o.nb_pdvs_total}</span></div>
                  <div><span style={{ color: '#8a8a9a' }}>Ops : </span><span style={{ fontWeight: 700, color: '#00d68f' }}>{o.nb_operations.toLocaleString()}</span></div>
                  <div><span style={{ color: '#8a8a9a' }}>Ops/PDV : </span><span style={{ fontWeight: 700, color: '#FF6900' }}>{o.ops_par_pdv}</span></div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: '#8a8a9a', fontSize: 10, marginBottom: 4 }}>Score opportunite</div>
                  <ScoreBadge score={o.score_opportunite} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fort_potentiel.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid #00d68f' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Zones a fort potentiel</h3>
          <p style={{ color: '#8a8a9a', fontSize: 12, marginBottom: 16 }}>Ces zones ont un volume d'operations eleve et un bon potentiel de croissance.</p>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Quartier</th><th>Zone</th><th>Score Opp.</th><th>Nb PDVs</th><th>Nb Ops</th><th>Ops/PDV</th><th>CA</th></tr>
              </thead>
              <tbody>
                {fort_potentiel.map((o, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{o.quartier}</td>
                    <td style={{ color: '#8a8a9a' }}>{o.zone}</td>
                    <td><ScoreBadge score={o.score_opportunite} /></td>
                    <td style={{ color: '#00d68f', fontWeight: 600 }}>{o.nb_pdvs_total}</td>
                    <td>{o.nb_operations.toLocaleString()}</td>
                    <td style={{ fontWeight: 600, color: '#FF6900' }}>{o.ops_par_pdv}</td>
                    <td style={{ color: '#FF6900' }}>{formatCA(o.ca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {list.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>Aucune opportunite identifiee pour ce mois</div>
      )}
    </div>
  );
}

// Sous-onglet 5 : Comparatif zones (quartiers detailles)
function ComparatifZones({ annee, mois }) {
  const [filterZone, setFilterZone] = useState('');
  const { data, isLoading } = useQuery(
    ['quartiers-analyse', annee, mois],
    () => api.get('/potentialites/quartiers', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const all = Array.isArray(data) ? data : [];
  const zones = [...new Set(all.map(q => q.zone))];
  const list = filterZone ? all.filter(q => q.zone === filterZone) : all;

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setFilterZone('')}
          style={{ padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: !filterZone ? '#FF6900' : 'rgba(255,255,255,0.07)', color: !filterZone ? '#fff' : '#8a8a9a' }}>
          Toutes
        </button>
        {zones.map(z => (
          <button key={z} onClick={() => setFilterZone(z)}
            style={{ padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filterZone === z ? '#FF6900' : 'rgba(255,255,255,0.07)', color: filterZone === z ? '#fff' : '#8a8a9a' }}>
            {z}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>CA & Operations par quartier</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={list.slice(0,15)} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="quartier" stroke="#8a8a9a" angle={-40} textAnchor="end" height={80} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v, n) => n === 'CA' ? formatCA(v) + ' FCFA' : v.toLocaleString()}
              contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="ca" name="CA" fill="#FF6900" radius={[4,4,0,0]} />
            <Bar yAxisId="right" dataKey="nb_operations" name="Nb Ops" fill="#4a9eff" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Quartier</th><th>Zone</th><th>Score Potentiel</th>
              <th>CA</th><th>Depots</th><th>Retraits</th>
              <th>Nb Ops</th><th>PDVs Actifs</th><th>Ops/PDV</th>
            </tr>
          </thead>
          <tbody>
            {list.map((q, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{q.quartier}</td>
                <td style={{ color: '#8a8a9a', fontSize: 11 }}>{q.zone}</td>
                <td><ScoreBadge score={q.score_potentiel} /></td>
                <td style={{ color: '#FF6900', fontWeight: 600 }}>{formatCA(q.ca)}</td>
                <td style={{ color: '#4a9eff' }}>{formatCA(q.montant_depots)}</td>
                <td style={{ color: '#00d68f' }}>{formatCA(q.montant_retraits)}</td>
                <td>{q.nb_operations.toLocaleString()}</td>
                <td style={{ color: '#00d68f', fontWeight: 600 }}>{q.nb_pdvs_actifs}/{q.nb_pdvs_total}</td>
                <td style={{ fontWeight: 600, color: '#FF6900' }}>{q.ops_par_pdv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// COMPOSANT PRINCIPAL
export default function OngletPotentialites() {
  const [annee, setAnnee] = useState(NOW_YEAR);
  const [mois, setMois] = useState(NOW_MONTH);
  const [subTab, setSubTab] = useState('heatmap');

  const subTabs = [
    { key: 'heatmap',      label: 'Zones chaudes' },
    { key: 'depots',       label: 'Depots & Retraits' },
    { key: 'potentiel',    label: 'Score de Potentiel' },
    { key: 'opportunites', label: 'Opportunites d\'expansion' },
    { key: 'comparatif',   label: 'Comparatif zones' },
  ];

  return (
    <div>
      <MonthPicker annee={annee} mois={mois} setAnnee={setAnnee} setMois={setMois} />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '4px' }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: subTab === t.key ? '#FF6900' : 'transparent',
              color: subTab === t.key ? '#fff' : '#8a8a9a',
              transition: 'all 0.2s'
            }}>
            {t.key === 'heatmap'      && 'Zones chaudes'}
            {t.key === 'depots'       && 'Depots & Retraits'}
            {t.key === 'potentiel'    && 'Score de Potentiel'}
            {t.key === 'opportunites' && "Opportunites d'expansion"}
            {t.key === 'comparatif'   && 'Comparatif zones'}
          </button>
        ))}
      </div>

      {subTab === 'heatmap'      && <CarteZonesChaudes annee={annee} mois={mois} />}
      {subTab === 'depots'       && <AnalyseDepotsRetraits annee={annee} mois={mois} />}
      {subTab === 'potentiel'    && <ScorePotentiel annee={annee} mois={mois} />}
      {subTab === 'opportunites' && <OpportunitesExpansion annee={annee} mois={mois} />}
      {subTab === 'comparatif'   && <ComparatifZones annee={annee} mois={mois} />}
    </div>
  );
}
