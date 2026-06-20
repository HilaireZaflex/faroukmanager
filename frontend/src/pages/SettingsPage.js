import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Users, Database, Shield, Bell, RefreshCw, UserPlus, Trash2, Edit3, Check, X, Eye, EyeOff, Key, Lock, Save, User, Phone } from 'lucide-react';
import * as XLSX from 'xlsx';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import toast from 'react-hot-toast';

const DEFAULT_ROLES = [
  { id: 'admin',           label: '🔴 Administrateur',       color: '#ff3d71', bg: 'rgba(255,61,113,0.15)',  locked: true },
  { id: 'manager',         label: '🟠 Manager',              color: '#FF6900', bg: 'rgba(255,105,0,0.15)',   locked: true },
  { id: 'superviseur',     label: '🟡 Superviseur',          color: '#eab308', bg: 'rgba(234,179,8,0.15)',   locked: false },
  { id: 'rc',              label: '🟢 Resp. Commercial',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   locked: false },
  { id: 'developpeur',     label: '🔵 Développeur',          color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  locked: false },
  { id: 'teleconseillere', label: '🟣 Téléconseillère',      color: '#a855f7', bg: 'rgba(168,85,247,0.15)', locked: false },
];

const ROLES = DEFAULT_ROLES.map(r => r.id);
const ROLE_COLORS = Object.fromEntries(DEFAULT_ROLES.map(r => [r.id, { bg: r.bg, color: r.color }]));

// ── Ces IDs correspondent aux clés du Sidebar (menu_*) ───────────────────────
const FEATURES = [
  { section: '📊 Dashboards', items: [
    { id: 'menu_omy',       label: 'Dashboard OMY (Mensuel & Hebdomadaire)',   sidebarKey: 'omy' },
    { id: 'menu_nafama',    label: 'Dashboard NAFAMA (Mensuel & Hebdomadaire)', sidebarKey: 'nafama' },
    { id: 'menu_kaabu',     label: 'Dashboard KAABU (Mensuel & Hebdomadaire)', sidebarKey: 'kaabu' },
  ]},
  { section: '🏪 Gestion', items: [
    { id: 'menu_pdvs',        label: 'Points de Vente',      sidebarKey: 'pdvs' },
    { id: 'menu_prospection', label: 'Prospection OM',       sidebarKey: 'prospection' },
    { id: 'menu_indicateurs', label: 'Indicateurs',          sidebarKey: 'indicateurs' },
    { id: 'menu_commissions', label: 'Commissions',          sidebarKey: 'commissions' },
    { id: 'menu_evaluations', label: 'Évaluations',          sidebarKey: 'evaluations' },
    { id: 'menu_alerts',      label: 'Alertes',              sidebarKey: 'alerts' },
    { id: 'menu_reseau',      label: 'Gestion du Réseau',    sidebarKey: 'reseau' },
  ]},
  { section: '🗺️ Gestion du Réseau — Sous-menus', items: [
    { id: 'reseau_developpeurs',  label: '└ 👨‍💼 Gestion des Développeurs' },
    { id: 'reseau_gestionnaires', label: '└ 👔 Gestion des Gestionnaires' },
    { id: 'reseau_potentialites', label: '└ 🗺️ Potentialités Réseau' },
    { id: 'reseau_grades',        label: '└ 🏅 Grades & Qualification' },
    { id: 'reseau_envois',        label: '└ 💰 Envois & Récupérations' },
    { id: 'reseau_planning',      label: '└ 📅 Planning des Visites' },
    { id: 'reseau_superviseurs',  label: '└ 👥 Gestion des Superviseurs' },
  ]},
  { section: '🤖 Intelligence IA', items: [
    { id: 'menu_ia',      label: 'Intelligence IA (Tableau de Bord + Simulateur)', sidebarKey: 'ia' },
    { id: 'menu_carte',   label: 'Carte Interactive',                              sidebarKey: 'carte' },
    { id: 'menu_recovery',label: 'Récupérations (Aperçu + Liste)',                 sidebarKey: 'recovery' },
  ]},
  { section: '🔧 Outils', items: [
    { id: 'menu_import',   label: 'Import Données Excel',  sidebarKey: 'import' },
    { id: 'menu_reports',  label: 'Rapports',              sidebarKey: 'reports' },
    { id: 'menu_settings', label: 'Paramètres',            sidebarKey: 'settings' },
  ]},
];

const ALL_IDS = FEATURES.flatMap(f => f.items).map(i => i.id);

// Permissions par défaut alignées sur le Sidebar
const DEFAULT_PERMISSIONS = {
  admin: Object.fromEntries(ALL_IDS.map(id => [id, true])),

  manager: Object.fromEntries(ALL_IDS.map(id => [id,
    !['menu_import'].includes(id)])),

  superviseur: Object.fromEntries(ALL_IDS.map(id => [id,
    ['menu_omy','menu_pdvs','menu_prospection','menu_indicateurs',
     'menu_alerts','menu_reseau','menu_carte','menu_recovery',
     'reseau_developpeurs','reseau_gestionnaires','reseau_potentialites',
     'reseau_grades','reseau_planning','reseau_superviseurs'].includes(id)])),

  rc: Object.fromEntries(ALL_IDS.map(id => [id,
    ['menu_omy','menu_pdvs','menu_commissions',
     'menu_alerts','menu_recovery'].includes(id)])),

  developpeur: Object.fromEntries(ALL_IDS.map(id => [id,
    ['menu_prospection','menu_alerts','menu_reseau',
     'reseau_developpeurs'].includes(id)])),

  teleconseillere: Object.fromEntries(ALL_IDS.map(id => [id,
    ['menu_prospection','menu_indicateurs','menu_alerts'].includes(id)])),
};

// ─── SECTION PROFIL ──────────────────────────────────────────────────────────
function SectionProfil({ user }) {
  const { setUser } = useAuthStore();
  const [profil, setProfil] = useState({ nom: user?.nom||'', prenom: user?.prenom||'', email: user?.email||'', zone: user?.zone||'' });
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState('');
  const queryClient = useQueryClient();

  const saveProfil = useMutation(async () => {
    const payload = {};
    if (profil.nom) payload.nom = profil.nom;
    if (profil.prenom !== undefined) payload.prenom = profil.prenom;
    if (profil.zone !== undefined) payload.zone = profil.zone;
    const res = await api.put('/auth/me', payload);
    return res.data;
  }, {
    onSuccess: (data) => {
      toast.success('Profil mis a jour !');
      setUser({ ...user, ...data });
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Erreur mise a jour profil'),
  });

  const initials = `${(user?.nom||'?')[0]}${(user?.prenom||'')[0]||''}`.toUpperCase();

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:20, padding:24, background:'linear-gradient(135deg, rgba(255,105,0,0.08), rgba(255,105,0,0.02))', borderRadius:16, marginBottom:24, border:'1px solid rgba(255,105,0,0.12)' }}>
        <div style={{ width:72, height:72, borderRadius:18, background:'linear-gradient(135deg,#FF6900,#cc5200)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:800, color:'white', boxShadow:'0 4px 16px rgba(255,105,0,0.4)', flexShrink:0 }}>
          {initials}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>{user?.nom} {user?.prenom}</div>
          <div style={{ fontSize:13, color:'#8a8a9a', marginBottom:8 }}>{user?.email}</div>
          <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: ROLE_COLORS[user?.role]?.bg||'rgba(255,255,255,0.1)', color: ROLE_COLORS[user?.role]?.color||'#fff' }}>
            {user?.role?.toUpperCase()}
          </span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {[['nom','Nom'],['prenom','Prenom'],['email','Email'],['zone','Zone']].map(([k,l]) => (
          <div key={k}>
            <label style={{ fontSize:11, fontWeight:700, color:'#8a8a9a', textTransform:'uppercase', letterSpacing:'1px', display:'block', marginBottom:6 }}>{l}</label>
            <input value={profil[k]} onChange={e => setProfil(p => ({...p,[k]:e.target.value}))} placeholder={l}
              style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', borderRadius:10, padding:'10px 14px', fontSize:13, boxSizing:'border-box', outline:'none' }} />
          </div>
        ))}
      </div>
      <button onClick={() => saveProfil.mutate()} disabled={saveProfil.isLoading}
        style={{ background:'#FF6900', color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', fontWeight:700, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
        <Save size={14}/> {saveProfil.isLoading ? 'Sauvegarde...' : 'Sauvegarder le Profil'}
      </button>
    </div>
  );
}

// ─── SECTION UTILISATEURS ─────────────────────────────────────────────────────
function SectionUtilisateurs({ currentUser }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const [newUser, setNewUser] = useState({ nom:'', prenom:'', email:'', role:'superviseur', password:'', zone:'' });

  const { data: users, refetch } = useQuery('all-users',
    () => api.get('/auth/users').then(r => r.data), { staleTime: 30000 });

  const addUser = useMutation(() => api.post('/auth/register', newUser), {
    onSuccess: () => { toast.success(`Utilisateur cree avec succes !`); setShowAdd(false); setNewUser({nom:'',prenom:'',email:'',role:'superviseur',password:'',zone:''}); refetch(); },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Erreur creation utilisateur'),
  });

  const toggleActive = useMutation((u) => api.put(`/auth/users/${u.id}`, { is_active: !u.is_active }), {
    onSuccess: () => { toast.success('Statut mis a jour'); refetch(); },
    onError: () => toast.error('Erreur'),
  });

  const deleteUser = useMutation((id) => api.delete(`/auth/users/${id}`), {
    onSuccess: () => { toast.success('Utilisateur supprime'); refetch(); },
    onError: () => toast.error('Erreur suppression'),
  });

  const inp = (style) => ({ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', borderRadius:10, padding:'9px 12px', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none', ...style });

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h3 style={{ fontSize:16, fontWeight:800, margin:0 }}>Utilisateurs</h3>
          <p style={{ color:'#8a8a9a', fontSize:12, marginTop:4 }}>{(users||[]).length} compte(s) enregistre(s)</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ background: showAdd ? 'rgba(255,255,255,0.07)' : '#FF6900', color:'#fff', border:'none', borderRadius:10, padding:'9px 18px', fontWeight:700, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
          {showAdd ? <><X size={14}/> Annuler</> : <><UserPlus size={14}/> Nouvel Utilisateur</>}
        </button>
      </div>

      {showAdd && (
        <div style={{ background:'rgba(255,105,0,0.05)', border:'1px solid rgba(255,105,0,0.15)', borderRadius:14, padding:20, marginBottom:20 }}>
          <h4 style={{ fontSize:13, fontWeight:700, marginBottom:16, color:'#FF6900' }}>Creer un nouvel utilisateur</h4>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:12 }}>
            {[['nom','Nom *'],['prenom','Prenom'],['email','Email *'],['zone','Zone']].map(([k,l]) => (
              <div key={k}>
                <label style={{ fontSize:10, fontWeight:700, color:'#8a8a9a', textTransform:'uppercase', letterSpacing:'1px', display:'block', marginBottom:4 }}>{l}</label>
                <input type="text" value={newUser[k]} onChange={e => setNewUser(u => ({...u,[k]:e.target.value}))} placeholder={l} style={inp()} />
              </div>
            ))}
            <div>
              <label style={{ fontSize:10, fontWeight:700, color:'#8a8a9a', textTransform:'uppercase', letterSpacing:'1px', display:'block', marginBottom:4 }}>Mot de passe *</label>
              <div style={{ position:'relative' }}>
                <input type={showPwd?'text':'password'} value={newUser.password} onChange={e => setNewUser(u => ({...u,password:e.target.value}))} placeholder="Mot de passe" style={inp({ paddingRight:40 })} />
                <button onClick={() => setShowPwd(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#8a8a9a', cursor:'pointer' }}>
                  {showPwd ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:10, fontWeight:700, color:'#8a8a9a', textTransform:'uppercase', letterSpacing:'1px', display:'block', marginBottom:4 }}>Role *</label>
              <select value={newUser.role} onChange={e => setNewUser(u => ({...u,role:e.target.value}))} style={{ ...inp(), appearance:'none' }}>
                <option value="admin">🔴 Administrateur</option>
                <option value="manager">🟠 Manager</option>
                <option value="superviseur">🟡 Superviseur</option>
                <option value="rc">🟢 Responsable Commercial</option>
                <option value="developpeur">🔵 Développeur</option>
                <option value="teleconseillere">🟣 Téléconseillère</option>
              </select>
            </div>
          </div>
          <button onClick={() => addUser.mutate()} disabled={addUser.isLoading || !newUser.nom || !newUser.email || !newUser.password}
            style={{ background:'#FF6900', color:'#fff', border:'none', borderRadius:10, padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:8, opacity: (!newUser.nom||!newUser.email||!newUser.password)?0.5:1 }}>
            <Check size={14}/> {addUser.isLoading ? 'Creation...' : 'Creer l\'utilisateur'}
          </button>
        </div>
      )}

      <div style={{ display:'grid', gap:10 }}>
        {(users||[]).map((u, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, transition:'all 0.18s' }}>
            <div style={{ width:42, height:42, borderRadius:11, background:`linear-gradient(135deg, ${ROLE_COLORS[u.role]?.color||'#8a8a9a'}, ${ROLE_COLORS[u.role]?.color||'#8a8a9a'}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>
              {(u.nom||'?')[0]}{(u.prenom||'')[0]||''}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{u.nom} {u.prenom||''}</div>
              <div style={{ fontSize:11, color:'#8a8a9a', marginTop:2 }}>{u.email} {u.zone ? `· ${u.zone}` : ''}</div>
            </div>
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: ROLE_COLORS[u.role]?.bg||'rgba(255,255,255,0.07)', color: ROLE_COLORS[u.role]?.color||'#fff', whiteSpace:'nowrap' }}>
              {u.role}
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:2 }}>
              <div onClick={() => { if(u.id!==currentUser?.id) toggleActive.mutate(u); }}
                style={{ width:40, height:22, borderRadius:11, background:u.is_active?'#00d68f':'rgba(255,255,255,0.1)', cursor:u.id===currentUser?.id?'default':'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                <div style={{ position:'absolute', top:3, left:u.is_active?20:3, width:16, height:16, borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
              </div>
            </div>
            {u.id !== currentUser?.id && (
              <button onClick={() => { if(window.confirm(`Supprimer ${u.nom} ?`)) deleteUser.mutate(u.id); }}
                style={{ background:'rgba(255,61,113,0.1)', border:'1px solid rgba(255,61,113,0.2)', color:'#ff3d71', borderRadius:8, padding:'6px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
                <Trash2 size={13}/>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SECTION ROLES & PERMISSIONS ──────────────────────────────────────────────
const PALETTE = ['#ff3d71','#FF6900','#ffaa00','#00d68f','#4a9eff','#a855f7','#f97316','#14b8a6','#ec4899','#64748b'];

function SectionRoles() {
  const [roles, setRoles] = useState(() => {
    const saved = localStorage.getItem('fd_roles');
    return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_ROLES));
  });
  const [selectedRole, setSelectedRole] = useState('gestionnaire');
  const [permissions, setPermissions] = useState(() => {
    const saved = localStorage.getItem('fd_permissions');
    const base = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    // S'assurer que admin a tout
    base.admin = Object.fromEntries(ALL_IDS.map(id => [id, true]));
    return base;
  });
  const [showAddRole, setShowAddRole] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#4a9eff');

  const saveAll = async () => {
    // ── Convertir les permissions en format Sidebar ──────────────────────────
    const sidebarPerms = {};
    Object.keys(permissions).forEach(roleId => {
      const rolePerms = permissions[roleId];
      const dashboards = [];
      const menus = [];
      FEATURES.forEach(section => {
        section.items.forEach(item => {
          if (rolePerms[item.id] && item.sidebarKey) {
            if (['omy','nafama','kaabu'].includes(item.sidebarKey)) {
              dashboards.push(item.sidebarKey);
            } else {
              menus.push(item.sidebarKey);
            }
          }
        });
      });
      sidebarPerms[roleId] = { dashboards, menus };
    });

    try {
      // ── Sauvegarder dans la BASE DE DONNÉES (accessible à tous les utilisateurs) ──
      await api.post('/role-permissions', {
        sidebar_config: sidebarPerms,
        permissions: permissions,
      });
      // Aussi en localStorage pour les performances
      localStorage.setItem('fd_permissions', JSON.stringify(permissions));
      localStorage.setItem('fd_roles', JSON.stringify(roles));
      localStorage.setItem('fd_sidebar_permissions', JSON.stringify(sidebarPerms));
      toast.success('✅ Permissions sauvegardées ! Tous les utilisateurs verront les changements au prochain rechargement.');
    } catch (e) {
      // Fallback localStorage si API échoue
      localStorage.setItem('fd_permissions', JSON.stringify(permissions));
      localStorage.setItem('fd_roles', JSON.stringify(roles));
      localStorage.setItem('fd_sidebar_permissions', JSON.stringify(sidebarPerms));
      toast.success('✅ Permissions sauvegardées localement.');
    }
  };

  const toggle = (roleKey, featureId) => {
    if (roleKey === 'admin') return;
    setPermissions(p => ({ ...p, [roleKey]: { ...p[roleKey], [featureId]: !p[roleKey][featureId] } }));
  };

  const toggleAll = (roleKey, sectionItems, val) => {
    if (roleKey === 'admin') return;
    const updates = {};
    sectionItems.forEach(i => { updates[i.id] = val; });
    setPermissions(p => ({ ...p, [roleKey]: { ...p[roleKey], ...updates } }));
  };

  const addRole = () => {
    if (!newRoleLabel.trim()) return;
    const id = newRoleLabel.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    if (roles.find(r => r.id === id)) { toast.error('Ce role existe deja'); return; }
    const newR = { id, label: newRoleLabel.trim(), color: newRoleColor, bg: newRoleColor + '26', locked: false };
    setRoles(r => [...r, newR]);
    setPermissions(p => ({ ...p, [id]: Object.fromEntries(ALL_IDS.map(i => [i, false])) }));
    setNewRoleLabel(''); setNewRoleColor('#4a9eff'); setShowAddRole(false);
    setSelectedRole(id);
    toast.success(`Role "${newRoleLabel}" cree !`);
  };

  const deleteRole = (roleId) => {
    if (roles.find(r => r.id === roleId)?.locked) { toast.error('Ce role ne peut pas etre supprime'); return; }
    if (!window.confirm(`Supprimer le role "${roles.find(r=>r.id===roleId)?.label}" ?`)) return;
    setRoles(r => r.filter(x => x.id !== roleId));
    setPermissions(p => { const np = {...p}; delete np[roleId]; return np; });
    setSelectedRole('gestionnaire');
    toast.success('Role supprime');
  };

  const startEdit = (role) => { setEditingRole({ ...role }); };
  const saveEdit = () => {
    setRoles(r => r.map(x => x.id === editingRole.id ? { ...x, label: editingRole.label, color: editingRole.color, bg: editingRole.color + '26' } : x));
    setEditingRole(null); toast.success('Role modifie !');
  };

  const selRole = roles.find(r => r.id === selectedRole);
  const perm = permissions[selectedRole] || {};
  const totalFeats = ALL_IDS.length;
  const nbActifs = ALL_IDS.filter(id => perm[id]).length;

  return (
    <div>
      {/* Liste des roles */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ fontSize:13, fontWeight:700 }}>Roles existants ({roles.length})</span>
          <button onClick={() => setShowAddRole(v => !v)}
            style={{ background: showAddRole ? 'rgba(255,255,255,0.07)' : '#FF6900', color:'#fff', border:'none', borderRadius:9, padding:'7px 16px', fontWeight:700, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            {showAddRole ? <><X size={13}/> Annuler</> : <><UserPlus size={13}/> Nouveau role</>}
          </button>
        </div>

        {showAddRole && (
          <div style={{ background:'rgba(255,105,0,0.05)', border:'1px solid rgba(255,105,0,0.15)', borderRadius:12, padding:16, marginBottom:14 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:160 }}>
                <label style={{ fontSize:10, fontWeight:700, color:'#8a8a9a', textTransform:'uppercase', letterSpacing:'1px', display:'block', marginBottom:5 }}>Nom du role *</label>
                <input value={newRoleLabel} onChange={e => setNewRoleLabel(e.target.value)} placeholder="Ex: Responsable Zone"
                  style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'#fff', borderRadius:9, padding:'8px 12px', fontSize:13, boxSizing:'border-box', outline:'none' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#8a8a9a', textTransform:'uppercase', letterSpacing:'1px', display:'block', marginBottom:5 }}>Couleur</label>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {PALETTE.map(c => (
                    <div key={c} onClick={() => setNewRoleColor(c)}
                      style={{ width:22, height:22, borderRadius:6, background:c, cursor:'pointer', border: newRoleColor===c ? '2px solid white' : '2px solid transparent', boxSizing:'border-box' }}/>
                  ))}
                </div>
              </div>
              <button onClick={addRole} disabled={!newRoleLabel.trim()}
                style={{ background:'#FF6900', color:'#fff', border:'none', borderRadius:9, padding:'8px 18px', fontWeight:700, cursor:'pointer', fontSize:13, opacity: newRoleLabel.trim()?1:0.5 }}>
                <Check size={14}/> Creer
              </button>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {roles.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:0, borderRadius:10, border: selectedRole===r.id ? `2px solid ${r.color}` : '1px solid rgba(255,255,255,0.08)', background: selectedRole===r.id ? r.bg : 'rgba(255,255,255,0.03)', overflow:'hidden' }}>
              {editingRole?.id === r.id ? (
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px' }}>
                  <input value={editingRole.label} onChange={e => setEditingRole(v => ({...v, label:e.target.value}))}
                    style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', borderRadius:6, padding:'3px 8px', fontSize:12, width:120, outline:'none' }}/>
                  <div style={{ display:'flex', gap:3 }}>
                    {PALETTE.map(c => <div key={c} onClick={() => setEditingRole(v => ({...v, color:c}))} style={{ width:14, height:14, borderRadius:4, background:c, cursor:'pointer', border: editingRole.color===c?'2px solid white':'2px solid transparent', boxSizing:'border-box' }}/>)}
                  </div>
                  <button onClick={saveEdit} style={{ background:'#00d68f', border:'none', color:'#fff', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>OK</button>
                  <button onClick={() => setEditingRole(null)} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#8a8a9a', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontSize:11 }}>X</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setSelectedRole(r.id)}
                    style={{ padding:'7px 14px', border:'none', background:'transparent', color: selectedRole===r.id ? r.color : '#8a8a9a', fontWeight: selectedRole===r.id ? 700 : 500, cursor:'pointer', fontSize:12, fontFamily:'Inter,sans-serif', whiteSpace:'nowrap' }}>
                    {r.label}
                    {selectedRole===r.id && <span style={{ marginLeft:6, fontSize:10, opacity:0.6 }}>{nbActifs}/{totalFeats}</span>}
                  </button>
                  {!r.locked && (
                    <div style={{ display:'flex', borderLeft:'1px solid rgba(255,255,255,0.06)' }}>
                      <button onClick={() => startEdit(r)} style={{ background:'transparent', border:'none', color:'#8a8a9a', cursor:'pointer', padding:'6px 7px', display:'flex', alignItems:'center' }} title="Modifier">
                        <Edit3 size={11}/>
                      </button>
                      <button onClick={() => deleteRole(r.id)} style={{ background:'transparent', border:'none', color:'#ff3d71', cursor:'pointer', padding:'6px 7px', display:'flex', alignItems:'center' }} title="Supprimer">
                        <Trash2 size={11}/>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedRole === 'admin' && (
        <div style={{ background:'rgba(255,105,0,0.08)', border:'1px solid rgba(255,105,0,0.2)', borderRadius:12, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#FF6900', fontWeight:600 }}>
          L'administrateur a acces a TOUTES les fonctionnalites. Ces permissions ne peuvent pas etre modifiees.
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:13, color:'#8a8a9a' }}>
          Role <span style={{ color: selRole?.color, fontWeight:700 }}>{selRole?.label}</span> — <span style={{ color: selRole?.color, fontWeight:700 }}>{nbActifs}</span> / {totalFeats} fonctionnalites activees
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { setPermissions(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))); setRoles(JSON.parse(JSON.stringify(DEFAULT_ROLES))); toast('Reinitialise aux valeurs par defaut'); }}
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#8a8a9a', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:600 }}>
            Reinitialiser tout
          </button>
          <button onClick={saveAll}
            style={{ background:'#FF6900', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
            <Save size={12}/> Sauvegarder
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gap:10 }}>
        {FEATURES.map((section, si) => {
          return (
            <div key={si} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:13, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'rgba(255,255,255,0.03)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:13, fontWeight:700 }}>{section.section}</span>
                  <span style={{ fontSize:10, background: selRole?.bg||'rgba(255,255,255,0.06)', color: selRole?.color||'#8a8a9a', padding:'2px 7px', borderRadius:8, fontWeight:700 }}>
                    {section.items.filter(i => perm[i.id]).length}/{section.items.length}
                  </span>
                </div>
                {selectedRole !== 'admin' && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => toggleAll(selectedRole, section.items, true)}
                      style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, border:'1px solid rgba(0,214,143,0.3)', background:'rgba(0,214,143,0.08)', color:'#00d68f', cursor:'pointer' }}>
                      Tout activer
                    </button>
                    <button onClick={() => toggleAll(selectedRole, section.items, false)}
                      style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, border:'1px solid rgba(255,61,113,0.3)', background:'rgba(255,61,113,0.08)', color:'#ff3d71', cursor:'pointer' }}>
                      Tout desactiver
                    </button>
                  </div>
                )}
              </div>
              <div style={{ padding:'6px 16px' }}>
                {section.items.map((item, ii) => (
                  <div key={ii} onClick={() => toggle(selectedRole, item.id)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom: ii < section.items.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: selectedRole!=='admin'?'pointer':'default' }}>
                    <span style={{ fontSize:13, color: perm[item.id] ? '#fff' : '#8a8a9a', flex:1, userSelect:'none' }}>{item.label}</span>
                    <div style={{ width:40, height:22, borderRadius:11, background: perm[item.id] ? (selRole?.color||'#FF6900') : 'rgba(255,255,255,0.08)', position:'relative', transition:'background 0.2s', flexShrink:0, marginLeft:16 }}>
                      <div style={{ position:'absolute', top:3, left: perm[item.id] ? 20 : 3, width:16, height:16, borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SECTION BASE DE DONNEES ──────────────────────────────────────────────────

const ROLE_TABS = [
  { key: 'superviseurs',    role: 'superviseur',     label: 'Superviseurs',     icon: '👤', color: '#4a9eff' },
  { key: 'gestionnaires',   role: 'gestionnaire',    label: 'Gestionnaires',    icon: '💼', color: '#FF6900' },
  { key: 'developpeurs',    role: 'developpeur',     label: 'Développeurs',     icon: '🚨', color: '#00d68f' },
  { key: 'teleconseilleres',role: 'teleconseillere', label: 'Téléconseillères', icon: '📞', color: '#a29bfe' },
];

const EMPTY_FORM = { nom: '', telephone: '', zone: '' };

function SectionEquipeReseau() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('superviseurs');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingNom, setEditingNom] = useState(null);
  const [search, setSearch] = useState('');

  const { data: equipe, isLoading } = useQuery('equipe-reseau',
    () => api.get('/reseau/equipe').then(r => r.data),
    { staleTime: 30000 }
  );

  const currentTab = ROLE_TABS.find(t => t.key === activeTab);
  const items = (equipe?.[activeTab] || []).filter(m =>
    !search || m.nom?.toLowerCase().includes(search.toLowerCase()) ||
    m.telephone?.includes(search) || m.zone?.toLowerCase().includes(search.toLowerCase())
  );

  const addMutation = useMutation(
    (data) => api.post('/reseau/equipe/add', data),
    {
      onSuccess: (res) => {
        toast.success(res.data?.message || 'Membre ajouté !');
        setShowForm(false); setForm(EMPTY_FORM);
        queryClient.invalidateQueries('equipe-reseau');
      },
      onError: () => toast.error('Erreur lors de l\'ajout')
    }
  );

  const updateMutation = useMutation(
    ({ nom, data }) => api.put(`/reseau/equipe/${currentTab.role}/${encodeURIComponent(nom)}`, data),
    {
      onSuccess: (res) => {
        toast.success(res.data?.message || 'Mis à jour !');
        setEditingNom(null); setForm(EMPTY_FORM);
        queryClient.invalidateQueries('equipe-reseau');
      },
      onError: () => toast.error('Erreur lors de la mise à jour')
    }
  );

  const deleteMutation = useMutation(
    (nom) => api.delete(`/reseau/equipe/${currentTab.role}/${encodeURIComponent(nom)}`),
    {
      onSuccess: () => {
        toast.success('Membre supprimé');
        queryClient.invalidateQueries('equipe-reseau');
      },
      onError: () => toast.error('Erreur lors de la suppression')
    }
  );

  const handleSubmit = () => {
    if (!form.nom.trim()) { toast.error('Le nom est obligatoire'); return; }
    if (editingNom) {
      updateMutation.mutate({ nom: editingNom, data: { ...form, role: currentTab.role } });
    } else {
      addMutation.mutate({ ...form, role: currentTab.role });
    }
  };

  const startEdit = (m) => {
    setEditingNom(m.nom);
    setForm({ nom: m.nom, telephone: m.telephone || '', zone: m.zone || '' });
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setEditingNom(null); setForm(EMPTY_FORM); };

  const inputStyle = { padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, width: '100%' };

  if (isLoading) return <div style={{ color: '#8a8a9a', textAlign: 'center', padding: 40 }}>⏳ Chargement de l'équipe...</div>;

  return (
    <div>
      <p style={{ color: '#8a8a9a', fontSize: 13, marginBottom: 20 }}>
        Gérez les membres de l'équipe réseau. Ces informations sont utilisées dans toute l'application.
      </p>

      {/* Onglets par rôle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {ROLE_TABS.map(t => {
          const count = equipe?.[t.key]?.length || 0;
          const isActive = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setShowForm(false); setEditingNom(null); setSearch(''); }}
              style={{ padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
                background: isActive ? t.color : 'rgba(255,255,255,0.05)',
                color: isActive ? '#fff' : '#8a8a9a',
                boxShadow: isActive ? `0 2px 8px ${t.color}55` : 'none',
              }}>
              {t.icon} {t.label}
              <span style={{ marginLeft: 6, fontSize: 11, padding: '2px 6px', borderRadius: 10, background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)' }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Barre d'actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`🔍 Rechercher dans ${currentTab?.label}...`}
          style={{ ...inputStyle, maxWidth: 280 }}
        />
        <button onClick={() => { setShowForm(!showForm); setEditingNom(null); setForm(EMPTY_FORM); }}
          style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            background: showForm ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg,${currentTab?.color},${currentTab?.color}cc)`,
            color: '#fff' }}>
          {showForm ? '✕ Annuler' : `+ Ajouter ${currentTab?.label?.slice(0,-1) || 'membre'}`}
        </button>
      </div>

      {/* Formulaire ajout/édition */}
      {showForm && (
        <div style={{ padding: 20, background: `${currentTab?.color}11`, border: `1px solid ${currentTab?.color}33`, borderRadius: 12, marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 16px', color: currentTab?.color, fontSize: 14 }}>
            {editingNom ? `✏️ Modifier — ${editingNom}` : `➕ Nouveau ${currentTab?.label?.slice(0,-1)}`}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 4 }}>Nom complet *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                placeholder="PRÉNOM NOM" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 4 }}>Téléphone</label>
              <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                placeholder="+223 XX XX XX XX" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8a8a9a', display: 'block', marginBottom: 4 }}>Zone</label>
              <input value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}
                placeholder="Zone A, B, C..." style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSubmit} disabled={addMutation.isLoading || updateMutation.isLoading}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg,${currentTab?.color},${currentTab?.color}cc)`, color: '#fff' }}>
              {editingNom ? '✅ Mettre à jour' : '✅ Ajouter'}
            </button>
            <button onClick={cancelForm}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: 'transparent', color: '#8a8a9a' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste des membres */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Nom</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Téléphone</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#8a8a9a' }}>Zone</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8a8a9a' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m, i) => (
              <tr key={m.nom} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i%2===0?'transparent':'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: currentTab?.color, marginRight: 8 }}/>
                  {m.nom}
                </td>
                <td style={{ padding: '10px 12px', color: m.telephone ? '#fff' : '#555' }}>
                  {m.telephone ? `📞 ${m.telephone}` : <span style={{ fontStyle: 'italic', color: '#555' }}>Non renseigné</span>}
                </td>
                <td style={{ padding: '10px 12px', color: '#8a8a9a', fontSize: 12 }}>{m.zone || '—'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <button onClick={() => startEdit(m)}
                      style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${currentTab?.color}44`, background: `${currentTab?.color}11`, color: currentTab?.color, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      ✏️ Modifier
                    </button>
                    <button onClick={() => { if (window.confirm(`Supprimer ${m.nom} ?`)) deleteMutation.mutate(m.nom); }}
                      style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      🗑️ Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#555', fontStyle: 'italic' }}>
                {search ? 'Aucun résultat pour cette recherche' : `Aucun(e) ${currentTab?.label?.slice(0,-1)} enregistré(e) — cliquez sur "+ Ajouter" pour commencer`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionDatabase() {
  const queryClient = useQueryClient();
  const { data: stats } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 120000 });
  const recalcScores = useMutation(() => api.post('/analytics/update-scores'), {
    onSuccess: (res) => { toast.success(`Scores recalcules pour ${res.data?.updated||'?'} PDVs !`); queryClient.invalidateQueries('analytics-health'); },
    onError: () => toast.error('Erreur recalcul'),
  });
  const handleExportDB = async () => {
    try {
      const pdvs = await api.get('/pdvs', { params: { limit: 2000 } }).then(r => r.data);
      const rows = pdvs.map(p => ({ 'Numero PDV': p.numero_pdv, 'Nom': p.nom, 'Type': p.type_pdv, 'Zone': p.zone, 'Superviseur': p.superviseur||'', 'Statut': p.statut, 'Health Score': p.health_score?.toFixed(0)||0 }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PDVs');
      XLSX.writeFile(wb, `farouk_distribution_export_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast.success('Base de donnees exportee !');
    } catch { toast.error("Erreur lors de l'export"); }
  };

  const kpis = [
    { label:'Total PDVs', value: stats?.total_pdvs||0, color:'#FF6900', icon:'🏪' },
    { label:'PDVs Actifs', value: stats?.actifs||0, color:'#00d68f', icon:'✅' },
    { label:'PDVs Inactifs', value: stats?.inactifs||0, color:'#ff3d71', icon:'❌' },
    { label:'Health Score Moyen', value: (stats?.avg_health_score||0).toFixed(0), color:'#4a9eff', icon:'💚', suffix: '/100' },
  ];

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:24 }}>
        {kpis.map((k,i) => (
          <div key={i} style={{ padding:20, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, borderLeft:`3px solid ${k.color}` }}>
            <div style={{ fontSize:22, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:28, fontWeight:800, color:k.color }}>{k.value}{k.suffix||''}</div>
            <div style={{ fontSize:12, color:'#8a8a9a', marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <button onClick={handleExportDB}
          style={{ background:'rgba(0,214,143,0.1)', border:'1px solid rgba(0,214,143,0.25)', color:'#00d68f', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
          <Database size={15}/> Exporter la BD (Excel)
        </button>
        <button onClick={() => recalcScores.mutate()} disabled={recalcScores.isLoading}
          style={{ background:'rgba(74,158,255,0.1)', border:'1px solid rgba(74,158,255,0.25)', color:'#4a9eff', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
          <RefreshCw size={15}/> {recalcScores.isLoading ? 'Calcul...' : 'Recalculer Scores IA'}
        </button>
      </div>
    </div>
  );
}

// ─── SECTION NOTIFICATIONS ────────────────────────────────────────────────────
function SectionNotifications() {
  const [notifs, setNotifs] = useState({ inactifs: true, baisses: true, hebdo: false, mensuel: true, grades: true, gestionnaires: false });
  const toggle = (k) => { setNotifs(v => ({...v,[k]:!v[k]})); toast.success(`Notification ${notifs[k]?'desactivee':'activee'}`); };
  const items = [
    { key:'inactifs', label:'PDVs inactifs', desc:'Alerte si un PDV est inactif depuis plus d\'1 semaine', color:'#ff3d71' },
    { key:'baisses', label:'Baisses de CA', desc:'Alerte si le CA baisse de plus de 15% par rapport au mois precedent', color:'#ffaa00' },
    { key:'grades', label:'Risque degradation de grade', desc:'Alerte si un PDV est proche du seuil inferieur de son grade', color:'#CD7F32' },
    { key:'gestionnaires', label:'Alertes gestionnaires', desc:'Alerte si un gestionnaire a un taux de recouvrement faible', color:'#4a9eff' },
    { key:'hebdo', label:'Rapport hebdomadaire', desc:'Resume automatique chaque lundi matin', color:'#00d68f' },
    { key:'mensuel', label:'Rapport mensuel', desc:'Rapport complet le 1er de chaque mois', color:'#a855f7' },
  ];
  return (
    <div style={{ display:'grid', gap:4 }}>
      {items.map((n,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:12, borderLeft:`3px solid ${n.color}` }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:3, color: notifs[n.key] ? '#fff' : '#8a8a9a' }}>{n.label}</div>
            <div style={{ fontSize:12, color:'#8a8a9a' }}>{n.desc}</div>
          </div>
          <div onClick={() => toggle(n.key)}
            style={{ width:44, height:24, borderRadius:12, background:notifs[n.key]?n.color:'rgba(255,255,255,0.08)', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:3, left:notifs[n.key]?22:3, width:18, height:18, borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeSection, setActiveSection] = useState('profil');

  const sections = [
    { id:'profil',         label:'Mon Profil',              icon: User,     color:'#4a9eff' },
    { id:'utilisateurs',   label:'Gestion des Utilisateurs', icon: Users,    color:'#FF6900', adminOnly: true },
    { id:'roles',          label:'Roles & Permissions',      icon: Shield,   color:'#a855f7', adminOnly: true },
    { id:'database',       label:'Base de Donnees',          icon: Database, color:'#00d68f' },
    { id:'equipe',         label:'Equipe Reseau',             icon: Phone,    color:'#00d68f' },
    { id:'notifications',  label:'Notifications',            icon: Bell,     color:'#ffaa00' },
  ].filter(s => !s.adminOnly || user?.role === 'admin');

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom:24 }}>
        <div>
          <h1 className="page-title">Parametres</h1>
          <p style={{ color:'#8a8a9a', fontSize:13, marginTop:4 }}>Configuration de Farouk Distribution</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', gap:20, alignItems:'start' }}>
        {/* Menu lateral */}
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:8, position:'sticky', top:20 }}>
          {sections.map(s => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'12px 16px', background: isActive ? `${s.color}18` : 'transparent', border: isActive ? `1px solid ${s.color}33` : '1px solid transparent', borderRadius:12, color: isActive ? s.color : '#8a8a9a', cursor:'pointer', fontSize:13, fontWeight: isActive ? 700 : 500, fontFamily:'Inter,sans-serif', transition:'all 0.18s', textAlign:'left', marginBottom:2 }}>
                <div style={{ width:32, height:32, borderRadius:9, background: isActive ? `${s.color}22` : 'rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon size={15} style={{ color: isActive ? s.color : '#8a8a9a' }}/>
                </div>
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Contenu */}
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:28, minHeight:400 }}>
          {activeSection === 'profil'        && <><h2 style={{ fontSize:18, fontWeight:800, marginBottom:24 }}>Mon Profil</h2><SectionProfil user={user} key={user?.nom} /></>}
          {activeSection === 'utilisateurs'  && <><h2 style={{ fontSize:18, fontWeight:800, marginBottom:24 }}>Gestion des Utilisateurs</h2><SectionUtilisateurs currentUser={user} /></>}
          {activeSection === 'roles'         && <><h2 style={{ fontSize:18, fontWeight:800, marginBottom:24 }}>Roles & Permissions</h2><p style={{ color:'#8a8a9a', fontSize:13, marginBottom:20 }}>Definissez ce que chaque role peut voir, ajouter, modifier ou supprimer dans l\'application.</p><SectionRoles /></>}
          {activeSection === 'database'      && <><h2 style={{ fontSize:18, fontWeight:800, marginBottom:24 }}>Base de Donnees</h2><SectionDatabase /></>}
          {activeSection === 'equipe'        && <><h2 style={{ fontSize:18, fontWeight:800, marginBottom:24 }}>📞 Equipe Reseau & Numéros</h2><SectionEquipeReseau /></>}
          {activeSection === 'notifications' && <><h2 style={{ fontSize:18, fontWeight:800, marginBottom:24 }}>Notifications & Alertes</h2><SectionNotifications /></>}
        </div>
      </div>
    </div>
  );
}
