import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Affiche une erreur de chargement lisible à la place d'une zone vide.
 * Évite l'écran blanc silencieux quand une requête échoue (ex : erreur 500).
 */
export default function QueryError({ error, label = 'les données', onRetry }) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail
    || error?.response?.data?.message
    || error?.message
    || 'Erreur inconnue';

  return (
    <div style={{
      margin: '40px auto', maxWidth: 580, padding: '20px 24px',
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)',
      borderRadius: 12, color: '#f1f5f9',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontWeight: 800, fontSize: 15, marginBottom: 8,
      }}>
        <AlertTriangle size={18} color="#ef4444" />
        Impossible de charger {label}
      </div>
      <div style={{
        fontSize: 13, color: '#cbd5e1', lineHeight: 1.6,
        wordBreak: 'break-word', whiteSpace: 'pre-wrap',
      }}>
        {status ? <b>HTTP {status} — </b> : null}
        {String(detail)}
      </div>
      {onRetry && (
        <button
          onClick={() => onRetry()}
          style={{
            marginTop: 14, padding: '8px 16px', background: '#ef4444', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={13} /> Réessayer
        </button>
      )}
    </div>
  );
}
