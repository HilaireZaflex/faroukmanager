import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Users, MapPin, Award, DollarSign, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import './SuperviseurPage.css';
import VueEnsembleGestionnaires from './GestionReseauGestionnaires';
import { EnvoisRecuperations, HistoriqueZones, ClassementGestionnaires, EvolutionGestionnaire, AlertesGestionnaire } from './GestionReseauGestionnaires2';
import OngletPotentialitesContent from './GestionReseauPotentialites';
import OngletGradesContent from './GestionReseauGrades';
import OngletEnvoisContent from './GestionReseauEnvois';
import OngletPlanningContent from './GestionReseauPlanning';
import OngletDeveloppeurs from './GestionReseauDeveloppeurs';
import PDVCell from '../components/common/PDVCell';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function formatCA(value) {
  if (!value) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(value);
}

// ─── ONGLET 1 : Gestion des Gestionnaires ────────────────────────────────────
function OngletGestionnaires() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [subTab, setSubTab] = useState('overview');
  const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

  const subTabs = [
    { key: 'overview',   label: 'Vue d\'ensemble' },
    { key: 'envois',     label: 'Envois & Recuperations' },
    { key: 'historique', label: 'Historique par zone' },
    { key: 'classement', label: 'Classement & Performance' },
    { key: 'evolution',  label: 'Evolution mensuelle' },
    { key: 'alertes',    label: 'Alertes' },
  ];

  const needsDate = ['overview', 'envois', 'classement'];

  const canGoPrev = !(annee === 2025 && mois === 1);
  const canGoNext = !(annee === new Date().getFullYear() && mois === new Date().getMonth() + 1);
  const isMoisDispo = () => true;

  return (
    <div>
      {/* Selecteur mois (uniquement pour les sous-onglets qui en ont besoin) */}
      {needsDate.includes(subTab) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button disabled={!canGoPrev} onClick={() => { const nm=mois===1?12:mois-1; const na=mois===1?annee-1:annee; setMois(nm); setAnnee(na); }}
            style={{ opacity: canGoPrev?1:0.3, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
            &lt;
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>{MONTHS[mois-1]} {annee}</span>
          <button disabled={!canGoNext} onClick={() => { const nm=mois===12?1:mois+1; const na=mois===12?annee+1:annee; setMois(nm); setAnnee(na); }}
            style={{ opacity: canGoNext?1:0.3, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
            &gt;
          </button>
        </div>
      )}

      {/* Sous-onglets */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '4px' }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: subTab === t.key ? '#FF6900' : 'transparent',
              color: subTab === t.key ? '#fff' : '#8a8a9a',
              transition: 'all 0.2s'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {subTab === 'overview'   && <VueEnsembleGestionnaires annee={annee} mois={mois} />}
      {subTab === 'envois'     && <EnvoisRecuperations annee={annee} mois={mois} />}
      {subTab === 'historique' && <HistoriqueZones />}
      {subTab === 'classement' && <ClassementGestionnaires annee={annee} mois={mois} />}
      {subTab === 'evolution'  && <EvolutionGestionnaire />}
      {subTab === 'alertes'    && <AlertesGestionnaire />}
    </div>
  );
}

// ─── ONGLET 2 : Potentialités Réseau ─────────────────────────────────────────
function OngletPotentialites() {
  return <OngletPotentialitesContent />;
}

// ─── ONGLET 3 : Grades & Qualification ───────────────────────────────────────
function OngletGrades() {
  return <OngletGradesContent />;
}

// ─── ONGLET 4 : Envois & Récupérations ───────────────────────────────────────
function OngletEnvoisRecuperations() {
  return <OngletEnvoisContent />;
}

// ─── ONGLET 5 : Gestion des Superviseurs (contenu de SuperviseurPage) ─────────
function OngletSuperviseurs() {
  const [subTab, setSubTab] = useState('overview');
  const [selectedSuperviseur, setSelectedSuperviseur] = useState(null);
  const [annee, setAnnee] = useState(CURRENT_YEAR);
  const [mois, setMois] = useState(CURRENT_MONTH);
  const [showAll, setShowAll] = useState(false);
  const period = `${annee}-${String(mois).padStart(2,'0')}`;

  // ── Données 3 PDVs/mois ──
  const [pdvObjData, setPdvObjData] = React.useState(null);
  React.useEffect(() => {
    if (subTab === 'pdvs_mois') {
      api.get(`/developpeurs/superviseurs-pdv-objectifs?period=${period}`)
        .then(r => setPdvObjData(r.data)).catch(() => setPdvObjData(null));
    }
  }, [subTab, period]);

  const subTabs = [
    { id: 'overview',  label: '📊 Vue d\'ensemble' },
    { id: 'pdvs_mois', label: '🏪 Objectif 3 PDVs/mois' },
    { id: 'classement',label: '🏆 Classement' },
  ];

  const { data: statsData, isLoading: isLoadingStats, error: statsError } = useQuery(
    ['superviseurs-stats', annee, mois],
    async () => {
      const response = await api.get('/superviseurs/stats', { params: { annee, mois } });
      const list = Array.isArray(response.data) ? response.data : (response.data?.superviseurs || []);
      return list;
    },
    { staleTime: 300000 }
  );

  const { data: selectedPDVsData, isLoading: isLoadingPDVs } = useQuery(
    ['superviseurs-pdvs', selectedSuperviseur, annee, mois],
    () => api.get(`/superviseurs/${encodeURIComponent(selectedSuperviseur)}/pdvs`, { params: { annee, mois, semaine: 52 } }).then(r => r.data),
    { enabled: !!selectedSuperviseur, staleTime: 300000 }
  );

  const superviseurs = Array.isArray(statsData) ? statsData : [];

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

  const chartData = superviseurs.slice(0, 10).map((s) => normSup(s));

  const getMedalEmoji = (rang) => {
    if (rang === 1) return '🥇';
    if (rang === 2) return '🥈';
    if (rang === 3) return '🥉';
    return '';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'rgba(10,10,20,0.95)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{payload[0].payload.superviseur}</p>
          <p style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCA(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {/* Header + sélecteur mois */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>👥 Gestion des Superviseurs</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Pilotage, performance et objectifs des superviseurs réseau</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { if(mois===1){setMois(12);setAnnee(a=>a-1);}else setMois(m=>m-1); }}><ChevronLeft size={14}/></button>
          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>{MONTHS[mois-1]} {annee}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { if(mois===12){setMois(1);setAnnee(a=>a+1);}else setMois(m=>m+1); }}><ChevronRight size={14}/></button>
        </div>
      </div>

      {/* Sous-onglets */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              background: subTab === t.id ? 'rgba(255,105,0,0.12)' : 'transparent',
              color: subTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              border: 'none', borderBottom: subTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, borderRadius: '8px 8px 0 0',
            }}>{t.label}</button>
        ))}
      </div>

      {/* ── Sous-onglet : Objectif 3 PDVs/mois ── */}
      {subTab === 'pdvs_mois' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!pdvObjData ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Chargement...</div>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Total superviseurs', value: pdvObjData.summary?.total_superviseurs, color: '#8b5cf6', icon: '👔' },
                  { label: 'Objectif atteint ✅', value: pdvObjData.summary?.objectif_atteint, color: '#22c55e', icon: '✅' },
                  { label: 'PDVs remontés total', value: pdvObjData.summary?.total_pdvs_remontes, color: '#3b82f6', icon: '🏪' },
                  { label: 'Objectif / superviseur', value: '3 PDVs/mois', color: '#f59e0b', icon: '🎯' },
                ].map(k => (
                  <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, borderLeft: `3px solid ${k.color}` }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{k.icon} {k.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Liste superviseurs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(pdvObjData.superviseurs || []).map(sup => {
                  const taux = Math.min(sup.taux_completion, 100);
                  const color = taux >= 100 ? '#22c55e' : taux >= 66 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={sup.superviseur_id} style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>👔 {sup.superviseur_nom}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {sup.zone}</span>
                            <span style={{ background: color + '22', color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{sup.statut}</span>
                          </div>
                          <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 4, maxWidth: 300 }}>
                            <div style={{ width: `${taux}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <b style={{ color }}>{sup.nb_remontes}</b> / {sup.objectif_pdvs} PDVs remontés ce mois
                          </div>
                          {sup.pdvs_details?.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {sup.pdvs_details.map((p, i) => (
                                <span key={i} style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
                                  ✅ {p.nom} ({p.reference})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'center', minWidth: 60 }}>
                          <div style={{ fontSize: 28, fontWeight: 800, color }}>{sup.nb_remontes}/{sup.objectif_pdvs}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PDVs</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Sous-onglet : Classement ── */}
      {subTab === 'classement' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>🏆 Classement des Superviseurs — {MONTHS[mois-1]} {annee}</h3>
          {isLoadingStats ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Chargement...</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Rang', 'Superviseur', 'CA Mensuel', 'PDVs Actifs', 'PDVs Inactifs', 'Score Santé', 'Rétention', 'Var. CA'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {superviseurs.map((s, i) => {
                    const n = normSup(s);
                    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i===0 ? 'rgba(255,215,0,0.04)' : 'transparent' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary)', fontSize: 16 }}>{medal}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{n.superviseur}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--primary)', fontWeight: 700 }}>{formatCA(n.ca)}</td>
                        <td style={{ padding: '10px 12px', color: '#22c55e', fontWeight: 700 }}>{n.actifs}</td>
                        <td style={{ padding: '10px 12px', color: '#ef4444', fontWeight: 700 }}>{n.inactifs}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${n.score_sante}%`, height: '100%', background: n.score_sante>=70?'#22c55e':n.score_sante>=40?'#f59e0b':'#ef4444' }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{n.score_sante}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#22c55e' }}>{n.taux_retention.toFixed(1)}%</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: n.variation_ca > 0 ? '#22c55e' : n.variation_ca < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                          {n.variation_ca > 0 ? '↑' : n.variation_ca < 0 ? '↓' : '—'} {n.variation_ca !== 0 ? Math.abs(n.variation_ca).toFixed(1) + '%' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Sous-onglet : Vue d'ensemble (original) ── */}
      {subTab === 'overview' && isLoadingStats && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div>}
      {subTab === 'overview' && !isLoadingStats && statsError && !superviseurs.length && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>Erreur de chargement des données</div>}
      {subTab === 'overview' && !isLoadingStats && (
        <>
          {/* Cards superviseurs */}
          <div className="superviseurs-grid mb-24">
            {(showAll ? superviseurs : superviseurs.slice(0, 9)).map((s, i) => {
              const n = normSup(s);
              return (
                <div key={i} className="card superviseur-card"
                  style={{ cursor: 'pointer', border: selectedSuperviseur === n.superviseur ? '2px solid var(--primary)' : '1px solid var(--border)' }}
                  onClick={() => setSelectedSuperviseur(selectedSuperviseur === n.superviseur ? null : n.superviseur)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{getMedalEmoji(i + 1)} {n.superviseur}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Rang #{i + 1} · {n.nb_pdvs} PDVs</div>
                    </div>
                    {n.variation_ca !== 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: n.variation_ca > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {n.variation_ca > 0 ? '↑' : '↓'} {Math.abs(n.variation_ca).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="superviseur-kpis">
                    <div className="superviseur-kpi">
                      <div className="superviseur-kpi-value" style={{ fontSize: 14 }}>{formatCA(n.ca)}</div>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>Santé</span>
                      <span style={{ fontWeight: 700, color: n.score_sante >= 70 ? 'var(--success)' : n.score_sante >= 40 ? 'var(--warning)' : 'var(--danger)' }}>{n.score_sante}/100</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>Rétention</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>{n.taux_retention.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {superviseurs.length > 9 && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <button onClick={() => setShowAll(v => !v)}
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {showAll ? '▲ Réduire' : `▼ Voir tous les ${superviseurs.length} superviseurs`}
              </button>
            </div>
          )}

          {/* Graphique CA */}
          <div className="card mb-24">
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>📊 CA par Superviseur (Top 10)</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="superviseur" stroke="var(--text-secondary)" angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="ca" fill="#FF6900" name="Montant Transaction" radius={[8, 8, 0, 0]} />
                <Bar dataKey="actifs" fill="#00d68f" name="PDVs Actifs" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Scatter */}
          <div className="card mb-24">
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>📈 Score Santé vs Taux Rétention</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="score_sante" name="Score Santé" type="number" stroke="var(--text-secondary)"
                  label={{ value: 'Score Santé', position: 'insideBottomRight', offset: -5 }} />
                <YAxis dataKey="taux_retention" name="Taux Rétention (%)" stroke="var(--text-secondary)"
                  label={{ value: 'Taux Rétention (%)', angle: -90, position: 'insideLeft' }} />
                <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}
                  cursor={{ fill: 'rgba(255,105,0,0.1)' }} />
                <Scatter name="Superviseurs" data={chartData} fill="#FF6900" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="card table-wrapper">
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>📋 Tableau Détaillé</h3>
            <table>
              <thead>
                <tr>
                  <th>Rang</th><th>Superviseur</th><th>Montant Transaction</th>
                  <th>PDVs Actifs</th><th>PDVs Inactifs</th>
                  <th>Score Santé</th><th>Taux Rétention</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {superviseurs.map((s, i) => {
                  const n = normSup(s);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{getMedalEmoji(i + 1)} #{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{n.superviseur}</td>
                      <td style={{ color: 'var(--primary)' }}>{formatCA(n.ca)}</td>
                      <td style={{ color: 'var(--success)', fontWeight: 600 }}>{n.actifs}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{n.inactifs}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="progress-bar" style={{ width: 70 }}>
                            <div className="progress-fill" style={{ width: `${n.score_sante}%`, background: n.score_sante>=70?'var(--success)':n.score_sante>=40?'var(--warning)':'var(--danger)' }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{n.score_sante}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--success)' }}>{n.taux_retention.toFixed(1)}%</td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => setSelectedSuperviseur(n.superviseur)}>Voir PDVs</button>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700 }}>PDVs de {selectedSuperviseur}</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedSuperviseur(null)}>✕ Fermer</button>
              </div>
              {isLoadingPDVs ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement des PDVs...</div>
              ) : selectedPDVsData?.pdvs?.length > 0 ? (
                <div className="table-wrapper">
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 10 }}>
                    {selectedPDVsData.nb_pdvs} PDVs — triés par CA décroissant
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>PDV</th><th>Zone</th><th>Gestionnaire</th>
                        <th>CA Mensuel</th><th>Dépôts</th><th>Retraits</th>
                        <th>Nb Ops</th><th>Statut Mois</th><th>Score Santé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPDVsData.pdvs.map((pdv, idx) => {
                        const isActifMois = pdv.est_actif_mois;
                        const score = Math.round(pdv.health_score || 0);
                        return (
                          <tr key={pdv.id}>
                            <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{idx+1}</td>
                            <td><PDVCell nom={pdv.nom} numero={pdv.numero_pdv} /></td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{pdv.zone}</td>
                            <td style={{ fontSize: 12 }}>{pdv.gestionnaire}</td>
                            <td style={{ color: 'var(--primary)', fontWeight: 700 }}>{pdv.ca > 0 ? formatCA(pdv.ca) : '—'}</td>
                            <td style={{ color: '#4a9eff', fontSize: 12 }}>{pdv.montant_depots > 0 ? formatCA(pdv.montant_depots) : '—'}</td>
                            <td style={{ color: '#00d68f', fontSize: 12 }}>{pdv.montant_retraits > 0 ? formatCA(pdv.montant_retraits) : '—'}</td>
                            <td>{pdv.nb_operations > 0 ? pdv.nb_operations.toLocaleString() : '—'}</td>
                            <td>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                                background: isActifMois ? 'rgba(0,214,143,0.15)' : 'rgba(255,61,113,0.15)',
                                color: isActifMois ? 'var(--success)' : 'var(--danger)' }}>
                                {isActifMois ? '✓ Actif' : '✗ Inactif'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div className="progress-bar" style={{ width: 55 }}>
                                  <div className="progress-fill" style={{ width: `${score}%`, background: score>=70?'var(--success)':score>=40?'var(--warning)':'var(--danger)' }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{score}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Aucun PDV trouvé</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PAGE PRINCIPALE ───────────────────────────────────────────────────────────
export default function GestionReseauPage() {
  const [activeTab, setActiveTab] = useState('gestionnaires');

  const tabs = [
    { key: 'developpeurs',   label: '👨‍💼 Développeurs',               icon: Users },
    { key: 'gestionnaires',  label: '👔 Gestionnaires',               icon: Users },
    { key: 'potentialites',  label: '🗺️ Potentialités Réseau',        icon: MapPin },
    { key: 'grades',         label: '🏅 Grades & Qualification',      icon: Award },
    { key: 'envois',         label: '💰 Envois & Récupérations',      icon: DollarSign },
    { key: 'planning',       label: '📅 Planning des Visites',        icon: UserCheck },
    { key: 'superviseurs',   label: '👥 Superviseurs',                icon: UserCheck },
  ];

  return (
    <div className="page">
      {/* En-tête */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">🌐 Gestion du Réseau</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            Gestion complète du réseau de distribution Farouk Distribution
          </p>
        </div>
      </div>

      {/* TABS — même style que WeeklyDashboardPage */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28,
        background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '6px'
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              background: activeTab === t.key ? 'var(--primary)' : 'transparent',
              color: activeTab === t.key ? '#fff' : '#8a8a9a',
              transition: 'all 0.2s'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CONTENU */}
      {activeTab === 'developpeurs'  && <OngletDeveloppeurs />}
      {activeTab === 'gestionnaires' && <OngletGestionnaires />}
      {activeTab === 'potentialites' && <OngletPotentialites />}
      {activeTab === 'grades'        && <OngletGrades />}
      {activeTab === 'envois'        && <OngletEnvoisRecuperations />}
      {activeTab === 'planning'      && <OngletPlanningContent />}
      {activeTab === 'superviseurs'  && <OngletSuperviseurs />}
    </div>
  );
}
