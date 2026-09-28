import { useQuery } from 'react-query';
import api from '../../services/api';

/**
 * Référentiel géographique (Paramètres → Zones & Localités).
 * Alimente les listes déroulantes des formulaires PDV : zone, sous-zone, quartier.
 */
export function useLocalites() {
  const { data = [] } = useQuery('localites',
    () => api.get('/localites').then(r => r.data).catch(() => []),
    { staleTime: 60000 }
  );
  const byType = (t) => (data || []).filter(l => l.type === t).map(l => l.nom);
  return {
    zones: byType('ZONE'),
    sousZones: byType('SOUS_ZONE'),
    quartiers: byType('QUARTIER'),
  };
}

/** Ajoute la valeur courante en tête si elle n'est pas (encore) dans le référentiel. */
export function avecValeur(options, value) {
  const liste = options || [];
  if (value && !liste.includes(value)) return [value, ...liste];
  return liste;
}
