#!/bin/bash
# ============================================================
# Script de déploiement FaroukManager sur Contabo VPS
# Usage: bash deploy_contabo.sh
# ============================================================

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Déploiement FaroukManager sur Contabo VPS${NC}"

# ── 1. Mise à jour système ────────────────────────────────────
echo -e "${YELLOW}[1/8] Mise à jour du système...${NC}"
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Installer Python, Node, Nginx ─────────────────────────
echo -e "${YELLOW}[2/8] Installation des dépendances...${NC}"
apt-get install -y python3 python3-pip python3-venv nodejs npm nginx git curl -qq

# ── 3. Créer dossier app ──────────────────────────────────────
echo -e "${YELLOW}[3/8] Création du dossier de l'application...${NC}"
mkdir -p /var/www/faroukmanager
cd /var/www/faroukmanager

# ── 4. Copier les fichiers (depuis le dossier courant) ────────
echo -e "${YELLOW}[4/8] Copie des fichiers...${NC}"
cp -r /tmp/faroukmanager/backend ./backend
cp -r /tmp/faroukmanager/frontend ./frontend

# ── 5. Backend FastAPI ────────────────────────────────────────
echo -e "${YELLOW}[5/8] Configuration du backend...${NC}"
cd /var/www/faroukmanager/backend

# Environnement virtuel Python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -q
pip install gunicorn -q

# Fichier .env production
cat > .env << 'EOF'
DATABASE_URL=sqlite:///./farouk_manager.db
SECRET_KEY=FaroukManager2026SecretKeyProduction!
DEBUG=false
ALLOWED_ORIGINS=["http://5.189.177.139","http://5.189.177.139:3000","http://localhost:3000"]
ADMIN_EMAIL=admin@faroukmanager.com
ADMIN_PASSWORD=Admin2026!
ADMIN_NAME=Administrateur
EOF

# Initialiser la base de données
python3 -c "
from app.core.database import engine, Base
Base.metadata.create_all(bind=engine)
print('Base de données initialisée')
" 2>/dev/null || true

# Créer le compte admin
python3 -c "
import sys
sys.path.insert(0, '.')
from app.core.database import get_db
from app.core.security import get_password_hash
from sqlalchemy import text
try:
    db = next(get_db())
    db.execute(text(\"INSERT OR IGNORE INTO users (email, hashed_password, name, role) VALUES ('admin@faroukmanager.com', :h, 'Administrateur', 'ADMIN')\"), {'h': get_password_hash('Admin2026!')})
    db.commit()
    print('Admin créé')
except Exception as e:
    print('Admin déjà existant:', e)
" 2>/dev/null || true

deactivate

# ── 6. Service systemd pour le backend ───────────────────────
echo -e "${YELLOW}[6/8] Création du service backend...${NC}"
cat > /etc/systemd/system/faroukmanager-backend.service << 'EOF'
[Unit]
Description=FaroukManager Backend API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/faroukmanager/backend
Environment="PATH=/var/www/faroukmanager/backend/venv/bin"
ExecStart=/var/www/faroukmanager/backend/venv/bin/gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable faroukmanager-backend
systemctl start faroukmanager-backend

# ── 7. Build du frontend React ────────────────────────────────
echo -e "${YELLOW}[7/8] Build du frontend React...${NC}"
cd /var/www/faroukmanager/frontend

# Créer .env.production
cat > .env.production << 'EOF'
REACT_APP_API_BASE_URL=http://5.189.177.139/api
EOF

npm install -q
npm run build

# ── 8. Configuration Nginx ────────────────────────────────────
echo -e "${YELLOW}[8/8] Configuration Nginx...${NC}"
cat > /etc/nginx/sites-available/faroukmanager << 'EOF'
server {
    listen 8080;
    server_name 5.189.177.139;

    # Frontend React
    root /var/www/faroukmanager/frontend/build;
    index index.html;

    # Gestion du routing React (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy vers le backend FastAPI
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # Swagger docs
    location /docs {
        proxy_pass http://127.0.0.1:8000/docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/faroukmanager /etc/nginx/sites-enabled/faroukmanager
nginx -t && systemctl reload nginx

echo ""
echo -e "${GREEN}✅ Déploiement terminé !${NC}"
echo -e "${GREEN}🌐 Application : http://5.189.177.139:8080${NC}"
echo -e "${GREEN}📚 API Docs    : http://5.189.177.139:8080/docs${NC}"
echo -e "${GREEN}🔐 Login       : admin@faroukmanager.com / Admin2026!${NC}"
