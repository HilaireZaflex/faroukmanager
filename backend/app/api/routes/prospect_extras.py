"""
Routes API additionnelles pour la Prospection :
  - /prospects/geo/*           Géolocalisation, carte, heatmap, itinéraire, géofencing
  - /prospects/stock/*         Stock de puces
  - /prospects/notifications/* Notifications in-app
  - /prospects/reporting/*     Funnel, perf devs/zones, pipeline
  - /prospects/postact/*       Suivi post-activation
  - /prospects/gamification/*  Classement, badges, objectifs
  - /prospects/{id}/attachments/* Pièces jointes
  - /prospects/export.xlsx     Export Excel
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import StreamingResponse
from io import BytesIO
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.prospect import ProspectStatus
from app.models.prospect_extras import PuceStockStatus, NotifChannel

from app.services import (
    prospect_geo_service as geo_svc,
    prospect_stock_service as stock_svc,
    prospect_notif_service as notif_svc,
    prospect_reporting_service as rep_svc,
    prospect_postact_service as post_svc,
    prospect_gamification_service as game_svc,
    prospect_attachment_service as att_svc,
    prospect_export_service as export_svc,
    prospection_service as svc,
)

router = APIRouter(prefix="/prospects", tags=["Prospection - Extras"])


# ────────────────────────────────────────────────────────────────────────
# 1. GÉOLOCALISATION
# ────────────────────────────────────────────────────────────────────────
@router.get("/geo/map")
def geo_map(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return {
        "prospects": geo_svc.map_prospects(db),
        "pdvs": geo_svc.map_pdvs(db),
    }

@router.get("/geo/heatmap")
def geo_heatmap(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return geo_svc.heatmap_data(db)

@router.get("/{prospect_id}/geo/nearby")
def geo_nearby(prospect_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return geo_svc.nearby_pdvs(db, prospect_id)

@router.get("/geo/route")
def geo_route(start_lat: float, start_lng: float,
              db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    return geo_svc.optimize_route(db, current_user.id, start_lat, start_lng)

@router.post("/{prospect_id}/geo/verify")
def geo_verify(prospect_id: int, lat: float, lng: float,
               db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return geo_svc.verify_geofence(db, prospect_id, lat, lng)


# ────────────────────────────────────────────────────────────────────────
# 2. STOCK DE PUCES
# ────────────────────────────────────────────────────────────────────────
@router.get("/stock/list")
def stock_list(status: Optional[PuceStockStatus] = None, lot: Optional[str] = None,
               limit: int = 200, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items = stock_svc.list_stock(db, status, lot, limit)
    return [{
        "id": p.id, "numero": p.numero, "lot": p.lot, "serie": p.serie,
        "status": p.status.value, "received_at": p.received_at.isoformat() if p.received_at else None,
        "reserved_at": p.reserved_at.isoformat() if p.reserved_at else None,
        "activated_at": p.activated_at.isoformat() if p.activated_at else None,
        "reserved_for_prospect_id": p.reserved_for_prospect_id,
    } for p in items]

@router.get("/stock/stats")
def stock_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return stock_svc.stats(db)

@router.post("/stock/lot")
def stock_create_lot(lot_code: str = Form(...), numbers: str = Form(...),
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    nums = [n.strip() for n in numbers.split(",") if n.strip()]
    n = stock_svc.create_lot(db, lot_code, nums, current_user.id)
    return {"created": n, "lot": lot_code}

@router.post("/stock/{numero}/status")
def stock_change_status(numero: str, new_status: PuceStockStatus,
                        db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    p = stock_svc.mark_status(db, numero, new_status)
    return {"numero": p.numero, "status": p.status.value}


# ────────────────────────────────────────────────────────────────────────
# 3. NOTIFICATIONS
# ────────────────────────────────────────────────────────────────────────
@router.get("/notifications/me")
def notif_me(unread_only: bool = False, db: Session = Depends(get_db),
             current_user: User = Depends(get_current_user)):
    items = notif_svc.list_for_user(db, current_user.id, unread_only)
    return [{
        "id": n.id, "title": n.title, "message": n.message, "link": n.link,
        "status": n.status.value, "channel": n.channel.value,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "related_prospect_id": n.related_prospect_id,
        "template": n.template,
    } for n in items]

@router.get("/notifications/me/count")
def notif_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"unread": notif_svc.unread_count(db, current_user.id)}

@router.post("/notifications/{notif_id}/read")
def notif_read(notif_id: int, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    n = notif_svc.mark_read(db, notif_id, current_user.id)
    if not n: raise HTTPException(404, "Notification introuvable")
    return {"ok": True}

@router.post("/notifications/me/read-all")
def notif_read_all(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"updated": notif_svc.mark_all_read(db, current_user.id)}

@router.post("/notifications/flush")
def notif_flush(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Envoie les notifications PENDING via les providers configurés (Twilio, WhatsApp, SMTP)."""
    return notif_svc.send_pending(db)

@router.get("/notifications/stagnant")
def notif_stagnant(days: int = 3, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return notif_svc.detect_stagnant(db, days)

@router.get("/notifications/providers")
def notif_providers_status(_: User = Depends(get_current_user)):
    """Renvoie l'état de configuration des providers (Twilio, WhatsApp, SMTP)."""
    from app.services.notification_providers import status_summary
    return status_summary()

@router.post("/notifications/test")
def notif_test_send(channel: str, to: str, title: str = "Test FaroukManager",
                    message: str = "Ceci est un message de test depuis FaroukManager.",
                    _: User = Depends(get_current_user)):
    """Teste l'envoi via un provider sans rien persister en base."""
    if channel not in ("SMS", "WHATSAPP", "EMAIL"):
        raise HTTPException(400, "channel doit être SMS, WHATSAPP ou EMAIL")
    return notif_svc.test_send(channel, to, title, message)

@router.post("/notifications/providers/reload")
def notif_providers_reload(_: User = Depends(get_current_user)):
    """Recharge la configuration des providers (utile après modification du .env)."""
    from app.services.notification_providers import reset_cache
    reset_cache()
    return {"reloaded": True}


# ────────────────────────────────────────────────────────────────────────
# 4. REPORTING
# ────────────────────────────────────────────────────────────────────────
@router.get("/reporting/funnel")
def rep_funnel(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return rep_svc.funnel(db)

@router.get("/reporting/per-developer")
def rep_per_dev(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return rep_svc.per_developer(db)

@router.get("/reporting/per-zone")
def rep_per_zone(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return rep_svc.per_zone(db)

@router.get("/reporting/rc-pipeline")
def rep_pipeline(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return rep_svc.rc_pipeline(db)

@router.get("/reporting/time-to-activation")
def rep_tta(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return rep_svc.time_to_activation(db)


# ────────────────────────────────────────────────────────────────────────
# 5. POST-ACTIVATION
# ────────────────────────────────────────────────────────────────────────
@router.get("/postact/list")
def post_list(prospect_id: Optional[int] = None, db: Session = Depends(get_db),
              _: User = Depends(get_current_user)):
    return post_svc.list_kpis(db, prospect_id)

@router.post("/postact/generate")
def post_generate(period_days: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if period_days not in (30, 60, 90):
        raise HTTPException(400, "period_days doit être 30, 60 ou 90")
    n = post_svc.generate_for_period(db, period_days)
    return {"created": n, "period_days": period_days}

@router.get("/postact/dormant")
def post_dormant(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return post_svc.dormant_puces(db)

@router.get("/postact/calibration")
def post_calibration(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return post_svc.ai_calibration_data(db)


# ────────────────────────────────────────────────────────────────────────
# 6. GAMIFICATION
# ────────────────────────────────────────────────────────────────────────
@router.get("/gamification/leaderboard")
def game_lb(period: Optional[str] = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return game_svc.leaderboard(db, period)

@router.post("/gamification/compute-badges")
def game_compute(period: Optional[str] = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return {"granted": game_svc.compute_badges(db, period)}

@router.get("/gamification/badges/{user_id}")
def game_badges(user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return game_svc.list_badges(db, user_id)

@router.get("/gamification/objectives")
def game_obj_list(user_id: Optional[int] = None, period: Optional[str] = None,
                  db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return game_svc.list_objectives(db, user_id, period)

@router.post("/gamification/objectives")
def game_obj_create(user_id: int, period: str,
                    target_visits: int = 0, target_validations: int = 0,
                    target_activations: int = 0, bonus_amount: float = 0.0,
                    db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    o = game_svc.create_objective(db, user_id, period, target_visits, target_validations,
                                  target_activations, bonus_amount)
    return {"id": o.id, "user_id": o.user_id, "period": o.period}


# ────────────────────────────────────────────────────────────────────────
# 7. PIÈCES JOINTES
# ────────────────────────────────────────────────────────────────────────
@router.get("/{prospect_id}/attachments")
def att_list(prospect_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return att_svc.list_attachments(db, prospect_id)

@router.post("/{prospect_id}/attachments")
def att_upload(prospect_id: int, kind: str = Form(...), file: UploadFile = File(...),
               db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    a = att_svc.upload(db, prospect_id, kind, file, current_user.id)
    return {"id": a.id, "filename": a.file_name, "kind": a.kind.value}

@router.delete("/attachments/{attachment_id}")
def att_delete(attachment_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return {"deleted": att_svc.delete(db, attachment_id)}

@router.get("/{prospect_id}/attachments/check")
def att_check(prospect_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return att_svc.check_required(db, prospect_id)


# ────────────────────────────────────────────────────────────────────────
# 8. EXPORT EXCEL
# ────────────────────────────────────────────────────────────────────────
@router.get("/export.xlsx")
def export_xlsx(status: Optional[ProspectStatus] = None,
                db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    content = export_svc.export_xlsx(db, status)
    fname = f"prospects_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
