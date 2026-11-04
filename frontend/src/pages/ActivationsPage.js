import React, { useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Suivi des activations — PDV activés via la Prospection.
// Qui travaille, qui ne travaille pas, depuis quand, et comment ça évolue.
// ─────────────────────────────────────────────────────────────────────────────

const STATUTS = {
  PRODUCTIF:    { label: 'Productif',    couleur: '#00d68f' },
  A_CONSOLIDER: { label: 'À consolider', couleur: '#ffa502' },
  A_RECUPERER:  { label: 'À récupérer',  couleur: '#ff7f50' },
  INACTIF:      { label: 'Inactif',      couleur: '#ff4757' },
};

const fmtF = (v) => (v == null ? '—' : `${Math.round(Number(v)).toLocaleString('fr-FR')} F`);
// Montants affichés en entier (demande de la direction)
const fmtEntier = (v) => `${Math.round(Number(v || 0)).toLocaleString('fr-FR')} F`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

const champ = {
  padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
  fontSize: 13, outline: 'none', minWidth: 0,
};

const Kpi = ({ label, valeur, sous, couleur }) => (
  <div className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${couleur}` }}>
    <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 800, color: couleur, marginTop: 3 }}>{valeur}</div>
    {sous && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sous}</div>}
  </div>
);

// Petite barre d'évolution ▁▃▅▇
const MiniSerie = ({ serie }) => {
  const max = Math.max(1, ...serie.map(s => s.ca));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }}>
      {serie.slice(-8).map((s, i) => (
        <div key={i} title={`${s.mois}/${s.annee} : ${fmtF(s.ca)} · ${s.operations} ops`}
          style={{
            width: 5, borderRadius: 2,
            height: `${Math.max(3, (s.ca / max) * 20)}px`,
            background: s.ca > 0 ? '#4a9eff' : 'rgba(255,255,255,0.12)',
          }} />
      ))}
    </div>
  );
};

export default function ActivationsPage() {
  const [filtres, setFiltres] = useState({ search: '', statut: '', zone: '', superviseur: '', developpeur: '', cohorte: '' });
  const [ouvert, setOuvert] = useState(null);
  const [voirAnterieurs, setVoirAnterieurs] = useState({});
  const [exportEnCours, setExportEnCours] = useState(false);
  const [tri, setTri] = useState({ cle: null, sens: 'desc' });

  const { data, isLoading } = useQuery(
    ['activations', filtres],
    () => api.get('/activations', { params: { ...filtres, statut: filtres.statut || undefined, zone: filtres.zone || undefined, superviseur: filtres.superviseur || undefined, developpeur: filtres.developpeur || undefined, cohorte: filtres.cohorte || undefined, search: filtres.search || undefined } }).then(r => r.data),
    { staleTime: 60000 }
  );

  const { data: synthese } = useQuery('activations-synthese',
    () => api.get('/activations/synthese').then(r => r.data), { staleTime: 60000 });

  const items = data?.items || [];

  const basculerTri = (cle) => {
    setTri(prev => prev.cle === cle
      ? { cle, sens: prev.sens === 'asc' ? 'desc' : 'asc' }
      : { cle, sens: 'asc' });
  };

  const itemsTries = useMemo(() => {
    if (!tri.cle) return items;
    const valeur = (l) => {
      if (tri.cle === 'anciennete') return l.anciennete?.jours ?? -1;
      if (tri.cle === 'statut') return l.statut_activation;
      return l[tri.cle];
    };
    const copie = [...items].sort((a, b) => {
      const va = valeur(a), vb = valeur(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), 'fr');
    });
    return tri.sens === 'asc' ? copie : copie.reverse();
  }, [items, tri]);
  const filtresDispo = data?.filtres || {};
  const set = (k, v) => setFiltres(prev => ({ ...prev, [k]: v }));

  const exporter = async () => {
    setExportEnCours(true);
    try {
      const r = await api.get('/activations/export.xlsx', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `activations_prospection_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export téléchargé');
    } catch (e) { toast.error('Export impossible'); }
    finally { setExportEnCours(false); }
  };

  const k = synthese || {};
  const survie = k.survie || {};

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🚀 Suivi des activations</h1>
          <p className="page-subtitle">
            Les {k.total ?? '—'} PDV activés via la Prospection : qui travaille, qui ne travaille pas, et comment ils évoluent.
          </p>
        </div>
        <button className="btn btn-primary" onClick={exporter} disabled={exportEnCours}>
          {exportEnCours ? '⏳ Export…' : '📊 Exporter en Excel'}
        </button>
      </div>

      {/* KPI */}
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <Kpi label="PDV activés" valeur={k.total ?? '—'}
          sous={`CA cumulé ${fmtEntier(items.reduce((s, l) => s + l.total_ca, 0))}`} couleur="#4a9eff" />
        <Kpi label="Productifs" valeur={k.par_statut?.PRODUCTIF ?? 0}
          sous="≥ 5 M / 2 mois ou ≥ 2 M / mois" couleur="#00d68f" />
        <Kpi label="À revoir"
          valeur={(k.par_statut?.A_CONSOLIDER ?? 0) + (k.par_statut?.A_RECUPERER ?? 0) + (k.par_statut?.INACTIF ?? 0)}
          sous={`à récupérer : ${k.par_statut?.A_RECUPERER ?? 0} · inactifs : ${k.par_statut?.INACTIF ?? 0}`} couleur="#ff4757" />
        <Kpi label="Délai moyen de démarrage"
          valeur={k.delai_moyen_demarrage != null ? `${k.delai_moyen_demarrage} j` : '—'}
          sous="activation → 1re opération" couleur="#ffa502" />
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Kpi label="Survie 30 j" valeur={survie.j30 != null ? `${survie.j30} %` : '—'} couleur="#a855f7" />
        <Kpi label="Survie 60 j" valeur={survie.j60 != null ? `${survie.j60} %` : '—'} couleur="#a855f7" />
        <Kpi label="Survie 90 j" valeur={survie.j90 != null ? `${survie.j90} %` : '—'} couleur="#a855f7" />
        <Kpi label="À consolider" valeur={k.par_statut?.A_CONSOLIDER ?? 0} sous="activité réelle, sous les seuils" couleur="#ffa502" />
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        <input placeholder="Rechercher un PDV, un superviseur…" value={filtres.search}
          onChange={e => set('search', e.target.value)} style={{ ...champ, flex: 1, minWidth: 200, maxWidth: 320 }} />
        <select value={filtres.statut} onChange={e => set('statut', e.target.value)} style={{ ...champ, width: 140, flexShrink: 0 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
        </select>
        <select value={filtres.cohorte} onChange={e => set('cohorte', e.target.value)} style={{ ...champ, width: 130, flexShrink: 0 }}>
          <option value="">Toutes les cohortes</option>
          {(filtresDispo.cohortes || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtres.zone} onChange={e => set('zone', e.target.value)} style={{ ...champ, width: 120, flexShrink: 0 }}>
          <option value="">Toutes les zones</option>
          {(filtresDispo.zones || []).map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filtres.developpeur} onChange={e => set('developpeur', e.target.value)} style={{ ...champ, width: 160, flexShrink: 0 }}>
          <option value="">Tous les développeurs</option>
          {(filtresDispo.developpeurs || []).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filtres.superviseur} onChange={e => set('superviseur', e.target.value)} style={{ ...champ, width: 170, flexShrink: 0 }}>
          <option value="">Tous les superviseurs</option>
          {(filtresDispo.superviseurs || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {data?.total ?? 0} PDV · données arrêtées à {data?.dernier_mois || '—'}
        </span>
      </div>

      {isLoading && <div className="empty-state">Chargement…</div>}
      {!isLoading && items.length === 0 && <div className="empty-state">Aucun PDV activé pour ces filtres.</div>}

      {items.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {[
                  ['numero_pdv', 'PDV'], ['nom', 'Nom'], ['zone', 'Zone'],
                  ['superviseur', 'Superviseur'], ['date_activation', 'Activé le'],
                  ['anciennete', 'Ancienneté'], ['statut', 'Statut'],
                  ['delai_demarrage_jours', 'Démarrage'], ['jours_sans_operation', 'Sans op.'],
                  ['total_ca', 'CA cumulé'], ['total_2_mois', 'CA 2 mois'],
                  ['meilleur_mois', 'Meilleur mois'], ['evolution_pct', 'Évolution'], [null, 'Tendance'],
                ].map(([cle, label]) => (
                  <th key={label} style={{
                    textAlign: 'left', padding: '10px 10px', fontSize: 10, textTransform: 'uppercase',
                    letterSpacing: 0.4, color: 'var(--text-secondary)', fontWeight: 800, whiteSpace: 'nowrap',
                  }}>
                    {cle ? (
                      <button onClick={() => basculerTri(cle)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          color: tri.cle === cle ? 'var(--primary)' : 'var(--text-secondary)',
                          font: 'inherit', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 800,
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                        {label}
                        <span style={{ fontSize: 9, opacity: tri.cle === cle ? 1 : 0.35 }}>
                          {tri.cle === cle ? (tri.sens === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    ) : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsTries.map(l => {
                const st = STATUTS[l.statut_activation] || { label: l.statut, couleur: '#8a94a6' };
                const estOuvert = ouvert === l.pdv_id;
                return (
                  <React.Fragment key={l.pdv_id}>
                    <tr style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: estOuvert ? 'rgba(255,255,255,0.03)' : undefined }}
                      onClick={() => setOuvert(estOuvert ? null : l.pdv_id)}>
                      <td style={{ padding: '9px 10px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{l.numero_pdv}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-primary)', maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.nom}
                        {l.reactivation && (
                          <span title={`${l.nb_activations_pdv} activations pour ce PDV`}
                            style={{ marginLeft: 6, fontSize: 9.5, padding: '2px 6px', borderRadius: 999,
                                     background: 'rgba(255,165,2,0.15)', color: '#ffc048', border: '1px solid rgba(255,165,2,0.4)' }}>
                            réactivation
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{l.zone || '—'}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{l.superviseur || '—'}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(l.date_activation)}</td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#fff', fontWeight: 700 }}>{l.anciennete.label}</span>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>cohorte {l.mois_activation}</div>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
                          color: st.couleur, background: `${st.couleur}1f`, border: `1px solid ${st.couleur}55`,
                          whiteSpace: 'nowrap',
                        }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {l.delai_demarrage_jours != null ? `${l.delai_demarrage_jours} j` : '—'}
                      </td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: (l.jours_sans_operation || 0) > 30 ? '#ff8b96' : 'var(--text-secondary)' }}>
                        {l.jours_sans_operation != null ? `${l.jours_sans_operation} j` : '—'}
                      </td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmtEntier(l.total_ca)}</td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: l.total_2_mois >= 5000000 ? '#63e6a0' : '#ff8b96', fontWeight: 700 }}>{fmtEntier(l.total_2_mois)}</td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtEntier(l.meilleur_mois)}</td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: (l.evolution_pct || 0) >= 0 ? '#63e6a0' : '#ff8b96' }}>
                        {l.evolution_pct == null ? '—' : `${l.evolution_pct > 0 ? '↗' : l.evolution_pct < 0 ? '↘' : '→'} ${l.evolution_pct} %`}
                      </td>
                      <td style={{ padding: '9px 10px' }}><MiniSerie serie={l.serie} /></td>
                    </tr>

                    {estOuvert && (
                      <tr>
                        <td colSpan={14} style={{ padding: 0, background: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ padding: 16 }}>
                            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                              <span>Développeur : <b style={{ color: 'var(--text-primary)' }}>{l.developpeur || '—'}</b></span>
                              <span>Opérations cumulées : <b style={{ color: 'var(--text-primary)' }}>{l.total_operations.toLocaleString('fr-FR')}</b></span>
                              <span>Panier moyen : <b style={{ color: 'var(--text-primary)' }}>{fmtF(l.panier_moyen)}</b></span>
                              <span>Dernier mois ({data?.dernier_mois}) : <b style={{ color: 'var(--text-primary)' }}>{fmtF(l.ca_dernier_mois)}</b> · {l.operations_dernier_mois} ops</span>
                              <Link to={`/pdvs/${l.pdv_id}`} className="btn btn-ghost btn-sm">🪪 Fiche PDV</Link>
                            </div>

                            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                              Évolution depuis l'activation
                            </div>
                            <table style={{ borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
                              <thead>
                                <tr>
                                  {l.serie.map(m => (
                                    <th key={`${m.annee}-${m.mois}`} style={{ padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 10.5 }}>
                                      {String(m.mois).padStart(2, '0')}/{String(m.annee).slice(2)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  {l.serie.map(m => (
                                    <td key={`${m.annee}-${m.mois}`} style={{ padding: '6px 10px', textAlign: 'center', color: m.ca > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                      {fmtEntier(m.ca)}
                                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.operations} ops</div>
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>

                            {l.nb_mois_anterieurs > 0 && (
                              <>
                                <button className="btn btn-ghost btn-sm"
                                  onClick={() => setVoirAnterieurs(v => ({ ...v, [l.pdv_id]: !v[l.pdv_id] }))}>
                                  {voirAnterieurs[l.pdv_id] ? '▲ Masquer' : '▼ Voir'} les {l.nb_mois_anterieurs} mois antérieurs à l'activation
                                </button>
                                {voirAnterieurs[l.pdv_id] && (
                                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                    {l.mois_anterieurs.map(m => (
                                      <span key={`${m.annee}-${m.mois}`} style={{ marginRight: 14 }}>
                                        {String(m.mois).padStart(2, '0')}/{String(m.annee).slice(2)} : <b style={{ color: 'var(--text-primary)' }}>{fmtEntier(m.ca)}</b> · {m.operations} ops
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
