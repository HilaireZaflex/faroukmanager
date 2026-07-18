import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { Upload, FileSpreadsheet, Calendar, CalendarDays, Store, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import toast from 'react-hot-toast';

// ─── Template generators ───────────────────────────────────────────────────
function downloadTemplate(type) {
  let headers, sampleRow, sheetName, filename;

  if (type === 'pdv') {
    headers = ['numero_pdv','nom','type_pdv','zone','sous_zone','quartier','superviseur','teleconseillere','telephone','nom_gerant','numero_personnel','statut'];
    sampleRow = ['PDV2001','Exemple Boutique','RS','Bamako Centre','Zone 1','Hippodrome','Farouk Diallo','Aminata Coulibaly','+22376543210','Mamadou Keita','12345','ACTIF'];
    sheetName = 'Points de Vente';
    filename = 'template_pdvs.xlsx';
  } else if (type === 'mensuel') {
    headers = ['numero_pdv','annee','mois','ca','nb_operations','nb_depots','montant_depots','nb_retraits','montant_retraits','est_actif'];
    sampleRow = ['PDV001',2025,12,850000,145,80,1200000,65,900000,true];
    sheetName = 'Données Mensuelles';
    filename = 'template_mensuel.xlsx';
  } else {
    headers = ['numero_pdv','annee','semaine','ca','nb_operations','nb_depots','montant_depots','nb_retraits','montant_retraits','est_actif'];
    sampleRow = ['PDV001',2025,52,210000,36,20,300000,16,225000,true];
    sheetName = 'Données Hebdomadaires';
    filename = 'template_hebdomadaire.xlsx';
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  // Style header row
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
  toast.success(`Template "${filename}" téléchargé !`);
}

// ─── Upload Zone Component ─────────────────────────────────────────────────
function UploadZone({ onFile, accept = '.xlsx,.xls,.csv' }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${drag ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '40px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        background: drag ? 'rgba(255,105,0,0.04)' : 'rgba(255,255,255,0.02)',
        transition: 'var(--transition)',
      }}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display:'none' }}
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value=''; }} />
      <Upload size={36} style={{ color: drag ? 'var(--primary)' : 'var(--text-secondary)', marginBottom: 12 }} />
      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
        {drag ? 'Déposez le fichier ici' : 'Glissez-déposez votre fichier ici'}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        ou <span style={{ color: 'var(--primary)', fontWeight: 600 }}>parcourir</span> · Formats: XLSX, XLS, CSV
      </p>
    </div>
  );
}

// ─── Result Card ───────────────────────────────────────────────────────────
function ResultCard({ result, label }) {
  if (!result) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginTop: 16 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📊 Résultat de l'import — {label}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <div style={{ textAlign: 'center', padding: 14, background: 'rgba(0,214,143,0.08)', borderRadius: 10, border: '1px solid rgba(0,214,143,0.2)' }}>
          <CheckCircle size={20} style={{ color: 'var(--success)', marginBottom: 6 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{result.created ?? result.imported ?? 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Créés/Ajoutés</div>
        </div>
        <div style={{ textAlign: 'center', padding: 14, background: 'rgba(255,165,2,0.08)', borderRadius: 10, border: '1px solid rgba(255,165,2,0.2)' }}>
          <AlertCircle size={20} style={{ color: 'var(--warning)', marginBottom: 6 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{result.updated ?? 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Mis à jour</div>
        </div>
        <div style={{ textAlign: 'center', padding: 14, background: 'rgba(255,71,87,0.08)', borderRadius: 10, border: '1px solid rgba(255,71,87,0.2)' }}>
          <XCircle size={20} style={{ color: 'var(--danger)', marginBottom: 6 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)' }}>{result.errors?.length ?? result.errors ?? 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Erreurs</div>
        </div>
      </div>
      {result.message && (
        <div style={{ padding: '10px 14px', background: 'rgba(0,214,143,0.06)', borderRadius: 8, fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
          ✅ {result.message}
        </div>
      )}
      {Array.isArray(result.errors) && result.errors.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>Erreurs détectées :</p>
          <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.errors.slice(0, 20).map((e, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 8px', background: 'rgba(255,71,87,0.06)', borderRadius: 6 }}>
                {typeof e === 'string' ? e : JSON.stringify(e)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Import Section ────────────────────────────────────────────────────────
function ImportSection({ icon: Icon, title, description, endpoint, label, templateType, color = 'var(--primary)', queryClient }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  const mutation = useMutation(async (f) => {
    const formData = new FormData();
    formData.append('file', f);
    const response = await api.post(endpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }, {
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Import "${label}" réussi ! ${data.created ?? data.imported ?? 0} lignes traitées.`);
      // Invalider les caches liés
      queryClient.invalidateQueries('pdvs');
      queryClient.invalidateQueries('pdv-stats');
      queryClient.invalidateQueries('dashboard');
      queryClient.invalidateQueries('analytics');
    },
    onError: (err) => {
      toast.error(err?.detail || `Erreur lors de l'import "${label}"`);
    }
  });

  const handleFile = (f) => {
    setFile(f);
    setResult(null);
  };

  const handleImport = () => {
    if (!file) { toast.error('Veuillez sélectionner un fichier'); return; }
    mutation.mutate(file);
  };

  return (
    <div className="card mb-16">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} style={{ color }} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</p>
        </div>
        {templateType && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadTemplate(templateType)}
            style={{ flexShrink: 0 }}
          >
            <Download size={13}/> Template
          </button>
        )}
      </div>

      <UploadZone onFile={handleFile} />

      {file && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSpreadsheet size={18} style={{ color: 'var(--success)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{(file.size / 1024).toFixed(1)} Ko</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFile(null); setResult(null); }}>Annuler</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleImport}
              disabled={mutation.isLoading}
              style={{ background: color, borderColor: color }}
            >
              {mutation.isLoading ? '⏳ Import en cours...' : `✅ Importer ${label}`}
            </button>
          </div>
        </div>
      )}

      <ResultCard result={result} label={label} />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
// ─── Import EXPORT Orange Component ───────────────────────────────────────
function ImportExportOrange({ queryClient }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('mensuel');
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [semaine, setSemaine] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  const submit = async () => {
    if (!file) return toast.error('Sélectionnez un fichier EXPORT Orange');
    setLoading(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode);
      fd.append('annee', annee);
      if (mode === 'mensuel') fd.append('mois', mois);
      else if (semaine) fd.append('semaine', semaine);
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await api.post('/performance/import-export-orange', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      queryClient?.invalidateQueries();
      toast.success(`Import terminé ! ${res.data.created} créés, ${res.data.updated} mis à jour`);
    } catch (err) {
      toast.error('Erreur : ' + (err.response?.data?.detail || err.message));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,105,0,0.25)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>📊</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Import direct fichier EXPORT Orange</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Structure attendue : Numero revendeur · Grade · Service · Nombre transaction · Montant transaction · Transaction CA · Commission PDG · Commission revendeur · Date transaction
          </div>
        </div>
      </div>

      {/* Info colonnes */}
      <div style={{ background: 'rgba(255,105,0,0.06)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        ✅ <b>Calculé automatiquement :</b><br/>
        &nbsp;&nbsp;• <b>Montant Transaction</b> = Dépôts (CASHIN) + Retraits (CASHOUT)<br/>
        &nbsp;&nbsp;• <b>Montant CA</b> = Somme "Transaction CA" (base des commissions Orange)<br/>
        &nbsp;&nbsp;• <b>Commission PDG</b> = Somme "Commission PDG" (votre part réseau)<br/>
        &nbsp;&nbsp;• <b>Commission Revendeur</b> = Somme "Commission revendeur" (part des PDV)<br/>
        &nbsp;&nbsp;• <b>Ratio CA/Transaction</b> = Montant CA / Montant Transaction × 100
      </div>

      {/* Contrôles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 12 }}>
          <div style={{ marginBottom: 4, color: 'var(--text-muted)' }}>Mode *</div>
          <select value={mode} onChange={e => setMode(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
            <option value="mensuel">📅 Mensuel</option>
            <option value="hebdo">📆 Hebdomadaire</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          <div style={{ marginBottom: 4, color: 'var(--text-muted)' }}>Année *</div>
          <input type="number" value={annee} onChange={e => setAnnee(parseInt(e.target.value))} min={2020} max={2030}
            style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}/>
        </label>
        {mode === 'mensuel' ? (
          <label style={{ fontSize: 12 }}>
            <div style={{ marginBottom: 4, color: 'var(--text-muted)' }}>Mois *</div>
            <select value={mois} onChange={e => setMois(parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}>
              {MOIS_NOMS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </label>
        ) : (
          <label style={{ fontSize: 12 }}>
            <div style={{ marginBottom: 4, color: 'var(--text-muted)' }}>Semaine (optionnel)</div>
            <input type="number" value={semaine} onChange={e => setSemaine(e.target.value)} min={1} max={52} placeholder="Toutes"
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }}/>
          </label>
        )}
        <label style={{ fontSize: 12 }}>
          <div style={{ marginBottom: 4, color: 'var(--text-muted)' }}>Fichier EXPORT *</div>
          <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files[0])}
            style={{ width: '100%', padding: '6px 0', fontSize: 12, color: 'var(--text-primary)' }}/>
        </label>
      </div>

      {file && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          📎 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} Mo)
        </div>
      )}

      <button onClick={submit} disabled={loading || !file}
        style={{ padding: '10px 20px', background: loading ? 'var(--text-muted)' : '#FF6900', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
        {loading ? '⏳ Import en cours…' : '🚀 Importer le fichier EXPORT Orange'}
      </button>

      {result && (
        <div style={{ marginTop: 16, padding: 14, background: result.created + result.updated > 0 ? 'rgba(0,214,143,0.08)' : 'rgba(255,71,87,0.08)', borderRadius: 8, borderLeft: `3px solid ${result.created + result.updated > 0 ? 'var(--success)' : 'var(--danger)'}` }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {result.created + result.updated > 0 ? '✅ Import terminé !' : '⚠️ Import terminé avec avertissements'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12 }}>
            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#00d68f' }}>{result.created}</div>
              <div style={{ color: 'var(--text-muted)' }}>Créés</div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ffa502' }}>{result.updated}</div>
              <div style={{ color: 'var(--text-muted)' }}>Mis à jour</div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#3742fa' }}>{result.pdv_periodes_traitees}</div>
              <div style={{ color: 'var(--text-muted)' }}>PDV × Périodes</div>
            </div>
            <div style={{ textAlign: 'center', padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: result.pdv_non_trouves > 0 ? '#ff4757' : '#00d68f' }}>{result.pdv_non_trouves}</div>
              <div style={{ color: 'var(--text-muted)' }}>PDV non trouvés</div>
            </div>
          </div>
          {result.pdv_non_trouves > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#ff4757' }}>
              ⚠️ PDV non trouvés en base : {result.exemples_non_trouves.join(', ')}{result.pdv_non_trouves > 10 ? '...' : ''}
              <br/>💡 Assurez-vous d'importer d'abord la liste des PDVs avec leurs vrais numéros Orange.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  const queryClient = useQueryClient();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📥 Import de Données</h1>
          <p className="page-subtitle">Importez vos données PDVs, performances mensuelles et hebdomadaires</p>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{ background: 'rgba(255,105,0,0.06)', border: '1px solid rgba(255,105,0,0.2)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Comment importer vos données ?</p>
          <ol style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
            <li>Téléchargez le template correspondant (bouton <strong>Template</strong>)</li>
            <li>Remplissez le fichier Excel avec vos données</li>
            <li>Glissez-déposez le fichier rempli dans la zone prévue</li>
            <li>Cliquez sur le bouton <strong>Importer</strong> et attendez la confirmation</li>
          </ol>
        </div>
      </div>

      {/* Section 0 : Exclusions Récupération */}
      <div style={{ margin: '0 0 16px', borderBottom: '1px solid rgba(255,71,87,0.3)', paddingBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#ff4757' }}>⚙️ Exclusions Automatiques Récupération</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Importez le fichier <strong>A EXCLURE.xlsx</strong> pour exclure automatiquement les PDVs
          (Activation &lt; 1 mois et Nouvelles Attributions) de la liste à récupérer.
        </p>
      </div>
      <ImportSection
        icon={Store}
        title="🚫 Import PDVs à Exclure (A EXCLURE.xlsx)"
        description="Importez le fichier A EXCLURE.xlsx : colonne gauche = Activation < 1 mois, colonne droite = Nouvelles Attributions. Ces PDVs seront automatiquement exclus de la liste de récupération."
        endpoint="/pdvs/import-exclusions"
        label="Exclusions"
        templateType={null}
        color="#ff4757"
        queryClient={queryClient}
      />

      {/* Section 1 : PDVs */}
      <ImportSection
        icon={Store}
        title="📌 Import Points de Vente (PDVs)"
        description="Importez la liste complète des points de vente : numéro PDV, nom, type, zone, sous-zone, superviseur, téléconseillère, téléphone, gérant. Les PDVs existants (par numéro) seront mis à jour, les nouveaux seront créés."
        endpoint="/pdvs/import"
        label="PDVs"
        templateType="pdv"
        color="var(--primary)"
        queryClient={queryClient}
      />

      {/* ── OMY ─────────────────────────────────────────────────────────────── */}
      <div style={{ margin: '32px 0 16px', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#FF6900' }}>🟠 Données OMY</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Performances mensuelles et hebdomadaires de l'indicateur OMY</p>
      </div>

      {/* Section 2 : Données Mensuelles */}
      <ImportSection
        icon={Calendar}
        title="📅 Import Performances Mensuelles OMY"
        description="Importez votre fichier OMY mensuel directement — la feuille SOURCE est détectée automatiquement. Colonnes acceptées : PDV, Année, Mois, CA, NBRE OPERATIONS, Nbre dépôt, Montant Dépôt, Nbre Retrait, Montant Retrait."
        endpoint="/performance/monthly"
        label="Données Mensuelles"
        templateType="mensuel"
        color="#3742fa"
        queryClient={queryClient}
      />

      {/* Section 3 : Données Hebdomadaires */}
      <ImportSection
        icon={CalendarDays}
        title="📆 Import Performances Hebdomadaires OMY"
        description="Importez votre fichier OMY hebdomadaire directement — la feuille SOURCE est détectée automatiquement. Colonnes acceptées : PDV, Année, Semaine (ex: S14), CA, NBRE OPERATIONS, Nbre dépôt, Montant Dépôt, Nbre Retrait, Montant Retrait."
        endpoint="/performance/weekly"
        label="Données Hebdomadaires"
        templateType="hebdo"
        color="#00d68f"
        queryClient={queryClient}
      />

      {/* ── EXPORT ORANGE ────────────────────────────────────────────────────── */}
      <div style={{ margin: '32px 0 16px', borderBottom: '1px solid rgba(255,105,0,0.4)', paddingBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#FF6900' }}>🟠 Import EXPORT Orange (Fichier Direct)</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Importez directement le fichier <b>EXPORT_XXXXXXXXX.xlsx</b> exporté depuis la plateforme Orange Mali.
          Calcule automatiquement : Montant Transaction, Montant CA, Commission PDG, Commission Revendeur, Ratio CA/Transaction.
        </p>
      </div>
      <ImportExportOrange queryClient={queryClient} />

      {/* ── NAFAMA ─────────────────────────────────────────────────────────── */}
      <div style={{ margin: '32px 0 16px', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#00d68f' }}>🟢 Données NAFAMA</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Performances spécifiques à l'indicateur NAFAMA</p>
      </div>

      <ImportSection
        icon={Calendar}
        title="📅 Import NAFAMA — Mensuel"
        description="Importez les performances mensuelles NAFAMA. Colonnes requises: numero_pdv, annee, mois, ca, nb_operations, est_actif. L'indicateur NAFAMA sera automatiquement assigné."
        endpoint="/performance/monthly?indicateur=NAFAMA"
        label="NAFAMA Mensuel"
        templateType="mensuel"
        color="#00d68f"
        queryClient={queryClient}
      />

      <ImportSection
        icon={CalendarDays}
        title="📆 Import NAFAMA — Hebdomadaire"
        description="Importez les performances hebdomadaires NAFAMA. Colonnes requises: numero_pdv, annee, semaine, ca, nb_operations, est_actif."
        endpoint="/performance/weekly?indicateur=NAFAMA"
        label="NAFAMA Hebdomadaire"
        templateType="hebdo"
        color="#00d68f"
        queryClient={queryClient}
      />

      {/* ── KAABU ──────────────────────────────────────────────────────────── */}
      <div style={{ margin: '32px 0 16px', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#a29bfe' }}>🟣 Données KAABU</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Performances spécifiques à l'indicateur KAABU</p>
      </div>

      <ImportSection
        icon={Calendar}
        title="📅 Import KAABU — Mensuel"
        description="Importez les performances mensuelles KAABU. Colonnes requises: numero_pdv, annee, mois, ca, nb_operations, est_actif. L'indicateur KAABU sera automatiquement assigné."
        endpoint="/performance/monthly?indicateur=KAABU"
        label="KAABU Mensuel"
        templateType="mensuel"
        color="#a29bfe"
        queryClient={queryClient}
      />

      <ImportSection
        icon={CalendarDays}
        title="📆 Import KAABU — Hebdomadaire"
        description="Importez les performances hebdomadaires KAABU. Colonnes requises: numero_pdv, annee, semaine, ca, nb_operations, est_actif."
        endpoint="/performance/weekly?indicateur=KAABU"
        label="KAABU Hebdomadaire"
        templateType="hebdo"
        color="#a29bfe"
        queryClient={queryClient}
      />

      {/* Aide colonnes */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📋 Guide des colonnes</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {/* PDV columns */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase' }}>🏪 Fiche PDV</h4>
            {[
              ['numero_pdv *', 'Identifiant unique (ex: PDV001)'],
              ['nom *', 'Nom du point de vente'],
              ['type_pdv', 'RS / RSF / RNS / KIOSQUE'],
              ['zone *', 'Zone géographique'],
              ['sous_zone', 'Sous-zone ou quartier'],
              ['superviseur', 'Nom du superviseur'],
              ['teleconseillere', 'Nom de la téléconseillère'],
              ['telephone', 'Numéro de téléphone'],
              ['nom_gerant', 'Nom du gérant'],
              ['statut', 'ACTIF / INACTIF / RECUPERATION'],
            ].map(([col, desc]) => (
              <div key={col} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <code style={{ fontSize: 10, background: 'rgba(255,105,0,0.1)', color: 'var(--primary)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start' }}>{col}</code>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</span>
              </div>
            ))}
          </div>
          {/* Monthly columns */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#3742fa', marginBottom: 10, textTransform: 'uppercase' }}>📅 Performance Mensuelle</h4>
            <p style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 8 }}>✅ Format natif OMY accepté</p>
            {[
              ['PDV *', 'Numéro du PDV'],
              ['Année *', 'Année (ex: 2026)'],
              ['Mois *', 'Mois 1-12 ou nom (Janvier...)'],
              ['CA *', 'Chiffre d\'affaires (FCFA)'],
              ['NBRE OPERATIONS', 'Nombre total d\'opérations'],
              ['Nbre dépôt', 'Nombre de dépôts'],
              ['Montant Dépôt', 'Montant total dépôts (FCFA)'],
              ['Nbre Retrait', 'Nombre de retraits'],
              ['Montant Retrait', 'Montant total retraits (FCFA)'],
            ].map(([col, desc]) => (
              <div key={col} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <code style={{ fontSize: 10, background: 'rgba(55,66,250,0.1)', color: '#3742fa', padding: '2px 6px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start' }}>{col}</code>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</span>
              </div>
            ))}
            <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic' }}>💡 Feuille "SOURCE" détectée automatiquement</p>
          </div>
          {/* Weekly columns */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#00d68f', marginBottom: 10, textTransform: 'uppercase' }}>📆 Performance Hebdomadaire</h4>
            <p style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 8 }}>✅ Format natif OMY accepté</p>
            {[
              ['PDV *', 'Numéro du PDV'],
              ['Année *', 'Année (ex: 2026)'],
              ['Semaine *', 'S6, S14... ou numéro 1-52'],
              ['CA *', 'Chiffre d\'affaires (FCFA)'],
              ['NBRE OPERATIONS', 'Nombre total d\'opérations'],
              ['Nbre dépôt', 'Nombre de dépôts'],
              ['Montant Dépôt', 'Montant total dépôts (FCFA)'],
              ['Nbre Retrait', 'Nombre de retraits'],
              ['Montant Retrait', 'Montant total retraits (FCFA)'],
            ].map(([col, desc]) => (
              <div key={col} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <code style={{ fontSize: 10, background: 'rgba(0,214,143,0.1)', color: '#00d68f', padding: '2px 6px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start' }}>{col}</code>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</span>
              </div>
            ))}
            <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic' }}>💡 Feuille "SOURCE" détectée automatiquement</p>
          </div>
        </div>
      </div>
    </div>
  );
}
