/**
 * KaabuMensuelPage — Dashboard Mensuel KAABU Mobile
 * Agrège les données hebdomadaires par mois
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
const MOIS_NOMS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

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

// ─── Tableau classement mensuel ────────────────────────────────────────────────
function ClassementMensuel({ endpoint, colNom, nomLabel, mois, annee }) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('montant');
  const [sortDir, setSortDir] = useState('desc');

  const { data: rawData, isLoading } = useQuery(
    [endpoint, mois, annee],
    () => api.get(`${endpoint}?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000 }
  );

  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  const data = Array.isArray(rawData) ? rawData : [];
  if (!data.length) return <EmptyKaabu msg={`Aucune donnée pour ${MOIS_NOMS[mois]} ${annee}.`} />;

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

  return (
    <div>
      <div style={{ marginBottom: 14, position: 'relative', maxWidth: 320 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a8a9a' }}>🔍</span>
        <input type="text" placeholder={`Rechercher ${nomLabel}...`} value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(0,0,0,0.25)', border: `1px solid rgba(255,105,0,0.2)`, borderRadius: 8, color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>📊 Volume KAABU — {MOIS_NOMS[mois]} {annee}</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={sorted.slice(0, 10).map(d => ({ name: (d[colNom] || '—').split(' ')[0], volume: d.volume || 0 }))}>
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
          <span style={{ fontSize: 13, fontWeight: 700 }}>Classement {nomLabel}s — {MOIS_NOMS[mois]} {annee}</span>
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

// ─── Vue d'ensemble mensuelle ─────────────────────────────────────────────────
function TabOverviewMensuel({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['kaabu-m-overview', annee, mois],
    () => api.get(`/kaabu/mensuel/vue-ensemble?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000 }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  if (!data?.total_pdv) return <EmptyKaabu msg={`Aucune donnée pour ${MOIS_NOMS[mois]} ${annee}.`} />;
  const ev = data.evolution_volume || 0;
  const ea = data.evolution_montant || 0;
  const kpis = [
    { icon: '🏪', label: 'Total PDVs', value: fmtVol(data.total_pdv), color: '#3742fa' },
    { icon: '✅', label: 'PDVs Actifs', value: fmtVol(data.actifs), color: '#22c55e', sub: `${fmtVol(data.inactifs)} inactifs` },
    { icon: '📊', label: "Taux d'Activité", value: fmtPct(data.taux_activite), color: data.taux_activite >= 0.9 ? '#22c55e' : data.taux_activite >= 0.75 ? '#ffa502' : '#ff4757' },
    { icon: '🔄', label: 'Volume KAABU', value: fmtVol(data.volume_kaabu), color: COLOR, sub: `${ev >= 0 ? '▲' : '▼'} ${Math.abs(ev)}% vs M préc.` },
    { icon: '💰', label: 'CA Global', value: fmtN(data.montant_global) + ' F', color: '#ffa502', sub: `${ea >= 0 ? '▲' : '▼'} ${Math.abs(ea)}% vs M préc.` },
    { icon: '📥', label: 'Volume Cash-in', value: fmtVol(data.volume_cashin), color: '#00d68f', sub: fmtN(data.montant_cashin) + ' F' },
    { icon: '📤', label: 'Volume Cash-out', value: fmtVol(data.volume_cashout), color: '#a29bfe', sub: fmtN(data.montant_cashout) + ' F' },
    { icon: '📈', label: 'Évol. Actifs', value: `${data.evolution_actifs >= 0 ? '+' : ''}${data.evolution_actifs}`, color: data.evolution_actifs >= 0 ? '#22c55e' : '#ff4757', sub: 'vs mois préc.' },
  ];
  return (
    <div>
      {/* Info semaines incluses */}
      {data.semaines_incluses?.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: 'rgba(255,105,0,0.06)', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 8, fontSize: 12, color: '#ffa502' }}>
          📅 Agrégation de {data.semaines_incluses.length} semaines : {data.semaines_incluses.join(' · ')}
        </div>
      )}
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
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>🏆 Répartition par Segment — {MOIS_NOMS[mois]} {annee}</h3>
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

// ─── Inactifs mensuel ─────────────────────────────────────────────────────────
function TabInactifsMensuel({ annee, mois, teleFilter }) {
  const [search, setSearch] = useState('');
  const [appelPDV, setAppelPDV] = useState(null);
  const { data, isLoading } = useQuery(['kaabu-m-inactifs', annee, mois, teleFilter],
    () => api.get(`/kaabu/mensuel/inactifs?annee=${annee}&mois=${mois}${teleFilter?`&teleconseillere=${teleFilter}`:''}`).then(r => r.data),
    { staleTime: 300000 }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  const pdvs = data?.pdvs || [];
  const filtered = pdvs.filter(p => !search || (p.numero_pdv||'').includes(search) || (p.superviseur||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20 }}>
        {[{icon:'😴',label:'PDVs Inactifs',value:pdvs.length,color:'#ff4757'},{icon:'📅',label:'Mois analysé',value:`${MOIS_NOMS[mois]} ${annee}`,color:'#ffa502'}].map((k,i)=>(
          <div key={i} style={{ padding:'14px',background:'rgba(255,71,87,0.05)',border:`1px solid rgba(255,71,87,0.15)`,borderLeft:`4px solid ${k.color}`,borderRadius:12,textAlign:'center' }}>
            <div style={{ fontSize:22,marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:22,fontWeight:900,color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11,color:'#8a8a9a',marginTop:3 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom:14,position:'relative',maxWidth:320 }}>
        <span style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#8a8a9a' }}>🔍</span>
        <input type="text" placeholder="PDV, superviseur..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{ width:'100%',padding:'9px 12px 9px 34px',background:'rgba(0,0,0,0.25)',border:'1px solid rgba(255,71,87,0.2)',borderRadius:8,color:'#fff',fontSize:13,boxSizing:'border-box' }}/>
      </div>
      {!filtered.length ? <EmptyKaabu msg="✅ Aucun PDV inactif ce mois !" /> : (
        <div style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,overflow:'hidden' }}>
          <div style={{ padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between' }}>
            <span style={{ fontSize:13,fontWeight:700 }}>😴 PDVs Inactifs — {MOIS_NOMS[mois]} {annee}</span>
            <span style={{ fontSize:12,color:'#ff4757' }}>{filtered.length} PDVs</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                  {['PDV','Superviseur','Gestionnaire','TC','Localité','Segment','📞'].map(h=>(
                    <th key={h} style={{ padding:'10px 12px',textAlign:'left',color:'#8a8a9a',fontWeight:600,whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'9px 12px',fontWeight:700,color:'#fff' }}>{p.numero_pdv}</td>
                    <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.superviseur||'—'}</td>
                    <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.groupe||'—'}</td>
                    <td style={{ padding:'9px 12px',color:'#a29bfe' }}>{p.teleconseillere||'—'}</td>
                    <td style={{ padding:'9px 12px',color:'#8a8a9a' }}>{p.localite||'—'}</td>
                    <td style={{ padding:'9px 12px' }}>{p.segment&&<span style={{ fontSize:11,padding:'2px 7px',borderRadius:5,background:'rgba(255,105,0,0.1)',color:COLOR }}>{p.segment}</span>}</td>
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

// ─── En Baisse mensuel ────────────────────────────────────────────────────────
function TabEnBaisseMensuel({ annee, mois, teleFilter }) {
  const [seuil, setSeuil] = useState(20);
  const [activeFilter, setActiveFilter] = useState(null);
  const [appelPDV, setAppelPDV] = useState(null);

  const { data, isLoading } = useQuery(['kaabu-m-baisse', annee, mois, seuil, teleFilter],
    () => api.get(`/kaabu/mensuel/en-baisse?annee=${annee}&mois=${mois}&seuil=${-seuil}${teleFilter?`&teleconseillere=${teleFilter}`:''}`).then(r => r.data),
    { staleTime: 300000 }
  );
  const pdvs = data?.pdvs || [];
  const displayed = pdvs.filter(p => activeFilter==='critique'?Math.abs(p.variation_pct)>40:activeFilter==='haute'?Math.abs(p.variation_pct)>20&&Math.abs(p.variation_pct)<=40:activeFilter==='normale'?Math.abs(p.variation_pct)<=20:true);

  return (
    <div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16 }}>
        {[{label:`Total (≥${seuil}%)`,value:data?.total||0,color:'#ff4757',filter:null},{label:'🔴 Critique (>40%)',value:data?.nb_critique||0,color:'#ff4757',filter:'critique'},{label:'🟠 Haute (20-40%)',value:data?.nb_haute||0,color:'#ffa502',filter:'haute'},{label:'⚪ Normale (≤20%)',value:data?.nb_normale||0,color:'#8a8a9a',filter:'normale'}].map((k,i)=>(
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
       !displayed.length ? <EmptyKaabu msg={`✅ Aucun PDV en baisse de plus de ${seuil}% ce mois`}/> : (
        <div style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,overflow:'hidden' }}>
          <div style={{ padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between' }}>
            <span style={{ fontSize:13,fontWeight:700 }}>📉 PDVs En Baisse — {MOIS_NOMS[mois]} {annee}</span>
            <span style={{ fontSize:12,color:'#ff4757' }}>{displayed.length} PDVs</span>
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
                    <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding:'9px 12px',fontWeight:700 }}>{p.numero_pdv}</td>
                      <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.superviseur||'—'}</td>
                      <td style={{ padding:'9px 12px',color:'#ccc' }}>{p.groupe||'—'}</td>
                      <td style={{ padding:'9px 12px',color:'#a29bfe' }}>{p.teleconseillere||'—'}</td>
                      <td style={{ padding:'9px 12px',textAlign:'right',fontWeight:700,color:COLOR }}>{fmtVol(p.volume_actuel)}</td>
                      <td style={{ padding:'9px 12px',textAlign:'right',color:'#ffa502' }}>{fmtVol(p.volume_precedent)}</td>
                      <td style={{ padding:'9px 12px',textAlign:'center',fontWeight:800,color:'#ff4757' }}>▼ {abs}%</td>
                      <td style={{ padding:'9px 12px' }}><span style={{ fontSize:11,fontWeight:600,padding:'2px 7px',borderRadius:5,background:`rgba(${abs>40?'255,71,87':abs>20?'255,165,2':'138,138,154'},0.12)`,color:alertColor }}>{p.alerte}</span></td>
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

// ─── Zone Tab Mensuel ─────────────────────────────────────────────────────────
function ZoneMensuelTab({ endpoint, mois, annee }) {
  const ZONE_COLORS = { 'ZONE A': '#FF6900', 'ZONE B': '#3742fa', 'ZONE C': '#22c55e', 'ZONE D': '#ffa502', 'ZONE E': '#a29bfe', 'AU BUREAU': '#8a8a9a' };
  const { data: rawData, isLoading } = useQuery(
    [endpoint, mois, annee],
    () => api.get(`${endpoint}?annee=${annee}&mois=${mois}`).then(r => r.data),
    { staleTime: 300000 }
  );
  if (isLoading) return <div className="loading-spinner" style={{ margin: '60px auto' }} />;
  const data = Array.isArray(rawData) ? rawData : [];
  if (!data.length) return <div style={{ textAlign: 'center', padding: '60px', color: '#8a8a9a' }}>📭 Aucune donnée de zone.</div>;

  const sorted = [...data].sort((a, b) => (b.montant || 0) - (a.montant || 0));
  const totalMontant = sorted.reduce((s, d) => s + (d.montant || 0), 0) || 1;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {sorted.map((z, i) => {
          const zoneColor = ZONE_COLORS[z.groupe] || COLORS[i % COLORS.length];
          const pct = Math.round((z.montant || 0) / totalMontant * 100);
          return (
            <div key={i} style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: `2px solid ${zoneColor}30`, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: zoneColor, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: 14, color: '#fff', flex: 1 }}>{z.groupe || '—'}</span>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#22c55e' }}>✅ {fmtVol(z.actifs)} / {fmtVol(z.total_pdv)}</span>
                  <TauxBadge taux={z.taux} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: zoneColor }}>{fmtVol(z.volume)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ffa502' }}>{fmtN(z.montant)} F</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{pct}% du CA</span>
                </div>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${zoneColor},${zoneColor}99)`, borderRadius: 4, transition: 'width 0.6s' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>📍 Toutes les Zones — {MOIS_NOMS[mois]} {annee}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['#','Zone','Total PDVs','Actifs','Taux','Volume KAABU','CA (FCFA)','Part %'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Zone' || h === '#' ? 'left' : 'right', color: '#8a8a9a', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const zoneColor = ZONE_COLORS[d.groupe] || COLORS[i % COLORS.length];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px' }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: zoneColor }} /></td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: zoneColor }}>{d.groupe || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#aaa' }}>{fmtVol(d.total_pdv)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtVol(d.actifs)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}><TauxBadge taux={d.taux} /></td>
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

// ─── PAGE PRINCIPALE MENSUELLE ────────────────────────────────────────────────
export default function KaabuMensuelPage() {
  const [activeTab, setActiveTab] = useState(null);
  const [mois, setMois] = useState(0);
  const [annee, setAnnee] = useState(2026);

  const user = useAuthStore(s => s.user);
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const isTelec = role === 'teleconseillere';
  const teleNom = isTelec ? (user?.nom || '').trim() : null;

  const { data: periods } = useQuery('kaabu-periods-mensuel',
    () => api.get('/kaabu/periods-mensuel').then(r => r.data), { staleTime: 60000 }
  );

  useEffect(() => {
    if (periods?.mois?.length) {
      const last = periods.mois[periods.mois.length - 1];
      setMois(last.mois); setAnnee(last.annee);
      if (!activeTab) setActiveTab(isTelec ? 'inactifs' : 'overview');
    }
  }, [periods]);

  const moisDispo = periods?.mois || [];
  const idx = moisDispo.findIndex(m => m.mois === mois && m.annee === annee);
  const canPrev = idx > 0;
  const canNext = idx < moisDispo.length - 1;

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
  ].filter(t => t.show);

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">🟠 KAABU Mobile — Dashboard Mensuel</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            {moisDispo.length} mois disponibles · Agrégation des semaines par mois
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 14px' }}>
          <button onClick={() => { if (canPrev) { const m = moisDispo[idx-1]; setMois(m.mois); setAnnee(m.annee); } }} disabled={!canPrev}
            style={{ background:'none',border:'none',color:canPrev?COLOR:'#444',cursor:canPrev?'pointer':'not-allowed',fontSize:18 }}>‹</button>
          <span style={{ fontWeight:700,fontSize:15,color:'#fff',minWidth:150,textAlign:'center' }}>{MOIS_NOMS[mois]} {annee}</span>
          <button onClick={() => { if (canNext) { const m = moisDispo[idx+1]; setMois(m.mois); setAnnee(m.annee); } }} disabled={!canNext}
            style={{ background:'none',border:'none',color:canNext?COLOR:'#444',cursor:canNext?'pointer':'not-allowed',fontSize:18 }}>›</button>
        </div>
      </div>

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

      {!activeTab && <div className="loading-spinner" style={{ margin:'60px auto' }}/>}
      {activeTab==='overview'     && <TabOverviewMensuel annee={annee} mois={mois} />}
      {activeTab==='superviseurs' && <ClassementMensuel endpoint="/kaabu/mensuel/superviseurs" colNom="superviseur" nomLabel="Superviseur" mois={mois} annee={annee} />}
      {activeTab==='gestionnaires'&& <ZoneMensuelTab endpoint="/kaabu/mensuel/gestionnaires" mois={mois} annee={annee} />}
      {activeTab==='coaches'      && <ClassementMensuel endpoint="/kaabu/mensuel/coaches" colNom="coach_distri" nomLabel="Coach" mois={mois} annee={annee} />}
      {activeTab==='telecons'     && <ClassementMensuel endpoint="/kaabu/mensuel/teleconseilleres" colNom="teleconseillere" nomLabel="Téléconseillère" mois={mois} annee={annee} />}
      {activeTab==='developpeurs' && <ClassementMensuel endpoint="/kaabu/mensuel/developpeurs" colNom="developpeur" nomLabel="Développeur" mois={mois} annee={annee} />}
      {activeTab==='hors_zone'    && <EmptyKaabu msg="Hors Zone mensuel — données disponibles." />}
      {activeTab==='inactifs'     && <TabInactifsMensuel annee={annee} mois={mois} teleFilter={teleNom} />}
      {activeTab==='en_baisse'    && <TabEnBaisseMensuel annee={annee} mois={mois} teleFilter={teleNom} />}
    </div>
  );
}
