#!/usr/bin/env bash
set -euo pipefail

# ==============================
# FaroukManager - Lancement LOCAL (Frontend uniquement)
# Le backend tourne sur Railway → https://faroukmanager-backend-production-feb9.up.railway.app
# Ce script lance UNIQUEMENT le frontend React qui pointe sur Railway
# ==============================

# Colors
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; BLUE=''; NC=''
fi

PROJECT_ROOT="${PROJECT_ROOT:-/Users/nms/FaroukManager}"
if [ ! -d "$PROJECT_ROOT" ]; then
  PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}") /.." && pwd)"
fi

FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   FaroukManager - Démarrage Local      ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✅ Backend (Railway) : https://faroukmanager-backend-production-feb9.up.railway.app${NC}"
echo -e "${GREEN}✅ Les VRAIES données sont utilisées (Railway)${NC}"
echo ""

# Vérifier Node/npm
command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ Node.js non trouvé${NC}"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo -e "${RED}❌ npm non trouvé${NC}"; exit 1; }
echo -e "${GREEN}✅ Node: $(node -v) | npm: $(npm -v)${NC}"

# Arrêter le frontend précédent si existant
if [ -f "$LOG_DIR/frontend.pid" ]; then
  pid="$(cat "$LOG_DIR/frontend.pid" 2>/dev/null || true)"
  if [ -n "${pid:-}" ] && ps -p "$pid" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Arrêt du frontend précédent (PID=$pid)...${NC}"
    kill "$pid" || true; sleep 1
  fi
  rm -f "$LOG_DIR/frontend.pid"
fi

# Installer les dépendances npm si besoin
cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
  echo -e "${YELLOW}➕ Installation des dépendances npm...${NC}"
  npm install
fi

# Vérifier que .env.development pointe bien sur Railway
CURRENT_API=$(grep "REACT_APP_API_BASE_URL" "$FRONTEND_DIR/.env.development" | cut -d'=' -f2)
if echo "$CURRENT_API" | grep -q "localhost"; then
  echo -e "${RED}⚠️  ATTENTION: .env.development pointe sur localhost ! Correction...${NC}"
  sed -i '' 's|REACT_APP_API_BASE_URL=http://localhost:8000/api|REACT_APP_API_BASE_URL=https://faroukmanager-backend-production-feb9.up.railway.app/api|g' "$FRONTEND_DIR/.env.development"
fi

echo -e "${BLUE}▶️  Lancement du frontend React...${NC}"
export BROWSER=none
nohup npm start > "$LOG_DIR/frontend.log" 2>&1 &
FRONT_PID=$!
echo $FRONT_PID > "$LOG_DIR/frontend.pid"
echo -e "${GREEN}✅ Frontend PID: ${FRONT_PID} (logs: $LOG_DIR/frontend.log)${NC}"

# Attendre que le frontend soit prêt
printf "${BLUE}⏳ Démarrage en cours${NC}"
for i in {1..30}; do
  printf "."; sleep 1
  if grep -q "You can now view\|Compiled successfully\|webpack compiled" "$LOG_DIR/frontend.log" 2>/dev/null; then
    break
  fi
done
printf "\n"

echo ""
echo -e "${GREEN}🎉 FaroukManager est prêt !${NC}"
echo ""
echo -e "  🌐 Ouvrez votre navigateur : ${BLUE}http://localhost:3000${NC}"
echo -e "  🔗 Backend (Railway)        : ${BLUE}https://faroukmanager-backend-production-feb9.up.railway.app${NC}"
echo -e "  📋 API Docs                 : ${BLUE}https://faroukmanager-backend-production-feb9.up.railway.app/docs${NC}"
echo ""
echo -e "  📁 Logs frontend : $LOG_DIR/frontend.log"
echo ""
echo -e "  Pour arrêter : ${YELLOW}kill \$(cat $LOG_DIR/frontend.pid)${NC}"
echo ""
