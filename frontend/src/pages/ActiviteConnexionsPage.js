import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Search } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import './ActiviteConnexionsPage.css';

// ─── Rôles ────────────────────────────────────────────────────────────────────
const ROLE_STYLES = {
  admin:           { label: 'Administrateur',     bg: 'rgba(255,61,113,0.15)', color: '#ff3d71' },
  manager:         { label: 'Manager',            bg: 'rgba(255,105,0,0.15)',  color: '#FF6900' },
  superviseur:     { label: 'Superviseur',        bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
  gestionnaire:    { label: 'Gestionnaire',       bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  developpeur:     { label: 'Développeur',        bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  teleconseillere: { label: 'Téléconseillère',    bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  rc:              { label: 'Resp. Commercial',   bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  conformite:      { label: 'Resp. Conformité',   bg: 'rgba(14,165,233,0.15)', color: '#0ea5e9' },
  commercial:      { label: 'Commercial',         bg: 'rgba(255,105,0,0.15)',  color: '#FF6900' },
};

const roleStyle = (role) => {
  const key = String(role || '').toLowerCase().replace('userrole.', '');
  return ROLE_STYLES[key] || { label: key || '—', bg: 'rgba(255,255,255,0.07)', color: '#8a8a9a' };
};

// ─── Téléphone : normalisation pour tel: et wa.me ─────────────────────────────
// 1. On retire tous les caractères non numériques.
// 2. « 00223… » devient « 223… ».
// 3. Un numéro local de 8 chiffres est préfixé par « 223 » (Mali).
export const normaliserTelephone = (telephone) => {
  if (!telephone) return '';
  let chiffres = String(telephone).replace(/\D/g, '');
  if (!chiffres) return '';
  if (chiffres.startsWith('00223')) chiffres = chiffres.slice(2);
  if (chiffres.length === 8) chiffres = `223${chiffres}`;
  return chiffres;
};

// Message WhatsApp pré-rempli. Pour un compte jamais connecté, on ne peut pas
// calculer de nombre de jours : on parle alors de l'inscription.
export const construireMessageWhatsApp = (utilisateur) => {
  const prenom = (utilisateur?.prenom || '').trim();
  const jours = utilisateur?.jamais_connecte ? null : utilisateur?.jours_sans_connexion;
  let depuis;
  if (jours === null || jours === undefined) depuis = 'votre inscription';
  else if (jours === 0) depuis = "aujourd'hui";
  else depuis = `${jours} jour${jours > 1 ? 's' : ''}`;
  return `Bonjour${prenom ? ` ${prenom}` : ''}, nous n'avons pas vu de connexion à Farouk Manager depuis ${depuis}. Pouvez-vous vous reconnecter ? Merci.`;
};

// ─── Helpers d'affichage ──────────────────────────────────────────────────────
const normaliserTexte = (valeur) => String(valeur || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const formatDerniereConnexion = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// Date de référence de l'activité : `last_seen` (activité réelle, écrite à
// chaque requête authentifiée) sinon `last_login` (connexion par identifiants).
// Le backend renvoie déjà `derniere_activite` = last_seen or last_login.
const derniereActiviteDe = (u) => u?.derniere_activite || u?.last_seen || u?.last_login || null;

// Deux dates ISO représentent-elles le même instant ? (comparaison robuste
// aux différences de format / fuseau entre `last_login` et `last_seen`)
const memeInstant = (a, b) => {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta === tb;
};

// « Aujourd'hui », « Hier », « il y a 3 j »… à partir des jours entiers calculés
// côté backend (UTC) depuis la dernière activité.
const formatRelative = (u) => {
  if (u?.jamais_connecte || !derniereActiviteDe(u)) return 'Jamais connecté';
  const jours = u.jours_sans_connexion;
  if (jours === null || jours === undefined) return '—';
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return 'Hier';
  return `il y a ${jours} j`;
};

// Badge « jours sans connexion » : vert ≤ 7, orange 8–30, rouge > 30, gris jamais.
const badgeJours = (u) => {
  if (u?.jamais_connecte) {
    return { label: 'Jamais connecté', color: '#8a8a9a', bg: 'rgba(255,255,255,0.06)' };
  }
  const jours = u?.jours_sans_connexion;
  if (jours === null || jours === undefined) {
    return { label: '—', color: '#8a8a9a', bg: 'rgba(255,255,255,0.06)' };
  }
  if (jours <= 7) return { label: `${jours} j`, color: '#00d68f', bg: 'rgba(0,214,143,0.12)' };
  if (jours <= 30) return { label: `${jours} j`, color: '#ffa502', bg: 'rgba(255,165,2,0.13)' };
  return { label: `${jours} j`, color: '#ff4757', bg: 'rgba(255,71,87,0.13)' };
};

const initiales = (u) => {
  const prenom = (u?.prenom || '').trim();
  const nom = (u?.nom || '').trim();
  const premier = (prenom || nom || u?.email || '?').trim()[0] || '?';
  const second = (prenom ? nom : '').trim()[0] || '';
  return `${premier}${second}`.toUpperCase();
};

const nomCompletDe = (u) => [u?.prenom, u?.nom].filter(Boolean).join(' ')
  || u?.email
  || '—';

// ─── Filtres ──────────────────────────────────────────────────────────────────
const FILTRES = [
  { key: 'tous',    label: 'Tous' },
  { key: 'recents', label: 'Récents (≤ 7 j)' },
  { key: '7',       label: '≥ 7 j' },
  { key: '30',      label: '≥ 30 j' },
  { key: 'jamais',  label: 'Jamais' },
];

const filtreCorrespond = (u, filtre) => {
  if (filtre === 'tous') return true;
  if (filtre === 'jamais') return Boolean(u.jamais_connecte);
  // Les comptes jamais connectés n'apparaissent que dans le filtre « Jamais ».
  if (u.jamais_connecte) return false;
  const jours = u.jours_sans_connexion;
  if (jours === null || jours === undefined) return false;
  // « jours » est un nombre de jours entiers : < 7 ⇒ connecté il y a moins de 7 j.
  if (filtre === 'recents') return jours < 7;
  if (filtre === '7') return jours >= 7;
  if (filtre === '30') return jours >= 30;
  return true;
};

const correspondRecherche = (u, recherche) => {
  const q = normaliserTexte(recherche);
  if (!q) return true;
  const rs = roleStyle(u.role);
  const champs = [u.prenom, u.nom, u.email, u.telephone, u.role, rs.label]
    .filter(Boolean)
    .map(normaliserTexte)
    .join(' ');
  if (champs.includes(q)) return true;
  // Recherche par numéro : on compare les chiffres saisis à ceux du téléphone.
  const qChiffres = q.replace(/\D/g, '');
  if (qChiffres.length >= 2) {
    return String(u.telephone || '').replace(/\D/g, '').includes(qChiffres);
  }
  return false;
};

export default function ActiviteConnexionsPage() {
  const user = useAuthStore((state) => state.user);
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const estAdmin = ['admin', 'manager'].includes(role);
  const [filtre, setFiltre] = useState('tous');
  const [recherche, setRecherche] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    'users-activity',
    () => api.get('/auth/users-activity').then((res) => res.data),
    { staleTime: 60000, retry: false, enabled: estAdmin }
  );

  // L'API renvoie déjà les utilisateurs triés : connexion la plus récente
  // d'abord, jamais connectés en dernier.
  const utilisateurs = Array.isArray(data) ? data : [];
  const total = utilisateurs.length;
  const jamais = utilisateurs.filter((u) => u.jamais_connecte).length;
  const actifs = utilisateurs.filter((u) => filtreCorrespond(u, 'recents')).length;
  const inactifs7 = utilisateurs.filter((u) => filtreCorrespond(u, '7')).length;

  const compteFiltre = (key) => {
    if (key === 'tous') return total;
    return utilisateurs.filter((u) => filtreCorrespond(u, key)).length;
  };

  const liste = utilisateurs
    .filter((u) => filtreCorrespond(u, filtre))
    .filter((u) => correspondRecherche(u, recherche));

  const kpis = [
    { key: 'tous',    label: 'Total',             value: total,     color: '#4a9eff', icon: '👥', title: 'Tous les utilisateurs' },
    { key: 'recents', label: 'Actifs (≤ 7 j)',    value: actifs,    color: '#00d68f', icon: '✅', title: 'Connectés il y a 7 jours ou moins' },
    { key: '7',       label: 'Inactifs ≥ 7 j',    value: inactifs7, color: '#FF6900', icon: '⚠️', title: 'Sans connexion depuis 7 jours ou plus' },
    { key: 'jamais',  label: 'Jamais connectés',  value: jamais,    color: '#ff4757', icon: '🚫', title: 'Comptes jamais connectés' },
  ];

  const erreur = error?.response?.data?.detail || error?.message;
  const estRefus = error?.response?.status === 403;
  const rechercheActive = Boolean(recherche.trim());

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activité de connexion</h1>
          <p className="page-subtitle">
            Qui s'est connecté, depuis quand — et pour les comptes inactifs depuis 7 jours
            ou plus, relancez-les par téléphone ou WhatsApp.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => refetch()}
          disabled={!estAdmin || isLoading || isFetching}
          style={{ opacity: (!estAdmin || isLoading || isFetching) ? 0.6 : 1 }}
          title="Recharger l'activité de connexion"
        >
          <span
            className={`ac-refresh-icon${isFetching ? ' spinning' : ''}`}
            aria-hidden="true"
          >
            🔄
          </span>
          Actualiser
        </button>
      </div>

      {!estAdmin ? (
        <div className="card">
          <div className="ac-state">
            <div className="ac-state-icon">🔐</div>
            <div className="ac-state-title">Accès réservé aux administrateurs</div>
            <div className="ac-state-text">
              Seuls les administrateurs et managers peuvent consulter l'activité de connexion
              et relancer les utilisateurs.
            </div>
          </div>
        </div>
      ) : isError ? (
        <div className="card">
          <div className="ac-state">
            <div className="ac-state-icon">⚠️</div>
            <div className="ac-state-title">
              {estRefus ? 'Accès refusé' : "Impossible de charger l'activité de connexion"}
            </div>
            <div className="ac-state-text" style={{ marginBottom: estRefus ? 0 : 16 }}>
              {estRefus
                ? "Votre compte n'a pas les droits nécessaires (administrateur)."
                : (erreur || 'Une erreur est survenue, veuillez réessayer.')}
            </div>
            {!estRefus && (
              <button className="btn btn-primary btn-sm" onClick={() => refetch()}>
                <span aria-hidden="true">🔄</span> Réessayer
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI cards (cliquables) ─────────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 14,
              marginBottom: 18,
            }}
          >
            {kpis.map((k) => {
              const actif = filtre === k.key;
              return (
                <button
                  type="button"
                  key={k.key}
                  onClick={() => setFiltre(k.key)}
                  title={k.title}
                  aria-pressed={actif}
                  className={`ac-kpi${actif ? ' ac-kpi-active' : ''}`}
                  style={{ borderLeftColor: k.color }}
                >
                  <span className="ac-kpi-top">
                    <span className="ac-kpi-value" style={{ color: k.color }}>
                      {isLoading ? '…' : k.value}
                    </span>
                    <span className="ac-kpi-icon" aria-hidden="true">{k.icon}</span>
                  </span>
                  <span className="ac-kpi-label">{k.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Filtres + recherche ────────────────────────────────────────── */}
          <div className="ac-filter-bar">
            <div className="ac-chips">
              {FILTRES.map((f) => {
                const actif = filtre === f.key;
                return (
                  <button
                    type="button"
                    key={f.key}
                    onClick={() => setFiltre(f.key)}
                    aria-pressed={actif}
                    className={`ac-chip${actif ? ' active' : ''}`}
                  >
                    {f.label}
                    <span className="ac-chip-count">
                      {isLoading ? '…' : compteFiltre(f.key)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="ac-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un nom, un rôle, un téléphone…"
                aria-label="Rechercher un utilisateur par nom, rôle ou téléphone"
              />
            </div>
          </div>

          {/* ── Tableau ────────────────────────────────────────────────────── */}
          <div className="card ac-card">
            <div className="ac-table-scroll">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Téléphone</th>
                    <th>Dernière activité</th>
                    <th>Jours sans connexion</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div className="skeleton" style={{ height: 12, width: 130, marginBottom: 6 }} />
                              <div className="skeleton" style={{ height: 10, width: 170 }} />
                            </div>
                          </div>
                        </td>
                        <td><div className="skeleton" style={{ height: 20, width: 90, borderRadius: 999 }} /></td>
                        <td><div className="skeleton" style={{ height: 12, width: 90 }} /></td>
                        <td>
                          <div className="skeleton" style={{ height: 12, width: 80, marginBottom: 6 }} />
                          <div className="skeleton" style={{ height: 10, width: 110 }} />
                        </td>
                        <td><div className="skeleton" style={{ height: 20, width: 54, borderRadius: 999 }} /></td>
                        <td><div className="skeleton" style={{ height: 36, width: 80, borderRadius: 999 }} /></td>
                      </tr>
                    ))
                  ) : liste.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="ac-state">
                          <div className="ac-state-icon">🔎</div>
                          <div className="ac-state-title">
                            {rechercheActive ? 'Aucun résultat' : 'Aucun utilisateur dans ce filtre'}
                          </div>
                          <div className="ac-state-text">
                            {rechercheActive
                              ? `Aucun utilisateur ne correspond à « ${recherche.trim()} ».`
                              : 'Modifiez le filtre ou actualisez les données.'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    liste.map((u) => {
                      const rs = roleStyle(u.role);
                      const tel = normaliserTelephone(u.telephone);
                      const aTelephone = Boolean(tel);
                      const message = encodeURIComponent(construireMessageWhatsApp(u));
                      const nomComplet = nomCompletDe(u);
                      const activiteIso = derniereActiviteDe(u);
                      const dateLabel = formatDerniereConnexion(activiteIso);
                      // Connexion par identifiants, seulement si elle diffère
                      // de l'activité réelle (sinon l'info serait redondante).
                      const connexionLabel = memeInstant(u.last_login, activiteIso)
                        ? null
                        : formatDerniereConnexion(u.last_login);
                      const badge = badgeJours(u);
                      const relatif = formatRelative(u);

                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="ac-user">
                              <div className="ac-avatar" aria-hidden="true">{initiales(u)}</div>
                              <div style={{ minWidth: 0 }}>
                                <div className="ac-user-name" title={nomComplet}>{nomComplet}</div>
                                <div className="ac-user-email" title={u.email || ''}>
                                  {u.email || '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className="ac-role"
                              style={{ background: rs.bg, color: rs.color }}
                            >
                              {rs.label}
                            </span>
                          </td>
                          <td>
                            {aTelephone ? (
                              <span className="ac-phone">{u.telephone}</span>
                            ) : (
                              <>
                                <span className="ac-phone ac-phone-muted">—</span>
                                <div className="ac-phone-muted">Non renseigné</div>
                              </>
                            )}
                          </td>
                          <td>
                            <span className={`ac-relative${u.jamais_connecte ? ' ac-muted' : ''}`}>
                              {relatif}
                            </span>
                            {dateLabel ? (
                              <span className="ac-exact">{dateLabel}</span>
                            ) : u.jamais_connecte ? (
                              <span className="ac-exact">Aucune activité enregistrée</span>
                            ) : null}
                            {connexionLabel ? (
                              <span className="ac-login-line">Connexion : {connexionLabel}</span>
                            ) : null}
                          </td>
                          <td>
                            <span
                              className="ac-badge"
                              style={{ background: badge.bg, color: badge.color }}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td>
                            <div className="ac-actions">
                              {aTelephone ? (
                                <>
                                  <a
                                    href={`tel:+${tel}`}
                                    className="ac-action ac-action-call"
                                    title={`Appeler ${u.telephone}`}
                                    aria-label={`Appeler ${nomComplet}`}
                                  >
                                    📞
                                  </a>
                                  <a
                                    href={`https://wa.me/${tel}?text=${message}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ac-action ac-action-wa"
                                    title={`WhatsApp ${u.telephone}`}
                                    aria-label={`Contacter ${nomComplet} sur WhatsApp`}
                                  >
                                    💬
                                  </a>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled
                                    className="ac-action ac-action-disabled"
                                    title="Aucun numéro de téléphone renseigné pour cet utilisateur"
                                    aria-label="Appel indisponible : aucun numéro renseigné"
                                  >
                                    📞
                                  </button>
                                  <button
                                    type="button"
                                    disabled
                                    className="ac-action ac-action-disabled"
                                    title="Aucun numéro de téléphone renseigné pour cet utilisateur"
                                    aria-label="WhatsApp indisponible : aucun numéro renseigné"
                                  >
                                    💬
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="ac-note">
            Tri : dernière activité la plus récente en premier ; les comptes jamais vus
            apparaissent en dernier. Le badge est vert jusqu'à 7 jours, orange de 8 à 30 jours,
            rouge au-delà. Le numéro utilisé est le téléphone personnel de la fiche utilisateur ;
            sans numéro, les actions sont désactivées.
          </p>
        </>
      )}
    </div>
  );
}
