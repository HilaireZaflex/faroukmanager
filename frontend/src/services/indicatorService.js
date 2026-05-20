import api from './api';

const base = '/indicators';

const indicatorService = {
  // ── CRUD indicateurs ──────────────────────────────────
  list:        (params = {}) => api.get(base, { params }).then(r => r.data),
  get:         (id) => api.get(`${base}/${id}`).then(r => r.data),
  create:      (payload) => api.post(base, payload).then(r => r.data),
  update:      (id, payload) => api.patch(`${base}/${id}`, payload).then(r => r.data),
  archive:     (id) => api.post(`${base}/${id}/archive`).then(r => r.data),

  globalStats: (period_key) => api.get(`${base}/global-stats`, { params: period_key ? { period_key } : {} }).then(r => r.data),
  stats:       (id, period_key) => api.get(`${base}/${id}/stats`, { params: period_key ? { period_key } : {} }).then(r => r.data),
  evolution:   (id, n_periods = 12) => api.get(`${base}/${id}/evolution`, { params: { n_periods } }).then(r => r.data),
  pdvs:        (id, params = {}) => api.get(`${base}/${id}/pdvs`, { params }).then(r => r.data),
  setScore:    (id, params) => api.post(`${base}/${id}/scores`, null, { params }).then(r => r.data),
  importXlsx:  (id, file, period_key, opts = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('period_key', period_key);
    fd.append('pdv_col', opts.pdv_col || 'numero_pdv');
    if (opts.value_col) fd.append('value_col', opts.value_col);
    if (opts.active_col) fd.append('active_col', opts.active_col);
    return api.post(`${base}/${id}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },

  // ── Campagnes appels ────────────────────────────────
  callCampaigns:        (status) => api.get(`${base}/campaigns/calls`, { params: status ? { status } : {} }).then(r => r.data),
  createCallCampaign:   (payload) => api.post(`${base}/campaigns/calls`, payload).then(r => r.data),
  callCampaignDetail:   (id) => api.get(`${base}/campaigns/calls/${id}`).then(r => r.data),
  assignCallTasks:      (id, payload) => api.post(`${base}/campaigns/calls/${id}/assign`, payload).then(r => r.data),
  callCampaignStats:    (id) => api.get(`${base}/campaigns/calls/${id}/stats`).then(r => r.data),

  // ── File d'attente téléconseillère ───────────────────
  myCallQueue: (status) => api.get(`${base}/calls/my-queue`, { params: status ? { status } : {} }).then(r => r.data),
  logCall:     (task_id, payload) => api.post(`${base}/calls/${task_id}/log`, payload).then(r => r.data),

  // ── Campagnes terrain ────────────────────────────────
  fieldCampaigns:        () => api.get(`${base}/campaigns/field`).then(r => r.data),
  createFieldCampaign:   (payload) => api.post(`${base}/campaigns/field`, payload).then(r => r.data),
  assignFieldVisits:     (id, payload) => api.post(`${base}/campaigns/field/${id}/assign`, payload).then(r => r.data),

  // ── IA ──────────────────────────────────────────────
  aiInsights:  (id, since_days = 30) => api.get(`${base}/${id}/ai/insights`, { params: { since_days } }).then(r => r.data),
  aiDropouts:  (id) => api.get(`${base}/${id}/ai/dropouts`).then(r => r.data),
  aiDiagnose:  (indicator_id, pdv_id) => api.get(`${base}/${indicator_id}/ai/diagnose/${pdv_id}`).then(r => r.data),
  aiWhatIf:    (id, recovery_pct = 20.0) => api.get(`${base}/${id}/ai/what-if`, { params: { recovery_pct } }).then(r => r.data),

  // ── Évaluation ──────────────────────────────────────
  evalLeaderboard:    (params = {}) => api.get(`${base}/eval/leaderboard`, { params }).then(r => r.data),
  evalUser:           (user_id, params = {}) => api.get(`${base}/eval/user/${user_id}`, { params }).then(r => r.data),
  evalUserZones:      (user_id, indicator_id, period_days = 60) =>
    api.get(`${base}/eval/user/${user_id}/zones/${indicator_id}`, { params: { period_days } }).then(r => r.data),
};

export const CATEGORY_LABELS = {
  PRODUIT: { label: '🛍️ Produit', color: '#3b82f6' },
  SERVICE: { label: '⚙️ Service', color: '#10b981' },
  PROMOTION: { label: '🎁 Promotion', color: '#f59e0b' },
  CAMPAGNE: { label: '📢 Campagne', color: '#8b5cf6' },
  QUALITE: { label: '⭐ Qualité', color: '#06b6d4' },
  AUTRE: { label: '🏷️ Autre', color: '#6b7280' },
};

export const OUTCOME_LABELS = {
  REACHED:      { label: '✅ Joint', color: '#10b981' },
  NO_ANSWER:    { label: '❌ Pas de réponse', color: '#6b7280' },
  WRONG_NUMBER: { label: '📞 Faux numéro', color: '#f97316' },
  REFUSED:      { label: '🚫 Refus', color: '#ef4444' },
  CALLBACK:     { label: '🔁 À rappeler', color: '#eab308' },
  BUSY:         { label: '📵 Occupé', color: '#94a3b8' },
  OFF:          { label: '📴 Éteint', color: '#94a3b8' },
};

export default indicatorService;
