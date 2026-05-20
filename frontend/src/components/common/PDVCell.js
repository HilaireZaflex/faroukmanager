import React from 'react';

/**
 * Composant réutilisable pour afficher un PDV dans un tableau.
 * Affiche le numéro PDV en haut (orange, bold) et le nom en dessous.
 *
 * Props:
 *   nom        - Nom du PDV (ex: "OUMAR DIALLO")
 *   numero     - Numéro PDV (ex: "94972670")
 *   compact    - Si true, affiche sur une seule ligne séparée par un tiret
 */
export default function PDVCell({ nom, numero, compact = false }) {
  const numStr = numero || '';
  const nomStr = nom || '—';

  if (compact) {
    return (
      <span>
        {numStr && (
          <span style={{ color: '#FF6900', fontWeight: 700, marginRight: 6, fontSize: 11 }}>
            {numStr}
          </span>
        )}
        <span style={{ fontWeight: 600 }}>{nomStr}</span>
      </span>
    );
  }

  return (
    <div style={{ lineHeight: 1.3 }}>
      {numStr && (
        <div style={{
          color: '#FF6900',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '0.5px',
          marginBottom: 2
        }}>
          {numStr}
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 13 }}>{nomStr}</div>
    </div>
  );
}
