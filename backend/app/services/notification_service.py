"""
Service de notifications workflow pour FaroukManager.
Crée des notifications persistantes en DB pour chaque action du workflow Prospection.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User


# =============================================================================
# CRÉATION DE NOTIFICATIONS
# =============================================================================

def create_notification(
    db: Session,
    *,
    user_id: int,
    type: str,
    titre: str,
    message: str,
    action_requise: str,
    etape: Optional[int] = None,
    prospect_reference: Optional[str] = None,
    prospect_nom: Optional[str] = None,
) -> Notification:
    """Crée et persiste une notification pour un utilisateur."""
    notif = Notification(
        user_id=user_id,
        type=type,
        titre=titre,
        message=message,
        action_requise=action_requise,
        etape=etape,
        prospect_reference=prospect_reference,
        prospect_nom=prospect_nom,
        lu=False,
        created_at=datetime.utcnow(),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


# =============================================================================
# NOTIFICATIONS PAR ÉTAPE WORKFLOW
# =============================================================================

def notif_visite_assignee(db: Session, *, developer_id: int, prospect_ref: str, prospect_nom: str, assigned_by: str):
    """Étape 2 → notifie le développeur qu'une visite lui a été assignée."""
    create_notification(
        db,
        user_id=developer_id,
        type="VISITE_ASSIGNEE",
        titre="🔍 Visite terrain à effectuer",
        message=(
            f"Le Responsable Commercial ({assigned_by}) vous a assigné une visite terrain.\n\n"
            f"Prospect : {prospect_ref} — {prospect_nom}\n\n"
            f"Rendez-vous sur le terrain, évaluez le lieu et donnez votre décision "
            f"(valider ou rejeter) avec une justification dans l'onglet Workflow → Étape 3."
        ),
        action_requise="Effectuer la visite et valider/rejeter le prospect",
        etape=3,
        prospect_reference=prospect_ref,
        prospect_nom=prospect_nom,
    )


def notif_decision_dev(db: Session, *, rc_ids: list, prospect_ref: str, prospect_nom: str, approved: bool, dev_nom: str, comment: str):
    """Étape 3 → notifie le(s) RC de la décision du développeur."""
    decision = "validé ✅" if approved else "rejeté ❌"
    action = "Examinez ce prospect et donnez votre validation finale dans Workflow → Étape 4." if approved else "Consultez le motif de rejet dans Workflow → Étape 4."
    for rc_id in rc_ids:
        create_notification(
            db,
            user_id=rc_id,
            type="DECISION_DEV_RECUE",
            titre=f"📋 Décision reçue sur {prospect_ref}",
            message=(
                f"Le développeur {dev_nom} a {decision} le prospect après visite terrain.\n\n"
                f"Prospect : {prospect_ref} — {prospect_nom}\n\n"
                f"Motif : « {comment} »\n\n"
                f"{action}"
            ),
            action_requise="Valider ou refuser ce prospect (Étape 4)" if approved else "Consulter le rejet",
            etape=4,
            prospect_reference=prospect_ref,
            prospect_nom=prospect_nom,
        )


def notif_rc_approuve(db: Session, *, rc_ids: list, prospect_ref: str, prospect_nom: str):
    """Étape 4 → rappel RC : il doit attribuer pour activation."""
    for rc_id in rc_ids:
        create_notification(
            db,
            user_id=rc_id,
            type="APPROBATION_RC_PENDING",
            titre=f"📦 Attribution activation requise — {prospect_ref}",
            message=(
                f"Vous avez approuvé le prospect {prospect_ref} — {prospect_nom}.\n\n"
                f"Vous devez maintenant attribuer ce prospect à un développeur pour l'activation "
                f"de la puce Orange Money.\n\n"
                f"Rendez-vous dans Workflow → Étape 5 — Attribution activation."
            ),
            action_requise="Attribuer un développeur et un numéro de puce (Étape 5)",
            etape=5,
            prospect_reference=prospect_ref,
            prospect_nom=prospect_nom,
        )


def notif_activation_assignee(db: Session, *, developer_id: int, prospect_ref: str, prospect_nom: str, puce_numero: str, assigned_by: str):
    """Étape 5 → notifie le développeur qu'une activation lui a été assignée."""
    create_notification(
        db,
        user_id=developer_id,
        type="ACTIVATION_ASSIGNEE",
        titre="⚡ Activation de puce à effectuer",
        message=(
            f"Le Responsable Commercial ({assigned_by}) vous a assigné une activation terrain.\n\n"
            f"Prospect : {prospect_ref} — {prospect_nom}\n"
            f"N° de puce Orange Money : {puce_numero}\n\n"
            f"Rendez-vous sur le terrain, activez la puce et renseignez les informations du PDV "
            f"(gestionnaire, superviseur, zone) dans l'onglet Activation."
        ),
        action_requise="Activer la puce et créer le PDV (onglet Activation)",
        etape=6,
        prospect_reference=prospect_ref,
        prospect_nom=prospect_nom,
    )


def notif_activation_confirmee(db: Session, *, rc_ids: list, prospect_ref: str, prospect_nom: str, dev_nom: str):
    """Étape 6 → notifie le RC que l'activation est confirmée et le PDV créé."""
    for rc_id in rc_ids:
        create_notification(
            db,
            user_id=rc_id,
            type="ACTIVATION_CONFIRMEE",
            titre=f"✅ PDV créé — {prospect_ref}",
            message=(
                f"Le développeur {dev_nom} a activé la puce et créé le Point de Vente.\n\n"
                f"Prospect : {prospect_ref} — {prospect_nom}\n\n"
                f"Le nouveau PDV est maintenant visible dans le menu Points de Vente. "
                f"Aucune action supplémentaire requise."
            ),
            action_requise="Aucune — pour information",
            etape=None,
            prospect_reference=prospect_ref,
            prospect_nom=prospect_nom,
        )


# =============================================================================
# LECTURE DES NOTIFICATIONS
# =============================================================================

def get_pending_notifications(db: Session, user_id: int) -> list:
    """Retourne les notifications non lues de l'utilisateur."""
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.lu == False)
        .order_by(Notification.created_at.desc())
        .limit(20)
        .all()
    )


def mark_as_read(db: Session, notif_id: int, user_id: int) -> Optional[Notification]:
    """Marque une notification comme lue."""
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == user_id
    ).first()
    if notif:
        notif.lu = True
        notif.lu_at = datetime.utcnow()
        db.commit()
    return notif


def mark_all_as_read(db: Session, user_id: int):
    """Marque toutes les notifications d'un utilisateur comme lues."""
    db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.lu == False
    ).update({"lu": True, "lu_at": datetime.utcnow()})
    db.commit()


def get_rc_user_ids(db: Session) -> list:
    """Retourne les IDs de tous les utilisateurs RC et Admin."""
    from app.models.user import UserRole
    users = db.query(User.id).filter(
        User.role.in_([UserRole.RC, UserRole.ADMIN, UserRole.MANAGER])
    ).all()
    return [u.id for u in users]
