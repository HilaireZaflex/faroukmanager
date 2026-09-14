/**
 * MesAppelsPage — Vue PERSONNELLE de la téléconseillère connectée.
 * Affiche uniquement ses propres appels, ses PDV assignés et ses résultats du mois.
 * Source : GET /api/tc/mes-stats (données filtrées par le compte connecté).
 */
import React from 'react';
import { useQuery } from 'react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../services/api';

const MOIS_NOMS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const IND_COLORS = { OMY: '#a29bfe', NAFAMA: '#00cec9', KAABU: '#fdcb6e', AUTRE: '#64748b' };

const STATUT_ICONS = {
  JOIGNABLE_PROMESSE: '✅', JOIGNABLE_PAS_INTERESSE: '📞', JOIGNABLE_DEJA_ACTIF: '🔄',
  NON_JOIGNABLE_PAS_REPONSE: '🔕', NON_JOIGNABLE_HORS_ZONE: '📵',
  NUMERO_INCORRECT: '❌', RAPPEL_PROGRAMME: '📅', PDV_FERME: '🏪',
};

function KPI({ icon, label, value, sub, color }) {
  return (
    <div style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderTop: `3px solid ${color}`, borderRadius: 14 }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Barre({ taux, color }) {
  const c = color || '#FF6900';
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', background: c, width: `${Math.min(100, taux || 0)}%`, transition: 'width 0.5s', borderRadius: 3 }} />
    </div>
  );
}

export default function MesAppelsPage() {
  const { data, isLoading, isError } = useQuery(
    'tc-mes-stats',
    () => api.get('/tc/mes-stats').then(r => r.data),
    { staleTime: 60000 }
  );

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div className="loading-spinner" />
      <p style={{ color: '#8a8a9a' }}>Chargement de vos statistiques...</p>
    </div>
  );

  if (isError || !data) return (
    <div className="page">
      <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ marginTop: 12 }}>Impossible de charger vos statistiques.</div>
      </div>
    </div>
  );

  const d = data;
  const progression = d.pdvs_assignes > 0 ? Math.round(d.pdvs_appeles_mois / d.pdvs_assignes * 100) : 0;
  const indicData = Object.entries(d.par_indicateur || {}).map(([k, v]) => ({ name: k, valeur: v, color: IND_COLORS[k] || '#64748b' }));
  const statutData = Object.entries(d.par_statut || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">📈 Mes appels</h1>
          <p style={{ color: '#8a8a9a', fontSize: 13, marginTop: 4 }}>
            {MOIS_NOMS[d.mois]} {d.annee} · {d.appels_mois} appel(s) ce mois · {d.appels_total} au total
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 24 }}>
        <KPI icon="📞" label="Appels ce mois" value={d.appels_mois} sub={`${d.appels_aujourd_hui} aujourd'hui`} color="#3742fa" />
        <KPI icon="✅" label="Taux de joignabilité" value={`${d.taux_joignabilite}%`} sub={`${d.joignables} joignables`} color={d.taux_joignabilite >= 50 ? '#22c55e' : '#ffa502'} />
        <KPI icon="🤝" label="Promesses de reprise" value={d.promesses} sub="ce mois" color="#00d68f" />
        <KPI icon="📅" label="Rappels programmés" value={d.rappels} sub="ce mois" color="#a29bfe" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Progression PDV */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>🎯 Mes PDV appelés ce mois</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#FF6900' }}>{d.pdvs_appeles_mois}</span>
            <span style={{ fontSize: 14, color: '#64748b' }}>/ {d.pdvs_assignes} PDV assignés</span>
          </div>
          <Barre taux={progression} />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{progression}% de mes PDV traités</div>
        </div>

        {/* Répartition par indicateur */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>📊 Mes appels par indicateur</h3>
          {indicData.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Aucun appel ce mois</div>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={indicData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8a8a9a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#8a8a9a', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Bar dataKey="valeur" name="Appels" radius={[0, 4, 4, 0]}>
                  {indicData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Résultats par statut */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>📋 Mes résultats du mois</h3>
        {statutData.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 16 }}>Aucun résultat enregistré ce mois</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {statutData.map(([statut, cnt]) => (
              <span key={statut} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 10, fontWeight: 700,
                background: 'rgba(255,255,255,0.04)', color: '#ccc' }}>
                {STATUT_ICONS[statut] || '📞'} {statut.replace(/_/g, ' ')} : {cnt}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Derniers appels */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <div style={{ padding: '16px 20px 0', fontSize: 14, fontWeight: 800 }}>🕓 Mes 10 derniers appels</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              {['Date', 'PDV', 'Indicateur', 'Résultat'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d.derniers_appels || []).length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Aucun appel enregistré</td></tr>
            ) : (d.derniers_appels || []).map((a, i) => (
              <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '9px 14px', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{a.created_at ? new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td style={{ padding: '9px 14px' }}>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{a.nom_pdv || a.numero_pdv}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{a.numero_pdv}</div>
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                    background: `${IND_COLORS[a.indicateur] || '#64748b'}20`, color: IND_COLORS[a.indicateur] || '#64748b' }}>
                    {a.indicateur}
                  </span>
                </td>
                <td style={{ padding: '9px 14px', fontSize: 11, color: '#ccc' }}>
                  {STATUT_ICONS[a.statut] || '📞'} {(a.statut_label || a.statut || '').replace(/_/g, ' ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
