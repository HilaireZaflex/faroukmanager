"""
Service métier du module Prospection.
====================================
Implémente le workflow complet d'une demande de puce Orange Money,
les transitions d'état autorisées, le calcul des SLA et l'historisation
de toutes les décisions.

Règles métier :
- Multi-puces : NON (un prospect = une seule demande de puce active)
- Réaffectation : OUI (si développeur visiteur refuse, on peut demander
  une 2ème opinion via assign_visit)
- Géolocalisation : OBLIGATOIRE pour valider (latitude + longitude)
- Capital min (non-OM) : 50 000 FCFA (validé dans le schéma)
- SLA recommandés :
    * Visite terrain      : 48h après soumission
    * Décision RC         : 72h après validation développeur
    * Activation puce     : 48h après attribution
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from fastapi import HTTPException, status

from app.models.prospect import (
    Prospect,
    ProspectHistory,
    ProspectAttachment,
    ProspectStatus,
    DecisionType,
)
from app.models.user import User, UserRole
from app.models.pdv import PDV, PDVStatut
from app.schemas.prospect import (
    ProspectCreate,
    ProspectUpdate,
    AssignVisitRequest,
    DevDecisionRequest,
    RCDecisionRequest,
    PuceAssignRequest,
    PuceActivateRequest,
    CancelRequest,
)


# ─────────────────────────────────────────────────────────────────────────────
# Constantes SLA
# ─────────────────────────────────────────────────────────────────────────────
SLA_VISIT_HOURS = 48
SLA_RC_DECISION_HOURS = 72
SLA_ACTIVATION_HOURS = 48

# Transitions autorisées (état courant -> états suivants possibles)
ALLOWED_TRANSITIONS: Dict[ProspectStatus, List[ProspectStatus]] = {
    ProspectStatus.NOUVELLE: [
        ProspectStatus.EN_VISITE,
        ProspectStatus.ANNULEE,
    ],
    ProspectStatus.EN_VISITE: [
        ProspectStatus.VALIDEE_DEV,
        ProspectStatus.REFUSEE_DEV,
        ProspectStatus.ANNULEE,
    ],
    ProspectStatus.REFUSEE_DEV: [
        ProspectStatus.EN_VISITE,        # réaffectation 2ème opinion
        ProspectStatus.ANNULEE,
    ],
    ProspectStatus.VALIDEE_DEV: [
        ProspectStatus.APPROUVEE_RC,
        ProspectStatus.EN_ATTENTE_RC,
        ProspectStatus.REFUSEE_RC,
        ProspectStatus.ANNULEE,
    ],
    ProspectStatus.EN_ATTENTE_RC: [
        ProspectStatus.APPROUVEE_RC,
        ProspectStatus.REFUSEE_RC,
        ProspectStatus.ANNULEE,
    ],
    ProspectStatus.APPROUVEE_RC: [
        ProspectStatus.PUCE_ATTRIBUEE,
        ProspectStatus.ANNULEE,
    ],
    ProspectStatus.PUCE_ATTRIBUEE: [
        ProspectStatus.PUCE_ACTIVEE,
        ProspectStatus.ANNULEE,
    ],
    ProspectStatus.PUCE_ACTIVEE: [],     # état terminal
    ProspectStatus.REFUSEE_RC: [],       # état terminal
    ProspectStatus.ANNULEE: [],          # état terminal
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# Notifications (best-effort, n'interrompt jamais le workflow)
# ─────────────────────────────────────────────────────────────────────────────
def _notify(db, **kwargs):
    try:
        from app.services import prospect_notif_service as _n
        return _n.emit(db, **kwargs)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"notif failed: {e}")
        return []


def _ensure_transition(current: ProspectStatus, target: ProspectStatus):
    if target not in ALLOWED_TRANSITIONS.get(current, []):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Transition non autorisée : {current.value} → {target.value}",
        )


def _generate_reference(db: Session) -> str:
    """Génère une référence unique au format PROS-AAAA-NNNNNN."""
    year = datetime.utcnow().year
    count = db.query(func.count(Prospect.id)).filter(
        func.strftime("%Y", Prospect.created_at) == str(year)
    ).scalar() or 0
    return f"PROS-{year}-{(count + 1):06d}"


def _log_history(
    db: Session,
    prospect: Prospect,
    user: Optional[User],
    decision_type: DecisionType,
    from_status: Optional[ProspectStatus] = None,
    to_status: Optional[ProspectStatus] = None,
    comment: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
):
    entry = ProspectHistory(
        prospect_id=prospect.id,
        user_id=user.id if user else None,
        decision_type=decision_type,
        from_status=from_status,
        to_status=to_status,
        comment=comment,
        extra=extra,
    )
    db.add(entry)


def _ensure_role(user: User, allowed_roles: List[UserRole], action: str):
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Rôle insuffisant pour {action} (requis : "
                   f"{', '.join(r.value for r in allowed_roles)})",
        )


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur {user_id} introuvable",
        )
    return user


def _get_prospect_or_404(db: Session, prospect_id: int) -> Prospect:
    p = db.query(Prospect).filter(Prospect.id == prospect_id).first()
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prospect {prospect_id} introuvable",
        )
    return p


def _ensure_geoloc(prospect: Prospect, override_lat=None, override_lng=None):
    """La géolocalisation est OBLIGATOIRE pour valider une fiche."""
    lat = override_lat if override_lat is not None else prospect.latitude
    lng = override_lng if override_lng is not None else prospect.longitude
    if lat is None or lng is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Géolocalisation obligatoire (latitude/longitude requises) pour valider la fiche.",
        )


# ─────────────────────────────────────────────────────────────────────────────
# CRUD : Création / lecture / mise à jour d'un prospect
# ─────────────────────────────────────────────────────────────────────────────
def create_prospect(db: Session, payload: ProspectCreate, current_user: User) -> Prospect:
    """Soumission initiale par un superviseur ou un développeur."""
    _ensure_role(
        current_user,
        [UserRole.SUPERVISEUR, UserRole.DEVELOPPEUR, UserRole.ADMIN, UserRole.MANAGER, UserRole.RC, UserRole.GESTIONNAIRE],
        "soumettre un prospect",
    )

    # Anti-doublon léger : même téléphone principal ouvert
    existing = db.query(Prospect).filter(
        Prospect.telephone_principal == payload.telephone_principal,
        Prospect.status.notin_([
            ProspectStatus.REFUSEE_RC,
            ProspectStatus.ANNULEE,
            ProspectStatus.PUCE_ACTIVEE,
        ])
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Un prospect actif existe déjà avec ce numéro (réf: {existing.reference})."
        )

    now = datetime.utcnow()
    payload_data = payload.model_dump(exclude_unset=True)
    # Convertir les Enum en valeur string pour compatibilité PostgreSQL
    if 'type_local' in payload_data and hasattr(payload_data['type_local'], 'value'):
        payload_data['type_local'] = payload_data['type_local'].value
    if 'frequentation' in payload_data and payload_data['frequentation'] and hasattr(payload_data['frequentation'], 'value'):
        payload_data['frequentation'] = payload_data['frequentation'].value
    if 'piece_identite_type' in payload_data and payload_data['piece_identite_type'] and hasattr(payload_data['piece_identite_type'], 'value'):
        payload_data['piece_identite_type'] = payload_data['piece_identite_type'].value

    prospect = Prospect(
        reference=_generate_reference(db),
        status=ProspectStatus.NOUVELLE,
        submitted_by_id=current_user.id,
        submitted_at=now,
        created_at=now,
        updated_at=now,
        sla_visit_due_at=now + timedelta(hours=SLA_VISIT_HOURS),
        **payload_data,
    )
    db.add(prospect)
    db.flush()

    _log_history(
        db, prospect, current_user,
        decision_type=DecisionType.SUBMIT,
        from_status=None,
        to_status=ProspectStatus.NOUVELLE,
        comment=f"Fiche créée par {current_user.role.value}",
    )
    db.commit()
    db.refresh(prospect)
    return prospect


def update_prospect(db: Session, prospect_id: int, payload: ProspectUpdate, current_user: User) -> Prospect:
    """Mise à jour partielle (autorisée tant que la décision RC n'a pas été prise)."""
    p = _get_prospect_or_404(db, prospect_id)
    if p.status in {
        ProspectStatus.APPROUVEE_RC, ProspectStatus.REFUSEE_RC,
        ProspectStatus.PUCE_ATTRIBUEE, ProspectStatus.PUCE_ACTIVEE,
        ProspectStatus.ANNULEE,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Modification interdite à l'état {p.status.value}",
        )

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)

    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return p


def get_prospect(db: Session, prospect_id: int) -> Prospect:
    return _get_prospect_or_404(db, prospect_id)


def list_prospects(
    db: Session,
    current_user: User,
    status_filter: Optional[ProspectStatus] = None,
    assigned_to_me: bool = False,
    submitted_by_me: bool = False,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> List[Prospect]:
    q = db.query(Prospect)

    if status_filter:
        q = q.filter(Prospect.status == status_filter)

    if assigned_to_me:
        q = q.filter(or_(
            Prospect.visit_assigned_to_id == current_user.id,
            Prospect.puce_assigned_to_id == current_user.id,
        ))
    if submitted_by_me:
        q = q.filter(Prospect.submitted_by_id == current_user.id)

    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            Prospect.reference.ilike(like),
            Prospect.nom.ilike(like),
            Prospect.prenom.ilike(like),
            Prospect.telephone_principal.ilike(like),
            Prospect.quartier.ilike(like),
        ))

    return q.order_by(Prospect.created_at.desc()).offset(skip).limit(limit).all()


# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOW - Étape 1 → 2 : Affectation à un développeur (visite terrain)
# ─────────────────────────────────────────────────────────────────────────────
def assign_visit(db: Session, prospect_id: int, payload: AssignVisitRequest, current_user: User) -> Prospect:
    """
    Affecte (ou réaffecte) un développeur visiteur.
    - États autorisés en entrée : NOUVELLE, REFUSEE_DEV (réaffectation = 2ᵉ opinion)
    - Réservé aux rôles : ADMIN, MANAGER, RC, SUPERVISEUR
    """
    _ensure_role(
        current_user,
        [UserRole.ADMIN, UserRole.MANAGER, UserRole.RC, UserRole.SUPERVISEUR],
        "affecter une visite",
    )
    p = _get_prospect_or_404(db, prospect_id)

    target = _get_user_or_404(db, payload.developer_id)
    if target.role != UserRole.DEVELOPPEUR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'utilisateur affecté doit avoir le rôle DEVELOPPEUR.",
        )
    if not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Développeur inactif.",
        )

    _ensure_transition(p.status, ProspectStatus.EN_VISITE)
    is_reassignment = (p.status == ProspectStatus.REFUSEE_DEV)

    from_status = p.status
    p.status = ProspectStatus.EN_VISITE
    p.visit_assigned_to_id = target.id
    p.visit_assigned_at = datetime.utcnow()
    p.visit_attempts = (p.visit_attempts or 0) + 1
    # Refresh SLA visite
    p.sla_visit_due_at = datetime.utcnow() + timedelta(hours=SLA_VISIT_HOURS)

    _log_history(
        db, p, current_user,
        decision_type=DecisionType.REASSIGN if is_reassignment else DecisionType.ASSIGN_VISIT,
        from_status=from_status,
        to_status=ProspectStatus.EN_VISITE,
        comment=payload.comment or (f"Réaffectation (tentative #{p.visit_attempts})" if is_reassignment
                                     else f"Visite affectée à {target.nom}"),
        extra={"developer_id": target.id, "attempt": p.visit_attempts},
    )
    db.commit()
    db.refresh(p)
    # 🔔 Notif au développeur affecté
    _notify(db, template="visit_assigned", prospect=p, to_user=target)
    return p


# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOW - Étape 2 : Décision développeur (validation / refus)
# ─────────────────────────────────────────────────────────────────────────────
def dev_decision(db: Session, prospect_id: int, payload: DevDecisionRequest, current_user: User) -> Prospect:
    """
    Le développeur affecté valide ou refuse après visite terrain.
    - Commentaire OBLIGATOIRE
    - Géolocalisation OBLIGATOIRE pour valider
    """
    _ensure_role(current_user, [UserRole.DEVELOPPEUR, UserRole.ADMIN], "décider d'une visite")
    p = _get_prospect_or_404(db, prospect_id)

    if p.status != ProspectStatus.EN_VISITE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Décision impossible : statut courant {p.status.value}",
        )
    if current_user.role != UserRole.ADMIN and p.visit_assigned_to_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le développeur affecté peut décider de cette visite.",
        )

    # Mise à jour GPS si fournis
    if payload.latitude is not None:
        p.latitude = payload.latitude
    if payload.longitude is not None:
        p.longitude = payload.longitude

    target_status = ProspectStatus.VALIDEE_DEV if payload.approved else ProspectStatus.REFUSEE_DEV
    _ensure_transition(p.status, target_status)

    if payload.approved:
        _ensure_geoloc(p)

    from_status = p.status
    p.status = target_status
    p.dev_decision_at = datetime.utcnow()
    p.dev_decision_comment = payload.comment

    if payload.approved:
        # Démarrage SLA RC
        p.sla_rc_due_at = datetime.utcnow() + timedelta(hours=SLA_RC_DECISION_HOURS)

    _log_history(
        db, p, current_user,
        decision_type=DecisionType.DEV_VALIDATE if payload.approved else DecisionType.DEV_REJECT,
        from_status=from_status,
        to_status=target_status,
        comment=payload.comment,
    )
    db.commit()
    db.refresh(p)
    # 🔔 Notif au(x) RC quand validé / au superviseur quand refusé
    if payload.approved:
        for rc in db.query(User).filter(User.role == UserRole.RC, User.is_active == True).all():
            _notify(db, template="dev_validated", prospect=p, to_user=rc)
    else:
        if p.submitted_by_id:
            sup = db.query(User).get(p.submitted_by_id)
            if sup:
                _notify(db, template="dev_rejected", prospect=p, to_user=sup)
    return p


# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOW - Étape 3 : Décision RC
# ─────────────────────────────────────────────────────────────────────────────
def rc_decision(db: Session, prospect_id: int, payload: RCDecisionRequest, current_user: User) -> Prospect:
    """Décision finale RC : approve / hold / reject."""
    _ensure_role(current_user, [UserRole.RC, UserRole.ADMIN, UserRole.MANAGER], "décision RC")
    p = _get_prospect_or_404(db, prospect_id)

    if p.status not in {ProspectStatus.VALIDEE_DEV, ProspectStatus.EN_ATTENTE_RC}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Décision RC impossible à l'état {p.status.value}",
        )

    mapping = {
        "approve": (ProspectStatus.APPROUVEE_RC, DecisionType.RC_APPROVE),
        "hold":    (ProspectStatus.EN_ATTENTE_RC, DecisionType.RC_HOLD),
        "reject":  (ProspectStatus.REFUSEE_RC,    DecisionType.RC_REJECT),
    }
    target_status, decision_type = mapping[payload.decision]
    _ensure_transition(p.status, target_status)

    from_status = p.status
    p.status = target_status
    p.rc_decision_at = datetime.utcnow()
    p.rc_decision_by_id = current_user.id
    p.rc_decision_comment = payload.comment

    _log_history(
        db, p, current_user,
        decision_type=decision_type,
        from_status=from_status,
        to_status=target_status,
        comment=payload.comment,
    )
    db.commit()
    db.refresh(p)
    # 🔔 Notif WhatsApp/SMS au prospect (approve/reject)
    if target_status == ProspectStatus.APPROUVEE_RC:
        _notify(db, template="rc_approved", prospect=p, to_phone=p.telephone_principal)
    elif target_status == ProspectStatus.REFUSEE_RC:
        _notify(db, template="rc_rejected", prospect=p, to_phone=p.telephone_principal)
    return p


# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOW - Étape 4 : Attribution de la puce à un développeur activateur
# ─────────────────────────────────────────────────────────────────────────────
def assign_puce(db: Session, prospect_id: int, payload: PuceAssignRequest, current_user: User) -> Prospect:
    """Le RC attribue une puce et désigne le développeur qui activera."""
    _ensure_role(current_user, [UserRole.RC, UserRole.ADMIN, UserRole.MANAGER], "attribuer une puce")
    p = _get_prospect_or_404(db, prospect_id)
    _ensure_transition(p.status, ProspectStatus.PUCE_ATTRIBUEE)

    activator = _get_user_or_404(db, payload.activator_id)
    if activator.role != UserRole.DEVELOPPEUR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'activateur doit être un DEVELOPPEUR.",
        )

    # Unicité du n° de puce
    used = db.query(Prospect).filter(
        Prospect.puce_numero == payload.puce_numero,
        Prospect.id != p.id,
    ).first()
    if used:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Numéro de puce déjà utilisé (réf: {used.reference})",
        )

    from_status = p.status
    p.status = ProspectStatus.PUCE_ATTRIBUEE
    p.puce_assigned_to_id = activator.id
    p.puce_assigned_at = datetime.utcnow()
    p.puce_numero = payload.puce_numero
    p.sla_activation_due_at = datetime.utcnow() + timedelta(hours=SLA_ACTIVATION_HOURS)

    _log_history(
        db, p, current_user,
        decision_type=DecisionType.PUCE_ASSIGN,
        from_status=from_status,
        to_status=ProspectStatus.PUCE_ATTRIBUEE,
        comment=payload.comment or f"Puce {payload.puce_numero} attribuée à {activator.nom}",
        extra={"puce_numero": payload.puce_numero, "activator_id": activator.id},
    )
    db.commit()
    db.refresh(p)
    # 🔔 Notif au développeur activateur + sortie du stock si présent
    _notify(db, template="puce_assigned", prospect=p, to_user=activator)
    try:
        from app.services import prospect_stock_service as _stock
        _stock.reserve(db, payload.puce_numero, p.id)
    except HTTPException:
        pass  # Si la puce n'est pas dans le stock géré, on ignore
    except Exception:
        pass
    return p


# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOW - Étape 5 : Activation de la puce + création optionnelle du PDV
# ─────────────────────────────────────────────────────────────────────────────
def activate_puce(db: Session, prospect_id: int, payload: PuceActivateRequest, current_user: User) -> Prospect:
    """Le développeur activateur confirme la pose/activation sur le terrain."""
    _ensure_role(current_user, [UserRole.DEVELOPPEUR, UserRole.ADMIN], "activer une puce")
    p = _get_prospect_or_404(db, prospect_id)

    if p.status != ProspectStatus.PUCE_ATTRIBUEE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Activation impossible à l'état {p.status.value}",
        )
    if current_user.role != UserRole.ADMIN and p.puce_assigned_to_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le développeur attribué peut activer cette puce.",
        )

    _ensure_geoloc(p)
    _ensure_transition(p.status, ProspectStatus.PUCE_ACTIVEE)

    from_status = p.status
    p.status = ProspectStatus.PUCE_ACTIVEE
    p.activated_at = datetime.utcnow()

    # Création automatique de la fiche PDV (option par défaut)
    pdv_id = None
    if payload.create_pdv:
        new_pdv = PDV(
            numero_pdv=p.puce_numero,                    # n° puce comme identifiant
            nom=f"{p.nom} {p.prenom}".strip(),
            telephone=p.telephone_principal,
            quartier=p.quartier,
            adresse=p.pdv_adresse or p.adresse,
            latitude=p.latitude,
            longitude=p.longitude,
            statut=PDVStatut.ACTIF,
            date_activation=datetime.utcnow(),
            nom_gerant=f"{p.prenom} {p.nom}".strip(),
            nouvelle_creation=True,
            notes=f"Créé via prospection {p.reference}",
        )
        db.add(new_pdv)
        db.flush()
        p.activated_pdv_id = new_pdv.id
        pdv_id = new_pdv.id

    _log_history(
        db, p, current_user,
        decision_type=DecisionType.PUCE_ACTIVATE,
        from_status=from_status,
        to_status=ProspectStatus.PUCE_ACTIVEE,
        comment=payload.comment or "Puce activée sur le terrain",
        extra={"pdv_id": pdv_id, "puce_numero": p.puce_numero},
    )
    db.commit()
    db.refresh(p)
    # 🔔 Notif WhatsApp au prospect + sortie définitive du stock
    _notify(db, template="puce_activated", prospect=p, to_phone=p.telephone_principal)
    try:
        from app.services import prospect_stock_service as _stock
        _stock.mark_activated(db, p.puce_numero)
    except Exception:
        pass
    return p


# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOW - Annulation (à tout moment, sauf états terminaux)
# ─────────────────────────────────────────────────────────────────────────────
def cancel_prospect(db: Session, prospect_id: int, payload: CancelRequest, current_user: User) -> Prospect:
    _ensure_role(
        current_user,
        [UserRole.ADMIN, UserRole.MANAGER, UserRole.RC, UserRole.SUPERVISEUR, UserRole.DEVELOPPEUR],
        "annuler un prospect",
    )
    p = _get_prospect_or_404(db, prospect_id)
    if p.status in {ProspectStatus.PUCE_ACTIVEE, ProspectStatus.REFUSEE_RC, ProspectStatus.ANNULEE}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Impossible d'annuler à l'état {p.status.value}",
        )

    from_status = p.status
    p.status = ProspectStatus.ANNULEE

    _log_history(
        db, p, current_user,
        decision_type=DecisionType.CANCEL,
        from_status=from_status,
        to_status=ProspectStatus.ANNULEE,
        comment=payload.comment,
    )
    db.commit()
    db.refresh(p)
    return p


# ─────────────────────────────────────────────────────────────────────────────
# Statistiques globales du module Prospection
# ─────────────────────────────────────────────────────────────────────────────
def get_stats(db: Session) -> Dict[str, Any]:
    now = datetime.utcnow()
    total = db.query(func.count(Prospect.id)).scalar() or 0

    def cnt(*statuses):
        return db.query(func.count(Prospect.id)).filter(Prospect.status.in_(statuses)).scalar() or 0

    activees = cnt(ProspectStatus.PUCE_ACTIVEE)
    refusees = cnt(ProspectStatus.REFUSEE_DEV, ProspectStatus.REFUSEE_RC)

    sla_retard = db.query(func.count(Prospect.id)).filter(
        or_(
            (Prospect.sla_visit_due_at < now) & (Prospect.status == ProspectStatus.EN_VISITE),
            (Prospect.sla_rc_due_at < now) & (Prospect.status.in_([
                ProspectStatus.VALIDEE_DEV, ProspectStatus.EN_ATTENTE_RC])),
            (Prospect.sla_activation_due_at < now) & (Prospect.status == ProspectStatus.PUCE_ATTRIBUEE),
        )
    ).scalar() or 0

    # Délai moyen activation (en heures) sur les prospects activés
    delai_moyen = None
    activated = db.query(Prospect).filter(
        Prospect.status == ProspectStatus.PUCE_ACTIVEE,
        Prospect.activated_at.isnot(None),
    ).all()
    if activated:
        deltas = [(p.activated_at - p.submitted_at).total_seconds() / 3600.0 for p in activated]
        delai_moyen = round(sum(deltas) / len(deltas), 1)

    return {
        "total": total,
        "nouvelles": cnt(ProspectStatus.NOUVELLE),
        "en_visite": cnt(ProspectStatus.EN_VISITE),
        "validees_dev": cnt(ProspectStatus.VALIDEE_DEV),
        "en_attente_rc": cnt(ProspectStatus.EN_ATTENTE_RC),
        "approuvees_rc": cnt(ProspectStatus.APPROUVEE_RC),
        "puce_attribuees": cnt(ProspectStatus.PUCE_ATTRIBUEE),
        "activees": activees,
        "refusees": refusees,
        "annulees": cnt(ProspectStatus.ANNULEE),
        "sla_en_retard": sla_retard,
        "taux_activation": round((activees / total) * 100, 1) if total else 0.0,
        "delai_moyen_activation_h": delai_moyen,
    }
