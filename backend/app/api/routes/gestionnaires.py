"""
Routes API pour la gestion des gestionnaires de réseau.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.gestionnaire_service import (
    get_gestionnaires_overview,
    get_gestionnaire_envois_recuperations,
    get_gestionnaire_historique_zones,
    get_gestionnaire_evolution_mensuelle,
    get_classement_gestionnaires,
    get_alertes_gestionnaire,
    get_all_gestionnaires,
)
from datetime import datetime

router = APIRouter(prefix="/gestionnaires", tags=["Gestionnaires"])

@router.get("/")
def list_gestionnaires(db: Session = Depends(get_db)):
    """Liste tous les gestionnaires distincts."""
    return get_all_gestionnaires(db)


@router.get("/overview")
def gestionnaires_overview(
    annee: int = Query(default=datetime.now().year),
    mois: int = Query(default=datetime.now().month),
    db: Session = Depends(get_db)
):
    """Vue d'ensemble de tous les gestionnaires pour un mois donné."""
    return get_gestionnaires_overview(db, annee, mois)


@router.get("/classement")
def classement_gestionnaires(
    annee: int = Query(default=datetime.now().year),
    mois: int = Query(default=datetime.now().month),
    db: Session = Depends(get_db)
):
    """Classement des gestionnaires par CA et taux de recouvrement."""
    return get_classement_gestionnaires(db, annee, mois)


@router.get("/{gestionnaire}/envois-recuperations")
def envois_recuperations(
    gestionnaire: str,
    annee: int = Query(default=datetime.now().year),
    mois: int = Query(default=datetime.now().month),
    db: Session = Depends(get_db)
):
    """Détail des envois et récupérations par PDV pour un gestionnaire."""
    return get_gestionnaire_envois_recuperations(db, gestionnaire, annee, mois)


@router.get("/{gestionnaire}/historique-zones")
def historique_zones(
    gestionnaire: str,
    db: Session = Depends(get_db)
):
    """Historique des zones où le gestionnaire a travaillé."""
    return get_gestionnaire_historique_zones(db, gestionnaire)


@router.get("/{gestionnaire}/evolution")
def evolution_mensuelle(
    gestionnaire: str,
    nb_mois: int = Query(default=12, le=24),
    db: Session = Depends(get_db)
):
    """Évolution mensuelle du gestionnaire."""
    return get_gestionnaire_evolution_mensuelle(db, gestionnaire, nb_mois)


@router.get("/{gestionnaire}/alertes")
def alertes_gestionnaire(
    gestionnaire: str,
    seuil_jours: int = Query(default=30),
    db: Session = Depends(get_db)
):
    """PDVs non visités depuis X jours par le gestionnaire."""
    return get_alertes_gestionnaire(db, gestionnaire, seuil_jours)
