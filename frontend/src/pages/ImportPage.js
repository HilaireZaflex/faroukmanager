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
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => downloadTemplate(templateType)}
          style={{ flexShrink: 0 }}
        >
          <Download size={13}/> Template
        </button>
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

      {/* Section 2 : Données Mensuelles */}
      <ImportSection
        icon={Calendar}
        title="📅 Import Performances Mensuelles"
        description="Importez les données de performance mensuelle : CA, nombre d'opérations, dépôts, retraits par PDV pour un mois donné. Colonnes requises: numero_pdv, annee, mois, ca, nb_operations, nb_depots, montant_depots, nb_retraits, montant_retraits, est_actif."
        endpoint="/performance/monthly"
        label="Données Mensuelles"
        templateType="mensuel"
        color="#3742fa"
        queryClient={queryClient}
      />

      {/* Section 3 : Données Hebdomadaires */}
      <ImportSection
        icon={CalendarDays}
        title="📆 Import Performances Hebdomadaires"
        description="Importez les données de performance hebdomadaire : CA, opérations, dépôts, retraits par PDV pour une semaine donnée (numéro de semaine ISO). Colonnes requises: numero_pdv, annee, semaine, ca, nb_operations, nb_depots, montant_depots, nb_retraits, montant_retraits, est_actif."
        endpoint="/performance/weekly"
        label="Données Hebdomadaires"
        templateType="hebdo"
        color="#00d68f"
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
            {[
              ['numero_pdv *', 'Référence du PDV'],
              ['annee *', 'Année (ex: 2025)'],
              ['mois *', 'Mois 1-12'],
              ['ca *', 'Chiffre d\'affaires (FCFA)'],
              ['nb_operations', 'Nombre total d\'opérations'],
              ['nb_depots', 'Nombre de dépôts'],
              ['montant_depots', 'Montant total dépôts (FCFA)'],
              ['nb_retraits', 'Nombre de retraits'],
              ['montant_retraits', 'Montant total retraits (FCFA)'],
              ['est_actif', 'true / false (actif ce mois)'],
            ].map(([col, desc]) => (
              <div key={col} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <code style={{ fontSize: 10, background: 'rgba(55,66,250,0.1)', color: '#3742fa', padding: '2px 6px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start' }}>{col}</code>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</span>
              </div>
            ))}
          </div>
          {/* Weekly columns */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#00d68f', marginBottom: 10, textTransform: 'uppercase' }}>📆 Performance Hebdomadaire</h4>
            {[
              ['numero_pdv *', 'Référence du PDV'],
              ['annee *', 'Année (ex: 2025)'],
              ['semaine *', 'Semaine ISO 1-52'],
              ['ca *', 'Chiffre d\'affaires (FCFA)'],
              ['nb_operations', 'Nombre total d\'opérations'],
              ['nb_depots', 'Nombre de dépôts'],
              ['montant_depots', 'Montant total dépôts (FCFA)'],
              ['nb_retraits', 'Nombre de retraits'],
              ['montant_retraits', 'Montant total retraits (FCFA)'],
              ['est_actif', 'true / false (actif cette semaine)'],
            ].map(([col, desc]) => (
              <div key={col} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <code style={{ fontSize: 10, background: 'rgba(0,214,143,0.1)', color: '#00d68f', padding: '2px 6px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start' }}>{col}</code>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
