"""
Service de notifications workflow pour FaroukManager.
Utilise le modèle Notification existant (prospect_extras.py).
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.prospect_extras import Notification, NotifChannel, NotifStatus
from app.models.user import User


# =============================================================================
# UTILITAIRE : créer une notification IN_APP
# =============================================================================

def create_notif(
    db: Session,
    *,
    user_id: int,
    title: str,
    message: str,
    prospect_id: Optional[int] = None,
    payload: Optional[dict] = None,
) -> Notification:
    notif = Notification(
        recipient_user_id=user_id,
        channel=NotifChannel.IN_APP,
        status=NotifStatus.PENDING,
        title=title,
        message=message,
        related_prospect_id=prospect_id,
        payload=payload or {},
        created_at=datetime.utcnow(),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


# =============================================================================
# NOTIFICATIONS PAR ÉTAPE WORKFLOW
# =============================================================================

def notif_visite_assignee(db, *, developer_id, prospect_ref, prospect_nom, assigned_by, prospect_id=None):
    create_notif(db, user_id=developer_id,
        title=f"🔍 Visite terrain à effectuer — {prospect_ref}",
        message=(
            f"Le Responsable Commercial ({assigned_by}) vous a assigné une visite terrain.\n\n"
            f"Prospect : {prospect_ref} — {prospect_nom}\n\n"
            f"Rendez-vous sur le terrain, évaluez le lieu et donnez votre décision "
            f"(valider ou rejeter) avec justification dans Workflow → Étape 3."
        ),
        prospect_id=prospect_id,
        payload={"etape": 3, "action": "Effectuer la visite et valider/rejeter le prospect", "prospect_reference": prospect_ref, "prospect_nom": prospect_nom},
    )


def notif_decision_dev(db, *, rc_ids, prospect_ref, prospect_nom, approved, dev_nom, comment, prospect_id=None):
    decision = "validé ✅" if approved else "rejeté ❌"
    action = "Validez ou refusez ce prospect dans Workflow → Étape 4." if approved else "Consultez le motif de rejet dans Workflow → Étape 4."
    for rc_id in rc_ids:
        create_notif(db, user_id=rc_id,
            title=f"📋 Décision reçue — {prospect_ref} {decision}",
            message=(
                f"Le développeur {dev_nom} a {decision} le prospect après visite terrain.\n\n"
                f"Prospect : {prospect_ref} — {prospect_nom}\n"
                f"Motif : « {comment} »\n\n"
                f"{action}"
            ),
            prospect_id=prospect_id,
            payload={"etape": 4, "action": "Valider ou refuser ce prospect (Étape 4)" if approved else "Consulter le rejet", "prospect_reference": prospect_ref, "prospect_nom": prospect_nom},
        )


def notif_rc_approuve(db, *, rc_ids, prospect_ref, prospect_nom, prospect_id=None):
    for rc_id in rc_ids:
        create_notif(db, user_id=rc_id,
            title=f"📦 Attribution activation requise — {prospect_ref}",
            message=(
                f"Vous avez approuvé le prospect {prospect_ref} — {prospect_nom}.\n\n"
                f"Vous devez maintenant attribuer ce prospect à un développeur pour l'activation "
                f"de la puce Orange Money.\n\n"
                f"Rendez-vous dans Workflow → Étape 5 — Attribution activation."
            ),
            prospect_id=prospect_id,
            payload={"etape": 5, "action": "Attribuer un développeur et un numéro de puce (Étape 5)", "prospect_reference": prospect_ref, "prospect_nom": prospect_nom},
        )


def notif_activation_assignee(db, *, developer_id, prospect_ref, prospect_nom, puce_numero, assigned_by, prospect_id=None):
    create_notif(db, user_id=developer_id,
        title=f"⚡ Activation de puce à effectuer — {prospect_ref}",
        message=(
            f"Le Responsable Commercial ({assigned_by}) vous a assigné une activation terrain.\n\n"
            f"Prospect : {prospect_ref} — {prospect_nom}\n"
            f"N° de puce Orange Money : {puce_numero}\n\n"
            f"Rendez-vous sur le terrain, activez la puce et renseignez les informations du PDV "
            f"(gestionnaire, superviseur, zone) dans l'onglet Activation."
        ),
        prospect_id=prospect_id,
        payload={"etape": 6, "action": "Activer la puce et créer le PDV (onglet Activation)", "prospect_reference": prospect_ref, "prospect_nom": prospect_nom, "puce_numero": puce_numero},
    )


def notif_activation_confirmee(db, *, rc_ids, prospect_ref, prospect_nom, dev_nom, prospect_id=None):
    for rc_id in rc_ids:
        create_notif(db, user_id=rc_id,
            title=f"✅ PDV créé — {prospect_ref}",
            message=(
                f"Le développeur {dev_nom} a activé la puce et créé le Point de Vente.\n\n"
                f"Prospect : {prospect_ref} — {prospect_nom}\n\n"
                f"Le nouveau PDV est visible dans le menu Points de Vente. Aucune action requise."
            ),
            prospect_id=prospect_id,
            payload={"etape": None, "action": "Aucune — pour information", "prospect_reference": prospect_ref, "prospect_nom": prospect_nom},
        )


# =============================================================================
# LECTURE DES NOTIFICATIONS
# =============================================================================

def get_pending_notifications(db: Session, user_id: int) -> List[Notification]:
    """Retourne les notifications IN_APP non lues de l'utilisateur."""
    return (
        db.query(Notification)
        .filter(
            Notification.recipient_user_id == user_id,
            Notification.channel == NotifChannel.IN_APP,
            Notification.status != NotifStatus.READ,
        )
        .order_by(Notification.created_at.desc())
        .limit(20)
        .all()
    )


def mark_as_read(db: Session, notif_id: int, user_id: int):
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.recipient_user_id == user_id,
    ).first()
    if notif:
        notif.status = NotifStatus.READ
        notif.read_at = datetime.utcnow()
        db.commit()
    return notif


def mark_all_as_read(db: Session, user_id: int):
    db.query(Notification).filter(
        Notification.recipient_user_id == user_id,
        Notification.channel == NotifChannel.IN_APP,
        Notification.status != NotifStatus.READ,
    ).update({"status": NotifStatus.READ, "read_at": datetime.utcnow()})
    db.commit()


def get_rc_user_ids(db: Session) -> List[int]:
    from app.models.user import UserRole
    users = db.query(User.id).filter(
        User.role.in_([UserRole.RC, UserRole.ADMIN, UserRole.MANAGER])
    ).all()
    return [u.id for u in users]
