/**
 * Utilitaires de formatage des montants — FaroukManager
 * Utilise des espaces normaux comme séparateurs de milliers pour une meilleure lisibilité
 */

/**
 * Formate un nombre avec des espaces comme séparateurs de milliers
 * Ex: 35629876252 → "35 629 876 252"
 */
export function formatNumber(value) {
  if (!value && value !== 0) return '--';
  const n = Math.round(Number(value));
  if (isNaN(n)) return '--';
  // Utiliser en-US puis remplacer les virgules par des espaces
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

/**
 * Formate un montant en FCFA avec espaces
 * Ex: 35629876252 → "35 629 876 252 FCFA"
 */
export function formatMontant(value) {
  if (!value && value !== 0) return '--';
  return formatNumber(value) + ' FCFA';
}

/**
 * Formate un montant en FCFA (alias court)
 */
export function fmt(value) {
  return formatMontant(value);
}

/**
 * Formate un pourcentage
 * Ex: 96.5 → "96,5%"
 */
export function formatPct(value, decimals = 1) {
  if (!value && value !== 0) return '--';
  return Number(value).toFixed(decimals).replace('.', ',') + '%';
}

/**
 * Formate un nombre court (K, M, Md) pour les graphiques
 * Ex: 35629876252 → "35,6 Md"
 */
export function formatShort(value) {
  if (!value && value !== 0) return '--';
  const n = Number(value);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' Md';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' K';
  return formatNumber(n);
}
