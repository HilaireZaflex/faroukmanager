import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus, Download, ChevronRight, CheckCircle, Circle, AlertTriangle } from 'lucide-react';
import evalService, { ROLE_LABELS, STATUS_LABELS, SCORE_COLOR } from '../services/evaluationService';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import './ProspectionPage.css';

// =============================================================================
// PAGE PRINCIPALE — Évaluations 360°
// =============================================================================
export default function EvaluationsPage() {
  const [activeTab, setActiveTab] = useState('comment-ca-marche');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  const tabs = [
    { id: 'comment-ca-marche', label: '❓ Comment ça marche ?' },
    { id: 'campagnes',         label: '📋 Mes campagnes' },
    { id: 'notes-manuelles',   label: '✍️ Saisir des notes' },
    { id: 'appels-mysteres',   label: '🕵️ Appels mystères (TC)' },
    { id: 'resultats',         label: '🏆 Résultats & PDF' },
    { id: 'configuration',     label: '⚙️ Configuration' },
  ];

  return (
    <div className="prospection-page">
      <div className="prospection-header">
        <h1>
          <span>🏆 Évaluations 360° — Performance du réseau</span>
          <small>Superviseurs · Gestionnaires · Développeurs · Téléconseillères</small>
        </h1>
        <div className="header-actions">
          <button className="btn-secondary" onClick={refresh}><RefreshCw size={14}/> Actualiser</button>
        </div>
      </div>

      <div className="tabs-container mb-24">
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'comment-ca-marche' && <TabGuide key={refreshKey} onStart={() => setActiveTab('campagnes')}/>}
      {activeTab === 'campagnes'         && <TabCampagnes key={refreshKey}/>}
      {activeTab === 'notes-manuelles'   && <TabNotesManuelles key={refreshKey}/>}
      {activeTab === 'appels-mysteres'   && <TabAppelsMysteres key={refreshKey}/>}
      {activeTab === 'resultats'         && <TabResultats key={refreshKey}/>}
      {activeTab === 'configuration'     && <TabConfiguration key={refreshKey}/>}
    </div>
  );
}

// =============================================================================
// ONGLET 1 : GUIDE "COMMENT ÇA MARCHE ?"
// =============================================================================
function TabGuide({ onStart }) {
  return (
    <>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,105,0,0.12), rgba(255,105,0,0.04))',
        border: '1px solid rgba(255,105,0,0.3)',
        borderRadius: 'var(--radius)', padding: 24, marginBottom: 20,
      }}>
        <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
          🎯 Le module Évaluation en quelques mots
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Ce module permet d'<b>évaluer objectivement</b> chaque membre du réseau (superviseurs, gestionnaires, développeurs, téléconseillères).
          Le système combine <b>données automatiques</b> (KPI du réseau) et <b>évaluation humaine</b> (appels mystères + notes manuelles).
        </p>
      </div>

      {/* Le processus en 5 étapes */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🔄 Le processus d'évaluation — 5 étapes</h3>
        {[
          {
            n: 1, emoji: '📋', color: '#3b82f6',
            titre: 'Admin/RC crée une campagne',
            qui: 'Admin ou RC',
            quoi: 'Choisir qui évaluer (superviseurs ? développeurs ?), pour quelle période (avril 2026 ?), et quelles téléconseillères feront les appels mystères.',
            exemple: 'Ex : "Évaluation Superviseurs — Avril 2026"',
            action: 'Onglet "Mes campagnes" → Nouvelle campagne',
          },
          {
            n: 2, emoji: '🕵️', color: '#8b5cf6',
            titre: 'Génération des appels mystères',
            qui: 'Système automatique',
            quoi: 'Le système tire au sort 5 PDV par agent évalué et les distribue aux téléconseillères avec la question à poser. Les TC voient leur liste directement.',
            exemple: 'Ex : TC Aminata doit appeler 5 PDV de la zone de Superviseur Mariam.',
            action: 'Dans la campagne → "Générer appels mystères"',
          },
          {
            n: 3, emoji: '📞', color: '#10b981',
            titre: 'Les TC font leurs appels mystères',
            qui: 'Téléconseillères',
            quoi: 'Chaque TC appelle les PDV assignés et pose la question (ex: "Quand votre superviseur est-il passé ?"). Elle note la réponse et donne une note sur 10.',
            exemple: 'PDV répond : "Il y a 3 jours" → TC donne 8/10',
            action: 'Onglet "Appels mystères (TC)"',
          },
          {
            n: 4, emoji: '✍️', color: '#f59e0b',
            titre: 'RC/Admin saisit les notes manuelles',
            qui: 'RC ou Admin',
            quoi: 'Pour le test de connaissance terrain : RC appelle le superviseur, lui donne 5 PDV au hasard et lui demande leur localisation. Il note sa réponse sur 10. Pareil pour les autres critères non automatiques.',
            exemple: 'Superviseur identifie 4/5 PDV correctement → note 8/10',
            action: 'Onglet "Saisir des notes"',
          },
          {
            n: 5, emoji: '🏆', color: '#FF6900',
            titre: 'Calcul du score final & clôture',
            qui: 'Admin (un clic)',
            quoi: 'Le système combine automatiquement : KPI du réseau (40%) + notes appels mystères (30%) + test terrain (20%) + notes manuelles (10%). Score sur 100, classement, bonus et rapport PDF.',
            exemple: 'Superviseur Mariam : 74.8/100 → "Bien ✓" → Bonus 5%',
            action: 'Dans la campagne → "Calculer tous les scores" → "Clôturer"',
          },
        ].map(step => (
          <div key={step.n} style={{
            display: 'flex', gap: 16, padding: '16px 0',
            borderBottom: step.n < 5 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: step.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>
              {step.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <b style={{ color: 'var(--text-primary)', fontSize: 15 }}>Étape {step.n} — {step.titre}</b>
                <span style={{ fontSize: 11, padding: '2px 8px', background: `${step.color}20`, color: step.color, borderRadius: 99, fontWeight: 600 }}>
                  {step.qui}
                </span>
              </div>
              <p style={{ margin: '0 0 6px 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                {step.quoi}
              </p>
              <div style={{ fontSize: 12, color: step.color, fontStyle: 'italic' }}>💡 {step.exemple}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                📍 <b>Où aller :</b> {step.action}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tableau des pondérations */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {[
          { role: 'SUPERVISEUR', poids: [['KPI automatiques', 40], ['Appels mystères PDV', 30], ['Test connaissance terrain', 20], ['Notes RC/Admin', 10]] },
          { role: 'GESTIONNAIRE', poids: [['KPI automatiques', 60], ['Appels mystères PDV', 40]] },
          { role: 'DEVELOPPEUR', poids: [['Performance commerciale', 40], ['Qualité terrain', 30], ['Contribution indicateurs', 20], ['Discipline/SLA', 10]] },
          { role: 'TELECONSEILLERE', poids: [['Volume appels', 30], ['Qualité interactions', 30], ['Impact terrain', 30], ['Appels mystères retour', 10]] },
        ].map(r => (
          <div key={r.role} className="modal-section" style={{ background: 'var(--bg-card)', margin: 0 }}>
            <h3 style={{ color: ROLE_LABELS[r.role]?.color }}>{ROLE_LABELS[r.role]?.label}</h3>
            {r.poids.map(([label, pct]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span>{label}</span><b>{pct}%</b>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: ROLE_LABELS[r.role]?.color }}/>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button className="btn-primary" style={{ fontSize: 15, padding: '12px 32px' }} onClick={onStart}>
          📋 Commencer — Créer ma première campagne <ChevronRight size={16}/>
        </button>
      </div>
    </>
  );
}

// =============================================================================
// ONGLET 2 : MES CAMPAGNES — avec wizard guidé
// =============================================================================
function TabCampagnes() {
  const [campaigns, setCampaigns] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [users, setUsers] = useState([]);
  const [filterRole, setFilterRole] = useState('SUPERVISEUR');
  const [mysteryResult, setMysteryResult] = useState(null); // résultat génération appels mystères
  const [mysteryGenModal, setMysteryGenModal] = useState(null); // modal choisir agent+TC

  const reload = () => evalService.listCampaigns({ role_type: filterRole || undefined }).then(setCampaigns);
  useEffect(() => {
    evalService.listCampaigns({ role_type: filterRole || undefined }).then(setCampaigns);
    api.get('/auth/users').then(r => setUsers(r.data)).catch(() => {});
  }, [filterRole]);

  const tcs = users.filter(u => u.role === 'teleconseillere');

  const handleAction = async (action, campaignId) => {
    try {
      if (action === 'mystery') {
        // Ouvrir le modal de sélection agent + TC
        const campaign = campaigns.find(c => c.id === campaignId);
        setMysteryGenModal({ campaign, campaignId });
      } else if (action === 'compute') {
        const r = await evalService.computeAll(campaignId);
        alert(`✅ Scores calculés !\n\n${r.computed} agent(s) évalué(s) sur ${r.total}.\nVous pouvez maintenant clôturer ou continuer à saisir des notes.`);
        reload();
      } else if (action === 'close') {
        if (!window.confirm('Clôturer cette campagne ?\n\nLes scores seront définitifs. Les classements seront calculés.')) return;
        await evalService.closeCampaign(campaignId);
        alert('✅ Campagne clôturée ! Consultez les résultats dans "Résultats & PDF".');
        reload();
      } else if (action === 'delete') {
        if (!window.confirm('⚠️ Supprimer cette campagne ?\n\nToutes les données (scores, appels mystères, notes) seront définitivement supprimées.')) return;
        await api.delete(`/evaluations/campaigns/${campaignId}`);
        reload();
      }
    } catch (err) { alert('Erreur : ' + (err.response?.data?.detail || err.message)); }
  };

  // Étapes d'une campagne (pour l'affichage visuel)
  const getSteps = (c) => [
    { label: 'Campagne créée',         done: true },
    { label: 'Appels mystères générés', done: c.n_scores > 0 || c.status === 'ACTIVE' },
    { label: 'Notes saisies',           done: c.n_final > 0 },
    { label: 'Scores calculés',         done: ['CLOSED', 'REVIEW'].includes(c.status) || c.n_final === c.n_scores },
    { label: 'Clôturé',                 done: c.status === 'CLOSED' },
  ];

  return (
    <>
      <div className="filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={14}/> Créer une campagne d'évaluation
        </button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Afficher :</span>
          {[
            { key: 'SUPERVISEUR', label: '👤 Superviseurs', color: '#3b82f6' },
            { key: 'GESTIONNAIRE', label: '💼 Gestionnaires', color: '#8b5cf6' },
            { key: 'DEVELOPPEUR', label: '🚶 Développeurs', color: '#10b981' },
            { key: 'TELECONSEILLERE', label: '📞 Téléconseillères', color: '#f97316' },
            { key: '', label: '🔍 Toutes', color: '#64748b' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setFilterRole(opt.key)}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: `1.5px solid ${filterRole === opt.key ? opt.color : 'var(--border)'}`,
                background: filterRole === opt.key ? `${opt.color}20` : 'transparent',
                color: filterRole === opt.key ? opt.color : 'var(--text-muted)',
                fontWeight: filterRole === opt.key ? 700 : 400,
                transition: 'all 0.2s',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{campaigns.length} campagne(s)</span>
      </div>

      {campaigns.length === 0 ? (
        <div className="empty-state">
          📋 Aucune campagne encore.<br/>
          <small>Cliquez sur "Créer une campagne" pour démarrer votre première évaluation.</small>
        </div>
      ) : (
        /* ── Nouveau design : tableau compact ── */
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {/* En-tête tableau */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
            background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)',
            padding: '10px 16px', gap: 8,
          }}>
            {['Campagne', 'Période', 'Agents', 'Statut', 'Progression', 'Actions'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {/* Lignes */}
          {campaigns.map((c, idx) => {
            const roleInfo = ROLE_LABELS[c.role_type] || {};
            const statusInfo = STATUS_LABELS[c.status] || {};
            const progress = c.n_scores > 0 ? Math.round((c.n_final / c.n_scores) * 100) : 0;
            const isClosed = c.status === 'CLOSED';
            const isActive = c.status === 'ACTIVE';
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
                padding: '14px 16px', gap: 8, alignItems: 'center',
                borderBottom: idx < campaigns.length - 1 ? '1px solid var(--border)' : 'none',
                borderLeft: `3px solid ${roleInfo.color || 'var(--border)'}`,
                background: isClosed ? 'rgba(34,197,94,0.03)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = isClosed ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = isClosed ? 'rgba(34,197,94,0.03)' : 'transparent'}
              >
                {/* Campagne */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{roleInfo.label?.split(' ')[0]}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                  </div>
                  {/* Étapes mini */}
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    {getSteps(c).map((s, i) => (
                      <div key={i} title={s.label} style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: s.done ? 'var(--success)' : 'rgba(255,255,255,0.12)',
                        border: `1px solid ${s.done ? 'var(--success)' : 'var(--border)'}`,
                      }}/>
                    ))}
                  </div>
                </div>

                {/* Période */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.period_key}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.date_start ? c.date_start.slice(5) : ''} → {c.date_end ? c.date_end.slice(5) : ''}
                  </div>
                </div>

                {/* Agents */}
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.n_scores}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> agents</span>
                  {c.n_final > 0 && (
                    <div style={{ fontSize: 11, color: '#3b82f6' }}>{c.n_final} scoré(s)</div>
                  )}
                </div>

                {/* Statut */}
                <div>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: `${statusInfo.color || '#64748b'}22`, color: statusInfo.color || 'var(--text-muted)',
                    border: `1px solid ${statusInfo.color || '#64748b'}44`,
                  }}>
                    {statusInfo.label || c.status}
                  </span>
                </div>

                {/* Barre progression */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Scores calculés</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: progress === 100 ? 'var(--success)' : 'var(--text-muted)' }}>{progress}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{
                      height: '100%', borderRadius: 3, transition: 'width 0.5s',
                      width: `${progress}%`,
                      background: progress === 100 ? 'var(--success)' : progress > 0 ? '#3b82f6' : 'transparent',
                    }}/>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => setSelected(c)}
                    title="Voir le détail"
                    style={{
                      padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14,
                    }}>👁</button>
                  {c.status === 'DRAFT' && (
                    <button onClick={() => handleAction('mystery', c.id)}
                      title="Générer les appels mystères"
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: '1px solid #8b5cf6',
                        background: 'rgba(139,92,246,0.12)', color: '#8b5cf6',
                        cursor: 'pointer', fontSize: 14,
                      }}>🕵️</button>
                  )}
                  {!isClosed && (
                    <button onClick={() => handleAction('compute', c.id)}
                      title="Calculer les scores"
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: '1px solid #3b82f6',
                        background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                        cursor: 'pointer', fontSize: 14,
                      }}>▶</button>
                  )}
                  {['DRAFT', 'ACTIVE', 'REVIEW'].includes(c.status) && c.n_final > 0 && (
                    <button onClick={() => handleAction('close', c.id)}
                      title="Clôturer"
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: '1px solid var(--success)',
                        background: 'rgba(34,197,94,0.12)', color: 'var(--success)',
                        cursor: 'pointer', fontSize: 14,
                      }}>🔒</button>
                  )}
                  {isClosed && (
                    <span style={{ fontSize: 16 }} title="Clôturé">✅</span>
                  )}
                  <button onClick={() => handleAction('delete', c.id)}
                    title="Supprimer la campagne"
                    style={{
                      padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)',
                      background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                      cursor: 'pointer', fontSize: 14,
                    }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Légende des boutons */}
      {campaigns.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>👁 Voir détail</span>
          <span>🕵️ Générer appels mystères</span>
          <span>▶ Calculer scores</span>
          <span>🔒 Clôturer</span>
        </div>
      )}

      {showCreate && <WizardCreerCampagne users={users} tcs={tcs}
        onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }}/>}
      {selected && <CampagneDetailModal campaign={selected} users={users}
        onClose={() => setSelected(null)}/>}

      {/* Modal choisir agent + TC pour générer les appels mystères */}
      {mysteryGenModal && (
        <MysteryGenModal
          campaign={mysteryGenModal.campaign}
          campaignId={mysteryGenModal.campaignId}
          users={users}
          tcs={tcs}
          onClose={() => setMysteryGenModal(null)}
          onDone={(result) => { setMysteryGenModal(null); setMysteryResult(result); }}
        />
      )}

      {/* Modal résultat génération appels mystères avec 2 sections */}
      {mysteryResult && (
        <MysteryResultModal result={mysteryResult} onClose={() => setMysteryResult(null)}/>
      )}
    </>
  );
}

// Wizard création simplifié (3 étapes)
/* ── Modal sélection agent + TC pour générer les appels mystères ── */
function MysteryGenModal({ campaign, campaignId, users, tcs, onClose, onDone }) {
  const ROLE_MAP = { SUPERVISEUR: 'superviseur', GESTIONNAIRE: 'manager', DEVELOPPEUR: 'developpeur', TELECONSEILLERE: 'teleconseillere' };
  const roleType = campaign?.role_type || 'SUPERVISEUR';
  const agents = users.filter(u => u.role === ROLE_MAP[roleType]);

  const [agentId, setAgentId] = useState(agents[0]?.id || '');
  const [tcId, setTcId] = useState(tcs[0]?.id || '');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!agentId || !tcId) { alert('Veuillez choisir un agent et une TC.'); return; }
    setBusy(true);
    try {
      const r = await api.post(`/evaluations/campaigns/${campaignId}/generate-mystery-for-agent`, {
        agent_id: parseInt(agentId), tc_id: parseInt(tcId),
      });
      onDone({ ...r.data, campaignId });
    } catch (err) { alert('Erreur : ' + (err.response?.data?.detail || err.message)); }
    finally { setBusy(false); }
  };

  const selectedAgent = agents.find(u => u.id === parseInt(agentId));
  const selectedTC = tcs.find(u => u.id === parseInt(tcId));
  const roleColor = { SUPERVISEUR: '#3b82f6', GESTIONNAIRE: '#8b5cf6', DEVELOPPEUR: '#10b981', TELECONSEILLERE: '#f97316' }[roleType] || '#3b82f6';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h2>🕵️ Générer les appels mystères</h2>
        <div style={{ padding: '10px 14px', background: 'rgba(139,92,246,0.08)', borderRadius: 8, borderLeft: '3px solid #8b5cf6', marginBottom: 20, fontSize: 13 }}>
          Sélectionnez l'agent à évaluer et la TC qui effectuera les appels.<br/>
          <b>10 PDV seront générés automatiquement</b> : 5 pour vérifier le dernier passage + 5 pour tester la géolocalisation terrain.
        </div>

        {/* Sélection agent */}
        <div className="modal-section">
          <h3 style={{ marginBottom: 10 }}>👤 Agent à évaluer</h3>
          {agents.length === 0 ? (
            <div style={{ color: '#ef4444', fontSize: 13 }}>Aucun agent de ce rôle trouvé.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {agents.map(u => {
                const sel = parseInt(agentId) === u.id;
                return (
                  <div key={u.id} onClick={() => setAgentId(u.id)} style={{
                    padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
                    background: sel ? `${roleColor}20` : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${sel ? roleColor : 'var(--border)'}`,
                    color: sel ? roleColor : 'var(--text-muted)',
                    fontWeight: sel ? 700 : 400, transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', background: sel ? `${roleColor}30` : 'rgba(255,255,255,0.08)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: sel ? roleColor : 'var(--text-muted)',
                    }}>{(u.prenom?.[0] || '') + (u.nom?.[0] || '')}</span>
                    {u.prenom} {u.nom}
                    {sel && <span>✓</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sélection TC */}
        <div className="modal-section">
          <h3 style={{ marginBottom: 10 }}>📞 Téléconseillère assignée</h3>
          {tcs.length === 0 ? (
            <div style={{ color: '#ef4444', fontSize: 13 }}>Aucune TC disponible.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tcs.map(u => {
                const sel = parseInt(tcId) === u.id;
                return (
                  <div key={u.id} onClick={() => setTcId(u.id)} style={{
                    padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
                    background: sel ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${sel ? '#8b5cf6' : 'var(--border)'}`,
                    color: sel ? '#8b5cf6' : 'var(--text-muted)',
                    fontWeight: sel ? 700 : 400, transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', background: sel ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.08)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: sel ? '#8b5cf6' : 'var(--text-muted)',
                    }}>{(u.prenom?.[0] || '') + (u.nom?.[0] || '')}</span>
                    {u.prenom} {u.nom}
                    {sel && <span>✓</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Résumé */}
        {selectedAgent && selectedTC && (
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 8 }}>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              ✅ <b>{selectedAgent.prenom} {selectedAgent.nom}</b> sera évalué(e) par <b>{selectedTC.prenom} {selectedTC.nom}</b><br/>
              📞 <b>10 PDV</b> seront générés : 5 "dernier passage" + 5 "géolocalisation terrain"
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={busy || !agentId || !tcId} onClick={generate}
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
            {busy ? '⏳ Génération…' : '🕵️ Générer les 10 PDV'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal résultat génération appels mystères — 2 sections ── */
function MysteryResultModal({ result, onClose }) {
  const [noteModal, setNoteModal] = useState(null); // tâche à noter
  const [notedIds, setNotedIds] = useState(new Set());

  // result.tasks vient directement du backend (generate_mystery_for_agent)
  const tasks = result.tasks || [];
  const lastVisit = tasks.filter(t => t.call_type === 'LAST_VISIT');
  const geoKnowledge = tasks.filter(t => t.call_type === 'GEO_KNOWLEDGE');
  const tcName = result.tc_name || '—';
  const agentName = result.agent_name || '—';

  const PDVRow = ({ t, section }) => {
    const noted = notedIds.has(t.id);
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10,
        alignItems: 'center', padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: noted ? 'rgba(34,197,94,0.05)' : 'transparent',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            {t.pdv_nom || t.pdv_numero || `PDV #${t.pdv_id}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
            {t.question}
          </div>
        </div>
        <a href={`tel:${t.pdv_telephone}`} style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
          border: '1px solid rgba(59,130,246,0.3)', textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>
          📞 {t.pdv_telephone || '—'}
        </a>
        {noted ? (
          <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✅ Noté</span>
        ) : (
          <button onClick={() => setNoteModal(t)} style={{
            padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'rgba(139,92,246,0.12)', color: '#8b5cf6',
            border: '1px solid rgba(139,92,246,0.3)', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            ✍️ Noter /10
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <h2>🕵️ Appels mystères — {agentName}</h2>

        {/* Résumé */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            { icon: '👤', label: 'Agent évalué', val: agentName, color: '#3b82f6' },
            { icon: '📞', label: 'TC assignée', val: tcName, color: '#8b5cf6' },
            { icon: '📋', label: 'PDV générés', val: `${tasks.length} (5+5)`, color: '#f97316' },
          ].map(item => (
            <div key={item.label} style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              background: `${item.color}10`, border: `1px solid ${item.color}30`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.val}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxHeight: 480, overflow: 'auto' }}>
          {/* Section 1 : Dernier passage */}
          <div>
            <div style={{
              padding: '8px 14px', borderRadius: '8px 8px 0 0',
              background: 'rgba(249,115,22,0.12)', borderBottom: '2px solid #f97316',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f97316' }}>Dernier passage</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>La TC demande au PDV quand l'agent est passé</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#f97316', fontWeight: 700 }}>{lastVisit.length} PDV</span>
            </div>
            <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
              {lastVisit.map(t => <PDVRow key={t.id} t={t} section="last_visit"/>)}
              {lastVisit.length === 0 && <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>Aucun PDV</div>}
            </div>
          </div>

          {/* Section 2 : Géolocalisation terrain */}
          <div>
            <div style={{
              padding: '8px 14px', borderRadius: '8px 8px 0 0',
              background: 'rgba(139,92,246,0.12)', borderBottom: '2px solid #8b5cf6',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>🗺️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#8b5cf6' }}>Géolocalisation terrain</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>L'agent doit donner la localisation précise</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b5cf6', fontWeight: 700 }}>{geoKnowledge.length} PDV</span>
            </div>
            <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
              {geoKnowledge.map(t => <PDVRow key={t.id} t={t} section="geo"/>)}
              {geoKnowledge.length === 0 && <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>Aucun PDV</div>}
            </div>
          </div>
        </div>

        <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, borderLeft: '3px solid var(--success)', marginTop: 16, fontSize: 13 }}>
          ✅ <b>{tcName}</b> verra ces {tasks.length} PDV dans son onglet "Appels mystères (TC)". Vous pouvez aussi noter directement ci-dessus.
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>✓ Fermer</button>
        </div>
      </div>

      {/* Mini modal noter /10 */}
      {noteModal && (
        <div className="modal-backdrop" onClick={() => setNoteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2>✍️ Noter l'appel</h2>
            <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <b style={{ fontSize: 12, color: '#8b5cf6' }}>PDV :</b> {noteModal.pdv_nom || noteModal.pdv_numero}<br/>
              <b style={{ fontSize: 12, color: '#8b5cf6' }}>Question :</b> {noteModal.question}
            </div>
            <MysteryCallForm taskId={noteModal.id} onDone={() => {
              setNotedIds(s => new Set([...s, noteModal.id]));
              setNoteModal(null);
            }}/>
          </div>
        </div>
      )}
    </div>
  );
}

function WizardCreerCampagne({ users, tcs, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const now = new Date();
  const defaultRoleUsers = users.filter(u => u.role === 'superviseur');
  const [d, setD] = useState({
    name: `Évaluation Superviseurs — ${now.toISOString().slice(0, 7)}`,
    role_type: 'SUPERVISEUR', period_type: 'MONTHLY',
    period_key: now.toISOString().slice(0, 7),
    date_start: now.toISOString().slice(0, 10),
    date_end: new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0, 10),
    n_mystery_calls: 5,
    target_user_ids: defaultRoleUsers.map(u => u.id),
    mystery_call_user_ids: tcs.map(u => u.id),
  });
  const [busy, setBusy] = useState(false);

  const ROLE_MAP = { SUPERVISEUR: 'superviseur', GESTIONNAIRE: 'manager', DEVELOPPEUR: 'developpeur', TELECONSEILLERE: 'teleconseillere' };
  const roleUsers = users.filter(u => u.role === ROLE_MAP[d.role_type]);

  // Quand on change le rôle, sélectionner automatiquement tous les agents du nouveau rôle
  const setRole = (key) => {
    const val = ROLE_LABELS[key];
    const newRoleUsers = users.filter(u => u.role === ROLE_MAP[key]);
    setD(s => ({
      ...s, role_type: key,
      name: `Évaluation ${val?.label?.replace(/^\S+\s/, '') || key} — ${s.period_key}`,
      target_user_ids: newRoleUsers.map(u => u.id),
      mystery_call_user_ids: tcs.map(u => u.id),
    }));
  };

  // Quand on change la période, on met à jour le nom
  const setPeriodKey = (pk) => {
    const val = ROLE_LABELS[d.role_type];
    setD(s => ({
      ...s, period_key: pk,
      name: `Évaluation ${val?.label?.replace(/^\S+\s/, '') || s.role_type} — ${pk}`,
    }));
  };

  const submit = async () => {
    if (d.target_user_ids.length === 0) {
      alert('⚠️ Veuillez sélectionner au moins un agent à évaluer.');
      return;
    }
    if (d.mystery_call_user_ids.length === 0) {
      alert('⚠️ Veuillez sélectionner au moins une téléconseillère pour les appels mystères.');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...d };
      await evalService.createCampaign(payload);
      onSaved();
    } catch (err) { alert('Erreur: ' + (err.response?.data?.detail || err.message)); }
    finally { setBusy(false); }
  };

  // Couleur du rôle actif
  const roleColor = ROLE_LABELS[d.role_type]?.color || 'var(--primary)';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>

        {/* Barre de progression */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderRadius: 8, overflow: 'hidden' }}>
          {[
            { n: 1, label: '① Rôle & Période' },
            { n: 2, label: '② Confirmation' },
          ].map((s, i) => (
            <div key={s.n} style={{
              flex: 1, padding: '8px 16px', fontSize: 12, fontWeight: step >= s.n ? 700 : 400,
              background: step >= s.n ? `${roleColor}22` : 'rgba(255,255,255,0.04)',
              color: step >= s.n ? roleColor : 'var(--text-muted)',
              borderBottom: `2px solid ${step >= s.n ? roleColor : 'transparent'}`,
              transition: 'all 0.3s', textAlign: 'center',
            }}>{s.label}</div>
          ))}
        </div>

        {/* ── ÉTAPE 1 : Rôle + Période ── */}
        {step === 1 && (
          <>
            <h2 style={{ marginBottom: 20 }}>🎯 Nouvelle campagne d'évaluation</h2>

            {/* Sélection rôle */}
            <div className="modal-section">
              <h3 style={{ marginBottom: 10 }}>1. Qui évaluez-vous ?</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {Object.entries(ROLE_LABELS).map(([key, val]) => {
                  const cnt = users.filter(u => u.role === ROLE_MAP[key]).length;
                  return (
                    <div key={key} onClick={() => setRole(key)} style={{
                      padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                      background: d.role_type === key ? `${val.color}18` : 'rgba(255,255,255,0.03)',
                      border: `2px solid ${d.role_type === key ? val.color : 'var(--border)'}`,
                      transition: 'all 0.2s', position: 'relative',
                    }}>
                      <div style={{ fontSize: 26, marginBottom: 4 }}>{val.label.split(' ')[0]}</div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: d.role_type === key ? val.color : 'var(--text-primary)' }}>
                        {val.label.replace(/^\S+\s/, '')}
                      </div>
                      <div style={{
                        marginTop: 6, fontSize: 11, padding: '2px 6px', borderRadius: 10,
                        background: `${val.color}22`, color: val.color, display: 'inline-block',
                      }}>{cnt} agent{cnt > 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Période */}
            <div className="modal-section">
              <h3 style={{ marginBottom: 10 }}>2. Quelle période ?</h3>
              <div className="form-grid">
                <label>Type de période
                  <select value={d.period_type} onChange={e => setD({...d, period_type: e.target.value})}>
                    <option value="WEEKLY">Hebdomadaire</option>
                    <option value="MONTHLY">Mensuel</option>
                    <option value="QUARTERLY">Trimestriel</option>
                    <option value="CUSTOM">Personnalisé</option>
                  </select>
                </label>
                <label>Identifiant période
                  <input value={d.period_key} onChange={e => setPeriodKey(e.target.value)} placeholder="ex: 2026-04"/>
                </label>
                <label>Date de début
                  <input type="date" value={d.date_start} onChange={e => setD({...d, date_start: e.target.value})}/>
                </label>
                <label>Date de fin
                  <input type="date" value={d.date_end} onChange={e => setD({...d, date_end: e.target.value})}/>
                </label>
                <label className="full">Nom de la campagne (auto-généré, modifiable)
                  <input value={d.name} onChange={e => setD({...d, name: e.target.value})}
                    style={{ borderColor: roleColor }}
                    placeholder="Ex : Évaluation Superviseurs — Avril 2026"/>
                </label>
                <label>Appels mystères par agent
                  <input type="number" min={1} max={10} value={d.n_mystery_calls}
                    onChange={e => setD({...d, n_mystery_calls: parseInt(e.target.value)})}/>
                </label>
              </div>
            </div>
          </>
        )}

        {/* ── ÉTAPE 2 : Confirmation ── */}
        {step === 2 && (
          <>
            <h2 style={{ marginBottom: 20 }}>✅ Confirmer et lancer</h2>

            {/* Résumé visuel */}
            <div style={{
              background: `${roleColor}10`, border: `1px solid ${roleColor}40`,
              borderRadius: 12, padding: 20, marginBottom: 16,
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 12, background: `${roleColor}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                }}>{ROLE_LABELS[d.role_type]?.label.split(' ')[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {ROLE_LABELS[d.role_type]?.label} · {d.period_key}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { icon: '📅', label: 'Période', val: `${d.date_start} → ${d.date_end}` },
                  { icon: '👥', label: 'Agents', val: d.target_user_ids.length > 0 ? `${d.target_user_ids.length} sélectionné(s)` : `Tous (${roleUsers.length})` },
                  { icon: '📞', label: 'Appels mystères', val: `${d.n_mystery_calls} PDV / agent` },
                ].map(item => (
                  <div key={item.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{item.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Agents à évaluer — TOUS sélectionnés par défaut, décocher pour exclure */}
            <div className="modal-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Agents à évaluer</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setD(s => ({ ...s, target_user_ids: roleUsers.map(u => u.id) }))}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: `1px solid ${roleColor}`, background: `${roleColor}15`, color: roleColor, cursor: 'pointer' }}>
                    ✓ Tous
                  </button>
                  <button onClick={() => setD(s => ({ ...s, target_user_ids: [] }))}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    ✕ Aucun
                  </button>
                  <span style={{ fontSize: 12, color: roleColor, fontWeight: 600 }}>
                    {d.target_user_ids.length}/{roleUsers.length} sélectionné(s)
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {roleUsers.length === 0
                  ? <span style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>Aucun agent de ce rôle trouvé.</span>
                  : roleUsers.map(u => {
                    const selected = d.target_user_ids.includes(u.id);
                    return (
                      <div key={u.id} onClick={() => setD(s => {
                        const inc = s.target_user_ids.includes(u.id);
                        return { ...s, target_user_ids: inc ? s.target_user_ids.filter(x => x !== u.id) : [...s.target_user_ids, u.id] };
                      })}
                      style={{
                        padding: '6px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                        background: selected ? `${roleColor}20` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${selected ? roleColor : 'var(--border)'}`,
                        color: selected ? roleColor : 'var(--text-muted)',
                        fontWeight: selected ? 600 : 400, transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: selected ? `${roleColor}30` : 'rgba(255,255,255,0.08)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: selected ? roleColor : 'var(--text-muted)',
                        }}>{(u.prenom?.[0] || '') + (u.nom?.[0] || '')}</span>
                        {u.prenom} {u.nom}
                        {selected && <span style={{ fontSize: 10 }}>✓</span>}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* TC pour appels mystères — TOUTES sélectionnées par défaut */}
            <div className="modal-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>📞 TC pour les appels mystères</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setD(s => ({ ...s, mystery_call_user_ids: tcs.map(u => u.id) }))}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid #8b5cf6', background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', cursor: 'pointer' }}>
                    ✓ Toutes
                  </button>
                  <button onClick={() => setD(s => ({ ...s, mystery_call_user_ids: [] }))}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    ✕ Aucune
                  </button>
                  <span style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>
                    {d.mystery_call_user_ids.length}/{tcs.length} sélectionnée(s)
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tcs.map(u => {
                  const sel = d.mystery_call_user_ids.includes(u.id);
                  return (
                    <div key={u.id} onClick={() => setD(s => {
                      const inc = s.mystery_call_user_ids.includes(u.id);
                      return { ...s, mystery_call_user_ids: inc ? s.mystery_call_user_ids.filter(x => x !== u.id) : [...s.mystery_call_user_ids, u.id] };
                    })}
                    style={{
                      padding: '6px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                      background: sel ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${sel ? '#8b5cf6' : 'var(--border)'}`,
                      color: sel ? '#8b5cf6' : 'var(--text-muted)',
                      fontWeight: sel ? 600 : 400, transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: sel ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.08)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: sel ? '#8b5cf6' : 'var(--text-muted)',
                      }}>{(u.prenom?.[0] || '') + (u.nom?.[0] || '')}</span>
                      {u.prenom} {u.nom}
                      {sel && <span style={{ fontSize: 10 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={step === 1 ? onClose : () => setStep(s => s-1)}>
            {step === 1 ? 'Annuler' : '← Retour'}
          </button>
          {step < 2
            ? <button className="btn-primary"
                disabled={!d.date_start || !d.date_end || !d.period_key}
                onClick={() => setStep(2)}
                style={{ background: roleColor, borderColor: roleColor }}>
                Suivant →
              </button>
            : <button className="btn-primary" disabled={busy} onClick={submit}
                style={{ background: roleColor, borderColor: roleColor }}>
                {busy ? '⏳ Création…' : '🚀 Lancer la campagne'}
              </button>
          }
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ONGLET 3 : SAISIR DES NOTES MANUELLES (RC / Admin)
// =============================================================================
function TabNotesManuelles() {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [campDetail, setCampDetail] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [notes, setNotes] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    evalService.listCampaigns().then(cs => {
      const actives = cs.filter(c => !['CLOSED','ARCHIVED'].includes(c.status));
      setCampaigns(actives);
      if (actives.length) { setSelectedCamp(actives[0]); loadCamp(actives[0]); }
    });
  }, []);

  const loadCamp = (c) => {
    setSelectedCamp(c); setSelectedUser(null); setCriteria([]); setNotes({});
    evalService.getCampaign(c.id).then(setCampDetail);
    evalService.getConfig(c.role_type).then(cfg => {
      const manualCriteria = (cfg.criteria || []).filter(cr => !cr.auto || cr.category === 'terrain' || cr.category === 'mystery');
      setCriteria(manualCriteria);
    });
  };

  const saveNotes = async () => {
    if (!selectedUser || !selectedCamp) return;
    try {
      for (const [criterion, note] of Object.entries(notes)) {
        if (note !== '' && note !== null) {
          await evalService.addManualNote(selectedCamp.id, selectedUser, {
            criterion, note: parseFloat(note), max_note: 10,
            comment: `Note saisie par RC/Admin — ${selectedCamp.period_key}`,
          });
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { alert('Erreur: ' + (err.response?.data?.detail || err.message)); }
  };

  return (
    <>
      <div style={{ padding: 14, background: 'rgba(59,130,246,0.08)', borderRadius: 8, borderLeft: '3px solid #3b82f6', marginBottom: 16 }}>
        <b>ℹ️ Comment saisir des notes manuelles ?</b>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>
          1. Choisissez une campagne active<br/>
          2. Sélectionnez l'agent à noter<br/>
          3. Saisissez les notes (ex: test connaissance terrain = 7/10)<br/>
          4. Cliquez "Enregistrer les notes"
        </div>
      </div>

      <div className="filters">
        <span style={{ color: 'var(--text-secondary)' }}>Campagne :</span>
        <select value={selectedCamp?.id || ''} onChange={e => {
          const c = campaigns.find(x => x.id === parseInt(e.target.value));
          if (c) loadCamp(c);
        }}>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!selectedCamp && <div className="empty-state">Aucune campagne active. Créez une campagne d'abord.</div>}

      {campDetail && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          {/* Liste des agents */}
          <div className="modal-section" style={{ background: 'var(--bg-card)', margin: 0, height: 'fit-content' }}>
            <h3>Agents à noter ({campDetail.scores?.length || 0})</h3>
            {(campDetail.scores || []).length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Calculez les scores d'abord dans l'onglet "Mes campagnes".</div>
            )}
            {(campDetail.scores || []).map(s => (
              <div key={s.user_id} onClick={() => { setSelectedUser(s.user_id); setNotes({}); }}
                style={{
                  padding: '10px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 4,
                  background: selectedUser === s.user_id ? 'rgba(255,105,0,0.12)' : 'rgba(255,255,255,0.03)',
                  borderLeft: selectedUser === s.user_id ? '3px solid var(--primary)' : '3px solid transparent',
                }}>
                <div style={{ fontWeight: 600 }}>{s.user_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Score actuel : {s.score_final?.toFixed(1) || 'Non calculé'}
                </div>
              </div>
            ))}
          </div>

          {/* Formulaire de notes */}
          <div className="modal-section" style={{ background: 'var(--bg-card)', margin: 0 }}>
            {!selectedUser ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: 20, textAlign: 'center' }}>
                👈 Cliquez sur un agent pour saisir ses notes
              </div>
            ) : (
              <>
                <h3>✍️ Notes pour : {campDetail.scores?.find(s => s.user_id === selectedUser)?.user_name}</h3>
                {criteria.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>Aucun critère manuel défini pour ce rôle.</div>
                ) : (
                  <>
                    {criteria.map(c => (
                      <div key={c.key} style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 6 }}>
                          <b style={{ fontSize: 13 }}>{c.label}</b>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>Note sur {c.max || 10}</span>
                        </label>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                          {c.key === 'mystery_last_visit' && '📞 Basé sur les appels mystères — les TC ont demandé aux PDV "Quand votre agent est-il passé ?"'}
                          {c.key === 'geo_knowledge' && '🗺️ Test terrain — vous appelez l\'agent et lui donnez 5 PDV à localiser'}
                          {c.key === 'mystery_quality' && '🕵️ Qualité des interactions vérifiée par rappel des PDV'}
                        </div>
                        <input type="number" min={0} max={c.max || 10} step={0.5}
                          value={notes[c.key] ?? ''}
                          onChange={e => setNotes(n => ({...n, [c.key]: e.target.value}))}
                          style={{ width: 100 }} placeholder={`0 à ${c.max || 10}`}/>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button className="btn-primary" onClick={saveNotes}>💾 Enregistrer les notes</button>
                      {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>✅ Notes enregistrées !</span>}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// ONGLET 4 : APPELS MYSTÈRES (vue téléconseillère)
// =============================================================================
function TabAppelsMysteres() {
  const [queue, setQueue] = useState([]);
  const [logModal, setLogModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterTC, setFilterTC] = useState('');
  const currentUser = useAuthStore(s => s.user);
  const isAdminRC = currentUser && ['admin', 'rc'].includes(currentUser.role);

  const reload = () => {
    setLoading(true);
    evalService.myMysteryQueue().then(q => { setQueue(q); setLoading(false); }).catch(() => { setQueue([]); setLoading(false); });
  };
  useEffect(() => { reload(); }, []);

  // Pour admin/RC : filtrage par TC assignée
  const tcNames = isAdminRC ? [...new Set(queue.map(t => t.tc_user_name))].sort() : [];
  const displayQueue = isAdminRC && filterTC ? queue.filter(t => t.tc_user_name === filterTC) : queue;

  return (
    <>
      <div style={{ padding: 14, background: 'rgba(139,92,246,0.08)', borderRadius: 8, borderLeft: '3px solid #8b5cf6', marginBottom: 16 }}>
        <b>🕵️ {isAdminRC ? 'Supervision des appels mystères' : 'Comment faire un appel mystère ?'}</b>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>
          {isAdminRC ? (
            <>En tant qu'Admin/RC, vous pouvez voir toutes les tâches en attente, appeler les PDV directement et enregistrer les résultats.</>
          ) : (
            <>
              1. Cliquez sur un PDV à appeler ci-dessous<br/>
              2. Appelez le PDV avec le numéro affiché<br/>
              3. Posez la question indiquée naturellement, sans révéler que c'est une évaluation<br/>
              4. Saisissez la réponse du PDV et donnez une note sur 10<br/>
              5. La tâche est marquée comme effectuée automatiquement
            </>
          )}
        </div>
      </div>

      {/* Filtre TC pour admin/RC */}
      {isAdminRC && tcNames.length > 0 && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Filtrer par TC :</span>
          <button onClick={() => setFilterTC('')}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              border: `1.5px solid ${filterTC === '' ? '#8b5cf6' : 'var(--border)'}`,
              background: filterTC === '' ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: filterTC === '' ? '#8b5cf6' : 'var(--text-muted)',
              fontWeight: filterTC === '' ? 700 : 400,
            }}>Toutes ({queue.length})</button>
          {tcNames.map(name => (
            <button key={name} onClick={() => setFilterTC(name)}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                border: `1.5px solid ${filterTC === name ? '#8b5cf6' : 'var(--border)'}`,
                background: filterTC === name ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: filterTC === name ? '#8b5cf6' : 'var(--text-muted)',
                fontWeight: filterTC === name ? 700 : 400,
              }}>{name} ({queue.filter(t => t.tc_user_name === name).length})</button>
          ))}
        </div>
      )}

      {loading ? <div className="loading-state">Chargement de votre liste…</div> :
       displayQueue.length === 0 ? (
        <div className="empty-state">
          🎉 {isAdminRC ? 'Aucun appel mystère en attente.' : 'Vous n\'avez aucun appel mystère en attente.'}<br/>
          <small>Les appels seront attribués quand une campagne est lancée.</small>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card warn"><div className="stat-label">Appels en attente</div><div className="stat-value">{displayQueue.length}</div></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayQueue.map(t => (
              <div key={t.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 16,
                borderLeft: '4px solid #8b5cf6',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                      <span className="status-badge" style={{ background: '#8b5cf6' }}>
                        {t.call_type === 'LAST_VISIT' ? '📅 Dernier passage' : t.call_type === 'QUALITY_CHECK' ? '⭐ Qualité interaction' : '🗺️ Terrain'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Agent évalué : <b>{t.target_user_name}</b>
                      </span>
                      {isAdminRC && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 10 }}>
                          TC assignée : <b>{t.tc_user_name}</b>
                        </span>
                      )}
                    </div>

                    <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, marginBottom: 4 }}>QUESTION À POSER :</div>
                      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                        "{t.question}"
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      <b>PDV à appeler :</b> {t.pdv_nom || t.pdv_numero}
                      {t.pdv_telephone && (
                        <span style={{ marginLeft: 12, color: 'var(--primary)', fontWeight: 700 }}>
                          📞 {t.pdv_telephone}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="btn-primary" onClick={() => setLogModal(t)}>
                    📝 Enregistrer l'appel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {logModal && (
        <div className="modal-backdrop" onClick={() => setLogModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h2>📞 Résultat de l'appel mystère</h2>
            <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <b>Question posée :</b> {logModal.question}
              {isAdminRC && logModal.tc_user_name && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  TC assignée : <b>{logModal.tc_user_name}</b>
                </div>
              )}
            </div>
            <MysteryCallForm taskId={logModal.id} onDone={() => { setLogModal(null); reload(); }}/>
          </div>
        </div>
      )}
    </>
  );
}

function MysteryCallForm({ taskId, onDone }) {
  const [d, setD] = useState({ outcome: 'REACHED', answer: '', note: '', comment: '', duration_sec: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (d.outcome === 'REACHED' && (!d.answer || d.note === '')) return alert('Veuillez saisir la réponse du PDV et la note.');
    setBusy(true);
    try {
      await evalService.logMystery(taskId, { ...d, note: d.note !== '' ? parseFloat(d.note) : null, duration_sec: d.duration_sec !== '' ? parseInt(d.duration_sec) : null });
      onDone();
    } catch (err) { alert('Erreur: ' + (err.response?.data?.detail || err.message)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>Résultat de l'appel *
          <select value={d.outcome} onChange={e => setD({...d, outcome: e.target.value})}>
            <option value="REACHED">✅ PDV joint — j'ai eu la réponse</option>
            <option value="NO_ANSWER">❌ Pas de réponse</option>
            <option value="WRONG_NUMBER">📞 Faux numéro</option>
            <option value="BUSY">📵 PDV occupé</option>
          </select>
        </label>
        <label>Durée de l'appel (secondes)
          <input type="number" value={d.duration_sec} onChange={e => setD({...d, duration_sec: e.target.value})} placeholder="Ex: 120"/>
        </label>
        {d.outcome === 'REACHED' && (
          <>
            <label className="full">Réponse exacte du PDV *
              <textarea value={d.answer} onChange={e => setD({...d, answer: e.target.value})} required
                style={{ minHeight: 60 }} placeholder='Ex: "Mon superviseur est passé il y a 4 jours"'/>
            </label>
            <label>Note (0 à 10) * — Basé sur la réponse
              <input type="number" min={0} max={10} step={0.5} value={d.note} onChange={e => setD({...d, note: e.target.value})} required placeholder="Ex: 8"/>
            </label>
            <label>Votre commentaire (optionnel)
              <textarea value={d.comment} onChange={e => setD({...d, comment: e.target.value})} style={{ minHeight: 50 }} placeholder="Observation supplémentaire…"/>
            </label>
          </>
        )}
      </div>
      <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        💡 <b>Guide de notation :</b> 9-10 = excellent (passage récent, pdv satisfait) · 6-8 = bien · 3-5 = passable · 0-2 = mauvais (pas de passage depuis longtemps)
      </div>
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={() => onDone()}>Annuler</button>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : '✅ Valider l\'appel'}</button>
      </div>
    </form>
  );
}

// =============================================================================
// ONGLET 5 : RÉSULTATS & PDF
// =============================================================================
function TabResultats() {
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    evalService.listCampaigns().then(cs => {
      setCampaigns(cs);
      const closed = cs.find(c => c.status === 'CLOSED');
      if (closed) { setSelected(closed); evalService.getCampaign(closed.id).then(setDetail); }
    });
  }, []);

  const loadCamp = (c) => { setSelected(c); setDetail(null); evalService.getCampaign(c.id).then(setDetail); };

  return (
    <>
      <div className="filters">
        <span style={{ color: 'var(--text-secondary)' }}>Campagne :</span>
        <select value={selected?.id || ''} onChange={e => { const c = campaigns.find(x => x.id === parseInt(e.target.value)); if (c) loadCamp(c); }}>
          <option value="">— sélectionner —</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} [{c.status}]</option>)}
        </select>
      </div>

      {!selected && <div className="empty-state">Sélectionnez une campagne pour voir les résultats.</div>}
      {selected && !detail && <div className="loading-state">Chargement…</div>}
      {detail && (
        <>
          <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🏆 Classement — {detail.name}</h3>
              <span className="status-badge" style={{ background: ROLE_LABELS[detail.role_type]?.color }}>
                {ROLE_LABELS[detail.role_type]?.label}
              </span>
            </div>

            {(detail.scores || []).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Aucun score encore. Allez dans "Mes campagnes" → calculez les scores → clôturez.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(detail.scores||[]).sort((a,b) => (a.rank||99) - (b.rank||99)).map((s, i) => (
                  <div key={s.user_id} style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '14px 16px',
                    borderLeft: `4px solid ${i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'var(--border)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, minWidth: 36, color: i<3?['#FFD700','#C0C0C0','#CD7F32'][i]:'var(--text-muted)' }}>
                        #{s.rank || i+1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 14 }}>{s.user_name}</b>
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          <span>KPI : {s.score_kpi?.toFixed(1)||'—'}</span>
                          <span>Mystères : {s.score_mystery?.toFixed(1)||'—'}</span>
                          <span>Manuel : {s.score_manual?.toFixed(1)||'—'}</span>
                          {s.bonus_amount > 0 && <span style={{ color: 'var(--success)' }}>💰 Bonus : {s.bonus_amount?.toLocaleString('fr-FR')} F</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 70 }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: SCORE_COLOR(s.score_final) }}>
                          {s.score_final?.toFixed(1)||'—'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>/100</div>
                      </div>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        onClick={async () => {
                          try {
                            const resp = await api.get(
                              `/evaluations/campaigns/${detail.id}/scores/${s.user_id}/pdf`,
                              { responseType: 'blob' }
                            );
                            const url = window.URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] || 'application/pdf' }));
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `eval_${s.user_name?.replace(/\s+/g,'_')}_${detail.period_key}.pdf`;
                            a.click();
                            window.URL.revokeObjectURL(url);
                          } catch (err) { alert('Erreur PDF : ' + (err.response?.data?.detail || err.message)); }
                        }}>
                        <Download size={12}/> Rapport PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// ONGLET 6 : CONFIGURATION DES PONDÉRATIONS
// =============================================================================
function TabConfiguration() {
  const [configs, setConfigs] = useState([]);
  const [editing, setEditing] = useState(null);
  useEffect(() => { evalService.allConfigs().then(setConfigs); }, []);

  const reset = async (role) => {
    if (!window.confirm('Réinitialiser aux valeurs par défaut ?')) return;
    await evalService.resetConfig(role);
    evalService.allConfigs().then(setConfigs);
  };

  return (
    <>
      <div style={{ padding: 14, background: 'rgba(255,105,0,0.08)', borderRadius: 8, borderLeft: '3px solid var(--primary)', marginBottom: 16 }}>
        <b>⚙️ À quoi sert la configuration ?</b>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>
          Vous pouvez ajuster l'importance (%) de chaque dimension dans le score final.
          Par exemple : si vous voulez donner plus d'importance aux appels mystères, augmentez leur pourcentage.
          <b> La somme doit toujours égaler 100%.</b>
        </div>
      </div>

      {configs.map(cfg => (
        <div key={cfg.role_type} className="modal-section" style={{ background: 'var(--bg-card)', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>
              <span className="status-badge" style={{ background: ROLE_LABELS[cfg.role_type]?.color, marginRight: 8 }}>
                {ROLE_LABELS[cfg.role_type]?.label}
              </span>
              {cfg.name}
            </h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setEditing(cfg)}>✏️ Modifier</button>
              <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => reset(cfg.role_type)}>🔄 Par défaut</button>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pondérations du score final</b>
            {Object.entries(cfg.weights || {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <span style={{ minWidth: 140, fontSize: 12, color: 'var(--text-secondary)' }}>{k}</span>
                <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${v}%`, height: '100%', background: ROLE_LABELS[cfg.role_type]?.color }}/>
                </div>
                <b style={{ minWidth: 36, fontSize: 12 }}>{v}%</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Critères : {(cfg.criteria||[]).map(c => c.label).join(' · ')}
          </div>
        </div>
      ))}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h2>✏️ Modifier pondérations — {editing.name}</h2>
            <EditWeightsForm config={editing} onSaved={() => { setEditing(null); evalService.allConfigs().then(setConfigs); }}/>
          </div>
        </div>
      )}
    </>
  );
}

function EditWeightsForm({ config, onSaved }) {
  const [weights, setWeights] = useState({ ...config.weights });
  const total = Object.values(weights).reduce((s, v) => s + Number(v), 0);
  const submit = async (e) => {
    e.preventDefault();
    if (Math.abs(total - 100) > 1) return alert(`La somme doit être 100%. Actuelle : ${total}%`);
    try {
      await evalService.updateConfig(config.role_type, { weights: Object.fromEntries(Object.entries(weights).map(([k,v]) => [k, Number(v)])) });
      onSaved();
    } catch (err) { alert('Erreur: ' + (err.response?.data?.detail || err.message)); }
  };
  return (
    <form onSubmit={submit}>
      <div className="modal-section">
        {Object.entries(weights).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <label style={{ minWidth: 130, fontSize: 13 }}>{k}</label>
            <input type="number" min={0} max={100} value={v}
              onChange={e => setWeights(w => ({ ...w, [k]: e.target.value }))}
              style={{ width: 70 }}/>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>%</span>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Number(v))}%`, height: '100%', background: ROLE_LABELS[config.role_type]?.color }}/>
            </div>
          </div>
        ))}
        <div style={{ padding: 8, background: Math.abs(total-100) > 1 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderRadius: 6, fontSize: 13, marginTop: 8 }}>
          Total : <b style={{ color: Math.abs(total-100) > 1 ? 'var(--danger)' : 'var(--success)' }}>{total}%</b>
          {Math.abs(total-100) > 1 && ' ⚠️ Doit être exactement 100%'}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onSaved}>Annuler</button>
        <button type="submit" className="btn-primary">Sauvegarder</button>
      </div>
    </form>
  );
}

function CampagneDetailModal({ campaign, users, onClose }) {
  const [data, setData] = useState(null);
  const [activeAgent, setActiveAgent] = useState(null); // agent sélectionné pour le panneau latéral

  useEffect(() => { evalService.getCampaign(campaign.id).then(setData); }, [campaign.id]);

  if (!data) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal"><div className="loading-state">Chargement…</div></div>
    </div>
  );

  const scores = data.scores || [];
  const roleInfo = ROLE_LABELS[data.role_type] || {};
  const roleColor = roleInfo.color || 'var(--primary)';

  // Rang medal
  const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

  // KPI keys lisibles depuis kpi_data
  const KPI_LABELS = {
    // Superviseur / Gestionnaire
    montant_transactions: 'Montant transactions (FCFA)',
    ca_total: 'CA total (FCFA)',
    commission_totale: 'Commission totale (FCFA)',
    pdv_actifs: 'PDV actifs',
    montant_vente_nafama: 'Vente NAFAMA (FCFA)',
    taux_actif_omy: 'Taux actif OMY (%)',
    nb_actifs_omy: 'Nb actifs OMY',
    taux_actif_nafama: 'Taux actif NAFAMA (%)',
    nb_actifs_nafama: 'Nb actifs NAFAMA',
    taux_actif_kaabu: 'Taux actif KAABU (%)',
    nb_actifs_kaabu: 'Nb actifs KAABU',
    // Développeur
    nb_prospections: 'Prospections',
    nb_conversions: 'Conversions',
    taux_conversion: 'Taux conversion (%)',
    nb_pdv_visites: 'PDV visités',
    taux_visite: 'Taux de visite (%)',
    // Téléconseillère
    nb_appels: 'Nb appels',
    nb_appels_reussis: 'Appels réussis',
    taux_reussite: 'Taux réussite (%)',
    duree_moyenne: 'Durée moyenne (s)',
    // Génériques
    taux_couverture: 'Couverture (%)',
    taux_paiement: 'Taux paiement (%)',
    montant_recouvre: 'Montant recouvré',
    ventes_realisees: 'Ventes réalisées',
    taux_vente: 'Taux vente (%)',
  };

  // Champs à exclure de l'affichage (objectifs séparés)
  const KPI_EXCLUDE = new Set(['objectif_visite', 'objectif_recouvrement', 'objectif_ventes']);

  // Formater une valeur KPI
  const fmtKPI = (key, val) => {
    if (val == null) return '—';
    if (key.startsWith('taux_') || key.startsWith('taux')) return `${(val * (val <= 1 ? 100 : 1)).toFixed(1)} %`;
    if (key.startsWith('montant_') || key === 'commission_totale' || key === 'ca_total')
      return Number(val).toLocaleString('fr-FR') + ' FCFA';
    if (typeof val === 'number') return val % 1 !== 0 ? val.toFixed(2) : val.toString();
    return String(val);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {/* Conteneur principal plein largeur */}
      <div onClick={e => e.stopPropagation()} style={{
        display: 'flex', height: '90vh', maxWidth: 1100, width: '95vw',
        background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>

        {/* ── Colonne gauche : liste des agents ── */}
        <div style={{
          width: activeAgent ? 340 : '100%', minWidth: 320, display: 'flex', flexDirection: 'column',
          borderRight: activeAgent ? '1px solid var(--border)' : 'none',
          transition: 'width 0.3s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '20px 24px', borderBottom: '1px solid var(--border)',
            background: `linear-gradient(135deg, ${roleColor}18, transparent)`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 20 }}>{roleInfo.label?.split(' ')[0]}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: `${roleColor}22`, color: roleColor, fontWeight: 600,
                  }}>{roleInfo.label?.replace(/^\S+\s/, '')}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)',
                  }}>{data.period_key}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>{data.name}</div>
              </div>
              <button onClick={onClose} style={{
                background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--text-muted)',
                borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16,
              }}>✕</button>
            </div>
            {scores.length > 0 && (
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                {[
                  { label: 'Agents', val: scores.length },
                  { label: 'Moy. finale', val: (scores.reduce((a,s) => a+(s.score_final||0), 0)/scores.length).toFixed(1)+'/100' },
                  { label: 'Meilleur', val: scores.reduce((a,s) => s.score_final > (a?.score_final||0) ? s : a, null)?.user_name?.split(' ')[0] || '—' },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{item.val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grille agents */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {scores.length === 0 ? (
              <div className="empty-state">
                📊 Aucun score calculé encore.<br/>
                <small>Cliquez "Calculer les scores" dans la liste des campagnes.</small>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: activeAgent ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {scores.sort((a,b) => (a.rank||99)-(b.rank||99)).map(s => {
                  const color = SCORE_COLOR(s.score_final);
                  const isActive = activeAgent?.user_id === s.user_id;
                  const initials = (s.user_name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                  const pct = Math.min(100, Math.max(0, s.score_final || 0));
                  return (
                    <div key={s.user_id} onClick={() => setActiveAgent(isActive ? null : s)}
                      style={{
                        borderRadius: 12, padding: 16, cursor: 'pointer',
                        background: isActive ? `${roleColor}15` : 'rgba(255,255,255,0.04)',
                        border: `1.5px solid ${isActive ? roleColor : 'var(--border)'}`,
                        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                      }}>
                      {/* Barre de fond score */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, height: 3,
                        width: `${pct}%`, background: color, borderRadius: '0 2px 0 0',
                        transition: 'width 0.5s ease',
                      }}/>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        {/* Avatar */}
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: `${roleColor}25`, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 13, fontWeight: 700, color: roleColor,
                        }}>{initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.rank && <span style={{ marginRight: 4 }}>{medal(s.rank)}</span>}{s.user_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.score_label || '—'}</div>
                        </div>
                      </div>
                      {/* Score */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color }}>{s.score_final?.toFixed(1)||'—'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/100</span>
                      </div>
                      {/* Mini stats */}
                      {(s.score_kpi != null || s.score_mystery != null) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          {s.score_kpi != null && (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                              KPI {s.score_kpi?.toFixed(0)}
                            </span>
                          )}
                          {s.score_mystery != null && (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                              🕵️ {s.score_mystery?.toFixed(0)}
                            </span>
                          )}
                          {s.score_manual != null && (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                              ✍️ {s.score_manual?.toFixed(0)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Panneau latéral : détail KPI de l'agent ── */}
        {activeAgent && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 0 }}>
            {/* Header agent */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              background: `linear-gradient(135deg, ${SCORE_COLOR(activeAgent.score_final)}15, transparent)`,
              position: 'sticky', top: 0, zIndex: 2,
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  background: `${roleColor}25`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18, fontWeight: 700, color: roleColor,
                }}>
                  {(activeAgent.user_name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                    {activeAgent.rank && <span style={{ marginRight: 6 }}>{medal(activeAgent.rank)}</span>}
                    {activeAgent.user_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeAgent.score_label || '—'}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: SCORE_COLOR(activeAgent.score_final), lineHeight: 1 }}>
                    {activeAgent.score_final?.toFixed(1)||'—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 100</div>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Scores résumé */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  Décomposition du score
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { label: '📊 Score KPI', val: activeAgent.score_kpi, color: '#3b82f6', desc: 'Données terrain' },
                    { label: '🕵️ Appels mystères', val: activeAgent.score_mystery, color: '#8b5cf6', desc: 'Notes TC' },
                    { label: '✍️ Notes manuelles', val: activeAgent.score_manual, color: '#f59e0b', desc: 'Évaluation directe' },
                  ].map(item => (
                    <div key={item.label} style={{
                      borderRadius: 10, padding: 14, textAlign: 'center',
                      background: `${item.color}10`, border: `1px solid ${item.color}30`,
                    }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>
                        {item.val != null ? item.val.toFixed(1) : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
                      {item.val != null && (
                        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, item.val)}%`, background: item.color, borderRadius: 2, transition: 'width 0.5s' }}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Détail KPI terrain */}
              {activeAgent.kpi_data && Object.keys(activeAgent.kpi_data).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    📊 KPI Terrain détaillés
                  </div>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Indicateur</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Valeur</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Performance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(activeAgent.kpi_data)
                          .filter(([key]) => !KPI_EXCLUDE.has(key) && !key.startsWith('objectif_'))
                          .map(([key, val], i) => {
                          // Couleur selon la nature du KPI
                          const isTaux = key.startsWith('taux_');
                          const isNb = key.startsWith('nb_');
                          const isMontant = key.startsWith('montant_') || key === 'commission_totale' || key === 'ca_total';
                          // Pour les taux : vert si >80%, orange si >50%, rouge sinon
                          const tVal = isTaux ? (val > 1 ? val : val * 100) : null;
                          const kpiColor = tVal != null
                            ? (tVal >= 80 ? '#22c55e' : tVal >= 50 ? '#f59e0b' : '#ef4444')
                            : 'var(--text-primary)';
                          return (
                            <tr key={key} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                              <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                <div style={{ fontWeight: 500 }}>{KPI_LABELS[key] || key}</div>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: kpiColor }}>
                                {fmtKPI(key, val)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {tVal != null ? (
                                  <div>
                                    <div style={{ height: 4, width: 60, borderRadius: 2, background: 'rgba(255,255,255,0.08)', display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
                                      <div style={{ height: '100%', width: `${Math.min(100, tVal)}%`, background: kpiColor, borderRadius: 2 }}/>
                                    </div>
                                    <span style={{
                                      padding: '2px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                                      background: `${kpiColor}20`, color: kpiColor,
                                    }}>{tVal.toFixed(1)}%</span>
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes manuelles */}
              {activeAgent.manual_notes && Object.keys(activeAgent.manual_notes).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    ✍️ Notes manuelles
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(activeAgent.manual_notes).map(([critere, note]) => {
                      const n = parseFloat(note) || 0;
                      const noteColor = n >= 8 ? '#22c55e' : n >= 6 ? '#f59e0b' : '#ef4444';
                      return (
                        <div key={critere} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                        }}>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{critere}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 2 }}>
                              {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                <div key={i} style={{
                                  width: 6, height: 16, borderRadius: 2,
                                  background: i <= n ? noteColor : 'rgba(255,255,255,0.08)',
                                }}/>
                              ))}
                            </div>
                            <span style={{ fontWeight: 700, color: noteColor, minWidth: 28, textAlign: 'right' }}>{note}/10</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Plan IA */}
              {activeAgent.ai_improvement_plan && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    🤖 Plan d'amélioration IA
                  </div>
                  <div style={{
                    padding: 14, borderRadius: 10, background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)', fontSize: 13,
                    color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  }}>
                    {activeAgent.ai_improvement_plan}
                  </div>
                </div>
              )}

              {/* Bonus */}
              {activeAgent.bonus_amount != null && activeAgent.bonus_amount > 0 && (
                <div style={{
                  padding: 14, borderRadius: 10, background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>💰 Bonus estimé</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>
                    {activeAgent.bonus_amount.toLocaleString()} FCFA
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
