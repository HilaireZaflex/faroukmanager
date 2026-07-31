"""
Routes API Vente Energia — Prospection kits solaires DIABARANI / YELEN
Prefix: /api/energia
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.prospect_energia import ProspectEnergia, NomKitEnergia
from app.models.user import User
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
import random
import string

router = APIRouter()


def _generate_ref() -> str:
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"ENRG-{suffix}"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class EnergiaCreate(BaseModel):
    nom_kit: NomKitEnergia
    pret_payer_immediatement: bool = False
    date_prospection: Optional[date] = None
    nom: str
    prenom: str
    telephone: str
    quartier: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    piece_identite: Optional[str] = None
    notes: Optional[str] = None


class EnergiaUpdate(BaseModel):
    nom_kit: Optional[NomKitEnergia] = None
    pret_payer_immediatement: Optional[bool] = None
    date_prospection: Optional[date] = None
    nom: Optional[str] = None
    prenom: Optional[str] = None
    telephone: Optional[str] = None
    quartier: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    piece_identite: Optional[str] = None
    notes: Optional[str] = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/energia/prospects")
def create_energia_prospect(
    body: EnergiaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Créer un nouveau prospect Vente Energia."""
    # Générer une référence unique
    ref = _generate_ref()
    while db.query(ProspectEnergia).filter(ProspectEnergia.reference == ref).first():
        ref = _generate_ref()

    p = ProspectEnergia(
        reference=ref,
        nom_kit=body.nom_kit,
        pret_payer_immediatement=body.pret_payer_immediatement,
        date_prospection=body.date_prospection,
        nom=body.nom,
        prenom=body.prenom,
        telephone=body.telephone,
        quartier=body.quartier,
        latitude=body.latitude,
        longitude=body.longitude,
        piece_identite=body.piece_identite,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _fmt(p)


@router.get("/energia/prospects")
def list_energia_prospects(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    nom_kit: Optional[str] = None,
    pret_payer: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lister les prospects Energia avec filtres."""
    q = db.query(ProspectEnergia)
    if nom_kit:
        q = q.filter(ProspectEnergia.nom_kit == nom_kit)
    if pret_payer is not None:
        q = q.filter(ProspectEnergia.pret_payer_immediatement == pret_payer)
    if search:
        s = f"%{search}%"
        q = q.filter(
            ProspectEnergia.nom.ilike(s) |
            ProspectEnergia.prenom.ilike(s) |
            ProspectEnergia.telephone.ilike(s) |
            ProspectEnergia.reference.ilike(s)
        )
    total = q.count()
    items = q.order_by(ProspectEnergia.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_fmt(p) for p in items]}


@router.get("/energia/prospects/{prospect_id}")
def get_energia_prospect(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Détail d'un prospect Energia."""
    p = db.query(ProspectEnergia).filter(ProspectEnergia.id == prospect_id).first()
    if not p:
        raise HTTPException(404, "Prospect Energia non trouvé")
    return _fmt(p)


@router.patch("/energia/prospects/{prospect_id}")
def update_energia_prospect(
    prospect_id: int,
    body: EnergiaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mettre à jour un prospect Energia."""
    p = db.query(ProspectEnergia).filter(ProspectEnergia.id == prospect_id).first()
    if not p:
        raise HTTPException(404, "Prospect Energia non trouvé")
    for field, value in body.dict(exclude_unset=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return _fmt(p)


@router.delete("/energia/prospects/{prospect_id}")
def delete_energia_prospect(
    prospect_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer un prospect Energia."""
    p = db.query(ProspectEnergia).filter(ProspectEnergia.id == prospect_id).first()
    if not p:
        raise HTTPException(404, "Prospect Energia non trouvé")
    db.delete(p)
    db.commit()
    return {"success": True}


@router.get("/energia/stats")
def get_energia_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statistiques globales Vente Energia."""
    total = db.query(func.count(ProspectEnergia.id)).scalar()
    diabarani = db.query(func.count(ProspectEnergia.id)).filter(ProspectEnergia.nom_kit == NomKitEnergia.DIABARANI).scalar()
    yelen = db.query(func.count(ProspectEnergia.id)).filter(ProspectEnergia.nom_kit == NomKitEnergia.YELEN).scalar()
    prets = db.query(func.count(ProspectEnergia.id)).filter(ProspectEnergia.pret_payer_immediatement == True).scalar()
    return {
        "total": total,
        "diabarani": diabarani,
        "yelen": yelen,
        "prets_payer": prets,
        "taux_pret": round(prets / total * 100, 1) if total else 0,
    }


# ─── Formatter ────────────────────────────────────────────────────────────────

def _fmt(p: ProspectEnergia) -> dict:
    return {
        "id": p.id,
        "reference": p.reference,
        "nom_kit": p.nom_kit.value if p.nom_kit else None,
        "pret_payer_immediatement": p.pret_payer_immediatement,
        "date_prospection": p.date_prospection.isoformat() if p.date_prospection else None,
        "nom": p.nom,
        "prenom": p.prenom,
        "telephone": p.telephone,
        "quartier": p.quartier,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "piece_identite": p.piece_identite,
        "notes": p.notes,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
