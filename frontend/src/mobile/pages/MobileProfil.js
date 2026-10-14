import React from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

export default function MobileProfil() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();

  const retourBureau = () => {
    try { localStorage.setItem('fm_force_desktop', '1'); } catch (e) {}
    document.body.classList.remove('fm-mobile');
    navigate('/accueil');
  };

  const Ligne = ({ l, v }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--fm-border)', fontSize: 13 }}>
      <span style={{ color: 'var(--fm-muted)' }}>{l}</span>
      <b style={{ color: '#fff', textAlign: 'right' }}>{v || '—'}</b>
    </div>
  );

  return (
    <div>
      <div className="m-card" style={{ textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#FF6900,#ff9500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 auto 10px' }}>
          {(user?.nom || '?').slice(0, 1).toUpperCase()}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{user?.nom || '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{user?.email || ''}</div>
      </div>

      <div className="m-card">
        <Ligne l="Rôle" v={(user?.role || '').replace('UserRole.', '')} />
        <Ligne l="Téléphone" v={user?.telephone} />
        <Ligne l="Application" v="Mobile PWA · Phase A" />
      </div>

      <button className="m-btn secondary" onClick={retourBureau} style={{ marginBottom: 10 }}>🖥️ Passer à la version bureau</button>
      <button className="m-btn" onClick={() => { logout(); navigate('/m/login'); }}>⏻ Se déconnecter</button>
    </div>
  );
}
