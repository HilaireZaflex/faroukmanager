/**
 * AppelTCModal — Modal de suivi d'appel téléphonique pour les Téléconseillères
 * S'affiche depuis le bas quand une TC clique sur un PDV dans les onglets Inactifs/En Baisse
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../../services/api';

const STATUTS = [
  { value: 'JOIGNABLE_PROMESSE',        icon: '✅', label: 'Joignable — Promesse de reprise',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  { value: 'JOIGNABLE_PAS_INTERESSE',   icon: '📞', label: 'Joignable — Pas intéressé',        color: '#ffa502', bg: 'rgba(255,165,2,0.12)' },
  { value: 'JOIGNABLE_DEJA_ACTIF',      icon: '🔄', label: 'Joignable — Déjà actif',           color: '#00d68f', bg: 'rgba(0,214,143,0.12)' },
  { value: 'NON_JOIGNABLE_HORS_ZONE',   icon: '📵', label: 'Non joignable — Hors zone/réseau', color: '#ff4757', bg: 'rgba(255,71,87,0.12)' },
  { value: 'NON_JOIGNABLE_PAS_REPONSE', icon: '🔕', label: 'Pas de réponse',                   color: '#ff4757', bg: 'rgba(255,71,87,0.12)' },
  { value: 'NUMERO_INCORRECT',          icon: '❌', label: 'Numéro incorrect',                  color: '#ff4757', bg: 'rgba(255,71,87,0.12)' },
  { value: 'PDV_FERME',                 icon: '🏪', label: 'PDV fermé définitivement',          color: '#8a8a9a', bg: 'rgba(138,138,154,0.12)' },
  { value: 'RAPPEL_PROGRAMME',          icon: '📅', label: 'Rappel programmé',                  color: '#a29bfe', bg: 'rgba(162,155,254,0.12)' },
];

export default function AppelTCModal({ pdv, indicateur, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [statut, setStatut] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [dateRappel, setDateRappel] = useState('');
  const [activeSection, setActiveSection] = useState('form'); // 'form' | 'historique'

  // Charger l'historique des appels pour ce PDV (mes appels seulement)
  const { data: historique, isLoading: loadHist } = useQuery(
    ['appels-tc-pdv', pdv?.numero_pdv, indicateur],
    () => api.get(`/appels-tc/pdv/${pdv?.numero_pdv}`, {
      params: { indicateur, mes_appels_seulement: true }
    }).then(r => r.data),
    { enabled: !!pdv?.numero_pdv, staleTime: 30000 }
  );

  // Mutation pour enregistrer l'appel
  const mutation = useMutation(
    (data) => api.post('/appels-tc', data).then(r => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['appels-tc-pdv', pdv?.numero_pdv]);
        onSaved?.();
        onClose();
      },
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!statut) return alert('Veuillez sélectionner un statut d\'appel');
    mutation.mutate({
      numero_pdv: pdv.numero_pdv,
      nom_pdv: pdv.nom || pdv.numero_pdv,
      indicateur,
      statut,
      commentaire: commentaire.trim() || null,
      date_rappel: statut === 'RAPPEL_PROGRAMME' ? dateRappel || null : null,
    });
  };

  const selectedStatut = STATUTS.find(s => s.value === statut);

  return (
    <>
      {/* Overlay semi-transparent */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
      }} />

      {/* Panel glissant depuis le bas */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1e 100%)',
        border: '1px solid rgba(255,105,0,0.25)',
        borderRadius: '20px 20px 0 0',
        zIndex: 1001,
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Handle */}
        <div style={{ textAlign: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                📞 Suivi d'Appel — {pdv?.nom || pdv?.numero_pdv}
              </div>
              <div style={{ fontSize: 11, color: '#8a8a9a' }}>
                {pdv?.numero_pdv} · {pdv?.zone || '—'} · {pdv?.superviseur || '—'}
                <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 6, fontSize: 10,
                  background: indicateur === 'OMY' ? 'rgba(255,105,0,0.2)' : indicateur === 'NAFAMA' ? 'rgba(0,214,143,0.2)' : 'rgba(162,155,254,0.2)',
                  color: indicateur === 'OMY' ? '#FF6900' : indicateur === 'NAFAMA' ? '#00d68f' : '#a29bfe',
                  fontWeight: 700 }}>{indicateur}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#8a8a9a', cursor: 'pointer', fontSize: 18, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>

          {/* Onglets Form / Historique */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 4 }}>
            {[['form','📋 Nouvel Appel'], ['historique',`📜 Historique (${historique?.length || 0})`]].map(([key, label]) => (
              <button key={key} onClick={() => setActiveSection(key)}
                style={{ flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: activeSection === key ? '#FF6900' : 'transparent',
                  color: activeSection === key ? '#fff' : '#8a8a9a', transition: 'all 0.2s' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── FORMULAIRE NOUVEL APPEL ── */}
        {activeSection === 'form' && (
          <form onSubmit={handleSubmit} style={{ padding: '16px 20px 24px' }}>

            {/* Statuts */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
                Résultat de l'appel *
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {STATUTS.map(s => (
                  <button key={s.value} type="button" onClick={() => setStatut(s.value)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${statut === s.value ? s.color : 'rgba(255,255,255,0.07)'}`,
                      background: statut === s.value ? s.bg : 'rgba(255,255,255,0.02)',
                      transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: statut === s.value ? 700 : 500, color: statut === s.value ? s.color : '#ccc', lineHeight: 1.3 }}>{s.label}</span>
                    {statut === s.value && <span style={{ marginLeft: 'auto', color: s.color, fontSize: 14, flexShrink: 0 }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Date de rappel (si RAPPEL_PROGRAMME) */}
            {statut === 'RAPPEL_PROGRAMME' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>
                  📅 Date de rappel *
                </label>
                <input type="date" value={dateRappel} onChange={e => setDateRappel(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)} required
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(162,155,254,0.4)', borderRadius: 10, color: '#fff', fontSize: 14, colorScheme: 'dark', boxSizing: 'border-box' }} />
              </div>
            )}

            {/* Commentaire */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: '#8a8a9a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>
                📝 Commentaire (optionnel)
              </label>
              <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
                placeholder="Ex: Le client dit qu'il reprendra dans 2 semaines, à rappeler après le 20..."
                rows={3} style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>

            {/* Bouton */}
            <button type="submit" disabled={!statut || mutation.isLoading}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: statut ? 'pointer' : 'not-allowed',
                background: statut ? `linear-gradient(135deg, ${selectedStatut?.color || '#FF6900'}, ${selectedStatut?.color || '#ff9500'})` : 'rgba(255,255,255,0.1)',
                color: statut ? '#fff' : '#555', fontWeight: 800, fontSize: 15,
                transition: 'all 0.2s', opacity: mutation.isLoading ? 0.7 : 1,
                boxShadow: statut ? `0 4px 20px ${selectedStatut?.color || '#FF6900'}40` : 'none',
              }}>
              {mutation.isLoading ? '⏳ Enregistrement...' : `💾 Enregistrer l'appel`}
            </button>
          </form>
        )}

        {/* ── HISTORIQUE DES APPELS ── */}
        {activeSection === 'historique' && (
          <div style={{ padding: '16px 20px 24px' }}>
            {loadHist ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#8a8a9a' }}>Chargement...</div>
            ) : !historique?.length ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8a8a9a' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📵</div>
                <p style={{ fontWeight: 600 }}>Aucun appel enregistré pour ce PDV</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historique.map((a, i) => {
                  const stat = STATUTS.find(s => s.value === a.statut);
                  return (
                    <div key={i} style={{ padding: '12px 14px', background: stat ? stat.bg : 'rgba(255,255,255,0.02)', border: `1px solid ${stat ? stat.color + '40' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{stat?.icon || '📞'}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: stat?.color || '#fff' }}>{a.statut_label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8a8a9a' }}>
                          {new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {a.commentaire && (
                        <p style={{ fontSize: 12, color: '#ccc', margin: '4px 0 0 26px', lineHeight: 1.5 }}>{a.commentaire}</p>
                      )}
                      {a.date_rappel && (
                        <p style={{ fontSize: 11, color: '#a29bfe', margin: '4px 0 0 26px' }}>📅 Rappel prévu : {new Date(a.date_rappel).toLocaleDateString('fr-FR')}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
