#!/bin/bash
echo '🚀 Démarrage FaroukManager Frontend...'
cd /Users/nms/FaroukManager/frontend
if [ ! -d node_modules ]; then
  echo '📦 Installation des dépendances npm...'
  npm install
fi
echo '▶️  Lancement de l application React...'
npm start
