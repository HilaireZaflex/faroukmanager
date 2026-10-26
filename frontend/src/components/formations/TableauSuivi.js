import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Tableau de suivi — remplace la feuille « SUIVI FORMATIONS » d'Excel.
//   • vue MATRICE : agents en lignes, modules en colonnes (comme le fichier)
//   • vue LISTE   : une ligne par agent, avec son avancement
//   • clic sur une cellule = saisie immédiate de la formation
// ─────────────────────────────────────────────────────────────────────────────

const STATUTS = {
  VALIDER:    { label: 'Validé',     court: 'V',  couleur: '#00d68f' },
  EN_COURS:   { label: 'En cours',   court: 'EC', couleur: '#ffa502' },
  A_REFORMER: { label: 'À reformer', court: 'R',  couleur: '#ff4757' },
  A_FORMER:   { label: 'À former',   court: 'F',  couleur: '#4a9eff' },
  NA:         { label: 'N/A',        court: '—',  couleur: '#555570' },
};
const LISTE_STATUTS = ['VALIDER', 'EN_COURS', 'A_REFORMER', 'A_FORMER', 'NA'];
const EVALUATIONS = ['EXCELLENT', 'TRES_BIEN', 'BIEN', 'MOYEN', 'INSUFFISANT'];
const LIBELLE_EVAL = {
  EXCELLENT: 'Excellent', TRES_BIEN: 'Très bien', BIEN: 'Bien',
  MOYEN: 'Moyen', INSUFFISANT: 'Insuffisant',
};

const infoStatut = (s) => STATUTS[s] || { label: s || '—', court: '·', couleur: '#555570' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

const styleChamp = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const Champ = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</label>
    {children}
  </div>
);

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
  const [celluleActive, setCelluleActive] = useState(null); // { personne, module, cellule }

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
                    <div style={{ fontSize: 9.5, lineHeight: 1.25, writingMode: 'initial' }}>
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
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999, marginTop: 4 }}>
                      <div style={{ width: `${Math.min(100, p.taux_validation)}%`, height: '100%', background: tauxCouleur(p.taux_validation), borderRadius: 999 }} />
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
                  <td style={{ ...tdBase, color: 'var(--text-secondary)' }}>{p.groupe || '—'}</td>
                  <td style={{ ...tdBase, color: 'var(--text-secondary)' }}>{p.poste || '—'}</td>
                  <td style={{ ...tdBase, color: 'var(--text-secondary)' }}>{p.gestionnaire || '—'}</td>
                  <td style={{ ...tdBase, minWidth: 130 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>{p.nb_valides}/{p.nb_modules}</span>
                      <span style={{ color: tauxCouleur(p.taux_validation) }}>{p.taux_validation} %</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                      <div style={{ width: `${Math.min(100, p.taux_validation)}%`, height: '100%', background: tauxCouleur(p.taux_validation), borderRadius: 999 }} />
                    </div>
                  </td>
                  <td style={{ ...tdBase, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(p.derniere_formation) || '—'}</td>
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
        <EditeurCellule
          cle={celluleActive}
          onClose={() => setCelluleActive(null)}
          onSaved={() => { setCelluleActive(null); rafraichir(); }}
        />
      )}
    </div>
  );
}

const tauxCouleur = (t) => (t >= 80 ? '#00d68f' : t >= 40 ? '#ffa502' : '#ff4757');

const thBase = {
  textAlign: 'left', padding: '10px 10px', fontSize: 10, textTransform: 'uppercase',
  letterSpacing: 0.4, color: 'var(--text-secondary)', fontWeight: 800,
  background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', verticalAlign: 'bottom',
};
const tdBase = { padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' };

// ── Éditeur de cellule ───────────────────────────────────────────────────────
function EditeurCellule({ cle, onClose, onSaved }) {
  const { personne, module, cellule } = cle;
  const [statut, setStatut] = useState(cellule?.statut || 'VALIDER');
  const [dateSession, setDate] = useState(cellule?.date_session || '');
  const [evaluation, setEvaluation] = useState(cellule?.evaluation || '');
  const [note, setNote] = useState(cellule?.note != null ? String(cellule.note) : '');
  const [observation, setObservation] = useState(cellule?.observation || '');

  const { data: historique = [] } = useQuery(
    ['formations-historique', personne.id, module.id],
    () => api.get('/formations/sessions', { params: { personnel_id: personne.id, module_id: module.id } }).then(r => r.data),
    { staleTime: 0 }
  );

  const corps = () => ({
    statut,
    date_session: dateSession || null,
    evaluation: evaluation || null,
    note: note === '' ? null : Number(note),
    observation: observation || null,
  });

  const enregistrer = useMutation(
    () => (cellule?.session_id
      ? api.put(`/formations/sessions/${cellule.session_id}`, corps()).then(r => r.data)
      : api.post('/formations/sessions', { personnel_id: personne.id, module_id: module.id, ...corps() }).then(r => r.data)),
    {
      onSuccess: () => { toast.success('Formation enregistrée'); onSaved(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Enregistrement impossible'),
    }
  );

  const supprimer = useMutation(
    () => api.delete(`/formations/sessions/${cellule.session_id}`).then(r => r.data),
    {
      onSuccess: () => { toast.success('Formation supprimée'); onSaved(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Suppression impossible'),
    }
  );

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', background: '#141420' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{personne.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {personne.matricule} · {module.nom}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Champ label="Statut">
            <select style={styleChamp} value={statut} onChange={e => setStatut(e.target.value)}>
              {LISTE_STATUTS.map(s => <option key={s} value={s}>{infoStatut(s).label}</option>)}
            </select>
          </Champ>
          <Champ label="Date de formation">
            <input type="date" style={styleChamp} value={dateSession || ''} onChange={e => setDate(e.target.value)} />
          </Champ>
          <Champ label="Évaluation (facultatif)">
            <select style={styleChamp} value={evaluation} onChange={e => setEvaluation(e.target.value)}>
              <option value="">—</option>
              {EVALUATIONS.map(ev => <option key={ev} value={ev}>{LIBELLE_EVAL[ev]}</option>)}
            </select>
          </Champ>
          <Champ label="Note / 20 (facultatif)">
            <input type="number" min="0" max="20" step="0.5" style={styleChamp}
              value={note} onChange={e => setNote(e.target.value)} />
          </Champ>
          <div style={{ gridColumn: '1 / -1' }}>
            <Champ label="Observation">
              <textarea style={{ ...styleChamp, minHeight: 70 }} value={observation}
                onChange={e => setObservation(e.target.value)} />
            </Champ>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          {cellule?.session_id && (
            <button className="btn btn-danger" disabled={supprimer.isLoading}
              onClick={() => { if (window.confirm('Supprimer cette formation ?')) supprimer.mutate(); }}>
              Supprimer
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={enregistrer.isLoading} onClick={() => enregistrer.mutate()}>
            {enregistrer.isLoading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {historique.length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              Historique sur ce module ({historique.length})
            </div>
            {historique.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{fmtDate(h.date_session) || 'sans date'}</span>
                <span style={{ color: infoStatut(h.statut).couleur }}>{infoStatut(h.statut).label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
