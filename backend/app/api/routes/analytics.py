from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance, WeeklyPerformance
from app.ai.health_score import update_all_health_scores
from app.ai.predictions import get_at_risk_pdvs, forecast_network_ca
from datetime import datetime, timedelta
import math

router = APIRouter()

@router.get("/analytics/health-scores")
def get_health_scores(
    db: Session = Depends(get_db),
    zone: Optional[str] = Query(None),
    min_score: float = Query(0, ge=0, le=100),
    max_score: float = Query(100, ge=0, le=100)
):
    """GET /analytics/health-scores
    Retourne: {count, average_health, scores: [{pdv_id, nom, zone, health_score, segment, medaille}]}
    """
    query = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)
    
    if zone:
        query = query.filter(PDV.zone == zone)
    
    pdvs = query.all()
    
    health_scores = [
        {
            "pdv_id": p.id,
            "numero_pdv": p.numero_pdv,
            "nom": p.nom,
            "zone": p.zone,
            "health_score": round(p.health_score, 1),
            "segment": p.segment,
            "medaille": p.medaille.value if p.medaille else "AUCUNE",
            "superviseur": p.superviseur,
            "gestionnaire": p.gestionnaire
        }
        for p in pdvs
        if min_score <= p.health_score <= max_score
    ]
    
    return {
        "count": len(health_scores),
        "average_health": round(sum(p["health_score"] for p in health_scores) / len(health_scores), 1) if health_scores else 0,
        "scores": sorted(health_scores, key=lambda x: x["health_score"], reverse=True)
    }

@router.get("/analytics/segments")
def get_segments(db: Session = Depends(get_db)):
    """GET /analytics/segments
    Retourne: {
      segments: {Champion: {count, pdvs: [...]}, Stable: {...}, 'À surveiller': {...}, Déclinant: {...}, Inactif: {...}},
      total: int
    }
    """
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    
    segments = {
        "Champion": [],
        "Stable": [],
        "À surveiller": [],
        "Déclinant": [],
        "Inactif": []
    }
    
    for pdv in pdvs:
        segment = pdv.segment or "À surveiller"
        if segment in segments:
            segments[segment].append({
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "zone": pdv.zone,
                "health_score": round(pdv.health_score, 1),
                "medaille": pdv.medaille.value if pdv.medaille else "AUCUNE",
                "gestionnaire": pdv.gestionnaire
            })
    
    # Calculer les stats CA par segment depuis les performances mensuelles
    from app.models.performance import MonthlyPerformance
    from sqlalchemy import func
    perf_query = db.query(MonthlyPerformance.pdv_id, func.sum(MonthlyPerformance.ca).label('ca_total'))\
        .group_by(MonthlyPerformance.pdv_id).all()
    ca_by_pdv = {p.pdv_id: p.ca_total for p in perf_query}

    result = {}
    for k, v in segments.items():
        count = len(v)
        ca_total = sum(ca_by_pdv.get(p["pdv_id"], 0) for p in v)
        health_avg = round(sum(p["health_score"] for p in v) / count, 1) if count > 0 else 0
        result[k] = {
            "count": count,
            "ca_total": round(ca_total, 0),
            "health_avg": health_avg,
            "pdvs": v[:10]  # Limiter à 10 PDVs par segment pour la réponse
        }

    return {
        "total": len(pdvs),
        "segments": result
    }

@router.get("/analytics/predictions")
def get_decline_predictions(db: Session = Depends(get_db)):
    """GET /analytics/predictions - avec cache global"""
    import sys
    # Utiliser le cache global de main.py
    try:
        main_module = sys.modules.get("main") or __import__("main")
        cached = main_module.get_cache("predictions")
        if cached:
            at_risk_pdvs = cached["at_risk"]
            network_forecast = cached["forecast"]
        else:
            at_risk_pdvs = get_at_risk_pdvs(db, threshold=0.3)
            network_forecast = forecast_network_ca(db, horizon_weeks=4)
            main_module.set_cache("predictions", {"at_risk": at_risk_pdvs, "forecast": network_forecast})
    except:
        at_risk_pdvs = get_at_risk_pdvs(db, threshold=0.3)
        network_forecast = forecast_network_ca(db, horizon_weeks=4)

    # Corriger la cohérence risk_level / probability
    for p in at_risk_pdvs:
        if p["probability"] >= 0.65:
            p["risk_level"] = "ÉLEVÉ"
        elif p["probability"] >= 0.4:
            p["risk_level"] = "MOYEN"
        else:
            p["risk_level"] = "FAIBLE"

    high_risk = [p for p in at_risk_pdvs if p["probability"] >= 0.65]
    medium_risk = [p for p in at_risk_pdvs if 0.4 <= p["probability"] < 0.65]
    low_risk = [p for p in at_risk_pdvs if p["probability"] < 0.4]
    
    result = {
        "total_at_risk": len(at_risk_pdvs),
        "high_risk_count": len(high_risk),
        "medium_risk_count": len(medium_risk),
        "low_risk_count": len(low_risk),
        "high_risk_pdvs": high_risk[:20],
        "medium_risk_pdvs": medium_risk[:20],
        "low_risk_pdvs": low_risk[:20],
        "network_forecast": network_forecast
    }
    _predictions_cache[cache_key] = result
    _predictions_cache_time[cache_key] = now
    return result

@router.get("/analytics/forecast")
def get_ca_forecast(db: Session = Depends(get_db)):
    """GET /analytics/forecast - avec cache 10 minutes"""
    import time
    cache_key = "forecast"
    now = time.time()
    if cache_key in _predictions_cache and (now - _predictions_cache_time.get(cache_key, 0)) < 600:
        return _predictions_cache[cache_key]
    result = forecast_network_ca(db, horizon_weeks=4)
    _predictions_cache[cache_key] = result
    _predictions_cache_time[cache_key] = now
    return result

@router.get("/analytics/gini")
def get_gini_coefficient(db: Session = Depends(get_db)):
    """GET /analytics/gini
    Retourne le coefficient Gini + analyse Pareto
    """
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    performances = db.query(MonthlyPerformance).all()
    
    # Calculate total CA per PDV
    pdv_cas = {}
    pdv_names = {}
    for pdv in pdvs:
        pdv_cas[pdv.id] = 0
        pdv_names[pdv.id] = pdv.nom
    
    for perf in performances:
        if perf.pdv_id in pdv_cas:
            pdv_cas[perf.pdv_id] += perf.ca
    
    cas_list = sorted([(k, v) for k, v in pdv_cas.items()], key=lambda x: x[1], reverse=True)
    cas_values = [v for k, v in cas_list]
    
    if not cas_values or sum(cas_values) == 0:
        return {
            "gini_coefficient": 0,
            "interpretation": "Pas de données",
            "total_pdvs": 0,
            "concentration": "Aucun",
            "pareto": {"top_20_pct": 0, "contribution": 0}
        }
    
    # Calculate Gini coefficient
    n = len(cas_values)
    total_ca = sum(cas_values)
    
    cumsum = 0
    gini = 0
    for i, ca in enumerate(cas_values):
        cumsum += ca
        gini += (n - i) * ca
    
    gini = (2 * gini) / (n * total_ca) - (n + 1) / n
    
    # Pareto analysis: top 20% PDVs contribution
    top_20_count = max(1, n // 5)
    top_20_ca = sum(cas_values[:top_20_count])
    pareto_pct = (top_20_ca / total_ca * 100) if total_ca > 0 else 0
    
    # Interpretation
    if gini > 0.6:
        interpretation = "Très concentrée (quelques PDVs dominent)"
    elif gini > 0.4:
        interpretation = "Modérément concentrée"
    else:
        interpretation = "Bien distribuée"
    
    return {
        "gini_coefficient": round(gini, 3),
        "interpretation": interpretation,
        "total_pdvs": n,
        "total_ca": round(total_ca, 0),
        "concentration": "Élevée" if gini > 0.5 else "Modérée" if gini > 0.3 else "Faible",
        "pareto": {
            "top_20_pct_count": top_20_count,
            "top_20_contribution_pct": round(pareto_pct, 1),
            "details": [
                {
                    "pdv_id": k,
                    "nom": pdv_names.get(k, ""),
                    "ca": round(v, 0),
                    "pct_total": round((v / total_ca * 100), 1) if total_ca > 0 else 0
                }
                for k, v in cas_list[:top_20_count]
            ]
        }
    }

@router.get("/analytics/heatmap")
def get_geographic_heatmap(
    db: Session = Depends(get_db),
    annee: Optional[int] = None,
    mois: Optional[int] = None
):
    """GET /analytics/heatmap
    Params: annee, mois (optionnel)
    Retourne: {
      zones: 8,
      data: {zone_name: {ca: float, count: int, health_avg: float, pct_network: float, nb_actifs: int}}
    }
    """
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    
    # Get performances based on period
    if annee and mois:
        performances = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        ).all()
    else:
        performances = db.query(MonthlyPerformance).all()
    
    # Calculate CA per PDV
    pdv_cas = {}
    pdv_actifs = {}
    for pdv in pdvs:
        pdv_cas[pdv.id] = 0
        pdv_actifs[pdv.id] = 0
    
    for perf in performances:
        if perf.pdv_id in pdv_cas:
            pdv_cas[perf.pdv_id] += perf.ca
            if perf.est_actif:
                pdv_actifs[perf.pdv_id] += 1
    
    # Group by zone
    total_ca = sum(pdv_cas.values())
    zone_data = {}
    
    for pdv in pdvs:
        if pdv.zone:
            if pdv.zone not in zone_data:
                zone_data[pdv.zone] = {
                    "ca": 0,
                    "count": 0,
                    "health_avg": 0,
                    "nb_actifs": 0
                }
            
            zone_data[pdv.zone]["ca"] += pdv_cas.get(pdv.id, 0)
            zone_data[pdv.zone]["count"] += 1
            zone_data[pdv.zone]["health_avg"] += pdv.health_score
            zone_data[pdv.zone]["nb_actifs"] += 1 if pdv.statut.value == "ACTIF" else 0
    
    # Calculate percentages and averages
    for zone in zone_data:
        zone_data[zone]["health_avg"] = round(zone_data[zone]["health_avg"] / zone_data[zone]["count"], 1) if zone_data[zone]["count"] > 0 else 0
        zone_data[zone]["pct_network"] = round((zone_data[zone]["ca"] / total_ca * 100), 1) if total_ca > 0 else 0
        zone_data[zone]["ca"] = round(zone_data[zone]["ca"], 0)
    
    return {
        "zones": len(zone_data),
        "total_ca": round(total_ca, 0),
        "data": zone_data
    }

@router.post("/analytics/update-scores")
def update_health_scores(db: Session = Depends(get_db)):
    """POST /analytics/update-scores
    Lance update_all_health_scores(db) et retourne les stats
    """
    result = update_all_health_scores(db)
    return {
        "success": True,
        "message": f"Scores mis à jour pour {result['updated']} PDVs",
        "data": result
    }
