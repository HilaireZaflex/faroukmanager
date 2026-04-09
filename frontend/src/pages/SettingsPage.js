import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Users, Database, Shield, Bell, RefreshCw, Plus, Trash2, UserPlus } from 'lucide-react';
import * as XLSX from 'xlsx';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('profile');
  const [profil, setProfil] = useState({ nom: user?.nom || '', prenom: user?.prenom || '', email: user?.email || '', zone: user?.zone || '' });
  const [notifs, setNotifs] = useState({ inactifs: true, baisses: true, hebdo: false, mensuel: true });
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ nom: '', prenom: '', email: '', role: 'superviseur', password: '', zone: '' });

  const { data: users, refetch: refetchUsers } = useQuery(
    'all-users',
    () => api.get('/auth/users').then(r => r.data),
    { staleTime: 60000, enabled: user?.role === 'admin' }
  );

  const { data: stats } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 120000 });

  // Sauvegarde profil réelle
  const saveProfil = useMutation(
    () => api.put('/auth/me', profil),
    {
      onSuccess: (res) => {
        toast.success('Profil mis à jour avec succès !');
        queryClient.invalidateQueries('auth-me');
      },
      onError: () => toast.error('Erreur lors de la mise à jour du profil'),
    }
  );

  // Recalcul scores IA
  const recalcScores = useMutation(
    () => api.post('/analytics/update-scores'),
    {
      onSuccess: (res) => {
        toast.success(`Scores IA recalculés pour ${res.data?.updated || '?'} PDVs !`);
        queryClient.invalidateQueries('analytics-health');
        queryClient.invalidateQueries('analytics-segments');
      },
      onError: () => toast.error('Erreur lors du recalcul des scores'),
    }
  );

  // Ajouter utilisateur
  const addUser = useMutation(
    () => api.post('/auth/register', newUser),
    {
      onSuccess: () => {
        toast.success(`Utilisateur "${newUser.nom} ${newUser.prenom}" créé !`);
        setShowAddUser(false);
        setNewUser({ nom:'', prenom:'', email:'', role:'superviseur', password:'', zone:'' });
        refetchUsers();
      },
      onError: (err) => toast.error(err?.response?.data?.detail || 'Erreur lors de la création'),
    }
  );

  // Supprimer utilisateur
  const deleteUser = useMutation(
    (id) => api.delete(`/auth/users/${id}`),
    {
      onSuccess: () => { toast.success('Utilisateur supprimé'); refetchUsers(); },
      onError: () => toast.error('Erreur lors de la suppression'),
    }
  );

  // Export base de données
  const handleExportDB = async () => {
    try {
      const pdvs = await api.get('/pdvs', { params: { limit: 2000 } }).then(r => r.data);
      const rows = pdvs.map(p => ({
        'Numéro PDV': p.numero_pdv, 'Nom': p.nom, 'Type': p.type_pdv,
        'Zone': p.zone, 'Sous-zone': p.sous_zone||'', 'Superviseur': p.superviseur||'',
        'Statut': p.statut, 'Health Score': p.health_score?.toFixed(0)||0,
        'Segment': p.segment||'', 'Médaille': p.medaille||'',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PDVs');
      XLSX.writeFile(wb, `farouk_manager_export_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast.success('Base de données exportée !');
    } catch { toast.error("Erreur lors de l'export"); }
  };

  const sections = [
    { id: 'profile', label: 'Mon Profil', icon: Users },
    { id: 'users', label: 'Utilisateurs', icon: Shield, adminOnly: true },
    { id: 'database', label: 'Base de Données', icon: Database },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ].filter(s => !s.adminOnly || user?.role === 'admin');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-subtitle">Configuration du système FaroukManager</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:20 }}>
        {/* Sidebar nav */}
        <div className="card" style={{ padding:8, alignSelf:'start' }}>
          {sections.map(s => (
            <button key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 14px',
                background: activeSection===s.id ? 'var(--primary-glow)' : 'transparent',
                border: activeSection===s.id ? '1px solid rgba(255,105,0,0.2)' : '1px solid transparent',
                borderRadius:10, color: activeSection===s.id ? 'var(--primary)' : 'var(--text-secondary)',
                cursor:'pointer', fontSize:13, fontWeight:500, fontFamily:'Inter,sans-serif',
                transition:'var(--transition)', textAlign:'left',
              }}
            >
              <s.icon size={16}/> {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {activeSection === 'profile' && (
            <div className="card">
              <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>Mon Profil</h3>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24, padding:16, background:'rgba(255,255,255,0.02)', borderRadius:12 }}>
                <div style={{ width:60,height:60,borderRadius:14,background:'linear-gradient(135deg,var(--primary),var(--primary-dark))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:800,color:'white' }}>
                  {(user?.nom||'?')[0]}{(user?.prenom||'')[0]||''}
                </div>
                <div>
                  <div style={{ fontSize:16,fontWeight:700 }}>{user?.nom} {user?.prenom}</div>
                  <div style={{ fontSize:13,color:'var(--text-secondary)' }}>{user?.email}</div>
                  <span className="badge badge-orange" style={{ marginTop:6 }}>{user?.role}</span>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {[['nom','Nom'],['prenom','Prénom'],['email','Email'],['zone','Zone']].map(([k,l]) => (
                  <div key={k}>
                    <label style={{ fontSize:11,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',display:'block',marginBottom:6 }}>{l}</label>
                    <input value={profil[k]} onChange={e => setProfil(p => ({...p,[k]:e.target.value}))} placeholder={l} />
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ marginTop:20 }} onClick={() => saveProfil.mutate()} disabled={saveProfil.isLoading}>
                {saveProfil.isLoading ? 'Sauvegarde...' : '✅ Sauvegarder le Profil'}
              </button>
            </div>
          )}

          {activeSection === 'users' && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h3 style={{ fontSize:15, fontWeight:700 }}>Utilisateurs ({users?.length || 0})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(v => !v)}><UserPlus size={13}/> {showAddUser ? 'Annuler' : 'Ajouter'}</button>
              </div>
              {showAddUser && (
                <div style={{ padding:'16px 20px', background:'rgba(255,105,0,0.04)', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:10 }}>
                    {[['nom','Nom *'],['prenom','Prénom'],['email','Email *'],['password','Mot de passe *'],['zone','Zone']].map(([k,l]) => (
                      <div key={k}>
                        <label style={{ fontSize:10,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:4 }}>{l}</label>
                        <input type={k==='password'?'password':'text'} value={newUser[k]} onChange={e => setNewUser(u => ({...u,[k]:e.target.value}))} placeholder={l} style={{ width:'100%' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize:10,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:4 }}>Rôle *</label>
                      <select value={newUser.role} onChange={e => setNewUser(u => ({...u,role:e.target.value}))}>
                        <option value="superviseur">Superviseur</option>
                        <option value="teleconseillere">Téléconseillère</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => addUser.mutate()} disabled={addUser.isLoading}>
                    {addUser.isLoading ? 'Création...' : '✅ Créer l\'utilisateur'}
                  </button>
                </div>
              )}
              <table>
                <thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Zone</th><th>Statut</th><th>Action</th></tr></thead>
                <tbody>
                  {(users||[]).map((u,i) => (
                    <tr key={i}>
                      <td><div style={{ fontWeight:600,fontSize:13 }}>{u.nom} {u.prenom||''}</div></td>
                      <td><span style={{ fontSize:12,color:'var(--text-secondary)' }}>{u.email}</span></td>
                      <td><span className={`badge ${u.role==='admin'?'badge-danger':u.role==='manager'?'badge-warning':'badge-info'}`}>{u.role}</span></td>
                      <td><span style={{ fontSize:12,color:'var(--text-secondary)' }}>{u.zone||'—'}</span></td>
                      <td><span className={`badge ${u.is_active?'badge-success':'badge-neutral'}`}>{u.is_active?'Actif':'Inactif'}</span></td>
                      <td>
                        {u.id !== user?.id && (
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} onClick={() => { if(window.confirm(`Supprimer ${u.nom} ?`)) deleteUser.mutate(u.id); }}>
                            <Trash2 size={13}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeSection === 'database' && (
            <div className="card">
              <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>État de la Base de Données</h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
                {[
                  { label:'PDVs', value: stats?.total_pdvs||0, color:'var(--primary)' },
                  { label:'Actifs', value: stats?.actifs||0, color:'var(--success)' },
                  { label:'Inactifs', value: stats?.inactifs||0, color:'var(--danger)' },
                ].map((s,i) => (
                  <div key={i} style={{ textAlign:'center', padding:16, background:'rgba(255,255,255,0.03)', borderRadius:12, border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:28,fontWeight:800,color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:12,color:'var(--text-secondary)',marginTop:4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn btn-ghost btn-sm" onClick={handleExportDB}><Database size={14}/> Exporter DB (Excel)</button>
                <button className="btn btn-ghost btn-sm" onClick={() => recalcScores.mutate()} disabled={recalcScores.isLoading}>
                  <RefreshCw size={14}/> {recalcScores.isLoading ? 'Calcul en cours...' : 'Recalculer Scores IA'}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="card">
              <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>Notifications & Alertes</h3>
              {[
                { key:'inactifs', label:'Alertes PDVs inactifs', desc:'Notification si un PDV est inactif >1 semaine' },
                { key:'baisses', label:'Baisses significatives', desc:'Alerte si CA baisse de plus de 15%' },
                { key:'hebdo', label:'Rapport hebdomadaire', desc:'Résumé automatique chaque lundi matin' },
                { key:'mensuel', label:'Rapport mensuel', desc:'Rapport complet le 1er de chaque mois' },
              ].map((n,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <div style={{ fontSize:13,fontWeight:600 }}>{n.label}</div>
                    <div style={{ fontSize:12,color:'var(--text-secondary)',marginTop:2 }}>{n.desc}</div>
                  </div>
                  <div
                    style={{ width:44,height:24,borderRadius:12,background:notifs[n.key]?'var(--primary)':'rgba(255,255,255,0.1)',cursor:'pointer',position:'relative',transition:'var(--transition)' }}
                    onClick={() => { setNotifs(v => ({...v,[n.key]:!v[n.key]})); toast.success(`"${n.label}" ${notifs[n.key]?'désactivé':'activé'}`); }}>
                    <div style={{ position:'absolute',top:3,left:notifs[n.key]?22:3,width:18,height:18,borderRadius:'50%',background:'white',transition:'left 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
