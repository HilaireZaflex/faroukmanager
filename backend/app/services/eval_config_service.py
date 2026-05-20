"""
Configurations d'évaluation (pondérations par rôle).
=====================================================
"""
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.evaluation import EvalConfig, EvalRoleType

# ─────────────────────────────────────────────────────────────────────────────
# Configurations par défaut (modifiables par l'admin)
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_CONFIGS = {
    EvalRoleType.SUPERVISEUR: {
        "name": "Évaluation Superviseur",
        "weights": {
            "kpi":       40,   # % — KPI automatiques
            "mystery":   30,   # % — Appels mystères PDV (fréquence visite)
            "terrain":   20,   # % — Test connaissance terrain
            "manual":    10,   # % — Notes manuelles RC/Admin
        },
        "criteria": [
            {"key": "montant_transactions", "label": "Montant transactions", "max": 100, "unit": "FCFA", "auto": True},
            {"key": "commission_totale",    "label": "Commission totale",    "max": 100, "unit": "FCFA", "auto": True},
            {"key": "taux_actif_omy",       "label": "Taux actif OMy",      "max": 100, "unit": "%",    "auto": True},
            {"key": "taux_actif_nafama",    "label": "Taux actif NAFAMA",   "max": 100, "unit": "%",    "auto": True},
            {"key": "taux_actif_kaabu",     "label": "Taux actif KAABU",    "max": 100, "unit": "%",    "auto": True},
            {"key": "mystery_last_visit",   "label": "Appels mystères (dernier passage)", "max": 10, "unit": "/10", "auto": False, "category": "mystery"},
            {"key": "geo_knowledge",        "label": "Connaissance terrain", "max": 10, "unit": "/10", "auto": False, "category": "terrain"},
        ],
        "mystery_call_questions": {
            "LAST_VISIT": "Bonjour, pouvez-vous me dire quand votre superviseur est passé pour la dernière fois vous voir ?",
            "GEO_KNOWLEDGE": "[Posé au superviseur] Donnez-moi l'adresse exacte et le quartier de ce PDV : {pdv_numero} - {pdv_nom}",
        },
        "bonus_thresholds": [
            {"min_score": 90, "label": "Excellence", "bonus_pct": 20},
            {"min_score": 80, "label": "Très bien",  "bonus_pct": 10},
            {"min_score": 70, "label": "Bien",       "bonus_pct": 5},
        ],
    },
    EvalRoleType.GESTIONNAIRE: {
        "name": "Évaluation Gestionnaire",
        "weights": {
            "kpi":     60,
            "mystery": 40,
        },
        "criteria": [
            {"key": "ca_total",           "label": "CA total géré",         "max": 100, "unit": "FCFA", "auto": True},
            {"key": "commission_totale",  "label": "Commission totale",     "max": 100, "unit": "FCFA", "auto": True},
            {"key": "taux_actif_omy",     "label": "Taux actif OMy",        "max": 100, "unit": "%",    "auto": True},
            {"key": "taux_actif_nafama",  "label": "Taux actif NAFAMA",     "max": 100, "unit": "%",    "auto": True},
            {"key": "taux_actif_kaabu",   "label": "Taux actif KAABU",      "max": 100, "unit": "%",    "auto": True},
            {"key": "pdv_actifs",         "label": "Nb PDV actifs",          "max": 100, "unit": "PDV",  "auto": True},
            {"key": "mystery_last_visit", "label": "Appels mystères (passage)", "max": 10, "unit": "/10", "auto": False, "category": "mystery"},
        ],
        "mystery_call_questions": {
            "LAST_VISIT": "Bonjour, quand votre gestionnaire est-il passé vous voir pour la dernière fois ?",
        },
        "bonus_thresholds": [
            {"min_score": 90, "label": "Excellence", "bonus_pct": 15},
            {"min_score": 80, "label": "Très bien",  "bonus_pct": 8},
            {"min_score": 70, "label": "Bien",       "bonus_pct": 4},
        ],
    },
    EvalRoleType.DEVELOPPEUR: {
        "name": "Évaluation Développeur",
        "weights": {
            "commercial":  40,   # Perf commerciale
            "terrain":     30,   # Qualité terrain
            "indicators":  20,   # Contribution indicateurs
            "discipline":  10,   # Discipline / SLA
        },
        "criteria": [
            # Commercial
            {"key": "taux_reussite_global",    "label": "Taux de réussite global",      "max": 100, "unit": "%",    "auto": True, "category": "commercial"},
            {"key": "taux_recuperation",       "label": "Taux de récupération",         "max": 100, "unit": "%",    "auto": True, "category": "commercial"},
            {"key": "taux_objectif_activation","label": "Objectif activation atteint",  "max": 100, "unit": "%",    "auto": True, "category": "commercial"},
            {"key": "volume_prospection",      "label": "Volume de prospection",        "max": 50,  "unit": "fiches","auto": True, "category": "commercial"},
            {"key": "volume_visites",          "label": "Volume de visites terrain",    "max": 50,  "unit": "visites","auto": True, "category": "commercial"},
            # Terrain
            {"key": "taux_validation",         "label": "Taux de validation prospects", "max": 100, "unit": "%",    "auto": True, "category": "terrain"},
            {"key": "delai_moyen_visite",      "label": "Délai moyen visite (SLA 48h)", "max": 100, "unit": "h",    "auto": True, "category": "terrain"},
            {"key": "couverture_geo",          "label": "Couverture géographique",      "max": 15,  "unit": "quartiers","auto": True, "category": "terrain"},
            # Indicateurs
            {"key": "contribution_indicateurs","label": "Contribution indicateurs",     "max": 100, "unit": "PDV",  "auto": True, "category": "indicators"},
            {"key": "taux_fidelisation",       "label": "Taux de fidélisation 3M",     "max": 100, "unit": "%",    "auto": True, "category": "indicators"},
            # Discipline
            {"key": "pct_sla_respecte",        "label": "% SLA respecté",              "max": 100, "unit": "%",    "auto": True, "category": "discipline"},
            {"key": "qualite_fiches",          "label": "Qualité fiches prospects",    "max": 100, "unit": "%",    "auto": True, "category": "discipline"},
        ],
        "mystery_call_questions": {
            "QUALITY_CHECK": "Bonjour, avez-vous été contacté récemment par notre développeur {agent_nom} ? Comment s'est passé votre interaction ?",
        },
        "bonus_thresholds": [
            {"min_score": 90, "label": "Excellence", "bonus_pct": 25},
            {"min_score": 80, "label": "Très bien",  "bonus_pct": 15},
            {"min_score": 70, "label": "Bien",       "bonus_pct": 8},
        ],
    },
    EvalRoleType.TELECONSEILLERE: {
        "name": "Évaluation Téléconseillère",
        "weights": {
            "volume":   30,
            "quality":  30,
            "impact":   30,
            "mystery":  10,  # Appels qualité vérifiés par superviseurs
        },
        "criteria": [
            {"key": "n_appels",              "label": "Nombre d'appels",          "max": 200, "unit": "appels", "auto": True, "category": "volume"},
            {"key": "taux_joignabilite",     "label": "Taux joignabilité",        "max": 100, "unit": "%",     "auto": True, "category": "volume"},
            {"key": "taux_engagement",       "label": "Taux d'engagement",        "max": 100, "unit": "%",     "auto": True, "category": "volume"},
            {"key": "taux_conversion",       "label": "Taux de conversion",       "max": 100, "unit": "%",     "auto": True, "category": "quality"},
            {"key": "score_ai_commentaires", "label": "Score IA commentaires",    "max": 100, "unit": "pts",   "auto": True, "category": "quality"},
            {"key": "completude_fiches",     "label": "Complétude des fiches",    "max": 100, "unit": "%",     "auto": True, "category": "quality"},
            {"key": "taux_rappel_respecte",  "label": "Rappels respectés",        "max": 100, "unit": "%",     "auto": True, "category": "quality"},
            {"key": "impact_zone",           "label": "Amélioration zone",        "max": 100, "unit": "PDV",   "auto": True, "category": "impact"},
            {"key": "contribution_indic",    "label": "Contribution indicateurs", "max": 100, "unit": "PDV",   "auto": True, "category": "impact"},
            {"key": "mystery_quality",       "label": "Note qualité interaction", "max": 10,  "unit": "/10",   "auto": False, "category": "mystery"},
        ],
        "mystery_call_questions": {
            "QUALITY_CHECK": "Bonjour, vous avez été appelé par notre téléconseillère récemment. Comment s'est passé l'appel ? Était-elle professionnelle et utile ?",
        },
        "bonus_thresholds": [
            {"min_score": 90, "label": "Championne",  "bonus_pct": 20},
            {"min_score": 80, "label": "Excellente",  "bonus_pct": 12},
            {"min_score": 70, "label": "Très bien",   "bonus_pct": 6},
        ],
    },
}


def get_config(db: Session, role_type: EvalRoleType) -> Dict[str, Any]:
    cfg = db.query(EvalConfig).filter(EvalConfig.role_type == role_type).first()
    if cfg:
        return {"id": cfg.id, "role_type": role_type.value,
                "name": cfg.name, "weights": cfg.weights, "criteria": cfg.criteria}
    return {**DEFAULT_CONFIGS[role_type], "role_type": role_type.value, "id": None}


def update_config(db: Session, role_type: EvalRoleType, payload: dict, user_id: int) -> EvalConfig:
    cfg = db.query(EvalConfig).filter(EvalConfig.role_type == role_type).first()
    default = DEFAULT_CONFIGS[role_type]
    if cfg:
        if "weights" in payload: cfg.weights = payload["weights"]
        if "criteria" in payload: cfg.criteria = payload["criteria"]
        if "name" in payload: cfg.name = payload["name"]
        cfg.updated_by_id = user_id
        cfg.updated_at = datetime.utcnow()
    else:
        cfg = EvalConfig(
            role_type=role_type,
            name=payload.get("name", default["name"]),
            weights=payload.get("weights", default["weights"]),
            criteria=payload.get("criteria", default["criteria"]),
            updated_by_id=user_id,
        )
        db.add(cfg)
    db.commit(); db.refresh(cfg)
    return cfg


def reset_config(db: Session, role_type: EvalRoleType, user_id: int) -> Dict:
    cfg = db.query(EvalConfig).filter(EvalConfig.role_type == role_type).first()
    if cfg: db.delete(cfg); db.commit()
    return get_config(db, role_type)


def all_configs(db: Session) -> list:
    return [get_config(db, r) for r in EvalRoleType]
