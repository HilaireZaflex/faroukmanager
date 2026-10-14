import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function MobileSoon({ titre, icone = '🚧', phase = '' }) {
  const navigate = useNavigate();
  const retourBureau = () => {
    try { localStorage.setItem('fm_force_desktop', '1'); } catch (e) {}
    document.body.classList.remove('fm-mobile');
    navigate('/accueil');
  };
  return (
    <div>
      <div className="m-card" style={{ textAlign: 'center', padding: '38px 20px' }}>
        <div style={{ fontSize: 46 }}>{icone}</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginTop: 10 }}>{titre}</div>
        <div style={{ fontSize: 13, color: 'var(--fm-muted)', marginTop: 8, lineHeight: 1.6 }}>
          Cet écran arrive dans la prochaine étape{phase ? ` (Phase ${phase})` : ''} de l'application mobile.
        </div>
      </div>
      <button className="m-btn secondary" onClick={retourBureau}>🖥️ Ouvrir la version bureau</button>
    </div>
  );
}
