import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import api from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Suivi Formation — Lot 1 : référentiel du personnel + catalogue des modules.
// Les onglets « Tableau de suivi » et « Fiche individuelle » arrivent aux lots 2
// et 3 ; ils sont annoncés clairement plutôt que masqués.
// ─────────────────────────────────────────────────────────────────────────────

const ONGLETS = [
  { id: 'personnel', label: '👥 Personnel' },
  { id: 'modules',   label: '🎓 Modules' },
  { id: 'suivi',     label: '📊 Tableau de suivi', lot: 2 },
  { id: 'fiche',     label: '🪪 Fiche individuelle', lot: 3 },
];

const couleurStatut = (taux) =>
  taux >= 80 ? '#00d68f' : taux >= 40 ? '#ffa502' : '#ff4757';

const Kpi = ({ label, valeur, sous, couleur }) => (
  <div className="card" style={{ padding: '16px 18px', borderLeft: `3px solid ${couleur}` }}>
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
      {label}
    </div>
    <div style={{ fontSize: 24, fontWeight: 800, color: couleur, marginTop: 4 }}>{valeur}</div>
    {sous && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{sous}</div>}
  </div>
);

const Barre = ({ pct, couleur }) => (
  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
    <div style={{
      width: `${Math.max(0, Math.min(100, Number(pct) || 0))}%`,
      height: '100%', background: couleur, borderRadius: 999,
    }} />
  </div>
);

const Champ = ({ label, children, span }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? '1 / -1' : undefined }}>
    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</label>
    {children}
  </div>
);

const styleChamp = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const Modale = ({ titre, onClose, children, footer }) => (
  <div className="modal-backdrop" onClick={onClose}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div className="card" onClick={e => e.stopPropagation()}
      style={{ width: '100%', maxWidth: 720, maxHeight: '88vh', overflowY: 'auto', background: '#141420' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{titre}</h3>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>
      {children}
      {footer && <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>{footer}</div>}
    </div>
  </div>
);

export default function SuiviFormationPage() {
  const qc = useQueryClient();
  const [onglet, setOnglet] = useState('personnel');
  const [recherche, setRecherche] = useState('');
  const [groupe, setGroupe] = useState('');
  const [poste, setPoste] = useState('');
  const [edition, setEdition] = useState(null);       // { type, item }
  const [rapport, setRapport] = useState(null);        // rapport d'import
  const fichierRef = useRef(null);

  // ── Données ──
  const { data: resume } = useQuery('formations-resume',
    () => api.get('/formations/resume').then(r => r.data), { staleTime: 60000 });

  const { data: modules = [] } = useQuery('formations-modules',
    () => api.get('/formations/modules').then(r => r.data), { staleTime: 60000 });

  const { data: filtres } = useQuery('formations-filtres',
    () => api.get('/formations/filtres').then(r => r.data), { staleTime: 120000 });

  const { data: personnel, isLoading } = useQuery(
    ['formations-personnel', recherche, groupe, poste],
    () => api.get('/formations/personnel', { params: { search: recherche || undefined, groupe: groupe || undefined, poste: poste || undefined, limit: 1000 } }).then(r => r.data),
    { staleTime: 30000 }
  );

  const personnes = personnel?.items || [];
  const rafraichir = () => {
    qc.invalidateQueries('formations-personnel');
    qc.invalidateQueries('formations-resume');
    qc.invalidateQueries('formations-modules');
    qc.invalidateQueries('formations-filtres');
  };

  // ── Mutations ──
  const enregistrerPersonnel = useMutation(
    (donnees) => {
      const corps = { ...donnees };
      delete corps.id;
      return edition?.item?.id
        ? api.put(`/formations/personnel/${edition.item.id}`, corps).then(r => r.data)
        : api.post('/formations/personnel', corps).then(r => r.data);
    },
    {
      onSuccess: () => { toast.success('Agent enregistré'); setEdition(null); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Enregistrement impossible'),
    }
  );

  const desactiverPersonnel = useMutation(
    (id) => api.delete(`/formations/personnel/${id}`).then(r => r.data),
    {
      onSuccess: () => { toast.success('Agent désactivé'); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Impossible'),
    }
  );

  const enregistrerModule = useMutation(
    (donnees) => {
      const corps = { ...donnees };
      delete corps.id;
      delete corps.nb_sessions;
      delete corps.nb_valides;
      return edition?.item?.id
        ? api.put(`/formations/modules/${edition.item.id}`, corps).then(r => r.data)
        : api.post('/formations/modules', corps).then(r => r.data);
    },
    {
      onSuccess: () => { toast.success('Module enregistré'); setEdition(null); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Enregistrement impossible'),
    }
  );

  const supprimerModule = useMutation(
    (id) => api.delete(`/formations/modules/${id}`).then(r => r.data),
    {
      onSuccess: () => { toast.success('Module supprimé'); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Suppression impossible'),
    }
  );

  const importer = useMutation(
    (fichier) => {
      const fd = new FormData();
      fd.append('fichier', fichier);
      return api.post('/formations/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
    },
    {
      onSuccess: (r) => { setRapport(r); rafraichir(); toast.success('Import terminé'); },
      onError: (e) => toast.error(e?.response?.data?.detail || "Import impossible"),
    }
  );

  const choisirFichier = () => fichierRef.current?.click();
  const surFichier = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) importer.mutate(f);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🎓 Suivi Formation</h1>
          <p className="page-subtitle">
            Parcours de formation du personnel — le Responsable Conformité est le chef de file.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input ref={fichierRef} type="file" accept=".xlsx,.xlsm" onChange={surFichier} style={{ display: 'none' }} />
          <button className="btn btn-ghost" onClick={choisirFichier} disabled={importer.isLoading}>
            {importer.isLoading ? '⏳ Import…' : '📥 Importer un Excel'}
          </button>
          <button className="btn btn-primary"
            onClick={() => setEdition({ type: onglet === 'modules' ? 'module' : 'personnel', item: null })}>
            + {onglet === 'modules' ? 'Nouveau module' : 'Nouvel agent'}
          </button>
        </div>
      </div>

      {/* ── Compteurs ── */}
      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Kpi label="Agents suivis" valeur={resume?.nb_personnel ?? '—'}
          sous={`${resume?.nb_a_jour ?? 0} à jour`} couleur="#4a9eff" />
        <Kpi label="Modules" valeur={resume?.nb_modules ?? '—'}
          sous={`${resume?.nb_sessions ?? 0} formations enregistrées`} couleur="#FF6900" />
        <Kpi label="Modules validés" valeur={resume?.nb_valides ?? '—'}
          sous={`${resume?.nb_a_reformer ?? 0} à reformer`} couleur="#00d68f" />
        <Kpi label="Taux global" valeur={`${resume?.taux_global ?? 0} %`}
          sous="modules validés / attendus" couleur="#a855f7" />
      </div>

      {/* ── Onglets ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {ONGLETS.map(o => {
          const actif = onglet === o.id;
          return (
            <button key={o.id} onClick={() => setOnglet(o.id)}
              style={{
                padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${actif ? 'var(--primary)' : 'var(--border)'}`,
                background: actif ? 'var(--primary-glow)' : 'transparent',
                color: actif ? 'var(--primary)' : 'var(--text-secondary)',
              }}>
              {o.label}{o.lot ? ` · lot ${o.lot}` : ''}
            </button>
          );
        })}
      </div>

      {/* ── Personnel ── */}
      {onglet === 'personnel' && (
        <>
          <div className="filters" style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <input placeholder="Rechercher un nom, un matricule, un téléphone…"
              value={recherche} onChange={e => setRecherche(e.target.value)}
              style={{ ...styleChamp, flex: 1, minWidth: 260 }} />
            <select value={groupe} onChange={e => setGroupe(e.target.value)} style={{ ...styleChamp, width: 170 }}>
              <option value="">Tous les groupes</option>
              {(filtres?.groupes || []).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={poste} onChange={e => setPoste(e.target.value)} style={{ ...styleChamp, width: 190 }}>
              <option value="">Tous les postes</option>
              {(filtres?.postes || []).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <span style={{ alignSelf: 'center', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              {personnel?.total ?? 0} agent(s)
            </span>
          </div>

          {isLoading && <div className="empty-state">Chargement…</div>}
          {!isLoading && personnes.length === 0 && (
            <div className="empty-state">
              Aucun agent.<br />Utilisez « Importer un Excel » pour reprendre le fichier existant.
            </div>
          )}

          {personnes.length > 0 && (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['Matricule', 'Nom', 'Téléphone', 'Groupe', 'Poste', 'Gestionnaire', 'Avancement', 'Dernière', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '11px 12px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', fontWeight: 800, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {personnes.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{p.matricule}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{p.nom}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{p.telephone || '—'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{p.groupe || '—'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{p.poste || '—'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{p.gestionnaire || '—'}</td>
                      <td style={{ padding: '10px 12px', minWidth: 140 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{p.nb_valides}/{p.nb_modules}</span>
                          <span style={{ color: couleurStatut(p.taux_validation) }}>{p.taux_validation} %</span>
                        </div>
                        <Barre pct={p.taux_validation} couleur={couleurStatut(p.taux_validation)} />
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {p.derniere_formation ? new Date(p.derniere_formation).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'personnel', item: p })}>✏️</button>
                        <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }}
                          onClick={() => { if (window.confirm(`Désactiver ${p.nom} ? (l'historique est conservé)`)) desactiverPersonnel.mutate(p.id); }}>
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Modules ── */}
      {onglet === 'modules' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['#', 'Module', 'Obligatoire', 'Actif', 'Formations', 'Validés', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 12px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', fontWeight: 800 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((m, i) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{m.nom}</td>
                  <td style={{ padding: '10px 12px' }}>{m.obligatoire ? '✅' : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{m.actif ? '🟢' : '⚪'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.nb_sessions}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--success)' }}>{m.nb_valides}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'module', item: m })}>✏️</button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }}
                      onClick={() => { if (window.confirm(`Supprimer « ${m.nom} » ?`)) supprimerModule.mutate(m.id); }}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Onglets à venir ── */}
      {(onglet === 'suivi' || onglet === 'fiche') && (
        <div className="empty-state">
          <div style={{ fontSize: 40, marginBottom: 8 }}>{onglet === 'suivi' ? '📊' : '🪪'}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            {onglet === 'suivi' ? 'Tableau de suivi' : 'Fiche individuelle'}
          </div>
          <div style={{ maxWidth: 460, textAlign: 'center', lineHeight: 1.6 }}>
            Cet écran arrive au <strong>lot {onglet === 'suivi' ? 2 : 3}</strong>.
            Les données sont déjà importées : il ne reste que l'affichage à construire.
          </div>
        </div>
      )}

      {/* ── Modale agent ── */}
      {edition?.type === 'personnel' && (
        <FormulairePersonnel
          item={edition.item}
          onClose={() => setEdition(null)}
          onSave={(d) => enregistrerPersonnel.mutate(d)}
          enCours={enregistrerPersonnel.isLoading}
        />
      )}

      {/* ── Modale module ── */}
      {edition?.type === 'module' && (
        <FormulaireModule
          item={edition.item}
          onClose={() => setEdition(null)}
          onSave={(d) => enregistrerModule.mutate(d)}
          enCours={enregistrerModule.isLoading}
        />
      )}

      {/* ── Rapport d'import ── */}
      {rapport && <RapportImport rapport={rapport} onClose={() => setRapport(null)} />}
    </div>
  );
}

// ── Formulaire agent ─────────────────────────────────────────────────────────
function FormulairePersonnel({ item, onClose, onSave, enCours }) {
  const [f, setF] = useState({
    matricule: item?.matricule || '',
    nom: item?.nom || '',
    telephone: item?.telephone || '',
    gestionnaire: item?.gestionnaire || '',
    groupe: item?.groupe || '',
    poste: item?.poste || '',
    agence: item?.agence || '',
    statut_emploi: item?.statut_emploi || 'ACTIF',
  });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  return (
    <Modale titre={item ? `Modifier ${item.nom}` : 'Nouvel agent'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={enCours || !f.matricule.trim() || !f.nom.trim()}
          onClick={() => onSave(f)}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Champ label="Matricule *"><input style={styleChamp} value={f.matricule} onChange={e => set('matricule', e.target.value)} placeholder="FRK-000" /></Champ>
        <Champ label="Nom et prénom *"><input style={styleChamp} value={f.nom} onChange={e => set('nom', e.target.value)} /></Champ>
        <Champ label="Téléphone"><input style={styleChamp} value={f.telephone} onChange={e => set('telephone', e.target.value)} /></Champ>
        <Champ label="Gestionnaire"><input style={styleChamp} value={f.gestionnaire} onChange={e => set('gestionnaire', e.target.value)} /></Champ>
        <Champ label="Groupe"><input style={styleChamp} value={f.groupe} onChange={e => set('groupe', e.target.value)} placeholder="BG, GRP 1…" /></Champ>
        <Champ label="Poste"><input style={styleChamp} value={f.poste} onChange={e => set('poste', e.target.value)} placeholder="SUPERVISEUR…" /></Champ>
        <Champ label="Agence / Point Hub" span><input style={styleChamp} value={f.agence} onChange={e => set('agence', e.target.value)} /></Champ>
        <Champ label="Statut">
          <select style={styleChamp} value={f.statut_emploi} onChange={e => set('statut_emploi', e.target.value)}>
            <option value="ACTIF">ACTIF</option>
            <option value="INACTIF">INACTIF</option>
            <option value="SORTI">SORTI</option>
          </select>
        </Champ>
      </div>
    </Modale>
  );
}

// ── Formulaire module ────────────────────────────────────────────────────────
function FormulaireModule({ item, onClose, onSave, enCours }) {
  const [f, setF] = useState({
    nom: item?.nom || '',
    ordre: item?.ordre ?? 0,
    obligatoire: item?.obligatoire ?? true,
    actif: item?.actif ?? true,
    description: item?.description || '',
  });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  return (
    <Modale titre={item ? 'Modifier le module' : 'Nouveau module'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={enCours || !f.nom.trim()}
          onClick={() => onSave({ ...f, ordre: Number(f.ordre) || 0 })}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Champ label="Nom du module *"><input style={styleChamp} value={f.nom} onChange={e => set('nom', e.target.value)} /></Champ>
        <Champ label="Ordre d'affichage">
          <input type="number" style={styleChamp} value={f.ordre} onChange={e => set('ordre', e.target.value)} />
        </Champ>
        <Champ label="Description" span>
          <textarea style={{ ...styleChamp, minHeight: 76 }} value={f.description} onChange={e => set('description', e.target.value)} />
        </Champ>
        <Champ label="Obligatoire">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={f.obligatoire} onChange={e => set('obligatoire', e.target.checked)} />
            Compte dans le taux de validation
          </label>
        </Champ>
        <Champ label="Actif">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={f.actif} onChange={e => set('actif', e.target.checked)} />
            Visible dans le suivi
          </label>
        </Champ>
      </div>
    </Modale>
  );
}

// ── Rapport d'import ─────────────────────────────────────────────────────────
function RapportImport({ rapport, onClose }) {
  const lignes = [
    ['Agents créés', rapport.personnel_crees],
    ['Agents mis à jour', rapport.personnel_mis_a_jour],
    ['Agents ignorés', rapport.personnel_ignores],
    ['Modules créés', rapport.modules_crees],
    ['Formations enregistrées', rapport.sessions_creees],
    ['Formations déjà présentes', rapport.sessions_ignorees],
    ['Évaluations reprises', rapport.evaluations_reprises],
  ];
  const avert = rapport.avertissements || [];

  return (
    <Modale titre="📥 Rapport d'import" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Fermer</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {lignes.map(([label, valeur]) => (
          <div key={label} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{valeur ?? 0}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        Points à vérifier ({avert.length})
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
        {avert.length === 0
          ? <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Aucune anomalie détectée. ✅</div>
          : avert.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              • {a}
            </div>
          ))}
      </div>
    </Modale>
  );
}
