import api from './api';

const dashboardService = {
  // Get monthly dashboard data
  getMonthlyDashboard: async (params = {}) => {
    try {
      // Backend attend annee/mois (pas year/month)
      const backendParams = {
        annee: params.year || params.annee || new Date().getFullYear(),
        mois: params.month || params.mois || new Date().getMonth() + 1,
        zone: params.zone,
        superviseur: params.superviseur,
      };
      const response = await api.get('/dashboard/monthly', { params: backendParams });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get weekly dashboard data
  getWeeklyDashboard: async (params = {}) => {
    try {
      const response = await api.get('/dashboard/weekly', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get Pareto analysis data
  getParetoAnalysis: async (params = {}) => {
    try {
      const response = await api.get('/dashboard/pareto', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get classements (rankings)
  getClassements: async (params = {}) => {
    try {
      const response = await api.get('/dashboard/classements', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get network statistics
  getNetworkStats: async () => {
    try {
      const response = await api.get('/dashboard/network-stats');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};

export default dashboardService;
