"""Envoi des notifications push (Web Push / VAPID).

Le principe : chaque appareil abonné possède un « endpoint » chez le service de
push du navigateur (Google, Apple, Mozilla…). On chiffre le message avec la clé
VAPID du serveur et on le POSTe sur cet endpoint ; le navigateur le remet au
service worker, qui affiche la notification — même si l'application est fermée.

L'envoi se fait dans un fil séparé : une notification ne doit jamais ralentir
(ou faire échouer) la requête métier qui la déclenche.
"""
import json
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# Adresse de contact exigée par la norme VAPID (le service de push peut s'en
# servir en cas d'abus). Le domaine suffit, aucun envoi de courriel n'est fait.
VAPID_SUBJECT = "mailto:admin@faroukdistribution.com"

# Au-delà de 24 h, une notification de terrain n'a plus d'intérêt.
TTL_SECONDES = 24 * 3600


def _resume(texte: str, maximum: int = 170) -> str:
    """Message court pour l'écran de verrouillage : une phrase, sans sauts de ligne."""
    if not texte:
        return ""
    une_ligne = " ".join(str(texte).split())
    if len(une_ligne) <= maximum:
        return une_ligne
    return une_ligne[: maximum - 1].rstrip() + "…"


def _url_depuis_payload(payload: Optional[dict], prospect_id: Optional[int] = None) -> str:
    """Écran à ouvrir quand l'utilisateur touche la notification."""
    payload = payload or {}
    if prospect_id:
        return f"/m/prospect/{prospect_id}"
    if payload.get("url"):
        return str(payload["url"])
    etape = payload.get("etape")
    if etape == 3:
        return "/m/prospection?filtre=EN_VISITE"
    if etape in (4, 5):
        return "/m/prospection"
    if payload.get("reclamation_id"):
        return f"/m/reclamation/{payload['reclamation_id']}"
    return "/m/prospection"


def _envoyer_vers(user_id: int, charge: dict) -> int:
    """Envoie la charge utile à tous les appareils d'un utilisateur. Renvoie le nombre d'envois réussis."""
    from app.core.database import SessionLocal
    from app.models.push import PushSubscription, PushVapid

    db = SessionLocal()
    envoyes = 0
    try:
        abonnements = (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == user_id)
            .all()
        )
        if not abonnements:
            return 0

        cles = db.query(PushVapid).first()
        if not cles or not cles.private_key:
            logger.warning("Push : aucune clé VAPID en base, envoi ignoré.")
            return 0

        try:
            from pywebpush import webpush, WebPushException
        except ImportError:
            logger.warning("Push : pywebpush absent, envoi ignoré.")
            return 0

        corps = json.dumps(charge, ensure_ascii=False)
        for abonnement in abonnements:
            try:
                webpush(
                    subscription_info={
                        "endpoint": abonnement.endpoint,
                        "keys": {"p256dh": abonnement.p256dh, "auth": abonnement.auth},
                    },
                    data=corps,
                    vapid_private_key=cles.private_key,
                    vapid_claims={"sub": VAPID_SUBJECT},
                    ttl=TTL_SECONDES,
                )
                envoyes += 1
            except WebPushException as erreur:
                statut = getattr(getattr(erreur, "response", None), "status_code", None)
                # 404 / 410 : l'appareil n'existe plus (désinstallé, abonnement
                # expiré). On le retire pour ne pas réessayer indéfiniment.
                if statut in (404, 410):
                    db.delete(abonnement)
                    db.commit()
                    logger.info("Push : appareil expiré supprimé (%s).", statut)
                else:
                    logger.warning("Push : échec d'envoi (statut %s) : %s", statut, erreur)
            except Exception as erreur:  # réseau, chiffrement, etc.
                logger.warning("Push : erreur inattendue : %s", erreur)
        return envoyes
    except Exception as erreur:
        logger.warning("Push : envoi impossible : %s", erreur)
        return 0
    finally:
        db.close()


def envoyer_push(user_id: int, *, titre: str, message: str,
                 url: Optional[str] = None, tag: Optional[str] = None,
                 prospect_id: Optional[int] = None,
                 payload: Optional[dict] = None) -> None:
    """Programme l'envoi d'une notification push (non bloquant)."""
    charge = {
        "title": titre,
        "body": _resume(message),
        "url": url or _url_depuis_payload(payload, prospect_id),
        "tag": tag,
    }
    fil = threading.Thread(target=_envoyer_vers, args=(user_id, charge), daemon=True)
    fil.start()


def envoyer_push_sync(user_id: int, *, titre: str, message: str,
                      url: Optional[str] = None, tag: Optional[str] = None) -> int:
    """Envoi immédiat (utilisé par l'endpoint de test). Renvoie le nombre d'appareils touchés."""
    charge = {
        "title": titre,
        "body": _resume(message),
        "url": url or "/m/accueil",
        "tag": tag,
    }
    return _envoyer_vers(user_id, charge)


def notifier_push_etape(db, notification) -> None:
    """Envoie le push correspondant à une notification workflow qui vient d'être créée."""
    try:
        payload = notification.payload or {}
        envoyer_push(
            notification.recipient_user_id,
            titre=notification.title,
            message=notification.message,
            prospect_id=notification.related_prospect_id,
            payload=payload,
            tag=f"prospect-{notification.related_prospect_id}" if notification.related_prospect_id else None,
        )
    except Exception as erreur:
        logger.warning("Push : notification %s non relayée : %s",
                       getattr(notification, "id", "?"), erreur)
