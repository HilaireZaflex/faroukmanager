"""
Routes API du module Prospection (puces Orange Money).
=======================================================
Endpoints couvrant le cycle de vie complet d'une demande de puce :
  - création (superviseur/développeur)
  - affectation visite (réaffectation possible)
  - décision développeur (validation/refus + commentaire)
  - décision RC (approve/hold/reject)
  - attribution puce + activation
  - annulation
  - statistiques globales
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.prospect import ProspectStatus
from app.schemas.prospect import (
    ProspectCreate,
    ProspectUpdate,
    ProspectOut,
    ProspectDetailOut,
    ProspectStatsOut,
    AssignVisitRequest,
    DevDecisionRequest,
    RCDecisionRequest,
    PuceAssignRequest,
    PuceActivateRequest,
    CancelRequest,
)
from app.services import prospection_service as svc
from app.ai import prospect_intelligence as ai_svc
from app.api.routes.auth import get_current_user

router = APIRouter(prefix="/prospects", tags=["Prospection"])


# ─────────────────────────────────────────────────────────────────────────────
# IA — Endpoints d'intelligence (placés EN HAUT pour priorité de routing)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/ai/overview")
def ai_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vue d'ensemble IA : distribution Go/NoGo, top 5 GO, top 5 NoGo, score moyen."""
    return ai_svc.overview(db)


@router.get("/{prospect_id}/ai/score")
def ai_score(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Score 0-100 d'un prospect avec breakdown explicable des facteurs."""
    p = svc.get_prospect(db, prospect_id)
    return ai_svc.score_prospect(db, p)


@router.get("/{prospect_id}/ai/recommendation")
def ai_recommendation(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recommandation Go / Conditional / No-Go avec forces & faiblesses."""
    p = svc.get_prospect(db, prospect_id)
    return ai_svc.recommendation(db, p)


@router.get("/{prospect_id}/ai/forecast")
def ai_forecast(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Prédiction de CA sur les 3 premiers mois."""
    p = svc.get_prospect(db, prospect_id)
    return ai_svc.predict_revenue(db, p)


@router.get("/{prospect_id}/ai/duplicates")
def ai_duplicates(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Détection de doublons potentiels (téléphone, nom, GPS, pièce ID)."""
    p = svc.get_prospect(db, prospect_id)
    return ai_svc.find_duplicates(db, p)


# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────
@router.post("", response_model=ProspectOut, status_code=status.HTTP_201_CREATED)
def create_prospect(
    payload: ProspectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soumission initiale d'une fiche prospect (superviseur ou développeur)."""
    return svc.create_prospect(db, payload, current_user)


@router.get("", response_model=List[ProspectOut])
def list_prospects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[ProspectStatus] = Query(None, alias="status"),
    assigned_to_me: bool = Query(False, description="Filtrer ceux qui me sont affectés"),
    submitted_by_me: bool = Query(False, description="Filtrer ceux que j'ai soumis"),
    search: Optional[str] = Query(None, description="Recherche (réf, nom, téléphone, quartier)"),
    skip: int = 0,
    limit: int = Query(50, le=200),
):
    """Liste paginée des prospects avec filtres."""
    return svc.list_prospects(
        db, current_user,
        status_filter=status_filter,
        assigned_to_me=assigned_to_me,
        submitted_by_me=submitted_by_me,
        search=search,
        skip=skip,
        limit=limit,
    )


@router.get("/stats", response_model=ProspectStatsOut)
def stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statistiques globales du module Prospection."""
    return svc.get_stats(db)


@router.get("/{prospect_id}", response_model=ProspectDetailOut)
def get_prospect(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Détails d'un prospect, incluant historique et pièces jointes."""
    return svc.get_prospect(db, prospect_id)


@router.patch("/{prospect_id}", response_model=ProspectOut)
def update_prospect(
    prospect_id: int,
    payload: ProspectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mise à jour partielle d'une fiche (avant décision RC)."""
    return svc.update_prospect(db, prospect_id, payload, current_user)


# ─────────────────────────────────────────────────────────────────────────────
# Actions du workflow
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{prospect_id}/assign-visit", response_model=ProspectOut)
def assign_visit(
    prospect_id: int,
    payload: AssignVisitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Affecte (ou réaffecte) un développeur pour la visite terrain."""
    return svc.assign_visit(db, prospect_id, payload, current_user)


@router.post("/{prospect_id}/dev-decision", response_model=ProspectOut)
def dev_decision(
    prospect_id: int,
    payload: DevDecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Le développeur valide ou refuse après visite (commentaire obligatoire)."""
    return svc.dev_decision(db, prospect_id, payload, current_user)


@router.post("/{prospect_id}/rc-decision", response_model=ProspectOut)
def rc_decision(
    prospect_id: int,
    payload: RCDecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Décision finale RC : approve / hold / reject."""
    return svc.rc_decision(db, prospect_id, payload, current_user)


@router.post("/{prospect_id}/assign-puce", response_model=ProspectOut)
def assign_puce(
    prospect_id: int,
    payload: PuceAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Le RC attribue la puce à un développeur activateur."""
    return svc.assign_puce(db, prospect_id, payload, current_user)


@router.post("/{prospect_id}/activate", response_model=ProspectOut)
def activate_puce(
    prospect_id: int,
    payload: PuceActivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Le développeur activateur confirme l'activation terrain (créé le PDV)."""
    return svc.activate_puce(db, prospect_id, payload, current_user)


@router.post("/{prospect_id}/cancel", response_model=ProspectOut)
def cancel_prospect(
    prospect_id: int,
    payload: CancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Annule un prospect à tout moment (sauf états terminaux)."""
    return svc.cancel_prospect(db, prospect_id, payload, current_user)
