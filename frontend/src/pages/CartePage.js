import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Filter } from 'lucide-react';
import api from '../services/api';
import 'leaflet/dist/leaflet.css';
import './CartePage.css';

// Fix Leaflet default icon issue avec Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Coordonnées centrées sur Bamako et environs
const ZONE_COORDS = {
  'Bamako Centre': { lat: 12.6392, lng: -8.0029, radius: 0.02 },
  'Bamako Nord':   { lat: 12.6650, lng: -8.0150, radius: 0.02 },
  'Bamako Sud':    { lat: 12.6100, lng: -7.9800, radius: 0.02 },
  'Bamako Est':    { lat: 12.6350, lng: -7.9400, radius: 0.02 },
  'Bamako Ouest':  { lat: 12.6450, lng: -8.0600, radius: 0.02 },
  'Kati':          { lat: 12.7500, lng: -8.0700, radius: 0.03 },
  'Koulikoro':     { lat: 12.8600, lng: -7.5600, radius: 0.04 },
  'Sikasso':       { lat: 11.3100, lng: -5.6600, radius: 0.04 },
};

// Scatter PDV dans une zone (pseudo-aléatoire déterministe)
function pdvCoords(zone, index, total) {
  const center = ZONE_COORDS[zone] || { lat: 12.6392, lng: -8.0029, radius: 0.02 };
  const angle = (index / total) * 2 * Math.PI + (zone.charCodeAt(0) * 0.1);
  const dist = center.radius * Math.sqrt((index * 0.618) % 1);
  return {
    lat: center.lat + dist * Math.cos(angle),
    lng: center.lng + dist * Math.sin(angle),
  };
}

function healthColor(score) {
  if (score >= 70) return '#00d68f';
  if (score >= 40) return '#ffa502';
  return '#ff4757';
}

function medalEmoji(m) {
  if (m === 'OR') return '🥇';
  if (m === 'ARGENT') return '🥈';
  if (m === 'BRONZE') return '🥉';
  return '';
}

const fmtCA = (v) => v >= 1e6 ? (v/1e6).toFixed(1)+' M' : v >= 1e3 ? (v/1e3).toFixed(0)+' K' : String(v);
const ZONE_COLORS = {
  'Bamako Centre':'#ff6900','Bamako Nord':'#3742fa','Bamako Sud':'#00d68f',
  'Bamako Est':'#ffa502','Bamako Ouest':'#ff4757','Kati':'#a29bfe',
  'Koulikoro':'#fd79a8','Sikasso':'#00cec9'
};

export default function CartePage() {
  const [filterZone, setFilterZone] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterSuperviseur, setFilterSuperviseur] = useState('');
  const [selectedPDV, setSelectedPDV] = useState(null);

  const now = new Date();

  const { data: pdvs = [], isLoading: loadingPDV } = useQuery(
    'pdvs-carte',
    () => api.get('/pdvs', { params: { limit: 500 } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: heatmap } = useQuery(
    ['heatmap-carte', now.getFullYear(), now.getMonth()+1],
    () => api.get('/analytics/heatmap', { params: { annee: now.getFullYear(), mois: now.getMonth()+1 } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: stats } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 60000 });

  // Calcul coordonnées des PDVs par zone
  const pdvsByZone = {};
  pdvs.forEach(p => {
    if (!pdvsByZone[p.zone]) pdvsByZone[p.zone] = [];
    pdvsByZone[p.zone].push(p);
  });

  const pdvsWithCoords = pdvs.map(p => {
    const zoneList = pdvsByZone[p.zone] || [];
    const idx = zoneList.indexOf(p);
    const coords = pdvCoords(p.zone, idx, zoneList.length);
    return { ...p, ...coords };
  });

  // Filtrage
  const filtered = pdvsWithCoords.filter(p => {
    if (filterZone && p.zone !== filterZone) return false;
    if (filterStatut && p.statut !== filterStatut) return false;
    if (filterSuperviseur && p.superviseur !== filterSuperviseur) return false;
    return true;
  });

  const zones = [...new Set(pdvs.map(p => p.zone))].sort();
  const superviseurs = [...new Set(pdvs.map(p => p.superviseur).filter(Boolean))].sort();

  // Données pour le graphique heatmap zones
  const zoneChartData = heatmap?.data
    ? Object.entries(heatmap.data).map(([zone, v]) => ({
        zone: zone.replace('Bamako ','Bko '),
        fullZone: zone,
        ca: Math.round(v.ca),
        count: v.count,
        nb_actifs: v.nb_actifs,
        pct: Math.round(v.pct_network),
        health: Math.round(v.health_avg),
      })).sort((a, b) => b.ca - a.ca)
    : [];

  return (
    <div className="carte-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🗺️ Carte Interactive du Réseau</h1>
          <p className="page-subtitle">Visualisation géographique de tous les PDVs Orange Mali · {filtered.length} PDVs affichés</p>
        </div>
        <div className="carte-legend">
          <div className="legend-item"><div className="legend-dot" style={{background:'#00d68f'}}/> Sain (&gt;70)</div>
          <div className="legend-item"><div className="legend-dot" style={{background:'#ffa502'}}/> À surveiller (40-70)</div>
          <div className="legend-item"><div className="legend-dot" style={{background:'#ff4757'}}/> Critique (&lt;40)</div>
        </div>
      </div>

      {/* KPIs rapides */}
      <div className="carte-kpis">
        {[
          { label:'Total PDVs', value: stats?.total_pdvs || 0, color:'var(--primary)' },
          { label:'Actifs', value: stats?.actifs || 0, color:'var(--success)' },
          { label:'Inactifs', value: stats?.inactifs || 0, color:'var(--danger)' },
          { label:'Zones', value: zones.length, color:'#3742fa' },
          { label:'Superviseurs', value: superviseurs.length, color:'#a29bfe' },
          { label:'Taux activité', value: `${stats?.taux_activite || 0}%`, color:'var(--warning)' },
        ].map((k, i) => (
          <div key={i} className="carte-kpi">
            <div className="carte-kpi-value" style={{ color: k.color }}>{k.value}</div>
            <div className="carte-kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="carte-filters card">
        <Filter size={14} style={{ color:'var(--text-secondary)' }}/>
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ minWidth:160 }}>
          <option value="">Toutes les zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="ACTIF">Actif</option>
          <option value="INACTIF">Inactif</option>
          <option value="RECUPERATION">En récupération</option>
        </select>
        <select value={filterSuperviseur} onChange={e => setFilterSuperviseur(e.target.value)}>
          <option value="">Tous les superviseurs</option>
          {superviseurs.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--text-secondary)', marginLeft:'auto' }}>
          {filtered.length} / {pdvs.length} PDVs
        </span>
        {(filterZone||filterStatut||filterSuperviseur) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterZone(''); setFilterStatut(''); setFilterSuperviseur(''); }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* Carte + Sidebar */}
      <div className="carte-layout">
        {/* Map */}
        <div className="carte-map-container">
          <MapContainer
            center={[12.6392, -8.0029]}
            zoom={10}
            style={{ width:'100%', height:'100%', borderRadius: 'var(--radius)' }}
            zoomControl={false}
          >
            <ZoomControl position="bottomright" />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filtered.map((pdv, i) => (
              <CircleMarker
                key={pdv.id || i}
                center={[pdv.lat, pdv.lng]}
                radius={pdv.statut === 'ACTIF' ? 8 : 6}
                pathOptions={{
                  fillColor: healthColor(pdv.health_score || 0),
                  fillOpacity: 0.9,
                  color: pdv.statut === 'INACTIF' ? '#ff4757' : '#fff',
                  weight: pdv.statut === 'INACTIF' ? 2 : 1,
                }}
                eventHandlers={{ click: () => setSelectedPDV(pdv) }}
              >
                <Popup>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                      {medalEmoji(pdv.medaille)} {pdv.nom}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                      📍 {pdv.zone} · {pdv.type_pdv}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, fontSize:11 }}>
                      <div><strong>N°:</strong> {pdv.numero_pdv}</div>
                      <div><strong>Statut:</strong> <span style={{ color: pdv.statut==='ACTIF'?'#00d68f':'#ff4757' }}>{pdv.statut}</span></div>
                      <div><strong>Score santé:</strong> <span style={{ color: healthColor(pdv.health_score||0), fontWeight:700 }}>{pdv.health_score?.toFixed(0)||0}/100</span></div>
                      <div><strong>Médaille:</strong> {pdv.medaille || 'Aucune'}</div>
                      {pdv.superviseur && <div style={{ gridColumn:'1/-1' }}><strong>Superviseur:</strong> {pdv.superviseur}</div>}
                      {pdv.telephone && <div style={{ gridColumn:'1/-1' }}><strong>Tél:</strong> <a href={`tel:${pdv.telephone}`}>{pdv.telephone}</a></div>}
                    </div>
                    <button
                      style={{ marginTop:8, background:'#ff6900', color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer', width:'100%' }}
                      onClick={() => window.location.href = `/pdvs/${pdv.id}`}
                    >
                      Voir la fiche complète →
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Sidebar droite */}
        <div className="carte-sidebar">
          {/* Zone sélectionnée */}
          {selectedPDV && (
            <div className="card mb-16" style={{ borderColor: healthColor(selectedPDV.health_score||0) }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>
                {medalEmoji(selectedPDV.medaille)} {selectedPDV.nom}
              </div>
              <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:10 }}>
                {selectedPDV.numero_pdv} · {selectedPDV.zone} · {selectedPDV.type_pdv}
              </div>
              {[
                ['Statut', selectedPDV.statut, selectedPDV.statut==='ACTIF'?'var(--success)':'var(--danger)'],
                ['Health Score', `${selectedPDV.health_score?.toFixed(0)||0}/100`, healthColor(selectedPDV.health_score||0)],
                ['Médaille', selectedPDV.medaille||'Aucune', '#ffa502'],
                ['Superviseur', selectedPDV.superviseur||'—', 'var(--text-primary)'],
                ['Téléphone', selectedPDV.telephone||'—', 'var(--primary)'],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color:'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontWeight:600, color:c }}>{v}</span>
                </div>
              ))}
              <button className="btn btn-primary btn-sm" style={{ marginTop:10, width:'100%', justifyContent:'center' }}
                onClick={() => window.location.href = `/pdvs/${selectedPDV.id}`}>
                Voir fiche PDV →
              </button>
            </div>
          )}

          {/* Heatmap zones */}
          <div className="card">
            <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🌡️ Performance par Zone</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={zoneChartData} layout="vertical" margin={{ top:0, right:30, bottom:0, left:50 }}>
                <XAxis type="number" tick={{ fontSize:9, fill:'var(--text-secondary)' }} tickFormatter={v => `${(v/1e6).toFixed(0)}M`} />
                <YAxis type="category" dataKey="zone" tick={{ fontSize:10, fill:'var(--text-secondary)' }} width={50} />
                <Tooltip formatter={(v) => [fmtCA(v)+' FCFA', 'CA']} contentStyle={{ background:'#12121e', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} />
                <Bar dataKey="ca" radius={[0,4,4,0]}>
                  {zoneChartData.map((entry, i) => <Cell key={i} fill={ZONE_COLORS[entry.fullZone] || 'var(--primary)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Zone cards */}
            <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
              {zoneChartData.map((z, i) => {
                const maxCA = zoneChartData[0]?.ca || 1;
                const pct = Math.round((z.ca / maxCA) * 100);
                return (
                  <div key={i} style={{ padding:'10px 12px', background:'rgba(255,255,255,0.02)', borderRadius:10, border:`1px solid ${ZONE_COLORS[z.fullZone] || 'var(--border)'}33`, cursor:'pointer' }}
                    onClick={() => setFilterZone(filterZone === z.fullZone ? '' : z.fullZone)}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:12, fontWeight:700 }}>{z.fullZone}</span>
                      <span style={{ fontSize:11, fontWeight:700, color: ZONE_COLORS[z.fullZone] || 'var(--primary)' }}>{z.pct}% réseau</span>
                    </div>
                    <div style={{ display:'flex', gap:8, fontSize:10, color:'var(--text-secondary)', marginBottom:6 }}>
                      <span>🏪 {z.count} PDVs</span>
                      <span>✅ {z.nb_actifs} actifs</span>
                      <span>❤️ {z.health}pts</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width:`${pct}%`, background: ZONE_COLORS[z.fullZone] || 'var(--primary)' }} />
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color: ZONE_COLORS[z.fullZone], marginTop:4 }}>{fmtCA(z.ca)} FCFA</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
