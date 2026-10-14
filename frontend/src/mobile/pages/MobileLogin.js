import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

export default function MobileLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore(s => s.login);
  const loadPermissions = useAuthStore(s => s.loadPermissions);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user, access_token } = res.data;
      login(user, access_token);
      try { await loadPermissions(); } catch (e) { /* non bloquant */ }
      navigate('/m/accueil', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Identifiants incorrects. Veuillez réessayer.');
    } finally { setLoading(false); }
  };

  return (
    <div className="m-login">
      <img src="/icons/icon-192.png" className="m-login-logo" alt="Farouk Manager" />
      <h1>Farouk Manager</h1>
      <p className="sub">Connectez-vous pour continuer</p>
      <form onSubmit={submit}>
        {error && <div className="m-erreur">{error}</div>}
        <div className="m-field">
          <label>Adresse e-mail</label>
          <input className="m-input" type="email" inputMode="email" autoComplete="username"
            value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@faroukmanager.com" required />
        </div>
        <div className="m-field">
          <label>Mot de passe</label>
          <input className="m-input" type="password" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <button className="m-btn" type="submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 18 }}>
        Farouk Distribution · version mobile
      </p>
    </div>
  );
}
