import api from './api';

/**
 * Service Frontend - Module Prospection (puces Orange Money)
 * ===========================================================
 * Couvre toutes les actions du workflow :
 *   - listing & filtres
 *   - création / mise à jour
 *   - assign visite / décision dev / décision RC
 *   - attribution puce / activation
 *   - annulation
 *   - statistiques
 */

const base = '/prospects';

export const prospectService = {
  // ── Lecture ───────────────────────────────────────────
  list: (params = {}) => api.get(base, { params }).then(r => r.data),
  get: (id) => api.get(`${base}/${id}`).then(r => r.data),
  stats: () => api.get(`${base}/stats`).then(r => r.data),

  // ── Écriture ──────────────────────────────────────────
  create: (payload) => api.post(base, payload).then(r => r.data),
  update: (id, payload) => api.patch(`${base}/${id}`, payload).then(r => r.data),

  // ── Workflow ──────────────────────────────────────────
  assignVisit: (id, payload) => api.post(`${base}/${id}/assign-visit`, payload).then(r => r.data),
  devDecision: (id, payload) => api.post(`${base}/${id}/dev-decision`, payload).then(r => r.data),
  rcDecision: (id, payload) => api.post(`${base}/${id}/rc-decision`, payload).then(r => r.data),
  assignPuce: (id, payload) => api.post(`${base}/${id}/assign-puce`, payload).then(r => r.data),
  activate: (id, payload = {}) => api.post(`${base}/${id}/activate`, payload).then(r => r.data),
  cancel: (id, payload) => api.post(`${base}/${id}/cancel`, payload).then(r => r.data),

  // ── IA ────────────────────────────────────────────────
  aiOverview: () => api.get(`${base}/ai/overview`).then(r => r.data),
  aiScore: (id) => api.get(`${base}/${id}/ai/score`).then(r => r.data),
  aiRecommendation: (id) => api.get(`${base}/${id}/ai/recommendation`).then(r => r.data),
  aiForecast: (id) => api.get(`${base}/${id}/ai/forecast`).then(r => r.data),
  aiDuplicates: (id) => api.get(`${base}/${id}/ai/duplicates`).then(r => r.data),

  // ── Géolocalisation ──────────────────────────────────
  geoMap:        () => api.get(`${base}/geo/map`).then(r => r.data),
  geoHeatmap:    () => api.get(`${base}/geo/heatmap`).then(r => r.data),
  geoNearby:     (id) => api.get(`${base}/${id}/geo/nearby`).then(r => r.data),
  geoRoute:      (lat, lng) => api.get(`${base}/geo/route`, { params: { start_lat: lat, start_lng: lng } }).then(r => r.data),
  geoVerify:     (id, lat, lng) => api.post(`${base}/${id}/geo/verify`, null, { params: { lat, lng } }).then(r => r.data),

  // ── Stock de puces ──────────────────────────────────
  stockList:     (params = {}) => api.get(`${base}/stock/list`, { params }).then(r => r.data),
  stockStats:    () => api.get(`${base}/stock/stats`).then(r => r.data),
  stockCreateLot:(lot_code, numbers) => {
    const fd = new FormData(); fd.append('lot_code', lot_code); fd.append('numbers', numbers);
    return api.post(`${base}/stock/lot`, fd).then(r => r.data);
  },
  stockChange:   (numero, new_status) => api.post(`${base}/stock/${numero}/status`, null, { params: { new_status } }).then(r => r.data),

  // ── Notifications ────────────────────────────────────
  notifList:     (unread_only = false) => api.get(`${base}/notifications/me`, { params: { unread_only } }).then(r => r.data),
  notifCount:    () => api.get(`${base}/notifications/me/count`).then(r => r.data),
  notifRead:     (id) => api.post(`${base}/notifications/${id}/read`).then(r => r.data),
  notifReadAll:  () => api.post(`${base}/notifications/me/read-all`).then(r => r.data),
  notifFlush:    () => api.post(`${base}/notifications/flush`).then(r => r.data),
  notifStagnant: (days = 3) => api.get(`${base}/notifications/stagnant`, { params: { days } }).then(r => r.data),
  notifProviders:() => api.get(`${base}/notifications/providers`).then(r => r.data),
  notifTest:     (params) => api.post(`${base}/notifications/test`, null, { params }).then(r => r.data),
  notifProvidersReload: () => api.post(`${base}/notifications/providers/reload`).then(r => r.data),

  // ── Reporting ────────────────────────────────────────
  repFunnel:     () => api.get(`${base}/reporting/funnel`).then(r => r.data),
  repPerDev:     () => api.get(`${base}/reporting/per-developer`).then(r => r.data),
  repPerZone:    () => api.get(`${base}/reporting/per-zone`).then(r => r.data),
  repPipeline:   () => api.get(`${base}/reporting/rc-pipeline`).then(r => r.data),
  repTTA:        () => api.get(`${base}/reporting/time-to-activation`).then(r => r.data),

  // ── Post-activation ──────────────────────────────────
  postList:      (prospect_id) => api.get(`${base}/postact/list`, { params: prospect_id ? { prospect_id } : {} }).then(r => r.data),
  postGenerate:  (period_days) => api.post(`${base}/postact/generate`, null, { params: { period_days } }).then(r => r.data),
  postDormant:   () => api.get(`${base}/postact/dormant`).then(r => r.data),
  postCalib:     () => api.get(`${base}/postact/calibration`).then(r => r.data),

  // ── Gamification ─────────────────────────────────────
  gameLB:        (period) => api.get(`${base}/gamification/leaderboard`, { params: period ? { period } : {} }).then(r => r.data),
  gameCompute:   (period) => api.post(`${base}/gamification/compute-badges`, null, { params: period ? { period } : {} }).then(r => r.data),
  gameBadges:    (uid) => api.get(`${base}/gamification/badges/${uid}`).then(r => r.data),
  gameObjList:   (params = {}) => api.get(`${base}/gamification/objectives`, { params }).then(r => r.data),
  gameObjCreate: (params) => api.post(`${base}/gamification/objectives`, null, { params }).then(r => r.data),

  // ── Pièces jointes ───────────────────────────────────
  attList:       (id) => api.get(`${base}/${id}/attachments`).then(r => r.data),
  attUpload:     (id, kind, file) => {
    const fd = new FormData(); fd.append('kind', kind); fd.append('file', file);
    return api.post(`${base}/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  attDelete:     (aid) => api.delete(`${base}/attachments/${aid}`).then(r => r.data),
  attCheck:      (id) => api.get(`${base}/${id}/attachments/check`).then(r => r.data),

  // ── Export ───────────────────────────────────────────
  exportXlsxUrl: (status) => `${api.defaults.baseURL}${base}/export.xlsx${status ? `?status=${status}` : ''}`,
};

// ── Constantes UI ────────────────────────────────────────
export const STATUS_LABELS = {
  NOUVELLE:        { label: '🆕 Nouvelle',        color: '#94a3b8' },
  EN_VISITE:       { label: '🔍 En visite',       color: '#0ea5e9' },
  VALIDEE_DEV:     { label: '✅ Validée Dev',     color: '#10b981' },
  REFUSEE_DEV:     { label: '❌ Refusée Dev',     color: '#f97316' },
  EN_ATTENTE_RC:   { label: '⏳ En attente RC',    color: '#eab308' },
  APPROUVEE_RC:    { label: '🟢 Approuvée RC',    color: '#22c55e' },
  REFUSEE_RC:      { label: '🚫 Refusée RC',      color: '#ef4444' },
  PUCE_ATTRIBUEE:  { label: '📦 Puce attribuée', color: '#6366f1' },
  PUCE_ACTIVEE:    { label: '⚡ Puce activée',    color: '#16a34a' },
  ANNULEE:         { label: '❎ Annulée',         color: '#6b7280' },
};

prospectService.delete = (id) => api.delete(`/prospects/${id}`);

export default prospectService;
