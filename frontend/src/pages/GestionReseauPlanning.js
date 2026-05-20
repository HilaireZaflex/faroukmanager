import React, { useState } from 'react';
import { useQuery } from 'react-query';
import api from '../services/api';
import PDVCell from '../components/common/PDVCell';

const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
const NOW = new Date();
const NOW_YEAR = NOW.getFullYear();
const NOW_MONTH = NOW.getMonth() + 1;
const NOW_WEEK = Math.ceil((((NOW - new Date(NOW.getFullYear(), 0, 1)) / 86400000) + new Date(NOW.getFullYear(), 0, 1).getDay() + 1) / 7);

function formatCA(v) {
  if (!v) return '0';
  if (v >= 1000000) return (v/1000000).toFixed(1) + ' M';
  if (v >= 1000) return (v/1000).toFixed(0) + ' K';
  return String(Math.round(v));
}

// Génère une liste de visites prioritaires à partir des PDVs inactifs et en risque
function PlanningTournees() {
  const [gestionnaire, setGestionnaire] = useState('');
  const [zone, setZone] = useState('');
  const annee = NOW_YEAR;
  const mois = NOW_MONTH;

  const { data: gests } = useQuery('gestionnaires-list',
    () => api.get('/gestionnaires/').then(r => r.data), { staleTime: 300000 });

  const { data: inactifData, isLoading: loadingInactifs } = useQuery(
    ['planning-inactifs', annee, NOW_WEEK],
    () => api.get('/alerts/inactive', { params: { annee, semaine: NOW_WEEK } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const { data: decliningData, isLoading: loadingDeclin } = useQuery(
    ['planning-declining', annee, NOW_WEEK],
    () => api.get('/alerts/declining', { params: { annee, semaine: NOW_WEEK, seuil: 15 } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const isLoading = loadingInactifs || loadingDeclin;

  // Construire liste visites prioritaires
  const inactifs = (inactifData?.pdvs || []).filter(p =>
    (!gestionnaire || p.gestionnaire === gestionnaire) &&
    (!zone || p.zone === zone)
  );
  const declining = (decliningData?.pdvs || []).filter(p =>
    (!gestionnaire || p.gestionnaire === gestionnaire) &&
    (!zone || p.zone === zone)
  );

  const visitesPrioritaires = [
    ...inactifs.filter(p => p.semaines_consecutives_inactif >= 3).map(p => ({
      ...p, priorite: 'CRITIQUE', raison: `Inactif ${p.semaines_consecutives_inactif} semaines`, couleur: '#ff4757'
    })),
    ...inactifs.filter(p => p.semaines_consecutives_inactif === 2).map(p => ({
      ...p, priorite: 'HAUTE', raison: `Inactif 2 semaines`, couleur: '#ffa502'
    })),
    ...declining.filter(p => p.score_risque >= 70 && !inactifs.find(i => i.id === p.id)).map(p => ({
      ...p, priorite: 'HAUTE', raison: `Baisse CA ${Math.abs(p.variation_ca || 0).toFixed(1)}%`, couleur: '#ffa502'
    })),
    ...inactifs.filter(p => p.semaines_consecutives_inactif === 1).map(p => ({
      ...p, priorite: 'NORMALE', raison: `Inactif 1 semaine`, couleur: '#2ed573'
    })),
    ...declining.filter(p => p.score_risque < 70 && !inactifs.find(i => i.id === p.id)).map(p => ({
      ...p, priorite: 'NORMALE', raison: `Baisse CA faible`, couleur: '#2ed573'
    })),
  ].slice(0, 100);

  const zones = [...new Set((inactifData?.pdvs || []).map(p => p.zone).filter(Boolean))].sort();
  const critiques = visitesPrioritaires.filter(v => v.priorite === 'CRITIQUE');
  const hautes = visitesPrioritaires.filter(v => v.priorite === 'HAUTE');
  const normales = visitesPrioritaires.filter(v => v.priorite === 'NORMALE');

  const exportExcel = () => {
    import('xlsx').then(XLSX => {
      const rows = visitesPrioritaires.map((p, i) => ({
        'N°': i+1,
        'PDV': p.nom,
        'Zone': p.zone || '—',
        'Gestionnaire': p.gestionnaire || '—',
        'Superviseur': p.superviseur || '—',
        'Priorite': p.priorite,
        'Raison': p.raison,
        'Telephone': p.telephone || '—',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Planning Visites');
      XLSX.writeFile(wb, `planning_visites_sem${NOW_WEEK}_${NOW_YEAR}.xlsx`);
    });
  };

  const exportPDF = () => {
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Planning Visites — Semaine ${NOW_WEEK} ${NOW_YEAR}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:30px;color:#111;max-width:900px;margin:0 auto}
        h1{color:#FF6900;font-size:20px} p{color:#666;font-size:12px;margin-top:0}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
        th{background:#FF6900;color:#fff;padding:8px 10px;text-align:left}
        td{padding:8px 10px;border-bottom:1px solid #eee}
        .CRITIQUE{color:#ff4757;font-weight:700} .HAUTE{color:#ffa502;font-weight:700} .NORMALE{color:#2ed573}
        @media print{button{display:none}}
      </style></head><body>
      <button onclick="window.print()" style="background:#FF6900;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;margin-bottom:16px">Imprimer / PDF</button>
      <h1>Planning des Visites — Semaine ${NOW_WEEK} / ${NOW_YEAR}</h1>
      <p>Généré le ${new Date().toLocaleDateString('fr-FR')} · ${critiques.length} critiques · ${hautes.length} hautes · ${normales.length} normales</p>
      <table><tr><th>#</th><th>PDV</th><th>Zone</th><th>Gestionnaire</th><th>Priorité</th><th>Raison</th></tr>
      ${visitesPrioritaires.map((p,i) => `
        <tr><td>${i+1}</td><td><strong>${p.nom}</strong></td><td>${p.zone||'—'}</td>
        <td>${p.gestionnaire||'—'}</td>
        <td class="${p.priorite}">${p.priorite}</td>
        <td>${p.raison}</td></tr>`).join('')}
      </table></body></html>`);
    w.document.close();
  };

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Visites Critiques', value: critiques.length, color: '#ff4757', sub: 'Inactifs 3+ semaines' },
          { label: 'Visites Hautes', value: hautes.length, color: '#ffa502', sub: 'Inactifs 2 sem. / forte baisse' },
          { label: 'Visites Normales', value: normales.length, color: '#2ed573', sub: 'Inactifs 1 sem. / baisse légère' },
        ].map(k => (
          <div key={k.label} className="card" style={{ textAlign: 'center', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ color: '#8a8a9a', fontSize: 11, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontWeight: 800, fontSize: 26, color: k.color }}>{k.value}</div>
            <div style={{ color: '#8a8a9a', fontSize: 10, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtres + Export */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={zone} onChange={e => setZone(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">Toutes les zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={gestionnaire} onChange={e => setGestionnaire(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          <option value="">Tous les gestionnaires</option>
          {(Array.isArray(gests) ? gests : []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={exportExcel}
            style={{ background: 'rgba(0,214,143,0.15)', color: '#00d68f', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Excel
          </button>
          <button onClick={exportPDF}
            style={{ background: 'rgba(255,105,0,0.15)', color: '#FF6900', border: '1px solid rgba(255,105,0,0.3)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Génération du planning...</div>
      ) : visitesPrioritaires.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'rgba(46,213,115,0.05)', borderRadius: 12, border: '1px solid rgba(46,213,115,0.2)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ color: '#2ed573', fontWeight: 700 }}>Aucune visite prioritaire cette semaine !</div>
        </div>
      ) : (
        <div className="card table-wrapper">
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            Planning Semaine {NOW_WEEK} / {NOW_YEAR} — {visitesPrioritaires.length} visites à effectuer
          </h3>
          <table>
            <thead>
              <tr>
                <th>#</th><th>PDV</th><th>Zone</th><th>Gestionnaire</th>
                <th>Superviseur</th><th>Priorité</th><th>Raison</th>
              </tr>
            </thead>
            <tbody>
              {visitesPrioritaires.map((p, i) => (
                <tr key={i}>
                  <td style={{ color: '#8a8a9a', fontSize: 11 }}>{i+1}</td>
                  <td><PDVCell nom={p.nom} numero={p.numero_pdv} /></td>
                  <td style={{ color: '#8a8a9a', fontSize: 12 }}>{p.zone || '—'}</td>
                  <td style={{ fontSize: 12 }}>{p.gestionnaire || '—'}</td>
                  <td style={{ fontSize: 12 }}>{p.superviseur || '—'}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                      background: p.couleur + '22', color: p.couleur }}>
                      {p.priorite}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: '#8a8a9a' }}>{p.raison}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Historique des visites (actions terrain déjà effectuées)
function HistoriqueVisites() {
  const { data: actionsData, isLoading } = useQuery(
    'actions-terrain',
    () => api.get('/alerts/actions').then(r => r.data).catch(() => []),
    { staleTime: 60000 }
  );

  const actions = Array.isArray(actionsData) ? actionsData : (actionsData?.actions || []);

  const TYPE_COLORS = { appel: '#4a9eff', visite: '#FF6900', whatsapp: '#2ed573' };
  const RESULTAT_COLORS = { succes: '#2ed573', echec: '#ff4757', non_joint: '#ffa502' };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8a9a' }}>Chargement...</div>;

  if (!actions.length) return (
    <div style={{ textAlign: 'center', padding: 40, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.1)' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
      <div style={{ color: '#8a8a9a', fontSize: 14 }}>Aucune visite enregistrée pour l'instant</div>
      <p style={{ color: '#8a8a9a', fontSize: 12, marginTop: 8 }}>Les visites effectuées depuis la page Alertes apparaitront ici.</p>
    </div>
  );

  return (
    <div className="card table-wrapper">
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
        Historique des visites — {actions.length} actions enregistrées
      </h3>
      <table>
        <thead>
          <tr><th>Date</th><th>PDV</th><th>Zone</th><th>Type</th><th>Résultat</th><th>Notes</th></tr>
        </thead>
        <tbody>
          {actions.slice(0, 100).map((a, i) => (
            <tr key={i}>
              <td style={{ fontSize: 11, color: '#8a8a9a' }}>{a.date_action ? new Date(a.date_action).toLocaleDateString('fr-FR') : '—'}</td>
              <td><PDVCell nom={a.pdv_nom || a.pdv?.nom} numero={a.numero_pdv} /></td>
              <td style={{ color: '#8a8a9a', fontSize: 12 }}>{a.zone || a.pdv?.zone || '—'}</td>
              <td>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                  background: (TYPE_COLORS[a.type_action] || '#8a8a9a') + '22',
                  color: TYPE_COLORS[a.type_action] || '#8a8a9a' }}>
                  {a.type_action || '—'}
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                  background: (RESULTAT_COLORS[a.resultat] || '#8a8a9a') + '22',
                  color: RESULTAT_COLORS[a.resultat] || '#8a8a9a' }}>
                  {a.resultat || '—'}
                </span>
              </td>
              <td style={{ fontSize: 12, color: '#8a8a9a', maxWidth: 200 }}>{a.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OngletPlanning() {
  const [subTab, setSubTab] = useState('tournees');

  const subTabs = [
    { key: 'tournees',   label: 'Planning des tournees' },
    { key: 'historique', label: 'Historique des visites' },
  ];

  return (
    <div>
      <div style={{ background: 'rgba(255,105,0,0.06)', border: '1px solid rgba(255,105,0,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: '#8a8a9a' }}>
        Le planning est généré automatiquement chaque semaine selon les PDVs inactifs et en baisse de CA. Les visites critiques doivent être effectuées en priorité.
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '4px' }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: subTab === t.key ? '#FF6900' : 'transparent',
              color: subTab === t.key ? '#fff' : '#8a8a9a', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'tournees'   && <PlanningTournees />}
      {subTab === 'historique' && <HistoriqueVisites />}
    </div>
  );
}
