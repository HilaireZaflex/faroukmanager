import React from 'react';
import { useQuery } from 'react-query';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Brain, TrendingDown, AlertTriangle, Award } from 'lucide-react';
import api from '../services/api';
import './AnalyticsPage.css';

const SEG_COLORS = {
  Champion: '#00d68f', Stable: '#3742fa',
  Déclinant: '#ffa502', Inactif: '#ff4757', Nouveau: '#a29bfe'
};

function formatCA(v) {
  if (!v) return '0';
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)} M FCFA`;
  if (v >= 1_000) return `${(v/1_000).toFixed(0)} K FCFA`;
  return `${v} FCFA`;
}

export default function AnalyticsPage() {
  const { data: segments, isLoading: loadSeg } = useQuery(
    'analytics-segments',
    () => api.get('/analytics/segments').then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: healthScores, isLoading: loadHS } = useQuery(
    'analytics-health',
    () => api.get('/analytics/health-scores').then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: predictions, isLoading: loadPred } = useQuery(
    'analytics-predictions',
    () => api.get('/analytics/predictions').then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: heatmap, isLoading: loadHeat } = useQuery(
    'analytics-heatmap',
    () => api.get('/analytics/heatmap', { params: { annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 } }).then(r => r.data),
    { staleTime: 120000 }
  );

  // Segments pie data — API retourne {segments: {PREMIUM: {count, pdvs}, ...}}
  const segData = segments?.segments
    ? Object.entries(segments.segments).map(([name, data]) => ({
        name,
        value: typeof data === 'object' ? data.count : data
      }))
    : [];

  // Health score distribution — API retourne {count, average_health, scores: [...]}
  const hsList = healthScores?.scores || (Array.isArray(healthScores) ? healthScores : []);
  const hsData = hsList.length ? [
    { range: '0-20', count: hsList.filter(h => h.health_score < 20).length },
    { range: '20-40', count: hsList.filter(h => h.health_score >= 20 && h.health_score < 40).length },
    { range: '40-60', count: hsList.filter(h => h.health_score >= 40 && h.health_score < 60).length },
    { range: '60-80', count: hsList.filter(h => h.health_score >= 60 && h.health_score < 80).length },
    { range: '80-100', count: hsList.filter(h => h.health_score >= 80).length },
  ] : [];

  // Predictions — API retourne {high_risk_pdvs, medium_risk_pdvs, ...}
  const atRisk = [...(predictions?.high_risk_pdvs || []), ...(predictions?.medium_risk_pdvs || [])].slice(0, 10);
  // Heatmap — API retourne {zones: 8, data: {zone: {ca, count, health_avg}}}
  const heatmapList = heatmap?.data
    ? Object.entries(heatmap.data).map(([zone, d]) => ({
        zone,
        ca_total: d.ca || 0,
        nb_pdvs: d.count || 0,
        health_avg: d.health_avg || 0,
      })).sort((a, b) => b.ca_total - a.ca_total)
    : [];
  const maxCA = Math.max(...heatmapList.map(z => z.ca_total || 0), 1);

  return (
    <div className="page analytics-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics IA</h1>
          <p className="page-subtitle">Intelligence artificielle au service du réseau PDV</p>
        </div>
        <div className="badge badge-orange" style={{ padding: '6px 14px', fontSize: 12 }}>
          🤖 Alimenté par IA
        </div>
      </div>

      {/* Légende des modules IA */}
      <div style={{ background:'rgba(255,105,0,0.04)', border:'1px solid rgba(255,105,0,0.15)', borderRadius:'var(--radius)', padding:'16px 20px', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <span style={{ fontSize:18 }}>🤖</span>
          <h3 style={{ fontSize:14, fontWeight:700 }}>Légende des Modules IA — Comment ça marche ?</h3>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          {[
            { icon:'🏆', title:'Segmentation PDV', desc:'Classe chaque PDV en 5 catégories selon ses performances : Champion (top performers), Stable (réguliers), Déclinant (en baisse), Inactif (0 transaction) et Nouveau (récemment activé). Permet de cibler les actions commerciales.' },
            { icon:'❤️', title:'Health Score (Score de Santé)', desc:'Note de 0 à 100 calculée par l\'IA sur 5 critères : CA, volume de transactions, fréquence de suivi superviseur, tendance d\'activation et conformité équipe. Un score ≥70 = sain, 40-70 = à surveiller, <40 = critique.' },
            { icon:'⚠️', title:'Prédiction de Risque', desc:'Algorithme prédictif qui analyse les tendances des 4 dernières semaines pour identifier les PDVs susceptibles de devenir inactifs. Probabilité de 0% (aucun risque) à 100% (très probable). Priorité d\'intervention : HAUT >70%, MOYEN 40-70%, FAIBLE <40%.' },
            { icon:'🗺️', title:'Performance par Zone (Heatmap)', desc:'Comparaison visuelle de toutes les zones géographiques selon leur contribution au CA réseau. La barre colorée montre le poids relatif de chaque zone. Permet d\'identifier les zones sous-performantes et de mieux répartir les ressources terrain.' },
          ].map((m, i) => (
            <div key={i} style={{ display:'flex', gap:12, padding:'12px 14px', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid var(--border)' }}>
              <span style={{ fontSize:22, flexShrink:0 }}>{m.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>{m.title}</div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.6 }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 1: Segments + Health Distribution */}
      <div className="analytics-row mb-24">
        {/* Segmentation */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <Award size={18} style={{ color:'var(--primary)' }} />
            <h3 style={{ fontSize:14, fontWeight:700 }}>Segmentation PDV</h3>
          </div>
          {loadSeg ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={segData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {segData.map((entry, i) => <Cell key={i} fill={SEG_COLORS[entry.name] || '#888'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="seg-legend">
                {segData.map((s, i) => (
                  <div key={i} className="seg-item">
                    <div className="seg-dot" style={{ background: SEG_COLORS[s.name] || '#888' }} />
                    <span className="seg-name">{s.name}</span>
                    <span className="seg-count">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Health Score Distribution */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <Brain size={18} style={{ color:'var(--primary)' }} />
            <h3 style={{ fontSize:14, fontWeight:700 }}>Distribution Health Score</h3>
          </div>
          {loadHS ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hsData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6,6,0,0]}>
                  {hsData.map((entry, i) => {
                    const colors = ['#ff4757','#ff4757','#ffa502','#00d68f','#00d68f'];
                    return <Cell key={i} fill={colors[i]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 2: Predictions + Heatmap */}
      <div className="analytics-row mb-24">
        {/* PDVs à risque */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <AlertTriangle size={18} style={{ color:'var(--warning)' }} />
            <h3 style={{ fontSize:14, fontWeight:700 }}>PDVs à Risque de Baisse</h3>
          </div>
          {loadPred ? (
            Array(5).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 48, marginBottom: 8, borderRadius: 10 }} />)
          ) : atRisk.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--text-secondary)', padding: 30 }}>✅ Aucun PDV à risque élevé</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {atRisk.map((pdv, i) => {
                const prob = pdv.decline_probability || pdv.probability || 0;
                const risk = prob >= 0.7 ? { label:'HAUT', color:'var(--danger)' } : prob >= 0.4 ? { label:'MOYEN', color:'var(--warning)' } : { label:'FAIBLE', color:'var(--success)' };
                return (
                  <div key={i} className="risk-item">
                    <div className="risk-info">
                      <div style={{ fontWeight:600, fontSize:13 }}>{pdv.nom || pdv.numero_pdv}</div>
                      <div style={{ fontSize:11, color:'var(--text-secondary)' }}>{pdv.zone || '—'}</div>
                    </div>
                    <div className="risk-prob">
                      <div className="progress-bar" style={{ width: 80 }}>
                        <div className="progress-fill" style={{ width:`${prob*100}%`, background: risk.color }} />
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:risk.color }}>{(prob*100).toFixed(0)}%</span>
                    </div>
                    <span className={`badge ${prob>=0.7?'badge-danger':prob>=0.4?'badge-warning':'badge-success'}`}>{risk.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Heatmap zones */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <TrendingDown size={18} style={{ color:'var(--primary)' }} />
            <h3 style={{ fontSize:14, fontWeight:700 }}>Performance par Zone</h3>
          </div>
          {loadHeat ? (
            Array(5).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8, borderRadius: 8 }} />)
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {heatmapList.map((z, i) => {
                const pct = maxCA ? (z.ca_total / maxCA) * 100 : 0;
                const colors = ['#FF6900','#ff8c3a','#ffa502','#00d68f','#3742fa','#a29bfe','#fd79a8','#00cec9'];
                return (
                  <div key={i} className="heatmap-row">
                    <div className="heatmap-zone">{z.zone}</div>
                    <div className="heatmap-bar-wrap">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                      </div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', minWidth:80, textAlign:'right' }}>
                      {formatCA(z.ca_total)}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-secondary)', minWidth:50, textAlign:'right' }}>
                      {z.nb_pdvs} PDVs
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
