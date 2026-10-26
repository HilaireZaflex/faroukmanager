import React, { useState } from 'react';
import { useQuery } from 'react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { ALERTES, tauxCouleur, styleChamp, Barre } from './commun';

// ─────────────────────────────────────────────────────────────────────────────
// Pilotage de la formation : couverture par module / groupe / poste,
// liste des agents à relancer et export Excel.
// ─────────────────────────────────────────────────────────────────────────────

const FILTRES_ALERTE = [
  { id: null,             label: 'Tous' },
  { id: 'ACTION_REQUISE', label: '⚠️ Action requise' },
  { id: 'SUIVI_EN_COURS', label: '⏳ Suivi en cours' },
  { id: 'INCOMPLET',      label: '📘 Incomplet' },
  { id: 'A_JOUR',         label: '✅ À jour' },
];

const Kpi = ({ label, valeur, sous, couleur }) => (
  <div className="card" style={{ padding: '16px 18px', borderLeft: `3px solid ${couleur}` }}>
    <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color: couleur, marginTop: 4 }}>{valeur}</div>
    {sous && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sous}</div>}
  </div>
);

const LigneCouverture = ({ titre, taux, sous }) => (
  <div style={{ marginBottom: 11 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
      <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
        {titre}
      </span>
      <span style={{ color: tauxCouleur(taux), fontWeight: 800, whiteSpace: 'nowrap' }}>{taux} %</span>
    </div>
    <Barre pct={taux} couleur={tauxCouleur(taux)} />
    {sous && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>{sous}</div>}
  </div>
);

export default function PilotageFormation({ onOuvrirFiche }) {
  const [typeAlerte, setTypeAlerte] = useState(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [vueGroupement, setVueGroupement] = useState('groupe');

  const { data: board, isLoading } = useQuery('formations-dashboard',
    () => api.get('/formations/dashboard').then(r => r.data), { staleTime: 60000 });

  const { data: alertes } = useQuery(['formations-alertes', typeAlerte],
    () => api.get('/formations/alertes', { params: { type: typeAlerte || undefined } }).then(r => r.data),
    { staleTime: 60000 });

  const k = board?.kpis || {};
  const groupements = vueGroupement === 'groupe' ? (board?.par_groupe || []) : (board?.par_poste || []);

  const exporter = async () => {
    setExportEnCours(true);
    try {
      const r = await api.get('/formations/export.xlsx', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `suivi_formation_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export Excel téléchargé');
    } catch (e) {
      toast.error("Export impossible");
    } finally {
      setExportEnCours(false);
    }
  };

  if (isLoading) return <div className="empty-state">Chargement du pilotage…</div>;

  return (
    <div>
      {/* ── Bandeau ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Vue d'ensemble de la formation — {k.nb_personnel} agents · {k.nb_modules} modules
        </div>
        <button className="btn btn-primary" onClick={exporter} disabled={exportEnCours}>
          {exportEnCours ? '⏳ Export…' : '📊 Exporter en Excel'}
        </button>
      </div>

      {/* ── KPI ── */}
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <Kpi label="Taux global" valeur={`${k.taux_global ?? 0} %`}
          sous={`${k.nb_valides ?? 0} / ${k.nb_attendus ?? 0} modules`} couleur={tauxCouleur(k.taux_global || 0)} />
        <Kpi label="Agents à jour" valeur={k.nb_a_jour ?? 0}
          sous="parcours complet" couleur="#00d68f" />
        <Kpi label="Parcours incomplet" valeur={k.nb_incomplet ?? 0}
          sous="des modules manquent" couleur="#4a9eff" />
        <Kpi label="Action requise" valeur={k.nb_action ?? 0}
          sous="modules à reformer" couleur="#ff4757" />
      </div>

      {/* ── Couverture par module ── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14 }}>
          Couverture par module
        </div>
        {(board?.par_module || []).map(m => (
          <LigneCouverture key={m.id} titre={m.nom} taux={m.taux}
            sous={`${m.nb_valides} validé(s) · ${m.nb_non_formes} non formé(s)${m.nb_a_reformer ? ` · ${m.nb_a_reformer} à reformer` : ''}`} />
        ))}
      </div>

      {/* ── Couverture par groupe / poste ── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
            Couverture par {vueGroupement}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['groupe', 'Groupes'], ['poste', 'Postes']].map(([id, label]) => (
              <button key={id} onClick={() => setVueGroupement(id)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${vueGroupement === id ? 'var(--primary)' : 'var(--border)'}`,
                  background: vueGroupement === id ? 'var(--primary-glow)' : 'transparent',
                  color: vueGroupement === id ? 'var(--primary)' : 'var(--text-secondary)',
                }}>{label}</button>
            ))}
          </div>
        </div>
        {groupements.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Aucune donnée.</div>
        )}
        {groupements.map(g => (
          <LigneCouverture key={g.cle} titre={g.cle} taux={g.taux}
            sous={`${g.nb_personnes} agent(s) · ${g.valides} validé(s) sur ${g.attendu}`} />
        ))}
      </div>

      {/* ── Agents à relancer ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
            Agents à relancer {alertes ? `(${alertes.total})` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTRES_ALERTE.map(f => (
              <button key={String(f.id)} onClick={() => setTypeAlerte(f.id)}
                style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${typeAlerte === f.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: typeAlerte === f.id ? 'var(--primary-glow)' : 'transparent',
                  color: typeAlerte === f.id ? 'var(--primary)' : 'var(--text-secondary)',
                }}>{f.label}
                {f.id && alertes?.compteurs ? ` (${alertes.compteurs[f.id] || 0})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxHeight: 460, overflowY: 'auto' }}>
          {(alertes?.items || []).map(a => {
            const infos = ALERTES[a.alerte] || ALERTES.A_JOUR;
            return (
              <div key={a.id} style={{
                display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0',
                borderBottom: '1px solid var(--border)', fontSize: 12.5,
              }}>
                <span style={{ width: 96, color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{a.matricule}</span>
                <span style={{ flex: '0 0 200px', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nom}</span>
                <span style={{ flex: '0 0 110px', color: 'var(--text-secondary)', fontSize: 11.5 }}>{a.poste || '—'}</span>
                <span style={{ flex: 1, color: 'var(--text-muted)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.modules_a_reformer.length > 0 && <span style={{ color: '#ff4757' }}>À reformer : {a.modules_a_reformer.join(', ')}</span>}
                  {a.modules_a_reformer.length > 0 && a.modules_manquants.length > 0 && ' · '}
                  {a.modules_manquants.length > 0 && `Manque : ${a.modules_manquants.slice(0, 3).join(', ')}${a.modules_manquants.length > 3 ? '…' : ''}`}
                </span>
                <span style={{ width: 62, textAlign: 'right', fontWeight: 800, color: tauxCouleur(a.taux) }}>{a.taux} %</span>
                <span style={{ width: 110, textAlign: 'center', color: infos.couleur, fontSize: 11, whiteSpace: 'nowrap' }}>{infos.icone} {infos.label}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => onOuvrirFiche && onOuvrirFiche(a.id)}>🪪</button>
              </div>
            );
          })}
          {(alertes?.items || []).length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: 10 }}>Aucun agent dans cette catégorie. ✅</div>
          )}
        </div>
      </div>
    </div>
  );
}
