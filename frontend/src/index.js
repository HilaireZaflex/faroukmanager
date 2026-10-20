// v2026-08-03-accueil-tc-build2
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 10 * 60 * 1000,  // 10 min cache
      cacheTime: 30 * 60 * 1000,  // 30 min en mémoire
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#12121e',
              color: '#f0f0f0',
              border: '1px solid rgba(255,105,0,0.3)',
              borderRadius: '10px',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#00d68f', secondary: '#12121e' } },
            error: { iconTheme: { primary: '#ff4757', secondary: '#12121e' } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// ── PWA : service worker DÉSACTIVÉ (20/10/2026) ──
// Il servait une version mise en cache de l'application : après un déploiement,
// les navigateurs continuaient d'exécuter l'ancienne version (écran blanc,
// connexion impossible) sans jamais recontacter le serveur.
// On ne l'enregistre plus. Les anciens service workers installés se
// désenregistrent d'eux-mêmes via public/service-worker de désinstallation.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(inscriptions => Promise.all(inscriptions.map(i => i.unregister().catch(() => false))))
      .catch(() => {});
  });
}

