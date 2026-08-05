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

from fastapi import APIRouter, Depends, Query, status, Body
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
    # Les commerciaux ne voient que leurs propres soumissions
    from app.models.user import UserRole
    if current_user.role == UserRole.COMMERCIAL:
        submitted_by_me = True
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
    from app.models.user import UserRole
    # Les commerciaux voient uniquement leurs propres stats
    user_id_filter = current_user.id if current_user.role == UserRole.COMMERCIAL else None
    return svc.get_stats(db, user_id_filter=user_id_filter)


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


@router.get("/stats/repartition-agents")
def get_repartition_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Répartition des prospects par agent pour tous les types d'activités."""
    from app.models.prospect import Prospect as ProspectModel, ProspectStatus
    from app.models.user import User as UserModel
    from sqlalchemy import func, case

    prospects = db.query(ProspectModel).all()

    # Helper pour extraire le nom complet
    def get_user_name(user_obj):
        if not user_obj: return None
        return f"{user_obj.nom or ''} {user_obj.prenom or ''}".strip() or None

    # Charger les users liés
    def load_user(user_id):
        if not user_id: return None
        return db.query(UserModel).filter(UserModel.id == user_id).first()

    # 1. Prospections soumises par agent
    prospections_par_agent = {}
    visites_par_agent = {}
    activations_par_agent = {}
    activites_par_agent = {}  # total toutes activités
    taux_succes = {}  # ratio activée / soumise

    for p in prospects:
        # Prospections soumises
        sb = load_user(p.submitted_by_id) if hasattr(p, 'submitted_by_id') else None
        if not sb and hasattr(p, 'submitted_by'):
            sb = p.submitted_by
        nom_sub = get_user_name(sb)
        if nom_sub:
            prospections_par_agent[nom_sub] = prospections_par_agent.get(nom_sub, {"total": 0, "activees": 0, "refusees": 0})
            prospections_par_agent[nom_sub]["total"] += 1
            if p.status in (ProspectStatus.PUCE_ACTIVEE, "PUCE_ACTIVEE"):
                prospections_par_agent[nom_sub]["activees"] += 1
            if p.status in (ProspectStatus.REFUSEE_RC, ProspectStatus.REFUSEE_DEV, "REFUSEE_RC", "REFUSEE_DEV"):
                prospections_par_agent[nom_sub]["refusees"] += 1

        # Visites terrain
        va = load_user(p.visit_assigned_to_id) if hasattr(p, 'visit_assigned_to_id') else None
        if not va and hasattr(p, 'visit_assigned_to'):
            va = p.visit_assigned_to
        nom_visit = get_user_name(va)
        if nom_visit:
            visites_par_agent[nom_visit] = visites_par_agent.get(nom_visit, {"total": 0, "validees": 0, "refusees": 0})
            visites_par_agent[nom_visit]["total"] += 1
            if p.status in (ProspectStatus.VALIDEE_DEV, ProspectStatus.APPROUVEE_RC, ProspectStatus.PUCE_ATTRIBUEE, ProspectStatus.PUCE_ACTIVEE, "VALIDEE_DEV", "APPROUVEE_RC", "PUCE_ATTRIBUEE", "PUCE_ACTIVEE"):
                visites_par_agent[nom_visit]["validees"] += 1
            if p.status in (ProspectStatus.REFUSEE_DEV, "REFUSEE_DEV"):
                visites_par_agent[nom_visit]["refusees"] += 1

        # Activations
        aa = load_user(p.activation_assigned_to_id) if hasattr(p, 'activation_assigned_to_id') else None
        if not aa and hasattr(p, 'activation_assigned_to'):
            aa = p.activation_assigned_to
        nom_act = get_user_name(aa)
        if nom_act:
            activations_par_agent[nom_act] = activations_par_agent.get(nom_act, {"total": 0, "activees": 0})
            activations_par_agent[nom_act]["total"] += 1
            if p.status in (ProspectStatus.PUCE_ACTIVEE, "PUCE_ACTIVEE"):
                activations_par_agent[nom_act]["activees"] += 1

    # Formatter pour le frontend
    def fmt_list(d, key_nom="agent", sort_key="total"):
        return sorted([
            {key_nom: k, **v}
            for k, v in d.items() if k
        ], key=lambda x: -x.get(sort_key, 0))

    # Stats globales par statut
    statuts = {}
    for p in prospects:
        s = p.status.value if hasattr(p.status, 'value') else str(p.status)
        statuts[s] = statuts.get(s, 0) + 1

    return {
        "total_prospects": len(prospects),
        "par_statut": statuts,
        "prospections": fmt_list(prospections_par_agent),
        "visites": fmt_list(visites_par_agent),
        "activations": fmt_list(activations_par_agent),
    }


@router.post("/{prospect_id}/confirm-refus-dev")
def confirm_refus_dev(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """RC confirme le refus du développeur → REFUSEE_RC (état terminal, sort du workflow)."""
    from app.models.prospect import Prospect as ProspectModel
    from sqlalchemy import text

    p = db.query(ProspectModel).filter(ProspectModel.id == prospect_id).first()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")

    current_status = p.status.value if hasattr(p.status, 'value') else str(p.status)
    if current_status not in ("REFUSEE_DEV", "refusee_dev"):
        raise HTTPException(400, f"Statut actuel: '{current_status}'. Attendu: 'REFUSEE_DEV'")

    # Mise à jour directe en SQL pour éviter tout conflit de statut
    db.execute(
        text("UPDATE prospects SET status = 'REFUSEE_RC' WHERE id = :id"),
        {"id": prospect_id}
    )
    db.commit()
    db.refresh(p)
    return {"success": True, "id": p.id, "status": "REFUSEE_RC", "reference": p.reference}


@router.post("/{prospect_id}/cancel-visit", response_model=ProspectOut)
def cancel_visit(
    prospect_id: int,
    payload: dict = Body(default={"motif": ""}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """RC ou Admin annule l'attribution de visite — retour à NOUVELLE."""
    from app.services.prospection_service import cancel_visit as svc_cancel_visit
    motif = payload.get("motif", "") if payload else ""
    return svc_cancel_visit(db, prospect_id, motif, current_user)


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


@router.delete("/{prospect_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prospect(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suppression forcée d'un prospect (admin, manager et RC) — même si en cours de workflow."""
    from app.models.user import UserRole
    from app.models.prospect import Prospect, ProspectHistory, ProspectAttachment
    if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.RC]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls les admins, managers et RC peuvent supprimer un prospect."
        )
    prospect = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable")

    # 1. Supprimer les notifications liées (disparaît chez tous les utilisateurs)
    try:
        from app.models.prospect_extras import Notification
        db.query(Notification).filter(Notification.related_prospect_id == prospect_id).delete()
    except Exception:
        pass

    # 2. Supprimer l'historique
    db.query(ProspectHistory).filter(ProspectHistory.prospect_id == prospect_id).delete()

    # 3. Supprimer les pièces jointes
    try:
        db.query(ProspectAttachment).filter(ProspectAttachment.prospect_id == prospect_id).delete()
    except Exception:
        pass

    # 4. Supprimer les extras prospect (stock, gamification, geo, etc.)
    try:
        from app.models.prospect_extras import (
            ProspectStock, ProspectGamification, ProspectGeo,
            ProspectPostAction, ProspectReporting
        )
        for Model in [ProspectStock, ProspectGamification, ProspectGeo,
                      ProspectPostAction, ProspectReporting]:
            try:
                db.query(Model).filter(Model.prospect_id == prospect_id).delete()
            except Exception:
                pass
    except Exception:
        pass

    # 5. Supprimer le prospect lui-même
    db.delete(prospect)
    db.commit()
    return
