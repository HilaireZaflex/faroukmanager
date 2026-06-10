import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { Users, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';
import './SuperviseurPage.css';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function formatCA(value) {
  if (!value) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(value);
}

export default function SuperviseurPage() {
  const [selectedSuperviseur, setSelectedSuperviseur] = useState(null);

  const [annee, setAnnee] = useState(CURRENT_YEAR);
  const [mois, setMois] = useState(CURRENT_MONTH);

  const { data: statsData, isLoading: isLoadingStats, error: statsError } = useQuery(
    ['superviseurs-stats', annee, mois],
    async () => {
      // /superviseurs/stats retourne une liste directement
      const response = await api.get('/superviseurs/stats', { params: { annee, mois } });
      const list = Array.isArray(response.data) ? response.data : (response.data?.superviseurs || []);
      return list;
    },
    { staleTime: 300000 }
  );

  const { data: selectedPDVsData, isLoading: isLoadingPDVs } = useQuery(
    ['superviseurs-pdvs', selectedSuperviseur],
    () => api.get(`/superviseurs/${encodeURIComponent(selectedSuperviseur)}/pdvs`).then(r => r.data),
    { enabled: !!selectedSuperviseur, staleTime: 300000 }
  );

  // statsData est directement la liste des superviseurs
  const superviseurs = Array.isArray(statsData) ? statsData : [];

  // Normalize supervisor fields (API retourne: nom, ca_total_mois, pdvs_actifs, pdvs_inactifs, score_sante_moyen, taux_retention)
  const normSup = (s) => ({
    superviseur: s.superviseur || s.nom || '—',
    ca: s.ca_total_mois || s.ca || 0,
    actifs: s.pdvs_actifs || s.actifs || 0,
    inactifs: s.pdvs_inactifs || s.inactifs || 0,
    score_sante: Math.round(s.score_sante_moyen || s.score_sante || 0),
    taux_retention: s.taux_retention || 0,
    nb_pdvs: s.nb_pdvs || 0,
    rang: s.rang_reseau || 0,
    variation_ca: s.variation_ca_mois || 0,
  });

  // Prepare data for bar chart (top 10 superviseurs)
  const chartData = superviseurs
    .slice(0, 10)
    .map((s) => normSup(s));

  const getMedalEmoji = (rang) => {
    if (rang === 1) return '🥇';
    if (rang === 2) return '🥈';
    if (rang === 3) return '🥉';
    return '';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: 'rgba(10, 10, 20, 0.95)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
          }}
        >
          <p style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>{payload[0].payload.nom}</p>
          <p style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCA(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  // Navigation mois — pas de restriction (naviguer librement)
  const canGoPrev = !(annee === 2025 && mois === 1);
  const canGoNext = !(annee === CURRENT_YEAR && mois === CURRENT_MONTH);
  const isMoisDispo = () => true;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 Superviseurs & Zones</h1>
          <p className="page-subtitle">Comparaison des performances et KPIs par superviseur · {MONTHS[mois-1]} {annee}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button className="btn btn-ghost btn-sm" disabled={!canGoPrev} style={{opacity: canGoPrev?1:0.3}} onClick={() => { const nm=mois===1?12:mois-1; const na=mois===1?annee-1:annee; if(isMoisDispo(na,nm)){setMois(nm);setAnnee(na);} }}><ChevronLeft size={14}/></button>
          <span style={{ fontSize:13, fontWeight:700, minWidth:100, textAlign:'center' }}>{MONTHS[mois-1]} {annee}</span>
          <button className="btn btn-ghost btn-sm" disabled={!canGoNext} style={{opacity: canGoNext?1:0.3}} onClick={() => { const nm=mois===12?1:mois+1; const na=mois===12?annee+1:annee; if(isMoisDispo(na,nm)){setMois(nm);setAnnee(na);} }}><ChevronRight size={14}/></button>
        </div>
      </div>

      {isLoadingStats ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div>
      ) : statsError && !superviseurs.length ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
          Erreur de chargement des données
        </div>
      ) : (
        <>
          {/* Cards par superviseur */}
          <div className="superviseurs-grid mb-24">
            {superviseurs.slice(0, 6).map((s, i) => {
              const n = normSup(s);
              return (
              <div
                key={i}
                className="card superviseur-card"
                style={{
                  cursor: 'pointer',
                  border: selectedSuperviseur === n.superviseur ? '2px solid var(--primary)' : '1px solid var(--border)',
                }}
                onClick={() => setSelectedSuperviseur(selectedSuperviseur === n.superviseur ? null : n.superviseur)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
                      {getMedalEmoji(i + 1)} {n.superviseur}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Rang #{i + 1} · {n.nb_pdvs} PDVs</div>
                  </div>
                  {n.variation_ca !== 0 && (
                    <span style={{ fontSize:10, fontWeight:700, color: n.variation_ca > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {n.variation_ca > 0 ? '↑' : '↓'} {Math.abs(n.variation_ca).toFixed(1)}%
                    </span>
                  )}
                </div>

                <div className="superviseur-kpis">
                  <div className="superviseur-kpi">
                    <div className="superviseur-kpi-value" style={{ fontSize:14 }}>{formatCA(n.montant_transaction || n.ca)}</div>
                    <div className="superviseur-kpi-label">CA Mensuel</div>
                  </div>
                  <div className="superviseur-kpi">
                    <div className="superviseur-kpi-value" style={{ color: 'var(--success)' }}>{n.actifs}</div>
                    <div className="superviseur-kpi-label">Actifs</div>
                  </div>
                  <div className="superviseur-kpi">
                    <div className="superviseur-kpi-value" style={{ color: 'var(--danger)' }}>{n.inactifs}</div>
                    <div className="superviseur-kpi-label">Inactifs</div>
                  </div>
                </div>

                <div className="divider"></div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Santé</span>
                    <span style={{ fontWeight: 700, color: n.score_sante >= 70 ? 'var(--success)' : n.score_sante >= 40 ? 'var(--warning)' : 'var(--danger)' }}>{n.score_sante}/100</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Rétention</span>
                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>{n.taux_retention.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );})}

          </div>

          {/* Graphique comparaison */}
          <div className="card mb-24">
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>📊 CA par Superviseur (Top 10)</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="nom" stroke="var(--text-secondary)" angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="ca" fill="#FF6900" name="Montant Transaction" radius={[8, 8, 0, 0]} />
                <Bar dataKey="actifs" fill="#00d68f" name="PDVs Actifs" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Scatter: Score santé vs Taux rétention */}
          <div className="card mb-24">
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
              📈 Score Santé vs Taux Rétention
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="score_sante"
                  name="Score Santé"
                  type="number"
                  stroke="var(--text-secondary)"
                  label={{ value: 'Score Santé', position: 'insideBottomRight', offset: -5 }}
                />
                <YAxis
                  dataKey="taux_retention"
                  name="Taux Rétention (%)"
                  stroke="var(--text-secondary)"
                  label={{ value: 'Taux Rétention (%)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10, 10, 20, 0.95)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                  cursor={{ fill: 'rgba(255, 105, 0, 0.1)' }}
                />
                <Scatter name="Superviseurs" data={chartData} fill="#FF6900" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Table détaillée */}
          <div className="card table-wrapper">
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>📋 Tableau Détaillé</h3>
            <table>
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Superviseur</th>
                  <th>Montant Transaction</th>
                  <th>PDVs Actifs</th>
                  <th>PDVs Inactifs</th>
                  <th>Score Santé</th>
                  <th>Taux Rétention</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {superviseurs.map((s, i) => {
                  const n = normSup(s);
                  return (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{getMedalEmoji(i + 1)} #{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{n.superviseur}</td>
                    <td style={{ color: 'var(--primary)' }}>{formatCA(n.montant_transaction || n.ca)}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>{n.actifs}</td>
                    <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{n.inactifs}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div className="progress-bar" style={{ width: '70px' }}>
                          <div className="progress-fill" style={{ width:`${n.score_sante}%`, background: n.score_sante>=70?'var(--success)':n.score_sante>=40?'var(--warning)':'var(--danger)' }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600 }}>{n.score_sante}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>{n.taux_retention.toFixed(1)}%</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => setSelectedSuperviseur(n.superviseur)}>
                        Voir PDVs
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PDVs du superviseur sélectionné */}
          {selectedSuperviseur && (
            <div className="card mt-24">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700 }}>
                  PDVs de {selectedSuperviseur}
                </h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedSuperviseur(null)}
                >
                  ✕ Fermer
                </button>
              </div>

              {isLoadingPDVs ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Chargement des PDVs...
                </div>
              ) : selectedPDVsData?.pdvs?.length > 0 ? (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>PDV</th>
                        <th>Zone</th>
                        <th>CA Mensuel</th>
                        <th>Statut</th>
                        <th>Score Santé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPDVsData.pdvs.map((pdv) => (
                        <tr key={pdv.id}>
                          <td style={{ fontWeight: 600 }}>{pdv.nom}</td>
                          <td>{pdv.zone}</td>
                          <td>{formatCA(pdv.montant_transaction || pdv.ca)}</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                background:
                                  pdv.statut === 'actif'
                                    ? 'var(--success-bg)'
                                    : 'var(--danger-bg)',
                                color:
                                  pdv.statut === 'actif'
                                    ? 'var(--success)'
                                    : 'var(--danger)',
                              }}
                            >
                              {pdv.statut}
                            </span>
                          </td>
                          <td>
                            <div className="progress-bar" style={{ width: '80px' }}>
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${pdv.score_sante || 0}%`,
                                  background:
                                    (pdv.score_sante || 0) >= 70
                                      ? 'var(--success)'
                                      : (pdv.score_sante || 0) >= 40
                                        ? 'var(--warning)'
                                        : 'var(--danger)',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '11px', marginLeft: '6px', fontWeight: 600 }}>
                              {pdv.score_sante || 0}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Aucun PDV trouvé
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
