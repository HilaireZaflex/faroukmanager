import React from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart
} from 'recharts';
import {
  Store, Activity, AlertTriangle, TrendingUp, Users, RefreshCw,
  Brain, Award, ArrowRight, CheckCircle, Clock, Map
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import './AccueilPage.css';

const fmt = (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v)) + ' FCFA';
const fmtM = (v) => v >= 1e9 ? (v/1e9).toFixed(2)+' Mrd FCFA' : v >= 1e6 ? (v/1e6).toFixed(1)+' M FCFA' : fmt(v);
const COLORS = { Champion:'#00d68f', Stable:'#3742fa', 'À surveiller':'#ffa502', Déclinant:'#ff4757', Inactif:'#747d8c', 'En croissance':'#ff9f43' };
const SEG_COLORS = ['#00d68f','#3742fa','#ffa502','#ff4757','#747d8c','#ff9f43'];

const ZONE_COLORS = {
  'Bamako Centre':'#ff6900','Bamako Nord':'#3742fa','Bamako Sud':'#00d68f',
  'Bamako Est':'#ffa502','Bamako Ouest':'#ff4757','Kati':'#a29bfe',
  'Koulikoro':'#fd79a8','Sikasso':'#00cec9'
};

function StatCard({ icon: Icon, value, label, sub, color='var(--primary)', onClick, badge }) {
  return (
    <div className="stat-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="stat-icon" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="stat-body">
        <div className="stat-value" style={{ color }}>{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      {badge && <div className="stat-badge" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>{badge}</div>}
      {onClick && <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
    </div>
  );
}

function SectionTitle({ emoji, title, link, navigate }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700 }}>{emoji} {title}</h2>
      {link && <button className="btn btn-ghost btn-sm" onClick={() => navigate(link)} style={{ fontSize:11 }}>Voir tout <ArrowRight size={11}/></button>}
    </div>
  );
}

export default function AccueilPage() {
  const { user, setUser } = useAuthStore();

  // Recharger le profil utilisateur depuis l'API pour avoir les données à jour
  useQuery('current-user-profile', () => api.get('/auth/me').then(r => r.data), {
    onSuccess: (data) => { if (data && data.nom) setUser({ ...user, ...data }); },
    staleTime: 300000,
    retry: false,
  });
  const navigate = useNavigate();
  const now = new Date();
  const [periodeType, setPeriodeType] = React.useState('mensuel'); // 'mensuel' ou 'hebdo'
  const [selectedMois, setSelectedMois] = React.useState(null);
  const [selectedSemaine, setSelectedSemaine] = React.useState(null);
  
  // Utiliser le dernier mois/semaine disponible depuis l'API
  const { data: lastAvailable } = useQuery('last-available', () => 
    api.get('/dashboard/last-available').then(r => r.data), { staleTime: 300000 });
  
  const mois = selectedMois || lastAvailable?.last_month?.mois || (now.getMonth() + 1);
  const annee = lastAvailable?.last_month?.annee || now.getFullYear();
  const lastSemaine = selectedSemaine || lastAvailable?.last_week?.semaine;
  const lastSemaineAnnee = lastAvailable?.last_week?.annee;
  
  const MOIS_NOMS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const moisDisponibles = lastAvailable?.mois_disponibles || [];
  const semainesDisponibles = lastAvailable?.semaines_disponibles || [];

  const { data: stats } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 300000 });
  const { data: dashboard } = useQuery(['dashboard-monthly', annee, mois], () =>
    api.get('/dashboard/monthly', { params: { annee, mois } }).then(r => r.data), 
    { staleTime: 300000, enabled: !!lastAvailable });
  const { data: segments } = useQuery('analytics-segments', () => api.get('/analytics/segments').then(r => r.data), { staleTime: 300000 });
  const { data: predictions } = useQuery('analytics-predictions', () => api.get('/analytics/predictions').then(r => r.data), { staleTime: 300000 });
  const { data: recovery } = useQuery('recovery-synthese', () => api.get('/alerts/recovery/synthese').then(r => r.data), { staleTime: 300000 });
  const { data: healthData } = useQuery('analytics-health', () => api.get('/analytics/health-scores').then(r => r.data), { staleTime: 300000 });
  const { data: recommandations } = useQuery('recommandations', () => api.get('/alerts/recommendations').then(r => r.data), { staleTime: 300000 });
  const { data: superviseurs } = useQuery(['superviseurs-accueil', annee, mois], () =>
    api.get('/superviseurs/stats', { params: { annee, mois } }).then(r => r.data), { staleTime: 300000 });

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  // Données pour graphique zones
  const zoneData = dashboard?.ca_by_zone
    ? Object.entries(dashboard.ca_by_zone).map(([zone, ca]) => ({ zone: zone.replace('Bamako ','Bko '), ca: Math.round(ca), fullZone: zone })).sort((a,b) => b.ca - a.ca)
    : [];

  // Données segments pour PieChart
  const segData = segments?.segments
    ? Object.entries(segments.segments).map(([name, v]) => ({ name, value: v.count, ca: v.ca_total }))
    : [];

  // Health score distribution
  const healthDist = [
    { range: '0-20', count: 0, color: '#ff4757' },
    { range: '20-40', count: 0, color: '#ff6b81' },
    { range: '40-60', count: 0, color: '#ffa502' },
    { range: '60-80', count: 0, color: '#a3cb38' },
    { range: '80-100', count: 0, color: '#00d68f' },
  ];
  (healthData?.scores || []).forEach(s => {
    const h = s.health_score;
    if (h < 20) healthDist[0].count++;
    else if (h < 40) healthDist[1].count++;
    else if (h < 60) healthDist[2].count++;
    else if (h < 80) healthDist[3].count++;
    else healthDist[4].count++;
  });

  const topSuper = Array.isArray(superviseurs) ? superviseurs.slice(0,5) : [];

  return (
    <div className="accueil-page">
      {/* ── Bienvenue ── */}
      <div className="welcome-banner">
        <div className="welcome-left">
          <div className="welcome-avatar">{user ? `${(user.nom||'?')[0]}${(user.prenom||'')[0]||''}`.toUpperCase() : '?'}</div>
          <div>
            <h1 className="welcome-title">
              {greeting()}, <span style={{ color:'var(--primary)' }}>{user?.prenom || user?.nom || 'Utilisateur'}</span> 👋
            </h1>
            <p className="welcome-sub">
              {now.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })} · Réseau Orange Mali
            </p>
            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
              <span className="badge badge-success">🟢 Système opérationnel</span>
              <span className="badge badge-warning">⚠️ {predictions?.high_risk_count || 0} PDVs en risque élevé</span>
              <span className="badge badge-info" style={{ background:'rgba(55,66,250,0.15)', color:'#3742fa' }}>
                🏅 {healthData?.average_health?.toFixed(0) || '--'}/100 Santé réseau
              </span>
            </div>
          </div>
        </div>
        <div className="welcome-quote">
          <div style={{ fontSize:28 }}>📊</div>
          <div style={{ fontSize:13, fontWeight:600 }}>Tableau de bord en temps réel</div>
          <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:4 }}>Données mises à jour automatiquement</div>
        </div>
      </div>

      {/* ── Sélecteur de période ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 8, padding: 4, gap: 4 }}>
          <button onClick={() => setPeriodeType('mensuel')} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: periodeType === 'mensuel' ? 'var(--primary)' : 'transparent', color: periodeType === 'mensuel' ? '#fff' : 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📅 Mensuel
          </button>
          <button onClick={() => setPeriodeType('hebdo')} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: periodeType === 'hebdo' ? 'var(--primary)' : 'transparent', color: periodeType === 'hebdo' ? '#fff' : 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📆 Hebdomadaire
          </button>
        </div>
        {periodeType === 'mensuel' ? (
          <select value={selectedMois || mois} onChange={e => setSelectedMois(Number(e.target.value))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
            {moisDisponibles.map(m => (
              <option key={m.mois} value={m.mois}>{MOIS_NOMS[m.mois-1]} {m.annee}</option>
            ))}
          </select>
        ) : (
          <select value={selectedSemaine || lastSemaine} onChange={e => setSelectedSemaine(Number(e.target.value))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
            {semainesDisponibles.map(s => (
              <option key={s.semaine} value={s.semaine}>Semaine {s.semaine} · {s.annee}</option>
            ))}
          </select>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {periodeType === 'mensuel' ? `📊 Données de ${MOIS_NOMS[(selectedMois||mois)-1]} ${annee}` : `📊 Données de la semaine ${selectedSemaine||lastSemaine} · ${lastSemaineAnnee}`}
        </span>
      </div>

      {/* ── KPIs principaux ── */}
      <div>
        <SectionTitle emoji="📊" title="Vue d'ensemble du Réseau" navigate={navigate} />
        <div className="kpi-grid">
          <StatCard icon={Store} value={stats?.total_pdvs || '--'} label="Total PDVs" sub={`${stats?.taux_activite || 0}% actifs`} color="var(--primary)" onClick={() => navigate('/pdvs')} badge="Réseau" />
          <StatCard icon={Activity} value={stats?.actifs || '--'} label="PDVs Actifs" sub="Ce mois" color="var(--success)" onClick={() => navigate('/pdvs')} />
          <StatCard icon={AlertTriangle} value={stats?.inactifs || '--'} label="PDVs Inactifs" sub="Requièrent attention" color="var(--danger)" onClick={() => navigate('/alerts')} />
          <StatCard icon={RefreshCw} value={stats?.en_recuperation || '--'} label="En Récupération" sub={`Taux: ${recovery?.taux_recuperation?.toFixed(0) || 0}%`} color="var(--warning)" onClick={() => navigate('/recovery')} />
          <StatCard icon={TrendingUp} value={fmtM(dashboard?.total_montant_transaction || dashboard?.total_ca || 0)} label="Montant Transaction" sub={`Dépôts + Retraits · ${['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][mois-1]} ${annee}`} color="var(--primary)" onClick={() => navigate('/dashboard')} />
          <StatCard icon={TrendingUp} value={fmtM(dashboard?.total_montant_ca || 0)} label="Montant CA" sub={`${(dashboard?.ratio_ca_transaction || 0).toFixed(1)}% du volume transaction`} color="#00d68f" onClick={() => navigate('/dashboard')} />
          <StatCard icon={Activity} value={(dashboard?.total_operations || 0).toLocaleString('fr-FR')} label="Opérations" sub="Dépôts + Retraits" color="#3742fa" onClick={() => navigate('/dashboard')} />
          <StatCard icon={TrendingUp} value={fmtM(dashboard?.total_commission_pdg || 0)} label="Commission PDG" sub="Part réseau Orange" color="#a29bfe" onClick={() => navigate('/commissions')} />
          <StatCard icon={Brain} value={healthData?.average_health?.toFixed(1) || '--'} label="Score Santé Moyen" sub="Health Score IA (/100)" color="#a29bfe" onClick={() => navigate('/ia')} badge="IA" />
          <StatCard icon={Award} value={predictions?.total_at_risk || '--'} label="PDVs à Risque IA" sub={`${predictions?.high_risk_count || 0} critiques`} color="var(--danger)" onClick={() => navigate('/ia')} badge="IA" />
        </div>
      </div>

      {/* ── CA par zone + Segments ── */}
      <div className="accueil-row">
        <div className="card flex-2">
          <SectionTitle emoji="🗺️" title="CA par Zone" link="/superviseurs" navigate={navigate} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={zoneData} margin={{ top:0, right:0, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="zone" tick={{ fontSize:11, fill:'var(--text-secondary)' }} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-secondary)' }} tickFormatter={v => `${(v/1e6).toFixed(0)}M`} />
              <Tooltip formatter={(v) => [fmtM(v), 'CA']} contentStyle={{ background:'#12121e', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }} />
              <Bar dataKey="ca" radius={[6,6,0,0]}>
                {zoneData.map((entry, i) => <Cell key={i} fill={ZONE_COLORS[entry.fullZone] || 'var(--primary)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card flex-1">
          <SectionTitle emoji="🎯" title="Segments PDV" link="/ia" navigate={navigate} />
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={segData} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={false}>
                {segData.map((entry, i) => <Cell key={i} fill={COLORS[entry.name] || SEG_COLORS[i % SEG_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v,n) => [v+' PDVs', n]} contentStyle={{ background:'#12121e', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {segData.map((s, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: COLORS[s.name] || SEG_COLORS[i % SEG_COLORS.length], flexShrink:0 }} />
                <span style={{ fontSize:11, flex:1, color:'var(--text-secondary)' }}>{s.name}</span>
                <span style={{ fontSize:11, fontWeight:700 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Health Score + Récupération ── */}
      <div className="accueil-row">
        <div className="card flex-1">
          <SectionTitle emoji="❤️" title="Distribution Health Score" link="/ia" navigate={navigate} />
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={healthDist} margin={{ top:0, right:0, bottom:0, left:0 }}>
              <XAxis dataKey="range" tick={{ fontSize:10, fill:'var(--text-secondary)' }} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-secondary)' }} />
              <Tooltip contentStyle={{ background:'#12121e', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} />
              <Bar dataKey="count" radius={[4,4,0,0]}>
                {healthDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card flex-1">
          <SectionTitle emoji="🔄" title="Programme Récupération" link="/recovery" navigate={navigate} />
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { label:'À récupérer', value: recovery?.a_recuperer || 0, color:'var(--warning)', icon:'🔍' },
              { label:'Récupérées (SIM)', value: recovery?.recuperees || 0, color:'#3742fa', icon:'💳' },
              { label:'Redéployées', value: recovery?.redeployees || 0, color:'var(--success)', icon:'✅' },
              { label:'Taux de récupération', value: `${recovery?.taux_recuperation?.toFixed(0)||0}%`, color:'var(--primary)', icon:'📈' },
            ].map((r, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid var(--border)' }}>
                <span style={{ fontSize:18 }}>{r.icon}</span>
                <span style={{ flex:1, fontSize:12, color:'var(--text-secondary)' }}>{r.label}</span>
                <span style={{ fontSize:18, fontWeight:800, color:r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card flex-1">
          <SectionTitle emoji="👥" title="Top Superviseurs" link="/superviseurs" navigate={navigate} />
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {topSuper.length === 0 && <div style={{ color:'var(--text-secondary)', fontSize:12 }}>Chargement...</div>}
            {topSuper.map((s, i) => {
              const nom = s.superviseur || s.nom || '—';
              const ca = s.ca_total_mois || s.ca || 0;
              const actifs = s.pdvs_actifs || s.actifs || 0;
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize:16, minWidth:24 }}>
                    {i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{nom}</div>
                    <div style={{ fontSize:10, color:'var(--text-secondary)' }}>{actifs} PDVs actifs</div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--primary)' }}>{fmtM(ca)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Actions prioritaires IA ── */}
      <div className="card">
        <SectionTitle emoji="🤖" title={`Actions Prioritaires IA — Semaine ${recommandations?.semaine || '--'}`} link="/ia" navigate={navigate} />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
          {(recommandations?.recommandations || []).slice(0, 6).map((r, i) => {
            const typeColor = r.type==='APPEL_URGENT'?'var(--danger)':r.type==='VISITE_TERRAIN'?'#3742fa':'var(--warning)';
            const typeIcon = r.type==='APPEL_URGENT'?'📞':r.type==='VISITE_TERRAIN'?'🚗':'⚠️';
            return (
              <div key={i} style={{ display:'flex', gap:12, padding:'12px 14px', background:'rgba(255,255,255,0.02)', borderRadius:12, border:`1px solid ${typeColor}22`, cursor: r.pdv_id ? 'pointer' : 'default' }} onClick={() => r.pdv_id && navigate(`/pdvs/${r.pdv_id}`)}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:`color-mix(in srgb, ${typeColor} 20%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>
                  {i+1}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:typeColor }}>{typeIcon} {r.type?.replace(/_/g,' ')}</span>
                    {r.priorite && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:`color-mix(in srgb, ${typeColor} 15%, transparent)`, color:typeColor }}>{r.priorite}</span>}
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.pdv_nom || r.zone || 'Réseau'}</div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.4 }}>{r.message?.slice(0,80)}{r.message?.length>80?'...':''}</div>
                </div>
              </div>
            );
          })}
          {(!recommandations?.recommandations || recommandations.recommandations.length === 0) && (
            <div style={{ gridColumn:'1/-1', textAlign:'center', color:'var(--text-secondary)', fontSize:13, padding:20 }}>
              ✅ Aucune action urgente en attente
            </div>
          )}
        </div>
        {recommandations?.count > 6 && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop:12, width:'100%', justifyContent:'center' }} onClick={() => navigate('/ia')}>
            Voir toutes les {recommandations.count} recommandations →
          </button>
        )}
      </div>

      {/* ── Liens rapides ── */}
      <div className="card">
        <h2 style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>⚡ Accès Rapides</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
          {[
            { icon:'📊', label:'Dashboard Mensuel', path:'/dashboard', color:'var(--primary)' },
            { icon:'📆', label:'Dashboard Hebdo', path:'/dashboard/weekly', color:'#3742fa' },
            { icon:'🏪', label:'Points de Vente', path:'/pdvs', color:'var(--success)' },
            { icon:'🔔', label:'Alertes', path:'/alerts', color:'var(--danger)' },
            { icon:'🧠', label:'Intelligence IA', path:'/ia', color:'#a29bfe' },
            { icon:'🔬', label:'Simulateur Et Si?', path:'/ia/whatif', color:'#fd79a8' },
            { icon:'🗺️', label:'Carte Interactive', path:'/carte', color:'#00cec9' },
            { icon:'📥', label:'Import Données', path:'/import', color:'#ffeaa7' },
          ].map((item, i) => (
            <button key={i} className="btn btn-ghost" style={{ flexDirection:'column', gap:6, padding:'14px', height:'auto', justifyContent:'center', alignItems:'center', border:`1px solid ${item.color}22`, borderRadius:12 }}
              onClick={() => navigate(item.path)}>
              <span style={{ fontSize:22 }}>{item.icon}</span>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', textAlign:'center', lineHeight:1.3 }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
