import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line
} from 'recharts';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

function formatCA(v) {
  if (!v) return '0 FCFA';
  return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ') + ' FCFA';
}

function TauxBadge({ taux }) {
  const color = taux >= 80 ? '#00d68f' : taux >= 50 ? '#ffaa00' : '#ff3d71';
  return (
    <span style={{ fontWeight: 700, color }}>{taux}%</span>
  );
}

function VueEnsemble({ annee, mois }) {
  const { data, isLoading } = useQuery(
    ['gestionnaires-overview', annee, mois],
    () => api.get('/gestionnaires/overview', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {list.map((g, i) => (
          <div key={g.gestionnaire} className="card" style={{ borderLeft: `3px solid ${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--border)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`} {g.gestionnaire}
                </div>
                <div style={{ color: '#8a8a9a', fontSize: 11, marginTop: 2 }}>
                  {g.nb_pdvs} PDVs · {g.zones?.slice(0,3).join(', ')}
                </div>
              </div>
              {g.variation_ca !== 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: g.variation_ca > 0 ? '#00d68f' : '#ff3d71' }}>
                  {g.variation_ca > 0 ? '↑' : '↓'} {Math.abs(g.variation_ca)}%
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ color: '#8a8a9a', fontSize: 10, marginBottom: 2 }}>CA Collecte</div>
                <div style={{ fontWeight: 700, color: '#FF6900', fontSize: 13 }}>{formatCA(g.ca_total)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ color: '#8a8a9a', fontSize: 10, marginBottom: 2 }}>Taux Recouvrement</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}><TauxBadge taux={g.taux_recouvrement} /></div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ color: '#8a8a9a', fontSize: 10, marginBottom: 2 }}>Envoye</div>
                <div style={{ fontWeight: 700, color: '#4a9eff', fontSize: 12 }}>{formatCA(g.montant_envoye)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ color: '#8a8a9a', fontSize: 10, marginBottom: 2 }}>Recupere</div>
                <div style={{ fontWeight: 700, color: '#00d68f', fontSize: 12 }}>{formatCA(g.montant_recupere)}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, fontSize: 11 }}>
              <span style={{ color: '#00d68f', fontWeight: 600 }}>{g.nb_actifs} actifs</span>
              <span style={{ color: '#8a8a9a' }}>|</span>
              <span style={{ color: '#ff3d71', fontWeight: 600 }}>{g.nb_inactifs} inactifs</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Comparaison CA Collecte par Gestionnaire</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={list.slice(0, 10)} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="gestionnaire" stroke="#8a8a9a" angle={-35} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
            <YAxis stroke="#8a8a9a" />
            <Tooltip contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="ca_total" name="CA Collecte" fill="#FF6900" radius={[6,6,0,0]} />
            <Bar dataKey="montant_recupere" name="Recupere" fill="#00d68f" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default VueEnsemble;
