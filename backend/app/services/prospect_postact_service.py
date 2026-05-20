"""
Service Suivi Post-Activation.
===============================
- list_kpis            : tous les suivis
- generate_for_period  : créer les KPI pour une période (30/60/90j)
- mark_dormant         : flagger les puces dormantes
- recovery_targets     : prospects à inscrire au programme de récupération
- ai_calibration_data  : comparer prédiction vs réel pour calibrer l'IA
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.models.prospect import Prospect, ProspectStatus
from app.models.prospect_extras import PostActivationKPI


def list_kpis(db: Session, prospect_id: int = None) -> List[Dict[str, Any]]:
    q = db.query(PostActivationKPI)
    if prospect_id:
        q = q.filter(PostActivationKPI.prospect_id == prospect_id)
    items = q.order_by(PostActivationKPI.measured_at.desc()).limit(500).all()
    out = []
    for k in items:
        p = k.prospect
        out.append({
            "id": k.id,
            "prospect_id": k.prospect_id,
            "prospect_ref": p.reference if p else None,
            "prospect_nom": f"{p.prenom or ''} {p.nom or ''}".strip() if p else None,
            "period_days": k.period_days,
            "measured_at": k.measured_at.isoformat() if k.measured_at else None,
            "ca_predit": k.ca_predit, "ca_reel": k.ca_reel,
            "ca_gap_pct": round(((k.ca_reel - k.ca_predit) / k.ca_predit * 100), 1)
                          if k.ca_reel and k.ca_predit else None,
            "nb_transactions": k.nb_transactions,
            "nb_jours_actifs": k.nb_jours_actifs,
            "is_dormant": k.is_dormant,
            "satisfaction_score": k.satisfaction_score,
            "notes": k.notes,
        })
    return out


def generate_for_period(db: Session, period_days: int) -> int:
    """Créer un KPI pour chaque puce activée depuis exactement `period_days`."""
    now = datetime.utcnow()
    target_date = now - timedelta(days=period_days)
    window = timedelta(days=2)
    eligible = db.query(Prospect).filter(
        Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        Prospect.activated_at.between(target_date - window, target_date + window),
    ).all()
    created = 0
    for p in eligible:
        # Anti-doublon
        exists = db.query(PostActivationKPI).filter(
            PostActivationKPI.prospect_id == p.id,
            PostActivationKPI.period_days == period_days,
        ).first()
        if exists: continue
        # Valeur fictive : à brancher à votre table de performances mensuelles
        ca_predit = (p.om_ca_mensuel or 400_000) * (period_days / 30)
        # Simulation : ca_reel = predit ± 30%
        import random
        ca_reel = round(ca_predit * random.uniform(0.5, 1.3))
        nb_tx = random.randint(int(period_days * 2), int(period_days * 15))
        nb_actifs = random.randint(int(period_days * 0.4), period_days)
        is_dormant = nb_actifs < period_days * 0.3 or ca_reel < ca_predit * 0.3
        db.add(PostActivationKPI(
            prospect_id=p.id, pdv_id=p.activated_pdv_id, period_days=period_days,
            ca_predit=round(ca_predit), ca_reel=ca_reel,
            nb_transactions=nb_tx, nb_jours_actifs=nb_actifs,
            is_dormant=is_dormant,
            satisfaction_score=random.randint(2, 5) if not is_dormant else random.randint(1, 3),
        ))
        created += 1
    db.commit()
    return created


def dormant_puces(db: Session) -> List[Dict[str, Any]]:
    """Toutes les puces actuellement dormantes selon le dernier KPI."""
    items = db.query(PostActivationKPI).filter(PostActivationKPI.is_dormant == True).all()
    seen, out = set(), []
    for k in items:
        if k.prospect_id in seen: continue
        seen.add(k.prospect_id)
        p = k.prospect
        if not p: continue
        out.append({
            "prospect_id": p.id, "reference": p.reference,
            "nom": f"{p.prenom} {p.nom}".strip(),
            "puce_numero": p.puce_numero,
            "quartier": p.quartier,
            "activated_at": p.activated_at.isoformat() if p.activated_at else None,
            "ca_reel": k.ca_reel, "ca_predit": k.ca_predit,
            "period_days": k.period_days,
        })
    return out


def ai_calibration_data(db: Session) -> Dict[str, Any]:
    """Données pour calibrer le forecast IA : moyenne des écarts predit vs réel."""
    items = db.query(PostActivationKPI).filter(
        PostActivationKPI.ca_predit.isnot(None), PostActivationKPI.ca_reel.isnot(None)
    ).all()
    if not items:
        return {"count": 0, "avg_gap_pct": 0, "items": []}
    gaps = [((k.ca_reel - k.ca_predit) / k.ca_predit * 100) for k in items]
    return {
        "count": len(items),
        "avg_gap_pct": round(sum(gaps) / len(gaps), 1),
        "over_estimation_count": sum(1 for g in gaps if g < -10),
        "under_estimation_count": sum(1 for g in gaps if g > 10),
        "well_calibrated_count": sum(1 for g in gaps if -10 <= g <= 10),
    }
