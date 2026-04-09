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

const ZONES = ['Bamako Centre', 'Bamako Nord', 'Bamako Sud', 'Bamako Est', 'Kati', 'Sikasso', 'Ségou', 'Koulikoro'];

// ========== SCENARIO 1: Recover Inactive PDVs ==========
function Scenario1() {
  const [numPDVs, setNumPDVs] = useState(5);
  const { data: stats } = useQuery('pdv-stats', () =>
    api.get('/pdvs/stats').then(r => r.data).catch(() => ({ inactifs: 60, ca_total: 141321325, actifs: 140 })),
    { staleTime: 120000 }
  );

  // Calculer CA moyen par PDV actif depuis les stats réelles
  const avgCA = stats?.ca_total && stats?.actifs ? Math.round(stats.ca_total / stats.actifs) : 1009438;
  const inactifsCount = stats?.inactifs || 60;
  const estimatedGain = numPDVs * avgCA;

  const chartData = [
    { name: 'Avant', ca: 0 },
    { name: 'Après', ca: estimatedGain }
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
              max="30"
              value={numPDVs}
              onChange={(e) => setNumPDVs(parseInt(e.target.value))}
              className="slider"
            />
            <div className="slider-value">{numPDVs} PDVs</div>
          </div>
          <div className="info-text">
            PDVs inactifs disponibles: {inactifsCount}
          </div>
        </div>

        <div className="scenario-stats">
          <div className="stat-box">
            <span className="stat-label">CA Moyen par PDV Actif</span>
            <span className="stat-value">{formatCA(avgCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gain Estimé/Mois</span>
            <span className="stat-value gain">{formatCA(estimatedGain)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gain en %</span>
            <span className="stat-value">{((estimatedGain / (avgCA * 100)) * 100).toFixed(1)}%</span>
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
  const [selectedZone, setSelectedZone] = useState('Bamako Centre');
  const { data: heatmap } = useQuery('whatif-heatmap', () =>
    api.get('/analytics/heatmap', { params: { annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const zoneData = heatmap?.data?.[selectedZone] || { ca: 0, count: 0, health_avg: 0 };
  const currentCA = zoneData.ca || 0;
  const potentialCA = currentCA * 1.2; // +20% hypothetical
  const gain = potentialCA - currentCA;

  // Simulate recovery curve
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
          <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}>
            {ZONES.map(zone => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </div>

        <div className="scenario-stats">
          <div className="stat-box">
            <span className="stat-label">CA Actuel Zone</span>
            <span className="stat-value">{formatCA(currentCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">CA Potentiel (+20%)</span>
            <span className="stat-value potentiel">{formatCA(potentialCA)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gain Estimé</span>
            <span className="stat-value gain">{formatCA(gain)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">PDVs Actifs</span>
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
  const [selectedZone, setSelectedZone] = useState('Bamako Centre');
  const { data: heatmap } = useQuery('whatif-heatmap', () =>
    api.get('/analytics/heatmap', { params: { annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const zoneData = heatmap?.data?.[selectedZone] || { ca: 0, count: 0 };
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
          <label>Zone</label>
          <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}>
            {ZONES.map(zone => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
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
            <span className="stat-label">CA Moyen Zone ({selectedZone})</span>
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
