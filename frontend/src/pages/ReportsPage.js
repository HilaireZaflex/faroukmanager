import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { FileText, Download, BarChart3, Calendar, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import toast from 'react-hot-toast';

const MOIS_NOMS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function formatCA(v) {
  if (!v) return '0 FCFA';
  if (v >= 1_000_000_000) return `${(v/1_000_000_000).toFixed(2)} Md FCFA`;
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)} M FCFA`;
  if (v >= 1_000) return `${(v/1_000).toFixed(0)} K FCFA`;
  return `${v.toLocaleString('en-US').replace(/,/g, ' ')} FCFA`;
}

export default function ReportsPage() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [mois, setMois] = useState(new Date().getMonth() + 1);

  const { data: report, isLoading } = useQuery(
    ['orange-mali-report', annee, mois],
    () => api.get('/reports/orange-mali', { params: { annee, mois } }).then(r => r.data),
    { staleTime: 120000 }
  );

  const { data: roadmap } = useQuery(
    'weekly-roadmap',
    () => api.get('/reports/weekly-roadmap').then(r => r.data),
    { staleTime: 120000 }
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rapports</h1>
          <p className="page-subtitle">Rapports Orange Mali et feuilles de route</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <select value={mois} onChange={e => setMois(Number(e.target.value))} style={{ width:140 }}>
            {MOIS_NOMS.slice(1).map((n,i) => <option key={i+1} value={i+1}>{n}</option>)}
          </select>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={{ width:100 }}>
            {[2024,2025,2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-2">
        {/* Rapport Orange Mali */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
            <div style={{ width:40,height:40,borderRadius:10,background:'var(--primary-glow)',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <BarChart3 size={20} style={{ color:'var(--primary)' }}/>
            </div>
            <div>
              <h3 style={{ fontSize:15, fontWeight:700 }}>Rapport Orange Mali</h3>
              <p style={{ fontSize:12, color:'var(--text-secondary)' }}>{MOIS_NOMS[mois]} {annee}</p>
            </div>
          </div>

          {isLoading ? (
            Array(6).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height:32, marginBottom:10, borderRadius:8 }}/>)
          ) : report ? (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                { label: 'CA Total', value: formatCA(report.total_ca), color:'var(--primary)' },
                { label: 'PDVs Actifs', value: report.pdvs_actifs || '—', color:'var(--success)' },
                { label: 'PDVs Inactifs', value: report.pdvs_inactifs || '—', color:'var(--danger)' },
                { label: 'Taux Activité', value: `${(report.taux_activite||0).toFixed(1)}%`, color:report.taux_activite>=70?'var(--success)':'var(--warning)' },
                { label: 'CA Moyen/PDV', value: formatCA(report.ca_moyen_pdv||report.average_ca), color:'var(--text-primary)' },
                { label: 'Nb Opérations', value: (report.total_operations||0).toLocaleString('en-US').replace(/,/g, ' '), color:'var(--text-primary)' },
              ].map((item,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{item.label}</span>
                  <strong style={{ fontSize:14, color:item.color }}>{item.value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign:'center', color:'var(--text-secondary)', padding:30 }}>Aucune donnée disponible</div>
          )}

          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={async () => {
              if (!report) { toast.error('Aucune donnée à exporter'); return; }
              const rows = [
                { Indicateur: 'CA Total', Valeur: report.total_ca || 0 },
                { Indicateur: 'PDVs Actifs', Valeur: report.pdvs_actifs || 0 },
                { Indicateur: 'PDVs Inactifs', Valeur: report.pdvs_inactifs || 0 },
                { Indicateur: 'Taux Activité (%)', Valeur: (report.taux_activite || 0).toFixed(1) },
                { Indicateur: 'CA Moyen/PDV', Valeur: report.ca_moyen_pdv || report.average_ca || 0 },
                { Indicateur: 'Nb Opérations', Valeur: report.total_operations || 0 },
              ];
              const ws = XLSX.utils.json_to_sheet(rows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, `Rapport ${MOIS_NOMS[mois]} ${annee}`);
              XLSX.writeFile(wb, `rapport_orange_mali_${annee}_${String(mois).padStart(2,'0')}.xlsx`);
              toast.success('Rapport exporté en Excel !');
            }}>
              <Download size={15}/> Excel
            </button>
            <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => {
              if (!report) { toast.error('Aucune donnée à exporter'); return; }
              const w = window.open('', '_blank');
              w.document.write(`
                <html><head><title>Rapport Orange Mali - ${MOIS_NOMS[mois]} ${annee}</title>
                <style>
                  body{font-family:Arial,sans-serif;padding:40px;color:#111;max-width:800px;margin:0 auto}
                  h1{color:#FF6900;font-size:24px;margin-bottom:4px}
                  p{color:#666;font-size:13px;margin-top:0}
                  table{width:100%;border-collapse:collapse;margin-top:24px}
                  th{background:#FF6900;color:#fff;padding:10px 14px;text-align:left;font-size:13px}
                  td{padding:10px 14px;border-bottom:1px solid #eee;font-size:13px}
                  tr:nth-child(even) td{background:#fff8f4}
                  .footer{margin-top:40px;color:#999;font-size:11px;text-align:center}
                  @media print{button{display:none}}
                </style></head>
                <body>
                <button onclick="window.print()" style="background:#FF6900;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;margin-bottom:20px">🖨️ Imprimer / Enregistrer PDF</button>
                <h1>Rapport Orange Mali</h1>
                <p>${MOIS_NOMS[mois]} ${annee} — Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
                <table>
                  <tr><th>Indicateur</th><th>Valeur</th></tr>
                  <tr><td>CA Total</td><td><strong>${formatCA(report.total_ca)}</strong></td></tr>
                  <tr><td>PDVs Actifs</td><td><strong style="color:green">${report.pdvs_actifs || 0}</strong></td></tr>
                  <tr><td>PDVs Inactifs</td><td><strong style="color:red">${report.pdvs_inactifs || 0}</strong></td></tr>
                  <tr><td>Taux Activité</td><td><strong>${(report.taux_activite||0).toFixed(1)}%</strong></td></tr>
                  <tr><td>CA Moyen / PDV</td><td><strong>${formatCA(report.ca_moyen_pdv || report.average_ca)}</strong></td></tr>
                  <tr><td>Nb Opérations</td><td><strong>${(report.total_operations||0).toLocaleString('en-US').replace(/,/g, ' ')}</strong></td></tr>
                </table>
                <div class="footer">FaroukManager — Rapport automatique Orange Mali</div>
                </body></html>`);
              w.document.close();
              toast.success('Aperçu PDF ouvert dans un nouvel onglet');
            }}>
              <Printer size={15}/> PDF
            </button>
          </div>
        </div>

        {/* Feuille de route */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
            <div style={{ width:40,height:40,borderRadius:10,background:'rgba(0,214,143,0.1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Calendar size={20} style={{ color:'var(--success)' }}/>
            </div>
            <div>
              <h3 style={{ fontSize:15, fontWeight:700 }}>Feuille de Route TC</h3>
              <p style={{ fontSize:12, color:'var(--text-secondary)' }}>Programme téléconseillères</p>
            </div>
          </div>

          {roadmap ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {(roadmap.roadmap || roadmap.pdvs_to_contact || []).slice(0,8).map((item,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid var(--border)' }}>
                  <div style={{ width:28,height:28,borderRadius:8,background:'var(--primary-glow)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--primary)',flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1,overflow:'hidden' }}>
                    <div style={{ fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{item.nom||item.name||'PDV'}</div>
                    <div style={{ fontSize:11,color:'var(--text-secondary)' }}>{item.zone||'—'} · {item.telephone||item.superviseur||'—'}</div>
                  </div>
                  <span className={`badge ${item.priorite==='HAUTE'?'badge-danger':item.priorite==='MOYENNE'?'badge-warning':'badge-neutral'}`} style={{ fontSize:10 }}>
                    {item.priorite||'NORMALE'}
                  </span>
                </div>
              ))}
              {(!roadmap.roadmap && !roadmap.pdvs_to_contact) && (
                <div style={{ textAlign:'center', color:'var(--text-secondary)', padding:30, fontSize:13 }}>
                  📋 Feuille de route générée automatiquement<br/>
                  <span style={{ fontSize:12, marginTop:8, display:'block' }}>Basée sur les PDVs inactifs et en baisse</span>
                </div>
              )}
            </div>
          ) : (
            Array(5).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height:50, marginBottom:8, borderRadius:10 }}/>)
          )}

          <button className="btn btn-ghost" style={{ width:'100%', marginTop:20, justifyContent:'center' }} onClick={async () => {
            const items = roadmap?.roadmap || roadmap?.pdvs_to_contact || [];
            if (!items.length) { toast.error('Aucune donnée de feuille de route'); return; }
            const rows = items.map((it, i) => ({
              'N°': i + 1,
              'PDV': it.nom || it.name || '',
              'Zone': it.zone || '',
              'Téléphone': it.telephone || '',
              'Superviseur': it.superviseur || '',
              'Priorité': it.priorite || 'NORMALE',
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Feuille de Route');
            XLSX.writeFile(wb, `feuille_route_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success('Feuille de route exportée !');
          }}>
            <FileText size={15}/> Exporter Feuille de Route (Excel)
          </button>
        </div>
      </div>
    </div>
  );
}
