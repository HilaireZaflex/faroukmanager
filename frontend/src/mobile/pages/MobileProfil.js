import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { nomComplet, initiale, libelleRole } from '../format';
import {
  activerPush,
  desactiverPush,
  etatPush,
  testPush,
  pushSupporte,
} from '../push';

export default function MobileProfil() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [etat, setEtat] = useState({ supporte: pushSupporte(), permission: 'default', abonne: false, actif: false, appareils: 0 });
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  const rafraichir = async () => {
    const nouveau = await etatPush();
    setEtat(nouveau);
    return nouveau;
  };

  useEffect(() => { rafraichir(); }, []);

  const activer = async () => {
    setEnCours(true);
    setMessage('');
    setErreur('');
    const resultat = await activerPush();
    setEnCours(false);
    if (resultat.ok) {
      setMessage('Notifications activées : vous les recevrez même quand l’application est fermée.');
      toast.success('Notifications activées');
      rafraichir();
    } else {
      setErreur(resultat.message || "Activation impossible.");
    }
  };

  const desactiver = async () => {
    setEnCours(true);
    setMessage('');
    setErreur('');
    await desactiverPush();
    setEnCours(false);
    setMessage('Notifications désactivées sur cet appareil.');
    toast('Notifications désactivées', { icon: '🔕' });
    rafraichir();
  };

  const tester = async () => {
    setEnCours(true);
    setMessage('');
    setErreur('');
    const resultat = await testPush();
    setEnCours(false);
    if (resultat.ok) setMessage('Notification de test envoyée. Elle doit apparaître dans quelques secondes.');
    else setErreur(resultat.message);
  };

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

  const actif = etat.actif;

  return (
    <div>
      <div className="m-card" style={{ textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#FF6900,#ff9500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 auto 10px' }}>
          {initiale(user)}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{nomComplet(user)}</div>
        <div style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{user?.email || ''}</div>
      </div>

      <div className="m-card">
        <Ligne l="Rôle" v={libelleRole(user?.role)} />
        <Ligne l="Téléphone" v={user?.telephone} />
        <Ligne l="Application" v="Mobile PWA · Phase C" />
      </div>

      {/* ── Notifications push ── */}
      <div className="m-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>{actif ? '🔔' : '🔕'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Notifications</div>
            <div style={{ fontSize: 11.5, color: 'var(--fm-muted)' }}>
              {actif
                ? `Activées sur cet appareil${etat.appareils > 1 ? ` · ${etat.appareils} appareils` : ''}`
                : etat.permission === 'denied'
                  ? 'Bloquées dans le navigateur'
                  : 'Alertes prospect, visites, activations'}
            </div>
          </div>
          <span
            style={{
              fontSize: 10.5, fontWeight: 800, padding: '4px 9px', borderRadius: 999,
              color: actif ? '#0d1b12' : 'var(--fm-muted)',
              background: actif ? '#22c55e' : 'rgba(255,255,255,.08)',
            }}
          >
            {actif ? 'ACTIVES' : 'INACTIVES'}
          </span>
        </div>

        <div style={{ fontSize: 12, color: 'var(--fm-muted)', lineHeight: 1.5, margin: '4px 0 10px' }}>
          {actif
            ? "Vous recevez les alertes de prospection (visite attribuée, décision, activation) même lorsque l'application est fermée. Touchez une notification pour ouvrir directement le prospect concerné."
            : "Activez les notifications pour être prévenu immédiatement : visite terrain à effectuer, décision du développeur, activation à réaliser, PDV créé. Elles arrivent même application fermée."}
        </div>

        {message && (
          <div style={{ fontSize: 12, color: '#22c55e', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.35)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
            ✅ {message}
          </div>
        )}
        {erreur && (
          <div style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
            ⚠️ {erreur}
          </div>
        )}

        {!actif ? (
          <button className="m-btn" onClick={activer} disabled={enCours}>
            {enCours ? '⏳ Activation…' : '🔔 Activer les notifications'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="m-btn secondary" style={{ flex: 1 }} onClick={tester} disabled={enCours}>
              {enCours ? '⏳' : '📨 Tester'}
            </button>
            <button className="m-btn secondary" style={{ flex: 1 }} onClick={desactiver} disabled={enCours}>
              🔕 Désactiver
            </button>
          </div>
        )}
      </div>

      <button className="m-btn secondary" onClick={retourBureau} style={{ marginBottom: 10 }}>🖥️ Passer à la version bureau</button>
      <button className="m-btn" onClick={() => { queryClient.clear(); logout(); navigate('/m/login'); }}>⏻ Se déconnecter</button>
    </div>
  );
}
