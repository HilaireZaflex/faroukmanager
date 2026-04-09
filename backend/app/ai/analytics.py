"""
Advanced analytics and reporting for Orange Mali PDV network.
"""
from typing import Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.pdv import PDV
from app.models.performance import MonthlyPerformance, WeeklyPerformance
import statistics


def calculate_gini_coefficient(values: List[float]) -> float:
    """
    Calculate Gini coefficient (concentration index).
    0 = perfect equality, 1 = maximum concentration.
    
    Args:
        values: List of numeric values
    
    Returns:
        float: Gini coefficient (0-1)
    """
    if not values or len(values) < 2:
        return 0.0
    
    # Sort values
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    
    # Calculate cumulative sum
    cumsum = sum((i + 1) * sorted_vals[i] for i in range(n))
    
    # Gini formula
    total = sum(sorted_vals)
    if total == 0:
        return 0.0
    
    gini = (2 * cumsum) / (n * total) - (n + 1) / n
    
    return max(0.0, min(1.0, gini))


def get_pareto_pdvs(monthly_performances: List[MonthlyPerformance], target_percent: float = 80) -> Dict:
    """
    Get Pareto analysis: which PDVs account for target_percent of total CA.
    
    Args:
        monthly_performances: List of MonthlyPerformance records
        target_percent: Target percentage (default 80 for 80/20 rule)
    
    Returns:
        dict: {
            pareto_pdvs: list of {pdv_id, ca_total, cumulative_percent},
            cum_ca_percent: float,
            pareto_count: int,
            total_pdvs: int
        }
    """
    # Aggregate by PDV
    pdv_ca = {}
    for perf in monthly_performances:
        if perf.pdv_id not in pdv_ca:
            pdv_ca[perf.pdv_id] = 0
        pdv_ca[perf.pdv_id] += perf.ca
    
    # Sort by CA descending
    sorted_pdvs = sorted(pdv_ca.items(), key=lambda x: x[1], reverse=True)
    
    # Find Pareto PDVs
    total_ca = sum(ca for _, ca in sorted_pdvs)
    cumulative_ca = 0
    pareto_pdvs = []
    
    for pdv_id, ca in sorted_pdvs:
        cumulative_ca += ca
        cumulative_percent = (cumulative_ca / total_ca * 100) if total_ca > 0 else 0
        pareto_pdvs.append({
            "pdv_id": pdv_id,
            "ca_total": ca,
            "cumulative_percent": cumulative_percent
        })
        
        if cumulative_percent >= target_percent:
            break
    
    return {
        "pareto_pdvs": pareto_pdvs,
        "cum_ca_percent": (cumulative_ca / total_ca * 100) if total_ca > 0 else 0,
        "pareto_count": len(pareto_pdvs),
        "total_pdvs": len(sorted_pdvs)
    }


def get_zone_heatmap(db: Session, annee: int, mois: int) -> List[Dict]:
    """
    Get zone performance heatmap data.
    
    Args:
        db: SQLAlchemy session
        annee: Year
        mois: Month (1-12)
    
    Returns:
        list: List of {zone, ca_total, nb_pdvs, avg_ca, pct_network}
    """
    # Get all PDVs and their performance for the month
    perfs = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).all()
    
    # Get zone data
    zone_data = {}
    for perf in perfs:
        pdv = db.query(PDV).filter(PDV.id == perf.pdv_id).first()
        if pdv and pdv.zone:
            if pdv.zone not in zone_data:
                zone_data[pdv.zone] = {"ca": 0, "pdvs": set()}
            zone_data[pdv.zone]["ca"] += perf.ca
            zone_data[pdv.zone]["pdvs"].add(pdv.id)
    
    # Calculate total network CA
    total_network_ca = sum(data["ca"] for data in zone_data.values())
    
    # Format result
    heatmap = []
    for zone, data in sorted(zone_data.items()):
        nb_pdvs = len(data["pdvs"])
        avg_ca = data["ca"] / nb_pdvs if nb_pdvs > 0 else 0
        pct_network = (data["ca"] / total_network_ca * 100) if total_network_ca > 0 else 0
        
        heatmap.append({
            "zone": zone,
            "ca_total": data["ca"],
            "nb_pdvs": nb_pdvs,
            "avg_ca": avg_ca,
            "pct_network": pct_network
        })
    
    # Sort by CA total descending
    heatmap.sort(key=lambda x: x["ca_total"], reverse=True)
    
    return heatmap


def generate_orange_mali_report(db: Session, annee: int, mois: int) -> Dict:
    """
    Generate comprehensive KPI report for Orange Mali management.
    
    Args:
        db: SQLAlchemy session
        annee: Year
        mois: Month (1-12)
    
    Returns:
        dict: {
            total_ca: float,
            pdvs_actifs: int,
            pdvs_inactifs: int,
            taux_activite: float (percent),
            top_zones: list,
            pareto_data: dict,
            evolution_vs_mois_precedent: dict,
            health_distribution: dict,
            concentration_gini: float,
            at_risk_pdvs_count: int
        }
    """
    # Get current month performances
    current_month_perfs = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).all()
    
    # Get previous month performances
    prev_mois = mois - 1 if mois > 1 else 12
    prev_annee = annee if mois > 1 else annee - 1
    prev_month_perfs = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == prev_annee,
            MonthlyPerformance.mois == prev_mois
        )
    ).all()
    
    # Calculate metrics for current month
    total_ca = sum(p.ca for p in current_month_perfs)
    pdvs_actifs = sum(1 for p in current_month_perfs if p.est_actif)
    
    # Total unique PDVs
    all_pdvs = db.query(PDV).all()
    total_pdvs = len(all_pdvs)
    pdvs_inactifs = total_pdvs - pdvs_actifs
    
    taux_activite = (pdvs_actifs / total_pdvs * 100) if total_pdvs > 0 else 0
    
    # Top zones
    zone_heatmap = get_zone_heatmap(db, annee, mois)
    top_zones = zone_heatmap[:5]
    
    # Pareto analysis
    pareto_data = get_pareto_pdvs(current_month_perfs, target_percent=80)
    
    # Evolution vs previous month
    total_ca_prev = sum(p.ca for p in prev_month_perfs)
    evolution_ca = total_ca - total_ca_prev
    evolution_percent = (evolution_ca / total_ca_prev * 100) if total_ca_prev > 0 else 0
    
    pdvs_actifs_prev = sum(1 for p in prev_month_perfs if p.est_actif)
    evolution_actifs = pdvs_actifs - pdvs_actifs_prev
    
    # Health distribution
    pdvs = db.query(PDV).all()
    health_scores = [p.health_score for p in pdvs]
    segments = {}
    for p in pdvs:
        segment = p.segment or "Unknown"
        segments[segment] = segments.get(segment, 0) + 1
    
    # Concentration (Gini coefficient)
    ca_values = [p.ca for p in current_month_perfs if p.ca > 0]
    gini = calculate_gini_coefficient(ca_values)
    
    # At-risk PDVs
    at_risk_count = sum(1 for p in pdvs if p.score_risque > 0.6)
    
    return {
        "report_date": f"{annee}-{mois:02d}",
        "total_ca": total_ca,
        "pdvs_actifs": pdvs_actifs,
        "pdvs_inactifs": pdvs_inactifs,
        "total_pdvs": total_pdvs,
        "taux_activite": taux_activite,
        "top_zones": top_zones,
        "pareto_data": pareto_data,
        "evolution_vs_mois_precedent": {
            "total_ca_evolution": evolution_ca,
            "total_ca_evolution_percent": evolution_percent,
            "pdvs_actifs_evolution": evolution_actifs,
            "ca_mois_precedent": total_ca_prev
        },
        "health_distribution": {
            "avg_health_score": statistics.mean(health_scores) if health_scores else 0,
            "min_health_score": min(health_scores) if health_scores else 0,
            "max_health_score": max(health_scores) if health_scores else 0,
            "segments": segments
        },
        "concentration_gini": gini,
        "at_risk_pdvs_count": at_risk_count
    }
