import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import api from '../../services/api';
import EditeurFormation from './EditeurFormation';
import {
  LISTE_STATUTS, infoStatut, fmtDate, tauxCouleur, styleChamp, Barre,
} from './commun';

// ─────────────────────────────────────────────────────────────────────────────
// Tableau de suivi — remplace la feuille « SUIVI FORMATIONS » d'Excel.
//   • vue MATRICE : agents en lignes, modules en colonnes (comme le fichier)
//   • vue LISTE   : une ligne par agent, avec son avancement
//   • clic sur une cellule = saisie immédiate de la formation
// ─────────────────────────────────────────────────────────────────────────────

const thBase = {
  textAlign: 'left', padding: '10px 10px', fontSize: 10, textTransform: 'uppercase',
  letterSpacing: 0.4, color: 'var(--text-secondary)', fontWeight: 800,
  background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', verticalAlign: 'bottom',
};
const tdBase = { padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' };

// ── Cellule cliquable ────────────────────────────────────────────────────────
function Cellule({ cellule, onClick }) {
  if (!cellule) {
    return (
      <button onClick={onClick} title="Aucune formation — cliquer pour enregistrer"
        style={{
          width: '100%', minHeight: 34, borderRadius: 8, cursor: 'pointer',
          border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent',
          color: 'rgba(255,255,255,0.18)', fontSize: 12,
        }}>+</button>
    );
  }
  const st = infoStatut(cellule.statut);
  return (
    <button onClick={onClick} title={`${st.label}${cellule.date_session ? ' · ' + fmtDate(cellule.date_session) : ''}`}
      style={{
        width: '100%', minHeight: 34, padding: '3px 6px', borderRadius: 8, cursor: 'pointer',
        border: `1px solid ${st.couleur}55`, background: `${st.couleur}1f`,
        color: st.couleur, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}>
      <span style={{ fontSize: 11, fontWeight: 800 }}>{st.court}</span>
      {cellule.date_session && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>{fmtDate(cellule.date_session)}</span>
      )}
    </button>
  );
}

export default function TableauSuivi() {
  const qc = useQueryClient();
  const [vue, setVue] = useState('matrice');
  const [recherche, setRecherche] = useState('');
  const [groupe, setGroupe] = useState('');
  const [poste, setPoste] = useState('');
  const [gestionnaire, setGestionnaire] = useState('');
  const [celluleActive, setCelluleActive] = useState(null);

  const { data: filtres } = useQuery('formations-filtres',
    () => api.get('/formations/filtres').then(r => r.data), { staleTime: 120000 });

  const { data, isLoading } = useQuery(
    ['formations-matrice', recherche, groupe, poste, gestionnaire],
    () => api.get('/formations/matrice', {
      params: {
        search: recherche || undefined, groupe: groupe || undefined,
        poste: poste || undefined, gestionnaire: gestionnaire || undefined,
      },
    }).then(r => r.data),
    { staleTime: 30000 }
  );

  const modules = data?.modules || [];
  const personnes = data?.personnes || [];

  const rafraichir = () => {
    qc.invalidateQueries('formations-matrice');
    qc.invalidateQueries('formations-resume');
    qc.invalidateQueries('formations-personnel');
    qc.invalidateQueries('formations-fiche');
  };

  const compter = useMemo(() => {
    const c = { VALIDER: 0, EN_COURS: 0, A_REFORMER: 0, A_FORMER: 0, NA: 0, VIDE: 0 };
    personnes.forEach(p => {
      modules.forEach(m => {
        const cell = p.cellules?.[String(m.id)];
        if (!cell) c.VIDE += 1;
        else c[cell.statut] = (c[cell.statut] || 0) + 1;
      });
    });
    return c;
  }, [personnes, modules]);

  return (
    <div>
      {/* ── Barre d'outils ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Rechercher un nom, un matricule, un téléphone…"
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ ...styleChamp, flex: 1, minWidth: 240 }} />
        <select value={groupe} onChange={e => setGroupe(e.target.value)} style={{ ...styleChamp, width: 160 }}>
          <option value="">Tous les groupes</option>
          {(filtres?.groupes || []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={poste} onChange={e => setPoste(e.target.value)} style={{ ...styleChamp, width: 180 }}>
          <option value="">Tous les postes</option>
          {(filtres?.postes || []).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={gestionnaire} onChange={e => setGestionnaire(e.target.value)} style={{ ...styleChamp, width: 200 }}>
          <option value="">Tous les gestionnaires</option>
          {(filtres?.gestionnaires || []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {[['matrice', '▦ Matrice'], ['liste', '☰ Liste']].map(([id, label]) => (
            <button key={id} onClick={() => setVue(id)}
              style={{
                padding: '9px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${vue === id ? 'var(--primary)' : 'var(--border)'}`,
                background: vue === id ? 'var(--primary-glow)' : 'transparent',
                color: vue === id ? 'var(--primary)' : 'var(--text-secondary)',
              }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Légende + compteurs ── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, fontSize: 11.5, color: 'var(--text-secondary)' }}>
        {LISTE_STATUTS.map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: infoStatut(s).couleur }} />
            {infoStatut(s).label}
            <strong style={{ color: 'var(--text-primary)' }}>{compter[s] || 0}</strong>
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, border: '1px dashed rgba(255,255,255,0.3)' }} />
          Non formé <strong style={{ color: 'var(--text-primary)' }}>{compter.VIDE}</strong>
        </span>
        <span style={{ marginLeft: 'auto' }}>{personnes.length} agent(s) · {modules.length} module(s)</span>
      </div>

      {isLoading && <div className="empty-state">Chargement du tableau…</div>}
      {!isLoading && personnes.length === 0 && (
        <div className="empty-state">Aucun agent pour ces filtres.</div>
      )}

      {/* ── Vue MATRICE ── */}
      {!isLoading && vue === 'matrice' && personnes.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, position: 'sticky', left: 0, zIndex: 3, background: '#12121e', minWidth: 210, textAlign: 'left' }}>
                  Agent
                </th>
                {modules.map(m => (
                  <th key={m.id} title={m.nom} style={{ ...thBase, minWidth: 96, maxWidth: 96, height: 70 }}>
                    <div style={{ fontSize: 9.5, lineHeight: 1.25 }}>
                      {m.nom.length > 30 ? m.nom.slice(0, 28) + '…' : m.nom}
                    </div>
                  </th>
                ))}
                <th style={{ ...thBase, minWidth: 74 }}>Taux</th>
              </tr>
            </thead>
            <tbody>
              {personnes.map(p => (
                <tr key={p.id}>
                  <td style={{ ...tdBase, position: 'sticky', left: 0, zIndex: 2, background: '#12121e', minWidth: 210 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.nom}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      {p.matricule}{p.groupe ? ` · ${p.groupe}` : ''}{p.poste ? ` · ${p.poste}` : ''}
                    </div>
                  </td>
                  {modules.map(m => (
                    <td key={m.id} style={{ ...tdBase, padding: 4, width: 96 }}>
                      <Cellule
                        cellule={p.cellules?.[String(m.id)]}
                        onClick={() => setCelluleActive({ personne: p, module: m, cellule: p.cellules?.[String(m.id)] })}
                      />
                    </td>
                  ))}
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: tauxCouleur(p.taux_validation) }}>
                      {p.nb_valides}/{p.nb_modules}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <Barre pct={p.taux_validation} couleur={tauxCouleur(p.taux_validation)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Vue LISTE ── */}
      {!isLoading && vue === 'liste' && personnes.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Matricule', 'Agent', 'Groupe', 'Poste', 'Gestionnaire', 'Avancement', 'Dernière', 'Modules'].map(h => (
                  <th key={h} style={thBase}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personnes.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...tdBase, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{p.matricule}</td>
                  <td style={{ ...tdBase, color: 'var(--text-primary)' }}>{p.nom}</td>
                  <td style={{ ...tdBase }}>{p.groupe || '—'}</td>
                  <td style={{ ...tdBase }}>{p.poste || '—'}</td>
                  <td style={{ ...tdBase }}>{p.gestionnaire || '—'}</td>
                  <td style={{ ...tdBase, minWidth: 130 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>{p.nb_valides}/{p.nb_modules}</span>
                      <span style={{ color: tauxCouleur(p.taux_validation) }}>{p.taux_validation} %</span>
                    </div>
                    <Barre pct={p.taux_validation} couleur={tauxCouleur(p.taux_validation)} />
                  </td>
                  <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>{fmtDate(p.derniere_formation) || '—'}</td>
                  <td style={{ ...tdBase }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {modules.map(m => {
                        const c = p.cellules?.[String(m.id)];
                        const st = c ? infoStatut(c.statut) : null;
                        return (
                          <span key={m.id} title={`${m.nom} : ${st ? st.label : 'non formé'}`}
                            onClick={() => setCelluleActive({ personne: p, module: m, cellule: c })}
                            style={{
                              width: 13, height: 13, borderRadius: 4, cursor: 'pointer',
                              background: st ? st.couleur : 'transparent',
                              border: st ? 'none' : '1px dashed rgba(255,255,255,0.25)',
                            }} />
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {celluleActive && (
        <EditeurFormation
          personne={celluleActive.personne}
          module={celluleActive.module}
          cellule={celluleActive.cellule}
          onClose={() => setCelluleActive(null)}
          onSaved={() => { setCelluleActive(null); rafraichir(); }}
        />
      )}
    </div>
  );
}
