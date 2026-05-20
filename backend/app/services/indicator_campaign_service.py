"""
Service Campagnes (appels téléphoniques + visites terrain).
============================================================
"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from fastapi import HTTPException

from app.models.indicator import (
    Indicator, IndicatorScore,
    CallCampaign, CallTask, CallLog,
    CampaignStatus, CallTaskStatus, CallOutcome, EngagementLevel,
    FieldCampaign, FieldVisit,
)
from app.models.pdv import PDV
from app.models.user import User, UserRole
from app.services import indicator_service as ind_svc


# ─────────────────────────────────────────────────────────────────────────────
# CRÉATION D'UNE CAMPAGNE D'APPEL
# ─────────────────────────────────────────────────────────────────────────────
def create_call_campaign(db: Session, payload: dict, user_id: Optional[int] = None) -> CallCampaign:
    c = CallCampaign(
        name=payload.get("name") or f"Campagne {datetime.utcnow().strftime('%Y-%m-%d')}",
        description=payload.get("description"),
        indicator_ids=payload.get("indicator_ids", []),
        target_rate_pct=payload.get("target_rate_pct"),
        status=CampaignStatus(payload.get("status", "DRAFT")),
        starts_at=payload.get("starts_at") or datetime.utcnow(),
        ends_at=payload.get("ends_at"),
        filter_zone=payload.get("filter_zone"),
        filter_quartier=payload.get("filter_quartier"),
        filter_extra=payload.get("filter_extra"),
        created_by_id=user_id,
    )
    db.add(c); db.commit(); db.refresh(c)
    return c


def list_call_campaigns(db: Session, status: Optional[CampaignStatus] = None) -> List[Dict[str, Any]]:
    q = db.query(CallCampaign)
    if status: q = q.filter(CallCampaign.status == status)
    out = []
    for c in q.order_by(CallCampaign.created_at.desc()).all():
        n_total = db.query(func.count(CallTask.id)).filter(CallTask.campaign_id == c.id).scalar() or 0
        n_done = db.query(func.count(CallTask.id)).filter(
            CallTask.campaign_id == c.id,
            CallTask.status == CallTaskStatus.COMPLETED,
        ).scalar() or 0
        out.append({
            "id": c.id, "name": c.name, "description": c.description,
            "indicator_ids": c.indicator_ids or [],
            "status": c.status.value,
            "target_rate_pct": c.target_rate_pct,
            "starts_at": c.starts_at.isoformat() if c.starts_at else None,
            "ends_at": c.ends_at.isoformat() if c.ends_at else None,
            "n_total": n_total, "n_done": n_done,
            "progress_pct": round(n_done / n_total * 100, 1) if n_total else 0,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return out


def get_campaign_detail(db: Session, campaign_id: int) -> Dict[str, Any]:
    c = db.query(CallCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")

    tasks = db.query(CallTask).filter(CallTask.campaign_id == c.id).all()
    task_data = []
    for t in tasks:
        last_log = db.query(CallLog).filter(CallLog.task_id == t.id).order_by(CallLog.created_at.desc()).first()
        task_data.append({
            "id": t.id, "pdv_id": t.pdv_id,
            "pdv_numero": t.pdv.numero_pdv if t.pdv else None,
            "pdv_nom": t.pdv.nom if t.pdv else None,
            "pdv_telephone": t.pdv.telephone if t.pdv else None,
            "pdv_quartier": t.pdv.quartier if t.pdv else None,
            "assigned_to_id": t.assigned_to_id,
            "assigned_to_nom": (f"{t.assigned_to.prenom or ''} {t.assigned_to.nom}".strip()
                                if t.assigned_to else None),
            "status": t.status.value,
            "scheduled_for": t.scheduled_for.isoformat() if t.scheduled_for else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "last_outcome": last_log.outcome.value if last_log else None,
            "last_engagement": last_log.engagement.value if last_log else None,
            "last_comment": last_log.comment if last_log else None,
        })

    return {
        "id": c.id, "name": c.name, "description": c.description,
        "indicator_ids": c.indicator_ids or [],
        "status": c.status.value,
        "starts_at": c.starts_at.isoformat() if c.starts_at else None,
        "ends_at": c.ends_at.isoformat() if c.ends_at else None,
        "tasks": task_data,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ATTRIBUTION DES PDV AUX TÉLÉCONSEILLÈRES
# ─────────────────────────────────────────────────────────────────────────────
def auto_assign_tasks(db: Session, campaign_id: int, user_ids: List[int],
                      filters: Optional[dict] = None,
                      strategy: str = "balanced") -> Dict[str, Any]:
    """
    Crée des CallTask en distribuant les PDV cibles entre les téléconseillères.
    strategy: "balanced" (équilibré) | "by_zone" (par quartier).
    """
    c = db.query(CallCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    if not user_ids: raise HTTPException(400, "Aucune téléconseillère sélectionnée")

    # 1. Sélection des PDV cibles : ceux qui ne font PAS l'indicateur principal
    indicator_ids = c.indicator_ids or []
    if not indicator_ids:
        raise HTTPException(400, "Campagne sans indicateur cible")

    main_indicator = db.query(Indicator).get(indicator_ids[0])
    period_key = ind_svc.current_period_key(main_indicator.period)

    pdvs_status = ind_svc.get_pdvs_status(db, main_indicator.id, period_key,
                                          active_only=False, filters=filters or {})
    inactive_pdvs = [p for p in pdvs_status if not p["is_active"]]
    if not inactive_pdvs:
        return {"created": 0, "message": "Tous les PDV font déjà cet indicateur ✓"}

    # 2. Suppression des tasks PENDING existants pour cette campagne (évite doublons)
    db.query(CallTask).filter(
        CallTask.campaign_id == campaign_id,
        CallTask.status == CallTaskStatus.PENDING,
    ).delete()

    # 3. Distribution
    n_users = len(user_ids)
    created = 0
    if strategy == "by_zone":
        # Grouper par quartier puis distribuer chaque quartier à une téléconseillère
        from collections import defaultdict
        by_quartier = defaultdict(list)
        for p in inactive_pdvs:
            by_quartier[p.get("quartier") or "_none"].append(p)
        for i, (qt, pdvs) in enumerate(by_quartier.items()):
            uid = user_ids[i % n_users]
            for p in pdvs:
                db.add(CallTask(
                    campaign_id=campaign_id, pdv_id=p["pdv_id"],
                    assigned_to_id=uid, status=CallTaskStatus.PENDING,
                ))
                created += 1
    else:
        # Balanced : round-robin
        for i, p in enumerate(inactive_pdvs):
            uid = user_ids[i % n_users]
            db.add(CallTask(
                campaign_id=campaign_id, pdv_id=p["pdv_id"],
                assigned_to_id=uid, status=CallTaskStatus.PENDING,
            ))
            created += 1
    c.status = CampaignStatus.ACTIVE
    db.commit()
    return {"created": created, "users": n_users, "strategy": strategy}


# ─────────────────────────────────────────────────────────────────────────────
# FILE D'ATTENTE D'UNE TÉLÉCONSEILLÈRE
# ─────────────────────────────────────────────────────────────────────────────
def my_call_queue(db: Session, user_id: int, status: Optional[str] = None,
                  limit: int = 200) -> List[Dict[str, Any]]:
    q = db.query(CallTask).filter(CallTask.assigned_to_id == user_id)
    if status:
        q = q.filter(CallTask.status == CallTaskStatus(status))
    else:
        q = q.filter(CallTask.status.in_([CallTaskStatus.PENDING, CallTaskStatus.IN_PROGRESS,
                                          CallTaskStatus.RESCHEDULED]))
    tasks = q.order_by(CallTask.priority.desc(), CallTask.created_at.asc()).limit(limit).all()

    out = []
    for t in tasks:
        out.append({
            "id": t.id,
            "campaign_id": t.campaign_id,
            "campaign_name": t.campaign.name if t.campaign else None,
            "pdv_id": t.pdv_id,
            "pdv_numero": t.pdv.numero_pdv if t.pdv else None,
            "pdv_nom": t.pdv.nom if t.pdv else None,
            "pdv_telephone": t.pdv.telephone if t.pdv else None,
            "pdv_quartier": t.pdv.quartier if t.pdv else None,
            "status": t.status.value,
            "priority": t.priority,
            "scheduled_for": t.scheduled_for.isoformat() if t.scheduled_for else None,
            "indicator_ids": t.campaign.indicator_ids if t.campaign else [],
        })
    return out


# ─────────────────────────────────────────────────────────────────────────────
# ENREGISTRER UN APPEL
# ─────────────────────────────────────────────────────────────────────────────
def log_call(db: Session, task_id: int, user_id: int, payload: dict) -> CallLog:
    t = db.query(CallTask).get(task_id)
    if not t: raise HTTPException(404, "Tâche introuvable")
    if t.assigned_to_id and t.assigned_to_id != user_id:
        # Admin override
        u = db.query(User).get(user_id)
        if not u or u.role not in (UserRole.ADMIN, UserRole.MANAGER):
            raise HTTPException(403, "Cette tâche n'est pas assignée à cet utilisateur")

    outcome = CallOutcome(payload["outcome"])
    log = CallLog(
        task_id=task_id, pdv_id=t.pdv_id, user_id=user_id,
        outcome=outcome,
        engagement=EngagementLevel(payload.get("engagement", "UNKNOWN")),
        duration_sec=payload.get("duration_sec"),
        comment=payload.get("comment"),
        indicator_ids_discussed=payload.get("indicator_ids_discussed") or (
            t.campaign.indicator_ids if t.campaign else []),
        call_lat=payload.get("call_lat"), call_lng=payload.get("call_lng"),
        callback_at=payload.get("callback_at"),
    )

    # Analyse IA du commentaire
    if payload.get("comment"):
        try:
            from app.ai import indicator_intelligence as ai
            an = ai.analyze_comment(payload["comment"])
            log.ai_sentiment = an["sentiment"]
            log.ai_categories = an["categories"]
            log.ai_heat_score = an["heat_score"]
            log.ai_summary = an["summary"]
        except Exception:
            pass

    db.add(log)

    # Mise à jour du statut de la tâche
    if outcome == CallOutcome.CALLBACK:
        t.status = CallTaskStatus.RESCHEDULED
        t.scheduled_for = payload.get("callback_at")
    else:
        t.status = CallTaskStatus.COMPLETED
        t.completed_at = datetime.utcnow()
    db.commit(); db.refresh(log)
    return log


# ─────────────────────────────────────────────────────────────────────────────
# Stats globales appels
# ─────────────────────────────────────────────────────────────────────────────
def call_stats(db: Session, campaign_id: Optional[int] = None) -> Dict[str, Any]:
    q = db.query(CallTask)
    if campaign_id: q = q.filter(CallTask.campaign_id == campaign_id)
    n_total = q.count()
    n_pending = q.filter(CallTask.status == CallTaskStatus.PENDING).count()
    n_done = q.filter(CallTask.status == CallTaskStatus.COMPLETED).count()
    n_callback = q.filter(CallTask.status == CallTaskStatus.RESCHEDULED).count()

    log_q = db.query(CallLog)
    if campaign_id:
        log_q = log_q.join(CallTask, CallTask.id == CallLog.task_id).filter(CallTask.campaign_id == campaign_id)
    n_calls = log_q.count()
    n_reached = log_q.filter(CallLog.outcome == CallOutcome.REACHED).count()
    n_engaged = log_q.filter(CallLog.engagement == EngagementLevel.YES).count()

    return {
        "tasks_total": n_total,
        "tasks_pending": n_pending,
        "tasks_completed": n_done,
        "tasks_callback": n_callback,
        "calls_logged": n_calls,
        "reach_rate_pct": round(n_reached / n_calls * 100, 1) if n_calls else 0,
        "engagement_rate_pct": round(n_engaged / max(n_reached, 1) * 100, 1),
        "completion_pct": round(n_done / n_total * 100, 1) if n_total else 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CAMPAGNES TERRAIN — symétriques
# ─────────────────────────────────────────────────────────────────────────────
def create_field_campaign(db: Session, payload: dict, user_id: Optional[int] = None) -> FieldCampaign:
    c = FieldCampaign(
        name=payload.get("name") or f"Tournée {datetime.utcnow().strftime('%Y-%m-%d')}",
        description=payload.get("description"),
        indicator_ids=payload.get("indicator_ids", []),
        status=CampaignStatus(payload.get("status", "DRAFT")),
        starts_at=payload.get("starts_at") or datetime.utcnow(),
        ends_at=payload.get("ends_at"),
        filter_extra=payload.get("filter_extra"),
        created_by_id=user_id,
    )
    db.add(c); db.commit(); db.refresh(c)
    return c


def list_field_campaigns(db: Session) -> List[Dict[str, Any]]:
    out = []
    for c in db.query(FieldCampaign).order_by(FieldCampaign.created_at.desc()).all():
        n_total = db.query(func.count(FieldVisit.id)).filter(FieldVisit.campaign_id == c.id).scalar() or 0
        n_done = db.query(func.count(FieldVisit.id)).filter(
            FieldVisit.campaign_id == c.id,
            FieldVisit.status == CallTaskStatus.COMPLETED,
        ).scalar() or 0
        out.append({
            "id": c.id, "name": c.name, "description": c.description,
            "status": c.status.value, "indicator_ids": c.indicator_ids or [],
            "n_total": n_total, "n_done": n_done,
            "progress_pct": round(n_done / n_total * 100, 1) if n_total else 0,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return out


def assign_field_visits(db: Session, campaign_id: int, dev_user_ids: List[int],
                        filters: Optional[dict] = None) -> Dict[str, Any]:
    c = db.query(FieldCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    indicator_ids = c.indicator_ids or []
    if not indicator_ids:
        raise HTTPException(400, "Campagne sans indicateur cible")

    main = db.query(Indicator).get(indicator_ids[0])
    pdvs = ind_svc.get_pdvs_status(db, main.id, active_only=False, filters=filters or {})
    inactive = [p for p in pdvs if not p["is_active"]]

    db.query(FieldVisit).filter(
        FieldVisit.campaign_id == campaign_id,
        FieldVisit.status == CallTaskStatus.PENDING,
    ).delete()

    n_users = len(dev_user_ids)
    created = 0
    for i, p in enumerate(inactive):
        db.add(FieldVisit(
            campaign_id=campaign_id, pdv_id=p["pdv_id"],
            assigned_to_id=dev_user_ids[i % n_users],
            status=CallTaskStatus.PENDING,
        ))
        created += 1
    c.status = CampaignStatus.ACTIVE
    db.commit()
    return {"created": created, "users": n_users}
