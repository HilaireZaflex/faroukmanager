import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import PDVCell from '../components/common/PDVCell';

const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

function formatCA(v) {
  if (!v) return '0 FCFA';
  return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ') + ' FCFA';
}

// Sous-onglet : Envois & Recuperations par PDV
export function EnvoisRecuperations({ annee, mois }) {
  const [gestionnaire, setGestionnaire] = useState('');

  const { data: gests } = useQuery('gestionnaires-list', () =>
    api.get('/gestionnaires/').then(r => r.data), { staleTime: 300000 }
  );
  const { data, isLoading } = useQuery(
    ['envois-recuperations', gestionnaire, annee, mois],
    () => api.get(`/gestionnaires/${encodeURIComponent(gestionnaire)}/envois-recuperations`, { params: { annee, mois } }).then(r => r.data),
    { enabled: !!gestionnaire, staleTime: 60000 }
  );

  const list = Array.isArray(data) ? data : [];
  const totalEnvoye = list.reduce((s, r) => s + r.montant_envoye, 0);
  const totalRecupere = list.reduce((s, r) => s + r.montant_recupere, 0);
  const tauxGlobal = totalEnvoye > 0 ? (totalRecupere / totalEnvoye * 100).toFixed(1) : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <label style={{ color: '#8a8a9a', fontSize: 13 }}>Gestionnaire :</label>
        <select
          value={gestionnaire}
          onChange={e => setGestionnaire(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}
        >
          <option value="">-- Choisir --</option>
          {(Array.isArray(gests) ? gests : []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {gestionnaire && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Envoye', value: formatCA(totalEnvoye), color: '#4a9eff' },
              { label: 'Total Recupere', value: formatCA(totalRecupere), color: '#00d68f' },
              { label: 'Taux Recouvrement', value: `${tauxGlobal}%`, color: tauxGlobal >= 80 ? '#00d68f' : tauxGlobal >= 50 ? '#ffaa00' : '#ff3d71' },
            ].map(k => (
              <div key={k.label} className="card" style={{ textAlign: 'center', padding: '16px' }}>
                <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {isLoading ? <div style={{ textAlign: 'center', color: '#8a8a9a', padding: 40 }}>Chargement...</div> : (
            <div className="card table-wrapper">
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Detail par PDV</h3>
              <table>
                <thead>
                  <tr>
                    <th>PDV</th><th>Zone</th><th>CA</th>
                    <th>Envoye</th><th>Recupere</th><th>Taux</th><th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={i}>
                      <td><PDVCell nom={r.pdv_nom} numero={r.numero_pdv} /></td>
                      <td style={{ color: '#8a8a9a' }}>{r.zone}</td>
                      <td style={{ color: '#FF6900', fontWeight: 600 }}>{formatCA(r.ca)}</td>
                      <td style={{ color: '#4a9eff' }}>{formatCA(r.montant_envoye)}</td>
                      <td style={{ color: '#00d68f' }}>{formatCA(r.montant_recupere)}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: r.taux_recouvrement >= 80 ? '#00d68f' : r.taux_recouvrement >= 50 ? '#ffaa00' : '#ff3d71' }}>
                          {r.taux_recouvrement}%
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                          background: r.est_actif ? 'rgba(0,214,143,0.15)' : 'rgba(255,61,113,0.15)',
                          color: r.est_actif ? '#00d68f' : '#ff3d71' }}>
                          {r.est_actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Sous-onglet : Historique par zone
export function HistoriqueZones() {
  const [gestionnaire, setGestionnaire] = useState('');
  const { data: gests } = useQuery('gestionnaires-list', () =>
    api.get('/gestionnaires/').then(r => r.data), { staleTime: 300000 }
  );
  const { data, isLoading } = useQuery(
    ['historique-zones', gestionnaire],
    () => api.get(`/gestionnaires/${encodeURIComponent(gestionnaire)}/historique-zones`).then(r => r.data),
    { enabled: !!gestionnaire, staleTime: 60000 }
  );

  const zones = Array.isArray(data) ? data : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <label style={{ color: '#8a8a9a', fontSize: 13 }}>Gestionnaire :</label>
        <select value={gestionnaire} onChange={e => setGestionnaire(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">-- Choisir --</option>
          {(Array.isArray(gests) ? gests : []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {gestionnaire && isLoading && <div style={{ textAlign: 'center', color: '#8a8a9a', padding: 40 }}>Chargement...</div>}

      {gestionnaire && !isLoading && zones.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8a8a9a', padding: 40 }}>Aucune donnee de zone disponible</div>
      )}

      {zones.map((z, i) => (
        <div key={i} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Zone {z.zone}</div>
              <div style={{ color: '#8a8a9a', fontSize: 11 }}>{z.nb_pdvs} PDVs · CA total : {formatCA(z.ca_total)}</div>
            </div>
            {z.premier_mois && z.dernier_mois && (
              <span style={{ fontSize: 11, color: '#8a8a9a' }}>
                {MONTHS[(z.premier_mois.mois||1)-1]} {z.premier_mois.annee} → {MONTHS[(z.dernier_mois.mois||1)-1]} {z.dernier_mois.annee}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={(z.historique || []).map(h => ({ ...h, label: `${MONTHS[h.mois-1]} ${h.annee}` }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
              <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="ca" name="CA" stroke="#FF6900" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

// Sous-onglet : Classement
export function ClassementGestionnaires({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['classement-gestionnaires', annee, mois],
    () => api.get('/gestionnaires/classement', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <div style={{ textAlign: 'center', color: '#8a8a9a', padding: 40 }}>Chargement...</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Classement par CA Collecte</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={list.slice(0,10)} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
            <XAxis type="number" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="gestionnaire" stroke="#8a8a9a" tick={{ fontSize: 11 }} width={100} />
            <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Bar dataKey="ca_total" name="CA" fill="#FF6900" radius={[0,6,6,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Rang</th><th>Gestionnaire</th><th>CA Collecte</th>
              <th>Envoye</th><th>Recupere</th><th>Taux Recouvrement</th>
              <th>PDVs Actifs</th><th>PDVs Inactifs</th><th>Variation</th>
            </tr>
          </thead>
          <tbody>
            {list.map((g, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700, color: '#FF6900' }}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                </td>
                <td style={{ fontWeight: 600 }}>{g.gestionnaire}</td>
                <td style={{ color: '#FF6900', fontWeight: 600 }}>{formatCA(g.ca_total)}</td>
                <td style={{ color: '#4a9eff' }}>{formatCA(g.montant_envoye)}</td>
                <td style={{ color: '#00d68f' }}>{formatCA(g.montant_recupere)}</td>
                <td>
                  <span style={{ fontWeight: 700, color: g.taux_recouvrement >= 80 ? '#00d68f' : g.taux_recouvrement >= 50 ? '#ffaa00' : '#ff3d71' }}>
                    {g.taux_recouvrement}%
                  </span>
                </td>
                <td style={{ color: '#00d68f', fontWeight: 600 }}>{g.nb_actifs}</td>
                <td style={{ color: '#ff3d71', fontWeight: 600 }}>{g.nb_inactifs}</td>
                <td style={{ fontWeight: 700, color: g.variation_ca > 0 ? '#00d68f' : g.variation_ca < 0 ? '#ff3d71' : '#8a8a9a' }}>
                  {g.variation_ca > 0 ? '+' : ''}{g.variation_ca}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sous-onglet : Evolution mensuelle
export function EvolutionGestionnaire() {
  const [gestionnaire, setGestionnaire] = useState('');
  const { data: gests } = useQuery('gestionnaires-list', () =>
    api.get('/gestionnaires/').then(r => r.data), { staleTime: 300000 }
  );
  const { data, isLoading } = useQuery(
    ['evolution-gestionnaire', gestionnaire],
    () => api.get(`/gestionnaires/${encodeURIComponent(gestionnaire)}/evolution`, { params: { nb_mois: 12 } }).then(r => r.data),
    { enabled: !!gestionnaire, staleTime: 60000 }
  );
  const evolution = Array.isArray(data) ? data : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <label style={{ color: '#8a8a9a', fontSize: 13 }}>Gestionnaire :</label>
        <select value={gestionnaire} onChange={e => setGestionnaire(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">-- Choisir --</option>
          {(Array.isArray(gests) ? gests : []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {gestionnaire && !isLoading && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Evolution CA sur 12 mois</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
                <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                <Legend />
                <Line type="monotone" dataKey="ca" name="CA" stroke="#FF6900" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="montant_recupere" name="Recupere" stroke="#00d68f" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Taux de Recouvrement mensuel</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
                <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="taux_recouvrement" name="Taux" stroke="#4a9eff" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>PDVs Actifs par mois</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" stroke="#8a8a9a" tick={{ fontSize: 10 }} />
                <YAxis stroke="#8a8a9a" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="nb_actifs" name="Actifs" fill="#00d68f" radius={[4,4,0,0]} />
                <Bar dataKey="nb_pdvs" name="Total PDVs" fill="rgba(255,255,255,0.1)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// Sous-onglet : Alertes gestionnaire
export function AlertesGestionnaire() {
  const [gestionnaire, setGestionnaire] = useState('');
  const [seuil, setSeuil] = useState(30);
  const { data: gests } = useQuery('gestionnaires-list', () =>
    api.get('/gestionnaires/').then(r => r.data), { staleTime: 300000 }
  );
  const { data, isLoading } = useQuery(
    ['alertes-gestionnaire', gestionnaire, seuil],
    () => api.get(`/gestionnaires/${encodeURIComponent(gestionnaire)}/alertes`, { params: { seuil_jours: seuil } }).then(r => r.data),
    { enabled: !!gestionnaire, staleTime: 60000 }
  );
  const alertes = Array.isArray(data) ? data : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: '#8a8a9a', fontSize: 13 }}>Gestionnaire :</label>
          <select value={gestionnaire} onChange={e => setGestionnaire(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
            <option value="">-- Choisir --</option>
            {(Array.isArray(gests) ? gests : []).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: '#8a8a9a', fontSize: 13 }}>Seuil inactivite :</label>
          <select value={seuil} onChange={e => setSeuil(Number(e.target.value))}
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
            <option value={30}>30 jours</option>
            <option value={60}>60 jours</option>
            <option value={90}>90 jours</option>
          </select>
        </div>
      </div>

      {gestionnaire && (
        isLoading ? <div style={{ textAlign: 'center', color: '#8a8a9a', padding: 40 }}>Chargement...</div> :
        alertes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(0,214,143,0.05)', borderRadius: 12, border: '1px solid rgba(0,214,143,0.2)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>Aucune alerte</div>
            <div style={{ color: '#00d68f', fontWeight: 600 }}>Tous les PDVs sont actifs dans les {seuil} derniers jours</div>
          </div>
        ) : (
          <div className="card table-wrapper">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>PDVs inactifs depuis +{seuil} jours</span>
              <span style={{ background: 'rgba(255,61,113,0.15)', color: '#ff3d71', fontWeight: 700, padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>
                {alertes.length} PDV{alertes.length > 1 ? 's' : ''}
              </span>
            </div>
            <table>
              <thead>
                <tr><th>PDV</th><th>Zone</th><th>Inactif depuis</th><th>Derniere activite</th></tr>
              </thead>
              <tbody>
                {alertes.map((a, i) => (
                  <tr key={i}>
                    <td><PDVCell nom={a.pdv_nom} numero={a.numero_pdv} /></td>
                    <td style={{ color: '#8a8a9a' }}>{a.zone}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: a.jours_inactif > 90 ? '#ff3d71' : a.jours_inactif > 60 ? '#ffaa00' : '#ff9f43' }}>
                        {a.jours_inactif === 999 ? 'Jamais actif' : `${a.jours_inactif} jours`}
                      </span>
                    </td>
                    <td style={{ color: '#8a8a9a' }}>{a.derniere_activite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
