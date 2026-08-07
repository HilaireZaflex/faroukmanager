/**
 * KaabuDashboardPage — Dashboard Hebdomadaire KAABU Mobile
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import AppelTCModal from '../components/common/AppelTCModal';

const COLOR = '#FF6900';
const COLORS = ['#FF6900','#3742fa','#22c55e','#ffa502','#a29bfe','#00d68f','#ff4757','#fd79a8','#0ea5e9'];

function fmtN(v) { return v ? new Intl.NumberFormat('fr-FR').format(Math.round(v)) : '—'; }
function fmtPct(v) { return v != null ? `${Math.round(v * 100)}%` : '—'; }
function fmtVol(v) { return v ? new Intl.NumberFormat('fr-FR').format(v) : '—'; }

function TauxBadge({ taux }) {
  const t = taux != null ? Math.round(taux * 100) : null;
  if (t === null) return <span style={{ color: '#64748b' }}>—</span>;
  const color = t >= 90 ? '#22c55e' : t >= 75 ? '#ffa502' : '#ff4757';
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      background: `rgba(${t>=90?'34,197,94':t>=75?'255,165,2':'255,71,87'},0.12)`, color }}>
      {t >= 90 ? '✅' : t >= 75 ? '⚠️' : '🔴'} {t}%
    </span>
  );
}

function KaabuTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#aaa', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color || COLOR, fontWeight: 700 }}>{p.name}: {fmtN(p.value)}</p>)}
    </div>
  );
}

function EmptyKaabu({ msg }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: '#8a8a9a' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <p style={{ fontSize: 15, fontWeight: 600 }}>{msg || 'Aucune donnée disponible.'}</p>
    </div>
  );
}

// ─── Tableau classement générique ─────────────────────────────────────────────
function ClassementKaabu({ endpoint, colNom, nomLabel, semaine, annee }) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('montant');
  const [sortDir, setSortDir] = useState('desc');

  const { data: rawData, isLoading } = useQuery(
    [endpoint, semaine, annee],
    () => api.get(`${endpoint}?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 300000 }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  const data = Array.isArray(rawData) ? rawData : [];
  if (!data.length) return <EmptyKaabu msg="Aucune donnée pour cette semaine." />;

  const filtered = data.filter(d => !search || (d[colNom] || '').toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortCol] ?? 0; const vb = b[sortCol] ?? 0;
    if (typeof va === 'string') return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const thS = (col, lbl, color = '#8a8a9a', align = 'right') => (
    <th onClick={() => { if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortCol(col); setSortDir('desc'); } }}
      style={{ padding: '10px 12px', textAlign: align, color: sortCol === col ? COLOR : color, cursor: 'pointer', userSelect: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {lbl} {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </th>
  );

  const totalMontant = sorted.reduce((s, d) => s + (d.montant || 0), 0) || 1;

  return (
    <div>
      <div style={{ marginBottom: 14, position: 'relative', maxWidth: 320 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a8a9a' }}>🔍</span>
        <input type="text" placeholder={`Rechercher ${nomLabel}...`} value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(0,0,0,0.25)', border: `1px solid rgba(255,105,0,0.2)`, borderRadius: 8, color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
      </div>

      {/* BarChart rapide */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>📊 Volume KAABU par {nomLabel}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={sorted.slice(0, 10).map(d => ({ name: (d[colNom] || '—').split(' ')[0], volume: d.volume || 0, taux: Math.round((d.taux || 0) * 100) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} width={40} />
            <Tooltip content={<KaabuTooltip />} />
            <Bar dataKey="volume" name="Volume" fill={COLOR} radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Classement {nomLabel}s — {semaine} · {annee}</span>
          <span style={{ fontSize: 12, color: COLOR }}>{sorted.length} résultats</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Rang</th>
                {thS(colNom, nomLabel, '#8a8a9a', 'left')}
                {thS('total_pdv', 'Total PDVs')}
                {thS('actifs', 'Actifs', '#22c55e')}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Taux</th>
                {thS('volume', 'Volume KAABU', COLOR)}
                {thS('montant', 'CA (FCFA)', '#ffa502')}
                {thS('part_vente', 'Part %', '#8a8a9a')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i < 3 ? `rgba(255,105,0,${0.04-i*0.012})` : 'transparent' }}>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 16 }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span style={{ color: '#666', fontSize: 12 }}>{i+1}</span>}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#fff' }}>{d[colNom] || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#aaa' }}>{fmtVol(d.total_pdv)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtVol(d.actifs)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}><TauxBadge taux={d.taux} /></td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: COLOR }}>{fmtVol(d.volume)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ffa502' }}>{fmtN(d.montant)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{fmtPct(d.part_vente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Vue d'ensemble ───────────────────────────────────────────────────────────
function TabOverview({ annee, semaine }) {
  const { data, isLoading } = useQuery(
    ['kaabu-overview', annee, semaine],
    () => api.get(`/kaabu/vue-ensemble?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 300000 }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.total_pdv) return <EmptyKaabu msg="Aucune donnée pour cette semaine." />;
  const ev = data.evolution_volume || 0;
  const ea = data.evolution_montant || 0;
  const kpis = [
    { icon: '🏪', label: 'Total PDVs', value: fmtVol(data.total_pdv), color: '#3742fa' },
    { icon: '✅', label: 'PDVs Actifs', value: fmtVol(data.actifs), color: '#22c55e', sub: `${fmtVol(data.inactifs)} inactifs` },
    { icon: '📊', label: "Taux d'Activité", value: fmtPct(data.taux_activite), color: data.taux_activite >= 0.9 ? '#22c55e' : data.taux_activite >= 0.75 ? '#ffa502' : '#ff4757' },
    { icon: '🔄', label: 'Volume KAABU', value: fmtVol(data.volume_kaabu), color: COLOR, sub: `${ev >= 0 ? '▲' : '▼'} ${Math.abs(ev)}% vs préc.` },
    { icon: '💰', label: 'CA Global', value: fmtN(data.montant_global) + ' F', color: '#ffa502', sub: `${ea >= 0 ? '▲' : '▼'} ${Math.abs(ea)}% vs préc.` },
    { icon: '📥', label: 'Volume Cash-in', value: fmtVol(data.volume_cashin), color: '#00d68f', sub: fmtN(data.montant_cashin) + ' F' },
    { icon: '📤', label: 'Volume Cash-out', value: fmtVol(data.volume_cashout), color: '#a29bfe', sub: fmtN(data.montant_cashout) + ' F' },
    { icon: '📈', label: 'Évol. Actifs', value: `${data.evolution_actifs >= 0 ? '+' : ''}${data.evolution_actifs}`, color: data.evolution_actifs >= 0 ? '#22c55e' : '#ff4757', sub: 'vs semaine préc.' },
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderTop: `3px solid ${k.color}`, borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 4 }}>{k.label}</div>
            {k.sub && <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>{k.sub}</div>}
          </div>
        ))}
      </div>
      {data.par_segment?.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>🏆 Répartition par Segment</h3>
          {data.par_segment.map((s, i) => {
            const max = Math.max(...data.par_segment.map(x => x.volume));
            const pct = Math.round((s.volume / max) * 100);
            const color = COLORS[i % COLORS.length];
            return (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}25`, borderLeft: `4px solid ${color}`, borderRadius: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{s.segment}</span>
                    <TauxBadge taux={s.taux} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span style={{ color: '#aaa' }}>{fmtVol(s.total)} PDVs · {fmtVol(s.actifs)} actifs</span>
                    <span style={{ color, fontWeight: 700 }}>Vol: {fmtVol(s.volume)}</span>
                    <span style={{ color: '#ffa502' }}>{fmtN(s.montant)} F</span>
                  </div>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.6s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Évolution ────────────────────────────────────────────────────────────────
function TabEvolution({ annee }) {
  const { data, isLoading } = useQuery(['kaabu-evolution', annee], () => api.get(`/kaabu/evolution?annee=${annee}`).then(r => r.data), { staleTime: 300000 });
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.length) return <EmptyKaabu />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'linear-gradient(135deg,rgba(255,105,0,0.06),rgba(0,0,0,0))', border: '1px solid rgba(255,105,0,0.15)', borderRadius: 14, padding: '18px 20px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>🔄 Volume KAABU par Semaine — {annee}</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs><linearGradient id="kGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLOR} stopOpacity={0.25}/><stop offset="95%" stopColor={COLOR} stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <XAxis dataKey="label" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fill: '#8a8a9a', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} width={45}/>
            <Tooltip content={<KaabuTooltip/>}/>
            <Area type="monotone" dataKey="volume" name="Volume" stroke={COLOR} fill="url(#kGrad)" strokeWidth={2.5} dot={{ r:3, fill:COLOR, stroke:'#0a0a1a', strokeWidth:2 }}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>📊 Taux d'Activité</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="label" tick={{ fill:'#8a8a9a', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'#8a8a9a', fontSize:9 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v*100)}%`} domain={[0.5,1]} width={40}/>
              <Tooltip formatter={v => [`${Math.round(v*100)}%`, 'Taux']}/>
              <Line type="monotone" dataKey="taux" stroke="#22c55e" strokeWidth={2.5} dot={{ r:3 }}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>🏪 PDVs Actifs / Total</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
              <XAxis dataKey="label" tick={{ fill:'#8a8a9a', fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:'#8a8a9a', fontSize:9 }} axisLine={false} tickLine={false} width={35}/>
              <Tooltip content={<KaabuTooltip/>}/>
              <Bar dataKey="total_pdv" name="Total" fill="rgba(255,255,255,0.1)" radius={[4,4,0,0]}/>
              <Bar dataKey="actifs" name="Actifs" fill="#22c55e" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Inactifs ─────────────────────────────────────────────────────────────────
function TabInactifs({ annee, semaine, teleFilter }) {
  const [search, setSearch] = useState('');
  const [appelPDV, setAppelPDV] = useState(null);
  const { data, isLoading } = useQuery(['kaabu-inactifs', annee, semaine, teleFilter],
    () => api.get(`/kaabu/inactifs?annee=${annee}&semaine=${semaine}${teleFilter?`&teleconseillere=${teleFilter}`:''}`).then(r => r.data),
    { staleTime: 300000 }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  const pdvs = data?.pdvs || [];
  const filtered = pdvs.filter(p => !search || (p.numero_pdv||'').includes(search) || (p.superviseur||'').toLowerCase().includes(search.toLowerCase()) || (p.localite||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[{icon:'😴',label:'PDVs Inactifs',value:pdvs.length,color:'#ff4757'},{icon:'📅',label:'Réf. semaine',value:data?.semaine_precedente||'—',color:'#ffa502'},{icon:'🔄',label:'Actifs sem. préc.',value:pdvs.filter(p=>p.etait_actif_avant).length,color:'#a29bfe'}].map((k,i)=>(
          <div key={i} style={{ padding:'14px',background:'rgba(255,71,87,0.05)',border:`1px solid rgba(255,71,87,0.15)`,borderLeft:`4px solid ${k.color}`,borderRadius:12,textAlign:'center' }}>
            <div style={{ fontSize:22,marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:22,fontWeight:900,color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11,color:'#8a8a9a',marginTop:3 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom:14,position:'relative',maxWidth:320 }}>
        <span style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#8a8a9a' }}>🔍</span>
        <input type="text" placeholder="PDV, superviseur, localité..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{ width:'100%',padding:'9px 12px 9px 34px',background:'rgba(0,0,0,0.25)',border:'1px solid rgba(255,71,87,0.2)',borderRadius:8,color:'#fff',fontSize:13,boxSizing:'border-box' }}/>
      </div>
      {!filtered.length ? <EmptyKaabu msg="✅ Aucun PDV inactif cette semaine !" /> : (
        <div style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,overflow:'hidden' }}>
          <div style={{ padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between' }}>
            <span style={{ fontSize:13,fontWeight:700 }}>😴 PDVs Inactifs KAABU — {semaine} · {annee}</span>
            <span style={{ fontSize:12,color:'#ff4757' }}>{filtered.length} PDVs</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                  {['PDV','Superviseur','Gestionnaire','TC','Localité','Segment','Vol. préc.','📞'].map(h=>(
                    <th key={h} style={{ padding:'10px 12px',textAlign:'left',color:'#8a8a9a',fontWeight:600,whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',background:p.etait_actif_avant?'rgba(255,71,87,0.03)':'transparent' }}>
                    <td style={{ padding:'9px 12px',fontWeight:700,color:'#fff' }}>{p.numero_pdv}</td>
                    <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.superviseur||'—'}</td>
                    <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.groupe||'—'}</td>
                    <td style={{ padding:'9px 12px',color:'#a29bfe' }}>{p.teleconseillere||'—'}</td>
                    <td style={{ padding:'9px 12px',color:'#8a8a9a' }}>{p.localite||'—'}</td>
                    <td style={{ padding:'9px 12px' }}>
                      {p.segment&&<span style={{ fontSize:11,padding:'2px 7px',borderRadius:5,background:'rgba(255,105,0,0.1)',color:COLOR }}>{p.segment}</span>}
                    </td>
                    <td style={{ padding:'9px 12px',textAlign:'right',color:'#ffa502' }}>{fmtVol(p.volume_precedent)}</td>
                    <td style={{ padding:'9px 12px',textAlign:'center' }}>
                      <button onClick={()=>setAppelPDV({...p,nom:p.login||p.numero_pdv})}
                        style={{ background:'rgba(0,214,143,0.1)',border:'1px solid rgba(0,214,143,0.3)',borderRadius:6,color:'#00d68f',padding:'4px 8px',cursor:'pointer',fontSize:13 }}>📞</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {appelPDV&&<AppelTCModal pdv={appelPDV} indicateur="KAABU" onClose={()=>setAppelPDV(null)} onSaved={()=>setAppelPDV(null)}/>}
    </div>
  );
}

// ─── En Baisse ────────────────────────────────────────────────────────────────
function TabEnBaisse({ annee, semaine, teleFilter }) {
  const [seuil, setSeuil] = useState(20);
  const [activeFilter, setActiveFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [appelPDV, setAppelPDV] = useState(null);

  const { data, isLoading } = useQuery(['kaabu-baisse', annee, semaine, seuil, teleFilter],
    () => api.get(`/kaabu/en-baisse?annee=${annee}&semaine=${semaine}&seuil=${-seuil}${teleFilter?`&teleconseillere=${teleFilter}`:''}`).then(r => r.data),
    { staleTime: 300000 }
  );
  const pdvs = data?.pdvs || [];
  const displayed = pdvs
    .filter(p => activeFilter==='critique'?Math.abs(p.variation_pct)>40:activeFilter==='haute'?Math.abs(p.variation_pct)>20&&Math.abs(p.variation_pct)<=40:activeFilter==='normale'?Math.abs(p.variation_pct)<=20:true)
    .filter(p => !search||(p.numero_pdv||'').includes(search)||(p.superviseur||'').toLowerCase().includes(search.toLowerCase()));

  const kpis = [
    {label:`Total (≥${seuil}%)`,value:data?.total||0,color:'#ff4757',filter:null},
    {label:'🔴 Critique (>40%)',value:data?.nb_critique||0,color:'#ff4757',filter:'critique'},
    {label:'🟠 Haute (20-40%)',value:data?.nb_haute||0,color:'#ffa502',filter:'haute'},
    {label:'⚪ Normale (≤20%)',value:data?.nb_normale||0,color:'#8a8a9a',filter:'normale'},
  ];

  return (
    <div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16 }}>
        {kpis.map((k,i)=>(
          <div key={i} onClick={()=>setActiveFilter(f=>f===k.filter?null:k.filter)}
            style={{ padding:'14px 16px',background:activeFilter===k.filter?`rgba(${k.color==='#ff4757'?'255,71,87':k.color==='#ffa502'?'255,165,2':'138,138,154'},0.12)`:'rgba(0,0,0,0.25)',
              border:`2px solid ${activeFilter===k.filter?k.color:'rgba(255,255,255,0.07)'}`,borderLeft:`4px solid ${k.color}`,borderRadius:12,cursor:'pointer',transition:'all 0.2s',textAlign:'center' }}>
            <div style={{ fontSize:22,fontWeight:900,color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11,color:'#8a8a9a',marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background:'rgba(0,0,0,0.25)',border:'1px solid rgba(255,71,87,0.2)',borderRadius:12,padding:'12px 18px',marginBottom:14 }}>
        <div style={{ display:'flex',alignItems:'center',gap:16 }}>
          <span style={{ fontSize:12,color:'#8a8a9a',fontWeight:600,whiteSpace:'nowrap' }}>Seuil : <span style={{ color:'#ff4757',fontWeight:800 }}>{seuil}%</span></span>
          <input type="range" min="5" max="50" step="5" value={seuil} onChange={e=>setSeuil(parseInt(e.target.value))} style={{ flex:1,accentColor:'#ff4757' }}/>
          <div style={{ display:'flex',gap:6 }}>
            {[10,20,30,40].map(v=><button key={v} onClick={()=>setSeuil(v)} style={{ padding:'3px 8px',fontSize:11,borderRadius:6,border:`1px solid ${seuil===v?'#ff4757':'rgba(255,255,255,0.1)'}`,background:seuil===v?'rgba(255,71,87,0.15)':'transparent',color:seuil===v?'#ff4757':'#888',cursor:'pointer' }}>{v}%</button>)}
          </div>
        </div>
      </div>
      {isLoading ? <div className="loading-spinner" style={{ margin:'40px auto' }}/> :
       !displayed.length ? <EmptyKaabu msg={`✅ Aucun PDV en baisse de plus de ${seuil}% cette semaine`}/> : (
        <div style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,overflow:'hidden' }}>
          <div style={{ padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',gap:10,alignItems:'center' }}>
            <span style={{ fontSize:13,fontWeight:700 }}>📉 PDVs En Baisse KAABU — {semaine}</span>
            <span style={{ fontSize:12,color:'#ff4757' }}>{displayed.length} PDVs</span>
            <div style={{ flex:1 }}/>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'#8a8a9a',fontSize:12 }}>🔍</span>
              <input type="text" placeholder="PDV, superviseur..." value={search} onChange={e=>setSearch(e.target.value)}
                style={{ padding:'6px 10px 6px 26px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:'#fff',fontSize:12 }}/>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                  {['PDV','Superviseur','Gestionnaire','TC','Vol. actuel','Vol. préc.','Baisse','Alerte','📞'].map(h=>(
                    <th key={h} style={{ padding:'10px 12px',textAlign:'left',color:'#8a8a9a',fontWeight:600,whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((p,i)=>{
                  const abs=Math.abs(p.variation_pct);
                  const alertColor=abs>40?'#ff4757':abs>20?'#ffa502':'#8a8a9a';
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',background:abs>40?'rgba(255,71,87,0.03)':'transparent' }}>
                      <td style={{ padding:'9px 12px',fontWeight:700 }}>{p.numero_pdv}</td>
                      <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.superviseur||'—'}</td>
                      <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.groupe||'—'}</td>
                      <td style={{ padding:'9px 12px',color:'#a29bfe' }}>{p.teleconseillere||'—'}</td>
                      <td style={{ padding:'9px 12px',textAlign:'right',fontWeight:700,color:COLOR }}>{fmtVol(p.volume_actuel)}</td>
                      <td style={{ padding:'9px 12px',textAlign:'right',color:'#ffa502' }}>{fmtVol(p.volume_precedent)}</td>
                      <td style={{ padding:'9px 12px',textAlign:'center',fontWeight:800,color:'#ff4757' }}>▼ {abs}%</td>
                      <td style={{ padding:'9px 12px' }}>
                        <span style={{ fontSize:11,fontWeight:600,padding:'2px 7px',borderRadius:5,background:`rgba(${abs>40?'255,71,87':abs>20?'255,165,2':'138,138,154'},0.12)`,color:alertColor }}>{p.alerte}</span>
                      </td>
                      <td style={{ padding:'9px 12px',textAlign:'center' }}>
                        <button onClick={()=>setAppelPDV({...p,nom:p.login||p.numero_pdv})}
                          style={{ background:'rgba(0,214,143,0.1)',border:'1px solid rgba(0,214,143,0.3)',borderRadius:6,color:'#00d68f',padding:'3px 7px',cursor:'pointer',fontSize:13 }}>📞</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {appelPDV&&<AppelTCModal pdv={appelPDV} indicateur="KAABU" onClose={()=>setAppelPDV(null)} onSaved={()=>setAppelPDV(null)}/>}
    </div>
  );
}

// ─── Hors Zone ────────────────────────────────────────────────────────────────
function TabHorsZone({ annee, semaine }) {
  const { data, isLoading } = useQuery(['kaabu-hors-zone', annee, semaine],
    () => api.get(`/kaabu/hors-zone?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 300000 }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin:'60px auto' }}/>;
  if (!data?.total_pdv) return <EmptyKaabu msg="Aucun PDV hors zone cette semaine."/>;
  return (
    <div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20 }}>
        {[{icon:'🗺️',label:'Total Hors Zone',value:data.total_pdv,color:'#ffa502'},{icon:'✅',label:'Actifs',value:data.actifs,color:'#22c55e'},{icon:'🔄',label:'Volume Total',value:fmtVol(data.volume),color:COLOR}].map((k,i)=>(
          <div key={i} style={{ padding:'14px',background:'rgba(255,165,2,0.05)',border:'1px solid rgba(255,165,2,0.15)',borderLeft:`4px solid ${k.color}`,borderRadius:12,textAlign:'center' }}>
            <div style={{ fontSize:22,marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:22,fontWeight:900,color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11,color:'#8a8a9a',marginTop:3 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {data.par_agent?.map((agent,i)=>(
        <div key={i} style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,165,2,0.2)',borderRadius:14,padding:'16px 20px',marginBottom:12 }}>
          <div style={{ display:'flex',justifyContent:'space-between',marginBottom:12 }}>
            <div>
              <div style={{ fontSize:14,fontWeight:800,color:'#ffa502' }}>🗺️ {agent.agent}</div>
              <div style={{ fontSize:12,color:'#8a8a9a',marginTop:2 }}>{agent.total_pdv} PDVs · {agent.actifs} actifs · <TauxBadge taux={agent.taux}/></div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:16,fontWeight:800,color:COLOR }}>{fmtVol(agent.volume)}</div>
              <div style={{ fontSize:11,color:'#8a8a9a' }}>Volume KAABU</div>
            </div>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
            {agent.pdvs?.slice(0,5).map((p,j)=>(
              <div key={j} style={{ display:'flex',gap:10,padding:'6px 10px',background:'rgba(255,255,255,0.02)',borderRadius:7,fontSize:11,color:'#aaa' }}>
                <span style={{ fontWeight:700,color:p.est_actif?'#22c55e':'#ff4757' }}>{p.est_actif?'●':'○'}</span>
                <span style={{ fontWeight:600,color:'#fff' }}>{p.numero_pdv}</span>
                <span>{p.localite}</span>
                <span style={{ color:COLOR,marginLeft:'auto' }}>Vol: {fmtVol(p.volume)}</span>
              </div>
            ))}
            {agent.pdvs?.length>5&&<div style={{ fontSize:11,color:'#64748b',textAlign:'center',padding:'4px' }}>+{agent.pdvs.length-5} autres</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({ onClose, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = React.useRef();
  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Sélectionnez le fichier Excel KAABU');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/kaabu/import', fd, { headers:{'Content-Type':'multipart/form-data'}, timeout:120000 });
      setResult(res.data);
      onSuccess?.();
    } catch(e) { alert('Erreur: '+(e.response?.data?.detail||e.message)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'linear-gradient(135deg,#0f0f1e,#1a1a2e)',border:'1px solid rgba(255,105,0,0.3)',borderRadius:16,padding:'28px 32px',width:'90%',maxWidth:460 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:800,color:'#fff' }}>📂 Import KAABU Excel</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#8a8a9a',fontSize:20,cursor:'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize:12,color:'#64748b',marginBottom:16 }}>
          Importez le fichier <strong style={{ color:COLOR }}>DASHBOARD SUIVI KAABU HEBDOMADAIRE.xlsx</strong>.<br/>
          La feuille <strong style={{ color:'#fff' }}>SOURCE</strong> sera utilisée. L'import efface les données des semaines concernées avant de réimporter.
        </p>
        {result&&<div style={{ background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:10,padding:'12px 16px',marginBottom:16,fontSize:13 }}>
          ✅ <strong style={{ color:'#22c55e' }}>{result.inserted} lignes importées</strong> · {result.pdvs_uniques} PDVs · Semaines: {result.semaines?.slice(0,5).join(', ')}{result.semaines?.length>5?'...':''}
        </div>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls"
          style={{ fontSize:13,color:'#fff',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 12px',width:'100%',boxSizing:'border-box',marginBottom:16 }}/>
        <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'9px 20px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#8a8a9a',cursor:'pointer' }}>Annuler</button>
          <button onClick={handleImport} disabled={busy}
            style={{ padding:'9px 24px',borderRadius:8,border:'none',background:busy?'rgba(255,105,0,0.3)':'linear-gradient(135deg,#FF6900,#ff9500)',color:'#fff',fontWeight:700,cursor:'pointer' }}>
            {busy?'⏳ Import...':'📂 Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Zone Tab : affiche par Zone + Gestionnaire + Sous-Zone ───────────────────
function ZoneTab({ endpoint, semaine, annee }) {
  const [activeZone, setActiveZone] = useState(null);
  const [sortCol, setSortCol] = useState('montant');
  const [sortDir, setSortDir] = useState('desc');

  const { data: rawData, isLoading } = useQuery(
    [endpoint, semaine, annee],
    () => api.get(`${endpoint}?annee=${annee}&semaine=${semaine}`).then(r => r.data),
    { staleTime: 300000 }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  const data = Array.isArray(rawData) ? rawData : [];
  if (!data.length) return <EmptyKaabu msg="Aucune donnée de zone pour cette semaine." />;

  const thS = (col, lbl, color = '#8a8a9a', align = 'right') => (
    <th onClick={() => { if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortCol(col); setSortDir('desc'); } }}
      style={{ padding: '10px 12px', textAlign: align, color: sortCol === col ? COLOR : color, cursor: 'pointer', userSelect: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {lbl} {sortCol === col ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </th>
  );

  const sorted = [...data].sort((a, b) => {
    const va = a[sortCol] ?? 0; const vb = b[sortCol] ?? 0;
    if (typeof va === 'string') return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const totalMontant = sorted.reduce((s, d) => s + (d.montant || 0), 0) || 1;
  const ZONE_COLORS = { 'ZONE A': '#FF6900', 'ZONE B': '#3742fa', 'ZONE C': '#22c55e', 'ZONE D': '#ffa502', 'ZONE E': '#a29bfe', 'AU BUREAU': '#8a8a9a' };

  return (
    <div>
      {/* Barres par zone */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {sorted.map((z, i) => {
          const zoneColor = ZONE_COLORS[z.groupe] || COLORS[i % COLORS.length];
          const pct = Math.round((z.montant || 0) / totalMontant * 100);
          const isActive = activeZone === z.groupe;
          return (
            <div key={i} onClick={() => setActiveZone(isActive ? null : z.groupe)}
              style={{ padding: '14px 18px', background: isActive ? `rgba(255,105,0,0.08)` : 'rgba(255,255,255,0.02)',
                border: `2px solid ${isActive ? zoneColor : `${zoneColor}30`}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: zoneColor, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: 14, color: '#fff', flex: 1 }}>{z.groupe || '—'}</span>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#22c55e' }}>✅ {fmtVol(z.actifs)} actifs / {fmtVol(z.total_pdv)}</span>
                  <TauxBadge taux={z.taux} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: zoneColor }}>{fmtVol(z.volume)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ffa502' }}>{fmtN(z.montant)} F</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{pct}% du CA</span>
                </div>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${zoneColor},${zoneColor}99)`, borderRadius: 4, transition: 'width 0.6s' }} />
              </div>
              {isActive && <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>▼ Cliquer pour fermer · Semaines {semaine} · {annee}</div>}
            </div>
          );
        })}
      </div>

      {/* Tableau détail */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            📍 {activeZone ? `Zone : ${activeZone}` : 'Toutes les Zones'} — {semaine} · {annee}
          </span>
          <span style={{ fontSize: 12, color: COLOR }}>{sorted.length} zones</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>#</th>
                {thS('groupe', 'Zone', '#8a8a9a', 'left')}
                {thS('total_pdv', 'Total PDVs')}
                {thS('actifs', 'Actifs', '#22c55e')}
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Taux</th>
                {thS('volume', 'Volume KAABU', COLOR)}
                {thS('montant', 'CA (FCFA)', '#ffa502')}
                {thS('part_vente', 'Part %', '#8a8a9a')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const zoneColor = ZONE_COLORS[d.groupe] || COLORS[i % COLORS.length];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: activeZone === d.groupe ? `${zoneColor}08` : 'transparent', cursor: 'pointer' }}
                    onClick={() => setActiveZone(activeZone === d.groupe ? null : d.groupe)}>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: zoneColor, margin: '0 auto' }} />
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: zoneColor }}>{d.groupe || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#aaa' }}>{fmtVol(d.total_pdv)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtVol(d.actifs)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><TauxBadge taux={d.taux} /></td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: COLOR }}>{fmtVol(d.volume)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ffa502' }}>{fmtN(d.montant)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{fmtPct(d.part_vente)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function KaabuDashboardPage() {
  const [activeTab, setActiveTab] = useState(null);
  const [semaine, setSemaine] = useState('');
  const [annee, setAnnee] = useState(2026);
  const [showImport, setShowImport] = useState(false);

  const user = useAuthStore(s => s.user);
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const isTelec = role === 'teleconseillere';
  const teleNom = isTelec ? (user?.nom || '').trim() : null;

  const { data: periods, refetch: refetchPeriods } = useQuery('kaabu-periods',
    () => api.get('/kaabu/periods').then(r => r.data), { staleTime: 60000 }
  );

  useEffect(() => {
    if (periods?.semaines?.length) {
      const last = periods.semaines[periods.semaines.length - 1];
      setSemaine(last.semaine);
      setAnnee(last.annee);
      if (!activeTab) setActiveTab(isTelec ? 'inactifs' : 'overview');
    }
  }, [periods]);

  const semDispo = periods?.semaines || [];
  const idx = semDispo.findIndex(s => s.semaine === semaine && s.annee === annee);
  const canPrev = idx > 0;
  const canNext = idx < semDispo.length - 1;

  const allTabs = [
    { id: 'overview',      label: "🏠 Vue d'ensemble",    show: true },
    { id: 'superviseurs',  label: '👔 Superviseurs',       show: true },
    { id: 'gestionnaires', label: '📍 Par Zone',             show: true },
    { id: 'coaches',       label: '🎯 Coaches',            show: !isTelec },
    { id: 'telecons',      label: '📞 Téléconseillères',   show: !isTelec },
    { id: 'developpeurs',  label: '👷 Développeurs',       show: !isTelec },
    { id: 'hors_zone',     label: '🗺️ Hors Zone',         show: !isTelec },
    { id: 'inactifs',      label: '😴 Inactifs',           show: true },
    { id: 'en_baisse',     label: '📉 En Baisse',          show: true },
    { id: 'evolution',     label: '📈 Évolution',          show: !isTelec },
  ].filter(t => t.show);

  if (!semDispo.length && !periods) return (
    <div className="page">
      <div style={{ textAlign:'center',padding:'80px 20px' }}>
        <div style={{ fontSize:64,marginBottom:20 }}>🟠</div>
        <h2 style={{ color:'#fff',marginBottom:12 }}>Module KAABU Mobile</h2>
        <p style={{ color:'#8a8a9a',marginBottom:24 }}>Aucune donnée. Importez le fichier Excel KAABU pour commencer.</p>
        <button onClick={()=>setShowImport(true)}
          style={{ padding:'12px 28px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#FF6900,#ff9500)',color:'#fff',fontWeight:700,fontSize:15,cursor:'pointer' }}>
          📂 Importer le fichier KAABU
        </button>
        {showImport&&<ImportModal onClose={()=>setShowImport(false)} onSuccess={()=>{setShowImport(false);refetchPeriods();}}/>}
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h1 className="page-title">🟠 KAABU Mobile — Dashboard Hebdomadaire</h1>
          <p style={{ color:'#8a8a9a',fontSize:13,marginTop:4 }}>{semDispo.length} semaines · {periods?.total||0} importées · S01→S{semDispo[semDispo.length-1]?.semaine?.replace('S','')}</p>
        </div>
        <div style={{ display:'flex',gap:10,alignItems:'center' }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.05)',borderRadius:10,padding:'6px 14px' }}>
            <button onClick={()=>{if(canPrev){const s=semDispo[idx-1];setSemaine(s.semaine);setAnnee(s.annee);}}} disabled={!canPrev}
              style={{ background:'none',border:'none',color:canPrev?COLOR:'#444',cursor:canPrev?'pointer':'not-allowed',fontSize:18 }}>‹</button>
            <span style={{ fontWeight:700,fontSize:15,color:'#fff',minWidth:120,textAlign:'center' }}>{semaine} · {annee}</span>
            <button onClick={()=>{if(canNext){const s=semDispo[idx+1];setSemaine(s.semaine);setAnnee(s.annee);}}} disabled={!canNext}
              style={{ background:'none',border:'none',color:canNext?COLOR:'#444',cursor:canNext?'pointer':'not-allowed',fontSize:18 }}>›</button>
          </div>
          {!isTelec&&<button onClick={()=>setShowImport(true)}
            style={{ padding:'8px 16px',borderRadius:8,border:`1px solid rgba(255,105,0,0.4)`,background:'rgba(255,105,0,0.1)',color:COLOR,fontWeight:700,fontSize:13,cursor:'pointer' }}>
            📂 Import
          </button>}
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display:'flex',gap:4,flexWrap:'wrap',marginBottom:24,background:'rgba(255,255,255,0.03)',borderRadius:12,padding:5 }}>
        {allTabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{ padding:'8px 14px',borderRadius:9,border:'none',cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap',transition:'all 0.2s',
              background:activeTab===t.id?'linear-gradient(135deg,#FF6900,#ff9500)':'transparent',
              color:activeTab===t.id?'#fff':'#8a8a9a',
              boxShadow:activeTab===t.id?'0 4px 12px rgba(255,105,0,0.3)':'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {!activeTab&&<div className="loading-spinner" style={{ margin:'60px auto' }}/>}
      {activeTab==='overview'     &&<TabOverview annee={annee} semaine={semaine}/>}
      {activeTab==='superviseurs' &&<ClassementKaabu endpoint="/kaabu/superviseurs" colNom="superviseur" nomLabel="Superviseur" semaine={semaine} annee={annee}/>}
      {activeTab==='gestionnaires'&&<ZoneTab endpoint="/kaabu/gestionnaires" semaine={semaine} annee={annee}/>}
      {activeTab==='coaches'      &&<ClassementKaabu endpoint="/kaabu/coaches" colNom="coach" nomLabel="Coach" semaine={semaine} annee={annee}/>}
      {activeTab==='telecons'     &&<ClassementKaabu endpoint="/kaabu/teleconseilleres" colNom="teleconseillere" nomLabel="Téléconseillère" semaine={semaine} annee={annee}/>}
      {activeTab==='developpeurs' &&<ClassementKaabu endpoint="/kaabu/developpeurs" colNom="developpeur" nomLabel="Développeur" semaine={semaine} annee={annee}/>}
      {activeTab==='hors_zone'    &&<TabHorsZone annee={annee} semaine={semaine}/>}
      {activeTab==='inactifs'     &&<TabInactifs annee={annee} semaine={semaine} teleFilter={teleNom}/>}
      {activeTab==='en_baisse'    &&<TabEnBaisse annee={annee} semaine={semaine} teleFilter={teleNom}/>}
      {activeTab==='evolution'    &&<TabEvolution annee={annee}/>}

      {showImport&&<ImportModal onClose={()=>setShowImport(false)} onSuccess={()=>{setShowImport(false);refetchPeriods();}}/>}
    </div>
  );
}
