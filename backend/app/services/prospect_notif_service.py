"""
Service Notifications.
=======================
- list_for_user       : notifications d'un user
- mark_read           : marquer comme lue
- send                : envoyer une notif (in-app + WhatsApp + SMS)
- emit                : helper appelé par le workflow à chaque transition
- send_pending        : flush des notifications PENDING (à câbler à un cron)
- TEMPLATES           : modèles de message paramétrables
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.prospect_extras import (
    Notification, NotifChannel, NotifStatus,
)
from app.models.user import User
from app.models.prospect import Prospect, ProspectStatus

# ─────────────────────────────────────────────────────────────────────────────
# Templates de messages (paramétrables, multi-canaux)
# ─────────────────────────────────────────────────────────────────────────────
TEMPLATES = {
    "visit_assigned": {
        "title": "🔍 Nouvelle visite à effectuer",
        "message": "Bonjour {dev_nom}, une visite vous a été affectée pour le prospect {prospect_nom} ({reference}) à {quartier}. Téléphone : {telephone}.",
    },
    "dev_validated": {
        "title": "✅ Prospect validé",
        "message": "{dev_nom} a validé le prospect {prospect_nom} ({reference}). À traiter par le RC.",
    },
    "dev_rejected": {
        "title": "❌ Prospect refusé par développeur",
        "message": "{dev_nom} a refusé le prospect {prospect_nom} ({reference}). Motif : {comment}",
    },
    "rc_approved": {
        "title": "🟢 Demande approuvée",
        "message": "Votre demande de puce OM ({reference}) a été approuvée. Une puce vous sera bientôt remise.",
    },
    "rc_rejected": {
        "title": "🚫 Demande refusée",
        "message": "Votre demande ({reference}) n'a pas été retenue. Motif : {comment}",
    },
    "puce_assigned": {
        "title": "📦 Activation à effectuer",
        "message": "Bonjour {activator_nom}, vous devez activer la puce {puce_numero} chez {prospect_nom} ({reference}).",
    },
    "puce_activated": {
        "title": "⚡ Puce activée",
        "message": "Félicitations ! Votre puce OM est désormais active. Bienvenue dans le réseau Orange Mali.",
    },
    "sla_warning": {
        "title": "⏰ SLA bientôt dépassé",
        "message": "Le prospect {reference} approche de son échéance SLA. Action attendue.",
    },
}


def _render(tpl_key: str, ctx: Dict[str, Any]) -> Dict[str, str]:
    tpl = TEMPLATES.get(tpl_key, {"title": tpl_key, "message": ""})
    safe_ctx = {k: ("" if v is None else str(v)) for k, v in ctx.items()}
    try:
        return {
            "title": tpl["title"].format(**safe_ctx),
            "message": tpl["message"].format(**safe_ctx),
        }
    except (KeyError, IndexError):
        return tpl


def emit(db: Session, *,
         template: str,
         prospect: Optional[Prospect] = None,
         to_user: Optional[User] = None,
         to_phone: Optional[str] = None,
         channels: Optional[List[NotifChannel]] = None,
         extra_ctx: Optional[Dict[str, Any]] = None,
         link: Optional[str] = None) -> List[Notification]:
    """Crée une (ou plusieurs) notifications selon les canaux demandés."""
    if channels is None:
        channels = [NotifChannel.IN_APP] + ([NotifChannel.WHATSAPP] if to_phone else [])

    ctx = {}
    if prospect:
        ctx.update({
            "reference": prospect.reference,
            "prospect_nom": f"{prospect.prenom or ''} {prospect.nom or ''}".strip(),
            "telephone": prospect.telephone_principal,
            "quartier": prospect.quartier,
            "puce_numero": prospect.puce_numero or "",
            "comment": prospect.dev_decision_comment or prospect.rc_decision_comment or "",
        })
    if to_user:
        ctx["dev_nom"] = f"{to_user.prenom or ''} {to_user.nom or ''}".strip()
        ctx["activator_nom"] = ctx["dev_nom"]
    if extra_ctx:
        ctx.update(extra_ctx)

    rendered = _render(template, ctx)
    if not link and prospect:
        link = f"/prospection?focus={prospect.id}"

    created = []
    for ch in channels:
        n = Notification(
            recipient_user_id=to_user.id if to_user else None,
            recipient_phone=to_phone,
            channel=ch,
            status=NotifStatus.PENDING,
            title=rendered["title"],
            message=rendered["message"],
            link=link,
            related_prospect_id=prospect.id if prospect else None,
            template=template,
            payload={"ctx": ctx},
        )
        db.add(n); created.append(n)
    db.commit()
    return created


def list_for_user(db: Session, user_id: int, unread_only: bool = False, limit: int = 50) -> List[Notification]:
    q = db.query(Notification).filter(
        Notification.recipient_user_id == user_id,
        Notification.channel == NotifChannel.IN_APP,
    )
    if unread_only:
        q = q.filter(Notification.status != NotifStatus.READ)
    return q.order_by(Notification.created_at.desc()).limit(limit).all()


def unread_count(db: Session, user_id: int) -> int:
    return db.query(Notification).filter(
        Notification.recipient_user_id == user_id,
        Notification.channel == NotifChannel.IN_APP,
        Notification.status != NotifStatus.READ,
    ).count()


def mark_read(db: Session, notif_id: int, user_id: int) -> Optional[Notification]:
    n = db.query(Notification).filter(
        Notification.id == notif_id, Notification.recipient_user_id == user_id
    ).first()
    if not n: return None
    n.status = NotifStatus.READ
    n.read_at = datetime.utcnow()
    db.commit(); db.refresh(n); return n


def mark_all_read(db: Session, user_id: int) -> int:
    r = db.query(Notification).filter(
        Notification.recipient_user_id == user_id,
        Notification.channel == NotifChannel.IN_APP,
        Notification.status != NotifStatus.READ,
    ).update({"status": NotifStatus.READ, "read_at": datetime.utcnow()})
    db.commit()
    return r


def send_pending(db: Session) -> Dict[str, Any]:
    """
    Envoie les notifications PENDING via les providers configurés.
    - IN_APP : marqué SENT immédiatement (déjà visible dans l'app)
    - SMS / WHATSAPP / EMAIL : appelle le provider approprié
    Met à jour le payload avec la trace d'envoi (ok, provider, error, external_id).
    """
    from app.services.notification_providers import get_provider
    pending = db.query(Notification).filter(Notification.status == NotifStatus.PENDING).all()

    sent, failed, simulated = 0, 0, 0
    detail_by_channel = {}

    for n in pending:
        ch = n.channel.value if hasattr(n.channel, "value") else str(n.channel)

        # IN_APP : pas d'envoi externe
        if ch == "IN_APP":
            n.status = NotifStatus.SENT
            n.sent_at = datetime.utcnow()
            sent += 1
            detail_by_channel.setdefault(ch, {"sent": 0, "failed": 0, "simulated": 0})
            detail_by_channel[ch]["sent"] += 1
            continue

        # Récupère le destinataire (user.email pour EMAIL, recipient_phone sinon)
        to = None
        if ch == "EMAIL" and n.recipient and n.recipient.email:
            to = n.recipient.email
        else:
            to = n.recipient_phone or (n.recipient.email if n.recipient else None)

        if not to:
            n.status = NotifStatus.FAILED
            n.payload = {**(n.payload or {}), "error": "Aucun destinataire"}
            failed += 1; continue

        provider = get_provider(ch)
        result = provider.send(to=to, title=n.title, message=n.message)

        # Trace dans le payload
        n.payload = {**(n.payload or {}), "send_result": result}
        if result.get("ok"):
            if "SIMULATED" in result.get("status", ""):
                simulated += 1
                detail_by_channel.setdefault(ch, {"sent": 0, "failed": 0, "simulated": 0})
                detail_by_channel[ch]["simulated"] += 1
            else:
                sent += 1
                detail_by_channel.setdefault(ch, {"sent": 0, "failed": 0, "simulated": 0})
                detail_by_channel[ch]["sent"] += 1
            n.status = NotifStatus.SENT
            n.sent_at = datetime.utcnow()
        else:
            n.status = NotifStatus.FAILED
            failed += 1
            detail_by_channel.setdefault(ch, {"sent": 0, "failed": 0, "simulated": 0})
            detail_by_channel[ch]["failed"] += 1

    db.commit()
    return {
        "processed": len(pending),
        "sent": sent,
        "simulated": simulated,
        "failed": failed,
        "by_channel": detail_by_channel,
    }


def test_send(channel: str, to: str, title: str, message: str) -> Dict[str, Any]:
    """Envoi de test sans persister en base (pour vérifier la config provider)."""
    from app.services.notification_providers import get_provider
    provider = get_provider(channel)
    return provider.send(to=to, title=title, message=message)


def detect_stagnant(db: Session, days: int = 3) -> List[Dict[str, Any]]:
    """Demandes qui stagnent depuis X jours (pour rappels auto)."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    actifs = db.query(Prospect).filter(
        Prospect.status.in_([
            ProspectStatus.NOUVELLE,
            ProspectStatus.EN_VISITE,
            ProspectStatus.VALIDEE_DEV,
            ProspectStatus.EN_ATTENTE_RC,
            ProspectStatus.PUCE_ATTRIBUEE,
        ]),
        Prospect.updated_at < cutoff,
    ).all()
    return [{
        "id": p.id, "reference": p.reference,
        "nom": f"{p.prenom} {p.nom}".strip(),
        "status": p.status.value,
        "days_stagnant": (datetime.utcnow() - p.updated_at).days,
    } for p in actifs]
