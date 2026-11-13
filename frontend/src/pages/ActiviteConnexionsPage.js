import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Phone, MessageCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

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

const formatDerniereConnexion = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const besoinRelance = (u) => Boolean(u?.jamais_connecte)
  || (u?.jours_sans_connexion !== null
    && u?.jours_sans_connexion !== undefined
    && u.jours_sans_connexion >= 7);

const FILTRES = [
  { key: 'tous',   label: 'Tous' },
  { key: '7',      label: '≥ 7 jours' },
  { key: '30',     label: '≥ 30 jours' },
  { key: 'jamais', label: 'Jamais connecté' },
];

const filtreCorrespond = (u, filtre) => {
  if (filtre === 'tous') return true;
  if (filtre === 'jamais') return Boolean(u.jamais_connecte);
  if (u.jamais_connecte) return false;
  const jours = u.jours_sans_connexion;
  if (jours === null || jours === undefined) return false;
  if (filtre === '7') return jours >= 7;
  if (filtre === '30') return jours >= 30;
  return true;
};

const cellButton = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, borderRadius: 9, fontSize: 15,
  textDecoration: 'none', border: '1px solid transparent',
};

export default function ActiviteConnexionsPage() {
  const user = useAuthStore((state) => state.user);
  const role = (user?.role || '').toLowerCase().replace('userrole.', '');
  const estAdmin = ['admin', 'manager'].includes(role);
  const [filtre, setFiltre] = useState('tous');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    'users-activity',
    () => api.get('/auth/users-activity').then((res) => res.data),
    { staleTime: 60000, retry: false, enabled: estAdmin }
  );

  const utilisateurs = Array.isArray(data) ? data : [];
  const total = utilisateurs.length;
  const jamais = utilisateurs.filter((u) => u.jamais_connecte).length;
  const inactifs7 = utilisateurs.filter((u) => filtreCorrespond(u, '7')).length;
  const connectesSemaine = utilisateurs.filter(
    (u) => !u.jamais_connecte
      && u.jours_sans_connexion !== null
      && u.jours_sans_connexion !== undefined
      && u.jours_sans_connexion < 7
  ).length;

  const liste = utilisateurs.filter((u) => filtreCorrespond(u, filtre));

  const kpis = [
    { label: 'Total utilisateurs', value: total, color: '#4a9eff', icon: '👥' },
    { label: 'Connectés cette semaine', value: connectesSemaine, color: '#00d68f', icon: '✅' },
    { label: 'Inactifs ≥ 7 jours', value: inactifs7, color: '#FF6900', icon: '⚠️' },
    { label: 'Jamais connectés', value: jamais, color: '#ff3d71', icon: '🚫' },
  ];

  const compteFiltre = (key) => {
    if (key === 'tous') return total;
    return utilisateurs.filter((u) => filtreCorrespond(u, key)).length;
  };

  const erreur = error?.response?.data?.detail || error?.message;
  const estRefus = error?.response?.status === 403;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activité de connexion</h1>
          <p className="page-subtitle">
            Qui s'est connecté, depuis quand — et pour les comptes sans connexion depuis 7 jours ou plus,
            relancez-les par téléphone ou WhatsApp.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => refetch()}
          disabled={!estAdmin || isLoading || isFetching}
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {!estAdmin ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔐</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            Accès réservé aux administrateurs
          </div>
          <div style={{ fontSize: 13, color: '#8a8a9a' }}>
            Seuls les administrateurs et managers peuvent consulter l'activité de connexion
            et relancer les utilisateurs.
          </div>
        </div>
      ) : isError ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            {estRefus ? 'Accès refusé' : 'Impossible de charger l\'activité de connexion'}
          </div>
          <div style={{ fontSize: 12.5, color: '#8a8a9a', marginBottom: 16 }}>
            {estRefus
              ? "Votre compte n'a pas les droits nécessaires (administrateur)."
              : (erreur || 'Une erreur est survenue, veuillez réessayer.')}
          </div>
          {!estRefus && (
            <button className="btn btn-primary btn-sm" onClick={() => refetch()}>
              <RefreshCw size={14} /> Réessayer
            </button>
          )}
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            {kpis.map((k) => (
              <div key={k.label} className="card" style={{ borderLeft: `3px solid ${k.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: k.color, lineHeight: 1.1 }}>
                    {isLoading ? '…' : k.value}
                  </div>
                  <span style={{ fontSize: 19 }}>{k.icon}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8a8a9a', marginTop: 5 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Filtres */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {FILTRES.map((f) => {
              const actif = filtre === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFiltre(f.key)}
                  style={{
                    padding: '7px 15px', borderRadius: 20, cursor: 'pointer',
                    fontSize: 12.5, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                    border: `1px solid ${actif ? '#FF6900' : 'rgba(255,255,255,0.1)'}`,
                    background: actif ? '#FF6900' : 'rgba(255,255,255,0.04)',
                    color: actif ? '#fff' : '#8a8a9a',
                    transition: 'all 0.18s',
                  }}
                >
                  {f.label}
                  <span style={{ marginLeft: 7, opacity: 0.75, fontWeight: 600 }}>
                    {isLoading ? '' : compteFiltre(f.key)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tableau */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Téléphone</th>
                    <th>Dernière connexion</th>
                    <th>Jours sans connexion</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                      <tr key={`skeleton-${i}`} style={{ cursor: 'default' }}>
                        {Array(6).fill(0).map((_, j) => (
                          <td key={j}>
                            <div className="skeleton" style={{ height: 15, width: j === 0 ? 150 : 80 }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : liste.length === 0 ? (
                    <tr style={{ cursor: 'default' }}>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '44px 20px', color: '#8a8a9a' }}>
                        <div style={{ fontSize: 26, marginBottom: 8 }}>🔎</div>
                        Aucun utilisateur dans ce filtre
                      </td>
                    </tr>
                  ) : (
                    liste.map((u) => {
                      const rs = roleStyle(u.role);
                      const tel = normaliserTelephone(u.telephone);
                      const aTelephone = Boolean(tel);
                      const alerte = besoinRelance(u);
                      const jours = u.jours_sans_connexion;
                      const dateLabel = formatDerniereConnexion(u.last_login);
                      const message = encodeURIComponent(construireMessageWhatsApp(u));
                      const nomComplet = [u.prenom, u.nom].filter(Boolean).join(' ') || u.email || '—';
                      const joursLabel = u.jamais_connecte
                        ? 'Jamais'
                        : (jours === null || jours === undefined ? '—' : `${jours} j`);
                      const joursColor = u.jamais_connecte || (jours !== null && jours !== undefined && jours >= 7)
                        ? '#ff3d71'
                        : '#8a8a9a';
                      const joursBg = u.jamais_connecte || (jours !== null && jours !== undefined && jours >= 7)
                        ? 'rgba(255,61,113,0.12)'
                        : 'rgba(255,255,255,0.06)';

                      return (
                        <tr
                          key={u.id}
                          style={{
                            cursor: 'default',
                            background: alerte ? 'rgba(255,61,113,0.07)' : 'transparent',
                          }}
                        >
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: alerte ? '#ff8b94' : '#f0f0f0' }}>
                              {nomComplet}
                            </div>
                            <div style={{ fontSize: 11, color: '#8a8a9a', marginTop: 2 }}>{u.email || '—'}</div>
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                background: rs.bg, color: rs.color,
                              }}
                            >
                              {rs.label}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12.5, color: u.telephone ? '#f0f0f0' : '#64748b' }}>
                              {u.telephone || '—'}
                            </span>
                            {!u.telephone && (
                              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                                Non renseigné
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: 12.5, color: '#c9d3e0' }}>
                              {dateLabel || (u.jamais_connecte ? 'Jamais connecté' : '—')}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                                background: joursBg, color: joursColor,
                              }}
                            >
                              {joursLabel}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {aTelephone ? (
                                <>
                                  <a
                                    href={`tel:+${tel}`}
                                    title={`Appeler ${u.telephone}`}
                                    style={{
                                      ...cellButton,
                                      background: 'rgba(0,214,143,0.12)',
                                      borderColor: 'rgba(0,214,143,0.3)',
                                      color: '#00d68f',
                                    }}
                                  >
                                    <Phone size={15} />
                                  </a>
                                  <a
                                    href={`https://wa.me/${tel}?text=${message}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`WhatsApp ${u.telephone}`}
                                    style={{
                                      ...cellButton,
                                      background: 'rgba(37,211,102,0.12)',
                                      borderColor: 'rgba(37,211,102,0.3)',
                                      color: '#25d366',
                                    }}
                                  >
                                    <MessageCircle size={15} />
                                  </a>
                                </>
                              ) : (
                                <>
                                  <span
                                    title="Aucun numéro de téléphone renseigné pour cet utilisateur"
                                    aria-disabled="true"
                                    style={{
                                      ...cellButton,
                                      background: 'rgba(255,255,255,0.03)',
                                      borderColor: 'rgba(255,255,255,0.07)',
                                      color: '#475569',
                                      cursor: 'not-allowed',
                                    }}
                                  >
                                    <Phone size={15} />
                                  </span>
                                  <span
                                    title="Aucun numéro de téléphone renseigné pour cet utilisateur"
                                    aria-disabled="true"
                                    style={{
                                      ...cellButton,
                                      background: 'rgba(255,255,255,0.03)',
                                      borderColor: 'rgba(255,255,255,0.07)',
                                      color: '#475569',
                                      cursor: 'not-allowed',
                                    }}
                                  >
                                    <MessageCircle size={15} />
                                  </span>
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

          <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 12, lineHeight: 1.6 }}>
            Les lignes en rouge clair correspondent aux comptes sans connexion depuis 7 jours ou plus
            (ou jamais connectés). Le numéro utilisé est le téléphone personnel renseigné sur la fiche
            utilisateur ; sans numéro, les actions sont désactivées.
          </p>
        </>
      )}
    </div>
  );
}
