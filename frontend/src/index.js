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

// ── PWA : service worker « notifications push » ──
// Le service worker ne met PLUS rien en cache et n'intercepte aucune requête :
// il ne sert qu'à recevoir les notifications et à ouvrir le bon écran au clic.
// Les anciens service workers (qui servaient une version périmée de
// l'application) sont remplacés par celui-ci : même adresse, donc mise à jour
// automatique, et son activation efface les anciens caches.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(inscriptions => Promise.all(inscriptions
        // Tout autre service worker (ancienne version) est supprimé.
        .filter(i => !(i.active && i.active.scriptURL.endsWith('/service-worker.js')) &&
                      !(i.installing && i.installing.scriptURL.endsWith('/service-worker.js')) &&
                      !(i.waiting && i.waiting.scriptURL.endsWith('/service-worker.js')))
        .map(i => i.unregister().catch(() => false))))
      .catch(() => {})
      .finally(() => {
        navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
      });
  });
}
