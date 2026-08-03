"""
Routes API Appels TC — Suivi des appels téléphoniques des téléconseillères
Prefix: /api/appels-tc
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.appel_tc import AppelTC, StatutAppel, IndicateurAppel, STATUT_LABELS
from app.models.user import User
from app.models.pdv import PDV
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AppelCreate(BaseModel):
    numero_pdv: str
    nom_pdv: Optional[str] = None
    indicateur: IndicateurAppel
    statut: StatutAppel
    commentaire: Optional[str] = None
    date_rappel: Optional[date] = None


# ─── Helper ───────────────────────────────────────────────────────────────────

def _fmt(a: AppelTC) -> dict:
    return {
        "id": a.id,
        "numero_pdv": a.numero_pdv,
        "nom_pdv": a.nom_pdv,
        "indicateur": a.indicateur.value if a.indicateur else None,
        "tc_user_id": a.tc_user_id,
        "tc_nom": a.tc_nom,
        "statut": a.statut.value if a.statut else None,
        "statut_label": STATUT_LABELS.get(a.statut.value if a.statut else "", ""),
        "commentaire": a.commentaire,
        "date_rappel": a.date_rappel.isoformat() if a.date_rappel else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/appels-tc")
def create_appel(
    body: AppelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enregistrer un appel TC sur un PDV."""
    tc_nom = f"{current_user.prenom or ''} {current_user.nom or ''}".strip()

    appel = AppelTC(
        numero_pdv=body.numero_pdv,
        nom_pdv=body.nom_pdv,
        indicateur=body.indicateur,
        tc_user_id=current_user.id,
        tc_nom=tc_nom,
        statut=body.statut,
        commentaire=body.commentaire,
        date_rappel=body.date_rappel,
    )
    db.add(appel)
    db.commit()
    db.refresh(appel)

    # Envoyer une notification aux admins/RC
    try:
        from app.services.notification_service import send_notification
        statut_label = STATUT_LABELS.get(body.statut.value, body.statut.value)
        send_notification(
            db=db,
            title=f"📞 Appel TC — {body.numero_pdv}",
            message=f"{tc_nom} a appelé le PDV {body.nom_pdv or body.numero_pdv} [{body.indicateur.value}] : {statut_label}",
            target_roles=["ADMIN", "RC"],
        )
    except Exception:
        pass  # Notification non bloquante

    return _fmt(appel)


@router.get("/appels-tc")
def list_appels(
    numero_pdv: Optional[str] = Query(None),
    indicateur: Optional[str] = Query(None),
    mes_appels_seulement: bool = Query(False, description="Si True, retourne uniquement les appels de l'utilisateur connecté"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lister les appels TC — filtrable par PDV, indicateur, ou user."""
    q = db.query(AppelTC)

    if numero_pdv:
        q = q.filter(AppelTC.numero_pdv == numero_pdv)
    if indicateur:
        q = q.filter(AppelTC.indicateur == indicateur)
    if mes_appels_seulement:
        q = q.filter(AppelTC.tc_user_id == current_user.id)

    total = q.count()
    items = q.order_by(desc(AppelTC.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_fmt(a) for a in items],
    }


@router.get("/appels-tc/pdv/{numero_pdv}")
def get_appels_pdv(
    numero_pdv: str,
    indicateur: Optional[str] = Query(None),
    mes_appels_seulement: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historique des appels TC pour un PDV spécifique."""
    q = db.query(AppelTC).filter(AppelTC.numero_pdv == numero_pdv)
    if indicateur:
        q = q.filter(AppelTC.indicateur == indicateur)
    if mes_appels_seulement:
        q = q.filter(AppelTC.tc_user_id == current_user.id)

    items = q.order_by(desc(AppelTC.created_at)).limit(50).all()
    return [_fmt(a) for a in items]


@router.get("/appels-tc/stats")
def get_appels_stats(
    indicateur: Optional[str] = Query(None),
    tc_user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statistiques des appels TC par statut."""
    q = db.query(AppelTC.statut, func.count(AppelTC.id).label("count"))
    if indicateur:
        q = q.filter(AppelTC.indicateur == indicateur)
    if tc_user_id:
        q = q.filter(AppelTC.tc_user_id == tc_user_id)

    rows = q.group_by(AppelTC.statut).all()
    return {
        "par_statut": [
            {
                "statut": r.statut.value,
                "label": STATUT_LABELS.get(r.statut.value, ""),
                "count": r.count,
            }
            for r in rows
        ],
        "total": sum(r.count for r in rows),
    }


@router.delete("/appels-tc/{appel_id}")
def delete_appel(
    appel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer un appel TC (admin ou auteur uniquement)."""
    role = (current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)).upper()
    appel = db.query(AppelTC).filter(AppelTC.id == appel_id).first()
    if not appel:
        raise HTTPException(404, "Appel non trouvé")
    if role not in ("ADMIN", "RC") and appel.tc_user_id != current_user.id:
        raise HTTPException(403, "Non autorisé")
    db.delete(appel)
    db.commit()
    return {"success": True}
