"""
Routes API pour l'analyse des potentialités réseau.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.potentialites_service import (
    get_zones_heatmap,
    get_quartiers_analyse,
    get_opportunites_expansion,
    get_zones_en_declin,
    get_comparatif_zones,
    get_score_potentiel_zones,
)
from datetime import datetime

router = APIRouter(prefix="/potentialites", tags=["Potentialites"])

NOW = datetime.now()

@router.get("/zones-heatmap")
def zones_heatmap(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_zones_heatmap(db, annee, mois)


@router.get("/quartiers")
def quartiers_analyse(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_quartiers_analyse(db, annee, mois)


@router.get("/opportunites")
def opportunites_expansion(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_opportunites_expansion(db, annee, mois)


@router.get("/declin")
def zones_en_declin(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_zones_en_declin(db, annee, mois)


@router.get("/comparatif")
def comparatif_zones(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_comparatif_zones(db, annee, mois)


@router.get("/score-potentiel")
def score_potentiel(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_score_potentiel_zones(db, annee, mois)
