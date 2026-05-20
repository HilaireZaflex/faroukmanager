"""
Predictive analytics for PDV performance and decline risk.
Prédit le déclin des PDVs et prévoit le CA du réseau.
"""
import numpy as np
from typing import Dict, List
from sqlalchemy.orm import Session
from app.models.pdv import PDV
from app.models.performance import WeeklyPerformance


def predict_decline(pdv_id: int, weekly_performances: List[WeeklyPerformance]) -> Dict:
    """
    Prédit si le PDV va décrocher dans les 2-4 prochaines semaines.
    Utilise régression linéaire sur les 8 dernières semaines.
    
    Args:
        pdv_id: PDV identifier
        weekly_performances: List of WeeklyPerformance sorted by date (most recent last)
    
    Returns:
        dict: {
            probability: float (0-1),  # probabilité de décrochage
            predicted_ca_next_week: float,
            trend_slope: float,  # pente hebdomadaire en FCFA
            trend_pct: float,  # tendance en %/semaine
            consecutive_declines: int,  # nb semaines consécutives en baisse
            risk_level: 'HAUT'|'MOYEN'|'FAIBLE',
            explanation: str,  # explication lisible ex: '3 baisses consécutives, pente -12%/sem'
            confidence: float  # 0-1 selon nb de données
        }
    """
    if len(weekly_performances) < 2:
        return {
            "probability": 0.0,
            "predicted_ca_next_week": 0.0,
            "trend_slope": 0.0,
            "trend_pct": 0.0,
            "consecutive_declines": 0,
            "risk_level": "FAIBLE",
            "explanation": "Données insuffisantes",
            "confidence": 0.0
        }
    
    # Use last 8 weeks of data
    recent_weeks = weekly_performances[-8:]
    ca_values = [wp.ca for wp in recent_weeks]
    
    # Calculate consecutive declines
    consecutive_declines = 0
    for i in range(len(ca_values) - 1, 0, -1):
        if ca_values[i] < ca_values[i - 1]:
            consecutive_declines += 1
        else:
            break
    
    # Perform linear regression
    x = np.array(list(range(len(ca_values))))
    y = np.array(ca_values)
    
    try:
        coefficients = np.polyfit(x, y, 1)
        slope = coefficients[0]
        intercept = coefficients[1]
        
        # Predict next week's CA
        predicted_ca_next = slope * (len(ca_values)) + intercept
        predicted_ca_next = max(0, predicted_ca_next)
        
        # Calculate R-squared for confidence (adapt to data size)
        y_pred = np.polyval(coefficients, x)
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        confidence = min(1.0, abs(r_squared) + (len(ca_values) / 12.0) * 0.2)
        
        # Calculate percentage trend
        mean_ca = np.mean(y) if np.mean(y) > 0 else 1
        trend_pct = (slope / mean_ca) * 100 if mean_ca > 0 else 0
        
        # Seuils recalibrés pour réseau OMY (CA moyen ~6.8M FCFA, médian ~3.3M)
        # Risque basé sur % de baisse (trend_pct) + baisses consécutives
        explanation = ""
        abs_trend = abs(float(trend_pct))

        if consecutive_declines >= 4:
            if float(trend_pct) < -15:
                risk_level = "HAUT"
                probability = min(1.0, 0.7 + (abs_trend / 100) * 0.3)
                explanation = f"{consecutive_declines} baisses consécutives, tendance {trend_pct:.1f}%/sem"
            elif float(trend_pct) < -5:
                risk_level = "MOYEN"
                probability = min(1.0, 0.5 + (consecutive_declines / 10.0) * 0.2)
                explanation = f"{consecutive_declines} baisses consécutives, tendance {trend_pct:.1f}%/sem"
            else:
                risk_level = "MOYEN"
                probability = 0.4 + (consecutive_declines / 15.0)
                explanation = f"{consecutive_declines} baisses consécutives légères"
        elif consecutive_declines >= 2 and float(trend_pct) < -10:
            risk_level = "MOYEN"
            probability = min(1.0, 0.4 + abs_trend / 100)
            explanation = f"{consecutive_declines} baisses consécutives, tendance {trend_pct:.1f}%/sem"
        elif float(trend_pct) < -20:
            risk_level = "HAUT"
            probability = min(1.0, 0.65 + (abs_trend - 20) / 100)
            explanation = f"Déclin accéléré: {trend_pct:.1f}%/sem"
        elif float(trend_pct) < -10:
            risk_level = "MOYEN"
            probability = min(1.0, 0.4 + (abs_trend - 10) / 100)
            explanation = f"Tendance baissière: {trend_pct:.1f}%/sem"
        else:
            risk_level = "FAIBLE"
            probability = max(0.0, min(0.35, abs_trend / 100)) if float(trend_pct) < 0 else 0.0
            explanation = "Stabilité ou croissance" if float(trend_pct) >= 0 else f"Légère baisse: {trend_pct:.1f}%/sem"
        
        return {
            "probability": float(probability),
            "predicted_ca_next_week": float(predicted_ca_next),
            "trend_slope": float(slope),
            "trend_pct": float(trend_pct),
            "consecutive_declines": int(consecutive_declines),
            "risk_level": risk_level,
            "explanation": explanation,
            "confidence": float(confidence)
        }
    except Exception as e:
        return {
            "probability": 0.0,
            "predicted_ca_next_week": 0.0,
            "trend_slope": 0.0,
            "trend_pct": 0.0,
            "consecutive_declines": int(consecutive_declines),
            "risk_level": "FAIBLE",
            "explanation": f"Erreur calcul: {str(e)}",
            "confidence": 0.0
        }


def forecast_network_ca(db: Session, horizon_weeks: int = 4) -> Dict:
    """
    Prévision CA réseau pour les N prochaines semaines.
    Méthode: moyenne mobile pondérée + lissage exponentiel par zone.
    
    Args:
        db: SQLAlchemy session
        horizon_weeks: Number of weeks to forecast (default 4)
    
    Returns:
        dict: {
            predictions: [{semaine, annee, ca_prevu, ca_min, ca_max, confidence}],
            by_zone: {zone: [{semaine, ca_prevu}]},
            risk_alert: bool,  # True si prévision < 90% de la moyenne
            risk_message: str
        }
    """
    from datetime import datetime, timedelta
    
    # Get all zones
    pdvs = db.query(PDV).all()
    zones = {}
    for pdv in pdvs:
        if pdv.zone and pdv.zone not in zones:
            zones[pdv.zone] = []
        if pdv.zone:
            zones[pdv.zone].append(pdv.id)
    
    forecast_result = {
        "by_zone": {},
        "predictions": [],
        "risk_alert": False,
        "risk_message": ""
    }
    
    total_forecasts = []
    total_min = []
    total_max = []
    
    for zone, pdv_ids in zones.items():
        # Aggregate weekly performance for zone
        zone_weekly = {}
        for pdv_id in pdv_ids:
            perfs = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.pdv_id == pdv_id
            ).order_by(WeeklyPerformance.annee, WeeklyPerformance.semaine).all()
            
            for perf in perfs[-12:]:  # Last 12 weeks
                key = (perf.annee, perf.semaine)
                if key not in zone_weekly:
                    zone_weekly[key] = 0
                zone_weekly[key] += perf.ca
        
        # Sort by date
        sorted_weeks = sorted(zone_weekly.items(), key=lambda x: x[0])
        ca_values = [v for k, v in sorted_weeks]
        
        if len(ca_values) > 0:
            alpha = 0.3
            current_ca = ca_values[-1]
            zone_forecast = []
            level = current_ca
            variance = np.var(ca_values) if len(ca_values) > 1 else current_ca * 0.1

            # Calculer la tendance linéaire sur les dernières semaines
            if len(ca_values) >= 3:
                x = np.arange(len(ca_values))
                coeffs = np.polyfit(x, ca_values, 1)
                trend_slope = coeffs[0]  # pente hebdomadaire
            else:
                trend_slope = 0

            for i in range(horizon_weeks):
                level = alpha * current_ca + (1 - alpha) * level
                # Appliquer la tendance progressivement
                ca_pred = max(0, level + trend_slope * (i + 1) * 0.5)
                confidence = np.sqrt(variance) * (1 + i * 0.1)

                zone_forecast.append({
                    "semaine": i + 1,
                    "ca_prevu": round(ca_pred, 0),
                    "ca_min": round(max(0, ca_pred - 1.5 * confidence), 0),
                    "ca_max": round(ca_pred + 1.5 * confidence, 0)
                })
                
                if not total_forecasts:
                    total_forecasts = [ca_pred]
                    total_min = [max(0, ca_pred - 2 * confidence)]
                    total_max = [ca_pred + 2 * confidence]
                else:
                    total_forecasts.append(ca_pred)
                    total_min.append(max(0, ca_pred - 2 * confidence))
                    total_max.append(ca_pred + 2 * confidence)
            
            forecast_result["by_zone"][zone] = zone_forecast
    
    # Build predictions array
    current_date = datetime.utcnow()
    # Calculate recent average from all zone data
    all_zone_cas = []
    for zone, pdv_ids in zones.items():
        zone_weekly = {}
        for pdv_id in pdv_ids:
            perfs = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.pdv_id == pdv_id
            ).order_by(WeeklyPerformance.annee, WeeklyPerformance.semaine).all()
            
            for perf in perfs[-12:]:
                key = (perf.annee, perf.semaine)
                if key not in zone_weekly:
                    zone_weekly[key] = 0
                zone_weekly[key] += perf.ca
        
        if zone_weekly:
            all_zone_cas.extend(zone_weekly.values())
    
    recent_avg = np.mean(all_zone_cas) if all_zone_cas else 0
    
    for i, ca_pred in enumerate(total_forecasts):
        forecast_date = current_date + timedelta(weeks=i+1)
        forecast_result["predictions"].append({
            "semaine": i + 1,
            "annee": forecast_date.year,
            "ca_prevu": ca_pred,
            "ca_min": total_min[i] if i < len(total_min) else ca_pred * 0.8,
            "ca_max": total_max[i] if i < len(total_max) else ca_pred * 1.2,
            "confidence": 0.7 + (i / horizon_weeks) * 0.1
        })
    
    # Check risk alert
    if total_forecasts and total_forecasts[0] < recent_avg * 0.9:
        forecast_result["risk_alert"] = True
        forecast_result["risk_message"] = f"Prévision baisse attendue: {total_forecasts[0]:.0f} < {recent_avg:.0f} (-{((recent_avg - total_forecasts[0]) / recent_avg * 100):.1f}%)"
    
    return forecast_result


def get_at_risk_pdvs(db: Session, threshold: float = 0.5) -> List[Dict]:
    """
    Retourne tous les PDVs avec probabilité de décrochage > threshold.
    Pour chaque PDV, appelle predict_decline avec ses 8 dernières semaines.
    
    Args:
        db: SQLAlchemy session
        threshold: Probability threshold for flagging (default 0.5)
    
    Returns:
        list: List of {pdv_id, pdv_name, numero_pdv, zone, probability, risk_level, trend_slope, trend_pct, consecutive_declines, explanation, confidence}
    """
    pdvs = db.query(PDV).all()
    at_risk = []
    
    for pdv in pdvs:
        weekly_perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.pdv_id == pdv.id
        ).order_by(WeeklyPerformance.annee, WeeklyPerformance.semaine).all()
        
        prediction = predict_decline(pdv.id, weekly_perfs)
        
        if prediction["probability"] >= threshold:
            at_risk.append({
                "pdv_id": pdv.id,
                "pdv_name": pdv.nom,
                "numero_pdv": pdv.numero_pdv,
                "zone": pdv.zone,
                "gestionnaire": pdv.gestionnaire,
                "probability": round(prediction["probability"], 3),
                "risk_level": prediction["risk_level"],
                "predicted_ca_next_week": round(prediction["predicted_ca_next_week"], 0),
                "trend_slope": round(prediction["trend_slope"], 0),
                "trend_pct": round(prediction["trend_pct"], 2),
                "consecutive_declines": prediction["consecutive_declines"],
                "explanation": prediction["explanation"],
                "confidence": round(prediction["confidence"], 2)
            })
    
    # Sort by probability descending
    at_risk.sort(key=lambda x: x["probability"], reverse=True)
    
    return at_risk
