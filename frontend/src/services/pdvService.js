import api from './api';

const pdvService = {
  // Get all PDVs with optional filters
  getPDVs: async (filters = {}) => {
    try {
      const response = await api.get('/pdvs', { params: filters });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get a single PDV by ID
  getPDV: async (id) => {
    try {
      const response = await api.get(`/pdvs/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Create a new PDV
  createPDV: async (data) => {
    try {
      const response = await api.post('/pdvs', data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Update an existing PDV
  updatePDV: async (id, data) => {
    try {
      const response = await api.put(`/pdvs/${id}`, data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Delete a PDV
  deletePDV: async (id) => {
    try {
      const response = await api.delete(`/pdvs/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Import PDVs from file
  importPDVs: async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/pdvs/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Export PDVs to file
  exportPDVs: async (filters = {}) => {
    try {
      const response = await api.get('/pdvs/export', {
        params: filters,
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get PDV statistics
  getPDVStats: async () => {
    try {
      const response = await api.get('/pdvs/stats');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};

export default pdvService;
