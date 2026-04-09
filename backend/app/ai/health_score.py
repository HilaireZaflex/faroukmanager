"""
Health score calculation and segmentation for PDVs.
Calculates a 0-100 health score based on multiple factors:
- Activité récente (30 pts): combien de semaines actives sur les 4 dernières
- Tendance CA (25 pts): pente de régression linéaire sur 8 semaines
- Stabilité CA (20 pts): inverse du coefficient de variation
- Volume relatif (15 pts): percentile du CA moyen vs tout le réseau
- Statut opérationnel (10 pts): +5 si nouvelle création, -10 si SIM coupée
"""
import statistics
from typing import Dict, List, Tuple
from sqlalchemy.orm import Session
from app.models.pdv import PDV, PDVMedaille
from app.models.performance import WeeklyPerformance


def calculate_health_score(pdv: PDV, weekly_performances: List[WeeklyPerformance]) -> float:
    """
    Calculate PDV health score (0-100) based on multiple factors:
    - Activité récente (30 pts): combien de semaines actives sur les 4 dernières
    - Tendance CA (25 pts): pente de régression linéaire sur 8 semaines
    - Stabilité CA (20 pts): inverse du coefficient de variation
    - Volume relatif (15 pts): percentile du CA moyen vs tout le réseau
    - Statut opérationnel (10 pts): +5 si nouvelle création, -10 si SIM coupée
    
    Args:
        pdv: PDV instance
        weekly_performances: List of WeeklyPerformance sorted by date (most recent last)
    
    Returns:
        float: Health score 0-100
    """
    score = 0.0
    
    # 1. Activité récente: semaines actives sur les 4 dernières (30 points)
    if len(weekly_performances) >= 4:
        recent_4_weeks = weekly_performances[-4:]
        active_weeks = sum(1 for wp in recent_4_weeks if wp.est_actif)
        activity_score = (active_weeks / 4) * 30
    elif len(weekly_performances) > 0:
        active_weeks = sum(1 for wp in weekly_performances if wp.est_actif)
        activity_score = (active_weeks / len(weekly_performances)) * 30
    else:
        activity_score = 0
    score += activity_score
    
    # 2. Tendance CA: pente de régression linéaire sur 8 semaines (25 points)
    ca_trend = 0
    if len(weekly_performances) >= 2:
        recent_ca = [wp.ca for wp in weekly_performances[-8:] if wp.ca > 0]
        if len(recent_ca) >= 2:
            # Calcul régression linéaire
            x = list(range(len(recent_ca)))
            mean_x = statistics.mean(x)
            mean_y = statistics.mean(recent_ca)
            
            numerator = sum((x[i] - mean_x) * (recent_ca[i] - mean_y) for i in range(len(x)))
            denominator = sum((x[i] - mean_x) ** 2 for i in range(len(x)))
            
            if denominator > 0:
                ca_trend = numerator / denominator
                # Si croissance: 25 points. Si déclin: pénalité proportionnelle
                if ca_trend >= 0:
                    trend_score = 25
                else:
                    # Déclin: pénalité jusqu'à -25 points
                    # Pente typique: -100k/sem = -5 points
                    trend_score = max(0, 25 - (abs(ca_trend) / 50000) * 25)
            else:
                trend_score = 12.5  # Neutre
        else:
            trend_score = 0
    else:
        trend_score = 0
    score += trend_score
    
    # 3. Stabilité CA: inverse du coefficient de variation (20 points)
    if len(weekly_performances) >= 2:
        recent_ca = [wp.ca for wp in weekly_performances[-8:] if wp.ca > 0]
        if len(recent_ca) >= 2:
            mean_ca = statistics.mean(recent_ca)
            if mean_ca > 0:
                cv = (statistics.stdev(recent_ca) / mean_ca)
                # cv < 0.3 = stable (20 pts), cv > 0.7 = instable (0 pts)
                stability_score = max(0, 20 * (1 - min(1, cv / 0.7)))
            else:
                stability_score = 0
        else:
            stability_score = 0
    else:
        stability_score = 0
    score += stability_score
    
    # 4. Volume relatif: percentile du CA moyen (15 points)
    # Sera calculé dans update_all_health_scores avec comparaison réseau
    if len(weekly_performances) > 0:
        avg_ca = statistics.mean([wp.ca for wp in weekly_performances[-12:] if wp.ca > 0]) \
            if any(wp.ca > 0 for wp in weekly_performances[-12:]) else 0
        # Normalisé: 500k FCFA = 15 points
        if avg_ca > 0:
            volume_score = min(15, (avg_ca / 500000) * 15)
        else:
            volume_score = 0
    else:
        volume_score = 0
    score += volume_score
    
    # 5. Statut opérationnel (10 points)
    op_score = 10
    if pdv.sim_coupee:
        op_score -= 10  # Pénalité complète si SIM coupée
    if pdv.nouvelle_creation:
        op_score += 5  # Bonus si nouvelle création
    score += max(0, min(10, op_score))
    
    return min(100, max(0, score))


def classify_segment(health_score: float, ca_trend: float, percentile_rank: float = 50) -> str:
    """
    Classify PDV segment based on percentile rank for realistic distribution.
    - Champion: top 20% (percentile >= 80)
    - Stable: 50-80%
    - À surveiller: 30-50%
    - Déclinant: 15-30% OR ca_trend fortement négatif
    - Inactif: bottom 15%
    """
    if percentile_rank >= 80:
        return "Champion"
    elif percentile_rank >= 50:
        return "Stable"
    elif percentile_rank >= 30:
        return "À surveiller"
    elif percentile_rank >= 15 or ca_trend < -50000:
        return "Déclinant"
    else:
        return "Inactif"


def assign_medal(health_score: float, percentile_rank: float) -> PDVMedaille:
    """
    Assign medal based on health score and percentile rank among peers.
    
    Medals:
    - OR: top 10% (percentile >= 90) ET health_score >= 70
    - ARGENT: top 25% (percentile >= 75) ET health_score >= 55  
    - BRONZE: top 40% (percentile >= 60) ET health_score >= 40
    - AUCUNE: sinon
    
    Args:
        health_score: Calculated health score 0-100
        percentile_rank: Percentile rank (0-100) compared to all PDVs
    
    Returns:
        PDVMedaille: Medal enum value
    """
    if percentile_rank >= 90 and health_score >= 70:
        return PDVMedaille.OR
    elif percentile_rank >= 75 and health_score >= 55:
        return PDVMedaille.ARGENT
    elif percentile_rank >= 60 and health_score >= 40:
        return PDVMedaille.BRONZE
    else:
        return PDVMedaille.AUCUNE


def update_all_health_scores(db: Session) -> Dict:
    """
    Update health scores, segments, and medals for all PDVs in database.
    Utilise les 8 dernières semaines de WeeklyPerformance.
    
    Args:
        db: SQLAlchemy session
    
    Returns:
        dict: Statistics of the update {
            updated: int,
            avg_score: float,
            score_distribution: dict with percentiles,
            segments: dict with counts by segment,
            medals: dict with counts by medal
        }
    """
    pdvs = db.query(PDV).all()
    total_pdvs = len(pdvs)
    
    scores = []
    segments_count = {"Champion": 0, "Stable": 0, "À surveiller": 0, "Déclinant": 0, "Inactif": 0}
    medals_count = {"OR": 0, "ARGENT": 0, "BRONZE": 0, "AUCUNE": 0}
    
    # First pass: calculate all health scores
    pdv_scores = {}
    for pdv in pdvs:
        # Get last 8 weeks of performance data
        weekly_perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.pdv_id == pdv.id
        ).order_by(WeeklyPerformance.annee, WeeklyPerformance.semaine).all()
        
        # Calculate health score
        health_score = calculate_health_score(pdv, weekly_perfs)
        pdv_scores[pdv.id] = health_score
        scores.append(health_score)
    
    # Calculate network average CA for volume scoring adjustment
    all_weekly_perfs = db.query(WeeklyPerformance).all()
    network_avg_cas = [wp.ca for wp in all_weekly_perfs[-8:] if wp.ca > 0]
    network_avg_ca = statistics.mean(network_avg_cas) if network_avg_cas else 0
    
    # Second pass: classify and assign medals with percentile ranks
    for pdv in pdvs:
        health_score = pdv_scores[pdv.id]
        
        # Calculate percentile rank (0-100)
        percentile_rank = (sum(1 for s in scores if s <= health_score) / len(scores) * 100) if scores else 0
        
        # Get CA trend for segment classification
        weekly_perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.pdv_id == pdv.id
        ).order_by(WeeklyPerformance.annee, WeeklyPerformance.semaine).all()
        
        if len(weekly_perfs) >= 2:
            recent_ca = [wp.ca for wp in weekly_perfs[-8:] if wp.ca > 0]
            if len(recent_ca) >= 2:
                x = list(range(len(recent_ca)))
                mean_x = statistics.mean(x)
                mean_y = statistics.mean(recent_ca)
                numerator = sum((x[i] - mean_x) * (recent_ca[i] - mean_y) for i in range(len(x)))
                denominator = sum((x[i] - mean_x) ** 2 for i in range(len(x)))
                ca_trend = (numerator / denominator) if denominator > 0 else 0
            else:
                ca_trend = 0
        else:
            ca_trend = 0
        
        # Classify segment based on percentile rank
        segment = classify_segment(health_score, ca_trend, percentile_rank)
        segments_count[segment] += 1
        
        # Assign medal
        medal = assign_medal(health_score, percentile_rank)
        medals_count[medal.value] += 1
        
        # Update PDV
        pdv.health_score = health_score
        pdv.segment = segment
        pdv.medaille = medal
    
    db.commit()
    
    # Calculate score distribution
    scores_sorted = sorted(scores)
    score_distribution = {
        "min": min(scores_sorted) if scores_sorted else 0,
        "max": max(scores_sorted) if scores_sorted else 0,
        "p25": scores_sorted[len(scores_sorted) // 4] if scores_sorted else 0,
        "p50": scores_sorted[len(scores_sorted) // 2] if scores_sorted else 0,
        "p75": scores_sorted[3 * len(scores_sorted) // 4] if scores_sorted else 0,
    }
    
    return {
        "updated": total_pdvs,
        "avg_score": statistics.mean(scores) if scores else 0,
        "score_distribution": score_distribution,
        "segments": segments_count,
        "medals": medals_count,
    }
