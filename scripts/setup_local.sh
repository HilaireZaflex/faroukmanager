#!/usr/bin/env bash
set -euo pipefail

# ==============================
# FaroukManager - Setup & Launch (macOS)
# - Creates Python venv and installs backend deps
# - Installs frontend deps
# - Seeds demo data
# - Launches backend (uvicorn) and frontend (react-scripts) in background
# - Saves logs and PIDs under logs/
# ==============================

# Colors
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; BLUE=''; NC=''
fi

# Determine project root (prefer explicit path, fallback to script location)
PROJECT_ROOT="${PROJECT_ROOT:-/Users/nms/FaroukManager}"
if [ ! -d "$PROJECT_ROOT" ]; then
  PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  echo -e "${YELLOW}PROJECT_ROOT not found at /Users/nms/FaroukManager; using: $PROJECT_ROOT${NC}"
fi

BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# Helpers
need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo -e "${RED}❌ Missing command: $1${NC}"; return 1; }; }
maybe_kill_pid() { local pid_file="$1"; if [ -f "$pid_file" ]; then
  local pid; pid="$(cat "$pid_file" 2>/dev/null || true)"; if [ -n "${pid:-}" ] && ps -p "$pid" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Stopping existing process PID=$pid from $pid_file${NC}"; kill "$pid" || true; sleep 1
  fi; rm -f "$pid_file"; fi }

# 0) Pre-flight checks
echo -e "${BLUE}🔍 Pre-flight checks...${NC}"
need_cmd python3
need_cmd node
need_cmd npm
need_cmd bash

PY_VER="$(python3 -c 'import sys; print("%d.%d"%sys.version_info[:2])')" || PY_VER="unknown"
NODE_VER="$(node -v || true)"
NPM_VER="$(npm -v || true)"
echo -e "${GREEN}✅ Python: ${PY_VER}${NC}"
echo -e "${GREEN}✅ Node: ${NODE_VER}${NC}"
echo -e "${GREEN}✅ npm: ${NPM_VER}${NC}"

# 1) Backend setup
echo -e "${BLUE}📦 Backend setup...${NC}"
cd "$BACKEND_DIR"
if [ ! -d venv ]; then
  echo -e "${YELLOW}➕ Creating Python venv...${NC}"
  python3 -m venv venv
fi
source venv/bin/activate
python -m pip install --upgrade pip wheel setuptools
pip install -r requirements.txt

# 1b) Initialize DB if needed
if [ ! -f "$BACKEND_DIR/farouk_manager.db" ]; then
  echo -e "${YELLOW}🗃️  Initializing SQLite database...${NC}"
  python - <<'PY'
from app.core.database import Base, engine
import app.models  # noqa: F401
Base.metadata.create_all(bind=engine)
print('✅ DB created')
PY
fi

# 1c) Seed demo data (idempotent)
echo -e "${BLUE}🌱 Seeding demo data...${NC}"
python "$SCRIPTS_DIR/seed_data.py" || echo -e "${YELLOW}⚠️  Seeding encountered an issue; continuing...${NC}"

deactivate || true

# Stop previous instances if any
maybe_kill_pid "$LOG_DIR/backend.pid"
maybe_kill_pid "$LOG_DIR/frontend.pid"

# 2) Launch backend (background)
echo -e "${BLUE}▶️  Launching backend (uvicorn)...${NC}"
cd "$BACKEND_DIR"
nohup venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"
BACK_PID=$(cat "$LOG_DIR/backend.pid")
echo -e "${GREEN}✅ Backend PID: ${BACK_PID} (logs: $LOG_DIR/backend.log)${NC}"

# 3) Frontend setup
echo -e "${BLUE}📦 Frontend setup...${NC}"
cd "$FRONTEND_DIR"
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    echo -e "${YELLOW}⚠️  .env.example not found; creating minimal .env...${NC}"
    echo "REACT_APP_API_BASE_URL=http://localhost:8000/api" > .env
    echo "REACT_APP_ENV=development" >> .env
  fi
fi
if [ ! -d node_modules ]; then
  echo -e "${YELLOW}➕ Installing npm dependencies...${NC}"
  npm install
fi

# 4) Launch frontend (background)
echo -e "${BLUE}▶️  Launching frontend (react-scripts)...${NC}"
# Prevent auto-opening browser
export BROWSER=none
nohup npm start > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"
FRONT_PID=$(cat "$LOG_DIR/frontend.pid")
echo -e "${GREEN}✅ Frontend PID: ${FRONT_PID} (logs: $LOG_DIR/frontend.log)${NC}"

# 5) Health checks (best-effort)
printf "${BLUE}⏳ Waiting for services to become ready${NC}"
for i in {1..30}; do
  printf "."; sleep 1
  if curl -fsS http://localhost:8000/ >/dev/null 2>&1; then break; fi
done
printf "\n"
if curl -fsS http://localhost:8000/ >/dev/null 2>&1; then
  echo -e "${GREEN}✅ Backend ready at http://localhost:8000 (docs: /docs)${NC}"
else
  echo -e "${YELLOW}⚠️  Backend not responding yet; check $LOG_DIR/backend.log${NC}"
fi

# Note: CRA dev server readiness is harder to probe without /health; rely on logs
if grep -q "You can now view" "$LOG_DIR/frontend.log" 2>/dev/null; then
  echo -e "${GREEN}✅ Frontend ready at http://localhost:3000${NC}"
else
  echo -e "${YELLOW}ℹ️  Frontend starting; watch $LOG_DIR/frontend.log for readiness${NC}"
fi

cat <<OUTRO

${GREEN}🎉 FaroukManager is setting up / running!${NC}

Open:
- Frontend:  http://localhost:3000
- Backend:   http://localhost:8000
- API Docs:  http://localhost:8000/docs

Manage processes:
- Backend PID file:   $LOG_DIR/backend.pid
- Frontend PID file:  $LOG_DIR/frontend.pid
- Logs directory:     $LOG_DIR/

To stop both services:
  if [ -f "$LOG_DIR/backend.pid" ]; then kill \"$(cat \"$LOG_DIR/backend.pid\")\" 2>/dev/null || true; fi
  if [ -f "$LOG_DIR/frontend.pid" ]; then kill \"$(cat \"$LOG_DIR/frontend.pid\")\" 2>/dev/null || true; fi

OUTRO
