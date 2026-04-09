# 🚀 FaroukManager

**Système de Gestion Intelligent du Réseau PDV Orange Mali**

FaroukManager est une plateforme complète de gestion, d'analyse et d'optimisation du réseau de points de vente (PDV) d'Orange Mali. Elle combine une gestion opérationnelle avancée avec des capacités d'intelligence artificielle pour la prédiction, l'analyse et l'optimisation de la performance du réseau.

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Architecture](#architecture)
- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Credentials par défaut](#credentials-par-défaut)
- [Modules et Services](#modules-et-services)
- [API Documentation](#api-documentation)

## 🎯 Vue d'ensemble

FaroukManager fournit aux équipes de direction d'Orange Mali une visibilité complète sur:
- **Performance du réseau**: CA, activité, tendances
- **Santé des PDVs**: Scores de santé basés sur 5 facteurs clés
- **Prédictions et risques**: Identification des PDVs en déclin
- **Actions de terrain**: Suivi des interventions et récupérations
- **Analytics avancées**: Analyses de concentration (Gini), Pareto, heatmaps par zone

## 🏗️ Architecture

```
FaroukManager/
├── backend/                    # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── ai/                # 🤖 Module Intelligence Artificielle
│   │   │   ├── health_score.py   # Calcul de scores de santé
│   │   │   ├── predictions.py    # Prédictions et forecasts
│   │   │   └── analytics.py      # Analytics avancées
│   │   ├── api/               # Routes API REST
│   │   ├── models/            # ORM SQLAlchemy
│   │   ├── services/          # Logique métier
│   │   ├── schemas/           # Validation Pydantic
│   │   └── core/              # Config, DB, Security
│   └── venv/                  # Virtual environment Python
├── frontend/                  # React + Material-UI
│   ├── src/
│   │   ├── pages/            # Pages principales
│   │   ├── components/       # Composants réutilisables
│   │   ├── services/         # Appels API
│   │   └── store/            # State management
│   └── package.json
└── scripts/                   # Scripts d'initialisation
    ├── seed_data.py          # Génération de données de test
    ├── start_backend.sh      # Démarrage du backend
    └── start_frontend.sh     # Démarrage du frontend
```

## ✨ Fonctionnalités

### 1️⃣ Gestion des PDVs (Module PDV)
- Création et édition de points de vente
- Gestion des zones et sous-zones (8 zones, 3 sous-zones chacune)
- Suivi des statuts (ACTIF, INACTIF, RÉCUPÉRATION, DÉSACTIVÉ)
- Attributions de superviseurs et gestionnaires
- Historique des modifications

### 2️⃣ Performance et KPIs (Module Performance)
- Performances mensuelles et hebdomadaires
- Suivi du CA (Chiffre d'Affaires)
- Nombre d'opérations, dépôts, retraits
- Variations de CA par période
- Alertes sur les écarts de performance

### 3️⃣ Intelligence Artificielle du Score de Santé 🤖
Calcul du score de santé (0-100) basé sur 5 facteurs:
- **Activité récente** (30 pts): semaines actives sur 4
- **Tendance CA** (25 pts): croissance vs déclin
- **Stabilité CA** (20 pts): faible variance
- **Volume relatif** (15 pts): comparaison aux pairs
- **Statut opérationnel** (10 pts): pénalité SIM coupée, bonus nouvelle création

Segments automatiques: Champion, Stable, Déclinant, Inactif, Nouveau

### 4️⃣ Prédictions et Forecasts 🔮
- **Prédiction de déclin**: Régression linéaire sur 8 semaines
- **Forecast CA réseau**: Lissage exponentiel par zone
- **Identification des PDVs à risque**: Seuil probabilité 60%
- **Niveaux de risque**: HAUT / MOYEN / FAIBLE

### 5️⃣ Dashboard Intelligent
- Vue d'ensemble du réseau (CA, PDVs actifs, taux d'activité)
- Indicateurs clés (KPIs)
- Graphiques de performance
- Alertes et notifications
- Status des PDVs en récupération

### 6️⃣ Weekly Dashboard
- Performance de la semaine en cours
- Comparaisons semaine/mois/année
- Evolution hebdomadaire
- PDVs top et bottom performers

### 7️⃣ Gestion des Alertes
- Alertes de performance (seuils CA)
- Alertes d'activité (inactivité prolongée)
- Alertes de risque (déclin probable)
- Historique des alertes
- Actions correctives associées

### 8️⃣ Actions Terrain
- Types: APPEL, VISITE_TERRAIN, MESSAGE_WHATSAPP, AUTRE
- Résultats: RECONTACTÉ, RÉACTIVÉ, À_RÉCUPÉRER, NON_JOIGNABLE, EN_ATTENTE
- Suivi des interventions par superviseur
- Historique des actions
- Notes et observations

### 9️⃣ Programme de Récupération
- Identification des PDVs à récupérer
- Processus de récupération: IDENTIFIÉ → CONTACTÉ → SIM_RÉCUPÉRÉE → REDÉPLOYÉ
- Suivi du CA cumulé 3 mois
- Gestion du redéploiement vers nouveaux emplacements
- Superviseurs responsables

### 🔟 Rapports et Analytics
- **Analyse Pareto**: Identification des 20% de PDVs générant 80% du CA
- **Heatmap par zone**: Performance par zone (CA, nb PDVs, CA moyen, % réseau)
- **Coefficient Gini**: Mesure de concentration du CA
- **Rapport Orange Mali**: KPIs complets pour direction

### 1️⃣1️⃣ Gestion des Utilisateurs
- Rôles: ADMIN, MANAGER, SUPERVISEUR, TÉLÉCONSEILLÈRE
- Gestion des zones par superviseur
- Authentification sécurisée (JWT)
- Audit des actions
- Suivi des connexions

### 1️⃣2️⃣ What-If Simulations
- Simulations d'impact de scénarios
- Impact de semaines actives additionnelles
- Impact de boosts de CA
- Estimation du changement de segment/santé

## 📦 Installation

### Prérequis
- Python 3.8+
- Node.js 14+
- npm ou yarn
- SQLite (inclus)

### Installation du Backend

```bash
cd /Users/nms/FaroukManager/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Installation du Frontend

```bash
cd /Users/nms/FaroukManager/frontend
npm install
```

## 🚀 Démarrage rapide

### Démarrage automatisé (recommandé)

```bash
# Terminal 1 - Backend
chmod +x /Users/nms/FaroukManager/scripts/start_backend.sh
/Users/nms/FaroukManager/scripts/start_backend.sh

# Terminal 2 - Frontend
chmod +x /Users/nms/FaroukManager/scripts/start_frontend.sh
/Users/nms/FaroukManager/scripts/start_frontend.sh
```

### Démarrage manuel

**Backend:**
```bash
cd /Users/nms/FaroukManager/backend
source venv/bin/activate
python3 ../scripts/seed_data.py  # Charger données démo (optionnel)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd /Users/nms/FaroukManager/frontend
npm start
```

### Accès à l'application

- **Frontend**: http://localhost:3000
- **API Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## 🔐 Credentials par défaut

Après exécution de `seed_data.py`:

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| Admin | admin@faroukmanager.com | Admin2026! |
| Manager | manager1@faroukmanager.com | Manager2026! |
| Manager | manager2@faroukmanager.com | Manager2026! |
| Superviseur | superviseur1@faroukmanager.com | Superviseur2026! |
| Superviseur | superviseur2@faroukmanager.com | Superviseur2026! |
| Superviseur | superviseur3@faroukmanager.com | Superviseur2026! |

## 📚 Modules et Services

### Module AI (`backend/app/ai/`)

#### `health_score.py`
```python
# Calcul du score de santé d'un PDV
calculate_health_score(pdv, weekly_performances) -> float

# Classification du segment
classify_segment(health_score, ca_trend) -> str
# Retourne: "Champion" | "Stable" | "Déclinant" | "Inactif" | "Nouveau"

# Attribution de médaille
assign_medal(health_score, percentile_rank) -> PDVMedaille
# Retourne: OR | ARGENT | BRONZE | AUCUNE

# Mise à jour de tous les scores
update_all_health_scores(db) -> dict
```

#### `predictions.py`
```python
# Prédiction de déclin
predict_decline(pdv_id, weekly_performances) -> dict
# Retourne: {probability, predicted_ca_next_week, confidence, risk_level, trend}

# Forecast du CA réseau
forecast_network_ca(db, horizon_weeks=4) -> dict
# Retourne: forecasts par zone

# Identification des PDVs à risque
get_at_risk_pdvs(db, threshold=0.6) -> list
```

#### `analytics.py`
```python
# Coefficient Gini (concentration)
calculate_gini_coefficient(values) -> float

# Analyse Pareto
get_pareto_pdvs(monthly_performances, target_percent=80) -> dict

# Heatmap par zone
get_zone_heatmap(db, annee, mois) -> list

# Rapport complet
generate_orange_mali_report(db, annee, mois) -> dict
```

### Service AI (`backend/app/services/ai_service.py`)

```python
# Mise à jour des scores
run_health_score_update(db) -> dict

# Rapport de prédictions
get_predictions_report(db) -> dict

# Analytics complets
get_full_analytics(db, annee, mois) -> dict

# Simulation what-if
generate_whatif_simulation(db, pdv_id, scenario) -> dict
```

## 🔌 API Documentation

### Endpoints principaux

#### PDVs
- `GET /api/pdvs` - Liste tous les PDVs
- `GET /api/pdvs/{pdv_id}` - Détail d'un PDV
- `POST /api/pdvs` - Créer un PDV
- `PUT /api/pdvs/{pdv_id}` - Modifier un PDV

#### Performance
- `GET /api/performance/pdv/{pdv_id}` - Performance d'un PDV
- `GET /api/performance/monthly` - Performances mensuelles
- `GET /api/performance/weekly` - Performances hebdomadaires

#### Dashboard
- `GET /api/dashboard` - Dashboard principal
- `GET /api/dashboard/weekly` - Weekly dashboard

#### Analytics
- `GET /api/analytics/health-scores` - Scores de santé
- `GET /api/analytics/predictions` - Prédictions
- `GET /api/analytics/pareto` - Analyse Pareto
- `GET /api/analytics/zones` - Heatmap zones
- `GET /api/analytics/report` - Rapport Orange Mali

#### Alertes
- `GET /api/alerts` - Liste les alertes
- `POST /api/alerts` - Créer une alerte
- `PUT /api/alerts/{alert_id}` - Mettre à jour

#### Actions Terrain
- `GET /api/actions` - Liste les actions
- `POST /api/actions` - Créer une action
- `PUT /api/actions/{action_id}` - Mettre à jour

#### Récupérations
- `GET /api/recoveries` - Liste les récupérations
- `POST /api/recoveries` - Créer une récupération
- `PUT /api/recoveries/{recovery_id}` - Mettre à jour

Documentation complète Swagger: http://localhost:8000/docs

## 📊 Données de démonstration

Le script `seed_data.py` crée:
- **200 PDVs** répartis sur 8 zones
- **5 superviseurs** (1 par zone + 1)
- **2 managers**
- **1 admin**
- **12 mois** de données de performance mensuelles
- **52 semaines** de données de performance hebdomadaires
- **50 actions terrain** variées
- **30 dossiers de récupération** en cours

Tous les scores de santé et segments sont calculés automatiquement.

## 🛠️ Configuration

### Variables d'environnement (`.env`)

```env
# Database
DATABASE_URL=sqlite:///./farouk_manager.db

# JWT
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
ALLOWED_ORIGINS=["http://localhost:3000"]

# Environment
DEBUG=True
```

## 📝 Licence

Propriétaire Orange Mali - 2026

## 👥 Support

Pour tout problème ou question:
- Consulter la documentation API: http://localhost:8000/docs
- Vérifier les logs du backend
- Vérifier la console du navigateur (frontend)

---

**Version**: 1.0.0 | **Dernière mise à jour**: Mars 2026
