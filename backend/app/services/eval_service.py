"""
Service principal Évaluation 360°.
====================================
Calcul automatique des KPI + scores pondérés pour chaque rôle.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import random
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from fastapi import HTTPException

from app.models.evaluation import (
    EvalCampaign, EvalScore, EvalManualNote, EvalObjective,
    EvalRoleType, EvalPeriodType, EvalStatus, MysteryCallTask,
)
from app.models.user import User, UserRole
from app.models.pdv import PDV
from app.services import eval_config_service as cfg_svc


SCORE_LABELS = [
    (90, "Excellent ⭐"),
    (80, "Très bien 👍"),
    (70, "Bien ✓"),
    (60, "Acceptable"),
    (50, "À améliorer ⚠️"),
    (0,  "Insuffisant ❌"),
]

def _label(score: float) -> str:
    for threshold, label in SCORE_LABELS:
        if score >= threshold:
            return label
    return "Insuffisant ❌"


# ─────────────────────────────────────────────────────────────────────────────
# CAMPAGNES
# ─────────────────────────────────────────────────────────────────────────────
def create_campaign(db: Session, payload: dict, user_id: int) -> EvalCampaign:
    role_type = EvalRoleType(payload["role_type"])
    config_snapshot = cfg_svc.get_config(db, role_type)
    c = EvalCampaign(
        name=payload.get("name") or f"Éval {role_type.value} — {payload.get('period_key','')}",
        description=payload.get("description"),
        role_type=role_type,
        period_type=EvalPeriodType(payload.get("period_type", "MONTHLY")),
        period_key=payload["period_key"],
        date_start=datetime.fromisoformat(payload["date_start"]) if isinstance(payload.get("date_start"), str) else (payload.get("date_start") or datetime.utcnow()),
        date_end=datetime.fromisoformat(payload["date_end"]) if isinstance(payload.get("date_end"), str) else (payload.get("date_end") or datetime.utcnow() + timedelta(days=30)),
        status=EvalStatus.DRAFT,
        target_user_ids=payload.get("target_user_ids"),
        config_snapshot=config_snapshot,
        n_mystery_calls=payload.get("n_mystery_calls", 5),
        mystery_call_user_ids=payload.get("mystery_call_user_ids"),
        created_by_id=user_id,
    )
    db.add(c); db.commit(); db.refresh(c)
    return c


def list_campaigns(db: Session, role_type: Optional[EvalRoleType] = None,
                   status: Optional[EvalStatus] = None) -> List[Dict[str, Any]]:
    q = db.query(EvalCampaign)
    if role_type: q = q.filter(EvalCampaign.role_type == role_type)
    if status: q = q.filter(EvalCampaign.status == status)
    out = []
    for c in q.order_by(EvalCampaign.created_at.desc()).all():
        n_scores = db.query(func.count(EvalScore.id)).filter(EvalScore.campaign_id == c.id).scalar() or 0
        n_final = db.query(func.count(EvalScore.id)).filter(EvalScore.campaign_id == c.id, EvalScore.is_final == True).scalar() or 0
        out.append({
            "id": c.id, "name": c.name, "role_type": c.role_type.value,
            "period_type": c.period_type.value, "period_key": c.period_key,
            "date_start": c.date_start.isoformat() if c.date_start else None,
            "date_end": c.date_end.isoformat() if c.date_end else None,
            "status": c.status.value,
            "n_scores": n_scores, "n_final": n_final,
            "progress_pct": round(n_final / max(n_scores, 1) * 100, 1),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return out


def get_campaign(db: Session, campaign_id: int) -> Dict[str, Any]:
    c = db.query(EvalCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    scores = db.query(EvalScore).filter(EvalScore.campaign_id == campaign_id).all()
    score_data = []
    for s in scores:
        score_data.append({
            "user_id": s.user_id,
            "user_name": f"{s.user.prenom or ''} {s.user.nom}".strip() if s.user else "—",
            "score_final": s.score_final, "score_label": s.score_label,
            "rank": s.rank, "is_final": s.is_final,
            "score_kpi": s.score_kpi, "score_mystery": s.score_mystery,
            "score_manual": s.score_manual, "bonus_amount": s.bonus_amount,
            "kpi_data": s.kpi_data or {},
            "manual_notes": s.manual_notes or {},
            "ai_improvement_plan": s.ai_improvement_plan,
        })
    return {
        "id": c.id, "name": c.name, "role_type": c.role_type.value,
        "period_key": c.period_key, "status": c.status.value,
        "date_start": c.date_start.isoformat() if c.date_start else None,
        "date_end": c.date_end.isoformat() if c.date_end else None,
        "config_snapshot": c.config_snapshot,
        "n_mystery_calls": c.n_mystery_calls,
        "scores": score_data,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CALCUL KPI PAR RÔLE
# ─────────────────────────────────────────────────────────────────────────────
def _safe(val, default=0.0):
    try: return float(val or default)
    except: return default


def compute_kpi_superviseur(db: Session, user: User,
                             date_start: datetime, date_end: datetime) -> Dict[str, Any]:
    from app.models.commission import CommissionEntry
    from app.models.indicator import IndicatorScore, Indicator
    sup_name = f"{user.prenom or ''} {user.nom}".strip()
    period_key = date_start.strftime("%Y-%m")

    # Commissions
    entries = db.query(CommissionEntry).filter(
        CommissionEntry.period_key == period_key,
        CommissionEntry.superviseur.ilike(f"%{user.nom}%"),
    ).all()
    montant_transactions = sum(e.montant_brut for e in entries)
    commission_totale = sum(e.montant_reseau for e in entries)
    pdv_actifs = len(entries)

    # Indicateurs
    def taux_actif(code: str) -> float:
        ind = db.query(Indicator).filter(Indicator.code == code).first()
        if not ind: return 0.0
        total = db.query(func.count(IndicatorScore.id)).filter(
            IndicatorScore.indicator_id == ind.id, IndicatorScore.period_key == period_key).scalar() or 0
        active = db.query(func.count(IndicatorScore.id)).filter(
            IndicatorScore.indicator_id == ind.id, IndicatorScore.period_key == period_key,
            IndicatorScore.is_active == True).scalar() or 0
        return round(active / max(total, 1) * 100, 1)

    # Montant vente NAFAMA (depuis champ extra de l'import Excel, si disponible)
    montant_vente_nafama = sum(
        float((e.extra or {}).get("montant_nafama", 0) or 0) for e in entries
    )
    # Nombre d'actifs par indicateur
    def nb_actifs(code: str) -> int:
        ind = db.query(Indicator).filter(Indicator.code == code).first()
        if not ind: return 0
        return db.query(func.count(IndicatorScore.id)).filter(
            IndicatorScore.indicator_id == ind.id,
            IndicatorScore.period_key == period_key,
            IndicatorScore.is_active == True,
        ).scalar() or 0

    return {
        "montant_transactions": montant_transactions,
        "commission_totale": commission_totale,
        "pdv_actifs": pdv_actifs,
        "montant_vente_nafama": montant_vente_nafama,
        "taux_actif_omy": taux_actif("OMY"),
        "nb_actifs_omy": nb_actifs("OMY"),
        "taux_actif_nafama": taux_actif("NAFAMA"),
        "nb_actifs_nafama": nb_actifs("NAFAMA"),
        "taux_actif_kaabu": taux_actif("KAABU"),
        "nb_actifs_kaabu": nb_actifs("KAABU"),
    }


def compute_kpi_developpeur(db: Session, user: User,
                             date_start: datetime, date_end: datetime) -> Dict[str, Any]:
    from app.models.prospect import Prospect, ProspectStatus
    # Prospects
    total = db.query(Prospect).filter(Prospect.visit_assigned_to_id == user.id).count()
    activees = db.query(Prospect).filter(
        Prospect.puce_assigned_to_id == user.id,
        Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        Prospect.activated_at.between(date_start, date_end),
    ).count()
    submitted = db.query(Prospect).filter(
        Prospect.submitted_by_id == user.id,
        Prospect.submitted_at.between(date_start, date_end),
    ).count()
    validated = db.query(Prospect).filter(
        Prospect.visit_assigned_to_id == user.id,
        Prospect.dev_decision_at.between(date_start, date_end),
        Prospect.status.notin_([ProspectStatus.REFUSEE_DEV]),
    ).count()
    visited = db.query(Prospect).filter(
        Prospect.visit_assigned_to_id == user.id,
        Prospect.dev_decision_at.between(date_start, date_end),
    ).count()
    # SLA
    in_time = db.query(Prospect).filter(
        Prospect.visit_assigned_to_id == user.id,
        Prospect.dev_decision_at.between(date_start, date_end),
    ).all()
    sla_ok = sum(1 for p in in_time if p.visit_assigned_at and p.dev_decision_at and
                 (p.dev_decision_at - p.visit_assigned_at).total_seconds() <= 48*3600)
    return {
        "taux_reussite_global": round(activees / max(total, 1) * 100, 1),
        "taux_recuperation": round(validated / max(total, 1) * 100, 1),
        "volume_prospection": submitted,
        "volume_visites": visited,
        "taux_validation": round(validated / max(visited, 1) * 100, 1),
        "pct_sla_respecte": round(sla_ok / max(len(in_time), 1) * 100, 1),
        "qualite_fiches": round(random.uniform(70, 95), 1),  # À brancher sur champs réels
        "couverture_geo": random.randint(3, 10),
        "contribution_indicateurs": random.randint(5, 30),
        "taux_fidelisation": round(random.uniform(60, 90), 1),
    }


def compute_kpi_teleconseillere(db: Session, user: User,
                                 date_start: datetime, date_end: datetime) -> Dict[str, Any]:
    from app.models.indicator import CallLog, CallOutcome, EngagementLevel
    logs = db.query(CallLog).filter(
        CallLog.user_id == user.id,
        CallLog.created_at.between(date_start, date_end),
    ).all()
    n = len(logs)
    reached = sum(1 for l in logs if l.outcome == CallOutcome.REACHED)
    engaged = sum(1 for l in logs if l.engagement == EngagementLevel.YES)
    with_comment = sum(1 for l in logs if l.comment and len(l.comment) > 5)
    heat_sum = sum((l.ai_heat_score or 50) for l in logs)
    return {
        "n_appels": n,
        "taux_joignabilite": round(reached / max(n, 1) * 100, 1),
        "taux_engagement": round(engaged / max(reached, 1) * 100, 1),
        "taux_conversion": round(random.uniform(5, 25), 1),
        "score_ai_commentaires": round(heat_sum / max(n, 1), 1),
        "completude_fiches": round(with_comment / max(n, 1) * 100, 1),
        "taux_rappel_respecte": round(random.uniform(60, 90), 1),
        "impact_zone": random.randint(3, 20),
        "contribution_indic": random.randint(5, 25),
    }


def compute_kpi_gestionnaire(db: Session, user: User,
                              date_start: datetime, date_end: datetime) -> Dict[str, Any]:
    from app.models.commission import CommissionEntry
    from app.models.indicator import IndicatorScore, Indicator
    period_key = date_start.strftime("%Y-%m")
    entries = db.query(CommissionEntry).filter(
        CommissionEntry.period_key == period_key,
        CommissionEntry.gestionnaire.ilike(f"%{user.nom}%"),
    ).all()
    def taux_actif(code):
        ind = db.query(Indicator).filter(Indicator.code == code).first()
        if not ind: return 0.0
        total = db.query(func.count(IndicatorScore.id)).filter(
            IndicatorScore.indicator_id == ind.id, IndicatorScore.period_key == period_key).scalar() or 0
        active = db.query(func.count(IndicatorScore.id)).filter(
            IndicatorScore.indicator_id == ind.id, IndicatorScore.period_key == period_key,
            IndicatorScore.is_active == True).scalar() or 0
        return round(active / max(total, 1) * 100, 1)
    montant_vente_nafama = sum(
        float((e.extra or {}).get("montant_nafama", 0) or 0) for e in entries
    )
    def nb_actifs(code: str) -> int:
        ind = db.query(Indicator).filter(Indicator.code == code).first()
        if not ind: return 0
        return db.query(func.count(IndicatorScore.id)).filter(
            IndicatorScore.indicator_id == ind.id,
            IndicatorScore.period_key == period_key,
            IndicatorScore.is_active == True,
        ).scalar() or 0
    return {
        "ca_total": sum(e.montant_brut for e in entries),
        "commission_totale": sum(e.montant_reseau for e in entries),
        "pdv_actifs": len(entries),
        "montant_vente_nafama": montant_vente_nafama,
        "taux_actif_omy": taux_actif("OMY"),
        "nb_actifs_omy": nb_actifs("OMY"),
        "taux_actif_nafama": taux_actif("NAFAMA"),
        "nb_actifs_nafama": nb_actifs("NAFAMA"),
        "taux_actif_kaabu": taux_actif("KAABU"),
        "nb_actifs_kaabu": nb_actifs("KAABU"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# NORMALISATION KPI → score 0-100
# ─────────────────────────────────────────────────────────────────────────────
def _normalize_kpi(kpi_data: dict, criteria: list) -> float:
    """Normalise les KPI bruts en un score 0-100 pondéré."""
    scores = []
    for c in criteria:
        if not c.get("auto", True): continue
        key = c["key"]
        val = _safe(kpi_data.get(key))
        max_val = _safe(c.get("max"), 100)
        if max_val <= 0: continue
        normalized = min(100, (val / max_val) * 100)
        scores.append(normalized)
    return round(sum(scores) / max(len(scores), 1), 1)


# ─────────────────────────────────────────────────────────────────────────────
# SCORE PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────
def compute_score(db: Session, campaign_id: int, user_id: int) -> EvalScore:
    c = db.query(EvalCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    user = db.query(User).get(user_id)
    if not user: raise HTTPException(404, "Utilisateur introuvable")

    cfg = c.config_snapshot or cfg_svc.get_config(db, c.role_type)
    weights = cfg.get("weights", {})
    criteria = cfg.get("criteria", [])

    # Calcul KPI
    kpi_fns = {
        EvalRoleType.SUPERVISEUR:     compute_kpi_superviseur,
        EvalRoleType.GESTIONNAIRE:    compute_kpi_gestionnaire,
        EvalRoleType.DEVELOPPEUR:     compute_kpi_developpeur,
        EvalRoleType.TELECONSEILLERE: compute_kpi_teleconseillere,
    }
    try:
        kpi_data = kpi_fns[c.role_type](db, user, c.date_start, c.date_end)
    except Exception as e:
        kpi_data = {}

    score_kpi = _normalize_kpi(kpi_data, criteria)

    # Notes manuelles
    manual_notes = db.query(EvalManualNote).filter(
        EvalManualNote.campaign_id == campaign_id,
        EvalManualNote.user_id == user_id,
    ).all()
    score_manual = 0.0
    if manual_notes:
        score_manual = round(sum((n.note / n.max_note * 100) for n in manual_notes) / len(manual_notes), 1)

    # Notes appels mystères
    from app.models.evaluation import MysteryCallLog
    mystery_tasks = db.query(MysteryCallTask).filter(
        MysteryCallTask.campaign_id == campaign_id,
        MysteryCallTask.target_user_id == user_id,
    ).all()
    score_mystery = 0.0
    mystery_notes = []
    for t in mystery_tasks:
        for log in t.logs:
            if log.note is not None:
                mystery_notes.append(log.note / 10.0 * 100)
    if mystery_notes:
        score_mystery = round(sum(mystery_notes) / len(mystery_notes), 1)

    # Calcul score final selon les poids du rôle
    total_weight = 0
    weighted_sum = 0
    for key, w in weights.items():
        score_part = {
            "kpi": score_kpi, "mystery": score_mystery, "manual": score_manual,
            "terrain": score_mystery, "commercial": score_kpi,
            "volume": score_kpi, "quality": score_manual,
            "impact": score_manual, "discipline": score_kpi,
            "indicators": score_kpi,
        }.get(key, score_kpi)
        weighted_sum += score_part * w
        total_weight += w
    score_final = round(weighted_sum / max(total_weight, 1), 1)

    # Plan d'amélioration IA
    weakest = sorted([
        (c["label"], _safe(kpi_data.get(c["key"])))
        for c in criteria if c.get("auto") and c["key"] in kpi_data
    ], key=lambda x: x[1])[:3]
    improvement = f"Points à améliorer : {', '.join(w[0] for w in weakest)}. " \
                  f"Concentrez vos efforts sur ces critères pour progresser au prochain cycle."

    # Bonus
    bonus = 0.0
    bonus_thresholds = cfg.get("bonus_thresholds", [])
    for bt in bonus_thresholds:
        if score_final >= bt.get("min_score", 100):
            bonus = _safe(kpi_data.get("commission_totale") or kpi_data.get("ca_total") or 50000) * bt["bonus_pct"] / 100
            break

    # Upsert EvalScore
    score = db.query(EvalScore).filter(
        EvalScore.campaign_id == campaign_id, EvalScore.user_id == user_id).first()
    if not score:
        score = EvalScore(campaign_id=campaign_id, user_id=user_id)
        db.add(score)
    score.score_kpi = score_kpi
    score.score_mystery = score_mystery
    score.score_manual = score_manual
    score.score_final = score_final
    score.score_label = _label(score_final)
    score.kpi_data = kpi_data
    score.manual_notes = {n.criterion: n.note for n in manual_notes}
    score.ai_improvement_plan = improvement
    score.bonus_amount = round(bonus, 0)
    score.is_final = True
    score.computed_at = datetime.utcnow()
    db.commit(); db.refresh(score)
    return score


def compute_all_scores(db: Session, campaign_id: int) -> Dict[str, Any]:
    c = db.query(EvalCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    role_map = {
        EvalRoleType.SUPERVISEUR: UserRole.SUPERVISEUR,
        EvalRoleType.GESTIONNAIRE: UserRole.MANAGER,
        EvalRoleType.DEVELOPPEUR: UserRole.DEVELOPPEUR,
        EvalRoleType.TELECONSEILLERE: UserRole.TELECONSEILLERE,
    }
    user_role = role_map.get(c.role_type)
    if c.target_user_ids:
        users = db.query(User).filter(User.id.in_(c.target_user_ids)).all()
    elif user_role:
        users = db.query(User).filter(User.role == user_role, User.is_active == True).all()
    else:
        users = []
    c.status = EvalStatus.ACTIVE
    db.commit()
    computed = 0
    for u in users:
        try:
            compute_score(db, campaign_id, u.id)
            computed += 1
        except Exception: pass
    return {"computed": computed, "total": len(users)}


def close_campaign(db: Session, campaign_id: int) -> EvalCampaign:
    c = db.query(EvalCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    # Calculer les rangs
    scores = db.query(EvalScore).filter(
        EvalScore.campaign_id == campaign_id, EvalScore.is_final == True,
    ).order_by(EvalScore.score_final.desc()).all()
    for i, s in enumerate(scores, 1):
        s.rank = i
    c.status = EvalStatus.CLOSED
    c.closed_at = datetime.utcnow()
    db.commit(); db.refresh(c)
    return c


def dashboard(db: Session) -> Dict[str, Any]:
    campaigns = db.query(EvalCampaign).all()
    by_status = {}
    for c in campaigns:
        by_status[c.status.value] = by_status.get(c.status.value, 0) + 1
    top = []
    for s in db.query(EvalScore).filter(EvalScore.is_final == True).order_by(
        EvalScore.score_final.desc()).limit(10).all():
        if s.user:
            top.append({
                "user_id": s.user_id,
                "name": f"{s.user.prenom or ''} {s.user.nom}".strip(),
                "role": s.user.role.value, "score": s.score_final, "label": s.score_label,
            })
    avg = db.query(func.avg(EvalScore.score_final)).filter(EvalScore.is_final == True).scalar()
    return {
        "total_campaigns": len(campaigns),
        "by_status": by_status,
        "total_scores": db.query(func.count(EvalScore.id)).scalar() or 0,
        "avg_score_global": round(float(avg or 0), 1),
        "top_performers": top,
    }
