import api from './api';
const base = '/commissions';
const fmt = (n) => n?.toLocaleString('en-US').replace(/,/g, ' ') + ' F';
const fmtM = (n) => n ? (n / 1_000_000).toFixed(2).replace('.', ',').replace(/B(?=(d{3})+(?!d))/g, ' ') + ' MF' : '0 MF';

export const commissionService = {
  periods:    ()       => api.get(`${base}/periods`).then(r => r.data),
  dashboard:  (p, t)   => api.get(`${base}/dashboard`, { params: { period_key: p, ...(t ? { pdv_type: t } : {}) } }).then(r => r.data),
  entries:    (params) => api.get(`${base}/entries`, { params }).then(r => r.data),
  evolution:  (n, t, filters = {}) => api.get(`${base}/evolution`, { params: { n_periods: n, ...(t ? { pdv_type: t } : {}), ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) } }).then(r => r.data),
  topPdvs:    (p, n, t)=> api.get(`${base}/top-pdvs`, { params: { period_key: p, n, ...(t ? { pdv_type: t } : {}) } }).then(r => r.data),
  exportUrl:  (p, t)   => `${api.defaults.baseURL}${base}/export.xlsx?period_key=${p}${t ? `&pdv_type=${t}` : ''}`,
  import:     (formData) => api.post(`${base}/import`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
};

export const TYPE_COLORS = {
  RNS:     '#3b82f6',
  RSF:     '#10b981',
  RS:      '#8b5cf6',
  KIOSQUE: '#FF6900',
};

export const TYPE_LABELS = {
  RNS:     '🔵 RNS',
  RSF:     '🟢 RSF',
  RS:      '🟣 RS',
  KIOSQUE: '🟠 KIOSQUE',
};

export const REV_STATUS_LABELS = {
  NON_APPLICABLE: { label: '➖ Non applicable', color: '#6b7280' },
  EN_ATTENTE:     { label: '⏳ En attente',     color: '#eab308' },
  PARTIEL:        { label: '🔶 Partiel',         color: '#f97316' },
  PAYE:           { label: '✅ Payé',            color: '#10b981' },
};

export { fmt, fmtM };
export default commissionService;
