#!/bin/bash
echo '🚀 Démarrage FaroukManager Backend...'
cd /Users/nms/FaroukManager/backend
if [ ! -f farouk_manager.db ]; then
  echo '📦 Initialisation de la base de données...'
  venv/bin/python3 -c "from app.core.database import Base, engine; import app.models; Base.metadata.create_all(bind=engine); print('✅ DB créée')"
fi
echo '🌱 Chargement des données de démonstration...'
venv/bin/python3 ../scripts/seed_data.py
echo '▶️  Lancement du serveur API...'
venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
