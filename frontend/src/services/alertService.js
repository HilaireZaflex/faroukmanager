import api from './api';

const alertService = {
  // Get inactive PDVs
  getInactivePDVs: async (params = {}) => {
    try {
      const response = await api.get('/alerts/inactive', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get declining PDVs
  getDecliningPDVs: async (params = {}) => {
    try {
      const response = await api.get('/alerts/declining', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get recovery list
  getRecoveryList: async (params = {}) => {
    try {
      const response = await api.get('/alerts/recovery', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Update recovery status
  updateRecovery: async (data) => {
    try {
      const response = await api.post('/alerts/recovery/update', data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get recovery synthese
  getRecoverySynthese: async () => {
    try {
      const response = await api.get('/alerts/recovery/synthese');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get AI recommendations
  getRecommendations: async (params = {}) => {
    try {
      const response = await api.get('/alerts/recommendations', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Create a terrain action
  createAction: async (data) => {
    try {
      const response = await api.post('/alerts/actions', data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get actions for a specific PDV
  getActions: async (pdvId, params = {}) => {
    try {
      const response = await api.get(`/alerts/actions/${pdvId}`, { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};

export default alertService;
