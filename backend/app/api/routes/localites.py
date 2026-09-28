"""
Routes API — Référentiel géographique (Zones / Sous-zones / Quartiers)

- GET    /api/localites            → liste (toutes catégories ou ?type=)
- POST   /api/localites            → ajouter une entrée
- PUT    /api/localites/{id}       → renommer (répercuté sur les PDV)
- DELETE /api/localites/{id}       → supprimer (refusé si des PDV l'utilisent)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.localite import Localite
from app.models.pdv import PDV

router = APIRouter()

TYPES_VALIDES = {"ZONE", "SOUS_ZONE", "QUARTIER"}
COLONNES_PDV = {"ZONE": "zone", "SOUS_ZONE": "sous_zone", "QUARTIER": "quartier"}


def _type_normalise(t: str) -> str:
    t = (t or "").strip().upper().replace("-", "_").replace(" ", "_")
    if t not in TYPES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Type invalide. Valides : {sorted(TYPES_VALIDES)}")
    return t


def _fmt(l: Localite) -> dict:
    return {"id": l.id, "type": l.type, "nom": l.nom}


class LocaliteIn(BaseModel):
    type: str
    nom: str


class LocaliteUpdate(BaseModel):
    nom: str


@router.get("/localites")
def list_localites(
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste du référentiel géographique (toutes catégories, ou filtrée par type)."""
    q = db.query(Localite)
    if type:
        q = q.filter(Localite.type == _type_normalise(type))
    rows = q.order_by(Localite.type, Localite.nom).all()
    return [_fmt(r) for r in rows]


@router.post("/localites")
def create_localite(
    body: LocaliteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ajouter une zone / sous-zone / quartier au référentiel."""
    t = _type_normalise(body.type)
    nom = (body.nom or "").strip()
    if not nom:
        raise HTTPException(status_code=400, detail="Le nom est obligatoire")
    existant = db.query(Localite).filter(
        Localite.type == t, func.lower(Localite.nom) == nom.lower()
    ).first()
    if existant:
        return {"success": True, "action": "existe_deja", "data": _fmt(existant)}
    row = Localite(type=t, nom=nom)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"success": True, "action": "cree", "data": _fmt(row)}


@router.put("/localites/{localite_id}")
def update_localite(
    localite_id: int,
    body: LocaliteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Renommer une entrée — le changement est répercuté sur tous les PDV concernés."""
    row = db.query(Localite).filter(Localite.id == localite_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    nom = (body.nom or "").strip()
    if not nom:
        raise HTTPException(status_code=400, detail="Le nom est obligatoire")
    if nom == row.nom:
        return {"success": True, "action": "inchange", "data": _fmt(row), "pdvs_mis_a_jour": 0}

    doublon = db.query(Localite).filter(
        Localite.type == row.type,
        func.lower(Localite.nom) == nom.lower(),
        Localite.id != row.id,
    ).first()
    if doublon:
        raise HTTPException(status_code=400, detail=f"« {nom} » existe déjà dans cette catégorie")

    ancien = row.nom
    colonne = COLONNES_PDV[row.type]
    nb = db.query(PDV).filter(getattr(PDV, colonne) == ancien).update(
        {colonne: nom}, synchronize_session=False
    )
    row.nom = nom
    db.commit()
    db.refresh(row)
    return {"success": True, "action": "renomme", "data": _fmt(row), "pdvs_mis_a_jour": nb}


@router.delete("/localites/{localite_id}")
def delete_localite(
    localite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer une entrée. Refusé si des PDV l'utilisent encore (sécurité anti-perte)."""
    row = db.query(Localite).filter(Localite.id == localite_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    colonne = COLONNES_PDV[row.type]
    nb = db.query(PDV).filter(getattr(PDV, colonne) == row.nom).count()
    if nb > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible : {nb} PDV utilisent encore « {row.nom} ». Renommez-les ou réaffectez-les d'abord.",
        )
    db.delete(row)
    db.commit()
    return {"success": True, "id": localite_id}
