import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Bell, AlertTriangle, TrendingDown, RefreshCw, Phone, Check, X, Plus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import alertService from '../services/alertService';
import KPICard from '../components/common/KPICard';
import './AlertsPage.css';

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_WEEK = Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);

function formatCA(value) {
  if (!value) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ============ TAB 1: INACTIVE PDVs ============
function TabInactivePDVs({ semaine, annee }) {
  const [zone, setZone] = useState('');
  const [superviseur, setSuperviseur] = useState('');
  const queryClient = useQueryClient();
  const sem = semaine || CURRENT_WEEK;
  const an = annee || CURRENT_YEAR;

  const { data: inactiveData, isLoading, error } = useQuery({
    queryKey: ['alerts/inactive', an, sem, zone, superviseur],
    queryFn: async () => {
      const response = await api.get('/alerts/inactive', {
        params: { annee: an, semaine: sem, zone: zone || undefined, superviseur: superviseur || undefined },
      });
      return response.data;
    },
    enabled: !!sem && !!an,
  });

  const createActionMutation = useMutation({
    mutationFn: (data) => alertService.createAction(data),
    onSuccess: () => queryClient.invalidateQueries(['alerts/inactive']),
  });

  const [selectedPDV, setSelectedPDV] = useState(null);
  const [actionModal, setActionModal] = useState(false);
  const [actionForm, setActionForm] = useState({ type_action: 'appel', resultat: '', notes: '' });

  const handleCreateAction = async () => {
    if (!selectedPDV) return;
    createActionMutation.mutate({
      pdv_id: selectedPDV.id,
      type_action: actionForm.type_action,
      resultat: actionForm.resultat,
      notes: actionForm.notes,
    });
    setActionModal(false);
    setActionForm({ type_action: 'appel', resultat: '', notes: '' });
  };

  const critiques = inactiveData?.pdvs?.filter((p) => p.semaines_consecutives_inactif >= 3) || [];
  const hautes = inactiveData?.pdvs?.filter((p) => p.semaines_consecutives_inactif === 2) || [];
  const normales = inactiveData?.pdvs?.filter((p) => p.semaines_consecutives_inactif === 1) || [];

  const zones = Array.from(new Set(inactiveData?.pdvs?.map((p) => p.zone) || []));
  const superviseurs = Array.from(new Set(inactiveData?.pdvs?.map((p) => p.superviseur) || []));

  return (
    <div>
      {/* Cartes résumé */}
      <div className="grid-3 mb-24">
        <KPICard
          title="🔴 CRITIQUE"
          value={critiques.length}
          color="#ff4757"
          subtitle="≥ 3 semaines"
        />
        <KPICard
          title="🟠 HAUTE"
          value={hautes.length}
          color="#ffa502"
          subtitle="2 semaines"
        />
        <KPICard
          title="🟡 NORMALE"
          value={normales.length}
          color="#FFD700"
          subtitle="1 semaine"
        />
      </div>

      {/* Filtres */}
      <div className="card mb-16" style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Zone</label>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Toutes les zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Superviseur</label>
          <select value={superviseur} onChange={(e) => setSuperviseur(e.target.value)}>
            <option value="">Tous les superviseurs</option>
            {superviseurs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div>
      ) : error ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>Erreur de chargement</div>
      ) : (
        <div className="card table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PDV</th>
                <th>Zone</th>
                <th>Superviseur</th>
                <th>Téléconseillère</th>
                <th>Semaines Inactif</th>
                <th>Dernière Activité</th>
                <th>CA Précédent</th>
                <th>Priorité</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {inactiveData?.pdvs?.map((pdv) => (
                <tr key={pdv.id} style={{ cursor:'pointer' }} onClick={() => pdv.pdv_id && navigate(`/pdvs/${pdv.pdv_id}`)}>
                  <td style={{ fontWeight: 600, color:'var(--primary)' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6 }}>{pdv.nom}<ExternalLink size={11}/></span>
                  </td>
                  <td>{pdv.zone}</td>
                  <td>{pdv.superviseur}</td>
                  <td>{pdv.teleconseillere || '—'}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          pdv.semaines_consecutives_inactif >= 3
                            ? 'var(--danger-bg)'
                            : pdv.semaines_consecutives_inactif === 2
                              ? 'var(--warning-bg)'
                              : 'var(--primary-glow)',
                        color:
                          pdv.semaines_consecutives_inactif >= 3
                            ? 'var(--danger)'
                            : pdv.semaines_consecutives_inactif === 2
                              ? 'var(--warning)'
                              : 'var(--primary)',
                      }}
                    >
                      {pdv.semaines_consecutives_inactif}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{formatDate(pdv.derniere_activite)}</td>
                  <td>{formatCA(pdv.ca_precedent)}</td>
                  <td>
                    <span className="badge" style={{ background: 'rgba(255,105,0,0.15)', color: 'var(--primary)' }}>
                      {pdv.semaines_consecutives_inactif >= 3 ? 'CRITIQUE' : pdv.semaines_consecutives_inactif === 2 ? 'HAUTE' : 'NORMALE'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setSelectedPDV(pdv);
                        setActionModal(true);
                      }}
                    >
                      <Phone size={13} /> Appeler
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="modal-overlay" onClick={() => setActionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Créer une action terrain pour {selectedPDV?.nom}</h3>
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Type d'action</label>
                <select value={actionForm.type_action} onChange={(e) => setActionForm({ ...actionForm, type_action: e.target.value })}>
                  <option value="appel">📞 Appel</option>
                  <option value="visite">🚗 Visite</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Résultat</label>
                <select value={actionForm.resultat} onChange={(e) => setActionForm({ ...actionForm, resultat: e.target.value })}>
                  <option value="">Sélectionner</option>
                  <option value="succes">✅ Succès</option>
                  <option value="echec">❌ Échec</option>
                  <option value="non_joint">📵 Non joint</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Notes</label>
                <textarea
                  value={actionForm.notes}
                  onChange={(e) => setActionForm({ ...actionForm, notes: e.target.value })}
                  placeholder="Détails de l'action..."
                  style={{ minHeight: '80px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setActionModal(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={handleCreateAction} disabled={createActionMutation.isPending}>
                  {createActionMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ TAB 2: DECLINING CA ============
function TabDecliningCA({ mois, annee }) {
  const [seuil, setSeuil] = useState(15);
  const [zone, setZone] = useState('');
  const m = mois || (now.getMonth() + 1);
  const an = annee || CURRENT_YEAR;

  const { data: decliningData, isLoading, error } = useQuery({
    queryKey: ['alerts/declining', an, m, seuil, zone],
    queryFn: async () => {
      const response = await api.get('/alerts/declining', {
        params: { annee: an, mois: m, seuil, zone: zone || undefined },
      });
      return response.data;
    },
    enabled: !!m && !!an,
  });

  const zones = Array.from(new Set(decliningData?.pdvs?.map((p) => p.zone) || []));

  const renderMiniSparkline = (historique) => {
    if (!historique || historique.length === 0) return '—';
    return (
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        {historique.map((val, i) => (
          <div
            key={i}
            style={{
              width: '6px',
              height: '14px',
              background: val.variation >= 0 ? 'var(--success)' : 'var(--danger)',
              borderRadius: '2px',
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    );
  };

  const getScoreBarre = (score) => {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="progress-bar" style={{ flex: 1 }}>
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(100, score)}%`,
              background: score <= 33 ? 'var(--success)' : score <= 66 ? 'var(--warning)' : 'var(--danger)',
            }}
          />
        </div>
        <span style={{ fontSize: '11px', fontWeight: 600, minWidth: '30px' }}>{score}</span>
      </div>
    );
  };

  return (
    <div>
      {/* Filtres */}
      <div className="card mb-16" style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Seuil de baisse: {seuil}%
          </label>
          <input
            type="range"
            min="5"
            max="50"
            value={seuil}
            onChange={(e) => setSeuil(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Zone</label>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Toutes les zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div>
      ) : error ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>Erreur de chargement</div>
      ) : (
        <div className="card table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PDV</th>
                <th>Zone</th>
                <th>CA Actuel</th>
                <th>CA Précédent</th>
                <th>Variation</th>
                <th>Historique 4 sem</th>
                <th>Score Risque</th>
                <th>Type Baisse</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {decliningData?.pdvs?.map((pdv) => (
                <tr key={pdv.id} style={{ cursor:'pointer' }} onClick={() => pdv.pdv_id && navigate(`/pdvs/${pdv.pdv_id}`)}>
                  <td style={{ fontWeight:600, color:'var(--primary)' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6 }}>{pdv.nom}<ExternalLink size={11}/></span>
                  </td>
                  <td>{pdv.zone}</td>
                  <td>{formatCA(pdv.ca_actuel)}</td>
                  <td>{formatCA(pdv.ca_precedent)}</td>
                  <td>
                    <span
                      className="badge badge-danger"
                      style={{
                        background: 'var(--danger-bg)',
                        color: 'var(--danger)',
                      }}
                    >
                      {pdv.variation}%
                    </span>
                  </td>
                  <td>{renderMiniSparkline(pdv.historique_4sem)}</td>
                  <td>{getScoreBarre(pdv.score_risque || 50)}</td>
                  <td>
                    <span className="badge" style={{ background: 'rgba(255,165,2,0.15)', color: 'var(--warning)' }}>
                      {pdv.type_baisse || 'Saisonnière'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-primary btn-sm">
                      <Plus size={13} /> Agir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============ TAB 3: RECOVERY ============
function TabRecovery({ mois, annee }) {
  const queryClient = useQueryClient();
  const m = mois || (now.getMonth() + 1);
  const an = annee || CURRENT_YEAR;

  const { data: recoveryData, isLoading, error } = useQuery({
    queryKey: ['alerts/recovery', an, m],
    queryFn: async () => {
      const response = await api.get('/alerts/recovery', { params: { annee: an, mois: m } });
      return response.data;
    },
    enabled: !!m && !!an,
  });

  const { data: recommendationsData } = useQuery({
    queryKey: ['alerts/recommendations', an, m],
    queryFn: async () => {
      const response = await api.get('/alerts/recommendations', { params: { annee: an, mois: m } });
      return response.data;
    },
    enabled: !!m && !!an,
  });

  const triggerVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/alerts/verify-thresholds');
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries(['alerts/recovery']),
  });

  const kanbanColumns = [
    { key: 'identifie', label: 'Identifié', color: '#ff4757' },
    { key: 'contacte', label: 'Contacté', color: '#ffa502' },
    { key: 'sim_recuperee', label: 'SIM Récupérée', color: '#3742fa' },
    { key: 'redploye', label: 'Redéployé', color: '#00d68f' },
  ];

  return (
    <div>
      {/* Cartes résumé */}
      <div className="grid-4 mb-24">
        <KPICard title="À récupérer" value={recoveryData?.a_recuperer || 0} color="#ff4757" />
        <KPICard title="Récupérées" value={recoveryData?.recuperees || 0} color="#3742fa" />
        <KPICard title="Redéployées" value={recoveryData?.redeployees || 0} color="#00d68f" />
        <KPICard
          title="Taux Récupération"
          formatted={`${recoveryData?.taux_recuperation?.toFixed(1) || 0}%`}
          color="#00d68f"
        />
      </div>

      {/* Kanban Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {kanbanColumns.map((col) => (
          <div key={col.key} className="card" style={{ padding: '12px', minHeight: '400px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: col.color, marginBottom: '12px', paddingBottom: '8px', borderBottom: `1px solid ${col.color}30` }}>
              {col.label} ({recoveryData?.[col.key]?.length || 0})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recoveryData?.[col.key]?.map((pdv) => (
                <div
                  key={pdv.id}
                  className="card"
                  style={{
                    padding: '10px',
                    background: 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    borderLeft: `3px solid ${col.color}`,
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>{pdv.nom}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {pdv.zone}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, marginBottom: '6px' }}>
                    {formatCA(pdv.ca_3mois)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    {pdv.superviseur}
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: '11px' }}>
                    Mettre à jour
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Vérification automatique */}
      <div className="card mb-24" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Vérifier les seuils</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Déclencher une vérification automatique des seuils d'alerte</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => triggerVerificationMutation.mutate()}
          disabled={triggerVerificationMutation.isPending}
        >
          <RefreshCw size={14} /> {triggerVerificationMutation.isPending ? 'En cours...' : 'Vérifier'}
        </button>
      </div>

      {/* Recommandations */}
      <div className="card">
        <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 700 }}>🤖 Actions Prioritaires de la Semaine</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {recommendationsData?.actions?.slice(0, 10).map((action, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '8px',
                borderLeft: `3px solid var(--primary)`,
              }}
            >
              <span style={{ fontSize: '18px' }}>
                {action.priorite === 'critique' ? '🔴' : action.priorite === 'haute' ? '🟠' : '🟡'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{action.message}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>PDV: {action.pdv_nom}</div>
              </div>
              <button className="btn btn-primary btn-sm">Agir</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ MAIN PAGE ============
// ============ TAB 4: ALERTES GESTIONNAIRES ============
function TabAlertesGestionnaires({ mois, annee }) {
  const m = mois || (now.getMonth() + 1);
  const an = annee || CURRENT_YEAR;
  const [seuil, setSeuil] = useState(30);

  const { data: gests } = useQuery('gestionnaires-list',
    () => api.get('/gestionnaires/').then(r => r.data), { staleTime: 300000 });

  const { data: overviewData, isLoading } = useQuery(
    ['gestionnaires-overview-alertes', an, m],
    () => api.get('/gestionnaires/overview', { params: { annee: an, mois: m } }).then(r => r.data),
    { staleTime: 60000, enabled: !!m && !!an }
  );

  const overview = Array.isArray(overviewData) ? overviewData : [];
  // Gestionnaires avec taux recouvrement faible
  const faibleRecouvrement = overview.filter(g => g.taux_recouvrement < 70);
  // Gestionnaires avec beaucoup de PDVs inactifs
  const tropInactifs = overview.filter(g => g.nb_inactifs > 5);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        <KPICard title="🔴 Faible Recouvrement" value={faibleRecouvrement.length} color="#ff4757" subtitle="Taux < 70%" />
        <KPICard title="🟠 Trop d'Inactifs" value={tropInactifs.length} color="#ffa502" subtitle="> 5 PDVs inactifs" />
        <KPICard title="✅ Gestionnaires OK" value={overview.length - faibleRecouvrement.length} color="#2ed573" subtitle="Performants" />
      </div>

      {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div> : (
        <>
          {faibleRecouvrement.length > 0 && (
            <div className="card mb-24" style={{ borderLeft: '3px solid #ff4757' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#ff4757' }}>
                🔴 Gestionnaires avec taux de recouvrement faible (&lt; 70%)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Gestionnaire</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>CA Total</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Envoyé</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Récupéré</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Taux</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>PDVs</th>
                  </tr>
                </thead>
                <tbody>
                  {faibleRecouvrement.map((g, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{g.gestionnaire}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--primary)' }}>{formatCA(g.ca_total)}</td>
                      <td style={{ padding: '10px 12px', color: '#4a9eff' }}>{formatCA(g.montant_envoye)}</td>
                      <td style={{ padding: '10px 12px', color: '#00d68f' }}>{formatCA(g.montant_recupere)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontWeight: 700, color: g.taux_recouvrement < 50 ? '#ff4757' : '#ffa502' }}>
                          {g.taux_recouvrement}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: '#2ed573' }}>{g.nb_actifs} actifs</span>
                        {' / '}
                        <span style={{ color: '#ff4757' }}>{g.nb_inactifs} inactifs</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tropInactifs.length > 0 && (
            <div className="card" style={{ borderLeft: '3px solid #ffa502' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#ffa502' }}>
                🟠 Gestionnaires avec trop de PDVs inactifs (&gt; 5)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Gestionnaire</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>PDVs Actifs</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>PDVs Inactifs</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>% Inactifs</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Zones</th>
                  </tr>
                </thead>
                <tbody>
                  {tropInactifs.map((g, i) => {
                    const pctInactif = g.nb_pdvs > 0 ? Math.round(g.nb_inactifs / g.nb_pdvs * 100) : 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{g.gestionnaire}</td>
                        <td style={{ padding: '10px 12px', color: '#2ed573', fontWeight: 700 }}>{g.nb_actifs}</td>
                        <td style={{ padding: '10px 12px', color: '#ff4757', fontWeight: 700 }}>{g.nb_inactifs}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontWeight: 700, color: pctInactif > 50 ? '#ff4757' : '#ffa502' }}>{pctInactif}%</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>
                          {(g.zones || []).slice(0, 3).join(', ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {faibleRecouvrement.length === 0 && tropInactifs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, background: 'rgba(46,213,115,0.05)', borderRadius: 12, border: '1px solid rgba(46,213,115,0.2)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ color: '#2ed573', fontWeight: 700, fontSize: 15 }}>Tous les gestionnaires sont performants ce mois !</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============ TAB 5: RISQUE DEGRADATION GRADE ============
function TabRisqueDegradationGrade({ mois, annee }) {
  const m = mois || (now.getMonth() + 1);
  const an = annee || CURRENT_YEAR;

  const { data, isLoading } = useQuery(
    ['grades-alertes-alertspage', an, m],
    () => api.get('/grades/alertes', { params: { annee: an, mois: m } }).then(r => r.data),
    { staleTime: 60000, enabled: !!m && !!an }
  );

  const alertes = Array.isArray(data) ? data : [];
  const elevees = alertes.filter(a => a.risque === 'eleve');
  const moderees = alertes.filter(a => a.risque === 'modere');

  const GRADE_COLORS = { diamant: '#00d6ff', or: '#FFD700', argent: '#C0C0C0', fer: '#888888', cuivre: '#CD7F32' };
  const GRADE_ICONS = { diamant: '💎', or: '🥇', argent: '🥈', fer: '🦾', cuivre: '🟤' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        <KPICard title="🔴 Risque Élevé" value={elevees.length} color="#ff4757" subtitle="CA < 90% du seuil" />
        <KPICard title="🟠 Risque Modéré" value={moderees.length} color="#ffa502" subtitle="CA < 110% du seuil" />
        <KPICard title="⚠️ Total en Risque" value={alertes.length} color="#ffa502" subtitle="PDVs à surveiller" />
      </div>

      {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div> : (
        alertes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: 'rgba(46,213,115,0.05)', borderRadius: 12, border: '1px solid rgba(46,213,115,0.2)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ color: '#2ed573', fontWeight: 700 }}>Aucun PDV en risque de dégradation de grade ce mois</div>
          </div>
        ) : (
          <>
            {elevees.length > 0 && (
              <div className="card mb-24" style={{ borderLeft: '3px solid #ff4757' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#ff4757', marginBottom: 14 }}>
                  🔴 Risque élevé — CA inférieur à 90% du seuil de grade ({elevees.length} PDVs)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>PDV</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>Zone</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>Gestionnaire</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>Grade Actuel</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>CA Actuel</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>Seuil</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>% Atteint</th>
                      </tr>
                    </thead>
                    <tbody>
                      {elevees.map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i%2===0?'rgba(255,255,255,0.01)':'transparent' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 600 }}>{a.pdv_nom}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', fontSize: 11 }}>{a.zone}</td>
                          <td style={{ padding: '9px 10px', fontSize: 11 }}>{a.gestionnaire}</td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ color: GRADE_COLORS[a.grade], fontWeight: 700 }}>
                              {GRADE_ICONS[a.grade]} {a.grade}
                            </span>
                          </td>
                          <td style={{ padding: '9px 10px', color: 'var(--primary)', fontWeight: 700 }}>{formatCA(a.ca)}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{formatCA(a.seuil_grade)}</td>
                          <td style={{ padding: '9px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 50, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(a.pct_seuil,100)}%`, height:'100%', background:'#ff4757', borderRadius: 3 }}/>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#ff4757' }}>{a.pct_seuil}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {moderees.length > 0 && (
              <div className="card" style={{ borderLeft: '3px solid #ffa502' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#ffa502', marginBottom: 14 }}>
                  🟠 Risque modéré — CA entre 90% et 110% du seuil ({moderees.length} PDVs)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>PDV</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>Zone</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>Grade</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>CA</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)' }}>% Seuil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moderees.map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 600 }}>{a.pdv_nom}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', fontSize: 11 }}>{a.zone}</td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ color: GRADE_COLORS[a.grade], fontWeight: 700 }}>{GRADE_ICONS[a.grade]} {a.grade}</span>
                          </td>
                          <td style={{ padding: '9px 10px', color: 'var(--primary)', fontWeight: 600 }}>{formatCA(a.ca)}</td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ fontWeight: 700, color: '#ffa502' }}>{a.pct_seuil}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

export default function AlertsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inactifs');

  // Charger la dernière période disponible
  const { data: lastAvailable } = useQuery({
    queryKey: ['last-available'],
    queryFn: () => api.get('/dashboard/last-available').then(r => r.data),
    staleTime: 300000,
  });

  const lastSemaine = lastAvailable?.last_week?.semaine || CURRENT_WEEK;
  const lastAnnee = lastAvailable?.last_week?.annee || CURRENT_YEAR;
  const lastMois = lastAvailable?.last_month?.mois || now.getMonth() + 1;
  const lastMoisAnnee = lastAvailable?.last_month?.annee || CURRENT_YEAR;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔔 Alertes & Récupérations</h1>
          <p className="page-subtitle">Gestion des PDVs inactifs, baisses CA, gestionnaires et grades</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container mb-24">
        {[
          { id: 'inactifs',    label: '📵 PDVs Inactifs' },
          { id: 'declining',   label: '📉 Baisses CA' },
          { id: 'recovery',    label: '♻️ Récupérations' },
          { id: 'gestionnaires', label: '👔 Gestionnaires' },
          { id: 'grades',      label: '🏅 Risque Grades' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'inactifs'      && <TabInactivePDVs semaine={lastSemaine} annee={lastAnnee} />}
        {activeTab === 'declining'     && <TabDecliningCA mois={lastMois} annee={lastMoisAnnee} />}
        {activeTab === 'recovery'      && <TabRecovery mois={lastMois} annee={lastMoisAnnee} />}
        {activeTab === 'gestionnaires' && <TabAlertesGestionnaires mois={lastMois} annee={lastMoisAnnee} />}
        {activeTab === 'grades'        && <TabRisqueDegradationGrade mois={lastMois} annee={lastMoisAnnee} />}
      </div>
    </div>
  );
}
