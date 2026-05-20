import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore(s => s.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user, access_token } = res.data;
      login(user, access_token);
      toast.success(`Bienvenue, ${user.nom} !`, { duration: 3000 });
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Identifiants incorrects. Veuillez réessayer.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-bg">
        <div className="bg-orb orb1" />
        <div className="bg-orb orb2" />
        <div className="bg-orb orb3" />
      </div>

      <div className="login-container">
        {/* Logo */}
        <div className="login-logo">
          <div className="logo-circle">🟠</div>
          <h1>Farouk Distribution</h1>
          <p>Système de Gestion du Réseau PDV</p>
          <span className="orange-mali-badge">Orange Mali</span>
        </div>

        {/* Card */}
        <div className="login-card">
          <h2>Connexion</h2>
          <p className="login-card-sub">Entrez vos identifiants pour continuer</p>

          {error && (
            <div className="login-error">
              <span>⚠️ {error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="field-group">
              <label>Adresse Email</label>
              <div className="field-wrap">
                <Mail size={16} className="field-icon" />
                <input
                  type="email"
                  placeholder="admin@faroukmanager.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div className="field-group">
              <label>Mot de passe</label>
              <div className="field-wrap">
                <Lock size={16} className="field-icon" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <><Loader size={16} className="spinner" /> Connexion en cours...</>
              ) : (
                'Se connecter →'
              )}
            </button>
          </form>

          <div className="login-hint">
            <p>💡 <strong>Admin:</strong> admin@faroukmanager.com / Admin2026!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
