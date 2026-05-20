import api from './api';
const base = '/evaluations';

export const evalService = {
  // Config
  allConfigs:      ()              => api.get(`${base}/configs`).then(r => r.data),
  getConfig:       (role)          => api.get(`${base}/configs/${role}`).then(r => r.data),
  updateConfig:    (role, payload) => api.put(`${base}/configs/${role}`, payload).then(r => r.data),
  resetConfig:     (role)          => api.post(`${base}/configs/${role}/reset`).then(r => r.data),

  // Campagnes
  listCampaigns:   (params={})     => api.get(`${base}/campaigns`, { params }).then(r => r.data),
  createCampaign:  (payload)       => api.post(`${base}/campaigns`, payload).then(r => r.data),
  getCampaign:     (id)            => api.get(`${base}/campaigns/${id}`).then(r => r.data),
  generateMystery: (id)            => api.post(`${base}/campaigns/${id}/generate-mystery`).then(r => r.data),
  computeAll:      (id)            => api.post(`${base}/campaigns/${id}/compute`).then(r => r.data),
  computeOne:      (cid, uid)      => api.post(`${base}/campaigns/${cid}/scores/${uid}/compute`).then(r => r.data),
  closeCampaign:   (id)            => api.post(`${base}/campaigns/${id}/close`).then(r => r.data),
  getScore:        (cid, uid)      => api.get(`${base}/campaigns/${cid}/scores/${uid}`).then(r => r.data),
  addManualNote:   (cid, uid, p)   => api.post(`${base}/campaigns/${cid}/scores/${uid}/manual-note`, p).then(r => r.data),
  downloadPdf:     (cid, uid)      => `${api.defaults.baseURL}${base}/campaigns/${cid}/scores/${uid}/pdf`,

  // Appels mystères
  myMysteryQueue:  ()              => api.get(`${base}/mystery/my-queue`).then(r => r.data),
  logMystery:      (id, payload)   => api.post(`${base}/mystery/${id}/log`, payload).then(r => r.data),
  mysteryStats:    (cid)           => api.get(`${base}/mystery/stats/${cid}`).then(r => r.data),
  geoTest:         (cid, uid)      => api.get(`${base}/mystery/geo-test/${cid}/${uid}`).then(r => r.data),

  // Dashboard & objectifs
  dashboard:       ()              => api.get(`${base}/dashboard`).then(r => r.data),
  listObjectives:  (params={})     => api.get(`${base}/objectives`, { params }).then(r => r.data),
  createObjective: (payload)       => api.post(`${base}/objectives`, payload).then(r => r.data),
  validateObjective: (id, status)  => api.patch(`${base}/objectives/${id}/validate`, null, { params: { status } }).then(r => r.data),
};

export const ROLE_LABELS = {
  SUPERVISEUR:     { label: '👤 Superviseur',       color: '#3b82f6' },
  GESTIONNAIRE:    { label: '💼 Gestionnaire',      color: '#8b5cf6' },
  DEVELOPPEUR:     { label: '🚶 Développeur',       color: '#10b981' },
  TELECONSEILLERE: { label: '📞 Téléconseillère',   color: '#f97316' },
};

export const STATUS_LABELS = {
  DRAFT:    { label: '📝 Brouillon',  color: '#94a3b8' },
  ACTIVE:   { label: '▶️ Active',     color: '#3b82f6' },
  REVIEW:   { label: '🔍 En revue',   color: '#eab308' },
  CLOSED:   { label: '✅ Clôturée',   color: '#10b981' },
  ARCHIVED: { label: '🗄️ Archivée',  color: '#6b7280' },
};

export const SCORE_COLOR = (s) => {
  if (!s) return 'var(--text-muted)';
  if (s >= 80) return 'var(--success)';
  if (s >= 60) return 'var(--warning)';
  return 'var(--danger)';
};

export default evalService;
