import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import './WhatIfPage.css';

const formatCA = (v) => {
  if (!v) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M FCFA`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} K FCFA`;
  return `${v} FCFA`;
};

// Hook pour récupérer les dernières données disponibles
function useLastAvailable() {
  return useQuery('last-available', () =>
    api.get('/dashboard/last-available').then(r => r.data),
    { staleTime: 300000 }
  );
}

// Hook pour récupérer le heatmap avec les dernières données
function useHeatmap() {
  const { data: last } = useLastAvailable();
  const annee = last?.last_month?.annee || new Date().getFullYear();
  const mois = last?.last_month?.mois || new Date().getMonth() + 1;
  return useQuery(['whatif-heatmap', annee, mois], () =>
    api.get('/analytics/heatmap', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 120000, enabled: !!(annee && mois) }
  );
}

// ========== SCENARIO 1: Recover Inactive PDVs ==========
function Scenario1() {
  const [numPDVs, setNumPDVs] = useState(5);
  const { data: last } = useLastAvailable();
  const { data: heatmap } = useHeatmap();

  const { data: stats } = useQuery('pdv-stats', () =>
    api.get('/pdvs/stats').then(r => r.data),
    { staleTime: 120000 }
  );

  // Données réelles : CA total réseau depuis heatmap, inactifs depuis stats
  const totalCAReseau = Object.values(heatmap?.data || {}).reduce((s, z) => s + (z.ca || 0), 0);
  const totalActifs = Object.values(heatmap?.data || {}).reduce((s, z) => s + (z.count || 0), 0);
  const avgCA = totalActifs > 0 ? Math.round(totalCAReseau / totalActifs) : (stats?.ca_moyen || 0);
  const inactifsCount = stats?.inactifs || 0;
  const maxSlider = Math.min(inactifsCount, 100);
  const estimatedGain = numPDVs * avgCA;
  const caAvant = totalCAReseau;
  const caApres = totalCAReseau + estimatedGain;

  const chartData = [
    { name: 'CA Actuel', ca: caAvant },
    { name: `+${numPDVs} PDVs récupérés`, ca: caApres }
  ];

  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <h3>Et si je récupère N PDVs inactifs ?</h3>
        <p>Estimez l'impact de la réactivation de PDVs dormants</p>
      </div>

      <div className="scenario-content">
        <div className="slider-group">
          <label>Nombre de PDVs à récupérer</label>
          <div className="slider-container">
            <input
              type="range"
              min="1"
              max={maxSlider || 30}
              value={numPDVs}
              onChange={(e) => setNumPDVs(parseInt(e.target.value))}
              className="slider"
            />
            <div className="slider-value">{numPDVs} PDVs</div>
          </div>
          <div className="info-text">
            PDVs inactifs disponibles: <strong>{inactifsCount}</strong>
          </div>
        </div>

        <div className="scenario-stats">
          <div className="stat-box">
            <span className="stat-label">CA Réseau Actuel</span>
            <span className="stat-value">{formatCA(caAvant)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">CA Moyen par PDV Actif</span>
            <span className="stat-value">{formatCA(avgCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gain Estimé</span>
            <span className="stat-value gain">{formatCA(estimatedGain)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gain en %</span>
            <span className="stat-value gain">{caAvant > 0 ? ((estimatedGain / caAvant) * 100).toFixed(1) : '0'}%</span>
          </div>
        </div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v) => formatCA(v)} />
              <Bar dataKey="ca" fill="#00d68f" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ========== SCENARIO 2: Zone Recovery ==========
function Scenario2() {
  const { data: heatmap } = useHeatmap();
  const zones = Object.keys(heatmap?.data || {}).sort();
  const [selectedZone, setSelectedZone] = useState('');
  const [targetPct, setTargetPct] = useState(20);

  const activeZone = selectedZone || zones[0] || '';
  const zoneData = heatmap?.data?.[activeZone] || { ca: 0, count: 0, health_avg: 0 };
  const currentCA = zoneData.ca || 0;
  const potentialCA = currentCA * (1 + targetPct / 100);
  const gain = potentialCA - currentCA;

  // Simulate recovery curve sur 12 semaines
  const recoveryData = Array.from({ length: 12 }, (_, i) => ({
    week: `S${i + 1}`,
    current: currentCA + (gain * (i / 12)),
    potential: potentialCA
  }));

  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <h3>Et si la Zone X retrouve son niveau d'il y a 3 mois ?</h3>
        <p>Simulez la récupération d'une zone en déclin</p>
      </div>

      <div className="scenario-content">
        <div className="form-group">
          <label>Sélectionnez une zone</label>
          <select value={activeZone} onChange={(e) => setSelectedZone(e.target.value)}>
            {zones.length > 0 ? zones.map(zone => (
              <option key={zone} value={zone}>{zone}</option>
            )) : <option value="">Chargement...</option>}
          </select>
        </div>

        <div className="slider-group">
          <label>Objectif de croissance zone</label>
          <div className="slider-container">
            <input type="range" min="5" max="100" step="5" value={targetPct}
              onChange={(e) => setTargetPct(parseInt(e.target.value))} className="slider" />
            <div className="slider-value">+{targetPct}%</div>
          </div>
        </div>

        <div className="scenario-stats">
          <div className="stat-box">
            <span className="stat-label">CA Actuel Zone</span>
            <span className="stat-value">{formatCA(currentCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">CA Potentiel (+{targetPct}%)</span>
            <span className="stat-value potentiel">{formatCA(potentialCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gain Estimé</span>
            <span className="stat-value gain">{formatCA(gain)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">PDVs Actifs dans la zone</span>
            <span className="stat-value">{zoneData.count || 0}</span>
          </div>
        </div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={recoveryData}>
              <defs>
                <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff6900" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ff6900" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={(v) => formatCA(v)} />
              <Legend />
              <Area type="monotone" dataKey="current" stroke="#ff6900" fill="url(#colorCurrent)" name="Trajectoire Actuelle" />
              <Area type="monotone" dataKey="potential" stroke="#00d68f" fill="transparent" strokeDasharray="5 5" name="Objectif (+20%)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ========== SCENARIO 3: New PDVs ==========
function Scenario3() {
  const [numNewPDVs, setNumNewPDVs] = useState(5);
  const { data: heatmap } = useHeatmap();
  const zones = Object.keys(heatmap?.data || {}).sort();
  const [selectedZone, setSelectedZone] = useState('');

  const activeZone = selectedZone || zones[0] || '';
  const zoneData = heatmap?.data?.[activeZone] || { ca: 0, count: 0 };
  const zoneAvgCA = zoneData.ca && zoneData.count ? zoneData.ca / zoneData.count : 2000000;
  const estimatedNewCA = numNewPDVs * zoneAvgCA;

  const totalNetworkBefore = Object.values(heatmap?.data || {}).reduce((sum, z) => sum + (z.ca || 0), 0);
  const totalNetworkAfter = totalNetworkBefore + estimatedNewCA;
  const networkGain = totalNetworkAfter - totalNetworkBefore;
  const networkGainPct = totalNetworkBefore ? ((networkGain / totalNetworkBefore) * 100) : 0;

  const chartData = [
    { name: 'Avant', total: totalNetworkBefore },
    { name: 'Après', total: totalNetworkAfter }
  ];

  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <h3>Et si j'ajoute N nouveaux PDVs dans une zone ?</h3>
        <p>Estimez l'impact de l'expansion dans une zone stratégique</p>
      </div>

      <div className="scenario-content">
        <div className="form-group">
          <label>Zone cible</label>
          <select value={activeZone} onChange={(e) => setSelectedZone(e.target.value)}>
            {zones.length > 0 ? zones.map(zone => (
              <option key={zone} value={zone}>{zone}</option>
            )) : <option value="">Chargement...</option>}
          </select>
        </div>

        <div className="form-group">
          <label>Nombre de nouveaux PDVs</label>
          <div className="slider-container">
            <input
              type="range"
              min="1"
              max="20"
              value={numNewPDVs}
              onChange={(e) => setNumNewPDVs(parseInt(e.target.value))}
              className="slider"
            />
            <div className="slider-value">{numNewPDVs} PDVs</div>
          </div>
        </div>

        <div className="scenario-stats">
          <div className="stat-box">
            <span className="stat-label">CA Moyen PDV dans {activeZone || '...'}</span>
            <span className="stat-value">{formatCA(zoneAvgCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">CA Estimé Nouveaux PDVs</span>
            <span className="stat-value gain">{formatCA(estimatedNewCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Impact Réseau Total</span>
            <span className="stat-value gain">{formatCA(networkGain)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Croissance %</span>
            <span className="stat-value gain">{networkGainPct.toFixed(2)}%</span>
          </div>
        </div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v) => formatCA(v)} />
              <Bar dataKey="total" fill="#3742fa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function WhatIfPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🎲 Simulateur Et Si ?</h1>
        <p className="page-subtitle">Explorez l'impact de différents scénarios sur votre réseau</p>
      </div>

      <div className="disclaimer-banner">
        <Info size={16} />
        <span>Ces projections sont basées sur les moyennes historiques du réseau. Les résultats réels peuvent varier selon le contexte local.</span>
      </div>

      <div className="scenarios-container">
        <Scenario1 />
        <Scenario2 />
        <Scenario3 />
      </div>
    </div>
  );
}
