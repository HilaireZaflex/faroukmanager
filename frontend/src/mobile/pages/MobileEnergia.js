import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { fmtN, fmtDate } from '../format';
import { Hero, Kpi } from '../ui';

const STATUTS = {
  PROSPECT: { label: 'Prospect', icone: '☀️', couleur: '#ffa502' },
  INSTALLE: { label: 'Installé', icone: '🏠', couleur: '#22c55e' },
  SUIVI:    { label: 'En suivi', icone: '📞', couleur: '#4a9eff' },
};

const FILTRES = [
  { id: 'TOUS',     label: 'Tous' },
  { id: 'PROSPECT', label: '☀️ À installer' },
  { id: 'INSTALLE', label: '🏠 Installés' },
  { id: 'SUIVI',    label: '📞 Suivi' },
];

export default function MobileEnergia() {
  const qc = useQueryClient();
  const [filtre, setFiltre] = useState('TOUS');
  const [q, setQ] = useState('');
  const [creation, setCreation] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', telephone: '', quartier: '', nom_kit: 'DIABARANI', notes: '' });

  const { data, isLoading, isError } = useQuery('m-energia',
    () => api.get('/energia/prospects', { params: { limit: 200 } }).then(r => r.data),
    { staleTime: 30000 });

  const { data: stats } = useQuery('m-energia-stats',
    () => api.get('/energia/stats').then(r => r.data), { staleTime: 30000 });

  const rafraichir = () => {
    qc.invalidateQueries('m-energia');
    qc.invalidateQueries('m-energia-stats');
  };

  const changer = useMutation(
    ({ id, statut }) => api.patch(`/energia/prospects/${id}/statut`, { statut }).then(r => r.data),
    {
      onSuccess: (_, v) => { toast.success(v.statut === 'INSTALLE' ? 'Marqué installé' : 'Passé en suivi'); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Mise à jour impossible'),
    }
  );

  const creer = useMutation(
    (corps) => api.post('/energia/prospects', corps).then(r => r.data),
    {
      onSuccess: () => { toast.success('Prospect ENERGIA ajouté'); setCreation(false); rafraichir(); },
      onError: (e) => toast.error(e?.response?.data?.detail || 'Enregistrement impossible'),
    }
  );

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return (data?.items || []).filter(p => {
      if (filtre !== 'TOUS' && (p.statut || 'PROSPECT') !== filtre) return false;
      if (!terme) return true;
      return `${p.nom || ''} ${p.prenom || ''} ${p.telephone || ''} ${p.reference || ''}`.toLowerCase().includes(terme);
    });
  }, [data, filtre, q]);

  const soumettre = (e) => {
    e.preventDefault();
    if (!form.nom || !form.prenom || !form.telephone) {
      toast.error('Nom, prénom et téléphone sont obligatoires');
      return;
    }
    creer.mutate({ ...form, pret_payer_immediatement: true, date_prospection: new Date().toISOString().slice(0, 10) });
  };

  return (
    <div>
      <Hero titre="Prospection ENERGIA" role="Kits solaires · Mon portefeuille"
        sousTitre={stats ? `${fmtN(stats.total)} prospect(s) · ${fmtN(stats.installes)} installé(s)` : undefined} />

      <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
        <Kpi icone="☀️" label="À installer" valeur={fmtN(stats?.a_installer)} sub="prospects" couleur="#ffa502" />
        <Kpi icone="🏠" label="Installés" valeur={fmtN(stats?.installes)} sub="kits posés" couleur="#22c55e" />
        <Kpi icone="📞" label="En suivi" valeur={fmtN(stats?.suivis)} sub="après installation" couleur="#4a9eff" />
        <Kpi icone="💡" label="YELEN" valeur={fmtN(stats?.yelen)} sub={`${fmtN(stats?.diabarani)} DIABARANI`} couleur="#a29bfe" />
      </div>

      <div className="m-search-row">
        <input className="m-input" placeholder="Rechercher un client…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="m-icon-btn" onClick={() => setCreation(v => !v)} aria-label="Nouveau prospect">＋</button>
      </div>

      {creation && (
        <form className="m-card" onSubmit={soumettre} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Nouveau prospect ENERGIA</div>
          <input className="m-input" placeholder="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
          <input className="m-input" placeholder="Prénom" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
          <input className="m-input" placeholder="Téléphone" inputMode="tel" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
          <input className="m-input" placeholder="Quartier" value={form.quartier} onChange={e => setForm({ ...form, quartier: e.target.value })} />
          <select className="m-input" value={form.nom_kit} onChange={e => setForm({ ...form, nom_kit: e.target.value })}>
            <option value="DIABARANI">DIABARANI</option>
            <option value="YELEN">YELEN</option>
          </select>
          <button className="m-btn" type="submit" disabled={creer.isLoading}>
            {creer.isLoading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      <div className="m-chips">
        {FILTRES.map(f => (
          <button key={f.id} className={'m-chip' + (filtre === f.id ? ' active' : '')} onClick={() => setFiltre(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="m-empty">Chargement de vos prospects…</div>}
      {isError && <div className="m-empty">Impossible de charger vos prospects ENERGIA.</div>}
      {!isLoading && !isError && liste.length === 0 && (
        <div className="m-empty">Aucun prospect ENERGIA {filtre !== 'TOUS' ? 'avec ce statut' : 'pour le moment'}.<br />Utilisez ＋ pour en ajouter.</div>
      )}

      {liste.map(p => {
        const st = STATUTS[p.statut || 'PROSPECT'] || STATUTS.PROSPECT;
        return (
          <div key={p.id} className="m-item">
            <div className="m-item-top">
              <div className="m-item-title">{p.nom} {p.prenom}</div>
              <span className="m-badge" style={{ background: `${st.couleur}22`, color: st.couleur }}>
                {st.icone} {st.label}
              </span>
            </div>
            <div className="m-item-sub">
              {p.reference} · 📞 {p.telephone}
              {p.quartier ? ` · ${p.quartier}` : ''} · {p.nom_kit}
            </div>
            <div className="m-item-metrics">
              <div>Prospecté le<b>{fmtDate(p.date_prospection)}</b></div>
              <div>Installé le<b>{p.date_installation ? fmtDate(p.date_installation) : '—'}</b></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {(!p.statut || p.statut === 'PROSPECT') && (
                <button className="m-btn vert" style={{ flex: 1, padding: 10, fontSize: 13 }}
                  onClick={() => changer.mutate({ id: p.id, statut: 'INSTALLE' })}>🛠️ Marquer installé</button>
              )}
              {p.statut === 'INSTALLE' && (
                <button className="m-btn secondary" style={{ flex: 1, padding: 10, fontSize: 13 }}
                  onClick={() => changer.mutate({ id: p.id, statut: 'SUIVI' })}>📞 Passer en suivi</button>
              )}
              <a className="m-btn" style={{ padding: 10, fontSize: 13, width: 52, flexShrink: 0 }} href={`tel:${p.telephone}`}>📞</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
