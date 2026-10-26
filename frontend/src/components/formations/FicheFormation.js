import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import api from '../../services/api';
import EditeurFormation from './EditeurFormation';
import {
  ALERTES, infoStatut, fmtDate, fmtDateLongue, tauxCouleur, styleChamp, Barre, LIBELLE_EVAL,
} from './commun';

// ─────────────────────────────────────────────────────────────────────────────
// Fiche individuelle — remplace la feuille « FICHE INDIVIDUELLE » d'Excel.
// On choisit un agent, tout s'affiche automatiquement : identité, avancement,
// parcours complet, historique et fiche imprimable.
// ─────────────────────────────────────────────────────────────────────────────

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function imprimerFiche(d) {
  const alerte = ALERTES[d.alerte] || ALERTES.A_JOUR;
  const lignes = (d.parcours || []).map(p => {
    const st = p.statut ? infoStatut(p.statut) : null;
    return `<tr>
      <td>${esc(p.module_nom)}</td>
      <td style="color:${st ? st.couleur : '#999'};font-weight:700">${st ? esc(st.label) : 'Non formé'}</td>
      <td>${p.date_session ? esc(fmtDateLongue(p.date_session)) : '—'}</td>
      <td>${esc(p.evaluation ? (LIBELLE_EVAL[p.evaluation] || p.evaluation) : '—')}</td>
      <td>${p.note != null ? esc(p.note) + ' / 20' : '—'}</td>
      <td style="font-size:10px;color:#666">${esc(p.observation || '')}</td>
    </tr>`;
  }).join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <title>Fiche de formation — ${esc(d.nom)}</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: Inter, Arial, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0; }
    .sub { color: #666; font-size: 11px; margin-top: 2px; }
    .entete { display: flex; justify-content: space-between; align-items: flex-start;
              border-bottom: 3px solid #FF6900; padding-bottom: 10px; margin-bottom: 16px; }
    .bloc { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .bloc div { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
    .bloc span { display: block; color: #777; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }
    .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .kpi div { border: 1px solid #ddd; border-left: 3px solid #FF6900; border-radius: 6px; padding: 8px 10px; }
    .kpi b { font-size: 18px; }
    .alerte { padding: 8px 12px; border-radius: 6px; font-weight: 700; margin-bottom: 16px;
              border: 1px solid ${alerte.couleur}; color: ${alerte.couleur}; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { text-align: left; background: #f4f4f4; padding: 6px; border-bottom: 2px solid #ddd; font-size: 9px;
         text-transform: uppercase; letter-spacing: .4px; }
    td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
    .pied { margin-top: 22px; display: flex; justify-content: space-between; color: #666; font-size: 10px; }
    .signature { margin-top: 28px; display: flex; gap: 40px; }
    .signature div { flex: 1; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; color: #666; }
  </style></head><body>
    <div class="entete">
      <div>
        <h1>FICHE INDIVIDUELLE DE FORMATION</h1>
        <div class="sub">Farouk Distribution — ${esc(d.nom)} (${esc(d.matricule)})</div>
      </div>
      <div class="sub">Éditée le ${new Date().toLocaleDateString('fr-FR')}</div>
    </div>

    <div class="bloc">
      <div><span>Matricule</span>${esc(d.matricule)}</div>
      <div><span>Téléphone</span>${esc(d.telephone || '—')}</div>
      <div><span>Poste</span>${esc(d.poste || '—')}</div>
      <div><span>Groupe</span>${esc(d.groupe || '—')}</div>
      <div><span>Gestionnaire</span>${esc(d.gestionnaire || '—')}</div>
      <div><span>Agence / Point Hub</span>${esc(d.agence || '—')}</div>
    </div>

    <div class="kpi">
      <div><span>Modules validés</span><b>${d.nb_valides} / ${d.nb_modules}</b></div>
      <div><span>Taux de validation</span><b>${d.taux_validation} %</b></div>
      <div><span>À reformer</span><b>${d.nb_a_reformer}</b></div>
      <div><span>Dernière formation</span><b>${d.derniere_formation ? esc(fmtDateLongue(d.derniere_formation)) : '—'}</b></div>
    </div>

    <div class="alerte">${alerte.icone} ${esc(alerte.label)}${d.nb_non_formes ? ` — ${d.nb_non_formes} module(s) non formé(s)` : ''}</div>

    <table>
      <thead><tr><th>Module</th><th>Statut</th><th>Date</th><th>Évaluation</th><th>Note</th><th>Observation</th></tr></thead>
      <tbody>${lignes}</tbody>
    </table>

    <div class="signature">
      <div>Le collaborateur</div>
      <div>Le responsable formation</div>
    </div>
    <div class="pied">
      <span>Farouk Distribution — Suivi Formation</span>
      <span>Document généré automatiquement par FaroukManager</span>
    </div>
  </body></html>`;

  const fenetre = window.open('', '_blank');
  if (!fenetre) {
    alert("Autorisez les fenêtres pop-up pour imprimer la fiche.");
    return;
  }
  fenetre.document.write(html);
  fenetre.document.close();
  fenetre.focus();
  setTimeout(() => fenetre.print(), 350);
}

export default function FicheFormation({ agentInitial = null }) {
  const qc = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState(agentInitial);
  const [edition, setEdition] = useState(null);

  useEffect(() => { if (agentInitial) setSelection(agentInitial); }, [agentInitial]);

  const { data: resultats } = useQuery(
    ['formations-recherche', recherche],
    () => api.get('/formations/personnel', { params: { search: recherche.trim(), limit: 15 } }).then(r => r.data),
    { enabled: recherche.trim().length >= 2, staleTime: 30000 }
  );

  const { data: tous } = useQuery('formations-tous',
    () => api.get('/formations/personnel', { params: { limit: 2000 } }).then(r => r.data),
    { enabled: !selection, staleTime: 120000 });

  const { data: fiche, isLoading } = useQuery(
    ['formations-fiche', selection],
    () => api.get(`/formations/personnel/${selection}`).then(r => r.data),
    { enabled: !!selection, staleTime: 0 }
  );

  const alerte = fiche ? (ALERTES[fiche.alerte] || ALERTES.A_JOUR) : null;

  const rafraichir = () => {
    qc.invalidateQueries('formations-fiche');
    qc.invalidateQueries('formations-matrice');
    qc.invalidateQueries('formations-resume');
    qc.invalidateQueries('formations-personnel');
  };

  // ── Sélection de l'agent ──
  if (!selection) {
    const agents = tous?.items || [];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>

        {/* ── Mode 1 : saisir ── */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            ⌨️ Saisir
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Tapez au moins 2 lettres : nom, matricule ou téléphone.
          </div>

          <input autoFocus placeholder="Ex. KONATE, FRK-061, 72460131…"
            value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ ...styleChamp, fontSize: 15 }} />

          {recherche.trim().length >= 2 && (
            <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {(resultats?.items || []).length === 0 && (
                <div style={{ padding: 14, fontSize: 12.5, color: 'var(--text-secondary)' }}>Aucun agent trouvé.</div>
              )}
              {(resultats?.items || []).map(p => (
                <button key={p.id} onClick={() => { setSelection(p.id); setRecherche(''); }}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '11px 14px',
                    background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                    color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontSize: 13,
                  }}>
                  <span style={{ fontWeight: 800, color: 'var(--primary)', minWidth: 74 }}>{p.matricule}</span>
                  <span style={{ flex: 1 }}>{p.nom}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {p.poste || '—'} · {p.nb_valides}/{p.nb_modules}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Mode 2 : sélectionner dans la liste ── */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            📋 Sélectionner dans la liste
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Parcourez les {agents.length} collaborateurs et choisissez-en un.
          </div>

          <select value="" onChange={e => { if (e.target.value) setSelection(Number(e.target.value)); }}
            style={{ ...styleChamp, fontSize: 14, padding: '12px' }}>
            <option value="">— Choisir un collaborateur —</option>
            {agents.map(p => (
              <option key={p.id} value={p.id}>
                {p.matricule} — {p.nom}{p.poste ? ` (${p.poste})` : ''}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 14, padding: '12px 14px', border: '1px dashed var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Astuce : les deux méthodes fonctionnent à tout moment. Vous pouvez aussi
            ouvrir une fiche directement depuis l'onglet <strong>Personnel</strong> (bouton 🪪)
            ou depuis <strong>Pilotage</strong>.
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !fiche) {
    return <div className="empty-state">Chargement de la fiche…</div>;
  }

  // ── Fiche ──
  return (
    <div>
      {/* Barre d'action */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={() => setSelection(null)}>← Changer de collaborateur</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={() => imprimerFiche(fiche)}>🖨️ Imprimer / PDF</button>
      </div>

      {/* Identité */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>{fiche.nom}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
              {fiche.matricule} · {fiche.poste || '—'} · {fiche.groupe || '—'}
            </div>
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: 999, fontWeight: 800, fontSize: 12.5,
            color: alerte.couleur, background: `${alerte.couleur}1f`, border: `1px solid ${alerte.couleur}55`,
          }}>
            {alerte.icone} {alerte.label}
            {fiche.nb_non_formes > 0 && ` · ${fiche.nb_non_formes} non formé(s)`}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
          {[
            ['Téléphone', fiche.telephone || '—'],
            ['Gestionnaire', fiche.gestionnaire || '—'],
            ['Agence / Point Hub', fiche.agence || '—'],
            ['Évaluation globale', fiche.evaluation_globale
              ? `${LIBELLE_EVAL[fiche.evaluation_globale] || fiche.evaluation_globale}${fiche.note_globale != null ? ` · ${fiche.note_globale}/20` : ''}`
              : '—'],
          ].map(([label, valeur]) => (
            <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>{label}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{valeur}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          ['Modules validés', `${fiche.nb_valides} / ${fiche.nb_modules}`, '#00d68f'],
          ['Taux de validation', `${fiche.taux_validation} %`, tauxCouleur(fiche.taux_validation)],
          ['À reformer', fiche.nb_a_reformer, '#ff4757'],
          ['Dernière formation', fiche.derniere_formation ? fmtDate(fiche.derniere_formation) : '—', '#4a9eff'],
        ].map(([label, valeur, couleur]) => (
          <div key={label} className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${couleur}` }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: couleur, marginTop: 4 }}>{valeur}</div>
          </div>
        ))}
      </div>

      {/* Parcours */}
      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 16 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
          Parcours de formation du collaborateur
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Module', 'Statut', 'Date', 'Évaluation', 'Observation', ''].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 12px', fontSize: 10, textTransform: 'uppercase',
                  letterSpacing: 0.4, color: 'var(--text-secondary)', fontWeight: 800,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(fiche.parcours || []).map(p => {
              const st = p.statut ? infoStatut(p.statut) : null;
              return (
                <tr key={p.module_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{p.module_nom}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {st
                      ? <span style={{ color: st.couleur, fontWeight: 700 }}>{st.label}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>Non formé</span>}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {p.date_session ? fmtDate(p.date_session) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                    {p.evaluation ? (LIBELLE_EVAL[p.evaluation] || p.evaluation) : '—'}
                    {p.note != null && <span style={{ color: 'var(--text-muted)' }}> · {p.note}/20</span>}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 11.5, maxWidth: 260 }}>
                    {p.observation || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setEdition({ module: { id: p.module_id, nom: p.module_nom }, cellule: p })}>
                      {p.session_id ? '✏️ Modifier' : '➕ Saisir'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Historique */}
      {(fiche.historique || []).length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
            Historique complet ({fiche.historique.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {fiche.historique.map(h => (
                <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{h.module_nom}</td>
                  <td style={{ padding: '9px 12px', color: infoStatut(h.statut).couleur }}>{infoStatut(h.statut).label}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{fmtDate(h.date_session) || 'sans date'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 11.5 }}>{h.observation || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edition && (
        <EditeurFormation
          personne={{ id: fiche.id, nom: fiche.nom, matricule: fiche.matricule }}
          module={edition.module}
          cellule={edition.cellule}
          onClose={() => setEdition(null)}
          onSaved={() => { setEdition(null); rafraichir(); }}
        />
      )}
    </div>
  );
}
