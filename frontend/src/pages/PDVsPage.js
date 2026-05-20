import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Plus, Store, ChevronRight, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import toast from 'react-hot-toast';
import './PDVsPage.css';

const STATUT_CONFIG = {
  ACTIF: { label: 'Actif', className: 'badge-success' },
  INACTIF: { label: 'Inactif', className: 'badge-danger' },
  RECUPERATION: { label: 'Récup.', className: 'badge-warning' },
  DESACTIVE: { label: 'Désactivé', className: 'badge-neutral' },
};

const TYPE_CONFIG = {
  RS: { label: 'RS', className: 'badge-info' },
  RSF: { label: 'RSF', className: 'badge-orange' },
  RNS: { label: 'RNS', className: 'badge-neutral' },
  KIOSQUE: { label: 'Kiosque', className: 'badge-warning' },
};

const MEDAILLE = { OR: '🥇', ARGENT: '🥈', BRONZE: '🥉', AUCUNE: '' };

function HealthBar({ score }) {
  const color = score >= 70 ? '#00d68f' : score >= 40 ? '#ffa502' : '#ff4757';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-bar" style={{ width: 80 }}>
        <div className="progress-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{score?.toFixed(0)}</span>
    </div>
  );
}

const INITIAL_FORM = {
  numero_pdv: '', nom: '', type_pdv: 'RS', zone: '', sous_zone: '',
  quartier: '', superviseur: '', teleconseillere: '', telephone: '',
  nom_gerant: '', numero_personnel: '', statut: 'ACTIF',
};

function NouveauPDVModal({ onClose, onSuccess, zones }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.numero_pdv || !form.nom || !form.zone) {
      toast.error('Numéro PDV, Nom et Zone sont obligatoires');
      return;
    }
    setLoading(true);
    try {
      await api.post('/pdvs', form);
      toast.success(`PDV "${form.nom}" créé avec succès !`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.detail || 'Erreur lors de la création du PDV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 620, width: '95%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>➕ Nouveau Point de Vente</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Numéro PDV *</label>
              <input placeholder="ex: PDV2001" value={form.numero_pdv} onChange={e => set('numero_pdv', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Nom PDV *</label>
              <input placeholder="Nom du point de vente" value={form.nom} onChange={e => set('nom', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Type PDV</label>
              <select value={form.type_pdv} onChange={e => set('type_pdv', e.target.value)}>
                <option value="RS">RS</option>
                <option value="RSF">RSF</option>
                <option value="RNS">RNS</option>
                <option value="KIOSQUE">Kiosque</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Zone *</label>
              <select value={form.zone} onChange={e => set('zone', e.target.value)} required>
                <option value="">Sélectionner une zone</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Sous-zone</label>
              <input placeholder="ex: Zone 1" value={form.sous_zone} onChange={e => set('sous_zone', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Quartier</label>
              <input placeholder="Quartier" value={form.quartier} onChange={e => set('quartier', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Superviseur</label>
              <input placeholder="Nom superviseur" value={form.superviseur} onChange={e => set('superviseur', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Téléconseillère</label>
              <input placeholder="Nom téléconseillère" value={form.teleconseillere} onChange={e => set('teleconseillere', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Téléphone</label>
              <input placeholder="+223 XX XX XX XX" value={form.telephone} onChange={e => set('telephone', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display:'block', marginBottom:5, fontWeight:600, textTransform:'uppercase' }}>Nom Gérant</label>
              <input placeholder="Nom du gérant" value={form.nom_gerant} onChange={e => set('nom_gerant', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Création...' : '✅ Créer le PDV'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PDVsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [statut, setStatut] = useState('');
  const [typePdv, setTypePdv] = useState('');
  const [page, setPage] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const limit = 20;

  const params = { limit, skip: page * limit };
  if (search) params.search = search;
  if (zone) params.zone = zone;
  if (statut) params.statut = statut;
  if (typePdv) params.type_pdv = typePdv;

  const { data: pdvs = [], isLoading } = useQuery(
    ['pdvs', params],
    () => api.get('/pdvs', { params }).then(r => r.data),
    { keepPreviousData: true, staleTime: 30000 }
  );

  const { data: stats } = useQuery('pdv-stats', () => api.get('/pdvs/stats').then(r => r.data), { staleTime: 60000 });

  const zones = stats?.pdvs_par_zone ? Object.keys(stats.pdvs_par_zone) : [];

  const handleExportExcel = async () => {
    try {
      // Fetch all PDVs for export (no pagination limit)
      const allPDVs = await api.get('/pdvs', { params: { limit: 1000, ...( zone ? { zone } : {}), ...(statut ? { statut } : {}), ...(typePdv ? { type_pdv: typePdv } : {}), ...(search ? { search } : {}) } }).then(r => r.data);
      const rows = allPDVs.map(p => ({
        'Numéro PDV': p.numero_pdv,
        'Nom': p.nom,
        'Type': p.type_pdv,
        'Zone': p.zone,
        'Sous-zone': p.sous_zone || '',
        'Superviseur': p.superviseur || '',
        'Téléconseillère': p.teleconseillere || '',
        'Statut': p.statut,
        'Health Score': p.health_score?.toFixed(0) || 0,
        'Médaille': p.medaille || 'AUCUNE',
        'Téléphone': p.telephone || '',
        'Gérant': p.nom_gerant || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PDVs');
      XLSX.writeFile(wb, `pdvs_export_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast.success(`${rows.length} PDVs exportés avec succès !`);
    } catch (err) {
      toast.error('Erreur lors de l\'export');
    }
  };

  return (
    <div className="page pdvs-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Points de Vente</h1>
          <p className="page-subtitle">{stats?.total_pdvs || 0} PDVs enregistrés · {stats?.actifs || 0} actifs</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleExportExcel}><Download size={14}/> Exporter Excel</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus size={14}/> Nouveau PDV</button>
        </div>
      </div>

      {/* Stats mini */}
      <div className="pdv-mini-stats mb-24">
        <div className="mini-stat-card" style={{ '--color': '#00d68f' }}>
          <span className="mini-stat-val">{stats?.total_pdvs || 0}</span>
          <span className="mini-stat-label">Total PDV</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#3b82f6' }}>
          <span className="mini-stat-val">{stats?.pdvs_par_type?.RS || 0}</span>
          <span className="mini-stat-label">RS</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#8b5cf6' }}>
          <span className="mini-stat-val">{stats?.pdvs_par_type?.RNS || 0}</span>
          <span className="mini-stat-label">RNS</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#f59e0b' }}>
          <span className="mini-stat-val">{stats?.pdvs_par_type?.KIOSQUE || 0}</span>
          <span className="mini-stat-label">KIOSQUE</span>
        </div>
        <div className="mini-stat-card" style={{ '--color': '#10b981' }}>
          <span className="mini-stat-val">{stats?.pdvs_par_type?.RSF || 0}</span>
          <span className="mini-stat-label">RSF</span>
        </div>
      </div>

      {/* Filters */}
      <div className="pdv-filters card mb-16">
        <div className="filter-search">
          <Search size={15} className="search-icon"/>
          <input
            type="text"
            placeholder="Rechercher un PDV, numéro, superviseur..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div className="filter-selects">
          <select value={zone} onChange={e => { setZone(e.target.value); setPage(0); }}>
            <option value="">Toutes les zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <select value={statut} onChange={e => { setStatut(e.target.value); setPage(0); }}>
            <option value="">Tous les statuts</option>
            <option value="ACTIF">Actif</option>
            <option value="INACTIF">Inactif</option>
            <option value="RECUPERATION">Récupération</option>
          </select>
          <select value={typePdv} onChange={e => { setTypePdv(e.target.value); setPage(0); }}>
            <option value="">Tous les types</option>
            <option value="RS">RS</option>
            <option value="RSF">RSF</option>
            <option value="RNS">RNS</option>
            <option value="KIOSQUE">Kiosque</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>PDV</th>
                <th>Zone</th>
                <th>Type</th>
                <th>Single Wallet</th>
                <th>Statut</th>
                <th>Superviseur</th>
                <th>Médaille</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16, width: j === 0 ? 160 : 80 }}/></td>
                    ))}
                  </tr>
                ))
              ) : pdvs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <Store size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 10px' }}/>
                    Aucun PDV trouvé
                  </td>
                </tr>
              ) : (
                pdvs.map(pdv => (
                  <tr key={pdv.id} onClick={() => navigate(`/pdvs/${pdv.id}`)}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.3px' }}>{pdv.numero_pdv}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pdv.nom}</div>
                      </div>
                    </td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pdv.zone}</span></td>
                    <td>
                      <span className={`badge ${TYPE_CONFIG[pdv.type_pdv]?.className || 'badge-neutral'}`}>
                        {TYPE_CONFIG[pdv.type_pdv]?.label || pdv.type_pdv}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUT_CONFIG[pdv.statut]?.className || 'badge-neutral'}`}>
                        {STATUT_CONFIG[pdv.statut]?.label || pdv.statut}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${pdv.single_wallet ? 'badge-success' : 'badge-neutral'}`}
                        style={{ fontSize: 11 }}>
                        {pdv.single_wallet ? '✓ OUI' : '✗ NON'}
                      </span>
                    </td>
                    <td><span style={{ fontSize: 12 }}>{pdv.superviseur || '—'}</span></td>
                    <td style={{ fontSize: 18 }}>{MEDAILLE[pdv.medaille] || ''}</td>
                    <td><ChevronRight size={16} style={{ color: 'var(--text-muted)' }}/></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pdv-pagination">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Page {page + 1} · {pdvs.length} résultats
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}>← Préc.</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={pdvs.length < limit}>Suiv. →</button>
          </div>
        </div>
      </div>

      {/* Modal Nouveau PDV */}
      {showModal && (
        <NouveauPDVModal
          zones={zones}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries(['pdvs']);
            queryClient.invalidateQueries('pdv-stats');
          }}
        />
      )}
    </div>
  );
}
