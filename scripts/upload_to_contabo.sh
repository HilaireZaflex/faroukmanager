#!/bin/bash
# ============================================================
# Script d'upload FaroukManager vers Contabo
# ============================================================

SERVER_IP="5.189.177.139"

echo "======================================"
echo "  Déploiement FaroukManager - Contabo"
echo "======================================"
echo ""
echo "Quel est l'utilisateur SSH ?"
echo "  (appuie sur Entrée pour 'root')"
read -p "Utilisateur [root]: " SSH_USER
SSH_USER="${SSH_USER:-root}"

echo ""
echo "🔗 Connexion à $SSH_USER@$SERVER_IP..."
echo ""

# Test connexion d'abord
ssh -o ConnectTimeout=10 -o BatchMode=no $SSH_USER@$SERVER_IP "mkdir -p /tmp/faroukmanager/backend /tmp/faroukmanager/frontend && echo '✅ Connexion OK !'" 2>/dev/null

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Connexion échouée. Vérifie l'utilisateur et le mot de passe."
  exit 1
fi

# Créer archive du backend
echo "📦 Préparation du backend..."
cd /Users/nms/FaroukManager
tar --exclude='backend/venv' \
    --exclude='backend/__pycache__' \
    --exclude='backend/*.db' \
    --exclude='backend/.env' \
    --exclude='backend/*.pyc' \
    -czf /tmp/farouk_backend.tar.gz backend/

echo "📦 Préparation du frontend..."
tar --exclude='frontend/node_modules' \
    --exclude='frontend/build' \
    -czf /tmp/farouk_frontend.tar.gz frontend/

# Upload
echo "⬆️  Upload backend..."
scp /tmp/farouk_backend.tar.gz $SSH_USER@$SERVER_IP:/tmp/

echo "⬆️  Upload frontend..."
scp /tmp/farouk_frontend.tar.gz $SSH_USER@$SERVER_IP:/tmp/

echo "⬆️  Upload script déploiement..."
scp /Users/nms/FaroukManager/scripts/deploy_contabo.sh $SSH_USER@$SERVER_IP:/tmp/deploy_farouk.sh

# Extraire sur le serveur
echo "📂 Extraction des fichiers sur le serveur..."
ssh $SSH_USER@$SERVER_IP "
  cd /tmp/faroukmanager
  tar -xzf /tmp/farouk_backend.tar.gz
  tar -xzf /tmp/farouk_frontend.tar.gz
  echo '✅ Extraction terminée'
"

echo ""
echo "======================================"
echo "✅ Upload terminé avec succès !"
echo "======================================"
echo ""
echo "Maintenant connecte-toi au serveur :"
echo "  ssh $SSH_USER@$SERVER_IP"
echo ""
echo "Puis lance le déploiement :"
echo "  bash /tmp/deploy_farouk.sh"
echo ""
