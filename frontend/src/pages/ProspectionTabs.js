import React, { useEffect, useState, useRef } from 'react';
import prospectService, { STATUS_LABELS } from '../services/prospectService';

// =============================================================================
// 🗺️ ONGLET CARTE & GÉOLOCALISATION
// =============================================================================
export function TabCarte({ onOpen }) {
  const [data, setData] = useState({ prospects: [], pdvs: [] });
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const mapEl = useRef(null);
  const layersRef = useRef({});

  // Charger Leaflet (déjà installé selon l'app)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const L = (await import('leaflet')).default || (await import('leaflet'));
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        if (!mapRef.current && mapEl.current) {
          mapRef.current = L.map(mapEl.current).setView([12.6392, -8.0029], 12);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
          }).addTo(mapRef.current);
        }
        const [map, hm] = await Promise.all([
          prospectService.geoMap(),
          prospectService.geoHeatmap(),
        ]);
        if (!mounted) return;
        setData({ ...map, heatmap: hm });
        renderMarkers(L, map, hm, mapRef.current, layersRef.current);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function renderMarkers(L, m, hm, map, layers) {
    if (layers.prospects) layers.prospects.remove();
    if (layers.pdvs) layers.pdvs.remove();
    const colors = {
      NOUVELLE: '#94a3b8', EN_VISITE: '#0ea5e9', VALIDEE_DEV: '#10b981',
      REFUSEE_DEV: '#f97316', EN_ATTENTE_RC: '#eab308', APPROUVEE_RC: '#22c55e',
      REFUSEE_RC: '#ef4444', PUCE_ATTRIBUEE: '#6366f1', PUCE_ACTIVEE: '#16a34a',
      ANNULEE: '#6b7280',
    };
    const prospectGroup = L.layerGroup();
    m.prospects.forEach(p => {
      const c = colors[p.status] || '#94a3b8';
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 8, color: c, fillColor: c, fillOpacity: 0.7, weight: 2,
      }).bindPopup(`
        <b>${p.prenom} ${p.nom}</b><br/>
        ${p.reference}<br/>
        📞 ${p.telephone}<br/>
        ${p.quartier || ''} · ${STATUS_LABELS[p.status]?.label || p.status}
      `);
      marker.on('click', () => onOpen && onOpen({ id: p.id }));
      prospectGroup.addLayer(marker);
    });
    prospectGroup.addTo(map);
    layers.prospects = prospectGroup;

    const pdvGroup = L.layerGroup();
    m.pdvs.forEach(x => {
      L.circleMarker([x.lat, x.lng], {
        radius: 5, color: '#FF6900', fillColor: '#FF6900',
        fillOpacity: 0.4, weight: 1,
      }).bindPopup(`<b>PDV ${x.numero}</b><br/>${x.nom}<br/>${x.quartier || ''}`)
        .addTo(pdvGroup);
    });
    pdvGroup.addTo(map);
    layers.pdvs = pdvGroup;
  }

  const captureAndRoute = async () => {
    if (!navigator.geolocation) return alert("GPS non disponible");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await prospectService.geoRoute(pos.coords.latitude, pos.coords.longitude);
        setRoute(r);
        if (mapRef.current && r.steps?.length) {
          const L = (await import('leaflet')).default || (await import('leaflet'));
          if (layersRef.current.route) layersRef.current.route.remove();
          const points = [[pos.coords.latitude, pos.coords.longitude],
                          ...r.steps.map(s => [s.lat, s.lng])];
          const polyline = L.polyline(points, { color: '#FF6900', weight: 4, dashArray: '8 6' });
          polyline.addTo(mapRef.current);
          layersRef.current.route = polyline;
          mapRef.current.fitBounds(polyline.getBounds());
        }
      } catch (e) { alert('Erreur: ' + e.message); }
    });
  };

  return (
    <div>
      <div className="filters">
        <button className="btn-secondary" onClick={captureAndRoute}>🧭 Itinéraire optimisé (mes visites)</button>
        <button className="btn-secondary" onClick={() => setShowHeatmap(s => !s)}>
          {showHeatmap ? '🗺️ Carte normale' : '🔥 Heatmap'}
        </button>
        {route && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            🧭 {route.count} étapes · {route.total_distance_km} km · ~{route.estimated_duration_min} min
          </span>
        )}
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)', padding: 0 }}>
        <div ref={mapEl} style={{ width: '100%', height: 500, borderRadius: 'var(--radius)' }}/>
      </div>

      {loading && <div className="loading-state">Chargement de la carte…</div>}

      {data.prospects.length > 0 && (
        <div className="stats-grid" style={{ marginTop: 16 }}>
          <div className="stat-card"><div className="stat-label">Prospects géolocalisés</div><div className="stat-value">{data.prospects.length}</div></div>
          <div className="stat-card"><div className="stat-label">PDV référencés</div><div className="stat-value">{data.pdvs.length}</div></div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// 📊 ONGLET REPORTING & ANALYTICS
// =============================================================================
export function TabReporting() {
  const [funnel, setFunnel] = useState(null);
  const [perDev, setPerDev] = useState([]);
  const [perZone, setPerZone] = useState([]);
  const [pipeline, setPipeline] = useState(null);
  const [tta, setTTA] = useState(null);

  useEffect(() => {
    Promise.all([
      prospectService.repFunnel().then(setFunnel),
      prospectService.repPerDev().then(setPerDev),
      prospectService.repPerZone().then(setPerZone),
      prospectService.repPipeline().then(setPipeline),
      prospectService.repTTA().then(setTTA),
    ]).catch(e => console.error(e));
  }, []);

  if (!funnel) return <div className="loading-state">Calcul des indicateurs…</div>;

  return (
    <>
      {/* Funnel */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🌪️ Entonnoir de conversion</h3>
        {funnel.steps.map((s, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <b>{s.step}</b><span>{s.count} ({s.pct}%)</span>
            </div>
            <div style={{ height: 22, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${s.pct}%`, height: '100%',
                background: `linear-gradient(90deg, #FF6900, ${i === funnel.steps.length - 1 ? '#16a34a' : '#FF6900'})`,
              }}/>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
          🎯 Conversion globale : <b style={{ color: 'var(--success)' }}>{funnel.conversion_globale}%</b> · Refusés/annulés : {funnel.refusees_total}
        </div>
      </div>

      {/* Pipeline RC + TTA */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="modal-section" style={{ background: 'var(--bg-card)', margin: 0 }}>
          <h3>👔 Pipeline RC</h3>
          <div className="form-grid">
            <div><b>En attente RC</b>{pipeline?.demandes_en_attente_rc}</div>
            <div><b>Approuvées en attente</b>{pipeline?.approuvees_en_attente_attribution}</div>
            <div><b>En attente activation</b>{pipeline?.puces_attribuees_en_attente_activation}</div>
            <div><b>Puces dispo en stock</b>{pipeline?.puces_disponibles}</div>
          </div>
        </div>
        <div className="modal-section" style={{ background: 'var(--bg-card)', margin: 0 }}>
          <h3>⏱️ Time-to-Activation</h3>
          {tta && tta.count ? (
            <div className="form-grid">
              <div><b>Activées</b>{tta.count}</div>
              <div><b>Délai moyen</b>{tta.avg_hours} h ({tta.avg_days} j)</div>
              <div><b>Médian</b>{tta.median_hours} h</div>
              <div><b>Min — Max</b>{tta.min_hours} — {tta.max_hours} h</div>
            </div>
          ) : <div style={{ color: 'var(--text-muted)' }}>Aucune activation encore.</div>}
        </div>
      </div>

      {/* Performance développeurs */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>👥 Performance par développeur</h3>
        <div className="prospects-table">
          <table>
            <thead><tr><th>Développeur</th><th>Visites</th><th>Validées</th><th>Refusées</th><th>Activations</th><th>Taux validation</th><th>Délai visite (h)</th></tr></thead>
            <tbody>
              {perDev.map(d => (
                <tr key={d.user_id}>
                  <td><b>{d.nom} {d.prenom}</b></td>
                  <td>{d.n_assigned}</td>
                  <td style={{ color: 'var(--success)' }}>{d.n_validated}</td>
                  <td style={{ color: 'var(--danger)' }}>{d.n_rejected}</td>
                  <td><b>{d.n_activations}</b></td>
                  <td>{d.taux_validation}%</td>
                  <td>{d.delai_moyen_visite_h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Perf par zone */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🌍 Performance par quartier</h3>
        <div className="prospects-table">
          <table>
            <thead><tr><th>Quartier</th><th>Total prospects</th><th>Activées</th><th>Taux conversion</th></tr></thead>
            <tbody>
              {perZone.slice(0, 15).map(z => (
                <tr key={z.quartier}>
                  <td><b>{z.quartier}</b></td>
                  <td>{z.total}</td>
                  <td style={{ color: 'var(--success)' }}>{z.activees}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${z.taux_conversion}%`, height: '100%', background: 'var(--primary)' }}/>
                      </div>
                      <b style={{ minWidth: 40 }}>{z.taux_conversion}%</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// 📦 ONGLET STOCK DE PUCES
// =============================================================================
export function TabStock() {
  const [stats, setStats] = useState(null);
  const [list, setList] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const reload = () => {
    Promise.all([
      prospectService.stockStats().then(setStats),
      prospectService.stockList(filterStatus ? { status: filterStatus } : {}).then(setList),
    ]).catch(e => alert(e.message));
  };

  useEffect(() => { reload(); }, [filterStatus]);

  const COLORS = {
    DISPONIBLE: 'var(--success)', RESERVEE: 'var(--warning)',
    ACTIVEE: 'var(--text-muted)', DEFECTUEUSE: 'var(--danger)', PERDUE: 'var(--danger)',
  };

  return (
    <>
      {stats && (
        <>
          {stats.low_stock && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)',
              borderRadius: 'var(--radius)', padding: 12, marginBottom: 16,
              color: 'var(--danger)', fontWeight: 600,
            }}>
              ⚠ Alerte stock bas : seulement {stats.disponibles} puces disponibles (seuil: {stats.low_stock_threshold})
            </div>
          )}
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{stats.total}</div></div>
            <div className="stat-card ok"><div className="stat-label">Disponibles</div><div className="stat-value">{stats.disponibles}</div></div>
            <div className="stat-card warn"><div className="stat-label">Réservées</div><div className="stat-value">{stats.reservees}</div></div>
            <div className="stat-card"><div className="stat-label">Activées</div><div className="stat-value">{stats.activees}</div></div>
            <div className="stat-card" style={{ borderLeftColor: 'var(--danger)' }}>
              <div className="stat-label">Défectueuses</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.defectueuses + stats.perdues}</div>
            </div>
          </div>
        </>
      )}

      <div className="filters">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">— Tous —</option>
          <option value="DISPONIBLE">Disponibles</option>
          <option value="RESERVEE">Réservées</option>
          <option value="ACTIVEE">Activées</option>
          <option value="DEFECTUEUSE">Défectueuses</option>
          <option value="PERDUE">Perdues</option>
        </select>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Ajouter un lot</button>
      </div>

      <div className="prospects-table">
        <table>
          <thead><tr><th>N° Puce</th><th>Lot</th><th>Statut</th><th>Reçue le</th><th>Activée le</th></tr></thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id}>
                <td><b>{p.numero}</b></td>
                <td>{p.lot || '—'}</td>
                <td><span className="status-badge" style={{ background: COLORS[p.status] }}>{p.status}</span></td>
                <td>{p.received_at ? new Date(p.received_at).toLocaleDateString('fr-FR') : '—'}</td>
                <td>{p.activated_at ? new Date(p.activated_at).toLocaleDateString('fr-FR') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddLotModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }}/>}
    </>
  );
}

function AddLotModal({ onClose, onSaved }) {
  const [lotCode, setLotCode] = useState('');
  const [numbers, setNumbers] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await prospectService.stockCreateLot(lotCode, numbers);
      alert(`✅ ${r.created} puces ajoutées au lot ${r.lot}`);
      onSaved();
    } catch (err) { alert('Erreur: ' + (err.response?.data?.detail || err.message)); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h2>📦 Nouveau lot de puces</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="full">Code du lot
              <input value={lotCode} onChange={e => setLotCode(e.target.value)} required placeholder="LOT-2026-04"/>
            </label>
            <label className="full">Numéros (séparés par virgules ou retours ligne)
              <textarea value={numbers} onChange={e => setNumbers(e.target.value)} required
                style={{ minHeight: 120, fontFamily: 'monospace' }}
                placeholder="70123456, 70123457, 70123458..."/>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// 🎯 ONGLET SUIVI POST-ACTIVATION
// =============================================================================
export function TabPostActivation() {
  const [list, setList] = useState([]);
  const [dormant, setDormant] = useState([]);
  const [calib, setCalib] = useState(null);

  const reload = () => Promise.all([
    prospectService.postList().then(setList),
    prospectService.postDormant().then(setDormant),
    prospectService.postCalib().then(setCalib),
  ]);
  useEffect(() => { reload(); }, []);

  const generate = async (days) => {
    const r = await prospectService.postGenerate(days);
    alert(`✅ ${r.created} KPI générés pour ${days} jours.`);
    reload();
  };

  return (
    <>
      <div className="filters">
        <span style={{ color: 'var(--text-secondary)' }}>📅 Générer KPI :</span>
        <button className="btn-secondary" onClick={() => generate(30)}>30 jours</button>
        <button className="btn-secondary" onClick={() => generate(60)}>60 jours</button>
        <button className="btn-secondary" onClick={() => generate(90)}>90 jours</button>
      </div>

      {calib && (
        <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
          <h3>🤖 Calibrage IA — Prédictions vs Réel</h3>
          <div className="form-grid">
            <div><b>KPI mesurés</b>{calib.count}</div>
            <div><b>Écart moyen</b>{calib.avg_gap_pct}%</div>
            <div><b>Bien calibrés (±10%)</b>{calib.well_calibrated_count}</div>
            <div><b>Sur-estimation IA</b>{calib.over_estimation_count}</div>
            <div><b>Sous-estimation IA</b>{calib.under_estimation_count}</div>
          </div>
        </div>
      )}

      {dormant.length > 0 && (
        <div className="modal-section" style={{ background: 'var(--bg-card)', borderLeft: '3px solid var(--danger)' }}>
          <h3>😴 {dormant.length} puce(s) dormante(s) détectée(s)</h3>
          {dormant.map(d => (
            <div key={d.prospect_id} style={{
              padding: '8px 10px', background: 'rgba(239,68,68,0.06)',
              borderRadius: 6, marginBottom: 4,
            }}>
              <b>{d.nom}</b> · {d.reference} · puce {d.puce_numero} · {d.quartier}
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                CA réel {d.ca_reel?.toLocaleString('fr-FR')} F vs prédit {d.ca_predit?.toLocaleString('fr-FR')} F (sur {d.period_days}j)
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📊 Tous les KPI mesurés ({list.length})</h3>
        <div className="prospects-table">
          <table>
            <thead><tr><th>Prospect</th><th>Période</th><th>CA prédit</th><th>CA réel</th><th>Écart</th><th>Tx</th><th>Jours actifs</th><th>Satisfaction</th></tr></thead>
            <tbody>
              {list.slice(0, 50).map(k => (
                <tr key={k.id}>
                  <td><b>{k.prospect_nom}</b><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.prospect_ref}</div></td>
                  <td>{k.period_days}j</td>
                  <td>{k.ca_predit?.toLocaleString('fr-FR')} F</td>
                  <td>{k.ca_reel?.toLocaleString('fr-FR')} F</td>
                  <td style={{ color: k.ca_gap_pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>{k.ca_gap_pct}%</td>
                  <td>{k.nb_transactions}</td>
                  <td>{k.nb_jours_actifs}</td>
                  <td>{'⭐'.repeat(k.satisfaction_score || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// 🔔 ONGLET NOTIFICATIONS & COMMUNICATION
// =============================================================================
export function TabNotifications() {
  const [list, setList] = useState([]);
  const [stagnant, setStagnant] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [providers, setProviders] = useState(null);
  const [testForm, setTestForm] = useState({ channel: 'SMS', to: '', title: 'Test FaroukManager', message: 'Ceci est un message de test.' });
  const [testResult, setTestResult] = useState(null);

  const reload = () => Promise.all([
    prospectService.notifList(unreadOnly).then(setList),
    prospectService.notifStagnant(3).then(setStagnant),
    prospectService.notifProviders().then(setProviders).catch(() => {}),
  ]);
  useEffect(() => { reload(); }, [unreadOnly]);

  const markRead = async (id) => { await prospectService.notifRead(id); reload(); };
  const markAll = async () => { await prospectService.notifReadAll(); reload(); };
  const flush = async () => {
    const r = await prospectService.notifFlush();
    let msg = `📤 ${r.processed} traitée(s) — `;
    msg += `✅ ${r.sent} envoyée(s) · 🧪 ${r.simulated} simulée(s) · ❌ ${r.failed} échec(s)`;
    alert(msg); reload();
  };
  const reloadProviders = async () => {
    await prospectService.notifProvidersReload();
    const s = await prospectService.notifProviders(); setProviders(s);
    alert('✓ Configuration providers rechargée');
  };
  const sendTest = async () => {
    if (!testForm.to) return alert('Indiquez un destinataire');
    try {
      const r = await prospectService.notifTest(testForm);
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e.response?.data?.detail || e.message });
    }
  };

  return (
    <>
      {/* ── Configuration providers ──────────────────────────── */}
      {providers && (
        <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
          <h3>📡 Providers d'envoi (Twilio · WhatsApp · SMTP)</h3>
          {providers.dry_run_mode && (
            <div style={{ padding: 8, background: 'rgba(234,179,8,0.1)', borderRadius: 6, marginBottom: 10, color: 'var(--warning)', fontSize: 13 }}>
              ⚠ Mode DRY-RUN forcé : les messages sont simulés (pas d'envoi réel)
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {Object.entries(providers.providers).map(([ch, p]) => (
              <div key={ch} style={{
                padding: 12, borderRadius: 8,
                background: p.configured ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${p.configured ? 'var(--success)' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 14 }}>
                    {ch === 'SMS' ? '📱' : ch === 'WHATSAPP' ? '💬' : '✉️'} {ch}
                  </b>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 99,
                    background: p.configured ? 'var(--success)' : 'var(--text-muted)',
                    color: '#fff', fontWeight: 600,
                  }}>
                    {p.configured ? 'CONFIGURÉ' : 'NON CONFIGURÉ'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Provider actif : <b>{p.active_provider}</b>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            Pour activer les envois réels, configurez les variables dans le fichier <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 3 }}>backend/.env</code> :<br/>
            • <b>SMS</b> : <code>TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER</code><br/>
            • <b>WhatsApp</b> : <code>WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN</code> (Meta Cloud API)<br/>
            • <b>Email</b> : <code>SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM</code>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={reloadProviders}>🔄 Recharger config (.env)</button>
          </div>
        </div>
      )}

      {/* ── Test d'envoi ─────────────────────────────────────── */}
      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🧪 Tester l'envoi d'un message</h3>
        <div className="form-grid">
          <label>Canal
            <select value={testForm.channel} onChange={e => setTestForm({ ...testForm, channel: e.target.value })}>
              <option value="SMS">📱 SMS (Twilio)</option>
              <option value="WHATSAPP">💬 WhatsApp Cloud</option>
              <option value="EMAIL">✉️ Email (SMTP)</option>
            </select>
          </label>
          <label>Destinataire
            <input value={testForm.to} onChange={e => setTestForm({ ...testForm, to: e.target.value })}
              placeholder={testForm.channel === 'EMAIL' ? 'email@exemple.com' : '+22370123456 ou 70123456'}/>
          </label>
          <label className="full">Titre
            <input value={testForm.title} onChange={e => setTestForm({ ...testForm, title: e.target.value })}/>
          </label>
          <label className="full">Message
            <textarea value={testForm.message} onChange={e => setTestForm({ ...testForm, message: e.target.value })} style={{ minHeight: 60 }}/>
          </label>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn-primary" onClick={sendTest}>🧪 Envoyer un test</button>
        </div>
        {testResult && (
          <div style={{
            marginTop: 10, padding: 10, borderRadius: 6,
            background: testResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            borderLeft: `3px solid ${testResult.ok ? 'var(--success)' : 'var(--danger)'}`,
            fontSize: 13,
          }}>
            <b>{testResult.ok ? '✅ Succès' : '❌ Échec'}</b> — Provider : {testResult.provider} · Status : {testResult.status}
            {testResult.external_id && <div>ID externe : {testResult.external_id}</div>}
            {testResult.error && <div style={{ color: 'var(--danger)', marginTop: 4 }}>Erreur : {testResult.error}</div>}
          </div>
        )}
      </div>

      <div className="filters">
        <label><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)}/> Non lues uniquement</label>
        <button className="btn-secondary" onClick={markAll}>✓ Tout marquer comme lu</button>
        <button className="btn-secondary" onClick={flush}>📤 Envoyer les notifications en attente</button>
      </div>

      {stagnant.length > 0 && (
        <div className="modal-section" style={{ background: 'var(--bg-card)', borderLeft: '3px solid var(--warning)' }}>
          <h3>⏰ {stagnant.length} demande(s) stagnante(s) > 3 jours — rappels recommandés</h3>
          {stagnant.map(s => (
            <div key={s.id} style={{ padding: '6px 0', fontSize: 13 }}>
              <b>{s.reference}</b> · {s.nom} · état {s.status} · stagnant depuis <span style={{ color: 'var(--warning)' }}>{s.days_stagnant} jours</span>
            </div>
          ))}
        </div>
      )}

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🔔 Notifications ({list.length})</h3>
        {list.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune notification.</div>
        ) : list.map(n => (
          <div key={n.id} onClick={() => n.status !== 'READ' && markRead(n.id)} style={{
            padding: '10px 12px', background: n.status === 'READ' ? 'rgba(255,255,255,0.02)' : 'rgba(255,105,0,0.08)',
            borderLeft: `3px solid ${n.status === 'READ' ? 'var(--text-muted)' : 'var(--primary)'}`,
            borderRadius: 6, marginBottom: 6, cursor: n.status !== 'READ' ? 'pointer' : 'default',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <b>{n.title}</b>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleString('fr-FR')}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{n.message}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// =============================================================================
// 🏆 ONGLET GAMIFICATION
// =============================================================================
export function TabGamification() {
  const [board, setBoard] = useState([]);
  const [objectives, setObjectives] = useState([]);

  const reload = () => Promise.all([
    prospectService.gameLB().then(setBoard),
    prospectService.gameObjList().then(setObjectives),
  ]);
  useEffect(() => { reload(); }, []);

  const recompute = async () => { const r = await prospectService.gameCompute(); alert(`🏅 ${r.granted} badge(s) attribué(s)`); reload(); };

  return (
    <>
      <div className="filters">
        <button className="btn-primary" onClick={recompute}>🏅 Calculer les badges du mois</button>
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🏆 Classement des développeurs (mois en cours)</h3>
        {board.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>Aucun développeur actif.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {board.map(d => (
              <div key={d.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                borderLeft: `4px solid ${d.rank === 1 ? '#FFD700' : d.rank === 2 ? '#C0C0C0' : d.rank === 3 ? '#CD7F32' : 'var(--primary)'}`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, minWidth: 40, color: 'var(--primary)' }}>#{d.rank}</div>
                <div style={{ flex: 1 }}>
                  <b>{d.nom} {d.prenom}</b>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ✅ {d.n_validated} validations · ⚡ {d.n_activations} activations
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {d.badges.map(b => (
                    <span key={b.code} title={b.name} style={{ fontSize: 22 }}>{b.icon}</span>
                  ))}
                </div>
                <div style={{ minWidth: 60, textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>{d.score}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>points</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>🎯 Objectifs mensuels ({objectives.length})</h3>
        {objectives.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun objectif fixé. Utilisez l'API /gamification/objectives pour en créer.</div>
        ) : objectives.map(o => (
          <div key={o.id} style={{
            padding: 10, marginBottom: 8,
            background: o.bonus_earned ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
            borderRadius: 6,
            borderLeft: `3px solid ${o.bonus_earned ? 'var(--success)' : 'var(--primary)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{o.user_name}</b><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.period}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              Visites: {o.current_visits}/{o.target_visits} ·
              Validations: {o.current_validations}/{o.target_validations} ·
              Activations: {o.current_activations}/{o.target_activations}
            </div>
            <div style={{ marginTop: 6, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, o.progress_pct)}%`, height: '100%', background: o.bonus_earned ? 'var(--success)' : 'var(--primary)' }}/>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {o.progress_pct}% · Bonus : {o.bonus_amount.toLocaleString('fr-FR')} F {o.bonus_earned && '✅ Débloqué'}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// =============================================================================
// 🔐 ONGLET AUDIT & CONFORMITÉ
// =============================================================================
export function TabAudit() {
  const [search, setSearch] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => { prospectService.list({ limit: 200 }).then(setList); }, []);

  const filtered = search ? list.filter(p =>
    p.reference?.toLowerCase().includes(search.toLowerCase()) ||
    p.nom?.toLowerCase().includes(search.toLowerCase())
  ) : list;

  const exportXlsx = () => { window.open(prospectService.exportXlsxUrl(), '_blank'); };

  return (
    <>
      <div className="filters">
        <input placeholder="Rechercher par référence ou nom…" value={search} onChange={e => setSearch(e.target.value)}/>
        <button className="btn-primary" onClick={exportXlsx}>📥 Exporter Excel</button>
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>📜 Journal d'audit immuable ({filtered.length} prospects)</h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Cliquez sur un prospect dans la liste principale pour voir son historique complet (qui, quoi, quand).
        </div>
        <div className="prospects-table">
          <table>
            <thead><tr><th>Référence</th><th>Prospect</th><th>État</th><th>Soumis</th><th>Activé</th></tr></thead>
            <tbody>
              {filtered.slice(0, 50).map(p => (
                <tr key={p.id}>
                  <td><b>{p.reference}</b></td>
                  <td>{p.prenom} {p.nom}</td>
                  <td><span className="status-badge" style={{ background: STATUS_LABELS[p.status]?.color }}>{STATUS_LABELS[p.status]?.label}</span></td>
                  <td>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('fr-FR') : '—'}</td>
                  <td>{p.activated_at ? new Date(p.activated_at).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="modal-section" style={{ background: 'var(--bg-card)' }}>
        <h3>⚙️ Conformité — Pièces obligatoires</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          ✓ <b>CNI/NINA</b> obligatoire avant validation Dev<br/>
          ✓ <b>Photo façade ou intérieur du local</b> obligatoire avant validation<br/>
          ✓ <b>Géolocalisation GPS</b> obligatoire pour activation<br/>
          ✓ <b>Historique immuable</b> de toutes les transitions (qui/quoi/quand)<br/>
          <br/>
          Les pièces jointes peuvent être ajoutées depuis le détail d'un prospect.
        </div>
      </div>
    </>
  );
}
