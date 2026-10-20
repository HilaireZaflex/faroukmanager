const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BUILD = path.join(__dirname, 'build');

app.use(express.static(BUILD, { index: false }));

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilité des anciens bundles — CORRECTIF CRITIQUE (20/10/2026)
//
// Chaque déploiement change le nom des fichiers (main.XXXXXXXX.js). Un navigateur
// ou un service worker qui a conservé l'index.html d'un déploiement précédent
// réclame l'ancien fichier. Avant ce correctif, la route « SPA » plus bas lui
// renvoyait index.html — donc du HTML à la place du JavaScript. Le navigateur
// refusait de l'exécuter et l'application restait blanche : plus aucun accès au
// formulaire de connexion. On sert maintenant la version actuelle du fichier.
// ─────────────────────────────────────────────────────────────────────────────
function fichierDeRemplacement(dossier, nomDemande) {
  try {
    const absolu = path.join(BUILD, dossier || '');
    const fichiers = fs.readdirSync(absolu);
    const extension = path.extname(nomDemande);
    const prefixe = nomDemande.split('.')[0] + '.';
    const candidats = fichiers
      .filter(f => f.startsWith(prefixe) && f.endsWith(extension))
      .sort();
    if (candidats.length === 0) return null;
    return path.join(absolu, candidats[candidats.length - 1]);
  } catch (e) {
    return null;
  }
}

app.use('/static', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const cheminReel = path.join(BUILD, 'static', req.path);
  if (fs.existsSync(cheminReel)) return next();  // fichier présent : comportement normal

  const nomDemande = path.basename(req.path);
  const dossierRelatif = path.join('static', path.dirname(req.path));
  const remplacant = fichierDeRemplacement(dossierRelatif, nomDemande);

  if (remplacant) {
    console.log(`⚠️  Ancien bundle demandé (${nomDemande}) → ${path.basename(remplacant)} servi`);
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(remplacant);
  }
  return res.status(404).type('text/plain').send('Fichier introuvable');
});

app.get('/{*path}', (req, res) => {
  // Ne JAMAIS renvoyer du HTML pour un fichier manifestement statique :
  // le navigateur tenterait de l'exécuter et la page resterait blanche.
  if (path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Fichier introuvable');
  }
  res.sendFile(path.join(BUILD, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
});
