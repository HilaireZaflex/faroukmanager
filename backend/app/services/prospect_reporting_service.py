"""
Service Reporting & Analytics Prospection.
==========================================
- funnel              : entonnoir de conversion
- per_developer       : taux de validation, délai visite, taux activation par dev
- per_zone            : performance par quartier/zone
- rc_pipeline         : combien de demandes en attente, puces dispo
- time_to_activation  : délai moyen entre soumission et activation
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.prospect import (
    Prospect, ProspectHistory, ProspectStatus, DecisionType,
)
from app.models.user import User, UserRole
from app.models.prospect_extras import PuceStock, PuceStockStatus


def funnel(db: Session) -> Dict[str, Any]:
    """Entonnoir : Soumissions → Visites → Validations → Approbations → Activations."""
    total = db.query(func.count(Prospect.id)).scalar() or 0
    visites = db.query(func.count(Prospect.id)).filter(Prospect.visit_assigned_at.isnot(None)).scalar() or 0
    validees = db.query(func.count(Prospect.id)).filter(Prospect.dev_decision_at.isnot(None),
                                                        Prospect.status != ProspectStatus.REFUSEE_DEV).scalar() or 0
    approuvees = db.query(func.count(Prospect.id)).filter(Prospect.status.in_([
        ProspectStatus.APPROUVEE_RC, ProspectStatus.PUCE_ATTRIBUEE, ProspectStatus.PUCE_ACTIVEE,
    ])).scalar() or 0
    activees = db.query(func.count(Prospect.id)).filter(Prospect.status == ProspectStatus.PUCE_ACTIVEE).scalar() or 0
    refusees = db.query(func.count(Prospect.id)).filter(Prospect.status.in_([
        ProspectStatus.REFUSEE_DEV, ProspectStatus.REFUSEE_RC, ProspectStatus.ANNULEE,
    ])).scalar() or 0

    def pct(n, d): return round(n / d * 100, 1) if d else 0.0

    steps = [
        {"step": "Soumissions",            "count": total,      "pct": 100},
        {"step": "Visites planifiées",      "count": visites,    "pct": pct(visites, total)},
        {"step": "Validations Dev",         "count": validees,   "pct": pct(validees, total)},
        {"step": "Approbations RC",         "count": approuvees, "pct": pct(approuvees, total)},
        {"step": "Activations terrain",     "count": activees,   "pct": pct(activees, total)},
    ]
    return {"steps": steps, "refusees_total": refusees, "conversion_globale": pct(activees, total)}


def per_developer(db: Session) -> List[Dict[str, Any]]:
    devs = db.query(User).filter(User.role == UserRole.DEVELOPPEUR).all()
    out = []
    for d in devs:
        # Visites traitées
        n_assigned = db.query(Prospect).filter(Prospect.visit_assigned_to_id == d.id).count()
        n_validated = db.query(Prospect).filter(
            Prospect.visit_assigned_to_id == d.id,
            Prospect.dev_decision_at.isnot(None),
            Prospect.status != ProspectStatus.REFUSEE_DEV,
        ).count()
        n_rejected = db.query(Prospect).filter(
            Prospect.visit_assigned_to_id == d.id,
            Prospect.status == ProspectStatus.REFUSEE_DEV,
        ).count()

        # Activations effectuées
        n_activations = db.query(Prospect).filter(
            Prospect.puce_assigned_to_id == d.id,
            Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        ).count()
        n_pending_activation = db.query(Prospect).filter(
            Prospect.puce_assigned_to_id == d.id,
            Prospect.status == ProspectStatus.PUCE_ATTRIBUEE,
        ).count()

        # Délai moyen visite
        visited = db.query(Prospect).filter(
            Prospect.visit_assigned_to_id == d.id,
            Prospect.dev_decision_at.isnot(None),
        ).all()
        if visited:
            delais = [(p.dev_decision_at - p.visit_assigned_at).total_seconds() / 3600 for p in visited if p.visit_assigned_at]
            avg_delay = round(sum(delais) / len(delais), 1) if delais else 0
        else:
            avg_delay = 0

        taux_val = round(n_validated / n_assigned * 100, 1) if n_assigned else 0
        out.append({
            "user_id": d.id, "nom": d.nom, "prenom": d.prenom or "",
            "n_assigned": n_assigned,
            "n_validated": n_validated,
            "n_rejected": n_rejected,
            "n_activations": n_activations,
            "n_pending_activation": n_pending_activation,
            "taux_validation": taux_val,
            "delai_moyen_visite_h": avg_delay,
        })
    return sorted(out, key=lambda x: x["n_activations"], reverse=True)


def per_zone(db: Session) -> List[Dict[str, Any]]:
    rows = db.query(
        Prospect.quartier,
        func.count(Prospect.id).label("total"),
        func.sum(func.cast(Prospect.status == ProspectStatus.PUCE_ACTIVEE, type_=func.coalesce(0, 0).type)).label("activees"),
    ).group_by(Prospect.quartier).all()
    out = []
    for quartier, total, activees in rows:
        if not quartier:
            continue
        # Recompte propre (cross-DB friendly)
        act = db.query(Prospect).filter(
            Prospect.quartier == quartier,
            Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        ).count()
        out.append({
            "quartier": quartier,
            "total": total,
            "activees": act,
            "taux_conversion": round(act / total * 100, 1) if total else 0,
        })
    return sorted(out, key=lambda x: x["total"], reverse=True)


def rc_pipeline(db: Session) -> Dict[str, Any]:
    pending = db.query(Prospect).filter(Prospect.status.in_([
        ProspectStatus.VALIDEE_DEV, ProspectStatus.EN_ATTENTE_RC,
    ])).count()
    approved_pending_assign = db.query(Prospect).filter(
        Prospect.status == ProspectStatus.APPROUVEE_RC).count()
    awaiting_activation = db.query(Prospect).filter(
        Prospect.status == ProspectStatus.PUCE_ATTRIBUEE).count()
    puces_dispo = db.query(PuceStock).filter(PuceStock.status == PuceStockStatus.DISPONIBLE).count()
    return {
        "demandes_en_attente_rc": pending,
        "approuvees_en_attente_attribution": approved_pending_assign,
        "puces_attribuees_en_attente_activation": awaiting_activation,
        "puces_disponibles": puces_dispo,
        "ratio_demandes_vs_stock": round(pending / puces_dispo, 2) if puces_dispo else None,
    }


def time_to_activation(db: Session) -> Dict[str, Any]:
    activated = db.query(Prospect).filter(
        Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        Prospect.activated_at.isnot(None),
        Prospect.submitted_at.isnot(None),
    ).all()
    if not activated:
        return {"count": 0, "avg_hours": 0, "min_hours": 0, "max_hours": 0, "median_hours": 0}
    deltas = sorted([(p.activated_at - p.submitted_at).total_seconds() / 3600 for p in activated])
    n = len(deltas)
    median = deltas[n // 2] if n % 2 else (deltas[n//2 - 1] + deltas[n//2]) / 2
    return {
        "count": n,
        "avg_hours": round(sum(deltas) / n, 1),
        "min_hours": round(min(deltas), 1),
        "max_hours": round(max(deltas), 1),
        "median_hours": round(median, 1),
        "avg_days": round(sum(deltas) / n / 24, 1),
    }
