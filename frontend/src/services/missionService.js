/**
 * Service « Missions d'appels ».
 *
 * Créées par l'encadrement (Admin, RC, Manager, Conformité, Responsable
 * Produit & Qualité), exécutées par les téléconseillères.
 */
import api from './api';

const base = '/missions-appels';

export const missionService = {
  // ── Référentiels ──
  filtres:   ()            => api.get(`${base}/filtres`).then(r => r.data),
  personnes: (params)      => api.get(`${base}/personnes`, { params }).then(r => r.data),
  apercu:    (payload)     => api.post(`${base}/apercu`, payload).then(r => r.data),

  // ── Encadrement ──
  lister:    (params)      => api.get(base, { params }).then(r => r.data),
  detail:    (id)          => api.get(`${base}/${id}`).then(r => r.data),
  creer:     (payload)     => api.post(base, payload).then(r => r.data),
  modifier:  (id, payload) => api.patch(`${base}/${id}`, payload).then(r => r.data),
  attribuer: (id, payload) => api.post(`${base}/${id}/attribuer`, payload).then(r => r.data),
  desattribuer: (id, payload) => api.post(`${base}/${id}/desattribuer`, payload).then(r => r.data),
  cloturer:  (id, statut)  => api.post(`${base}/${id}/cloturer`, { statut: statut || 'TERMINEE' }).then(r => r.data),
  stats:     (id)          => api.get(`${base}/${id}/stats`).then(r => r.data),
  exportExcel: (id)        => api.get(`${base}/${id}/export`, { responseType: 'blob' })
                                .then(r => {
                                  const url = window.URL.createObjectURL(new Blob([r.data]));
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `mission_${id}.xlsx`;
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                }),

  // ── Téléconseillère ──
  mesMissions: ()          => api.get(`${base}/mes-missions`).then(r => r.data),
  maFile:      ()          => api.get(`${base}/ma-file`).then(r => r.data),
  enregistrerAppel: (cibleId, payload) => api.post(`${base}/cibles/${cibleId}/appel`, payload).then(r => r.data),
  marquerCible: (cibleId, payload)     => api.patch(`${base}/cibles/${cibleId}`, payload).then(r => r.data),
};

export default missionService;
