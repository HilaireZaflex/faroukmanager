"""
Service Gamification.
======================
- leaderboard           : classement des développeurs
- compute_badges        : attribuer automatiquement les badges du mois
- list_badges           : badges d'un user
- list_objectives       : objectifs d'un user
- create_objective      : créer un objectif mensuel
- evaluate_bonus        : calculer le bonus si objectifs atteints
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.user import User, UserRole
from app.models.prospect import Prospect, ProspectStatus
from app.models.prospect_extras import DevBadge, DevObjective


def _current_period() -> str:
    return datetime.utcnow().strftime("%Y-%m")


def leaderboard(db: Session, period: Optional[str] = None) -> List[Dict[str, Any]]:
    """Classement des développeurs sur la période (mois courant par défaut)."""
    period = period or _current_period()
    devs = db.query(User).filter(User.role == UserRole.DEVELOPPEUR, User.is_active == True).all()
    out = []
    for d in devs:
        from datetime import datetime as _dt
        start = _dt.strptime(period + "-01", "%Y-%m-%d")
        from calendar import monthrange
        end = start.replace(day=monthrange(start.year, start.month)[1])

        n_validated = db.query(Prospect).filter(
            Prospect.visit_assigned_to_id == d.id,
            Prospect.dev_decision_at.between(start, end),
            Prospect.status != ProspectStatus.REFUSEE_DEV,
        ).count()
        n_activations = db.query(Prospect).filter(
            Prospect.puce_assigned_to_id == d.id,
            Prospect.activated_at.between(start, end),
            Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        ).count()
        # Score = validations * 10 + activations * 25
        score = n_validated * 10 + n_activations * 25

        # Badges sur la période
        badges = db.query(DevBadge).filter(
            DevBadge.user_id == d.id, DevBadge.period == period
        ).all()

        out.append({
            "user_id": d.id, "nom": d.nom, "prenom": d.prenom or "",
            "n_validated": n_validated,
            "n_activations": n_activations,
            "score": score,
            "badges_count": len(badges),
            "badges": [{"code": b.code, "name": b.name, "icon": b.icon} for b in badges],
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(out, 1):
        r["rank"] = i
    return out


BADGE_DEFS = {
    "top_prospecteur":  {"name": "Top Prospecteur du mois",   "icon": "🥇", "min_validated": 8},
    "activator_pro":    {"name": "Activator Pro",              "icon": "⚡", "min_activations": 5},
    "first_strike":     {"name": "Première activation",        "icon": "🎯", "min_activations": 1},
    "streak_master":    {"name": "Streak Master (10 visites)", "icon": "🔥", "min_validated": 10},
    "perfect_score":    {"name": "Sans aucun refus",           "icon": "💎", "no_rejection": True},
}


def compute_badges(db: Session, period: Optional[str] = None) -> int:
    period = period or _current_period()
    board = leaderboard(db, period)
    granted = 0
    for r in board:
        existing = {b.code for b in db.query(DevBadge).filter(
            DevBadge.user_id == r["user_id"], DevBadge.period == period).all()}

        for code, defi in BADGE_DEFS.items():
            if code in existing: continue
            ok = True
            if "min_validated" in defi and r["n_validated"] < defi["min_validated"]:
                ok = False
            if "min_activations" in defi and r["n_activations"] < defi["min_activations"]:
                ok = False
            if defi.get("no_rejection"):
                # Vérifier qu'il n'a aucun refus sur la période
                from datetime import datetime as _dt
                from calendar import monthrange
                start = _dt.strptime(period + "-01", "%Y-%m-%d")
                end = start.replace(day=monthrange(start.year, start.month)[1])
                ref = db.query(Prospect).filter(
                    Prospect.visit_assigned_to_id == r["user_id"],
                    Prospect.dev_decision_at.between(start, end),
                    Prospect.status == ProspectStatus.REFUSEE_DEV,
                ).count()
                if ref > 0: ok = False
            if ok and (r["n_validated"] > 0 or r["n_activations"] > 0):
                db.add(DevBadge(
                    user_id=r["user_id"], code=code,
                    name=defi["name"], icon=defi["icon"], period=period,
                ))
                granted += 1
    db.commit()
    return granted


def list_badges(db: Session, user_id: int) -> List[Dict[str, Any]]:
    return [{
        "id": b.id, "code": b.code, "name": b.name, "icon": b.icon,
        "earned_at": b.earned_at.isoformat() if b.earned_at else None,
        "period": b.period,
    } for b in db.query(DevBadge).filter(DevBadge.user_id == user_id).order_by(DevBadge.earned_at.desc()).all()]


def list_objectives(db: Session, user_id: Optional[int] = None,
                    period: Optional[str] = None) -> List[Dict[str, Any]]:
    q = db.query(DevObjective)
    if user_id: q = q.filter(DevObjective.user_id == user_id)
    if period: q = q.filter(DevObjective.period == period)
    out = []
    for o in q.all():
        # Calculer la progression
        from datetime import datetime as _dt
        from calendar import monthrange
        start = _dt.strptime(o.period + "-01", "%Y-%m-%d")
        end = start.replace(day=monthrange(start.year, start.month)[1])
        n_visits = db.query(Prospect).filter(
            Prospect.visit_assigned_to_id == o.user_id,
            Prospect.visit_assigned_at.between(start, end),
        ).count()
        n_val = db.query(Prospect).filter(
            Prospect.visit_assigned_to_id == o.user_id,
            Prospect.dev_decision_at.between(start, end),
            Prospect.status != ProspectStatus.REFUSEE_DEV,
        ).count()
        n_act = db.query(Prospect).filter(
            Prospect.puce_assigned_to_id == o.user_id,
            Prospect.activated_at.between(start, end),
            Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        ).count()

        all_done = (n_visits >= o.target_visits and n_val >= o.target_validations
                    and n_act >= o.target_activations)

        u = o.user
        out.append({
            "id": o.id, "user_id": o.user_id,
            "user_name": f"{u.prenom or ''} {u.nom}".strip() if u else "",
            "period": o.period,
            "target_visits": o.target_visits, "current_visits": n_visits,
            "target_validations": o.target_validations, "current_validations": n_val,
            "target_activations": o.target_activations, "current_activations": n_act,
            "progress_pct": round(((n_visits / max(o.target_visits, 1) +
                                    n_val / max(o.target_validations, 1) +
                                    n_act / max(o.target_activations, 1)) / 3 * 100), 1),
            "bonus_amount": o.bonus_amount,
            "bonus_earned": all_done,
        })
    return out


def create_objective(db: Session, user_id: int, period: str,
                     target_visits: int = 0, target_validations: int = 0,
                     target_activations: int = 0, bonus_amount: float = 0.0) -> DevObjective:
    o = db.query(DevObjective).filter(
        DevObjective.user_id == user_id, DevObjective.period == period
    ).first()
    if o:
        o.target_visits = target_visits; o.target_validations = target_validations
        o.target_activations = target_activations; o.bonus_amount = bonus_amount
    else:
        o = DevObjective(
            user_id=user_id, period=period,
            target_visits=target_visits, target_validations=target_validations,
            target_activations=target_activations, bonus_amount=bonus_amount,
        )
        db.add(o)
    db.commit(); db.refresh(o)
    return o
