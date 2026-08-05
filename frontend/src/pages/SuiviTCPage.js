/**
 * SuiviTCPage — Dashboard Admin pour évaluer les téléconseillères
 * Statistiques complètes des appels, classement TC, tendance, détail par TC
 */
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import api from '../services/api';

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUT_ICONS = {
  JOIGNABLE_PROMESSE: '✅', JOIGNABLE_PAS_INTERESSE: '📞',
  JOIGNABLE_DEJA_ACTIF: '🔄', NON_JOIGNABLE_HORS_ZONE: '📵',
  NON_JOIGNABLE_PAS_REPONSE: '🔕', NUMERO_INCORRECT: '❌',
  PDV_FERME: '🏪', RAPPEL_PROGRAMME: '📅',
};
const STATUT_COLORS_MAP = {
  JOIGNABLE_PROMESSE: '#22c55e', JOIGNABLE_DEJA_ACTIF: '#00d68f',
  JOIGNABLE_PAS_INTERESSE: '#ffa502', RAPPEL_PROGRAMME: '#a29bfe',
  NON_JOIGNABLE_HORS_ZONE: '#ff4757', NON_JOIGNABLE_PAS_REPONSE: '#ef4444',
  NUMERO_INCORRECT: '#ff4757', PDV_FERME: '#8a8a9a',
};
const CHART_COLORS = ['#3742fa','#FF6900','#22c55e','#ffa502','#a29bfe','#00d68f','#ff4757','#fd79a8'];

function ScoreBadge({ taux }) {
  const t = taux || 0;
  const color = t >= 70 ? '#22c55e' : t >= 40 ? '#ffa502' : '#ff4757';
  const label = t >= 70 ? '🌟 Excellent' : t >= 40 ? '⚡ Moyen' : '⚠️ À améliorer';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: `rgba(${t>=70?'34,197,94':t>=40?'255,165,2':'255,71,87'},0.15)`, color }}>
      {label} · {t}%
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#aaa', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#fff', fontWeight: 700 }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

// ─── Composant principal ──────────────────────────────────────────────────────
export default function SuiviTCPage() {
  const [selectedTC, setSelectedTC] = useState(null);
  const [searchAppels, setSearchAppels] = useState('');

  const { data: dashboard, isLoading } = useQuery(
    'suivi-tc-dashboard',
    () => api.get('/appels-tc/dashboard-admin').then(r => r.data),
    { staleTime: 60000, refetchInterval: 120000 }
  );

  const { data: appelsRecents } = useQuery(
    ['suivi-tc-appels', selectedTC],
    () => api.get('/appels-tc', {
      params: selectedTC ? { tc_user_id: selectedTC, limit: 100 } : { limit: 50 }
    }).then(r => r.data),
    { staleTime: 30000 }
  );

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div className="loading-spinner" />
      <p style={{ color: '#8a8a9a' }}>Chargement du tableau de bord TC...</p>
    </div>
  );

  const g = dashboard?.global || {};
  const parTC = dashboard?.par_tc || [];
  const parStatut = dashboard?.par_statut || [];
  const tendance = dashboard?.tendance_7j || [];
  const parIndicateur = dashboard?.par_indicateur || {};
  const appels = appelsRecents?.items || [];

  const filteredAppels = appels.filter(a =>
    !searchAppels ||
    (a.nom_pdv || '').toLowerCase().includes(searchAppels.toLowerCase()) ||
    (a.numero_pdv || '').toLowerCase().includes(searchAppels.toLowerCase()) ||
    (a.tc_nom || '').toLowerCase().includes(searchAppels.toLowerCase())
  );

  // Données pour graphique par statut
  const statData = parStatut.map(s => ({
    name: STATUT_ICONS[s.statut] + ' ' + (s.label?.split(' — ')[1] || s.label || s.statut).slice(0, 15),
    value: s.count,
    color: STATUT_COLORS_MAP[s.statut] || '#8a8a9a',
  }));

  // Données indicateur
  const indicData = Object.entries(parIndicateur).map(([ind, cnt]) => ({ name: ind, value: cnt }));

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">📞 Suivi Téléconseillères</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            Évaluation et statistiques des appels — {g.total || 0} appels enregistrés au total
          </p>
        </div>
      </div>

      {/* ══ KPIs GLOBAUX ══════════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { icon: '📞', label: 'Total Appels', value: g.total || 0, sub: `${g.ce_mois || 0} ce mois`, color: '#3742fa' },
          { icon: '☀️', label: "Aujourd'hui", value: g.aujourd_hui || 0, sub: `${g.cette_semaine || 0} cette semaine`, color: '#ffa502' },
          { icon: '✅', label: 'Taux Joignabilité', value: `${g.taux_joignabilite || 0}%`, sub: `${g.positifs || 0} joignables`, color: g.taux_joignabilite >= 50 ? '#22c55e' : '#ff4757' },
          { icon: '📅', label: 'Rappels en Attente', value: g.rappels_en_attente || 0, sub: 'À effectuer', color: '#a29bfe' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.07)`, borderTop: `3px solid ${k.color}`, borderRadius: 14 }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>{k.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{k.label}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ══ GRAPHIQUES ════════════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Tendance 7 jours */}
        <div style={{ background: 'linear-gradient(135deg, rgba(55,66,250,0.06) 0%, rgba(0,0,0,0) 60%)', border: '1px solid rgba(55,66,250,0.15)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>📈 Appels — 7 derniers jours</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={tendance}>
              <defs>
                <linearGradient id="tcTendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3742fa" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3742fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" name="Appels" stroke="#3742fa" fill="url(#tcTendGrad)" strokeWidth={2.5} dot={{ r: 4, fill: '#3742fa', stroke: '#0a0a1a', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Répartition par statut */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>🎯 Résultats des appels</h3>
          {statData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {statData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#8a8a9a', fontSize: 13 }}>Aucun appel enregistré</div>
          )}
        </div>
      </div>

      {/* ══ CLASSEMENT TC ═════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          🏆 Classement Téléconseillères
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8a8a9a' }}>— par nombre d'appels</span>
        </h2>
        {parTC.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, color: '#8a8a9a' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📵</div>
            <p>Aucun appel enregistré pour le moment.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Les TC doivent commencer à enregistrer des appels depuis les dashboards OMY et NAFAMA.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {parTC.map((tc, i) => {
              const isSelected = selectedTC === tc.tc_user_id;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              const maxTotal = parTC[0]?.total || 1;
              const barPct = Math.round(tc.total / maxTotal * 100);

              return (
                <div key={i}
                  onClick={() => setSelectedTC(isSelected ? null : tc.tc_user_id)}
                  style={{
                    padding: '16px 20px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                    background: isSelected ? 'rgba(55,66,250,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(55,66,250,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: isSelected ? '0 4px 24px rgba(55,66,250,0.15)' : 'none',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                    {/* Rang */}
                    <div style={{ fontSize: medal ? 28 : 16, minWidth: 36, textAlign: 'center', fontWeight: 700, color: '#8a8a9a' }}>
                      {medal || `${i + 1}`}
                    </div>
                    {/* Avatar */}
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#3742fa,#5f6cf5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                      {(tc.tc_nom || 'T').charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{tc.tc_nom || 'Téléconseillère'}</span>
                        <ScoreBadge taux={tc.taux_joignabilite} />
                      </div>
                      <div style={{ fontSize: 12, color: '#8a8a9a' }}>
                        {tc.total} appels · {tc.positifs} joignables · {tc.aujourd_hui} aujourd'hui
                        {tc.dernier_appel && ` · Dernier: ${new Date(tc.dernier_appel).toLocaleDateString('fr-FR')}`}
                      </div>
                    </div>
                    {/* KPIs droite */}
                    <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#3742fa' }}>{tc.total}</div>
                        <div style={{ fontSize: 10, color: '#8a8a9a' }}>Appels</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#22c55e' }}>{tc.taux_joignabilite}%</div>
                        <div style={{ fontSize: 10, color: '#8a8a9a' }}>Joignabilité</div>
                      </div>
                    </div>
                  </div>

                  {/* Barre de progression */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 50 }}>
                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: 'linear-gradient(90deg,#3742fa,#5f6cf5)', borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#64748b', minWidth: 30 }}>{barPct}%</span>
                  </div>

                  {/* Détail par statut */}
                  <div style={{ display: 'flex', gap: 6, marginLeft: 50, marginTop: 8, flexWrap: 'wrap' }}>
                    {Object.entries(tc.par_statut || {}).map(([statut, count]) => (
                      <span key={statut} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6,
                        background: `rgba(${STATUT_COLORS_MAP[statut] === '#22c55e' ? '34,197,94' : STATUT_COLORS_MAP[statut] === '#ff4757' ? '255,71,87' : '255,165,2'},0.1)`,
                        color: STATUT_COLORS_MAP[statut] || '#aaa', fontWeight: 600 }}>
                        {STATUT_ICONS[statut]} {count}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ LISTE DES APPELS ══════════════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            📋 {selectedTC ? `Appels de ${parTC.find(t => t.tc_user_id === selectedTC)?.tc_nom || 'TC sélectionnée'}` : '50 derniers appels'}
            {selectedTC && <button onClick={() => setSelectedTC(null)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.1)', color: '#ff4757', cursor: 'pointer' }}>✕ Voir tous</button>}
          </h2>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a8a9a', fontSize: 13 }}>🔍</span>
            <input type="text" placeholder="PDV, numéro, TC..." value={searchAppels} onChange={e => setSearchAppels(e.target.value)}
              style={{ padding: '8px 12px 8px 32px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(55,66,250,0.2)', borderRadius: 8, color: '#fff', fontSize: 13, width: 220 }} />
          </div>
        </div>

        {filteredAppels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, color: '#8a8a9a' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <p>Aucun appel trouvé</p>
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['PDV', 'Indicateur', 'Téléconseillère', 'Résultat', 'Commentaire', 'Date', 'Rappel'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#8a8a9a', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAppels.map((a, i) => {
                    const color = STATUT_COLORS_MAP[a.statut] || '#8a8a9a';
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700 }}>{a.numero_pdv}</div>
                          <div style={{ fontSize: 10, color: '#8a8a9a' }}>{a.nom_pdv}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                            background: a.indicateur === 'OMY' ? 'rgba(255,105,0,0.2)' : a.indicateur === 'NAFAMA' ? 'rgba(0,214,143,0.2)' : 'rgba(162,155,254,0.2)',
                            color: a.indicateur === 'OMY' ? '#FF6900' : a.indicateur === 'NAFAMA' ? '#00d68f' : '#a29bfe' }}>
                            {a.indicateur}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#a29bfe', fontWeight: 600 }}>{a.tc_nom}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                            background: `${color}15`, color }}>
                            {STATUT_ICONS[a.statut]} {a.statut_label?.split(' — ')[1] || a.statut_label || a.statut}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8', maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                            {a.commentaire || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#8a8a9a', whiteSpace: 'nowrap' }}>
                          {new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          {' '}
                          {new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#a29bfe' }}>
                          {a.date_rappel ? new Date(a.date_rappel).toLocaleDateString('fr-FR') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
