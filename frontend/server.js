const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const BUILD = path.join(__dirname, 'build');

// ─────────────────────────────────────────────────────────────────────────────
// PROXY API — CORRECTIF DU 20/10/2026
//
// Le backend vit sur *.up.railway.app. Certains réseaux d'entreprise / FAI ne
// savent pas résoudre ce domaine (ERR_NAME_NOT_RESOLVED), alors que le domaine
// du site fonctionne. Résultat : la page se chargeait, mais tous les appels API
// échouaient — et l'écran de connexion affichait « identifiants incorrects ».
//
// On expose donc l'API sur le MÊME domaine que le site (/api/...). Le navigateur
// ne contacte plus que faroukdistribution.com : plus de dépendance DNS à
// railway.app, et plus de CORS.
//
// Cible surchargeable par la variable API_PROXY_TARGET.
// ─────────────────────────────────────────────────────────────────────────────
const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ||
  'https://faroukmanager-backend-production-feb9.up.railway.app').replace(/\/+$/, '');

const cibleApi = new URL(API_PROXY_TARGET);
const transportApi = cibleApi.protocol === 'https:' ? https : http;
const portApi = cibleApi.port || (cibleApi.protocol === 'https:' ? 443 : 80);

function proxyVersApi(prefixe) {
  return (req, res) => {
    // req.url vaut « / » quand on appelle exactement le chemin monté : sans ce
    // test, /health devenait /health/ et Starlette répondait par une redirection 307.
    const chemin = prefixe + (req.url === '/' ? '' : req.url);

    // On ne transmet pas les en-têtes de proxy d'origine : ils perturbent l'edge
    // Railway (un x-forwarded-proto: http déclenche une redirection 307) et
    // permettraient de falsifier l'IP cliente.
    const entetes = { ...req.headers };
    ['host', 'connection', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-for', 'forwarded']
      .forEach(nom => delete entetes[nom]);
    entetes.host = cibleApi.host;
    entetes['x-forwarded-proto'] = cibleApi.protocol.replace(':', '');

    const requete = transportApi.request({
      protocol: cibleApi.protocol,
      hostname: cibleApi.hostname,
      port: portApi,
      path: chemin,
      method: req.method,
      headers: entetes,
    }, (reponse) => {
      res.writeHead(reponse.statusCode || 502, reponse.headers);
      reponse.pipe(res);
    });

    requete.on('error', (erreur) => {
      console.error(`❌ Proxy API ${req.method} ${chemin} : ${erreur.message}`);
      if (!res.headersSent) {
        res.status(502).type('application/json').send(JSON.stringify({
          detail: "Le serveur de l'application est momentanément injoignable. Réessayez dans un instant.",
        }));
      } else {
        res.end();
      }
    });

    req.pipe(requete);
  };
}

app.use('/api', proxyVersApi('/api'));
app.use('/health', proxyVersApi('/health'));

app.use(express.static(BUILD, { index: false }));

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilité des anciens bundles
//
// Chaque déploiement change le nom des fichiers (main.XXXXXXXX.js). Un navigateur
// ou un service worker qui a conservé l'index.html d'un déploiement précédent
// réclame l'ancien fichier. Sans ce bloc, la route « SPA » plus bas lui renvoyait
// index.html — donc du HTML à la place du JavaScript : page blanche, connexion
// impossible. On sert maintenant la version actuelle du fichier.
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

const serveur = app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`↪️  API exposée sur /api (proxy vers ${API_PROXY_TARGET})`);
});

// Les imports Excel peuvent être longs : on ne coupe pas les requêtes.
serveur.requestTimeout = 0;
serveur.headersTimeout = 0;
