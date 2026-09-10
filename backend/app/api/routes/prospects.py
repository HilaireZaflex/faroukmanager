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
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status, Body, HTTPException
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
@router.get("/quartiers")
def list_quartiers_uniques(
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne la liste des quartiers uniques déjà saisis (autocomplete)."""
    from app.models.prospect import Prospect as ProspectModel
    query = db.query(ProspectModel.quartier).filter(
        ProspectModel.quartier.isnot(None),
        ProspectModel.quartier != ''
    )
    if q:
        query = query.filter(ProspectModel.quartier.ilike(f"%{q}%"))
    results = query.distinct().order_by(ProspectModel.quartier).limit(20).all()
    return [r[0] for r in results if r[0]]


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
    _role = str(current_user.role).lower().replace('userrole.', '')
    if _role == 'commercial':
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
    _role = str(current_user.role).lower().replace('userrole.', ''); user_id_filter = current_user.id if _role == 'commercial' else None
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
    date_debut: Optional[str] = Query(None, description="Date début (YYYY-MM-DD)"),
    date_fin: Optional[str] = Query(None, description="Date fin (YYYY-MM-DD)"),
    periode: Optional[str] = Query(None, description="aujourd_hui|cette_semaine|ce_mois|ce_trimestre|tout"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Répartition des prospects par agent pour tous les types d'activités avec filtres date/période."""
    from app.models.prospect import Prospect as ProspectModel, ProspectStatus
    from app.models.user import User as UserModel
    from sqlalchemy import func, case
    from datetime import date, timedelta, datetime

    today = date.today()
    dt_debut = None
    dt_fin = None

    if periode == "aujourd_hui":
        dt_debut = dt_fin = today
    elif periode == "cette_semaine":
        dt_debut = today - timedelta(days=today.weekday())
        dt_fin = today
    elif periode == "ce_mois":
        dt_debut = today.replace(day=1); dt_fin = today
    elif periode == "ce_trimestre":
        m = ((today.month - 1) // 3) * 3 + 1
        dt_debut = today.replace(month=m, day=1); dt_fin = today
    
    if date_debut and not dt_debut:
        try: dt_debut = datetime.strptime(date_debut, "%Y-%m-%d").date()
        except: pass
    if date_fin and not dt_fin:
        try: dt_fin = datetime.strptime(date_fin, "%Y-%m-%d").date()
        except: pass

    # Prospects filtrés par période (date de soumission) — pour prospections et activations
    query = db.query(ProspectModel)
    if dt_debut:
        query = query.filter(func.date(ProspectModel.submitted_at) >= dt_debut)
    if dt_fin:
        query = query.filter(func.date(ProspectModel.submitted_at) <= dt_fin)
    prospects = query.all()

    # Tous les prospects avec visit_assigned_to (pour visites) — filtrés par updated_at (date de validation)
    visites_query = db.query(ProspectModel).filter(ProspectModel.visit_assigned_to_id.isnot(None))
    if dt_debut:
        visites_query = visites_query.filter(func.date(ProspectModel.updated_at) >= dt_debut)
    if dt_fin:
        visites_query = visites_query.filter(func.date(ProspectModel.updated_at) <= dt_fin)
    # Pour "tout" — utiliser tous les prospects avec agent assigné sans filtre date
    all_visites_prospects = db.query(ProspectModel).filter(ProspectModel.visit_assigned_to_id.isnot(None)).all() if not (dt_debut or dt_fin) else visites_query.all()

    periode_label = {
        "aujourd_hui": f"Aujourd'hui ({today.strftime('%d/%m/%Y')})",
        "cette_semaine": f"Cette semaine ({(today - timedelta(days=today.weekday())).strftime('%d/%m')} → {today.strftime('%d/%m')})",
        "ce_mois": f"Ce mois ({today.strftime('%B %Y')})",
        "ce_trimestre": "Ce trimestre",
    }.get(periode or "", f"{date_debut or '...'} → {date_fin or '...'}" if (date_debut or date_fin) else "Toute la période")
    
    periode_info = {"debut": dt_debut.isoformat() if dt_debut else None, "fin": dt_fin.isoformat() if dt_fin else None, "label": periode_label}

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

    # Visites terrain — utiliser all_visites_prospects (filtré par updated_at)
    for p in all_visites_prospects:
        # Visites terrain
        va = load_user(p.visit_assigned_to_id) if hasattr(p, 'visit_assigned_to_id') else None
        if not va and hasattr(p, 'visit_assigned_to'):
            va = p.visit_assigned_to
        nom_visit = get_user_name(va)
        if nom_visit:
            visites_par_agent[nom_visit] = visites_par_agent.get(nom_visit, {"total": 0, "validees": 0, "refusees": 0, "effectuees": 0, "restantes": 0})
            visites_par_agent[nom_visit]["total"] += 1
            # Normaliser le statut en string pour la comparaison
            status_str = p.status.value if hasattr(p.status, 'value') else str(p.status)
            STATUTS_VISITE_EFFECTUEE = {"VALIDEE_DEV", "APPROUVEE_RC", "PUCE_ATTRIBUEE", "PUCE_ACTIVEE", "REFUSEE_DEV", "REFUSEE_RC"}
            STATUTS_VISITE_RESTANTE = {"EN_VISITE"}
            if status_str in STATUTS_VISITE_EFFECTUEE:
                visites_par_agent[nom_visit]["effectuees"] += 1
                visites_par_agent[nom_visit]["validees"] += 1
            elif status_str in STATUTS_VISITE_RESTANTE:
                visites_par_agent[nom_visit]["restantes"] += 1
            if status_str in {"REFUSEE_DEV", "REFUSEE_RC"}:
                visites_par_agent[nom_visit]["refusees"] += 1

        # Activations — utiliser submitted_by si activation_assigned_to est null
        # (dans ce workflow, c'est souvent le même développeur)
        if p.status in (ProspectStatus.PUCE_ACTIVEE, "PUCE_ACTIVEE"):
            aa = load_user(p.activation_assigned_to_id) if hasattr(p, 'activation_assigned_to_id') else None
            if not aa and hasattr(p, 'activation_assigned_to'):
                aa = p.activation_assigned_to
            # Fallback sur submitted_by si activation_assigned_to est null
            if not aa and hasattr(p, 'submitted_by_id') and p.submitted_by_id:
                aa = load_user(p.submitted_by_id)
            if not aa and hasattr(p, 'submitted_by'):
                aa = p.submitted_by
            nom_act = get_user_name(aa)
            if nom_act:
                activations_par_agent[nom_act] = activations_par_agent.get(nom_act, {"total": 0, "activees": 0})
                activations_par_agent[nom_act]["total"] += 1
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

    # Total visitées global = tous prospects dont la visite est terminée (avec ou sans agent assigné)
    STATUTS_POST_VISITE = {"VALIDEE_DEV", "APPROUVEE_RC", "PUCE_ATTRIBUEE", "PUCE_ACTIVEE", "REFUSEE_DEV", "REFUSEE_RC"}
    total_visitees_global = sum(1 for p in prospects if (p.status.value if hasattr(p.status, 'value') else str(p.status)) in STATUTS_POST_VISITE)

    return {
        "total_prospects": len(prospects),
        "total_visitees": total_visitees_global,
        "par_statut": statuts,
        "prospections": fmt_list(prospections_par_agent),
        "visites": fmt_list(visites_par_agent),
        "activations": fmt_list(activations_par_agent),
        "periode": periode_info,
    }


ACTIVATION_FORM_FIELDS = (
    "prenom", "nom", "nationalite", "date_naissance", "type_piece",
    "numero_piece", "date_delivrance", "domicile", "telephone",
    "numero_personnel", "numero_pdv", "type_pdv", "type_activite",
    "adresse_pdv", "date_activation", "montant_activation", "zone",
    "sous_zone", "quartier", "nom_garant", "tel_garant", "developpeur",
    "tel_developpeur", "gestionnaire", "tel_gestionnaire", "superviseur",
    "tel_superviseur", "teleconseillere", "tel_teleconseillere", "kaabu",
    "nafama", "omy", "lbft", "comment", "gps_lat", "gps_lng",
)

REVIEWER_ROLES = {
    "admin", "manager", "rc", "conformite",
    "responsable_produit_et_qualit_oprationnelle_",
}


def _ensure_conformity_reviewer(user: User):
    role = str(user.role).lower().replace("userrole.", "")
    if role not in REVIEWER_ROLES:
        raise HTTPException(403, "Seul un responsable autorisé peut contrôler la conformité")


@router.post("/{prospect_id}/soumettre-conformite")
def soumettre_conformite(
    prospect_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enregistre le formulaire complet et le soumet au contrôle de conformité."""
    from app.models.prospect import Prospect as ProspectModel
    p = db.query(ProspectModel).filter(ProspectModel.id == prospect_id).first()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")
    current_status = str(p.status).lower().replace("prospectstatus.", "")
    if current_status != "puce_attribuee":
        raise HTTPException(400, f"Statut actuel: '{p.status}'. Attendu: 'PUCE_ATTRIBUEE'")

    activation_payload = payload.get("activation_data") or payload
    activation_data = {key: activation_payload.get(key) for key in ACTIVATION_FORM_FIELDS}
    missing = [key for key in ("numero_pdv", "zone", "gps_lat", "gps_lng") if not activation_data.get(key)]
    if missing:
        raise HTTPException(400, f"Champs obligatoires manquants: {', '.join(missing)}")
    if not p.attachments:
        raise HTTPException(400, "Au moins une pièce jointe est obligatoire")
    activation_data["document_count"] = len(p.attachments)

    role = str(current_user.role).lower().replace("userrole.", "")
    if role not in REVIEWER_ROLES and p.puce_assigned_to_id != current_user.id:
        raise HTTPException(403, "Seul le développeur chargé de l'activation peut soumettre ce formulaire")

    p.activation_data = activation_data
    p.activation_superviseur = activation_data.get("superviseur") or None
    p.activation_gestionnaire = activation_data.get("gestionnaire") or None
    p.activation_teleconseillere = activation_data.get("teleconseillere") or None
    p.activation_developpeur = activation_data.get("developpeur") or None
    p.activation_type_pdv = activation_data.get("type_pdv") or None
    p.puce_numero = activation_data.get("numero_pdv") or p.puce_numero
    p.latitude = float(activation_data["gps_lat"])
    p.longitude = float(activation_data["gps_lng"])
    p.status = "EN_ATTENTE_CONFORMITE"
    p.conformity_review = None
    p.conformity_corrections = None
    p.conformity_submitted_at = datetime.utcnow()
    p.conformity_reviewed_at = None
    p.conformity_reviewed_by_id = None
    db.commit()

    try:
        from app.services.notification_service import get_rc_user_ids, create_notif
        prospect_name = f"{activation_data.get('prenom') or p.prenom} {activation_data.get('nom') or p.nom}".strip()
        for reviewer_id in get_rc_user_ids(db):
            create_notif(
                db, user_id=reviewer_id,
                title=f"📋 Formulaire d'activation à valider — {p.reference}",
                message=f"{prospect_name} a une demande complète en attente de contrôle champ par champ.",
                prospect_id=p.id,
                payload={"type": "CONFORMITE_EN_ATTENTE", "action": "Contrôler la demande", "prospect_reference": p.reference},
            )
    except Exception:
        pass
    return {"success": True, "status": "EN_ATTENTE_CONFORMITE", "id": p.id}


@router.post("/{prospect_id}/valider-conformite")
def valider_conformite(
    prospect_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Valide tous les champs contrôlés puis crée réellement le PDV."""
    from app.models.prospect import Prospect as ProspectModel
    _ensure_conformity_reviewer(current_user)
    p = db.query(ProspectModel).filter(ProspectModel.id == prospect_id).first()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")
    if str(p.status).lower().replace("prospectstatus.", "") != "en_attente_conformite":
        raise HTTPException(400, f"Statut actuel: '{p.status}'. Attendu: 'EN_ATTENTE_CONFORMITE'")

    activation_data = p.activation_data or {}
    field_reviews = payload.get("field_reviews") or {}
    missing_reviews = [key for key in activation_data if field_reviews.get(key, {}).get("status") not in ("approved", "rejected")]
    rejected_fields = [key for key in activation_data if field_reviews.get(key, {}).get("status") == "rejected"]
    if missing_reviews:
        raise HTTPException(400, f"Chaque champ doit être contrôlé. Champs restants: {', '.join(missing_reviews)}")
    if rejected_fields:
        raise HTTPException(400, "Des champs sont refusés. Renvoyez la demande pour correction avant validation.")

    p.conformity_review = field_reviews
    p.conformity_reviewed_at = datetime.utcnow()
    p.conformity_reviewed_by_id = current_user.id
    p.conformity_corrections = None

    # Reporter les valeurs approuvées sur le prospect et dans la fiche PDV finale.
    p.prenom = activation_data.get("prenom") or p.prenom
    p.nom = activation_data.get("nom") or p.nom
    p.telephone_principal = activation_data.get("telephone") or p.telephone_principal
    p.telephone_secondaire = activation_data.get("numero_personnel") or p.telephone_secondaire
    p.quartier = activation_data.get("quartier") or p.quartier
    p.adresse = activation_data.get("domicile") or p.adresse
    p.pdv_adresse = activation_data.get("adresse_pdv") or p.pdv_adresse
    p.puce_numero = activation_data.get("numero_pdv") or p.puce_numero
    p.latitude = float(activation_data.get("gps_lat") or p.latitude)
    p.longitude = float(activation_data.get("gps_lng") or p.longitude)
    db.flush()

    req = PuceActivateRequest(
        comment=activation_data.get("comment"),
        numero_pdv=activation_data.get("numero_pdv") or p.puce_numero,
        gestionnaire=activation_data.get("gestionnaire"),
        superviseur=activation_data.get("superviseur"),
        teleconseillere=activation_data.get("teleconseillere"),
        developpeur=activation_data.get("developpeur"),
        zone=activation_data.get("zone"),
        sous_zone=activation_data.get("sous_zone"),
        quartier_pdv=activation_data.get("quartier"),
        nom_gerant=f"{activation_data.get('prenom') or p.prenom} {activation_data.get('nom') or p.nom}".strip(),
        telephone=activation_data.get("telephone"),
        numero_personnel=activation_data.get("numero_personnel"),
        type_pdv=activation_data.get("type_pdv") or "RS",
        adresse=activation_data.get("adresse_pdv"),
        date_activation=activation_data.get("date_activation"),
        nom_garant=activation_data.get("nom_garant"),
        tel_garant=activation_data.get("tel_garant"),
    )
    return svc.activate_puce(db, prospect_id, req, current_user)


@router.post("/{prospect_id}/rejeter-conformite")
def rejeter_conformite(
    prospect_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne uniquement les champs refusés au développeur avec leurs consignes."""
    from app.models.prospect import Prospect as ProspectModel
    _ensure_conformity_reviewer(current_user)
    p = db.query(ProspectModel).filter(ProspectModel.id == prospect_id).first()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")
    if str(p.status).lower().replace("prospectstatus.", "") != "en_attente_conformite":
        raise HTTPException(400, "Cette demande n'est plus en attente de conformité")

    activation_data = p.activation_data or {}
    field_reviews = payload.get("field_reviews") or {}
    corrections = payload.get("correction_fields") or []
    correction_map = {
        item.get("field"): {
            "field": item.get("field"),
            "label": item.get("label") or item.get("field"),
            "comment": (item.get("comment") or "À corriger").strip(),
        }
        for item in corrections if item.get("field") in activation_data
    }
    rejected_keys = [key for key, review in field_reviews.items() if review.get("status") == "rejected" and key in activation_data]
    if not rejected_keys:
        raise HTTPException(400, "Refusez au moins un champ avant de renvoyer la demande")
    for key in rejected_keys:
        correction_map.setdefault(key, {"field": key, "label": key, "comment": field_reviews[key].get("comment") or "À corriger"})

    motif = (payload.get("motif") or "Des informations doivent être corrigées.").strip()
    p.conformity_review = field_reviews
    p.conformity_corrections = {
        "motif": motif,
        "fields": list(correction_map.values()),
        "returned_at": datetime.utcnow().isoformat(),
        "returned_by": f"{current_user.prenom or ''} {current_user.nom}".strip(),
    }
    p.conformity_reviewed_at = datetime.utcnow()
    p.conformity_reviewed_by_id = current_user.id
    p.status = "PUCE_ATTRIBUEE"
    db.commit()

    try:
        from app.services.notification_service import create_notif
        if p.puce_assigned_to_id:
            field_names = ", ".join(item["label"] for item in correction_map.values())
            create_notif(
                db, user_id=p.puce_assigned_to_id,
                title=f"↩️ Activation à corriger — {p.reference}",
                message=f"La conformité a renvoyé votre demande. Champs à modifier : {field_names}. Motif général : {motif}",
                prospect_id=p.id,
                payload={"type": "CONFORMITE_CORRECTION", "action": "Corriger et soumettre à nouveau", "fields": list(correction_map.values()), "prospect_reference": p.reference},
            )
    except Exception:
        pass
    return {"success": True, "status": "PUCE_ATTRIBUEE", "id": p.id, "corrections": p.conformity_corrections}


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
    _role = str(current_user.role).lower().replace('userrole.', '')
    if _role not in ['admin', 'manager', 'rc']:
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
