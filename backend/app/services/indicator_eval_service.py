"""
Service Évaluation des téléconseillères / développeurs.
========================================================
- evaluate_user           : volume, joignabilité, engagements, conversions, score d'impact
- impact_by_zone          : avant/après par zone d'une téléconseillère
- leaderboard             : classement des téléconseillères / développeurs
- conversion_rate         : combien de PDV appelés sont passés inactif → actif
"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import Counter, defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.user import User, UserRole
from app.models.pdv import PDV
from app.models.indicator import (
    CallTask, CallLog, CallTaskStatus, CallOutcome, EngagementLevel,
    FieldVisit, IndicatorScore, Indicator,
)


def _conversion_window_days() -> int:
    return 14  # Période d'observation après un appel


def evaluate_user(db: Session, user_id: int,
                  period_days: int = 30,
                  indicator_id: Optional[int] = None) -> Dict[str, Any]:
    """Évaluation complète d'une téléconseillère sur les N derniers jours."""
    cutoff = datetime.utcnow() - timedelta(days=period_days)
    user = db.query(User).get(user_id)
    if not user: return {"error": "Utilisateur introuvable"}

    # Tâches assignées
    tasks_q = db.query(CallTask).filter(
        CallTask.assigned_to_id == user_id,
        CallTask.created_at >= cutoff,
    )
    n_assigned = tasks_q.count()
    n_completed = tasks_q.filter(CallTask.status == CallTaskStatus.COMPLETED).count()

    # Logs d'appel
    logs_q = db.query(CallLog).filter(
        CallLog.user_id == user_id,
        CallLog.created_at >= cutoff,
    )
    logs = logs_q.all()
    n_calls = len(logs)
    n_reached = sum(1 for l in logs if l.outcome == CallOutcome.REACHED)
    n_engaged = sum(1 for l in logs if l.engagement == EngagementLevel.YES)
    n_callback = sum(1 for l in logs if l.outcome == CallOutcome.CALLBACK)

    # Sentiment moyen
    sentiments = Counter(l.ai_sentiment or "neutral" for l in logs)
    heat_avg = (sum(l.ai_heat_score or 50 for l in logs) / max(n_calls, 1)) if n_calls else 0

    # CONVERSIONS : PDV qui sont passés inactif → actif après l'appel
    conversions = _count_conversions(db, user_id, cutoff, indicator_id)

    # Score d'impact (0-100)
    rate_reach = (n_reached / n_calls * 100) if n_calls else 0
    rate_engage = (n_engaged / max(n_reached, 1) * 100)
    rate_convert = conversions["rate_pct"]
    impact_score = round(0.3 * rate_reach + 0.3 * rate_engage + 0.4 * rate_convert, 1)

    # Quartiers couverts
    pdv_ids = list({l.pdv_id for l in logs})
    quartiers = []
    if pdv_ids:
        rows = db.query(PDV.quartier, func.count(PDV.id))\
            .filter(PDV.id.in_(pdv_ids))\
            .group_by(PDV.quartier).all()
        quartiers = [{"quartier": q or "Inconnu", "count": c} for q, c in rows]

    return {
        "user_id": user_id,
        "user_name": f"{user.prenom or ''} {user.nom}".strip(),
        "role": user.role.value,
        "period_days": period_days,
        "n_assigned": n_assigned,
        "n_completed": n_completed,
        "n_calls": n_calls,
        "n_reached": n_reached,
        "n_engaged": n_engaged,
        "n_callback": n_callback,
        "rate_completion_pct": round(n_completed / max(n_assigned, 1) * 100, 1),
        "rate_reach_pct": round(rate_reach, 1),
        "rate_engagement_pct": round(rate_engage, 1),
        "sentiments": dict(sentiments),
        "avg_heat_score": round(heat_avg, 1),
        "conversions": conversions,
        "impact_score": impact_score,
        "impact_label": _impact_label(impact_score),
        "quartiers_couverts": quartiers,
    }


def _impact_label(score: float) -> str:
    if score >= 75: return "Championne ⭐"
    if score >= 60: return "Très bonne"
    if score >= 45: return "Correcte"
    if score >= 30: return "À améliorer"
    return "À former"


def _count_conversions(db: Session, user_id: int, cutoff: datetime,
                       indicator_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Pour chaque PDV appelé par cet user, vérifier si le PDV est passé
    inactif → actif sur l'indicateur dans les N jours suivants.
    """
    window = _conversion_window_days()
    logs = db.query(CallLog).filter(
        CallLog.user_id == user_id,
        CallLog.created_at >= cutoff,
    ).all()

    if not logs: return {"n_calls_with_check": 0, "n_converted": 0, "rate_pct": 0}

    converted = 0
    checked = 0
    for log in logs:
        # Indicateurs discutés pendant l'appel
        target_indicators = log.indicator_ids_discussed or []
        if indicator_id: target_indicators = [indicator_id]
        for ind_id in target_indicators:
            checked += 1
            # État avant l'appel
            before = db.query(IndicatorScore).filter(
                IndicatorScore.indicator_id == ind_id,
                IndicatorScore.pdv_id == log.pdv_id,
                IndicatorScore.measured_at < log.created_at,
            ).order_by(IndicatorScore.measured_at.desc()).first()
            # État après l'appel (dans les N jours)
            after = db.query(IndicatorScore).filter(
                IndicatorScore.indicator_id == ind_id,
                IndicatorScore.pdv_id == log.pdv_id,
                IndicatorScore.measured_at >= log.created_at,
                IndicatorScore.measured_at <= log.created_at + timedelta(days=window),
            ).order_by(IndicatorScore.measured_at.asc()).first()
            was_inactive = (before is None) or (not before.is_active)
            became_active = after is not None and after.is_active
            if was_inactive and became_active:
                converted += 1
    return {
        "n_calls_with_check": checked,
        "n_converted": converted,
        "rate_pct": round(converted / max(checked, 1) * 100, 1),
        "window_days": window,
    }


def leaderboard(db: Session, period_days: int = 30,
                indicator_id: Optional[int] = None,
                role: Optional[str] = "teleconseillere") -> List[Dict[str, Any]]:
    """Classement des téléconseillères (ou développeurs si role='developpeur')."""
    role_enum = UserRole(role) if role else UserRole.TELECONSEILLERE
    users = db.query(User).filter(User.role == role_enum, User.is_active == True).all()
    out = []
    for u in users:
        ev = evaluate_user(db, u.id, period_days, indicator_id)
        out.append(ev)
    out.sort(key=lambda x: x.get("impact_score", 0), reverse=True)
    for i, r in enumerate(out, 1):
        r["rank"] = i
    return out


def impact_by_zone(db: Session, user_id: int, indicator_id: int,
                   period_days: int = 60) -> Dict[str, Any]:
    """Avant/après pour chaque quartier travaillé par la téléconseillère."""
    cutoff = datetime.utcnow() - timedelta(days=period_days)
    indic = db.query(Indicator).get(indicator_id)
    if not indic: return {"error": "Indicateur introuvable"}

    logs = db.query(CallLog).filter(
        CallLog.user_id == user_id,
        CallLog.created_at >= cutoff,
    ).all()

    by_quartier = defaultdict(lambda: {"calls": 0, "before_active": 0, "after_active": 0, "n_pdvs": 0})

    for log in logs:
        pdv = log.pdv
        if not pdv: continue
        q = pdv.quartier or "Inconnu"
        by_quartier[q]["calls"] += 1
        by_quartier[q]["n_pdvs"] += 1

        before = db.query(IndicatorScore).filter(
            IndicatorScore.indicator_id == indicator_id,
            IndicatorScore.pdv_id == log.pdv_id,
            IndicatorScore.measured_at < log.created_at,
        ).order_by(IndicatorScore.measured_at.desc()).first()
        after = db.query(IndicatorScore).filter(
            IndicatorScore.indicator_id == indicator_id,
            IndicatorScore.pdv_id == log.pdv_id,
            IndicatorScore.measured_at >= log.created_at,
        ).order_by(IndicatorScore.measured_at.asc()).first()
        if before and before.is_active: by_quartier[q]["before_active"] += 1
        if after and after.is_active: by_quartier[q]["after_active"] += 1

    out = []
    for quartier, d in by_quartier.items():
        delta = d["after_active"] - d["before_active"]
        out.append({
            "quartier": quartier,
            "n_calls": d["calls"],
            "n_pdvs_calles": d["n_pdvs"],
            "before_active": d["before_active"],
            "after_active": d["after_active"],
            "delta": delta,
            "delta_label": "Amélioration" if delta > 0 else ("Stable" if delta == 0 else "Régression"),
        })
    out.sort(key=lambda x: x["delta"], reverse=True)
    return {"user_id": user_id, "indicator_id": indicator_id, "by_quartier": out}
