"""Notifications push (PWA) : clé publique VAPID et abonnements des appareils."""
import base64

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.core.database import get_db
from app.models.push import PushSubscription, PushVapid
from app.models.user import User

router = APIRouter()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _vapid_keys(db: Session) -> PushVapid:
    """Récupère (ou génère) la paire de clés VAPID."""
    row = db.query(PushVapid).first()
    if row:
        return row
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    cle = ec.generate_private_key(ec.SECP256R1())
    privee = cle.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    publique = cle.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    row = PushVapid(private_key=privee, public_key=_b64url(publique))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class AbonnementIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str | None = None


class DesabonnementIn(BaseModel):
    endpoint: str


@router.get("/push/public-key")
def public_key(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Clé publique VAPID, nécessaire au navigateur pour s'abonner."""
    return {"public_key": _vapid_keys(db).public_key}


@router.post("/push/subscribe")
def subscribe(body: AbonnementIn, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    """Enregistre (ou met à jour) l'appareil de l'utilisateur."""
    if not body.endpoint or not body.p256dh or not body.auth:
        raise HTTPException(400, "Abonnement incomplet.")
    row = db.query(PushSubscription).filter(PushSubscription.endpoint == body.endpoint).first()
    if row:
        row.user_id = current_user.id
        row.p256dh = body.p256dh
        row.auth = body.auth
        row.user_agent = body.user_agent
    else:
        row = PushSubscription(
            user_id=current_user.id, endpoint=body.endpoint, p256dh=body.p256dh,
            auth=body.auth, user_agent=body.user_agent,
        )
        db.add(row)
    db.commit()
    return {"success": True, "id": row.id}


@router.post("/push/unsubscribe")
def unsubscribe(body: DesabonnementIn, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.user_id == current_user.id,
    ).delete()
    db.commit()
    return {"success": True}


@router.post("/push/test")
def tester(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Envoie une notification de test aux appareils de l'utilisateur connecté."""
    from app.services.push_service import envoyer_push_sync

    appareils = db.query(func.count(PushSubscription.id)).filter(
        PushSubscription.user_id == current_user.id).scalar() or 0
    if appareils == 0:
        raise HTTPException(400, "Aucun appareil abonné : activez d'abord les notifications.")

    resultat = envoyer_push_sync(
        current_user.id,
        titre="🔔 Farouk Manager — test",
        message="Les notifications fonctionnent sur cet appareil. Vous serez prévenu des visites, décisions et activations.",
        url="/m/profil",
        tag="test",
    )
    if resultat["envoyes"] == 0:
        detail = resultat["erreurs"][0] if resultat["erreurs"] else "Le service de notification a refusé l'envoi."
        raise HTTPException(502, f"Envoi impossible : {detail}")
    return {"success": True, "appareils": appareils, "envoyes": resultat["envoyes"]}


@router.post("/push/test/{user_id}")
def tester_pour(user_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """Support : envoie un test aux appareils d'un utilisateur (admin uniquement)."""
    role = str(getattr(current_user, "role", "")).split(".")[-1].lower()
    if role != "admin":
        raise HTTPException(403, "Réservé à l'administrateur.")

    from app.services.push_service import envoyer_push_sync

    appareils = db.query(func.count(PushSubscription.id)).filter(
        PushSubscription.user_id == user_id).scalar() or 0
    if appareils == 0:
        raise HTTPException(400, f"Aucun appareil abonné pour l'utilisateur {user_id}.")

    resultat = envoyer_push_sync(
        user_id,
        titre="🔔 Farouk Manager — test",
        message="Test envoyé par l'administrateur : les notifications fonctionnent sur cet appareil.",
        url="/m/profil",
        tag="test-admin",
    )
    return {
        "success": resultat["envoyes"] > 0,
        "appareils": appareils,
        "envoyes": resultat["envoyes"],
        "erreurs": resultat["erreurs"],
    }


@router.get("/push/status")
def statut(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Nombre d'appareils abonnés pour cet utilisateur (et au total)."""
    from app.services.push_service import moteur_disponible

    miens = db.query(func.count(PushSubscription.id)).filter(
        PushSubscription.user_id == current_user.id).scalar() or 0
    total = db.query(func.count(PushSubscription.id)).scalar() or 0
    return {
        "mes_appareils": miens,
        "total_abonnements": total,
        "moteur_push": moteur_disponible(),
    }
