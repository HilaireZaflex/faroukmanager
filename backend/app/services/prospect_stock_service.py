"""
Service Stock de Puces.
========================
- list_stock        : inventaire avec filtres
- stats             : disponibles / réservées / activées / défectueuses
- create_lot        : ajouter un lot de N puces
- reserve           : réserver une puce pour un prospect
- mark_activated    : sortir du stock
- mark_defective / lost : marquage exceptionnel
- low_stock_alert   : déclenche notification si stock bas
"""
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.models.prospect_extras import PuceStock, PuceStockStatus

LOW_STOCK_THRESHOLD = 10


def list_stock(db: Session, status_filter: Optional[PuceStockStatus] = None,
               lot: Optional[str] = None, limit: int = 200) -> List[PuceStock]:
    q = db.query(PuceStock)
    if status_filter:
        q = q.filter(PuceStock.status == status_filter)
    if lot:
        q = q.filter(PuceStock.lot == lot)
    return q.order_by(PuceStock.received_at.desc()).limit(limit).all()


def stats(db: Session) -> Dict[str, Any]:
    by_status = dict(
        db.query(PuceStock.status, func.count(PuceStock.id)).group_by(PuceStock.status).all()
    )
    by_lot = db.query(PuceStock.lot, func.count(PuceStock.id))\
        .group_by(PuceStock.lot).all()
    total = db.query(func.count(PuceStock.id)).scalar() or 0
    disp = by_status.get(PuceStockStatus.DISPONIBLE, 0)
    return {
        "total": total,
        "disponibles": disp,
        "reservees": by_status.get(PuceStockStatus.RESERVEE, 0),
        "activees": by_status.get(PuceStockStatus.ACTIVEE, 0),
        "defectueuses": by_status.get(PuceStockStatus.DEFECTUEUSE, 0),
        "perdues": by_status.get(PuceStockStatus.PERDUE, 0),
        "low_stock": disp <= LOW_STOCK_THRESHOLD,
        "low_stock_threshold": LOW_STOCK_THRESHOLD,
        "by_lot": [{"lot": l or "(sans lot)", "count": c} for l, c in by_lot],
    }


def create_lot(db: Session, lot_code: str, numbers: List[str], user_id: Optional[int] = None) -> int:
    """Ajoute un lot de puces (numbers = liste de numéros)."""
    if not numbers:
        raise HTTPException(400, "Aucun numéro fourni")
    existing = {x.numero for x in db.query(PuceStock).filter(PuceStock.numero.in_(numbers)).all()}
    new_count = 0
    for n in numbers:
        if n in existing:
            continue
        db.add(PuceStock(
            numero=n.strip(), lot=lot_code, status=PuceStockStatus.DISPONIBLE,
            received_at=datetime.utcnow(), received_by_id=user_id,
        ))
        new_count += 1
    db.commit()
    return new_count


def reserve(db: Session, numero: str, prospect_id: int) -> PuceStock:
    p = db.query(PuceStock).filter(PuceStock.numero == numero).first()
    if not p:
        raise HTTPException(404, "Puce introuvable en stock")
    if p.status != PuceStockStatus.DISPONIBLE:
        raise HTTPException(409, f"Puce indisponible (état: {p.status.value})")
    p.status = PuceStockStatus.RESERVEE
    p.reserved_for_prospect_id = prospect_id
    p.reserved_at = datetime.utcnow()
    db.commit(); db.refresh(p)
    return p


def mark_activated(db: Session, numero: str) -> Optional[PuceStock]:
    p = db.query(PuceStock).filter(PuceStock.numero == numero).first()
    if not p:
        return None
    p.status = PuceStockStatus.ACTIVEE
    p.activated_at = datetime.utcnow()
    db.commit(); db.refresh(p)
    return p


def mark_status(db: Session, numero: str, new_status: PuceStockStatus) -> PuceStock:
    p = db.query(PuceStock).filter(PuceStock.numero == numero).first()
    if not p:
        raise HTTPException(404, "Puce introuvable")
    p.status = new_status
    db.commit(); db.refresh(p)
    return p
