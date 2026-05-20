"""
Routes API pour le suivi global des Envois & Recuperations du reseau.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.envois_service import (
    get_journal_operations,
    get_soldes_par_pdv,
    get_alertes_soldes_eleves,
    get_par_gestionnaire,
    get_taux_recouvrement,
)
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/envois", tags=["Envois"])
NOW = datetime.now()


@router.get("/journal")
def journal_operations(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    zone: Optional[str] = Query(default=None),
    gestionnaire: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    return get_journal_operations(db, annee, mois, zone, gestionnaire)


@router.get("/soldes")
def soldes_par_pdv(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    zone: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    return get_soldes_par_pdv(db, annee, mois, zone)


@router.get("/alertes")
def alertes_soldes(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    seuil_solde: int = Query(default=1000000),
    db: Session = Depends(get_db)
):
    return get_alertes_soldes_eleves(db, annee, mois, seuil_solde)


@router.get("/par-gestionnaire")
def par_gestionnaire(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_par_gestionnaire(db, annee, mois)


@router.get("/taux-recouvrement")
def taux_recouvrement(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    db: Session = Depends(get_db)
):
    return get_taux_recouvrement(db, annee, mois)
