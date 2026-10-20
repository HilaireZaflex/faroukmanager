import axios from 'axios';
import useAuthStore from '../store/authStore';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://faroukmanager-backend-production-feb9.up.railway.app/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000, // 10 minutes - nécessaire pour les gros imports (fichiers 30-40MB)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Laisser le navigateur définir Content-Type et la boundary multipart.
    // C'est indispensable pour les FormData, notamment sur Safari/iOS.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Ne JAMAIS rediriger sur l'échec de la connexion elle-même : sinon la page
    // se recharge et le message « Identifiants incorrects » disparaît avant d'être
    // lu. L'utilisateur voyait un simple clignotement, sans aucune explication.
    const urlAppelee = error.config?.url || '';
    const estTentativeDeConnexion = urlAppelee.includes('/auth/login');

    if (error.response?.status === 401 && !estTentativeDeConnexion) {
      // Clear auth state and redirect to login
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
