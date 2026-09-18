import React from 'react';

/**
 * Tri générique des tableaux.
 * Ajoute une petite flèche sur chaque en-tête de colonne : clic = tri
 * croissant, second clic = décroissant.
 *
 * Usage :
 *   const [tri, setTri] = useState({ col: null, dir: 'asc' });
 *   const lignes = trierLignes(data, tri, {
 *     nom:   r => r.nom,
 *     ca:    r => r.ca,
 *   });
 *   <Th col="nom" label="Nom" tri={tri} setTri={setTri} />
 */
export function trierLignes(rows, tri, accesseurs) {
  if (!rows || !tri || !tri.col || !accesseurs || !accesseurs[tri.col]) return rows || [];
  const get = accesseurs[tri.col];
  const sens = tri.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    // Les valeurs vides passent toujours en fin de liste
    if (va == null || va === '') return 1;
    if (vb == null || vb === '') return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sens;
    return String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' }) * sens;
  });
}

export function Th({ col, label, tri, setTri, align = 'left', color, style, title }) {
  const actif = tri && tri.col === col;
  const fleche = actif ? (tri.dir === 'asc' ? '▲' : '▼') : '⇅';
  return (
    <th
      onClick={() => setTri(t => ({ col, dir: t && t.col === col && t.dir === 'asc' ? 'desc' : 'asc' }))}
      title={title || `Trier par ${typeof label === 'string' ? label : col}`}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        textAlign: align,
        color,
        ...style,
      }}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        width: '100%',
      }}>
        <span>{label}</span>
        <span style={{
          fontSize: 9,
          lineHeight: 1,
          color: actif ? '#FF6900' : 'currentColor',
          opacity: actif ? 1 : 0.4,
        }}>{fleche}</span>
      </span>
    </th>
  );
}

export default Th;
