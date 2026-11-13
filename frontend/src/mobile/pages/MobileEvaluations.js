import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { fmtN, fmtPct, fmtCourt, fmtDate, MOIS, nomComplet } from '../format';
import { Hero, Kpi, Bloc, Barres, Chargement, Erreur } from '../ui';

/* ── Utilitaires (simples fonctions, aucun hook) ──────────────────────────── */

const maintenant = new Date();
const MOIS_COURANT = { annee: maintenant.getFullYear(), mois: maintenant.getMonth() + 1 };

/** Décale une période (annee, mois) de `pas` mois. */
const decalerMois = (annee, mois, pas) => {
  let a = Number(annee) || MOIS_COURANT.annee;
  let m = (Number(mois) || 1) + pas;
  while (m < 1) { m += 12; a -= 1; }
  while (m > 12) { m -= 12; a += 1; }
  return { annee: a, mois: m };
};

const MOIS_PRECEDENT = decalerMois(MOIS_COURANT.annee, MOIS_COURANT.mois, -1);

/** Les 6 derniers mois (mois courant inclus), du plus récent au plus ancien. */
const SIX_MOIS = (() => {
  const liste = [];
  for (let i = 0; i < 6; i += 1) liste.push(decalerMois(MOIS_COURANT.annee, MOIS_COURANT.mois, -i));
  return liste;
})();

const libelleMois = (p) => (p && MOIS[p.mois] ? `${MOIS[p.mois].slice(0, 4)} ${p.annee}` : '—');

const memeMois = (a, b) => !!a && !!b && Number(a.annee) === Number(b.annee) && Number(a.mois) === Number(b.mois);

const normaliserNom = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');

/** « PRENOM NOM » et « NOM PRENOM » ont la même signature. */
const signatureNom = (v) => normaliserNom(v).split(' ').filter(Boolean).sort().join(' ');

/** Nom d'un superviseur : l'API renvoie une chaîne ou un objet selon la route. */
const nomDe = (x) => {
  if (typeof x === 'string') return x.trim();
  if (!x || typeof x !== 'object') return '';
  return String(x.superviseur || x.nom || x.name || x.supervisor || '').trim();
};

/** Liste utilisable quel que soit l'emballage de l'API ({items}, {data}, tableau…). */
const commeListe = (data, cles) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const essais = [...(cles || []), 'items', 'data', 'results', 'resultats'];
  for (const cle of essais) {
    if (Array.isArray(data[cle])) return data[cle];
  }
  return [];
};

/** Objet utilisable quel que soit l'emballage (tableau à un élément, {data}…). */
const commeObjet = (data) => {
  if (!data || typeof data !== 'object') return {};
  if (Array.isArray(data)) return (data[0] && typeof data[0] === 'object') ? data[0] : {};
  if (Array.isArray(data.items)) return (data.items[0] && typeof data.items[0] === 'object') ? data.items[0] : {};
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) return data.data;
  return data;
};

const nombreOuNull = (v) => {
  if (v == null || v === '' || isNaN(Number(v))) return null;
  return Number(v);
};

/** Historique brut → lignes propres, triées du plus ancien au plus récent. */
const lignesHistorique = (data) => commeListe(data, ['historique', 'mois', 'periodes'])
  .map(commeObjet)
  .map(h => ({
    annee: nombreOuNull(h.annee),
    mois: nombreOuNull(h.mois),
    score_final: nombreOuNull(h.score_final != null ? h.score_final : h.score),
    score_kpi: nombreOuNull(h.score_kpi),
    score_mystery: nombreOuNull(h.score_mystery),
    score_presentiel: nombreOuNull(h.score_presentiel),
    mention: h.mention || '',
  }))
  .filter(h => h.annee && h.mois && h.mois >= 1 && h.mois <= 12)
  .sort((a, b) => (a.annee * 12 + a.mois) - (b.annee * 12 + b.mois));

/** Nom sous lequel le compte connecté est évalué (les PDV stockent « PRENOM NOM »). */
const trouverMonNom = (noms, user) => {
  const complet = nomComplet(user);
  const exact = noms.find(n => normaliserNom(n) === normaliserNom(complet));
  if (exact) return exact;
  const memeSignature = noms.find(n => signatureNom(n) === signatureNom(complet));
  if (memeSignature) return memeSignature;
  return noms[0] || complet;
};

const STATUTS_EVAL = {
  EN_COURS: 'En cours',
  SCORE_CALCULE: 'Score calculé',
  TERMINEE: 'Terminée',
  VALIDEE: 'Validée',
};
const libelleStatutEval = (s) => STATUTS_EVAL[String(s || '').toUpperCase()] || '—';

/** Ligne « libellé / valeur » des blocs de détail. */
const Ligne = ({ label, valeur }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '7px 0', borderBottom: '1px solid var(--fm-border)',
  }}>
    <span style={{ fontSize: 12.5, color: 'var(--fm-muted)' }}>{label}</span>
    <b style={{ fontSize: 13, color: '#fff', textAlign: 'right' }}>{valeur}</b>
  </div>
);

/* ── Détail d'un superviseur (mois sélectionnable) ────────────────────────── */
/*  Écran partagé par les deux modes : le superviseur y voit ses propres mois,
    le gestionnaire y voit le superviseur qu'il vient de choisir.
    Tous les hooks sont déclarés en tête et appelés à chaque rendu : l'ordre
    est stable (aucun retour anticipé). */
function DetailEval({ superviseur, alternative }) {
  const [choix, setChoix] = useState(null);

  const { data: dataHist, isLoading: histEnCours, isError: histErreur } = useQuery(
    ['m-eval-historique', superviseur],
    () => api.get(`/eval-superviseurs/${encodeURIComponent(superviseur)}/historique`, { params: { nb_mois: 6 } }).then(r => r.data),
    { enabled: !!superviseur, staleTime: 120000 }
  );
  const lignesPrincipales = useMemo(() => lignesHistorique(dataHist), [dataHist]);

  // Les PDV stockent parfois « NOM PRENOM » : si aucune évaluation n'existe
  // sous le nom principal, on interroge l'autre variante (une seule requête
  // supplémentaire, et seulement dans ce cas).
  const altUtile = !!alternative && alternative !== superviseur;
  const { data: dataHistAlt, isLoading: histAltEnCours } = useQuery(
    ['m-eval-historique', alternative],
    () => api.get(`/eval-superviseurs/${encodeURIComponent(alternative)}/historique`, { params: { nb_mois: 6 } }).then(r => r.data),
    {
      enabled: altUtile && !histEnCours && !histErreur && lignesPrincipales.length === 0,
      staleTime: 120000,
    }
  );
  const lignesAlt = useMemo(() => lignesHistorique(dataHistAlt), [dataHistAlt]);

  const utiliseAlt = lignesPrincipales.length === 0 && lignesAlt.length > 0;
  const lignes = utiliseAlt ? lignesAlt : lignesPrincipales;
  const nomEffectif = utiliseAlt ? alternative : superviseur;

  // Si le mois affiché n'a pas d'évaluation, on retombe sur le dernier mois évalué.
  useEffect(() => {
    if (!lignes || lignes.length === 0) return;
    const dernier = lignes[lignes.length - 1];
    setChoix(prev => {
      const courant = prev || SIX_MOIS[0];
      const dispo = lignes.some(l => memeMois(l, courant));
      return dispo ? courant : { annee: dernier.annee, mois: dernier.mois };
    });
  }, [lignes]);

  const periode = choix || SIX_MOIS[0];
  const ligneMois = lignes.find(l => memeMois(l, periode)) || null;
  const moisEvalue = !!ligneMois;

  // Fiche d'évaluation enregistrée (statut + date) : 404 = simple absence, pas une erreur.
  const { data: fiche } = useQuery(
    ['m-eval-fiche', nomEffectif, periode.annee, periode.mois],
    () => api.get(`/eval-superviseurs/${encodeURIComponent(nomEffectif)}`, { params: { annee: periode.annee, mois: periode.mois } })
      .then(r => r.data).catch(() => null),
    { enabled: !!nomEffectif && moisEvalue, staleTime: 120000 }
  );

  const { data: dataKpis, isLoading: kpiEnCours, isError: kpiErreur } = useQuery(
    ['m-eval-kpis', nomEffectif, periode.annee, periode.mois],
    () => api.get(`/eval-superviseurs/kpis/${encodeURIComponent(nomEffectif)}`, { params: { annee: periode.annee, mois: periode.mois } }).then(r => r.data),
    { enabled: !!nomEffectif && moisEvalue, staleTime: 120000 }
  );
  const kpis = useMemo(() => {
    const direct = commeObjet(dataKpis);
    if (Object.keys(direct).length > 0) return direct;
    return commeObjet(fiche ? fiche.kpis_data : null);
  }, [dataKpis, fiche]);

  const { data: dataClassement } = useQuery(
    ['m-eval-classement', periode.annee, periode.mois],
    () => api.get('/eval-superviseurs/classement/tous', { params: { annee: periode.annee, mois: periode.mois } }).then(r => r.data),
    { enabled: moisEvalue, staleTime: 120000 }
  );
  const monRang = useMemo(() => {
    const liste = commeListe(dataClassement, ['classement', 'items', 'resultats']);
    const trouve = liste.find(x => signatureNom(nomDe(x)) === signatureNom(nomEffectif));
    return trouve ? nombreOuNull(trouve.rang) : null;
  }, [dataClassement, nomEffectif]);

  const scoresKpi = (kpis && kpis.scores_kpi && typeof kpis.scores_kpi === 'object') ? kpis.scores_kpi : {};
  const taux = [
    { label: 'Actif OMY', valeur: nombreOuNull(kpis.taux_actif_omy) },
    { label: 'Actif KM (KAABU)', valeur: nombreOuNull(kpis.taux_actif_km) },
    { label: 'Actif NAFAMA', valeur: nombreOuNull(kpis.taux_actif_nafama) },
  ];
  const criteres = [
    ['nb_pdv', 'Nombre de PDV'],
    ['ca_omy', 'CA OMY'],
    ['commission_omy', 'Commission OMY'],
    ['taux_actif_omy', 'Actif OMY'],
    ['taux_actif_km', 'Actif KM'],
    ['taux_actif_nafama', 'Actif NAFAMA'],
    ['ca_nafama', 'CA NAFAMA'],
  ].map(([cle, label]) => ({ label, valeur: nombreOuNull(scoresKpi[cle]) }));
  const aDesKpis = Object.keys(kpis || {}).length > 0;

  return (
    <div>
      <div className="m-chips">
        {SIX_MOIS.map(p => {
          const dispo = lignes.some(l => memeMois(l, p));
          const actif = memeMois(p, periode);
          return (
            <button key={`${p.annee}-${p.mois}`} type="button"
              className={'m-chip' + (actif ? ' active' : '')}
              style={{ opacity: dispo ? 1 : 0.5 }}
              onClick={() => setChoix(p)}>
              {libelleMois(p)}
            </button>
          );
        })}
      </div>

      {(histEnCours || histAltEnCours) && <Chargement />}
      {histErreur && <Erreur />}
      {!histEnCours && !histAltEnCours && !histErreur && !moisEvalue && (
        <div className="m-empty">Aucune évaluation pour cette période.</div>
      )}

      {ligneMois && (
        <>
          <div className="m-kpi-grid" style={{ marginBottom: 12 }}>
            <Kpi icone="🏆" label="Score global" valeur={fmtN(ligneMois.score_final, 1)}
              sub={ligneMois.mention || '—'} couleur="#FF6900" />
            <Kpi icone="🎯" label="Score KPI" valeur={fmtPct(ligneMois.score_kpi)}
              sub="Moyenne des KPI" couleur="#22c55e" />
            <Kpi icone="📞" label="Appels TC" valeur={fmtPct(ligneMois.score_mystery)}
              sub="Mystery calls" couleur="#4a9eff" />
            <Kpi icone="🧭" label="Présentiel" valeur={fmtPct(ligneMois.score_presentiel)}
              sub="Notes terrain" couleur="#7c5cff" />
          </div>

          <Bloc titre={`Évaluation ${libelleMois(periode)}`} sousTitre={nomEffectif || '—'}>
            <Ligne label="Rang" valeur={monRang ? fmtN(monRang) : '—'} />
            <Ligne label="Mention" valeur={ligneMois.mention || '—'} />
            <Ligne label="Statut" valeur={libelleStatutEval(fiche ? fiche.statut : null)} />
            <Ligne label="Dernière mise à jour" valeur={fmtDate(fiche ? fiche.updated_at : null)} />
          </Bloc>

          {kpiEnCours && <Chargement />}
          {kpiErreur && <Erreur />}
          {!kpiEnCours && !kpiErreur && !aDesKpis && (
            <div className="m-empty">Aucun KPI détaillé pour cette période.</div>
          )}
          {!kpiEnCours && !kpiErreur && aDesKpis && (
            <>
              <Bloc titre="Taux d'activité" sousTitre={libelleMois(periode)}>
                <Barres donnees={taux} format={fmtPct} maximum={3} couleur="#22c55e" />
              </Bloc>
              <Bloc titre="Volumes & commissions" sousTitre="Valeurs du mois">
                <Ligne label="PDV suivis" valeur={fmtN(kpis.nb_pdv)} />
                <Ligne label="CA OMY" valeur={fmtCourt(kpis.ca_omy)} />
                <Ligne label="Commission OMY" valeur={fmtCourt(kpis.commission_omy)} />
                <Ligne label="CA NAFAMA" valeur={fmtCourt(kpis.ca_nafama)} />
                <Ligne label="PDV actifs KAABU" valeur={fmtN(kpis.nb_actifs_km)} />
              </Bloc>
              <Bloc titre="Objectifs atteints" sousTitre="Score par critère KPI">
                <Barres donnees={criteres} format={fmtPct} maximum={7} couleur="#FF6900" />
              </Bloc>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Écran « Évaluations » ────────────────────────────────────────────────── */

export default function MobileEvaluations() {
  const user = useAuthStore(s => s.user);
  const role = String((user && user.role) || '').toLowerCase().replace('userrole.', '');
  // Seul le superviseur consulte « ses » évaluations ; gestionnaire et
  // encadrement (admin/manager/rc/conformité) consultent leurs superviseurs.
  const estSuperviseur = role === 'superviseur';

  const [recherche, setRecherche] = useState('');
  const [supChoisi, setSupChoisi] = useState(null);

  // Liste des superviseurs déjà restreinte côté serveur (périmètre du rôle).
  const { data: dataNoms, isLoading: nomsEnCours, isError: nomsErreur } = useQuery(
    ['m-eval-superviseurs'],
    () => api.get('/eval-superviseurs/superviseurs').then(r => r.data),
    { staleTime: 300000 }
  );
  const noms = useMemo(() => {
    const brut = commeListe(dataNoms, ['superviseurs', 'noms', 'items']);
    const vus = new Set();
    const liste = [];
    brut.forEach(x => {
      const nom = nomDe(x);
      const cle = normaliserNom(nom);
      if (nom && !vus.has(cle)) { vus.add(cle); liste.push(nom); }
    });
    return liste.sort((a, b) => a.localeCompare(b, 'fr'));
  }, [dataNoms]);

  const monNom = estSuperviseur ? trouverMonNom(noms, user) : '';
  const attenteDeMonNom = estSuperviseur && nomsEnCours && noms.length === 0;

  // Classement du mois courant puis du mois précédent : les scores ne sont
  // calculés qu'après la clôture, on affiche donc le mois le plus récent rempli.
  const { data: dataClassCourant } = useQuery(
    ['m-eval-classement', MOIS_COURANT.annee, MOIS_COURANT.mois],
    () => api.get('/eval-superviseurs/classement/tous', { params: MOIS_COURANT }).then(r => r.data),
    { enabled: !estSuperviseur, staleTime: 120000 }
  );
  const { data: dataClassPrecedent } = useQuery(
    ['m-eval-classement', MOIS_PRECEDENT.annee, MOIS_PRECEDENT.mois],
    () => api.get('/eval-superviseurs/classement/tous', { params: MOIS_PRECEDENT }).then(r => r.data),
    { enabled: !estSuperviseur, staleTime: 120000 }
  );

  const classement = useMemo(() => {
    const courante = commeListe(dataClassCourant, ['classement', 'items', 'resultats']);
    if (courante.length > 0) return { liste: courante, periode: MOIS_COURANT };
    const precedente = commeListe(dataClassPrecedent, ['classement', 'items', 'resultats']);
    if (precedente.length > 0) return { liste: precedente, periode: MOIS_PRECEDENT };
    return { liste: [], periode: MOIS_COURANT };
  }, [dataClassCourant, dataClassPrecedent]);

  const lignesListe = useMemo(() => {
    // Regroupement par « signature » de nom : « PRENOM NOM » et « NOM PRENOM »
    // désignent la même personne et ne doivent pas apparaître deux fois.
    const parSignature = new Map();
    const ajouter = (nom, infos) => {
      const cle = signatureNom(nom);
      if (!cle) return;
      const existant = parSignature.get(cle);
      parSignature.set(cle, {
        nom: (existant && existant.nom) || nom,
        score: existant && existant.score != null ? existant.score : infos.score,
        rang: existant && existant.rang != null ? existant.rang : infos.rang,
        mention: (existant && existant.mention) || infos.mention,
        score_kpi: existant && existant.score_kpi != null ? existant.score_kpi : infos.score_kpi,
        score_mystery: existant && existant.score_mystery != null ? existant.score_mystery : infos.score_mystery,
      });
    };
    // D'abord le classement (il porte le score et le rang), puis les noms seuls.
    classement.liste.forEach(x => {
      const nom = nomDe(x);
      if (!nom) return;
      ajouter(nom, {
        score: nombreOuNull(x.score_final != null ? x.score_final : x.score),
        rang: nombreOuNull(x.rang),
        mention: x.mention || '',
        score_kpi: nombreOuNull(x.score_kpi),
        score_mystery: nombreOuNull(x.score_mystery),
      });
    });
    noms.forEach(n => ajouter(n, {
      score: null, rang: null, mention: '', score_kpi: null, score_mystery: null,
    }));
    const liste = Array.from(parSignature.values());
    liste.sort((a, b) => {
      if (a.rang != null && b.rang != null) return a.rang - b.rang;
      if (a.rang != null) return -1;
      if (b.rang != null) return 1;
      return String(a.nom).localeCompare(String(b.nom), 'fr');
    });
    return liste;
  }, [noms, classement]);

  const lignesFiltrees = useMemo(() => {
    const q = normaliserNom(recherche);
    if (!q) return lignesListe;
    return lignesListe.filter(l => normaliserNom(l.nom).indexOf(q) !== -1);
  }, [lignesListe, recherche]);

  const aUnClassement = classement.liste.length > 0;
  const sousTitreHero = estSuperviseur
    ? (monNom || undefined)
    : (aUnClassement ? `Classement ${libelleMois(classement.periode)}` : 'Mes superviseurs');

  // Autre orthographe connue du même nom (les évaluations peuvent être
  // enregistrées sous « NOM PRENOM »).
  const alternativeDe = (nom) => {
    if (!nom) return '';
    const sig = signatureNom(nom);
    return noms.find(n => normaliserNom(n) !== normaliserNom(nom) && signatureNom(n) === sig) || '';
  };

  return (
    <div>
      <Hero titre="Évaluations" role={estSuperviseur ? 'Mes évaluations' : 'Mes superviseurs'}
        sousTitre={sousTitreHero} />

      {estSuperviseur && attenteDeMonNom && <Chargement />}
      {estSuperviseur && !attenteDeMonNom && (
        <DetailEval key={monNom || 'moi'} superviseur={monNom} alternative={alternativeDe(monNom)} />
      )}

      {!estSuperviseur && supChoisi && (
        <>
          <button className="m-back" type="button" onClick={() => setSupChoisi(null)}>‹ Retour</button>
          <div className="m-item-title" style={{ fontSize: 16, marginBottom: 10 }}>{supChoisi}</div>
          <DetailEval key={supChoisi} superviseur={supChoisi} alternative={alternativeDe(supChoisi)} />
        </>
      )}

      {!estSuperviseur && !supChoisi && (
        <>
          {nomsEnCours && <Chargement />}
          {nomsErreur && <Erreur />}

          {!nomsEnCours && !nomsErreur && (
            <div className="m-search" style={{ marginBottom: 12 }}>
              <span>🔎</span>
              <input value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Rechercher un superviseur…" inputMode="search" aria-label="Rechercher un superviseur" />
              {recherche && (
                <button className="m-chip" type="button" style={{ padding: '4px 9px' }}
                  onClick={() => setRecherche('')}>✕</button>
              )}
            </div>
          )}

          {!nomsEnCours && !nomsErreur && lignesFiltrees.length === 0 && (
            <div className="m-empty">
              {recherche
                ? "Aucun superviseur ne correspond à cette recherche."
                : "Aucun superviseur dans votre périmètre."}
            </div>
          )}

          {!nomsEnCours && !nomsErreur && lignesFiltrees.map(l => (
            <button key={l.nom} type="button" className="m-item"
              onClick={() => setSupChoisi(l.nom)}
              style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
              <div className="m-item-top">
                <div className="m-item-title">{l.nom}</div>
                {l.rang != null && <span className="m-badge blue">Rang {fmtN(l.rang)}</span>}
              </div>
              <div className="m-item-metrics">
                <div>Score global<b>{fmtN(l.score, 1)}</b></div>
                <div>Score KPI<b>{fmtPct(l.score_kpi)}</b></div>
                <div>Appels TC<b>{fmtPct(l.score_mystery)}</b></div>
              </div>
              {l.mention && <div className="m-item-sub" style={{ marginTop: 6 }}>{l.mention}</div>}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
