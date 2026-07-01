"""
Routes API pour les notifications workflow.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.notification_service import (
    get_pending_notifications,
    mark_as_read,
    mark_all_as_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/pending")
def pending_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne les notifications non lues de l'utilisateur connecté."""
    notifs = get_pending_notifications(db, current_user.id)
    return [
        {
            "id": n.id,
            "type": n.type,
            "titre": n.titre,
            "message": n.message,
            "action_requise": n.action_requise,
            "etape": n.etape,
            "prospect_reference": n.prospect_reference,
            "prospect_nom": n.prospect_nom,
            "lu": n.lu,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]


@router.post("/{notif_id}/read")
def read_notification(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marque une notification comme lue."""
    notif = mark_as_read(db, notif_id, current_user.id)
    if not notif:
        return {"ok": False, "detail": "Notification non trouvée"}
    return {"ok": True}


@router.post("/read-all")
def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marque toutes les notifications comme lues."""
    mark_all_as_read(db, current_user.id)
    return {"ok": True}
