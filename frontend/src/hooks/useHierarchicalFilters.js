/**
 * Hook de filtres hiérarchiques Zone → Superviseur
 * - Quand une zone est sélectionnée, seuls les superviseurs de cette zone apparaissent
 * - Le filtre gestionnaire est supprimé (non utilisé)
 */
import { useState, useMemo } from 'react';

export function useHierarchicalFilters(allPDVs = []) {
  const [zoneFilter, setZoneFilter] = useState('');
  const [supFilter, setSupFilter] = useState('');

  // Liste des zones disponibles (triées)
  const zoneList = useMemo(() => 
    [...new Set(allPDVs.map(p => p.zone).filter(Boolean))].sort(),
    [allPDVs]
  );

  // Liste des superviseurs filtrée par zone sélectionnée
  const supList = useMemo(() => {
    const filtered = zoneFilter
      ? allPDVs.filter(p => p.zone === zoneFilter)
      : allPDVs;
    return [...new Set(filtered.map(p => p.superviseur).filter(Boolean))].sort();
  }, [allPDVs, zoneFilter]);

  // Réinitialiser le superviseur quand la zone change
  const handleZoneChange = (zone) => {
    setZoneFilter(zone);
    setSupFilter(''); // Reset superviseur quand zone change
  };

  // Filtrer les PDVs selon zone + superviseur
  const filterPDVs = (pdvs) => {
    return pdvs.filter(p =>
      (!zoneFilter || p.zone === zoneFilter) &&
      (!supFilter || p.superviseur === supFilter)
    );
  };

  const hasFilters = !!(zoneFilter || supFilter);

  const resetFilters = () => {
    setZoneFilter('');
    setSupFilter('');
  };

  return {
    zoneFilter, setZoneFilter: handleZoneChange,
    supFilter, setSupFilter,
    zoneList, supList,
    filterPDVs, hasFilters, resetFilters,
  };
}

/**
 * Composant réutilisable de filtres hiérarchiques Zone → Superviseur
 */
export function HierarchicalFilters({ zoneFilter, setZoneFilter, supFilter, setSupFilter, zoneList, supList, hasFilters, resetFilters, style = {} }) {
  const selectStyle = {
    padding: '7px 12px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#ccc',
    fontSize: 13,
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', ...style }}>
      {/* Filtre Zone */}
      <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} style={selectStyle}>
        <option value="">Toutes les zones</option>
        {zoneList.map(z => <option key={z} value={z}>{z}</option>)}
      </select>

      {/* Filtre Superviseur (filtré par zone) */}
      <select value={supFilter} onChange={e => setSupFilter(e.target.value)} style={selectStyle}>
        <option value="">Tous les superviseurs</option>
        {supList.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Bouton reset */}
      {hasFilters && (
        <button onClick={resetFilters}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,100,100,0.3)', background: 'rgba(255,100,100,0.1)', color: '#ff6b6b', fontSize: 12, cursor: 'pointer' }}>
          ✕ Effacer
        </button>
      )}
    </div>
  );
}
