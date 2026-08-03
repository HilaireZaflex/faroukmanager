/**
 * AccueilTCPage — Page d'accueil dédiée aux Téléconseillères
 * Affiche uniquement leurs KPIs, rappels et historique d'appels
 */
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import AppelTCModal from '../components/common/AppelTCModal';

const COLOR = '#00d68f';

function formatCA(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('fr-FR').format(Math.round(value)) + ' F';
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${days}j`;
}

const STATUT_ICONS = {
  JOIGNABLE_PROMESSE: '✅',
  JOIGNABLE_PAS_INTERESSE: '📞',
  JOIGNABLE_DEJA_ACTIF: '🔄',
  NON_JOIGNABLE_HORS_ZONE: '📵',
  NON_JOIGNABLE_PAS_REPONSE: '🔕',
  NUMERO_INCORRECT: '❌',
  PDV_FERME: '🏪',
  RAPPEL_PROGRAMME: '📅',
};
const STATUT_COLORS = {
  JOIGNABLE_PROMESSE: '#22c55e',
  JOIGNABLE_DEJA_ACTIF: '#00d68f',
  JOIGNABLE_PAS_INTERESSE: '#ffa502',
  RAPPEL_PROGRAMME: '#a29bfe',
  NON_JOIGNABLE_HORS_ZONE: '#ff4757',
  NON_JOIGNABLE_PAS_REPONSE: '#ff4757',
  NUMERO_INCORRECT: '#ff4757',
  PDV_FERME: '#8a8a9a',
};

export default function AccueilTCPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const teleNom = (user?.nom || '').trim();
  const prenom = user?.prenom || user?.nom || 'Téléconseillère';
  const [appelPDV, setAppelPDV] = useState(null);

  const now = new Date();
  const heures = now.getHours();
  const salutation = heures < 12 ? 'Bonjour' : heures < 18 ? 'Bon après-midi' : 'Bonsoir';

  // Mes appels du jour
  const { data: mesAppels } = useQuery(
    'tc-appels-recents',
    () => api.get('/appels-tc', { params: { mes_appels_seulement: true, limit: 10 } }).then(r => r.data),
    { staleTime: 30000, refetchInterval: 60000 }
  );

  // PDVs à rappeler (date de rappel aujourd'hui ou passée)
  const { data: rappels } = useQuery(
    'tc-rappels',
    () => api.get('/appels-tc', { params: { mes_appels_seulement: true, limit: 50 } }).then(r => r.data),
    { staleTime: 30000 }
  );

  // Stats inactifs OMY (mes PDVs)
  const { data: inactifsOMY } = useQuery(
    ['tc-inactifs-omy', teleNom],
    () => api.get('/dashboard/monthly-inactive', { params: { annee: now.getFullYear(), mois: now.getMonth() + 1 } }).then(r => r.data),
    { staleTime: 300000, enabled: !!teleNom }
  );

  // Stats inactifs NAFAMA (mes PDVs)
  const { data: inactifsNAFAMA } = useQuery(
    ['tc-inactifs-nafama', teleNom],
    () => api.get('/nafama/monthly/inactive', { params: { annee: now.getFullYear(), mois: now.getMonth() + 1 } }).then(r => r.data),
    { staleTime: 300000, enabled: !!teleNom }
  );

  // Mes PDVs en baisse OMY
  const { data: baisseOMY } = useQuery(
    ['tc-baisse-omy', teleNom],
    () => api.get('/dashboard/monthly-declining', { params: { annee: now.getFullYear(), mois: now.getMonth() + 1, seuil: -10 } }).then(r => r.data),
    { staleTime: 300000, enabled: !!teleNom }
  );

  // Filtrer par TC
  const myInactifsOMY = (inactifsOMY?.pdvs || []).filter(p =>
    (p.teleconseillere || '').toLowerCase().includes(teleNom.toLowerCase())
  );
  const myInactifsNAFAMA = (inactifsNAFAMA?.pdvs || []).filter(p =>
    (p.teleconseillere || '').toLowerCase().includes(teleNom.toLowerCase())
  );
  const myBaisseOMY = (baisseOMY?.pdvs || []).filter(p =>
    (p.teleconseillere || '').toLowerCase().includes(teleNom.toLowerCase())
  );

  const appelsAujourdHui = (mesAppels?.items || []).filter(a => {
    const d = new Date(a.created_at);
    return d.toDateString() === now.toDateString();
  });

  const rappelsAFaire = (rappels?.items || []).filter(a => {
    if (a.statut !== 'RAPPEL_PROGRAMME' || !a.date_rappel) return false;
    return new Date(a.date_rappel) <= now;
  });

  const totalAAppeler = myInactifsOMY.length + myInactifsNAFAMA.length + myBaisseOMY.length;

  const cardStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: '18px 20px',
  };

  return (
    <div style={{ padding: '20px 20px 80px', maxWidth: 900, margin: '0 auto' }}>

      {/* ── Bienvenue ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0,214,143,0.15) 0%, rgba(0,214,143,0.03) 100%)',
        border: '1px solid rgba(0,214,143,0.3)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#00d68f,#00b377)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>👋</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
            {salutation}, {prenom} !
          </div>
          <div style={{ fontSize: 12, color: COLOR }}>
            Téléconseillère · Farouk Distribution
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        {appelsAujourdHui.length > 0 && (
          <div style={{ marginLeft: 'auto', textAlign: 'center', background: 'rgba(0,214,143,0.15)', borderRadius: 12, padding: '10px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: COLOR }}>{appelsAujourdHui.length}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>appel{appelsAujourdHui.length > 1 ? 's' : ''} aujourd'hui</div>
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: '📵', label: 'Inactifs OMY', value: myInactifsOMY.length, color: '#ff4757', onClick: () => navigate('/omy/dashboard') },
          { icon: '🟢', label: 'Inactifs NAFAMA', value: myInactifsNAFAMA.length, color: '#00d68f', onClick: () => navigate('/nafama/dashboard') },
          { icon: '📉', label: 'En Baisse OMY', value: myBaisseOMY.length, color: '#ffa502', onClick: () => navigate('/omy/dashboard') },
          { icon: '📅', label: 'Rappels à faire', value: rappelsAFaire.length, color: '#a29bfe', onClick: null },
        ].map((k, i) => (
          <div key={i} onClick={k.onClick || undefined}
            style={{ ...cardStyle, textAlign: 'center', borderTop: `3px solid ${k.color}`, cursor: k.onClick ? 'pointer' : 'default', transition: 'transform 0.2s' }}
            onMouseOver={e => { if (k.onClick) e.currentTarget.style.transform = 'scale(1.03)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Rappels à faire ── */}
      {rappelsAFaire.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 20, borderLeft: '4px solid #a29bfe' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#a29bfe', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            📅 Rappels à effectuer ({rappelsAFaire.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rappelsAFaire.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(162,155,254,0.08)', borderRadius: 10, border: '1px solid rgba(162,155,254,0.2)' }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.nom_pdv || a.numero_pdv}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{a.indicateur} · Rappel prévu le {new Date(a.date_rappel).toLocaleDateString('fr-FR')}</div>
                  {a.commentaire && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{a.commentaire}</div>}
                </div>
                <button onClick={() => setAppelPDV({ numero_pdv: a.numero_pdv, nom: a.nom_pdv, indicateur: a.indicateur })}
                  style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 8, color: COLOR, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  📞 Appeler
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* ── PDVs inactifs prioritaires ── */}
        <div style={{ ...cardStyle, borderLeft: '4px solid #ff4757' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#ff4757', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>😴 PDVs Inactifs OMY ({myInactifsOMY.length})</span>
            {myInactifsOMY.length > 0 && <button onClick={() => navigate('/omy/dashboard')} style={{ fontSize: 11, background: 'none', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 6, color: '#ff4757', cursor: 'pointer', padding: '3px 8px' }}>Voir tout →</button>}
          </h3>
          {myInactifsOMY.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#22c55e', fontSize: 13 }}>✅ Aucun PDV inactif !</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myInactifsOMY.slice(0, 5).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,71,87,0.05)', borderRadius: 8, border: '1px solid rgba(255,71,87,0.15)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{p.numero_pdv}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{p.nb_mois_consecutifs_inactif} mois inactif · {p.zone}</div>
                  </div>
                  <button onClick={() => setAppelPDV({ ...p, indicateur: 'OMY' })}
                    style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 6, color: COLOR, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}>📞</button>
                </div>
              ))}
              {myInactifsOMY.length > 5 && <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', paddingTop: 4 }}>+{myInactifsOMY.length - 5} autres</div>}
            </div>
          )}
        </div>

        {/* ── PDVs en baisse ── */}
        <div style={{ ...cardStyle, borderLeft: '4px solid #ffa502' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#ffa502', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📉 PDVs En Baisse OMY ({myBaisseOMY.length})</span>
            {myBaisseOMY.length > 0 && <button onClick={() => navigate('/omy/dashboard')} style={{ fontSize: 11, background: 'none', border: '1px solid rgba(255,165,2,0.3)', borderRadius: 6, color: '#ffa502', cursor: 'pointer', padding: '3px 8px' }}>Voir tout →</button>}
          </h3>
          {myBaisseOMY.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#22c55e', fontSize: 13 }}>✅ Aucun PDV en baisse !</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myBaisseOMY.slice(0, 5).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,165,2,0.05)', borderRadius: 8, border: '1px solid rgba(255,165,2,0.15)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{p.numero_pdv}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>↓ {Math.abs(p.taux_baisse || 0).toFixed(1)}% · {p.zone}</div>
                  </div>
                  <button onClick={() => setAppelPDV({ ...p, indicateur: 'OMY' })}
                    style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', borderRadius: 6, color: COLOR, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}>📞</button>
                </div>
              ))}
              {myBaisseOMY.length > 5 && <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', paddingTop: 4 }}>+{myBaisseOMY.length - 5} autres</div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Historique de mes appels ── */}
      <div style={{ ...cardStyle }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          📜 Mes derniers appels
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>({mesAppels?.total || 0} au total)</span>
        </h3>
        {!(mesAppels?.items?.length) ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📵</div>
            Vous n'avez pas encore enregistré d'appels.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mesAppels.items.slice(0, 8).map((a, i) => {
              const color = STATUT_COLORS[a.statut] || '#64748b';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `rgba(${color === '#22c55e' ? '34,197,94' : color === '#ffa502' ? '255,165,2' : color === '#ff4757' ? '255,71,87' : '162,155,254'},0.06)`, borderRadius: 10, border: `1px solid ${color}25` }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{STATUT_ICONS[a.statut] || '📞'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{a.nom_pdv || a.numero_pdv}
                      <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: a.indicateur === 'OMY' ? 'rgba(255,105,0,0.2)' : a.indicateur === 'NAFAMA' ? 'rgba(0,214,143,0.2)' : 'rgba(162,155,254,0.2)', color: a.indicateur === 'OMY' ? '#FF6900' : a.indicateur === 'NAFAMA' ? '#00d68f' : '#a29bfe' }}>{a.indicateur}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      <span style={{ color, fontWeight: 600 }}>{a.statut_label}</span>
                      {a.commentaire && ` · ${a.commentaire.slice(0, 50)}${a.commentaire.length > 50 ? '...' : ''}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Accès rapides ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
        {[
          { icon: '🏪', label: 'Mes PDVs', path: '/pdvs', color: '#3742fa' },
          { icon: '📱', label: 'Dashboard OMY', path: '/omy/dashboard', color: '#FF6900' },
          { icon: '🟢', label: 'Dashboard NAFAMA', path: '/nafama/dashboard', color: '#00d68f' },
        ].map((b, i) => (
          <button key={i} onClick={() => navigate(b.path)}
            style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${b.color}30`, borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
            onMouseOver={e => { e.currentTarget.style.background = `${b.color}10`; e.currentTarget.style.borderColor = `${b.color}60`; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = `${b.color}30`; }}>
            <span style={{ fontSize: 22 }}>{b.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: b.color }}>{b.label}</span>
          </button>
        ))}
      </div>

      {/* Modal appel */}
      {appelPDV && (
        <AppelTCModal
          pdv={appelPDV}
          indicateur={appelPDV.indicateur || 'OMY'}
          onClose={() => setAppelPDV(null)}
          onSaved={() => setAppelPDV(null)}
        />
      )}
    </div>
  );
}
