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
  const [installation, setInstallation] = useState(null);
  const [detail, setDetail] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [inst, setInst] = useState({ numero_batterie: '', date_activation: new Date().toISOString().slice(0, 10), piece_identite: '', latitude: '', longitude: '' });
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
    ({ id, ...corps }) => api.patch(`/energia/prospects/${id}/statut`, corps).then(r => r.data),
    {
      onSuccess: (_, v) => { toast.success(v.statut === 'INSTALLE' ? 'Installation enregistrée' : 'Passé en suivi'); rafraichir(); },
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

      {installation && (
        <form className="m-card" onSubmit={(e) => {
          e.preventDefault();
          if (!inst.numero_batterie.trim()) { toast.error('Numéro de batterie obligatoire'); return; }
          const cible = installation.id;
          if (photo) {
            const fd = new FormData();
            fd.append('file', photo);
            api.post(`/energia/prospects/${cible}/pieces`, fd).catch(() => {});
          }
          changer.mutate({
            id: cible, statut: 'INSTALLE',
            numero_batterie: inst.numero_batterie.trim(),
            date_activation: inst.date_activation || undefined,
            piece_identite: inst.piece_identite || undefined,
            latitude: inst.latitude === '' ? undefined : Number(inst.latitude),
            longitude: inst.longitude === '' ? undefined : Number(inst.longitude),
          });
          setInstallation(null);
        }} style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid rgba(34,197,94,0.35)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>🛠️ Installation — {installation.nom} {installation.prenom}</div>
          <input className="m-input" placeholder="N° de batterie *" value={inst.numero_batterie}
            onChange={e => setInst({ ...inst, numero_batterie: e.target.value })} />
          <label style={{ fontSize: 11, color: 'var(--fm-muted)' }}>Date d'activation</label>
          <input className="m-input" type="date" value={inst.date_activation}
            onChange={e => setInst({ ...inst, date_activation: e.target.value })} />
          <input className="m-input" placeholder="Pièce d'identité (si non renseignée)" value={inst.piece_identite}
            onChange={e => setInst({ ...inst, piece_identite: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="m-input" placeholder="Latitude" value={inst.latitude}
              onChange={e => setInst({ ...inst, latitude: e.target.value })} />
            <input className="m-input" placeholder="Longitude" value={inst.longitude}
              onChange={e => setInst({ ...inst, longitude: e.target.value })} />
          </div>
          <label style={{ fontSize: 11, color: 'var(--fm-muted)' }}>Photo de la pièce</label>
          <input className="m-input" type="file" accept="image/*" capture="environment"
            onChange={e => setPhoto(e.target.files?.[0] || null)} style={{ padding: 8 }} />
          <button type="button" className="m-btn secondary" style={{ padding: 10, fontSize: 12 }}
            onClick={() => {
              if (!navigator.geolocation) { toast.error('GPS indisponible'); return; }
              navigator.geolocation.getCurrentPosition(
                pos => { setInst(v => ({ ...v, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) })); toast.success('Position enregistrée'); },
                () => toast.error('Position indisponible'), { enableHighAccuracy: true, timeout: 10000 });
            }}>📍 Utiliser ma position</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="m-btn secondary" style={{ flex: 1 }} onClick={() => setInstallation(null)}>Annuler</button>
            <button type="submit" className="m-btn vert" style={{ flex: 1 }}>✅ Valider</button>
          </div>
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

      {detail && (
        <div className="m-drawer-overlay" onClick={() => setDetail(null)}>
          <div className="m-drawer" onClick={e => e.stopPropagation()} style={{ height: 'auto', maxHeight: '85vh', borderRadius: 18, margin: 'auto 0 0 0', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ color: '#fff', fontSize: 15 }}>{detail.nom} {detail.prenom}</b>
              <button className="m-icon-btn" onClick={() => setDetail(null)}>✕</button>
            </div>
            {[['Référence', detail.reference], ['Kit', detail.nom_kit], ['Téléphone', detail.telephone],
              ['Quartier', detail.quartier], ['Prospecté le', detail.date_prospection],
              ['Prêt à payer', detail.pret_payer_immediatement ? 'Oui' : 'Non'],
              ["Pièce d'identité", detail.piece_identite],
              ['GPS', detail.latitude ? `${detail.latitude}, ${detail.longitude}` : null],
              ['N° batterie', detail.numero_batterie], ["Date d'activation", detail.date_activation],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--fm-border)', fontSize: 12.5 }}>
                <span style={{ color: 'var(--fm-muted)' }}>{l}</span>
                <b style={{ color: '#fff', textAlign: 'right' }}>{v || '—'}</b>
              </div>
            ))}
            {detail.notes && <div style={{ fontSize: 12, color: 'var(--fm-muted)', marginTop: 10 }}>📝 {detail.notes}</div>}
          </div>
        </div>
      )}

      {liste.map(p => {
        const st = STATUTS[p.statut || 'PROSPECT'] || STATUTS.PROSPECT;
        return (
          <div key={p.id} className="m-item" onClick={() => setDetail(p)} style={{ cursor: 'pointer' }}>
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
              {p.numero_batterie && <div>Batterie<b>{p.numero_batterie}</b></div>}
              {p.date_activation && <div>Activé le<b>{fmtDate(p.date_activation)}</b></div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {(!p.statut || p.statut === 'PROSPECT') && (
                <button className="m-btn vert" style={{ flex: 1, padding: 10, fontSize: 13 }}
                  onClick={(e) => { e.stopPropagation(); setInst({ numero_batterie: '', date_activation: new Date().toISOString().slice(0, 10), piece_identite: p.piece_identite || '', latitude: p.latitude || '', longitude: p.longitude || '' }); setInstallation(p); }}>🛠️ Installer</button>
              )}
              {p.statut === 'INSTALLE' && (
                <button className="m-btn secondary" style={{ flex: 1, padding: 10, fontSize: 13 }}
                  onClick={(e) => { e.stopPropagation(); changer.mutate({ id: p.id, statut: 'SUIVI' }); }}>📞 Passer en suivi</button>
              )}
              <a className="m-btn" style={{ padding: 10, fontSize: 13, width: 52, flexShrink: 0 }} href={`tel:${p.telephone}`}>📞</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
