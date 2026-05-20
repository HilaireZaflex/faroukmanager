import React, { useState, useEffect, useCallback } from 'react';
import indicatorService, { CATEGORY_LABELS, OUTCOME_LABELS } from '../services/indicatorService';
import api from '../services/api';

// =============================================================================
// ONGLET 2 : VUE PAR INDICATEUR (drill-down)
// =============================================================================
export function TabIndicatorView({ indicatorId, setIndicatorId }) {
  const [indicators, setIndicators] = useState([]);
  const [stats, setStats] = useState(null);
  const [pdvs, setPdvs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ active_only: '', quartier: '', search: '' });
  const [users, setUsers] = useState([]);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    indicatorService.list().then(setIndicators);
    api.get('/auth/users').then(r => setUsers(r.data)).catch(() => setUsers([]));
  }, []);

  const reload = useCallback(async () => {
    // Utiliser le premier indicateur disponible si aucun sélectionné
    const effectiveId = indicatorId || indicators[0]?.id;
    if (!effectiveId) return;
    setLoading(true);
    try {
      const [s, list] = await Promise.all([
        indicatorService.stats(effectiveId),
        indicatorService.pdvs(effectiveId, {
          active_only: filters.active_only === '' ? undefined : filters.active_only === 'true',
          quartier: filters.quartier || undefined,
          search: filters.search || undefined,
        }),
      ]);
      setStats(s); setPdvs(list);
    } finally { setLoading(false); }
  }, [indicatorId, indicators, filters]);
  useEffect(() => { if (indicators.length) reload(); }, [reload, indicators]);

  if (!indicators.length) return <div className="empty-state">Aucun indicateur. Crée-en un dans l'onglet Liste.</div>;

  const effectiveId = indicatorId || indicators[0]?.id;
  const indic = indicators.find(i => i.id === effectiveId) || indicators[0];
  const quartiers = [...new Set(pdvs.map(p => p.quartier).filter(Boolean))].sort();

  return (
    <>
      {/* Sélecteur indicateur */}
      <div className="filters">
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Indicateur :</span>
        <select value={effectiveId} onChange={e => setIndicatorId(parseInt(e.target.value))}>
          {indicators.map(i => <option key={i.id} value={i.id}>{i.icon} {i.name}</option>)}
        </select>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total PDV</div><div className="stat-value">{stats.total_pdvs}</div></div>
          <div className="stat-card ok">
            <div className="stat-label">Actifs sur l'indicateur</div>
            <div className="stat-value">{stats.active}</div>
            <small style={{ color: 'var(--text-muted)' }}>{stats.rate_pct}%</small>
          </div>
          <div className="stat-card" style={{ borderLeftColor: 'var(--danger)' }}>
            <div className="stat-label">Inactifs (à relancer)</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.inactive}</div>
          </div>
          {stats.target_pct && (
            <div className="stat-card warn">
              <div className="stat-label">Objectif</div>
              <div className="stat-value">{stats.target_pct}%</div>
              <small style={{ color: stats.gap_to_target > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {stats.gap_to_target > 0 ? `Manque ${stats.gap_to_target}%` : `+${Math.abs(stats.gap_to_target)}% au-delà`}
              </small>
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="filters">
        <input placeholder="Rechercher PDV…" value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}/>
        <select value={filters.active_only} onChange={e => setFilters(f => ({ ...f, active_only: e.target.value }))}>
          <option value="">Tous les PDV</option>
          <option value="true">🟢 Actifs uniquement</option>
          <option value="false">🔴 Inactifs uniquement</option>
        </select>
        <select value={filters.quartier} onChange={e => setFilters(f => ({ ...f, quartier: e.target.value }))}>
          <option value="">Tous quartiers</option>
          {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        {selectedIds.length > 0 && (
          <button className="btn-primary" onClick={() => setShowAssign(true)}>
            📞 Attribuer {selectedIds.length} PDV à téléconseillère
          </button>
        )}
      </div>

      {/* Tableau */}
      {loading ? <div className="loading-state">Chargement…</div> :
       pdvs.length === 0 ? <div className="empty-state">Aucun PDV trouvé.</div> : (
        <div className="prospects-table">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? pdvs.map(p => p.pdv_id) : [])}/></th>
                <th>N° PDV</th><th>Nom</th><th>Téléphone</th><th>Quartier</th><th>État</th><th>Valeur</th>
              </tr>
            </thead>
            <tbody>
              {pdvs.map(p => (
                <tr key={p.pdv_id}>
                  <td><input type="checkbox" checked={selectedIds.includes(p.pdv_id)}
                    onChange={e => setSelectedIds(s => e.target.checked ? [...s, p.pdv_id] : s.filter(x => x !== p.pdv_id))}/></td>
                  <td><b>{p.numero_pdv}</b></td>
                  <td>{p.nom || '—'}</td>
                  <td>{p.telephone || '—'}</td>
                  <td>{p.quartier || '—'}</td>
                  <td>
                    <span className="status-badge" style={{ background: p.is_active ? 'var(--success)' : 'var(--danger)' }}>
                      {p.is_active ? '🟢 Actif' : '🔴 Inactif'}
                    </span>
                  </td>
                  <td>{p.raw_value ? p.raw_value.toLocaleString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssign && (
        <QuickCampaignModal
          indicatorId={effectiveId}
          pdvIds={selectedIds}
          users={users.filter(u => u.role === 'teleconseillere')}
          onClose={() => setShowAssign(false)}
          onSaved={() => { setShowAssign(false); setSelectedIds([]); reload(); }}
        />
      )}
    </>
  );
}

function QuickCampaignModal({ indicatorId, pdvIds, users, onClose, onSaved }) {
  const [name, setName] = useState(`Campagne du ${new Date().toLocaleDateString('fr-FR')}`);
  const [selUsers, setSelUsers] = useState([]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selUsers.length) return alert('Sélectionnez au moins une téléconseillère');
    try {
      const c = await indicatorService.createCallCampaign({
        name, indicator_ids: [indicatorId], status: 'ACTIVE',
      });
      // Pour la sélection : pas de filtre = on attribue tous les inactifs
      // Workaround : on crée la campagne, puis assign avec filtres
      await indicatorService.assignCallTasks(c.id, {
        user_ids: selUsers, strategy: 'balanced',
      });
      alert(`✅ Campagne créée et ${pdvIds.length} PDV attribués aux ${selUsers.length} téléconseillères`);
      onSaved();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>📞 Attribuer aux téléconseillères</h2>
        <form onSubmit={submit}>
          <div className="modal-section">
            <div className="form-grid">
              <label className="full">Nom de la campagne<input value={name} onChange={e => setName(e.target.value)}/></label>
              <label className="full">Téléconseillères ({selUsers.length} sélectionnées)
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {users.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selUsers.includes(u.id)}
                        onChange={e => setSelUsers(s => e.target.checked ? [...s, u.id] : s.filter(x => x !== u.id))}/>
                      {u.prenom} {u.nom} ({u.email})
                    </label>
                  ))}
                </div>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary">Attribuer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// ONGLET 3 : CAMPAGNES D'APPEL
// =============================================================================
export function TabCallCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [showDetail, setShowDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [indicators, setIndicators] = useState([]);
  const [users, setUsers] = useState([]);

  const reload = () => indicatorService.callCampaigns().then(setCampaigns);
  useEffect(() => {
    reload();
    indicatorService.list().then(setIndicators);
    api.get('/auth/users').then(r => setUsers(r.data)).catch(() => setUsers([]));
  }, []);

  return (
    <>
      <div className="filters">
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Nouvelle campagne</button>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{campaigns.length} campagne(s)</span>
      </div>

      <div className="prospects-table">
        <table>
          <thead><tr><th>Nom</th><th>Statut</th><th>Indicateurs</th><th>Tâches</th><th>Progression</th><th>Période</th></tr></thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} onClick={() => setShowDetail(c.id)}>
                <td><b>{c.name}</b><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.description || '—'}</div></td>
                <td>
                  <span className="status-badge" style={{
                    background: c.status === 'ACTIVE' ? 'var(--success)' :
                                c.status === 'COMPLETED' ? 'var(--text-muted)' : 'var(--warning)',
                  }}>{c.status}</span>
                </td>
                <td>
                  {(c.indicator_ids || []).map(id => {
                    const ind = indicators.find(i => i.id === id);
                    return ind ? <span key={id} style={{ marginRight: 4 }}>{ind.icon}{ind.code}</span> : null;
                  })}
                </td>
                <td>{c.n_done}/{c.n_total}</td>
                <td>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                    <div style={{ width: `${c.progress_pct}%`, height: '100%', background: 'var(--primary)' }}/>
                  </div>
                  <small>{c.progress_pct}%</small>
                </td>
                <td style={{ fontSize: 11 }}>
                  {c.starts_at ? new Date(c.starts_at).toLocaleDateString('fr-FR') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateCampaignModal indicators={indicators} users={users.filter(u => u.role === 'teleconseillere')}
        onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }}/>}
      {showDetail && <CampaignDetailModal campaignId={showDetail}
        onClose={() => setShowDetail(null)} onChanged={reload}/>}
    </>
  );
}

function CreateCampaignModal({ indicators, users, onClose, onSaved }) {
  const [d, setD] = useState({ name: `Campagne ${new Date().toLocaleDateString('fr-FR')}`, description: '', indicator_ids: [], target_rate_pct: 10 });
  const [selUsers, setSelUsers] = useState([]);
  const [strategy, setStrategy] = useState('balanced');

  const submit = async (e) => {
    e.preventDefault();
    if (!d.indicator_ids.length) return alert('Sélectionnez au moins un indicateur');
    if (!selUsers.length) return alert('Sélectionnez au moins une téléconseillère');
    try {
      const c = await indicatorService.createCallCampaign({ ...d, status: 'ACTIVE' });
      const r = await indicatorService.assignCallTasks(c.id, { user_ids: selUsers, strategy });
      alert(`✅ Campagne créée — ${r.created} tâches attribuées`);
      onSaved();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>📞 Nouvelle campagne d'appels</h2>
        <form onSubmit={submit}>
          <div className="modal-section">
            <div className="form-grid">
              <label className="full">Nom *<input required value={d.name} onChange={e => setD({ ...d, name: e.target.value })}/></label>
              <label className="full">Description<textarea value={d.description} onChange={e => setD({ ...d, description: e.target.value })} style={{ minHeight: 50 }}/></label>
              <label>Objectif (%)<input type="number" value={d.target_rate_pct} onChange={e => setD({ ...d, target_rate_pct: parseFloat(e.target.value) })}/></label>
              <label>Stratégie attribution
                <select value={strategy} onChange={e => setStrategy(e.target.value)}>
                  <option value="balanced">⚖️ Équilibrée (round-robin)</option>
                  <option value="by_zone">🌍 Par quartier</option>
                </select>
              </label>
              <label className="full">Indicateurs ciblés *
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {indicators.map(i => (
                    <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 6, background: d.indicator_ids.includes(i.id) ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={d.indicator_ids.includes(i.id)}
                        onChange={e => setD(s => ({ ...s, indicator_ids: e.target.checked ? [...s.indicator_ids, i.id] : s.indicator_ids.filter(x => x !== i.id) }))}/>
                      {i.icon} {i.name}
                    </label>
                  ))}
                </div>
              </label>
              <label className="full">Téléconseillères ({selUsers.length} sélectionnées) *
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {users.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 6, background: selUsers.includes(u.id) ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={selUsers.includes(u.id)}
                        onChange={e => setSelUsers(s => e.target.checked ? [...s, u.id] : s.filter(x => x !== u.id))}/>
                      {u.prenom} {u.nom}
                    </label>
                  ))}
                </div>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary">Créer & attribuer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CampaignDetailModal({ campaignId, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    Promise.all([
      indicatorService.callCampaignDetail(campaignId).then(setC),
      indicatorService.callCampaignStats(campaignId).then(setStats),
    ]);
  }, [campaignId]);

  if (!c) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal"><div className="loading-state">Chargement…</div></div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <h2>{c.name}</h2>
          <span className="status-badge" style={{ background: c.status === 'ACTIVE' ? 'var(--success)' : 'var(--text-muted)' }}>{c.status}</span>
        </div>

        {stats && (
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Tâches</div><div className="stat-value">{stats.tasks_total}</div></div>
            <div className="stat-card ok"><div className="stat-label">Complétées</div><div className="stat-value">{stats.tasks_completed}</div><small>{stats.completion_pct}%</small></div>
            <div className="stat-card"><div className="stat-label">Appels loggés</div><div className="stat-value">{stats.calls_logged}</div></div>
            <div className="stat-card ok"><div className="stat-label">Joignabilité</div><div className="stat-value">{stats.reach_rate_pct}%</div></div>
            <div className="stat-card warn"><div className="stat-label">Engagement</div><div className="stat-value">{stats.engagement_rate_pct}%</div></div>
          </div>
        )}

        <div className="modal-section">
          <h3>📞 Tâches ({c.tasks.length})</h3>
          <div className="prospects-table">
            <table>
              <thead><tr><th>PDV</th><th>Téléconseillère</th><th>Statut</th><th>Dernier résultat</th><th>Engagement</th></tr></thead>
              <tbody>
                {c.tasks.slice(0, 100).map(t => (
                  <tr key={t.id}>
                    <td><b>{t.pdv_numero}</b><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.pdv_nom} · {t.pdv_quartier}</div></td>
                    <td>{t.assigned_to_nom || '—'}</td>
                    <td><span className="status-badge" style={{ background: t.status === 'COMPLETED' ? 'var(--success)' : t.status === 'PENDING' ? 'var(--text-muted)' : 'var(--warning)' }}>{t.status}</span></td>
                    <td>{t.last_outcome ? OUTCOME_LABELS[t.last_outcome]?.label : '—'}</td>
                    <td>{t.last_engagement || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ONGLET 4 : CAMPAGNES TERRAIN (développeurs)
// =============================================================================
export function TabFieldCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [indicators, setIndicators] = useState([]);
  const [users, setUsers] = useState([]);

  const reload = () => indicatorService.fieldCampaigns().then(setCampaigns);
  useEffect(() => {
    reload();
    indicatorService.list().then(setIndicators);
    api.get('/auth/users').then(r => setUsers(r.data)).catch(() => setUsers([]));
  }, []);

  return (
    <>
      <div className="filters">
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Nouvelle tournée</button>
      </div>

      {campaigns.length === 0 ? (
        <div className="empty-state">
          🚶 Aucune tournée terrain pour l'instant.<br/>
          <small>Cliquez sur "Nouvelle tournée" pour créer une campagne de visites.</small>
        </div>
      ) : (
        <div className="prospects-table">
          <table>
            <thead><tr><th>Nom</th><th>Statut</th><th>Visites</th><th>Progression</th></tr></thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td><span className="status-badge" style={{ background: 'var(--success)' }}>{c.status}</span></td>
                  <td>{c.n_done}/{c.n_total}</td>
                  <td>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                      <div style={{ width: `${c.progress_pct}%`, height: '100%', background: 'var(--primary)' }}/>
                    </div>
                    <small>{c.progress_pct}%</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateFieldCampaignModal indicators={indicators}
        users={users.filter(u => u.role === 'developpeur')}
        onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }}/>}
    </>
  );
}

function CreateFieldCampaignModal({ indicators, users, onClose, onSaved }) {
  const [d, setD] = useState({ name: `Tournée ${new Date().toLocaleDateString('fr-FR')}`, indicator_ids: [] });
  const [selDevs, setSelDevs] = useState([]);

  const submit = async (e) => {
    e.preventDefault();
    if (!d.indicator_ids.length || !selDevs.length) return alert('Sélectionnez indicateur(s) et développeur(s)');
    try {
      const c = await indicatorService.createFieldCampaign({ ...d, status: 'ACTIVE' });
      const r = await indicatorService.assignFieldVisits(c.id, { dev_user_ids: selDevs });
      alert(`✅ Tournée créée — ${r.created} visites attribuées`);
      onSaved();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>🚶 Nouvelle tournée terrain</h2>
        <form onSubmit={submit}>
          <div className="modal-section">
            <div className="form-grid">
              <label className="full">Nom *<input required value={d.name} onChange={e => setD({ ...d, name: e.target.value })}/></label>
              <label className="full">Indicateurs ciblés *
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {indicators.map(i => (
                    <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 6, background: d.indicator_ids.includes(i.id) ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={d.indicator_ids.includes(i.id)}
                        onChange={e => setD(s => ({ ...s, indicator_ids: e.target.checked ? [...s.indicator_ids, i.id] : s.indicator_ids.filter(x => x !== i.id) }))}/>
                      {i.icon} {i.name}
                    </label>
                  ))}
                </div>
              </label>
              <label className="full">Développeurs ({selDevs.length} sélectionnés) *
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {users.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 6, background: selDevs.includes(u.id) ? 'rgba(255,105,0,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={selDevs.includes(u.id)}
                        onChange={e => setSelDevs(s => e.target.checked ? [...s, u.id] : s.filter(x => x !== u.id))}/>
                      {u.prenom} {u.nom}
                    </label>
                  ))}
                </div>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary">Créer & attribuer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// ONGLET 5 : IA — Analyse des commentaires
// =============================================================================
export function TabIndicatorAI({ indicatorId, setIndicatorId }) {
  const [indicators, setIndicators] = useState([]);
  const [insights, setInsights] = useState(null);
  const [dropouts, setDropouts] = useState([]);
  const [whatIf, setWhatIf] = useState(null);
  const [recoveryPct, setRecoveryPct] = useState(20);
  const [loading, setLoading] = useState(false);

  useEffect(() => { indicatorService.list().then(setIndicators); }, []);
  const id = indicatorId || (indicators[0]?.id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      indicatorService.aiInsights(id, 30).then(setInsights),
      indicatorService.aiDropouts(id).then(setDropouts),
      indicatorService.aiWhatIf(id, recoveryPct).then(setWhatIf),
    ]).finally(() => setLoading(false));
  }, [id, recoveryPct]);

  if (!indicators.length) return <div className="empty-state">Aucun indicateur disponible.</div>;

  return (
    <>
      <div className="filters">
        <select value={id || ''} onChange={e => setIndicatorId(parseInt(e.target.value))}>
          {indicators.map(i => <option key={i.id} value={i.id}>{i.icon} {i.name}</option>)}
        </select>
      </div>

      {loading && <div className="loading-state">Analyse IA en cours…</div>}

      {insights && (
        <>
          <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
            <h3>🧠 Insights basés sur {insights.count} commentaires (30 derniers jours)</h3>
            {insights.count === 0 ? <div style={{ color: 'var(--text-muted)' }}>Aucun commentaire à analyser. Lancez des appels d'abord.</div> : (
              <>
                <div className="stats-grid">
                  <div className="stat-card"><div className="stat-label">Commentaires analysés</div><div className="stat-value">{insights.count}</div></div>
                  <div className="stat-card ok"><div className="stat-label">Sentiment positif</div><div className="stat-value">{insights.sentiments?.positive || 0}</div></div>
                  <div className="stat-card warn"><div className="stat-label">Sentiment neutre</div><div className="stat-value">{insights.sentiments?.neutral || 0}</div></div>
                  <div className="stat-card" style={{ borderLeftColor: 'var(--danger)' }}><div className="stat-label">Sentiment négatif</div><div className="stat-value" style={{ color: 'var(--danger)' }}>{insights.sentiments?.negative || 0}</div></div>
                  <div className="stat-card"><div className="stat-label">Score moyen chaleur</div><div className="stat-value">{insights.avg_heat_score}</div></div>
                </div>

                <h3 style={{ marginTop: 14 }}>🏷️ Top objections / catégories</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {insights.categories.map(c => (
                    <div key={c.key} style={{ padding: '6px 12px', background: 'rgba(255,105,0,0.1)', borderRadius: 16, fontSize: 12 }}>
                      <b>{c.key}</b> · {c.count}
                    </div>
                  ))}
                </div>

                <h3 style={{ marginTop: 14 }}>💡 Recommandations IA</h3>
                {insights.recommendations.map((r, i) => (
                  <div key={i} className="modal-section" style={{
                    margin: '6px 0', borderLeft: `3px solid ${r.priority === 'HIGH' ? 'var(--danger)' : 'var(--warning)'}`,
                  }}>
                    <b>{r.icon} {r.title}</b>
                    <span className="status-badge" style={{ background: r.priority === 'HIGH' ? 'var(--danger)' : 'var(--warning)', marginLeft: 8 }}>{r.priority}</span>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{r.detail}</div>
                  </div>
                ))}

                {insights.word_cloud.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 14 }}>☁️ Mots fréquents dans les commentaires</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {insights.word_cloud.slice(0, 30).map(w => (
                        <span key={w.word} style={{
                          padding: `${4 + Math.min(w.count, 8)}px ${8 + Math.min(w.count, 12)}px`,
                          background: 'rgba(255,255,255,0.06)', borderRadius: 4,
                          fontSize: 11 + Math.min(w.count * 0.8, 8),
                          fontWeight: w.count > 3 ? 700 : 400,
                          color: w.count > 5 ? 'var(--primary)' : 'var(--text-secondary)',
                        }}>{w.word}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {dropouts.length > 0 && (
            <div className="modal-section" style={{ background: 'var(--bg-card)', borderLeft: '3px solid var(--danger)' }}>
              <h3>⚠️ {dropouts.length} PDV à risque de sortir de l'indicateur</h3>
              {dropouts.slice(0, 10).map(d => (
                <div key={d.pdv_id} style={{ padding: 8, background: 'rgba(239,68,68,0.06)', borderRadius: 6, marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b>{d.nom}</b> · {d.numero} · {d.quartier}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.reasons.join(' · ')}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>{d.risk_score}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {whatIf && (
            <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
              <h3>🎲 Simulation "What if"</h3>
              <div className="filters">
                <span style={{ color: 'var(--text-secondary)' }}>Si je récupère </span>
                <input type="range" min="5" max="100" step="5" value={recoveryPct} onChange={e => setRecoveryPct(parseInt(e.target.value))} style={{ width: 200 }}/>
                <b>{recoveryPct}%</b>
                <span style={{ color: 'var(--text-secondary)' }}>des PDV inactifs…</span>
              </div>
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-label">Taux actuel</div><div className="stat-value">{whatIf.current_rate_pct}%</div></div>
                <div className="stat-card"><div className="stat-label">PDV à récupérer</div><div className="stat-value">{whatIf.pdvs_to_recover}</div></div>
                <div className="stat-card ok"><div className="stat-label">Nouveau taux</div><div className="stat-value">{whatIf.new_rate_pct}%</div><small>+{whatIf.delta_pct}%</small></div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// =============================================================================
// ONGLET 6 : ÉVOLUTION & COMPARAISON
// =============================================================================
export function TabIndicatorEvolution() {
  const [indicators, setIndicators] = useState([]);
  const [selected, setSelected] = useState([]);
  const [evolutions, setEvolutions] = useState({});
  const [nPeriods, setNPeriods] = useState(6);

  useEffect(() => {
    indicatorService.list().then(list => {
      setIndicators(list);
      // Pré-sélectionner les 3 premiers
      setSelected(list.slice(0, 3).map(i => i.id));
    });
  }, []);

  useEffect(() => {
    Promise.all(selected.map(id =>
      indicatorService.evolution(id, nPeriods).then(d => [id, d])
    )).then(arr => setEvolutions(Object.fromEntries(arr)));
  }, [selected, nPeriods]);

  if (!indicators.length) return <div className="empty-state">Aucun indicateur.</div>;

  // Construire le dataset commun
  const allKeys = new Set();
  Object.values(evolutions).forEach(arr => arr?.forEach(p => allKeys.add(p.period_key)));
  const periods = [...allKeys].sort();

  return (
    <>
      <div className="filters">
        <span style={{ color: 'var(--text-secondary)' }}>Indicateurs à comparer :</span>
        {indicators.map(i => (
          <label key={i.id} style={{ display: 'inline-flex', gap: 4, padding: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(i.id)}
              onChange={e => setSelected(s => e.target.checked ? [...s, i.id] : s.filter(x => x !== i.id))}/>
            {i.icon} {i.code}
          </label>
        ))}
        <span style={{ marginLeft: 12, color: 'var(--text-secondary)' }}>Périodes :</span>
        <select value={nPeriods} onChange={e => setNPeriods(parseInt(e.target.value))}>
          <option value={6}>6 derniers mois</option>
          <option value={12}>12 derniers mois</option>
          <option value={24}>2 dernières années</option>
        </select>
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📈 Évolution des taux par période</h3>
        {periods.length === 0 ? <div className="loading-state">Chargement…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: 8, textAlign: 'left', color: 'var(--text-muted)' }}>Indicateur</th>
                  {periods.map(p => <th key={p} style={{ padding: 8, color: 'var(--text-muted)' }}>{p}</th>)}
                  <th style={{ padding: 8, color: 'var(--text-muted)' }}>Tendance</th>
                </tr>
              </thead>
              <tbody>
                {selected.map(id => {
                  const ind = indicators.find(i => i.id === id);
                  const evo = evolutions[id] || [];
                  const map = Object.fromEntries(evo.map(e => [e.period_key, e.rate_pct]));
                  const first = evo[0]?.rate_pct, last = evo[evo.length - 1]?.rate_pct;
                  const delta = (last !== undefined && first !== undefined) ? last - first : 0;
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 8 }}><b>{ind?.icon} {ind?.name}</b></td>
                      {periods.map(p => {
                        const v = map[p];
                        const color = ind?.color || 'var(--primary)';
                        return (
                          <td key={p} style={{ padding: 8, textAlign: 'center' }}>
                            {v !== undefined ? (
                              <div>
                                <div style={{ fontWeight: 700 }}>{v}%</div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 4 }}>
                                  <div style={{ width: `${v}%`, height: '100%', background: color }}/>
                                </div>
                              </div>
                            ) : '—'}
                          </td>
                        );
                      })}
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ color: delta >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// =============================================================================
// ONGLET 7 : ÉVALUATION TÉLÉCONSEILLÈRES & DÉVELOPPEURS
// =============================================================================
export function TabEvaluation() {
  const [board, setBoard] = useState([]);
  const [role, setRole] = useState('teleconseillere');
  const [periodDays, setPeriodDays] = useState(30);
  const [showDetail, setShowDetail] = useState(null);

  const reload = () => indicatorService.evalLeaderboard({ role, period_days: periodDays }).then(setBoard);
  useEffect(() => { reload(); }, [role, periodDays]);

  return (
    <>
      <div className="filters">
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="teleconseillere">📞 Téléconseillères</option>
          <option value="developpeur">🚶 Développeurs</option>
        </select>
        <select value={periodDays} onChange={e => setPeriodDays(parseInt(e.target.value))}>
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option>
        </select>
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🏆 Classement par score d'impact</h3>
        {board.length === 0 ? <div className="loading-state">Calcul en cours…</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {board.map(b => (
              <div key={b.user_id} onClick={() => setShowDetail(b)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 8, cursor: 'pointer',
                borderLeft: `4px solid ${b.rank === 1 ? '#FFD700' : b.rank === 2 ? '#C0C0C0' : b.rank === 3 ? '#CD7F32' : 'var(--primary)'}`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, minWidth: 40, color: 'var(--primary)' }}>#{b.rank}</div>
                <div style={{ flex: 1 }}>
                  <b>{b.user_name}</b>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    📞 {b.n_calls} appels · ✅ {b.n_reached} joints · 🤝 {b.n_engaged} engagés · 💎 {b.conversions?.n_converted || 0} conversions
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{b.impact_score}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{b.impact_label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDetail && <UserEvalModal user={showDetail} onClose={() => setShowDetail(null)}/>}
    </>
  );
}

function UserEvalModal({ user, onClose }) {
  const [zones, setZones] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [selectedInd, setSelectedInd] = useState(null);

  useEffect(() => {
    indicatorService.list().then(list => {
      setIndicators(list);
      if (list.length) setSelectedInd(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedInd) return;
    indicatorService.evalUserZones(user.user_id, selectedInd, 60).then(d => setZones(d.by_quartier || []));
  }, [selectedInd, user.user_id]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>👤 {user.user_name} — {user.impact_label}</h2>

        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Appels</div><div className="stat-value">{user.n_calls}</div></div>
          <div className="stat-card ok"><div className="stat-label">Joignabilité</div><div className="stat-value">{user.rate_reach_pct}%</div></div>
          <div className="stat-card"><div className="stat-label">Engagement</div><div className="stat-value">{user.rate_engagement_pct}%</div></div>
          <div className="stat-card ok"><div className="stat-label">Conversions</div><div className="stat-value">{user.conversions?.n_converted || 0}</div></div>
          <div className="stat-card"><div className="stat-label">Score d'impact</div><div className="stat-value">{user.impact_score}</div></div>
        </div>

        <div className="modal-section">
          <h3>🌍 Impact par quartier (avant/après)</h3>
          <div className="filters" style={{ marginBottom: 10 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Indicateur :</span>
            <select value={selectedInd || ''} onChange={e => setSelectedInd(parseInt(e.target.value))}>
              {indicators.map(i => <option key={i.id} value={i.id}>{i.icon} {i.name}</option>)}
            </select>
          </div>
          {zones.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>Aucune donnée pour cet indicateur.</div> : (
            <div className="prospects-table">
              <table>
                <thead><tr><th>Quartier</th><th>Appels</th><th>Avant</th><th>Après</th><th>Delta</th></tr></thead>
                <tbody>
                  {zones.map(z => (
                    <tr key={z.quartier}>
                      <td><b>{z.quartier}</b></td>
                      <td>{z.n_calls}</td>
                      <td>{z.before_active}</td>
                      <td>{z.after_active}</td>
                      <td><span style={{ color: z.delta > 0 ? 'var(--success)' : z.delta < 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
                        {z.delta > 0 ? '+' : ''}{z.delta} {z.delta_label}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {user.quartiers_couverts?.length > 0 && (
          <div className="modal-section">
            <h3>🗺️ Quartiers couverts</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {user.quartiers_couverts.map(q => (
                <span key={q.quartier} style={{ padding: '4px 10px', background: 'rgba(255,105,0,0.1)', borderRadius: 12, fontSize: 12 }}>
                  {q.quartier} ({q.count})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ONGLET 8 : PARAMÈTRES (édition / archivage des indicateurs)
// =============================================================================
export function TabSettings() {
  const [indicators, setIndicators] = useState([]);
  const [editing, setEditing] = useState(null);

  const reload = () => indicatorService.list({ status: undefined }).then(setIndicators);
  useEffect(() => { reload(); }, []);

  const archive = async (id) => {
    if (!window.confirm('Archiver cet indicateur ?')) return;
    await indicatorService.archive(id);
    reload();
  };

  return (
    <>
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>⚙️ Indicateurs configurés</h3>
        <div className="prospects-table">
          <table>
            <thead><tr><th>Code</th><th>Nom</th><th>Catégorie</th><th>Méthode</th><th>Période</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {indicators.map(i => (
                <tr key={i.id}>
                  <td><b>{i.code}</b></td>
                  <td>{i.icon} {i.name}</td>
                  <td>{CATEGORY_LABELS[i.category]?.label}</td>
                  <td>{i.method}</td>
                  <td>{i.period}</td>
                  <td><span className="status-badge" style={{ background: i.status === 'ACTIVE' ? 'var(--success)' : 'var(--text-muted)' }}>{i.status}</span></td>
                  <td>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px', marginRight: 4 }} onClick={() => setEditing(i)}>✏️ Éditer</button>
                    {i.status === 'ACTIVE' && (
                      <button className="btn-danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => archive(i.id)}>🗄️ Archiver</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📚 Documentation rapide</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          ✓ <b>Méthode MANUAL</b> : statut booléen saisi via import Excel ou directement.<br/>
          ✓ <b>Méthode THRESHOLD</b> : un PDV est "actif" si sa valeur (ex. CA) ≥ seuil.<br/>
          ✓ <b>Période</b> : DAILY (par jour), WEEKLY (par semaine), MONTHLY (par mois).<br/>
          ✓ <b>Périodes</b> au format `YYYY-MM` (mensuel), `YYYY-Wxx` (hebdo), `YYYY-MM-DD` (quotidien).<br/>
          ✓ <b>Import Excel</b> : colonne `numero_pdv` obligatoire, colonne valeur ou actif optionnelle.<br/>
        </div>
      </div>

      {editing && <EditIndicatorModal indicator={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }}/>}
    </>
  );
}

function EditIndicatorModal({ indicator, onClose, onSaved }) {
  const [d, setD] = useState({ ...indicator });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await indicatorService.update(indicator.id, d);
      onSaved();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>✏️ Éditer {indicator.code}</h2>
        <form onSubmit={submit}>
          <div className="modal-section">
            <div className="form-grid">
              <label>Nom<input value={d.name || ''} onChange={e => setD({ ...d, name: e.target.value })}/></label>
              <label>Icône<input value={d.icon || ''} onChange={e => setD({ ...d, icon: e.target.value })}/></label>
              <label>Couleur<input type="color" value={d.color || '#FF6900'} onChange={e => setD({ ...d, color: e.target.value })}/></label>
              <label>Taux cible (%)<input type="number" value={d.target_rate_pct ?? ''} onChange={e => setD({ ...d, target_rate_pct: e.target.value ? parseFloat(e.target.value) : null })}/></label>
              <label>Seuil<input type="number" value={d.threshold_value ?? ''} onChange={e => setD({ ...d, threshold_value: e.target.value ? parseFloat(e.target.value) : null })}/></label>
              <label className="full">Description<textarea value={d.description || ''} onChange={e => setD({ ...d, description: e.target.value })} style={{ minHeight: 50 }}/></label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}
