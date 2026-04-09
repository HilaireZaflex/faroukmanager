"""
AI service wrapper for health scores, predictions, and analytics.
"""
from typing import Dict
from sqlalchemy.orm import Session
from app.ai.health_score import update_all_health_scores
from app.ai.predictions import get_at_risk_pdvs, forecast_network_ca, predict_decline
from app.ai.analytics import generate_orange_mali_report
from app.models.pdv import PDV
from app.models.performance import WeeklyPerformance


def run_health_score_update(db: Session) -> Dict:
    """
    Run health score update for all PDVs.
    
    Args:
        db: SQLAlchemy session
    
    Returns:
        dict: Statistics from the update
    """
    return update_all_health_scores(db)


def get_predictions_report(db: Session) -> Dict:
    """
    Generate predictions report for all PDVs.
    
    Args:
        db: SQLAlchemy session
    
    Returns:
        dict: {
            at_risk_pdvs: list,
            network_forecast: dict,
            total_at_risk: int
        }
    """
    at_risk = get_at_risk_pdvs(db, threshold=0.6)
    forecast = forecast_network_ca(db, horizon_weeks=4)
    
    return {
        "at_risk_pdvs": at_risk,
        "network_forecast": forecast,
        "total_at_risk": len(at_risk)
    }


def get_full_analytics(db: Session, annee: int, mois: int) -> Dict:
    """
    Get comprehensive analytics report for a specific month.
    
    Args:
        db: SQLAlchemy session
        annee: Year
        mois: Month (1-12)
    
    Returns:
        dict: Full analytics and KPI report
    """
    return generate_orange_mali_report(db, annee, mois)


def generate_whatif_simulation(db: Session, pdv_id: int, scenario: Dict) -> Dict:
    """
    Simulate impact of a scenario change on a PDV's health score and metrics.
    
    Scenario parameters:
    - weeks_active: int (0-4) - how many of next 4 weeks will be active
    - ca_boost_percent: float - percentage boost to CA (e.g., 10.0 for 10% boost)
    
    Args:
        db: SQLAlchemy session
        pdv_id: PDV identifier
        scenario: Dict with {weeks_active: int, ca_boost_percent: float}
    
    Returns:
        dict: {
            current_metrics: {...},
            simulated_metrics: {...},
            impact: {...}
        }
    """
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        return {"error": "PDV not found"}
    
    # Get current metrics
    weekly_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.pdv_id == pdv_id
    ).order_by(WeeklyPerformance.annee, WeeklyPerformance.semaine).all()
    
    current_health = pdv.health_score
    current_segment = pdv.segment
    
    # Simulate scenario
    weeks_active = scenario.get("weeks_active", 0)
    ca_boost_percent = scenario.get("ca_boost_percent", 0)
    
    # Create simulated performances
    simulated_perfs = weekly_perfs.copy()
    
    # Boost last week's CA and add active weeks
    if simulated_perfs:
        last_perf = simulated_perfs[-1]
        boosted_ca = last_perf.ca * (1 + ca_boost_percent / 100)
        # This is a simulation, not persisted
    
    # Calculate impact
    from app.ai.health_score import calculate_health_score, classify_segment
    
    # Simulate updated health score based on recent activity boost
    simulated_health = current_health
    if weeks_active > 0:
        activity_boost = (weeks_active / 4) * 30 * 0.5  # Partial boost to activity component
        simulated_health = min(100, current_health + activity_boost)
    
    if ca_boost_percent > 0:
        volume_boost = min(15, (ca_boost_percent / 100) * 15 * 0.5)  # Partial boost to volume
        simulated_health = min(100, simulated_health + volume_boost)
    
    simulated_segment = classify_segment(simulated_health, 0)
    
    return {
        "current_metrics": {
            "health_score": current_health,
            "segment": current_segment,
            "medaille": pdv.medaille.value if pdv.medaille else "AUCUNE"
        },
        "simulated_metrics": {
            "health_score": simulated_health,
            "segment": simulated_segment,
            "estimated_ca_boost": weekly_perfs[-1].ca * (ca_boost_percent / 100) if weekly_perfs else 0
        },
        "impact": {
            "health_score_change": simulated_health - current_health,
            "segment_change": simulated_segment != current_segment,
            "weeks_active_impact": weeks_active,
            "ca_boost_percent": ca_boost_percent
        },
        "scenario": scenario
    }
