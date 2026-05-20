"""
Service Géolocalisation pour la Prospection.
=============================================
- nearby_pdvs       : PDV existants à proximité (< 200m alerte)
- heatmap_data      : agrégation pour heatmap zones potentiel/saturées
- map_prospects     : tous les prospects géolocalisés pour la carte
- optimize_route    : itinéraire optimisé TSP (heuristique nearest-neighbor)
- verify_geofence   : vérifier qu'un dev est physiquement sur place
"""
from __future__ import annotations
import math
from typing import List, Dict, Any, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.prospect import Prospect, ProspectStatus
from app.models.pdv import PDV, PDVStatut

PROXIMITY_ALERT_KM = 0.20   # 200 mètres
GEOFENCE_TOLERANCE_KM = 0.10  # 100 mètres


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    if None in (lat1, lon1, lat2, lon2):
        return float("inf")
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def map_prospects(db: Session) -> List[Dict[str, Any]]:
    """Tous les prospects géolocalisés pour affichage sur carte."""
    out = []
    for p in db.query(Prospect).filter(
        Prospect.latitude.isnot(None), Prospect.longitude.isnot(None)
    ).all():
        out.append({
            "id": p.id, "reference": p.reference,
            "nom": p.nom, "prenom": p.prenom,
            "telephone": p.telephone_principal,
            "quartier": p.quartier, "status": p.status.value,
            "lat": p.latitude, "lng": p.longitude,
            "fait_om": p.fait_om,
            "frequentation": p.frequentation.value if p.frequentation else None,
        })
    return out


def map_pdvs(db: Session) -> List[Dict[str, Any]]:
    """PDV existants géolocalisés pour la carte (contexte)."""
    out = []
    for x in db.query(PDV).filter(
        PDV.latitude.isnot(None), PDV.longitude.isnot(None)
    ).all():
        out.append({
            "id": x.id, "numero": x.numero_pdv, "nom": x.nom,
            "lat": x.latitude, "lng": x.longitude,
            "statut": x.statut.value if x.statut else None,
            "quartier": x.quartier,
        })
    return out


def nearby_pdvs(db: Session, prospect_id: int, radius_km: float = PROXIMITY_ALERT_KM) -> Dict[str, Any]:
    """PDVs à proximité d'un prospect (alerte si < 200m)."""
    p = db.query(Prospect).get(prospect_id)
    if not p or not p.latitude:
        return {"alert": False, "count": 0, "items": []}
    delta = radius_km / 111.0 * 2
    candidates = db.query(PDV).filter(
        PDV.latitude.between(p.latitude - delta, p.latitude + delta),
        PDV.longitude.between(p.longitude - delta, p.longitude + delta),
    ).all()
    items = []
    for c in candidates:
        d = _haversine_km(p.latitude, p.longitude, c.latitude, c.longitude)
        if d <= radius_km:
            items.append({
                "id": c.id, "numero": c.numero_pdv, "nom": c.nom,
                "distance_m": int(d * 1000),
                "statut": c.statut.value if c.statut else None,
                "lat": c.latitude, "lng": c.longitude,
            })
    items.sort(key=lambda x: x["distance_m"])
    return {
        "alert": len(items) > 0,
        "count": len(items),
        "radius_m": int(radius_km * 1000),
        "items": items,
    }


def heatmap_data(db: Session) -> Dict[str, Any]:
    """
    Données de heatmap : agrège prospects + PDV par grille (~500m).
    Renvoie 2 couches : 'potentiel' (prospects+PDV vides) et 'saturation' (PDV existants).
    """
    grid = {}
    GRID = 0.005  # ~500m

    def add(d, lat, lng, w):
        key = (round(lat / GRID) * GRID, round(lng / GRID) * GRID)
        d[key] = d.get(key, 0) + w

    potentiel, saturation = {}, {}
    for p in db.query(Prospect).filter(Prospect.latitude.isnot(None)).all():
        add(potentiel, p.latitude, p.longitude, 1.0)
    for x in db.query(PDV).filter(
        PDV.latitude.isnot(None), PDV.statut == PDVStatut.ACTIF
    ).all():
        add(saturation, x.latitude, x.longitude, 1.0)

    return {
        "potentiel": [{"lat": k[0], "lng": k[1], "weight": v} for k, v in potentiel.items()],
        "saturation": [{"lat": k[0], "lng": k[1], "weight": v} for k, v in saturation.items()],
    }


def optimize_route(db: Session, dev_user_id: int, start_lat: float, start_lng: float) -> Dict[str, Any]:
    """
    Itinéraire optimisé pour les visites du jour d'un développeur.
    Heuristique : nearest-neighbor (TSP approximatif).
    """
    # Prospects affectés à ce dev en cours de visite
    prospects = db.query(Prospect).filter(
        Prospect.visit_assigned_to_id == dev_user_id,
        Prospect.status == ProspectStatus.EN_VISITE,
        Prospect.latitude.isnot(None),
    ).all()
    if not prospects:
        return {"steps": [], "total_distance_km": 0, "count": 0}

    remaining = prospects[:]
    cur_lat, cur_lng = start_lat, start_lng
    steps = []
    total = 0.0
    order = 0
    while remaining:
        # Trouver le plus proche
        best = min(remaining, key=lambda x: _haversine_km(cur_lat, cur_lng, x.latitude, x.longitude))
        d = _haversine_km(cur_lat, cur_lng, best.latitude, best.longitude)
        order += 1
        steps.append({
            "order": order, "id": best.id, "reference": best.reference,
            "nom": f"{best.prenom} {best.nom}",
            "quartier": best.quartier, "telephone": best.telephone_principal,
            "lat": best.latitude, "lng": best.longitude,
            "distance_from_prev_km": round(d, 2),
        })
        total += d
        cur_lat, cur_lng = best.latitude, best.longitude
        remaining.remove(best)

    return {
        "start": {"lat": start_lat, "lng": start_lng},
        "steps": steps,
        "count": len(steps),
        "total_distance_km": round(total, 2),
        "estimated_duration_min": int(total / 25 * 60 + len(steps) * 15),  # 25km/h + 15 min/visite
    }


def verify_geofence(db: Session, prospect_id: int, lat: float, lng: float) -> Dict[str, Any]:
    """Vérifie qu'un développeur est physiquement sur le lieu du prospect (< 100m)."""
    p = db.query(Prospect).get(prospect_id)
    if not p or not p.latitude:
        return {"verified": False, "reason": "Prospect sans GPS de référence"}
    d = _haversine_km(p.latitude, p.longitude, lat, lng)
    return {
        "verified": d <= GEOFENCE_TOLERANCE_KM,
        "distance_m": int(d * 1000),
        "tolerance_m": int(GEOFENCE_TOLERANCE_KM * 1000),
        "reason": "Présence vérifiée ✓" if d <= GEOFENCE_TOLERANCE_KM
                  else f"Trop éloigné ({int(d * 1000)} m du point de référence)",
    }
