"""
Routes API du module Indicateurs.
==================================
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.indicator import (
    IndicatorCategory, IndicatorMethod, IndicatorPeriod, IndicatorStatus,
    CampaignStatus, CallTaskStatus,
)

from app.services import (
    indicator_service as svc,
    indicator_campaign_service as camp_svc,
    indicator_eval_service as eval_svc,
)
from app.ai import indicator_intelligence as ai_svc

router = APIRouter(prefix="/indicators", tags=["Indicators"])


# ─────────────────────────────────────────────────────────────────────────────
# CRUD INDICATEURS
# ─────────────────────────────────────────────────────────────────────────────
@router.get("")
def list_indicators(
    status: Optional[IndicatorStatus] = None,
    category: Optional[IndicatorCategory] = None,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    items = svc.list_indicators(db, status, category)
    return [{
        "id": i.id, "code": i.code, "name": i.name, "description": i.description,
        "category": i.category.value, "icon": i.icon, "color": i.color,
        "method": i.method.value, "metric_field": i.metric_field,
        "threshold_value": i.threshold_value, "formula": i.formula,
        "period": i.period.value, "status": i.status.value,
        "target_rate_pct": i.target_rate_pct, "weight": i.weight,
    } for i in items]


@router.get("/global-stats")
def global_stats(period_key: Optional[str] = None,
                 db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Stats résumées pour TOUS les indicateurs actifs."""
    return svc.stats_global(db, period_key)


@router.post("")
def create_indicator(payload: dict = Body(...),
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    i = svc.create_indicator(db, payload, current_user.id)
    return {"id": i.id, "code": i.code, "name": i.name}


@router.get("/{indicator_id}")
def get_indicator(indicator_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    i = svc.get_indicator(db, indicator_id)
    return {
        "id": i.id, "code": i.code, "name": i.name, "description": i.description,
        "category": i.category.value, "icon": i.icon, "color": i.color,
        "method": i.method.value, "metric_field": i.metric_field,
        "threshold_value": i.threshold_value, "formula": i.formula,
        "period": i.period.value, "status": i.status.value,
        "target_rate_pct": i.target_rate_pct, "weight": i.weight,
        "created_at": i.created_at.isoformat() if i.created_at else None,
    }


@router.patch("/{indicator_id}")
def update_indicator(indicator_id: int, payload: dict = Body(...),
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    i = svc.update_indicator(db, indicator_id, payload, current_user.id)
    return {"id": i.id, "code": i.code, "updated_at": i.updated_at.isoformat()}


@router.post("/{indicator_id}/archive")
def archive_indicator(indicator_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    i = svc.archive_indicator(db, indicator_id)
    return {"id": i.id, "status": i.status.value}


# ─────────────────────────────────────────────────────────────────────────────
# SCORES — qui fait / qui ne fait pas
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{indicator_id}/pdvs")
def list_pdvs_status(
    indicator_id: int,
    period_key: Optional[str] = None,
    active_only: Optional[bool] = None,
    quartier: Optional[str] = None,
    zone: Optional[str] = None,
    sous_zone: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    from app.api.routes.auth import get_pdv_filters
    f = get_pdv_filters(current_user)
    # Auto-remplir les filtres selon le rôle
    zone = zone or f.get('zone')
    superviseur = f.get('superviseur')
    gestionnaire = f.get('gestionnaire')

    filters = {k: v for k, v in {
        "quartier": quartier, "zone": zone, "sous_zone": sous_zone,
        "search": search, "superviseur": superviseur, "gestionnaire": gestionnaire
    }.items() if v}
    return svc.get_pdvs_status(db, indicator_id, period_key, active_only, filters)


@router.get("/{indicator_id}/stats")
def indicator_stats(indicator_id: int, period_key: Optional[str] = None,
                    db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.stats(db, indicator_id, period_key)


@router.get("/{indicator_id}/evolution")
def indicator_evolution(indicator_id: int, n_periods: int = 12,
                        db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.evolution(db, indicator_id, n_periods)


@router.post("/{indicator_id}/scores")
def set_score(indicator_id: int, pdv_id: int, period_key: str, is_active: bool,
              raw_value: Optional[float] = None,
              db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = svc.set_score(db, indicator_id, pdv_id, period_key, is_active, raw_value)
    return {"id": s.id, "is_active": s.is_active}


@router.post("/{indicator_id}/import")
def import_xlsx(indicator_id: int,
                period_key: str = Form(...),
                pdv_col: str = Form("numero_pdv"),
                value_col: Optional[str] = Form("valeur"),
                active_col: Optional[str] = Form(None),
                file: UploadFile = File(...),
                db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    content = file.file.read()
    return svc.import_xlsx(db, indicator_id, period_key, content,
                           pdv_col=pdv_col, value_col=value_col, active_col=active_col)


# ─────────────────────────────────────────────────────────────────────────────
# CAMPAGNES D'APPELS
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/campaigns/calls")
def list_call_campaigns(status: Optional[CampaignStatus] = None,
                        db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return camp_svc.list_call_campaigns(db, status)


@router.post("/campaigns/calls")
def create_call_campaign(payload: dict = Body(...),
                         db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = camp_svc.create_call_campaign(db, payload, current_user.id)
    return {"id": c.id, "name": c.name, "status": c.status.value}


@router.get("/campaigns/calls/{campaign_id}")
def get_call_campaign(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return camp_svc.get_campaign_detail(db, campaign_id)


@router.post("/campaigns/calls/{campaign_id}/assign")
def assign_call_tasks(campaign_id: int, payload: dict = Body(...),
                      db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    user_ids = payload.get("user_ids", [])
    filters = payload.get("filters")
    strategy = payload.get("strategy", "balanced")
    return camp_svc.auto_assign_tasks(db, campaign_id, user_ids, filters, strategy)


@router.get("/campaigns/calls/{campaign_id}/stats")
def call_stats(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return camp_svc.call_stats(db, campaign_id)


# ─────────────────────────────────────────────────────────────────────────────
# FILE D'ATTENTE (téléconseillère)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/calls/my-queue")
def my_queue(status: Optional[str] = None,
             db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return camp_svc.my_call_queue(db, current_user.id, status)


@router.post("/calls/{task_id}/log")
def log_call(task_id: int, payload: dict = Body(...),
             db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    log = camp_svc.log_call(db, task_id, current_user.id, payload)
    return {"id": log.id, "ai_sentiment": log.ai_sentiment,
            "ai_categories": log.ai_categories, "ai_heat_score": log.ai_heat_score}


# ─────────────────────────────────────────────────────────────────────────────
# CAMPAGNES TERRAIN
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/campaigns/field")
def list_field_campaigns(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return camp_svc.list_field_campaigns(db)


@router.post("/campaigns/field")
def create_field_campaign(payload: dict = Body(...),
                          db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = camp_svc.create_field_campaign(db, payload, current_user.id)
    return {"id": c.id, "name": c.name}


@router.post("/campaigns/field/{campaign_id}/assign")
def assign_field_visits(campaign_id: int, payload: dict = Body(...),
                        db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return camp_svc.assign_field_visits(db, campaign_id,
                                        payload.get("dev_user_ids", []),
                                        payload.get("filters"))


# ─────────────────────────────────────────────────────────────────────────────
# IA
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{indicator_id}/ai/insights")
def ai_insights(indicator_id: int, since_days: int = 30,
                db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return ai_svc.aggregate_insights(db, indicator_id, since_days)


@router.get("/{indicator_id}/ai/dropouts")
def ai_dropouts(indicator_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return ai_svc.predict_dropouts(db, indicator_id)


@router.get("/{indicator_id}/ai/diagnose/{pdv_id}")
def ai_diagnose(indicator_id: int, pdv_id: int,
                db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        return ai_svc.diagnose_pdv(db, pdv_id, indicator_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{indicator_id}/ai/what-if")
def ai_what_if(indicator_id: int, recovery_pct: float = 20.0,
               db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return ai_svc.what_if(db, indicator_id, recovery_pct)


# ─────────────────────────────────────────────────────────────────────────────
# ÉVALUATION TÉLÉCONSEILLÈRES
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/eval/leaderboard")
def eval_leaderboard(period_days: int = 30, indicator_id: Optional[int] = None,
                     role: str = "teleconseillere",
                     db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return eval_svc.leaderboard(db, period_days, indicator_id, role)


@router.get("/eval/user/{user_id}")
def eval_user(user_id: int, period_days: int = 30, indicator_id: Optional[int] = None,
              db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return eval_svc.evaluate_user(db, user_id, period_days, indicator_id)


@router.get("/eval/user/{user_id}/zones/{indicator_id}")
def eval_zones(user_id: int, indicator_id: int, period_days: int = 60,
               db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return eval_svc.impact_by_zone(db, user_id, indicator_id, period_days)
