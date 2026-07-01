import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useNotifStore from '../../store/notifStore';

// Retourne l'URL de redirection selon l'étape de la notification
const getRedirectUrl = (notif) => {
  const etape = notif?.etape;
  if (!etape) return '/prospection';
  if (etape === 3) return '/prospection?tab=workflow&step=etape3'; // Dev → décision visite
  if (etape === 4) return '/prospection?tab=workflow&step=etape4'; // RC → validation
  if (etape === 5) return '/prospection?tab=workflow&step=etape5'; // RC → attribution activation
  if (etape === 6) return '/prospection?tab=activation';           // Dev → activation
  return '/prospection';
};

// Couleur par défaut basée sur le titre (qui contient l'emoji)
const getColor = (titre = '') => {
  if (titre.includes('🔍')) return '#f59e0b';
  if (titre.includes('📋')) return '#6366f1';
  if (titre.includes('📦')) return '#22c55e';
  if (titre.includes('⚡')) return '#f97316';
  if (titre.includes('✅')) return '#10b981';
  return '#ff6900';
};

const getIcon = (titre = '') => {
  if (titre.includes('🔍')) return '🔍';
  if (titre.includes('📋')) return '📋';
  if (titre.includes('📦')) return '📦';
  if (titre.includes('⚡')) return '⚡';
  if (titre.includes('✅')) return '✅';
  return '🔔';
};

export default function NotificationCenter() {
  const { notifications, markRead, markAllRead } = useNotifStore();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [showPopup, setShowPopup] = useState(true);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  const unread = notifications.filter(n => !n.lu);
  const count = unread.length;
  const popupNotif = unread[0] || null;

  // Quand une nouvelle notif arrive, réaffiche le popup
  useEffect(() => {
    if (popupNotif) setShowPopup(true);
  }, [popupNotif?.id]);

  // Quand on ignore, attendre 30s puis réafficher
  const handleDismiss = () => {
    setShowPopup(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowPopup(true), 30000);
  };

  const handleView = (notif) => {
    // Ne marque PAS comme lu — redirige directement vers l'onglet concerné
    setShowPopup(false);
    setOpen(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowPopup(true), 30000);
    navigate(getRedirectUrl(notif));
  };

  const handleNotifClick = (notif) => {
    // Clic sur une notif dans la liste → redirige vers l'onglet concerné
    setOpen(false);
    setShowPopup(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowPopup(true), 30000);
    navigate(getRedirectUrl(notif));
  };

  // Nettoyage timer
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <>
      {/* Popup automatique : réapparaît toutes les 30s si non lu */}
      {popupNotif && showPopup && !open && (
        <NotifPopup
          notif={popupNotif}
          onClose={handleDismiss}
          onView={() => handleView(popupNotif)}
        />
      )}


      {/* Cloche flottante */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
      }}>
        {/* Panel liste */}
        {open && (
          <div style={{
            width: 390, maxHeight: '72vh', background: '#1a2035',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: '#0f172a',
            }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>
                🔔 Notifications
                {count > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff', borderRadius: 10,
                    padding: '1px 8px', fontSize: 11, marginLeft: 8, fontWeight: 700,
                  }}>{count} non lue{count > 1 ? 's' : ''}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {count > 0 && (
                  <button onClick={markAllRead} style={{
                    background: 'rgba(255,105,0,0.15)', border: '1px solid rgba(255,105,0,0.3)',
                    cursor: 'pointer', color: '#ff6900', fontSize: 11, fontWeight: 700,
                    borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <CheckCheck size={12}/> Tout lire
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', borderRadius: 6, padding: '4px 6px',
                }}>
                  <X size={16}/>
                </button>
              </div>
            </div>

            {/* Liste */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔕</div>
                  Aucune notification
                </div>
              ) : notifications.map(n => {
                const color = getColor(n.titre);
                const icon = getIcon(n.titre);
                return (
                  <div key={n.id}
                    onClick={() => handleNotifClick(n)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: n.lu ? 'transparent' : 'rgba(255,105,0,0.05)',
                      cursor: 'pointer',
                      borderLeft: `3px solid ${n.lu ? 'rgba(255,255,255,0.1)' : color}`,
                      transition: 'background 0.15s',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: n.lu ? 500 : 800, fontSize: 13,
                          color: n.lu ? '#64748b' : '#f1f5f9',
                          lineHeight: 1.3,
                        }}>
                          {n.titre}
                        </div>
                        {n.prospect_reference && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            {n.prospect_reference} · {n.prospect_nom}
                          </div>
                        )}
                        {expanded === n.id && (
                          <div style={{
                            marginTop: 8, fontSize: 12, color: '#cbd5e1',
                            whiteSpace: 'pre-line', lineHeight: 1.6,
                            background: 'rgba(0,0,0,0.3)', borderRadius: 6,
                            padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)',
                          }}>
                            {n.message}
                            {n.action_requise && n.action_requise !== 'Aucune — pour information' && (
                              <div style={{
                                marginTop: 10, fontWeight: 700, color,
                                fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.1)',
                                paddingTop: 8,
                              }}>
                                ✅ Action : {n.action_requise}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{
                          fontSize: 10, color: '#475569', marginTop: 4,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          {n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : ''}
                          {!n.lu && (
                            <span style={{
                              background: '#ef4444', borderRadius: '50%',
                              width: 6, height: 6, display: 'inline-block',
                            }}/>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {expanded === n.id ? <ChevronUp size={14} color="#64748b"/> : <ChevronDown size={14} color="#64748b"/>}
                        {!n.lu && (
                          <button
                            onClick={e => { e.stopPropagation(); markRead(n.id); }}
                            style={{
                              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                              cursor: 'pointer', color: '#94a3b8', padding: '2px 4px', borderRadius: 4,
                            }}
                            title="Marquer comme lu"
                          >
                            <CheckCheck size={11}/>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bouton cloche */}
        <button
          onClick={() => { setOpen(o => !o); setShowPopup(false); if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setShowPopup(true), 30000); }}
          style={{
            width: 54, height: 54, borderRadius: '50%',
            background: count > 0 ? '#ef4444' : '#ff6900',
            border: 'none', cursor: 'pointer', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: count > 0
              ? '0 0 0 4px rgba(239,68,68,0.25), 0 6px 20px rgba(0,0,0,0.5)'
              : '0 6px 20px rgba(0,0,0,0.4)',
            transition: 'all 0.3s',
            animation: count > 0 ? 'notif-pulse 1.5s infinite' : 'none',
          }}
        >
          <Bell size={24} color="#fff"/>
          {count > 0 && (
            <span style={{
              position: 'absolute', top: -3, right: -3,
              background: '#fff', color: '#ef4444',
              borderRadius: '50%', width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900, border: '2px solid #ef4444',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </div>

      <style>{`
        @keyframes notif-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(239,68,68,0.25), 0 6px 20px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 0 10px rgba(239,68,68,0.1), 0 6px 20px rgba(0,0,0,0.5); }
        }
      `}</style>
    </>
  );
}

// ─── Popup automatique ────────────────────────────────────────────────────────
function NotifPopup({ notif, onClose, onView }) {
  const color = getColor(notif.titre);
  const icon = getIcon(notif.titre);

  return (
    <div style={{
      position: 'fixed', bottom: 90, right: 24, zIndex: 3000,
      width: 375, background: '#0f172a',
      border: `2px solid ${color}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: `0 16px 48px rgba(0,0,0,0.9), 0 0 0 1px ${color}44`,
      animation: 'notif-slide-in 0.35s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* Barre colorée */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${color}, ${color}88)`, width: '100%' }}/>

      <div style={{ padding: '16px 18px' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26, flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#f1f5f9', lineHeight: 1.3 }}>
                {notif.titre}
              </div>
              {notif.prospect_reference && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                  📋 {notif.prospect_reference} · {notif.prospect_nom}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', color: '#94a3b8', borderRadius: 8, padding: '4px 6px', flexShrink: 0,
            }}>
            <X size={15}/>
          </button>
        </div>

        {/* Message résumé */}
        <div style={{
          fontSize: 13, color: '#cbd5e1', lineHeight: 1.65,
          background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 12, whiteSpace: 'pre-line',
          border: '1px solid rgba(255,255,255,0.07)',
          maxHeight: 95, overflow: 'hidden',
        }}>
          {notif.message.split('\n').filter(l => l.trim()).slice(0, 3).join('\n')}
        </div>

        {/* Action requise */}
        {notif.action_requise && notif.action_requise !== 'Aucune — pour information' && (
          <div style={{
            fontSize: 13, fontWeight: 700, marginBottom: 14,
            padding: '9px 14px', background: `${color}1a`, borderRadius: 8,
            borderLeft: `3px solid ${color}`, lineHeight: 1.4,
            color: '#f1f5f9',
          }}>
            ✅ Action : <span style={{ color }}>{notif.action_requise}</span>
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onView} style={{
            flex: 1, padding: '10px 0', background: color, color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer',
            boxShadow: `0 4px 12px ${color}55`, letterSpacing: 0.3,
          }}>
            Voir les détails
          </button>
          <button onClick={onClose} style={{
            padding: '10px 18px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            fontSize: 13, cursor: 'pointer', fontWeight: 600,
          }}>
            Plus tard
          </button>
        </div>
      </div>

      <style>{`
        @keyframes notif-slide-in {
          from { transform: translateX(110%) scale(0.95); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
