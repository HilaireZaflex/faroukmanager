import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Download, Search, RefreshCw, AlertTriangle,
  Calendar, TrendingDown, Settings, ChevronUp,
  ChevronDown, CheckCircle, Car, Sparkles, RotateCcw,
  Phone, User, ClipboardList, Save, X
} from 'lucide-react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import './RecoveryListePage.css';

const MOIS_NOMS = {
  1:'Janvier', 2:'Février', 3:'Mars', 4:'Avril',
  5:'Mai', 6:'Juin', 7:'Juillet', 8:'Août',
  9:'Septembre', 10:'Octobre', 11:'Novembre', 12:'Décembre'
};

function fmt(v) {
  if (!v || v === 0) return '0';
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(2)} M`;
  if (v >= 1_000)     return `${(v/1_000).toFixed(0)} K`;
  return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
}
function fmtFull(v) {
  if (!v && v !== 0) return '—';
  return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ') + ' FCFA';
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function caClass(v, seuil) {
  if (v === 0) return 'ca-zero';
  if (v < seuil * 0.25) return 'ca-critical';
  if (v < seuil * 0.5)  return 'ca-warning';
  return 'ca-cell';
}

const STATUTS = [
  { value: 'IDENTIFIE',     label: '🔍 Identifié',      desc: 'PDV détecté, pas encore contacté' },
  { value: 'CONTACTE',      label: '📞 Contacté',        desc: 'Le gestionnaire a pris contact' },
  { value: 'SIM_RECUPEREE', label: '💳 SIM Récupérée',  desc: 'La SIM a été physiquement récupérée' },
  { value: 'REDEPLOYE',     label: '✅ Redéployé',       desc: 'PDV redéployé à un nouveau titulaire' },
];

function TrackingModal({ pdv, tracking, moisNom, onClose, onSave, isLoading }) {
  const [statut, setStatut]               = useState(tracking?.statut || 'IDENTIFIE');
  const [commentaire, setCommentaire]     = useState(tracking?.commentaire || '');
  const [nouveauTitulaire, setNouveauTitulaire] = useState(tracking?.nouveau_titulaire || '');
  const [nouveauTel, setNouveauTel]       = useState(tracking?.nouveau_telephone || '');

  const handleSave = () => {
    onSave({
      pdv_id: pdv.pdv_id,
      statut,
      commentaire: commentaire || undefined,
      nouveau_titulaire: nouveauTitulaire || undefined,
      nouveau_telephone: nouveauTel || undefined,
    });
  };

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal rl-modal-tracking" onClick={e => e.stopPropagation()}>
        {/* En-tête */}
        <div className="rl-modal-header">
          <div>
            <h3><ClipboardList size={18} color="#FF6900" /> Suivi de récupération</h3>
            <p className="rl-modal-sub" style={{ margin: '2px 0 0 28px' }}>
              {pdv.nom} — N° {pdv.numero_pdv} — {moisNom}
            </p>
          </div>
          <button className="rl-modal-close" onClick={onClose}><X size={14}/></button>
        </div>

        {/* Infos PDV */}
        <div className="tm-pdv-info">
          <div className="tm-info-item">
            <span className="tm-info-lbl">Zone</span>
            <span className="tm-info-val">{pdv.zone || '—'}</span>
          </div>
          <div className="tm-info-item">
            <span className="tm-info-lbl">Superviseur</span>
            <span className="tm-info-val">{pdv.superviseur || '—'}</span>
          </div>
          <div className="tm-info-item">
            <span className="tm-info-lbl">Gestionnaire</span>
            <span className="tm-info-val">{pdv.gestionnaire || '—'}</span>
          </div>
          <div className="tm-info-item">
            <span className="tm-info-lbl">Téléphone</span>
            <span className="tm-info-val">{pdv.telephone || '—'}</span>
          </div>
          <div className="tm-info-item">
            <span className="tm-info-lbl">CA Fév.</span>
            <span className="tm-info-val" style={{ color:'#ffa502' }}>{fmt(pdv.ca_mois_precedent)}</span>
          </div>
          <div className="tm-info-item">
            <span className="tm-info-lbl">CA Mars</span>
            <span className="tm-info-val" style={{ color:'#ffa502' }}>{fmt(pdv.ca_mois_courant)}</span>
          </div>
          <div className="tm-info-item">
            <span className="tm-info-lbl">CA Total</span>
            <span className="tm-info-val" style={{ color:'#ff6b81', fontWeight:800 }}>{fmt(pdv.ca_total)}</span>
          </div>
        </div>

        {/* Sélection statut */}
        <div className="tm-section">
          <label className="tm-label">Nouveau statut</label>
          <div className="tm-statuts">
            {STATUTS.map(s => (
              <button
                key={s.value}
                className={`tm-statut-btn ${statut === s.value ? 'tm-statut-active' : ''}`}
                onClick={() => setStatut(s.value)}
                title={s.desc}
              >
                {s.label}
                <span className="tm-statut-desc">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Commentaire */}
        <div className="tm-section">
          <label className="tm-label">Commentaire</label>
          <textarea
            className="tm-textarea"
            placeholder="Notes sur la récupération (optionnel)..."
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            rows={3}
          />
        </div>

        {/* Nouveau titulaire (si redéployé) */}
        {statut === 'REDEPLOYE' && (
          <div className="tm-section">
            <label className="tm-label">Nouveau titulaire</label>
            <div style={{ display:'flex', gap:10 }}>
              <input className="tm-input" placeholder="Nom et prénom"
                value={nouveauTitulaire} onChange={e => setNouveauTitulaire(e.target.value)} />
              <input className="tm-input" placeholder="Téléphone"
                value={nouveauTel} onChange={e => setNouveauTel(e.target.value)} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="rl-modal-footer" style={{ marginTop:16 }}>
          <button className="rl-btn-cancel" onClick={onClose}>Annuler</button>
          <button className="rl-btn-apply" onClick={handleSave} disabled={isLoading}>
            {isLoading ? '...' : <><Save size={13}/> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }) {
  if (!type) return <span className="badge-type badge-default">—</span>;
  const t = type.toLowerCase();
  const cls = t === 'rns' ? 'badge-rns' : t === 'rs' ? 'badge-rs' : t === 'rsf' ? 'badge-rsf' : t.startsWith('kiosque') ? 'badge-kiosque' : 'badge-default';
  return <span className={`badge-type ${cls}`}>{type}</span>;
}

export default function RecoveryListePage() {
  // Mois par défaut = Avril 2026 (dernier mois disponible en base)
  const [mois, setMois]     = useState(4);
  const [annee, setAnnee]   = useState(2026);
  const [seuil, setSeuil]   = useState(5_000_000);
  const [seuilInput, setSeuilInput] = useState('5000000');
  const [showModal, setShowModal]           = useState(false);
  const [exclusionModal, setExclusionModal] = useState(null);
  const [trackingModal, setTrackingModal]   = useState(null);
  const [search, setSearch]                 = useState('');
  const [filterZone, setFilterZone]         = useState('');
  const [filterType, setFilterType]         = useState('');
  const [filterSup, setFilterSup]           = useState('');
  const [sortCol, setSortCol]               = useState('ca_total');
  const [sortDir, setSortDir]               = useState('asc');

  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery(
    ['recovery-liste', mois, annee, seuil],
    () => api.get(`/alerts/recovery/liste?mois=${mois}&annee=${annee}&seuil=${seuil}`).then(r => r.data),
    { staleTime: 60_000 }
  );

  const { data: trackingData, refetch: refetchTracking } = useQuery(
    ['recovery-tracking', mois, annee],
    () => api.get(`/alerts/recovery/tracking?mois=${mois}&annee=${annee}`).then(r => r.data),
    { staleTime: 30_000 }
  );

  const trackingMap = useMemo(() => {
    const m = {};
    (trackingData?.trackings || []).forEach(t => { m[t.pdv_id] = t; });
    return m;
  }, [trackingData]);

  const updateTracking = useMutation(
    ({ pdv_id, statut, commentaire, nouveau_titulaire, nouveau_telephone }) => {
      const params = new URLSearchParams({ statut });
      if (commentaire) params.append('commentaire', commentaire);
      if (nouveau_titulaire) params.append('nouveau_titulaire', nouveau_titulaire);
      if (nouveau_telephone) params.append('nouveau_telephone', nouveau_telephone);
      return api.post(`/alerts/recovery/tracking/pdv/${pdv_id}?mois=${mois}&annee=${annee}&${params.toString()}`);
    },
    {
      onSuccess: () => {
        refetchTracking();
        queryClient.invalidateQueries('recovery-tracking-apercu');
        setTrackingModal(null);
      }
    }
  );

  const liste = data?.liste || [];

  const filtered = useMemo(() => {
    let res = [...liste];
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(p =>
        (p.numero_pdv||'').toLowerCase().includes(q) ||
        (p.nom||'').toLowerCase().includes(q) ||
        (p.superviseur||'').toLowerCase().includes(q) ||
        (p.gestionnaire||'').toLowerCase().includes(q)
      );
    }
    if (filterZone) res = res.filter(p => p.zone === filterZone);
    if (filterType) res = res.filter(p => p.type_pdv === filterType);
    if (filterSup)  res = res.filter(p => p.superviseur === filterSup);
    res.sort((a, b) => {
      let va = a[sortCol] ?? 0, vb = b[sortCol] ?? 0;
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb||'').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return res;
  }, [liste, search, filterZone, filterType, filterSup, sortCol, sortDir]);

  const zones    = useMemo(() => [...new Set(liste.map(p => p.zone).filter(Boolean))].sort(), [liste]);
  const types    = useMemo(() => [...new Set(liste.map(p => p.type_pdv).filter(Boolean))].sort(), [liste]);
  const sups     = useMemo(() => [...new Set(liste.map(p => p.superviseur).filter(Boolean))].sort(), [liste]);

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const SortIco = ({ col }) => sortCol !== col
    ? <ChevronDown size={11} style={{ opacity: 0.25 }} />
    : sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />;

  const handleExport = () => {
    const rows = filtered.map((p, i) => ({
      '#': i + 1,
      'N° PDV': p.numero_pdv,
      'Nom / Prénom': p.nom,
      'Type': p.type_pdv,
      'Zone': p.zone,
      'Sous Zone': p.sous_zone,
      'Superviseur': p.superviseur,
      'Gestionnaire': p.gestionnaire,
      'Téléphone': p.telephone,
      'Date Activation': fmtDate(p.date_activation),
      [`CA ${data?.mois_precedent_nom} (FCFA)`]: p.ca_mois_precedent,
      [`CA ${data?.mois_courant_nom} (FCFA)`]: p.ca_mois_courant,
      'CA Total 2 mois (FCFA)': p.ca_total,
      'Déjà en Récup.': p.deja_en_recuperation ? 'Oui' : 'Non',
      'Mois Récup. Précédent': p.mois_recuperation_precedent || '—',
      'N° Flotte': p.numero_flotte ? 'Oui' : 'Non',
      'Nouvelle Création': p.nouvelle_creation ? 'Oui' : 'Non',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Récupération');
    XLSX.writeFile(wb, `Liste_Recuperation_${data?.mois_courant_nom}_${annee}.xlsx`);
  };

  const applySeuil = () => {
    const v = parseFloat(seuilInput.replace(/[\s ]/g, '').replace(',', '.'));
    if (!isNaN(v) && v > 0) { setSeuil(v); setShowModal(false); }
  };

  // Stats rapides
  const nbZero   = filtered.filter(p => p.ca_total === 0).length;
  const nbFlotte = filtered.filter(p => p.numero_flotte).length;
  const nbDeja   = filtered.filter(p => p.deja_en_recuperation).length;

  const hasFilters = search || filterZone || filterType || filterSup;

  return (
    <div className="rl-page">

      {/* ── HEADER ── */}
      <div className="rl-header">
        <div className="rl-header-left">
          <div className="rl-icon-box">
            <AlertTriangle size={22} color="#fff" />
          </div>
          <div className="rl-header-text">
            <h1>
              Liste à Récupérer —{' '}
              <span>{data?.mois_courant_nom || MOIS_NOMS[mois]} {annee}</span>
            </h1>
            <p>
              Comparaison <strong>{data?.mois_precedent_nom || '…'}</strong> +{' '}
              <strong>{data?.mois_courant_nom || '…'}</strong> · Seuil :{' '}
              <strong>{Math.round(seuil).toLocaleString('en-US').replace(/,/g, ' ')} FCFA</strong>
            </p>
          </div>
        </div>
        <div className="rl-header-actions">
          <button className="rl-btn rl-btn-orange" onClick={() => setShowModal(true)}>
            <Settings size={14} /> Seuil
          </button>
          <button className="rl-btn rl-btn-green" onClick={handleExport} disabled={!filtered.length}>
            <Download size={14} /> Exporter Excel
          </button>
          <button className="rl-btn-icon" onClick={refetch} title="Rafraîchir">
            <RefreshCw size={15} className={isFetching ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── SÉLECTEUR PÉRIODE ── */}
      <div className="rl-period-bar">
        <Calendar size={14} />
        <span>Mois de traitement :</span>
        <select value={mois} onChange={e => setMois(Number(e.target.value))} className="rl-select">
          {Object.entries(MOIS_NOMS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))} className="rl-select">
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {data && (
          <div className="rl-period-right">
            Période analysée :&nbsp;
            <strong>{data.mois_precedent_nom} {data.annee_precedente}</strong>
            &nbsp;+&nbsp;
            <strong>{data.mois_courant_nom} {data.annee_courante}</strong>
          </div>
        )}
      </div>

      {/* ── KPI CARDS ── */}
      <div className="rl-kpis">
        <div className="rl-kpi-card kpi-red">
          <div className="val">{data?.total ?? '—'}</div>
          <div className="lbl">PDV à récupérer</div>
          <div className="sub">Montant transactions 2 mois &lt; {fmt(seuil)} FCFA</div>
        </div>
        <div className="rl-kpi-card kpi-dark">
          <div className="val">{nbZero}</div>
          <div className="lbl">CA quasi nul</div>
          <div className="sub">très faible activité</div>
        </div>
        <div className="rl-kpi-card kpi-amber">
          <div className="val">{nbDeja}</div>
          <div className="lbl">Déjà en récup.</div>
          <div className="sub">récidivistes</div>
        </div>
        <div className="rl-kpi-card kpi-blue">
          <div className="val">{nbFlotte}</div>
          <div className="lbl">N° Flotte</div>
          <div className="sub">à traiter en priorité</div>
        </div>
        <div className="rl-kpi-card kpi-teal">
          <div className="val">{data?.exclusions ? Object.values(data.exclusions).reduce((a,b)=>a+b,0) : '—'}</div>
          <div className="lbl">PDV exclus</div>
          <div className="sub">auto-filtrés</div>
        </div>
      </div>

      {/* ── BARRE EXCLUSIONS CLIQUABLE ── */}
      {data?.exclusions && (
        <div className="rl-exclusions-bar">
          <span className="rl-excl-title">⚙️ Exclusions automatiques :</span>
          {[
            { key: 'au_bureau',         label: '🏢 AU BUREAU',             cls: 'excl-bureau' },
            { key: 'activation_recente',label: '📅 Activation < 1 mois',   cls: 'excl-recent' },
            { key: 'nouvelle_creation', label: '✨ Nouvelles créations',    cls: 'excl-new'    },
            { key: 'inactif_zero_ops',  label: '💤 Inactifs 0 opérations', cls: 'excl-inactif'},
            { key: 'flotte',            label: '🚗 Numéros Flotte (15)',    cls: 'excl-flotte' },
          ].map(({ key, label, cls }) => (
            <button
              key={key}
              className={`rl-excl-item ${cls} rl-excl-btn ${data.exclusions[key] === 0 ? 'excl-zero' : ''}`}
              onClick={() => setExclusionModal({
                key, label,
                liste: data.exclusions_detail?.[key] || []
              })}
              title={data.exclusions[key] === 0 ? 'Aucun PDV exclu pour ce critère' : 'Cliquer pour voir les PDV concernés'}
            >
              {label} : <strong>{data.exclusions[key] ?? 0}</strong>
              {data.exclusions[key] > 0 && <span className="rl-excl-eye">👁</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── FILTRES ── */}
      <div className="rl-filters">
        <div className="rl-search-box">
          <Search size={14} color="#666" />
          <input
            placeholder="Rechercher par N° PDV, nom, superviseur..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)} className="rl-select">
          <option value="">Toutes les zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rl-select">
          <option value="">Tous les types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterSup} onChange={e => setFilterSup(e.target.value)} className="rl-select">
          <option value="">Tous les superviseurs</option>
          {sups.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {hasFilters && (
          <button className="rl-btn rl-btn-ghost" onClick={() => { setSearch(''); setFilterZone(''); setFilterType(''); setFilterSup(''); }}>
            <RotateCcw size={12} /> Réinitialiser
          </button>
        )}
        <div className="rl-filter-count">
          {filtered.length} / {liste.length} PDV
        </div>
      </div>

      {/* ── LÉGENDE COLONNE INFOS ── */}
      <div className="rl-legend">
        <span className="rl-legend-title">Légende colonne « Infos » :</span>
        <span className="flag flag-recup"><RotateCcw size={9} /> Récup.</span>
        <span className="rl-legend-desc">= Ce PDV était déjà dans une liste de récupération (mois indiqué)</span>
        <span className="rl-legend-sep">·</span>
        <span className="flag flag-flotte"><Car size={9} /> Flotte</span>
        <span className="rl-legend-desc">= Numéro de téléphone Flotte Orange</span>
      </div>

      {/* ── TABLEAU ── */}
      <div className="rl-table-container">
        {isLoading ? (
          <div className="rl-loading">
            <RefreshCw size={36} className="spin" color="#FF6900" />
            <p>Calcul de la liste en cours…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rl-empty">
            <CheckCircle size={48} color="#00b894" />
            <p>Aucun PDV à récupérer avec ces critères 🎉</p>
          </div>
        ) : (
          <div className="rl-table-scroll">
            <table className="rl-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th onClick={() => handleSort('numero_pdv')} style={{ display:'table-cell' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>N° PDV <SortIco col="numero_pdv" /></span>
                  </th>
                  <th onClick={() => handleSort('nom')}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>Nom / Prénom <SortIco col="nom" /></span>
                  </th>
                  <th onClick={() => handleSort('type_pdv')}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>Type <SortIco col="type_pdv" /></span>
                  </th>
                  <th onClick={() => handleSort('zone')}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>Zone <SortIco col="zone" /></span>
                  </th>
                  <th onClick={() => handleSort('superviseur')}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>Superviseur <SortIco col="superviseur" /></span>
                  </th>
                  <th onClick={() => handleSort('gestionnaire')}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>Gestionnaire <SortIco col="gestionnaire" /></span>
                  </th>
                  <th onClick={() => handleSort('date_activation')}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>Date Activ. <SortIco col="date_activation" /></span>
                  </th>
                  <th className="th-right" onClick={() => handleSort('ca_mois_precedent')}>
                    <span style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                      Montant Trans. {data?.mois_precedent_nom} <SortIco col="ca_mois_precedent" />
                    </span>
                  </th>
                  <th className="th-right" onClick={() => handleSort('ca_mois_courant')}>
                    <span style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                      Montant Trans. {data?.mois_courant_nom} <SortIco col="ca_mois_courant" />
                    </span>
                  </th>
                  <th className="th-right" onClick={() => handleSort('ca_total')} style={{ color:'#ff6b81' }}>
                    <span style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                      Total 2 mois <SortIco col="ca_total" />
                    </span>
                  </th>
                  <th className="th-center">Infos</th>
                  <th className="th-center">Statut / Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pdv, idx) => (
                  <tr
                    key={pdv.pdv_id}
                    className={pdv.ca_total === 0 ? 'row-zero' : ''}
                    style={ pdv.deja_en_recuperation ? { borderLeft:'3px solid rgba(255,165,2,0.5)' } : {}}
                  >
                    <td className="td-rank td-center">{idx + 1}</td>
                    <td className="td-num">{pdv.numero_pdv}</td>
                    <td className="td-nom">
                      <div>{pdv.nom || '—'}</div>
                      {pdv.telephone && (
                        <div className="td-sub">📞 {pdv.telephone}</div>
                      )}
                    </td>
                    <td><TypeBadge type={pdv.type_pdv} /></td>
                    <td>
                      <div style={{ fontSize:12, color:'#ccc' }}>{pdv.zone || '—'}</div>
                      {pdv.sous_zone && <div className="td-sub">{pdv.sous_zone}</div>}
                    </td>
                    <td style={{ fontSize:12, color:'#bbb' }}>{pdv.superviseur || '—'}</td>
                    <td style={{ fontSize:12, color:'#bbb' }}>{pdv.gestionnaire || '—'}</td>
                    <td style={{ fontSize:11, color:'#777', whiteSpace:'nowrap' }}>
                      {fmtDate(pdv.date_activation)}
                    </td>
                    <td className={`td-right ca-cell ${caClass(pdv.ca_mois_precedent, seuil/2)}`}>
                      {fmt(pdv.ca_mois_precedent)}
                    </td>
                    <td className={`td-right ca-cell ${caClass(pdv.ca_mois_courant, seuil/2)}`}>
                      {fmt(pdv.ca_mois_courant)}
                    </td>
                    <td className="td-right">
                      <div className={`ca-total-cell ${caClass(pdv.ca_total, seuil)}`}>
                        <TrendingDown size={12} />
                        {fmt(pdv.ca_total)}
                      </div>
                    </td>
                    <td className="td-center">
                      <div className="flags-cell" style={{ alignItems:'center' }}>
                        {pdv.deja_en_recuperation && (
                          <span className="flag flag-recup" title={pdv.mois_recuperation_precedent || 'Déjà en récupération'}>
                            <RotateCcw size={9} /> {pdv.mois_recuperation_precedent || 'Récup.'}
                          </span>
                        )}
                        {pdv.numero_flotte && (
                          <span className="flag flag-flotte" title="Numéro Flotte">
                            <Car size={9} /> Flotte
                          </span>
                        )}
                        {pdv.nouvelle_creation && (
                          <span className="flag flag-new" title="Nouvelle Création">
                            <Sparkles size={9} /> Nouveau
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="td-center">
                      {(() => {
                        const tr = trackingMap[pdv.pdv_id];
                        const s = tr?.statut || 'IDENTIFIE';
                        const badges = {
                          IDENTIFIE:     { label: '🔍 Identifié',     cls: 'ts-identifie' },
                          CONTACTE:      { label: '📞 Contacté',       cls: 'ts-contacte' },
                          SIM_RECUPEREE: { label: '💳 SIM Récupérée', cls: 'ts-sim' },
                          REDEPLOYE:     { label: '✅ Redéployé',      cls: 'ts-redeploye' },
                        };
                        const b = badges[s] || badges.IDENTIFIE;
                        return (
                          <button className={`ts-badge ${b.cls}`}
                            onClick={() => setTrackingModal({ pdv, tracking: tr })}
                            title="Cliquer pour mettre à jour">
                            {b.label}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL TRACKING (mise à jour statut) ── */}
      {trackingModal && (
        <TrackingModal
          pdv={trackingModal.pdv}
          tracking={trackingModal.tracking}
          moisNom={data?.mois_courant_nom}
          onClose={() => setTrackingModal(null)}
          onSave={(payload) => updateTracking.mutate(payload)}
          isLoading={updateTracking.isLoading}
        />
      )}

      {/* ── MODAL EXCLUSIONS DÉTAIL ── */}
      {exclusionModal && (
        <div className="rl-overlay" onClick={() => setExclusionModal(null)}>
          <div className="rl-modal rl-modal-large" onClick={e => e.stopPropagation()}>
            <div className="rl-modal-header">
              <h3>{exclusionModal.label}</h3>
              <span className="rl-modal-count">{exclusionModal.liste.length} PDV exclus</span>
              <button
                onClick={() => {
                  // Export Excel CSV
                  const rows = [
                    ['#','N° PDV','Nom','Type','Zone','Sous-zone','Superviseur','Gestionnaire','Téléphone','Date Activation',
                     `Montant Trans. ${data?.mois_precedent_nom}`,`Montant Trans. ${data?.mois_courant_nom}`,'Total 2 mois'].join(';'),
                    ...exclusionModal.liste.map((p, i) => [
                      i+1, p.numero_pdv, p.nom||'', p.type_pdv||'', p.zone||'', p.sous_zone||'',
                      p.superviseur||'', p.gestionnaire||'', p.telephone||'',
                      p.date_activation ? p.date_activation.slice(0,10) : '',
                      p.ca_mois_precedent||0, p.ca_mois_courant||0, p.ca_total||0
                    ].join(';'))
                  ].join('\n')
                  const blob = new Blob(['\uFEFF'+rows], { type: 'text/csv;charset=utf-8;' })
                  const url  = URL.createObjectURL(blob)
                  const a    = document.createElement('a')
                  a.href = url
                  a.download = `exclus_${exclusionModal.key}_${data?.mois_courant_nom||''}_${annee}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                style={{
                  background: '#1a7a4a', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, marginRight: 8
                }}
              >
                ⬇️ Exporter Excel
              </button>
              <button className="rl-modal-close" onClick={() => setExclusionModal(null)}>✕</button>
            </div>
            <p className="rl-modal-sub" style={{ marginBottom: 16 }}>
              Ces PDV ont été automatiquement exclus de la liste de récupération.
              Total montant transactions : <strong>
                {Math.round(
                  exclusionModal.liste.reduce((s, p) => s + (p.ca_total || 0), 0)
                )} FCFA
              </strong>
            </p>
            <div className="rl-excl-table-wrap">
              <table className="rl-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>N° PDV</th>
                    <th>Nom / Prénom</th>
                    <th>Type</th>
                    <th>Zone</th>
                    <th>Superviseur</th>
                    <th>Gestionnaire</th>
                    <th>Téléphone</th>
                    <th>Date Activ.</th>
                    <th className="th-right">Montant Trans. {data?.mois_precedent_nom}</th>
                    <th className="th-right">Montant Trans. {data?.mois_courant_nom}</th>
                    <th className="th-right">Total 2 mois</th>
                  </tr>
                </thead>
                <tbody>
                  {exclusionModal.liste.length === 0 ? (
                    <tr><td colSpan={12} className="rl-empty"><p>Aucun PDV</p></td></tr>
                  ) : exclusionModal.liste.map((pdv, idx) => (
                    <tr key={pdv.pdv_id}>
                      <td className="td-rank">{idx + 1}</td>
                      <td className="td-num">{pdv.numero_pdv}</td>
                      <td className="td-nom">{pdv.nom || '—'}</td>
                      <td><TypeBadge type={pdv.type_pdv} /></td>
                      <td style={{ fontSize: 12 }}>{pdv.zone || '—'}</td>
                      <td style={{ fontSize: 12, color: '#bbb' }}>{pdv.superviseur || '—'}</td>
                      <td style={{ fontSize: 12, color: '#bbb' }}>{pdv.gestionnaire || '—'}</td>
                      <td style={{ fontSize: 11, color: '#777' }}>{pdv.telephone || '—'}</td>
                      <td style={{ fontSize: 11, color: '#777', whiteSpace: 'nowrap' }}>{fmtDate(pdv.date_activation)}</td>
                      <td className="td-right ca-cell" style={{ color: '#888' }}>{fmt(pdv.ca_mois_precedent)}</td>
                      <td className="td-right ca-cell" style={{ color: '#888' }}>{fmt(pdv.ca_mois_courant)}</td>
                      <td className="td-right ca-cell" style={{ color: '#aaa', fontWeight: 700 }}>{fmt(pdv.ca_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL SEUIL ── */}
      {showModal && (
        <div className="rl-overlay" onClick={() => setShowModal(false)}>
          <div className="rl-modal" onClick={e => e.stopPropagation()}>
            <h3><Settings size={18} color="#FF6900" /> Seuil de récupération</h3>
            <p className="rl-modal-sub">
              PDV dont le montant total des transactions sur 2 mois consécutifs est inférieur à ce seuil.
            </p>
            <label>Nouveau seuil (FCFA)</label>
            <input
              type="text"
              value={seuilInput}
              onChange={e => setSeuilInput(e.target.value)}
              placeholder="ex: 5000000"
              autoFocus
            />
            <div className="rl-modal-equiv">
              = {Math.round(
                  parseFloat(seuilInput.replace(/[\s ]/g,'').replace(',','.')) || 0
                )} FCFA
            </div>
            <div className="rl-presets">
              {[3_000_000, 5_000_000, 7_500_000, 10_000_000].map(v => (
                <button key={v} className="rl-preset" onClick={() => setSeuilInput(String(v))}>
                  {Math.round(v).toLocaleString('en-US').replace(/,/g, ' ')}
                </button>
              ))}
            </div>
            <div className="rl-modal-footer">
              <button className="rl-btn-cancel" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="rl-btn-apply" onClick={applySeuil}>Appliquer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
