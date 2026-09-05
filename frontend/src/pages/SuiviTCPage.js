import React, { useState } from 'react';
import { useQuery } from 'react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../services/api';

const MOIS_NOMS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const IND_COLORS = { OMY:'#a29bfe', NAFAMA:'#00cec9', KAABU:'#fdcb6e', UNIFIE:'#74b9ff', AUTRE:'#64748b' };
const STATUT_ICONS = {
  JOIGNABLE_PROMESSE:'✅', JOIGNABLE_PAS_INTERESSE:'📞', JOIGNABLE_DEJA_ACTIF:'🔄',
  NON_JOIGNABLE_PAS_REPONSE:'🔕', NON_JOIGNABLE_HORS_ZONE:'📵',
  NUMERO_INCORRECT:'❌', RAPPEL_PROGRAMME:'📅', PDV_FERME:'🏪',
};
const STATUT_COLORS = {
  JOIGNABLE_PROMESSE:'#22c55e', JOIGNABLE_PAS_INTERESSE:'#64748b', JOIGNABLE_DEJA_ACTIF:'#3b82f6',
  NON_JOIGNABLE_PAS_REPONSE:'#ff4757', NON_JOIGNABLE_HORS_ZONE:'#ff4757',
  NUMERO_INCORRECT:'#ff4757', RAPPEL_PROGRAMME:'#ffa502', PDV_FERME:'#6b7280',
};

function KPICard({ icon, label, value, sub, color }) {
  return (
    <div style={{ padding:'18px 20px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderTop:`3px solid ${color}`, borderRadius:14 }}>
      <div style={{ fontSize:26, marginBottom:10 }}>{icon}</div>
      <div style={{ fontSize:28, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:13, color:'#aaa', marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function TauxBar({ taux, color }) {
  const c = color || '#22c55e';
  return (
    <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden', marginTop:4 }}>
      <div style={{ height:'100%', background:c, width:`${Math.min(100,taux||0)}%`, transition:'width 0.5s', borderRadius:3 }}/>
    </div>
  );
}

// ─── Tab 1 : Vue d'ensemble ──────────────────────────────────────────────────
function TabVueEnsemble({ dashboard }) {
  const g = dashboard?.global || {};
  const parStatut = dashboard?.par_statut || [];
  const tendance = dashboard?.tendance_7j || [];
  const parIndicateur = dashboard?.par_indicateur || {};

  const statData = parStatut.map(s => ({
    name: (STATUT_ICONS[s.statut]||'') + ' ' + (s.label||s.statut||'').slice(0,18),
    value: s.count, color: STATUT_COLORS[s.statut]||'#64748b',
  }));
  const indicData = Object.entries(parIndicateur).map(([ind, cnt]) => ({
    name: ind, value: cnt, color: IND_COLORS[ind]||'#64748b'
  }));

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        <KPICard icon="📞" label="Total Appels" value={g.total||0} sub={`${g.ce_mois||0} ce mois`} color="#3742fa"/>
        <KPICard icon="☀️" label="Aujourd'hui" value={g.aujourd_hui||0} sub={`${g.cette_semaine||0} cette semaine`} color="#ffa502"/>
        <KPICard icon="✅" label="Taux Joignabilité" value={`${g.taux_joignabilite||0}%`} sub={`${g.positifs||0} joignables`} color={g.taux_joignabilite>=50?'#22c55e':'#ff4757'}/>
        <KPICard icon="📅" label="Rappels en Attente" value={g.rappels_en_attente||0} sub="À effectuer" color="#a29bfe"/>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:16, marginBottom:24 }}>
        <div style={{ background:'rgba(55,66,250,0.04)', border:'1px solid rgba(55,66,250,0.15)', borderRadius:14, padding:'18px 20px' }}>
          <h3 style={{ fontSize:14, fontWeight:800, marginBottom:16 }}>📈 Appels — 7 derniers jours</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={tendance}>
              <defs><linearGradient id="tcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3742fa" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#3742fa" stopOpacity={0}/>
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:'#8a8a9a',fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'#8a8a9a',fontSize:10}} axisLine={false} tickLine={false} width={30}/>
              <Tooltip contentStyle={{background:'#1a1a2e',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8}}/>
              <Area type="monotone" dataKey="count" name="Appels" stroke="#3742fa" fill="url(#tcGrad)" strokeWidth={2.5} dot={{r:4,fill:'#3742fa'}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
          <h3 style={{ fontSize:13, fontWeight:800, marginBottom:16 }}>📊 Par statut</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                label={({percent}) => `${(percent*100).toFixed(0)}%`} labelLine={false}>
                {statData.map((d,i) => <Cell key={i} fill={d.color}/>)}
              </Pie>
              <Tooltip contentStyle={{background:'#1a1a2e',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
          <h3 style={{ fontSize:13, fontWeight:800, marginBottom:16 }}>🎯 Par indicateur</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {indicData.map(d => {
              const max = Math.max(...indicData.map(x => x.value), 1);
              return (
                <div key={d.name}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:d.color, fontWeight:700 }}>{d.name}</span>
                    <span style={{ color:'#fff', fontWeight:800 }}>{d.value}</span>
                  </div>
                  <TauxBar taux={d.value/max*100} color={d.color}/>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2 : Par TC ───────────────────────────────────────────────────────────
function TabParTC({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['suivi-par-tc', annee, mois],
    () => api.get('/appels-tc/suivi/par-tc', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );
  const tcs = data?.par_tc || [];

  if (isLoading) return <div style={{ textAlign:'center', padding:40, color:'#64748b' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:16 }}>
        👥 Suivi par TC — {MOIS_NOMS[mois]} {annee}
        <span style={{ fontSize:12, color:'#64748b', fontWeight:400, marginLeft:10 }}>{tcs.length} TCs actives</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
        {tcs.map(tc => {
          const taux = tc.taux_joignabilite;
          const color = taux >= 60 ? '#22c55e' : taux >= 40 ? '#ffa502' : '#ff4757';
          const prog = tc.pdvs_assignes > 0 ? Math.round(tc.pdvs_appeles_mois/tc.pdvs_assignes*100) : 0;
          return (
            <div key={tc.tc_nom} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{tc.tc_nom}</div>
                  <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>
                    Dernière activité : {tc.derniere_activite ? tc.derniere_activite.slice(0,10) : '—'}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:22, fontWeight:900, color }}>{taux}%</div>
                  <div style={{ fontSize:10, color:'#64748b' }}>joignabilité</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                {[
                  { label:'Appels', value:tc.total_appels, color:'#3742fa' },
                  { label:'Joignables', value:tc.joignables, color:'#22c55e' },
                  { label:'Promesses', value:tc.promesses, color:'#ffa502' },
                ].map(s => (
                  <div key={s.label} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:10, color:'#64748b' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#64748b', marginBottom:3 }}>
                  <span>PDVs appelés ce mois</span>
                  <span style={{ color:'#fff', fontWeight:700 }}>{tc.pdvs_appeles_mois}/{tc.pdvs_assignes}</span>
                </div>
                <TauxBar taux={prog} color="#FF6900"/>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {Object.entries(tc.par_indicateur).map(([ind, cnt]) => (
                  <span key={ind} style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:700,
                    background:`${IND_COLORS[ind]||'#64748b'}20`, color:IND_COLORS[ind]||'#64748b' }}>
                    {ind}: {cnt}
                  </span>
                ))}
              </div>
              {tc.rappels > 0 && <div style={{ marginTop:8, fontSize:11, color:'#ffa502' }}>📅 {tc.rappels} rappel(s) programmé(s)</div>}
            </div>
          );
        })}
        {tcs.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:60, color:'#64748b' }}>
            <div style={{ fontSize:48 }}>📊</div>
            <div style={{ marginTop:12 }}>Aucune activité TC ce mois</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3 : Historique Appels ────────────────────────────────────────────────
function TabHistorique({ dashboard }) {
  const [search, setSearch] = useState('');
  const [selTC, setSelTC] = useState('');
  const [selInd, setSelInd] = useState('');

  const { data: appelsData } = useQuery(
    ['suivi-tc-appels-hist', selTC],
    () => api.get('/appels-tc', { params: selTC ? { tc_user_id: selTC, limit:200 } : { limit:100 } }).then(r => r.data),
    { staleTime: 30000 }
  );
  const appels = (appelsData?.items || []).filter(a =>
    (!search || (a.nom_pdv||'').toLowerCase().includes(search.toLowerCase()) || (a.numero_pdv||'').includes(search)) &&
    (!selInd || a.indicateur === selInd)
  );

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
        <input placeholder="🔍 Rechercher PDV..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{ flex:1, padding:'8px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:13 }}/>
        <select value={selTC} onChange={e=>setSelTC(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'#1a1a2e', color:'#fff', fontSize:12 }}>
          <option value="">Toutes TCs</option>
          {(dashboard?.par_tc||[]).map(tc => <option key={tc.tc_nom} value={tc.tc_nom}>{tc.tc_nom}</option>)}
        </select>
        <select value={selInd} onChange={e=>setSelInd(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'#1a1a2e', color:'#fff', fontSize:12 }}>
          <option value="">Tous indicateurs</option>
          {['OMY','NAFAMA','KAABU','UNIFIE'].map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <span style={{ fontSize:12, color:'#64748b' }}>{appels.length} appels</span>
      </div>
      <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'rgba(255,255,255,0.04)' }}>
              {['Date','TC','PDV','Indicateur','Statut','Commentaire'].map(h => (
                <th key={h} style={{ padding:'10px 14px', fontSize:11, color:'#64748b', fontWeight:700, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {appels.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'#64748b' }}>Aucun appel trouvé</td></tr>
            ) : appels.map((a,i) => (
              <tr key={a.id} style={{ borderTop:'1px solid rgba(255,255,255,0.04)', background:i%2===0?'transparent':'rgba(255,255,255,0.01)' }}>
                <td style={{ padding:'8px 14px', fontSize:11, color:'#64748b', whiteSpace:'nowrap' }}>{a.created_at?.slice(0,16)||'—'}</td>
                <td style={{ padding:'8px 14px', fontSize:12, fontWeight:700, color:'#FF6900' }}>{a.tc_nom}</td>
                <td style={{ padding:'8px 14px' }}>
                  <div style={{ fontSize:12, color:'#fff', fontWeight:600 }}>{a.nom_pdv||a.numero_pdv}</div>
                  <div style={{ fontSize:10, color:'#64748b' }}>{a.numero_pdv}</div>
                </td>
                <td style={{ padding:'8px 14px' }}>
                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:700,
                    background:`${IND_COLORS[a.indicateur]||'#64748b'}20`, color:IND_COLORS[a.indicateur]||'#64748b' }}>
                    {a.indicateur}
                  </span>
                </td>
                <td style={{ padding:'8px 14px', fontSize:11, color:STATUT_COLORS[a.statut]||'#64748b', whiteSpace:'nowrap' }}>
                  {STATUT_ICONS[a.statut]||''} {(a.statut||'').replace(/_/g,' ')}
                </td>
                <td style={{ padding:'8px 14px', fontSize:11, color:'#8a8a9a', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {a.commentaire||'—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 4 : File unifiée Admin ───────────────────────────────────────────────
function TabFileAdmin() {
  const now = new Date();
  const defMois = now.getMonth() === 0 ? 12 : now.getMonth();
  const defAnnee = now.getMonth() === 0 ? now.getFullYear()-1 : now.getFullYear();
  const [mois, setMois] = useState(defMois);
  const [annee] = useState(defAnnee);
  const [filtreTCAdmin, setFiltreTCAdmin] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const charger = React.useCallback(async (a, m) => {
    setLoading(true);
    try {
      const resp = await api.get('/tc/liste-unifiee', { params: { annee: a||2026, mois: m||8 } });
      setData(resp.data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { charger(defAnnee, defMois); }, [charger]);

  const pdvs = (data?.pdvs||[]).filter(p => !filtreTCAdmin || p.teleconseillere === filtreTCAdmin);
  const tcs = [...new Set((data?.pdvs||[]).map(p => p.teleconseillere).filter(Boolean))].sort();
  const stats = data?.stats || {};

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>📞 File unifiée — Vue Admin</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={mois} onChange={e => { const m=parseInt(e.target.value); setMois(m); charger(annee,m); }}
            style={{ padding:'7px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'#1a1a2e', color:'#fff', fontSize:13 }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{MOIS_NOMS[m]}</option>)}
          </select>
          <select value={filtreTCAdmin} onChange={e => setFiltreTCAdmin(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', background:'#1a1a2e', color:'#fff', fontSize:13 }}>
            <option value="">Toutes TCs</option>
            {tcs.map(tc => <option key={tc} value={tc}>{tc}</option>)}
          </select>
          <button onClick={() => charger(annee, mois)} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#FF6900,#ff9500)', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>🔄</button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Total PDVs', val:stats.total_pdvs, color:'#FF6900' },
          { label:'Critiques', val:stats.critiques, color:'#ff4757' },
          { label:'Surveillance', val:stats.surveillance, color:'#ffa502' },
          { label:'En cooldown', val:stats.en_cooldown, color:'#64748b' },
        ].map(({label,val,color}) => (
          <div key={label} style={{ background:`${color}10`, border:`1px solid ${color}30`, borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
            <div style={{ fontSize:24, fontWeight:900, color }}>{val||0}</div>
            <div style={{ fontSize:11, color:'#64748b' }}>{label}</div>
          </div>
        ))}
      </div>
      {loading ? <div style={{ textAlign:'center', padding:40, color:'#64748b' }}>⏳ Chargement...</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {pdvs.slice(0,50).map((p,i) => (
            <div key={p.numero_pdv} style={{ background:'rgba(255,255,255,0.02)',
              border:'1px solid rgba(255,255,255,0.07)',
              borderLeft:`4px solid ${p.score>=60?'#ff4757':p.score>=30?'#ffa502':'#22c55e'}`,
              borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ fontSize:13, color:'#64748b', minWidth:24, fontWeight:700 }}>{i+1}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#fff', marginBottom:4 }}>
                  {p.nom} <span style={{ fontSize:11, color:'#64748b' }}>{p.numero_pdv}</span>
                </div>
                <div style={{ fontSize:11, color:'#64748b' }}>
                  📍 {p.zone} · 👤 {p.superviseur} · 🧑 TC: {p.teleconseillere||'—'}
                </div>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                  {(p.alertes||[]).map((a,j) => (
                    <span key={j} style={{ fontSize:9, padding:'1px 6px', borderRadius:6, fontWeight:700,
                      background:`${IND_COLORS[a.indicateur]||'#64748b'}15`, color:IND_COLORS[a.indicateur]||'#64748b' }}>
                      {a.indicateur} {a.type==='INACTIF'?'🔴':'🟡'}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:18, fontWeight:900, color:p.score>=60?'#ff4757':p.score>=30?'#ffa502':'#22c55e' }}>{p.score}pts</div>
                <div style={{ fontSize:10, color:'#64748b' }}>{p.nb_alertes} alerte(s)</div>
              </div>
            </div>
          ))}
          {pdvs.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'#64748b' }}>
              <div style={{ fontSize:48 }}>✅</div>
              <div>Aucun PDV à alerter pour ce filtre</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 5 : Performance mensuelle ───────────────────────────────────────────
function TabPerformance() {
  const { data, isLoading } = useQuery(
    'suivi-tc-performance',
    () => api.get('/appels-tc/suivi/performance-mensuelle', { params: { nb_mois: 6 } }).then(r => r.data),
    { staleTime: 120000 }
  );
  const historique = data?.historique || [];
  const allTCs = [...new Set(historique.flatMap(h => Object.keys(h.par_tc||{})))].sort();
  const COLORS = ['#3742fa','#FF6900','#22c55e','#ffa502','#a29bfe','#00cec9','#ff4757'];

  const chartData = historique.map(h => {
    const entry = { mois: (h.mois||'').split(' ')[0].slice(0,4) };
    allTCs.forEach(tc => { entry[tc] = h.par_tc?.[tc]?.total||0; });
    return entry;
  });

  if (isLoading) return <div style={{ textAlign:'center', padding:40, color:'#64748b' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:16 }}>📈 Performance mensuelle — 6 derniers mois</div>
      <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'20px', marginBottom:20 }}>
        <h3 style={{ fontSize:13, fontWeight:800, marginBottom:16 }}>Évolution des appels par TC</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <XAxis dataKey="mois" tick={{fill:'#8a8a9a',fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:'#8a8a9a',fontSize:10}} axisLine={false} tickLine={false} width={30}/>
            <Tooltip contentStyle={{background:'#1a1a2e',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8}}/>
            <Legend wrapperStyle={{fontSize:11,color:'#8a8a9a'}}/>
            {allTCs.slice(0,7).map((tc,i) => (
              <Bar key={tc} dataKey={tc} fill={COLORS[i%COLORS.length]} radius={[3,3,0,0]} stackId="a" name={(tc||'').split(' ')[0]}/>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'rgba(255,255,255,0.04)' }}>
              <th style={{ padding:'10px 14px', fontSize:11, color:'#64748b', fontWeight:700, textAlign:'left' }}>TC</th>
              {historique.map(h => (
                <th key={h.mois} style={{ padding:'10px 10px', fontSize:11, color:'#64748b', fontWeight:700, textAlign:'center', whiteSpace:'nowrap' }}>
                  {(h.mois||'').split(' ')[0].slice(0,4)}
                </th>
              ))}
              <th style={{ padding:'10px 14px', fontSize:11, color:'#FF6900', fontWeight:700, textAlign:'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {allTCs.map((tc,i) => {
              const total = historique.reduce((acc,h) => acc + (h.par_tc?.[tc]?.total||0), 0);
              return (
                <tr key={tc} style={{ borderTop:'1px solid rgba(255,255,255,0.04)', background:i%2===0?'transparent':'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding:'9px 14px', fontSize:12, fontWeight:700, color:'#FF6900' }}>{tc}</td>
                  {historique.map(h => {
                    const v = h.par_tc?.[tc]?.total||0;
                    const p = h.par_tc?.[tc]?.promesses||0;
                    return (
                      <td key={h.mois} style={{ padding:'9px 10px', textAlign:'center' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:v>0?'#fff':'#64748b' }}>{v}</div>
                        {p > 0 && <div style={{ fontSize:9, color:'#22c55e' }}>{p} prom.</div>}
                      </td>
                    );
                  })}
                  <td style={{ padding:'9px 14px', textAlign:'center', fontSize:16, fontWeight:900, color:'#FF6900' }}>{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page Principale ──────────────────────────────────────────────────────────
export default function SuiviTCPage() {
  const now = new Date();
  const moisP = now.getMonth() === 0 ? 12 : now.getMonth();
  const anneeP = now.getMonth() === 0 ? now.getFullYear()-1 : now.getFullYear();
  const [activeTab, setActiveTab] = useState('ensemble');

  const { data: dashboard, isLoading } = useQuery(
    'suivi-tc-dashboard',
    () => api.get('/appels-tc/dashboard-admin').then(r => r.data),
    { staleTime: 60000 }
  );

  const TABS = [
    { id:'ensemble',    icon:'📊', label:"Vue d'ensemble" },
    { id:'par-tc',      icon:'👤', label:'Par TC' },
    { id:'historique',  icon:'📋', label:'Historique appels' },
    { id:'file-admin',  icon:'📞', label:'File unifiée (Admin)' },
    { id:'performance', icon:'📈', label:'Performance' },
  ];

  if (isLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:16 }}>
      <div className="loading-spinner"/>
      <p style={{ color:'#8a8a9a' }}>Chargement du tableau de bord TC...</p>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h1 className="page-title">📞 Suivi Téléconseillères</h1>
          <p style={{ color:'#8a8a9a', fontSize:13, marginTop:4 }}>
            Gestion et suivi des appels TC — {dashboard?.global?.total||0} appels enregistrés
          </p>
        </div>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:24, flexWrap:'wrap', background:'rgba(255,255,255,0.02)', borderRadius:12, padding:6 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:9, border:'none',
              background: activeTab===tab.id ? 'linear-gradient(135deg,#FF6900,#ff9500)' : 'transparent',
              color: activeTab===tab.id ? '#fff' : '#64748b', fontWeight: activeTab===tab.id ? 800 : 500,
              fontSize:13, cursor:'pointer', transition:'all 0.2s' }}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'ensemble'    && <TabVueEnsemble dashboard={dashboard}/>}
      {activeTab === 'par-tc'      && <TabParTC annee={anneeP} mois={moisP}/>}
      {activeTab === 'historique'  && <TabHistorique dashboard={dashboard}/>}
      {activeTab === 'file-admin'  && <TabFileAdmin/>}
      {activeTab === 'performance' && <TabPerformance/>}
    </div>
  );
}
