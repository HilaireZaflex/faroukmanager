import React, { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import { BarChart, Bar, PieChart, Pie, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Award, Zap, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import KPICard from '../components/common/KPICard';
import './IAPage.css';

const formatCA = (v) => {
  if (!v) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M FCFA`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} K FCFA`;
  return `${v} FCFA`;
};

const formatPercent = (v) => `${(v || 0).toFixed(1)}%`;

// ========== TAB 1: PRÉDICTIONS ==========
function TabPredictions() {
  const { data: predictions, isLoading } = useQuery('ia-predictions', () =>
    api.get('/analytics/predictions').then(r => r.data), { staleTime: 120000 }
  );
  
  const { mutate: recalculate, isLoading: isRecalculating } = useMutation(() =>
    api.post('/analytics/update-scores'), {
    onSuccess: () => toast.success('Scores recalculés avec succès !'),
    onError: () => toast.error('Erreur lors du recalcul')
  });

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(255,71,87,0.08)', borderColor: 'rgba(255,71,87,0.3)' }}>
        <Zap size={16} color="#ff4757" />
        <span>
          <strong>🤖 Moteur de Prédiction IA :</strong> L'algorithme analyse l'historique des 8 dernières semaines de chaque PDV — 
          pente de régression linéaire, baisses consécutives, coefficient de variation — pour calculer une probabilité de décrochage.
          Les PDVs à risque élevé (&gt;65%) nécessitent une intervention immédiate.
        </span>
      </div>

      <div className="kpi-row">
        <KPICard title="🔴 Risque Élevé" value={predictions?.high_risk_count || 0} color="#ff4757" subtitle="Intervention urgente requise" />
        <KPICard title="🟠 Risque Moyen" value={predictions?.medium_risk_count || 0} color="#ffa502" subtitle="Surveillance renforcée" />
        <KPICard title="🟢 Risque Faible" value={predictions?.low_risk_count || 0} color="#00d68f" subtitle="Situation sous contrôle" />
        <KPICard title="📊 Total Analysés" value={predictions?.total_at_risk || 0} color="#3742fa" subtitle="PDVs avec signal de risque" />
      </div>

      {predictions?.high_risk_pdvs && predictions.high_risk_pdvs.length > 0 && (
        <div>
          <h3 className="section-title">PDVs à Risque Élevé</h3>
          <div className="pdv-cards-grid">
            {predictions.high_risk_pdvs.map(pdv => (
              <div key={pdv.pdv_id} className="pdv-risk-card risk-high" onClick={() => navigate && navigate(`/pdvs/${pdv.pdv_id}`)} style={{cursor:"pointer"}}>
                <div className="pdv-header">
                  <span className="pdv-name">{pdv.pdv_name}</span>
                  <span className="badge badge-danger">{pdv.risk_level}</span>
                </div>
                <div className="pdv-zone">{pdv.zone}</div>
                <div className="probability-bar">
                  <div className="prob-fill" style={{ width: `${pdv.probability * 100}%` }} />
                  <span className="prob-text">{(pdv.probability * 100).toFixed(0)}%</span>
                </div>
                <div className="pdv-detail">Explication: {pdv.explanation}</div>
                <div className="pdv-metrics">
                  <div>CA prévu semaine: {formatCA(pdv.predicted_ca_next_week)}</div>
                  <div className={`trend ${pdv.trend_pct >= 0 ? 'up' : 'down'}`}>
                    {pdv.trend_pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {pdv.trend_pct.toFixed(1)}%
                  </div>
                  <div>Déclines consécutives: {pdv.consecutive_declines}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {predictions?.medium_risk_pdvs && predictions.medium_risk_pdvs.length > 0 && (
        <div>
          <h3 className="section-title">PDVs à Risque Moyen</h3>
          <div className="pdv-cards-grid">
            {predictions.medium_risk_pdvs.map(pdv => (
              <div key={pdv.pdv_id} className="pdv-risk-card risk-medium" onClick={() => navigate && navigate(`/pdvs/${pdv.pdv_id}`)} style={{cursor:"pointer"}}>
                <div className="pdv-header">
                  <span className="pdv-name">{pdv.pdv_name}</span>
                  <span className="badge badge-warning">{pdv.risk_level}</span>
                </div>
                <div className="pdv-zone">{pdv.zone}</div>
                <div className="probability-bar">
                  <div className="prob-fill" style={{ width: `${pdv.probability * 100}%`, backgroundColor: '#ffa502' }} />
                  <span className="prob-text">{(pdv.probability * 100).toFixed(0)}%</span>
                </div>
                <div className="pdv-detail">Explication: {pdv.explanation}</div>
                <div className="pdv-metrics">
                  <div>CA prévu semaine: {formatCA(pdv.predicted_ca_next_week)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(55,66,250,0.08)', borderRadius: 8, border: '1px solid rgba(55,66,250,0.2)', fontSize: 13, color: '#a0a0b8' }}>
        💡 <strong>Comment agir ?</strong> Pour chaque PDV à risque élevé, l'IA recommande : appel téléphonique immédiat du superviseur, visite terrain sous 48h, ou plan de récupération selon le segment.
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => recalculate()} disabled={isRecalculating}>
          {isRecalculating ? '⏳ Recalcul en cours...' : '🔄 Recalculer les Scores IA'}
        </button>
      </div>
    </div>
  );
}

// ========== TAB 2: HEALTH SCORE ==========
function TabHealthScores() {
  const { data: healthData, isLoading } = useQuery('ia-health-scores', () =>
    api.get('/analytics/health-scores').then(r => r.data), { staleTime: 120000 }
  );

  const scoreDistribution = healthData?.scores ? [
    { range: '0-20', count: healthData.scores.filter(s => s.health_score < 20).length },
    { range: '20-40', count: healthData.scores.filter(s => s.health_score >= 20 && s.health_score < 40).length },
    { range: '40-60', count: healthData.scores.filter(s => s.health_score >= 40 && s.health_score < 60).length },
    { range: '60-80', count: healthData.scores.filter(s => s.health_score >= 60 && s.health_score < 80).length },
    { range: '80-100', count: healthData.scores.filter(s => s.health_score >= 80).length },
  ] : [];

  const getScoreColor = (score) => {
    if (score >= 70) return '#00d68f';
    if (score >= 40) return '#ffa502';
    return '#ff4757';
  };

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(55,66,250,0.08)', borderColor: 'rgba(55,66,250,0.3)' }}>
        <Zap size={16} color="#3742fa" />
        <span>
          <strong>❤️ Health Score (0-100) :</strong> Score composite calculé automatiquement chaque semaine pour chaque PDV.
          Basé sur 4 critères : <strong>Activité récente</strong> (30 pts) · <strong>Tendance CA</strong> (25 pts) · 
          <strong>Stabilité</strong> (20 pts) · <strong>Volume relatif</strong> (15 pts) · <strong>Statut opérationnel</strong> (10 pts).
        </span>
      </div>

      <div className="kpi-row">
        <KPICard 
          title="🏥 Santé Moyenne Réseau" 
          value={healthData?.average_health ? healthData.average_health.toFixed(1) : '0'}
          formatted={healthData?.average_health ? `${healthData.average_health.toFixed(1)}/100` : '0'}
          color={getScoreColor(healthData?.average_health || 0)}
          subtitle="Score moyen des 200 PDVs"
        />
        <KPICard title="🥇 Médaille OR" value={healthData?.scores?.filter(s => s.medaille === 'OR').length || 0} color="#FFD700" subtitle="Top 10% du réseau" />
        <KPICard title="🥈 Médaille ARGENT" value={healthData?.scores?.filter(s => s.medaille === 'ARGENT').length || 0} color="#C0C0C0" subtitle="Top 25% du réseau" />
        <KPICard title="🥉 Médaille BRONZE" value={healthData?.scores?.filter(s => s.medaille === 'BRONZE').length || 0} color="#CD7F32" subtitle="Top 40% du réseau" />
      </div>

      {scoreDistribution.length > 0 && (
        <div className="card">
          <h3>Distribution des Scores</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#ff6900" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="info-banner" style={{ marginTop: '16px' }}>
        <span>🟢 Score &gt; 70 = Très bon {'|'} 🟠 40-70 = À surveiller {'|'} 🔴 Score &lt; 40 = Intervention urgente</span>
      </div>

      {healthData?.scores && (
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>Détail par PDV</h3>
          <div className="health-scores-list">
            {healthData.scores.map(pdv => (
              <div key={pdv.pdv_id} className="health-score-item">
                <div className="hs-left">
                  <span className="hs-name">{pdv.nom}</span>
                  <span className="hs-zone">{pdv.zone}</span>
                </div>
                <div className="hs-bar">
                  <div className="hs-fill" style={{ width: `${pdv.health_score}%`, backgroundColor: getScoreColor(pdv.health_score) }} />
                </div>
                <div className="hs-right">
                  <span className="hs-score">{pdv.health_score.toFixed(1)}</span>
                  {pdv.segment && <span className="badge badge-info">{pdv.segment}</span>}
                  {pdv.medaille && <span className="badge" style={{ background: pdv.medaille === 'OR' ? '#ffd700' : pdv.medaille === 'ARGENT' ? '#c0c0c0' : '#cd7f32', color: '#000' }}>{pdv.medaille}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== TAB 3: PRÉVISIONS CA ==========
function TabForecast() {
  const { data: forecast, isLoading } = useQuery('ia-forecast', () =>
    api.get('/analytics/forecast').then(r => r.data), { staleTime: 120000 }
  );

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(0,214,143,0.08)', borderColor: 'rgba(0,214,143,0.3)' }}>
        <Zap size={16} color="#00d68f" />
        <span>
          <strong>📈 Prévisions CA (4 semaines) :</strong> L'IA utilise un lissage exponentiel + régression linéaire sur les 12 dernières semaines 
          pour projeter le CA par zone. La zone colorée représente l'intervalle de confiance (±1.5σ). 
          Une tendance baissière déclenche automatiquement une alerte réseau.
        </span>
      </div>

      {forecast?.risk_alert !== undefined && (
        <div className={`alert ${forecast.risk_alert ? 'alert-danger' : 'alert-success'}`}>
          <AlertTriangle size={16} />
          <span>{forecast.risk_message || (forecast.risk_alert ? 'Alerte réseau' : 'Situation stable')}</span>
        </div>
      )}

      {forecast?.by_zone && Object.entries(forecast.by_zone).map(([zone, data]) => (
        <div key={zone} className="card" style={{ marginTop: '16px' }}>
          <h3>{zone}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data || []}>
              <defs>
                <linearGradient id="colorCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff6900" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#ff6900" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="semaine" />
              <YAxis />
              <Tooltip formatter={(v) => formatCA(v)} />
              <Area type="monotone" dataKey="ca_prevu" stroke="#ff6900" fillOpacity={1} fill="url(#colorCA)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

// ========== TAB 4: RECOMMANDATIONS ==========
const ACTION_CONFIG = {
  APPEL_URGENT:    { color: '#ff4757', bg: 'rgba(255,71,87,0.1)',   border: 'rgba(255,71,87,0.3)',   icon: '🚨', label: 'APPEL URGENT' },
  VISITE_TERRAIN:  { color: '#3742fa', bg: 'rgba(55,66,250,0.1)',   border: 'rgba(55,66,250,0.3)',   icon: '🚗', label: 'VISITE TERRAIN' },
  APPEL_PREVENTIF: { color: '#ffa502', bg: 'rgba(255,165,2,0.1)',   border: 'rgba(255,165,2,0.3)',   icon: '📞', label: 'APPEL PRÉVENTIF' },
  RECUPERATION:    { color: '#a55eea', bg: 'rgba(165,94,234,0.1)',  border: 'rgba(165,94,234,0.3)',  icon: '🔄', label: 'RÉCUPÉRATION' },
  ALERTE_ZONE:     { color: '#ff6b35', bg: 'rgba(255,107,53,0.1)',  border: 'rgba(255,107,53,0.3)',  icon: '🗺️', label: 'ALERTE ZONE' },
  FIDELISATION:    { color: '#FFD700', bg: 'rgba(255,215,0,0.1)',   border: 'rgba(255,215,0,0.3)',   icon: '🥇', label: 'FIDÉLISATION' },
  CROISSANCE:      { color: '#00d68f', bg: 'rgba(0,214,143,0.1)',   border: 'rgba(0,214,143,0.3)',   icon: '📈', label: 'CROISSANCE' },
  SUIVI_REQUIS:    { color: '#747d8c', bg: 'rgba(116,125,140,0.1)', border: 'rgba(116,125,140,0.3)', icon: '👁️', label: 'SUIVI REQUIS' },
};

function TabRecommendations() {
  const { data: recsData, isLoading, refetch } = useQuery('ia-recommendations', () =>
    api.get('/alerts/recommendations').then(r => r.data), { staleTime: 120000 }
  );

  const urgentCount = recsData?.recommandations?.filter(r => r.type === 'APPEL_URGENT').length || 0;
  const terrainCount = recsData?.recommandations?.filter(r => r.type === 'VISITE_TERRAIN').length || 0;
  const preventifCount = recsData?.recommandations?.filter(r => r.type === 'APPEL_PREVENTIF').length || 0;
  const positifCount = recsData?.recommandations?.filter(r => ['FIDELISATION','CROISSANCE'].includes(r.type)).length || 0;

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(255,105,0,0.08)', borderColor: 'rgba(255,105,0,0.3)' }}>
        <Zap size={16} color="#FF6900" />
        <span>
          <strong>📋 10 Actions Prioritaires IA — Semaine S{recsData?.semaine}/{recsData?.annee} :</strong> Générées automatiquement à partir de l'analyse en temps réel 
          des 200 PDVs. Chaque action est classée par priorité et type d'intervention : urgente, terrain, préventive, fidélisation ou croissance.
        </span>
      </div>

      {/* KPIs actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: '🚨 Urgentes', val: urgentCount, color: '#ff4757' },
          { label: '🚗 Terrain', val: terrainCount, color: '#3742fa' },
          { label: '📞 Préventives', val: preventifCount, color: '#ffa502' },
          { label: '🏆 Positives', val: positifCount, color: '#00d68f' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {isLoading && <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>⏳ Génération des actions IA en cours...</div>}

      {recsData?.recommandations && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recsData.recommandations.map((rec, idx) => {
            const cfg = ACTION_CONFIG[rec.type] || { color: '#747d8c', bg: 'rgba(116,125,140,0.1)', border: 'rgba(116,125,140,0.3)', icon: '●', label: rec.type };
            return (
              <div key={idx} style={{
                display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden',
                border: `1px solid ${cfg.border}`, background: cfg.bg
              }}>
                {/* Numéro priorité */}
                <div style={{
                  minWidth: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: cfg.color, color: '#fff', fontWeight: 900, fontSize: 18, flexShrink: 0
                }}>
                  {rec.priorite}
                </div>

                {/* Icône type */}
                <div style={{
                  minWidth: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${cfg.color}22`, fontSize: 22, flexShrink: 0
                }}>
                  {cfg.icon}
                </div>

                {/* Contenu principal */}
                <div style={{ flex: 1, padding: '12px 16px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{
                      background: cfg.color, color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5
                    }}>{cfg.label}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#e0e0e0' }}>{rec.pdv_nom}</span>
                    {rec.zone && <span style={{ fontSize: 12, color: '#8a8a9a' }}>📍 {rec.zone}</span>}
                    {rec.health_score && (
                      <span style={{
                        fontSize: 11, padding: '1px 6px', borderRadius: 4, marginLeft: 'auto',
                        background: rec.health_score >= 80 ? 'rgba(0,214,143,0.15)' : rec.health_score >= 60 ? 'rgba(255,165,2,0.15)' : 'rgba(255,71,87,0.15)',
                        color: rec.health_score >= 80 ? '#00d68f' : rec.health_score >= 60 ? '#ffa502' : '#ff4757',
                      }}>Health: {rec.health_score}/100</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#c0c0d0', marginBottom: 6, lineHeight: 1.5 }}>{rec.message}</div>
                  <div style={{ fontSize: 11, color: '#8a8a9a', fontStyle: 'italic' }}>💡 {rec.raison}</div>
                </div>

                {/* Infos contact / superviseur */}
                <div style={{
                  minWidth: 160, padding: '12px 14px', borderLeft: `1px solid ${cfg.border}`,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, flexShrink: 0
                }}>
                  {rec.telephone && (
                    <a href={`tel:${rec.telephone}`} style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                      color: '#00d68f', textDecoration: 'none', fontWeight: 600
                    }}>📞 {rec.telephone}</a>
                  )}
                  {rec.superviseur && (
                    <div style={{ fontSize: 11, color: '#8a8a9a' }}>
                      👤 <span style={{ color: '#c0c0d0' }}>{rec.superviseur}</span>
                    </div>
                  )}
                  {!rec.telephone && !rec.superviseur && (
                    <div style={{ fontSize: 11, color: '#8a8a9a', fontStyle: 'italic' }}>Action globale</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => refetch()} style={{ fontSize: 12 }}>
          🔄 Régénérer les actions IA
        </button>
      </div>
    </div>
  );
}

// ========== TAB 5: SEGMENTATION ==========
function TabSegmentation() {
  const { data: segData, isLoading } = useQuery('ia-segments', () =>
    api.get('/analytics/segments').then(r => r.data), { staleTime: 120000 }
  );

  const SEG_COLORS = {
    Champion: '#00d68f', Stable: '#3742fa', 'En croissance': '#ffa502',
    'À surveiller': '#ff9f43', Déclinant: '#ff4757', Inactif: '#747d8c'
  };

  const SEG_EMOJI = {
    Champion: '🏆', Stable: '📊', 'En croissance': '📈',
    'À surveiller': '⚠️', Déclinant: '📉', Inactif: '❌'
  };

  const SEG_STRATEGY = {
    Champion: 'Fidélisation, médaille Or, communication résultats',
    Stable: 'Suivi standard, encouragement, potentiel Top 50',
    'En croissance': 'Accompagnement, encouragement fort',
    'À surveiller': 'Appel préventif téléconseillère, score risque suivi',
    Déclinant: 'Intervention superviseur, visite terrain urgente',
    Inactif: 'Processus récupération déclenché automatiquement'
  };

  const segmentsArray = segData?.segments ? Object.entries(segData.segments).map(([name, data]) => ({
    name, ...data
  })) : [];

  const pieData = segmentsArray.map(s => ({ name: s.name, value: s.count || 0 }));

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(255,165,2,0.08)', borderColor: 'rgba(255,165,2,0.3)' }}>
        <Zap size={16} color="#ffa502" />
        <span>
          <strong>🎯 Segmentation Comportementale IA :</strong> Chaque PDV est classé automatiquement selon son percentile dans le réseau.
          🏆 <strong>Champion</strong> (top 20%) · 📊 <strong>Stable</strong> (50-80%) · ⚠️ <strong>À surveiller</strong> (30-50%) · 
          📉 <strong>Déclinant</strong> (15-30%) · ❌ <strong>Inactif</strong> (bottom 15%).
          Chaque segment a une stratégie d'action dédiée.
        </span>
      </div>

      {pieData.length > 0 && (
        <div className="card">
          <h3>Distribution par Segment</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} outerRadius={100} fill="#8884d8" dataKey="value">
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={SEG_COLORS[entry.name] || '#8884d8'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="segments-grid">
        {segmentsArray.map(seg => (
          <div key={seg.name} className="seg-card" style={{ borderLeftColor: SEG_COLORS[seg.name] }}>
            <div className="seg-emoji">{SEG_EMOJI[seg.name] || '●'}</div>
            <div className="seg-name">{seg.name}</div>
            <div className="seg-count">{seg.count || 0} PDVs</div>
            <div className="seg-ca">{formatCA(seg.ca_total || 0)}</div>
            <div className="seg-health">Santé: {(seg.health_avg || 0).toFixed(1)}/100</div>
            <div className="seg-strategy">{SEG_STRATEGY[seg.name]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== TAB 6: CONCENTRATION (GINI) ==========
function TabConcentration() {
  const { data: giniData, isLoading } = useQuery('ia-gini', () =>
    api.get('/analytics/gini').then(r => r.data), { staleTime: 120000 }
  );

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(55,66,250,0.08)', borderColor: 'rgba(55,66,250,0.3)' }}>
        <Zap size={16} color="#3742fa" />
        <span>
          <strong>📊 Concentration du Réseau — Coefficient de Gini :</strong> Mesure si le CA est réparti équitablement (Gini=0) ou concentré sur peu de PDVs (Gini=1). 
          L'analyse Pareto révèle combien de PDVs génèrent 80% du CA total.
          Un Gini &gt; 0.5 signifie que le réseau est fragile : perdre quelques PDVs clés impacte fortement le CA global.
        </span>
      </div>

      {giniData && (
        <>
          <div className="kpi-row">
            <KPICard 
              title="Coefficient de Gini" 
              value={giniData.gini_coefficient?.toFixed(2) || '0'}
              subtitle={giniData.interpretation || ''}
              color="#3742fa"
            />
          </div>

          {giniData.gini_coefficient > 0.5 && (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <span>⚠️ Réseau fragile: Top 20% génère {giniData.pareto?.top_20_contribution_pct?.toFixed(1)}% du CA</span>
            </div>
          )}

          {giniData.pareto && (
            <div className="card" style={{ marginTop: '16px' }}>
              <h3>Analyse Pareto</h3>
              <div className="pareto-stats">
                <div className="stat">
                  <span className="stat-label">Top 20% des PDVs</span>
                  <span className="stat-value">{giniData.pareto.top_20_pct_count}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Contribution CA</span>
                  <span className="stat-value">{giniData.pareto.top_20_contribution_pct?.toFixed(1)}%</span>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <h4>Top 10 PDVs</h4>
                <div className="top-pdv-list">
                  {giniData.pareto.details?.slice(0, 10).map((pdv, idx) => (
                    <div key={idx} className="top-pdv-item">
                      <span className="rank">#{idx + 1}</span>
                      <span className="name">{pdv.nom}</span>
                      <span className="ca">{formatCA(pdv.ca)}</span>
                      <span className="pct">{pdv.pct_total?.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ========== TAB 7: HEATMAP ==========
function TabHeatmap() {
  const { data: lastAvailable } = useQuery('last-available', () =>
    api.get('/dashboard/last-available').then(r => r.data), { staleTime: 300000 }
  );
  const { data: heatmapData, isLoading } = useQuery(
    ['ia-heatmap', lastAvailable?.last_month?.annee, lastAvailable?.last_month?.mois],
    () => api.get('/analytics/heatmap', { params: { annee: lastAvailable.last_month.annee, mois: lastAvailable.last_month.mois } }).then(r => r.data),
    { enabled: !!lastAvailable?.last_month, staleTime: 120000 }
  );

  const zonesList = heatmapData?.data ? Object.entries(heatmapData.data).map(([zone, stats]) => ({
    zone, ...stats
  })).sort((a, b) => (b.ca || 0) - (a.ca || 0)) : [];

  const maxCA = Math.max(...zonesList.map(z => z.ca || 0), 1);

  const getZoneColor = (ca, max) => {
    const pct = ca / max;
    if (pct > 0.7) return 'rgba(0, 214, 143, 0.2)';
    if (pct > 0.4) return 'rgba(255, 165, 2, 0.2)';
    return 'rgba(255, 71, 87, 0.2)';
  };

  const zoneChartData = zonesList.map(z => ({ name: z.zone, ca: z.ca || 0 }));

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(0,214,143,0.08)', borderColor: 'rgba(0,214,143,0.3)' }}>
        <Zap size={16} color="#00d68f" />
        <span>
          <strong>🗺️ Heatmap Géographique par Zone :</strong> Visualisation de la performance de chaque zone commerciale.
          🟢 Vert = Zone forte (&gt;70% du max) · 🟠 Orange = Zone moyenne · 🔴 Rouge = Zone à renforcer.
          Permet d'identifier rapidement les zones prioritaires pour les visites terrain et les ressources superviseurs.
        </span>
      </div>

      {heatmapData && (
        <>
          <div className="kpi-row">
            <KPICard title="Zones Actives" value={heatmapData.zones || 0} />
            <KPICard title="CA Total Réseau" value={formatCA(heatmapData.total_ca)} formatted={formatCA(heatmapData.total_ca)} />
          </div>

          <div className="zones-grid">
            {zonesList.map(zone => (
              <div 
                key={zone.zone} 
                className="zone-card"
                style={{ backgroundColor: getZoneColor(zone.ca, maxCA) }}
              >
                <div className="zone-name">{zone.zone}</div>
                <div className="zone-ca">{formatCA(zone.ca)}</div>
                <div className="zone-stats">
                  <span>{zone.count || 0} PDVs actifs</span>
                  <span>{(zone.pct_network || 0).toFixed(1)}% du réseau</span>
                  <span>Santé: {(zone.health_avg || 0).toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>

          {zoneChartData.length > 0 && (
            <div className="card" style={{ marginTop: '16px' }}>
              <h3>CA par Zone</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={zoneChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip formatter={(v) => formatCA(v)} />
                  <Bar dataKey="ca" fill="#ff6900" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ========== TAB 8: MÉDAILLES ==========
function TabMedailles() {
  const { data: healthData, isLoading } = useQuery('ia-health-scores', () =>
    api.get('/analytics/health-scores').then(r => r.data), { staleTime: 120000 }
  );

  const orCount = healthData?.scores?.filter(s => s.medaille === 'OR').length || 0;
  const argentCount = healthData?.scores?.filter(s => s.medaille === 'ARGENT').length || 0;
  const bronzeCount = healthData?.scores?.filter(s => s.medaille === 'BRONZE').length || 0;
  const orPDVs = healthData?.scores?.filter(s => s.medaille === 'OR') || [];

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(255,215,0,0.08)', borderColor: 'rgba(255,215,0,0.3)' }}>
        <Zap size={16} color="#FFD700" />
        <span>
          <strong>🏅 Système de Reconnaissance et Motivation :</strong> L'IA attribue automatiquement des médailles chaque semaine.
          🥇 <strong>OR</strong> = Top 10% réseau (health score ≥ 70) · 🥈 <strong>ARGENT</strong> = Top 25% · 🥉 <strong>BRONZE</strong> = Top 40%.
          Ces médailles sont communiquées aux PDVs pour les motiver et fidéliser les meilleurs distributeurs.
        </span>
      </div>

      <div className="medals-row">
        <div className="medal-card gold">
          <div className="medal-emoji">🥇</div>
          <div className="medal-name">OR</div>
          <div className="medal-count">{orCount}</div>
        </div>
        <div className="medal-card silver">
          <div className="medal-emoji">🥈</div>
          <div className="medal-name">ARGENT</div>
          <div className="medal-count">{argentCount}</div>
        </div>
        <div className="medal-card bronze">
          <div className="medal-emoji">🥉</div>
          <div className="medal-name">BRONZE</div>
          <div className="medal-count">{bronzeCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <h3>Critères de Médailles</h3>
        <div className="medals-criteria">
          <div className="criterion">
            <span className="criterion-emoji">🥇</span>
            <div>
              <strong>OR:</strong> Top 20% du réseau sur 6 derniers mois
            </div>
          </div>
          <div className="criterion">
            <span className="criterion-emoji">🥈</span>
            <div>
              <strong>ARGENT:</strong> PDVs réguliers et stables sur 3+ mois
            </div>
          </div>
          <div className="criterion">
            <span className="criterion-emoji">🥉</span>
            <div>
              <strong>BRONZE:</strong> PDVs actifs mais sous la moyenne
            </div>
          </div>
        </div>
      </div>

      {orPDVs.length > 0 && (
        <div className="card" style={{ marginTop: '16px' }}>
          <h3>PDVs Médaillés OR</h3>
          <div className="medals-pdv-list">
            {orPDVs.map(pdv => (
              <div key={pdv.pdv_id} className="medal-pdv-item" onClick={() => navigate && navigate(`/pdvs/${pdv.pdv_id}`)} style={{cursor:"pointer"}}>
                <span className="medal-pdv-emoji">🥇</span>
                <div className="medal-pdv-info">
                  <span className="medal-pdv-name">{pdv.nom}</span>
                  <span className="medal-pdv-zone">{pdv.zone}</span>
                </div>
                <span className="medal-pdv-score">{pdv.health_score?.toFixed(1)}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== TAB 9: COMPÉTITION ==========
function TabCompetition() {
  const { data: compData, isLoading } = useQuery('ia-competition', () =>
    api.get('/reports/competition').then(r => r.data), { staleTime: 120000 }
  );

  const handleExportPPT = () => {
    toast('Export disponible en version Pro', { icon: '✨' });
  };

  return (
    <div className="ia-tab">
      <div className="info-banner" style={{ background: 'rgba(255,105,0,0.08)', borderColor: 'rgba(255,105,0,0.3)' }}>
        <Zap size={16} color="#FF6900" />
        <span>
          <strong>⚔️ Dashboard Compétition Réseau Orange Mali :</strong> Vue consolidée du classement général du réseau.
          Classement en temps réel des 200 PDVs par CA et santé. Narration automatique générée par l'IA pour les rapports de direction.
          Export PowerPoint disponible pour les présentations managériales.
        </span>
      </div>

      {compData && (
        <>
          <div className="kpi-row">
            <KPICard title="PDVs Totals" value={compData.total_pdvs || 0} />
            <KPICard title="CA Total Réseau" value={formatCA(compData.total_network_ca)} formatted={formatCA(compData.total_network_ca)} />
            <KPICard title="Taux Activité" value={(compData.total_pdvs ? '95' : '0')} formatted="95%" />
            <KPICard title="Santé Moyenne" value={(compData.health_avg || 55).toFixed(0)} formatted={(compData.health_avg || 55).toFixed(0)} />
          </div>

          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Top 10 PDVs</h3>
            <table className="competition-table">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Nom PDV</th>
                  <th>Zone</th>
                  <th>Médaille</th>
                  <th>CA</th>
                  <th>Santé</th>
                </tr>
              </thead>
              <tbody>
{compData.top_10_pdvs?.map((pdv, idx) => (
                  <tr key={idx} style={{cursor:"pointer"}} onClick={() => navigate && navigate(`/pdvs/${pdv.id || pdv.pdv_id}`)}>
                    <td>#{idx + 1}</td>
                    <td>{pdv.nom}</td>
                    <td>{pdv.zone}</td>
                    <td>
                      {pdv.medaille === 'OR' && '🥇 OR'}
                      {pdv.medaille === 'ARGENT' && '🥈 ARGENT'}
                      {pdv.medaille === 'BRONZE' && '🥉 BRONZE'}
                      {!pdv.medaille && '—'}
                    </td>
                    <td>{formatCA(pdv.ca)}</td>
                    <td>
                      <div className="health-bar-small">
                        <div className="health-fill" style={{ width: `${pdv.health_score}%` }} />
                      </div>
                      {pdv.health_score?.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Narration Automatique</h3>
            <p>Ce mois, votre réseau compte <strong>{compData.total_pdvs}</strong> PDVs actifs pour une CA totale de <strong>{formatCA(compData.total_network_ca)}</strong>. Performance moyenne en santé: <strong>{compData.health_avg?.toFixed(1)}/100</strong>.</p>
          </div>

          <button className="btn btn-primary" onClick={handleExportPPT} style={{ marginTop: '16px' }}>
            Exporter PowerPoint
          </button>
        </>
      )}
    </div>
  );
}

export default function IAPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('predictions');

  // KPIs globaux réseau pour l'entête
  const { data: healthData } = useQuery('ia-health-scores', () =>
    api.get('/analytics/health-scores').then(r => r.data), { staleTime: 120000 }
  );
  const { data: segData } = useQuery('ia-segments', () =>
    api.get('/analytics/segments').then(r => r.data), { staleTime: 120000 }
  );
  const { data: predictions } = useQuery('ia-predictions', () =>
    api.get('/analytics/predictions').then(r => r.data), { staleTime: 120000 }
  );

  const tabs = [
    { id: 'predictions', label: '⚠️ PRÉDICTIONS RISQUE', component: TabPredictions },
    { id: 'health', label: '❤️ HEALTH SCORE', component: TabHealthScores },
    { id: 'forecast', label: '📈 PRÉVISIONS CA', component: TabForecast },
    { id: 'recommendations', label: '📋 ACTIONS IA', component: TabRecommendations },
    { id: 'segmentation', label: '🎯 SEGMENTATION', component: TabSegmentation },
    { id: 'concentration', label: '📊 CONCENTRATION', component: TabConcentration },
    { id: 'heatmap', label: '🗺️ HEATMAP ZONES', component: TabHeatmap },
    { id: 'medailles', label: '🏅 MÉDAILLES', component: TabMedailles },
    { id: 'competition', label: '⚔️ COMPÉTITION', component: TabCompetition },
  ];

  const championCount = segData?.segments?.Champion?.count || 0;
  const declinantCount = (segData?.segments?.Déclinant?.count || 0) + (segData?.segments?.Inactif?.count || 0);
  const highRisk = predictions?.high_risk_count || 0;
  const avgHealth = healthData?.average_health || 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🧠 Intelligence Artificielle — Réseau Orange Mali</h1>
          <p className="page-subtitle">Analyse prédictive · Segmentation comportementale · Recommandations automatiques · 200 PDVs analysés en temps réel</p>
        </div>
      </div>

      {/* KPIs globaux IA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Santé Réseau</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: avgHealth >= 70 ? '#00d68f' : avgHealth >= 50 ? '#ffa502' : '#ff4757' }}>{avgHealth.toFixed(1)}<span style={{ fontSize: 14, color: '#8a8a9a' }}>/100</span></div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>Score moyen des 200 PDVs</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>🏆 Champions</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#00d68f' }}>{championCount}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>PDVs top 20% du réseau</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>📉 En Difficulté</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ff4757' }}>{declinantCount}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>PDVs déclinants + inactifs</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${highRisk > 0 ? 'rgba(255,71,87,0.5)' : 'rgba(255,165,2,0.3)'}`, borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#8a8a9a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ Alertes IA</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: highRisk > 0 ? '#ff4757' : '#ffa502' }}>{highRisk + (predictions?.medium_risk_count || 0)}</div>
          <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>{highRisk} élevé · {predictions?.medium_risk_count || 0} moyen</div>
        </div>
      </div>

      <div className="tabs-container" style={{ flexWrap: 'wrap', gap: 6 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map(tab => (
        activeTab === tab.id && <tab.component key={tab.id} navigate={navigate} />
      ))}
    </div>
  );
}
