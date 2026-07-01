import React, { useState } from 'react';
import { Bell, X, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react';
import useNotifStore from '../../store/notifStore';

const TYPE_ICONS = {
  VISITE_ASSIGNEE:        '🔍',
  DECISION_DEV_RECUE:     '📋',
  APPROBATION_RC_PENDING: '📦',
  ACTIVATION_ASSIGNEE:    '⚡',
  ACTIVATION_CONFIRMEE:   '✅',
};

const TYPE_COLORS = {
  VISITE_ASSIGNEE:        '#f59e0b',
  DECISION_DEV_RECUE:     '#6366f1',
  APPROBATION_RC_PENDING: '#22c55e',
  ACTIVATION_ASSIGNEE:    '#f97316',
  ACTIVATION_CONFIRMEE:   '#10b981',
};

export default function NotificationCenter() {
  const { notifications, markRead, markAllRead } = useNotifStore();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const unread = notifications.filter(n => !n.lu);
  const count = unread.length;

  return (
    <>
      {/* Popup automatique pour la première notif non lue */}
      {unread.length > 0 && !open && (
        <NotifPopup
          notif={unread[0]}
          onClose={() => markRead(unread[0].id)}
          onView={() => { setOpen(true); markRead(unread[0].id); }}
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
            width: 380, maxHeight: '70vh', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
            }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                🔔 Notifications {count > 0 && <span style={{
                  background: '#ef4444', color: '#fff', borderRadius: 10,
                  padding: '1px 7px', fontSize: 11, marginLeft: 6,
                }}>{count}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {count > 0 && (
                  <button onClick={markAllRead} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--primary)', fontSize: 11, fontWeight: 600,
                  }}>
                    <CheckCheck size={14}/> Tout lire
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}>
                  <X size={16}/>
                </button>
              </div>
            </div>

            {/* Liste */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune notification
                </div>
              ) : notifications.map(n => (
                <div key={n.id}
                  onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    background: n.lu ? 'transparent' : 'rgba(255,105,0,0.04)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    borderLeft: `3px solid ${TYPE_COLORS[n.type] || 'var(--primary)'}`,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICONS[n.type] || '🔔'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: n.lu ? 600 : 800, fontSize: 13,
                        color: n.lu ? 'var(--text-secondary)' : 'var(--text-primary)',
                      }}>
                        {n.titre}
                      </div>
                      {n.prospect_reference && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {n.prospect_reference} · {n.prospect_nom}
                        </div>
                      )}
                      {/* Message expandable */}
                      {expanded === n.id && (
                        <div style={{
                          marginTop: 8, fontSize: 12, color: 'var(--text-secondary)',
                          whiteSpace: 'pre-line', lineHeight: 1.5,
                          background: 'var(--bg-secondary)', borderRadius: 6,
                          padding: '8px 10px',
                        }}>
                          {n.message}
                          {n.action_requise && (
                            <div style={{
                              marginTop: 8, fontWeight: 700, color: TYPE_COLORS[n.type] || 'var(--primary)',
                              fontSize: 12,
                            }}>
                              ✅ Action : {n.action_requise}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{
                        fontSize: 10, color: 'var(--text-muted)', marginTop: 4,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : ''}
                        {!n.lu && <span style={{
                          background: '#ef4444', borderRadius: '50%',
                          width: 6, height: 6, display: 'inline-block',
                        }}/>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                      {expanded === n.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      {!n.lu && (
                        <button
                          onClick={e => { e.stopPropagation(); markRead(n.id); }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 2,
                          }}
                          title="Marquer comme lu"
                        >
                          <CheckCheck size={12}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bouton cloche */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: count > 0 ? '#ef4444' : 'var(--primary)',
            border: 'none', cursor: 'pointer', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: count > 0
              ? '0 0 0 4px rgba(239,68,68,0.25), 0 4px 16px rgba(0,0,0,0.4)'
              : '0 4px 16px rgba(0,0,0,0.3)',
            transition: 'all 0.3s',
            animation: count > 0 ? 'notif-pulse 1.5s infinite' : 'none',
          }}
        >
          <Bell size={22} color="#fff"/>
          {count > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -2,
              background: '#fff', color: '#ef4444',
              borderRadius: '50%', width: 20, height: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900, border: '2px solid #ef4444',
            }}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </div>

      <style>{`
        @keyframes notif-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(239,68,68,0.25), 0 4px 16px rgba(0,0,0,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0.15), 0 4px 16px rgba(0,0,0,0.4); }
        }
      `}</style>
    </>
  );
}

// ─── Popup automatique pour notif urgente ────────────────────────────────────
function NotifPopup({ notif, onClose, onView }) {
  const color = TYPE_COLORS[notif.type] || 'var(--primary)';
  const icon = TYPE_ICONS[notif.type] || '🔔';

  return (
    <div style={{
      position: 'fixed', bottom: 90, right: 24, zIndex: 3000,
      width: 360, background: 'var(--bg-card)',
      border: `2px solid ${color}`,
      borderRadius: 14, padding: 0, overflow: 'hidden',
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${color}33`,
      animation: 'notif-slide-in 0.3s ease-out',
    }}>
      {/* Barre colorée */}
      <div style={{ height: 4, background: color, width: '100%' }}/>

      <div style={{ padding: '14px 16px' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>{notif.titre}</div>
              {notif.prospect_reference && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {notif.prospect_reference} · {notif.prospect_nom}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}>
            <X size={16}/>
          </button>
        </div>

        {/* Message résumé */}
        <div style={{
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
          background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px',
          marginBottom: 10, whiteSpace: 'pre-line', maxHeight: 80, overflow: 'hidden',
        }}>
          {notif.message.split('\n').slice(0, 3).join('\n')}…
        </div>

        {/* Action requise */}
        {notif.action_requise && notif.action_requise !== 'Aucune — pour information' && (
          <div style={{
            fontSize: 12, fontWeight: 700, color, marginBottom: 10,
            padding: '6px 10px', background: `${color}15`, borderRadius: 6,
            borderLeft: `3px solid ${color}`,
          }}>
            ✅ Action requise : {notif.action_requise}
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onView} style={{
            flex: 1, padding: '8px 0', background: color, color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>
            Voir les détails
          </button>
          <button onClick={onClose} style={{
            padding: '8px 14px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer',
          }}>
            Ignorer
          </button>
        </div>
      </div>

      <style>{`
        @keyframes notif-slide-in {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
