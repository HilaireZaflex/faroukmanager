"""
Routes API — Référentiel géographique (Zones / Sous-zones / Quartiers)

- GET    /api/localites              → liste (toutes catégories ou ?type=)
- POST   /api/localites              → ajouter une entrée
- PUT    /api/localites/{id}         → renommer (répercuté sur les PDV)
- POST   /api/localites/fusionner    → fusionner plusieurs entrées en une seule (répercuté sur les PDV)
- DELETE /api/localites/{id}         → supprimer (refusé si des PDV l'utilisent)

Les écritures sont réservées à l'encadrement (admin, manager, RC, conformité,
Responsable Produit & Qualité Opérationnelle) : c'est ce référentiel qui alimente
les filtres du menu Point de vente.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.localite import Localite
from app.models.pdv import PDV

router = APIRouter()

TYPES_VALIDES = {"ZONE", "SOUS_ZONE", "QUARTIER"}
COLONNES_PDV = {"ZONE": "zone", "SOUS_ZONE": "sous_zone", "QUARTIER": "quartier"}

# Rôles autorisés à modifier le référentiel géographique
ROLES_ECRITURE = {
    "admin",
    "manager",
    "rc",
    "conformite",
    "responsable_produit_et_qualit_oprationnelle_",
}


def _type_normalise(t: str) -> str:
    t = (t or "").strip().upper().replace("-", "_").replace(" ", "_")
    if t not in TYPES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Type invalide. Valides : {sorted(TYPES_VALIDES)}")
    return t


def _verifier_ecriture(user: User):
    """Le référentiel alimente les filtres du Point de vente : écriture réservée à l'encadrement."""
    role = str(user.role).lower().replace("userrole.", "")
    if role not in ROLES_ECRITURE:
        raise HTTPException(
            status_code=403,
            detail="Seul l'encadrement peut modifier le référentiel Zones / Sous-zones / Quartiers.",
        )


def _fmt(l: Localite) -> dict:
    return {"id": l.id, "type": l.type, "nom": l.nom}


def _colonne_normalisee(colonne: str):
    """Expression SQL comparant une colonne PDV sans tenir compte des espaces ni de la casse."""
    return func.lower(func.trim(colonne))


def _mettre_a_jour_pdvs(db: Session, type_localite: str, anciens_noms, nouveau_nom: str) -> int:
    """Rattache au nouveau nom tous les PDV dont la valeur correspond (espaces/casse ignorés)."""
    cles = {
        str(n or "").strip().lower()
        for n in anciens_noms
        if str(n or "").strip()
    }
    if not cles:
        return 0
    colonne = getattr(PDV, COLONNES_PDV[type_localite])
    return db.query(PDV).filter(_colonne_normalisee(colonne).in_(list(cles))).update(
        {colonne: nouveau_nom}, synchronize_session=False
    )


class LocaliteIn(BaseModel):
    type: str
    nom: str


class LocaliteUpdate(BaseModel):
    nom: str


class FusionIn(BaseModel):
    type: str
    ids: List[int]
    nom_final: str


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
    _verifier_ecriture(current_user)
    t = _type_normalise(body.type)
    nom = (body.nom or "").strip()
    if not nom:
        raise HTTPException(status_code=400, detail="Le nom est obligatoire")
    existant = db.query(Localite).filter(
        Localite.type == t, func.lower(func.trim(Localite.nom)) == nom.lower()
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
    _verifier_ecriture(current_user)
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
        func.lower(func.trim(Localite.nom)) == nom.lower(),
        Localite.id != row.id,
    ).first()
    if doublon:
        raise HTTPException(
            status_code=400,
            detail=f"« {nom} » existe déjà dans cette catégorie. Utilisez plutôt la fusion.",
        )

    ancien = row.nom
    nb = _mettre_a_jour_pdvs(db, row.type, [ancien], nom)
    row.nom = nom
    db.commit()
    db.refresh(row)
    return {"success": True, "action": "renomme", "data": _fmt(row), "pdvs_mis_a_jour": nb}


@router.post("/localites/fusionner")
def fusionner_localites(
    body: FusionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fusionne plusieurs entrées du même type en une seule.

    Cas d'usage : plusieurs écritures du même quartier (« Badalabougou »,
    « badalabougou », « Badalabougou  ») qui désignent en réalité le même lieu.

    Tous les PDV rattachés à l'une des entrées sélectionnées sont basculés sur le
    nom final, puis les entrées en trop sont supprimées du référentiel.
    """
    _verifier_ecriture(current_user)

    t = _type_normalise(body.type)
    ids = []
    for i in (body.ids or []):
        try:
            ids.append(int(i))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Identifiants invalides")
    ids = sorted(set(ids))
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins deux entrées à fusionner.")

    rows = db.query(Localite).filter(Localite.id.in_(ids)).all()
    if len(rows) < 2:
        raise HTTPException(status_code=404, detail="Entrées introuvables")
    if any(r.type != t for r in rows):
        raise HTTPException(status_code=400, detail="Toutes les entrées sélectionnées doivent être du même type.")

    nom_final = (body.nom_final or "").strip()
    if not nom_final:
        raise HTTPException(status_code=400, detail="Indiquez le nom à conserver.")

    # 1. Tous les PDV des entrées sélectionnées sont rattachés au nom final
    nb_pdvs = _mettre_a_jour_pdvs(db, t, [r.nom for r in rows], nom_final)

    # 2. L'entrée cible : celle qui porte déjà le nom final, sinon une existante, sinon une nouvelle
    cible = next(
        (r for r in rows if (r.nom or "").strip().lower() == nom_final.lower()),
        None,
    )
    if cible is None:
        cible = db.query(Localite).filter(
            Localite.type == t, func.lower(func.trim(Localite.nom)) == nom_final.lower()
        ).first()
    nouvelle = False
    if cible is None:
        cible = Localite(type=t, nom=nom_final)
        db.add(cible)
        nouvelle = True

    # 3. IMPORTANT — supprimer les entrées en trop AVANT de renommer la cible.
    #    La table porte une contrainte UNIQUE (type, nom) : renommer d'abord la cible
    #    avec un nom encore porté par une autre ligne sélectionnée provoque une erreur.
    supprimes = 0
    for r in rows:
        if not nouvelle and r.id == cible.id:
            continue
        db.delete(r)
        supprimes += 1
    db.flush()

    # 4. Le renommage se fait maintenant sans aucun risque de collision
    if not nouvelle:
        cible.nom = nom_final

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"« {nom_final} » existe déjà dans cette catégorie.",
        )

    return {
        "success": True,
        "action": "fusion",
        "nom_final": nom_final,
        "type": t,
        "entrees_fusionnees": len(rows),
        "entrees_supprimees": supprimes,
        "pdvs_mis_a_jour": nb_pdvs,
    }


@router.delete("/localites/{localite_id}")
def delete_localite(
    localite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer une entrée. Refusé si des PDV l'utilisent encore (sécurité anti-perte)."""
    _verifier_ecriture(current_user)
    row = db.query(Localite).filter(Localite.id == localite_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    colonne = getattr(PDV, COLONNES_PDV[row.type])
    nb = db.query(PDV).filter(
        _colonne_normalisee(colonne) == (row.nom or "").strip().lower()
    ).count()
    if nb > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible : {nb} PDV utilisent encore « {row.nom} ». Renommez-les ou réaffectez-les d'abord.",
        )
    db.delete(row)
    db.commit()
    return {"success": True, "id": localite_id}
