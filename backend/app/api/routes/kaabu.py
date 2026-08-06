"""
Routes API KAABU Mobile
Prefix: /api/kaabu
"""
from fastapi import APIRouter, Depends, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.services import kaabu_service
from typing import Optional
import tempfile, os

router = APIRouter()


@router.get("/kaabu/periods")
def get_periods(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_available_periods(db)


@router.get("/kaabu/vue-ensemble")
def vue_ensemble(annee: int = Query(...), semaine: str = Query(...),
                 db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_vue_ensemble(db, annee, semaine)


@router.get("/kaabu/superviseurs")
def par_superviseur(annee: int = Query(...), semaine: str = Query(...),
                    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_superviseur(db, annee, semaine)


@router.get("/kaabu/gestionnaires")
def par_gestionnaire(annee: int = Query(...), semaine: str = Query(...),
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_gestionnaire(db, annee, semaine)


@router.get("/kaabu/coaches")
def par_coach(annee: int = Query(...), semaine: str = Query(...),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_coach(db, annee, semaine)


@router.get("/kaabu/teleconseilleres")
def par_teleconseillere(annee: int = Query(...), semaine: str = Query(...),
                        db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_teleconseillere(db, annee, semaine)


@router.get("/kaabu/developpeurs")
def par_developpeur(annee: int = Query(...), semaine: str = Query(...),
                    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_developpeur(db, annee, semaine)


@router.get("/kaabu/hors-zone")
def hors_zone(annee: int = Query(...), semaine: str = Query(...),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_hors_zone(db, annee, semaine)


@router.get("/kaabu/inactifs")
def inactifs(annee: int = Query(...), semaine: str = Query(...),
             teleconseillere: Optional[str] = Query(None),
             db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_inactifs(db, annee, semaine, teleconseillere)


@router.get("/kaabu/en-baisse")
def en_baisse(annee: int = Query(...), semaine: str = Query(...),
              seuil: float = Query(-20.0),
              teleconseillere: Optional[str] = Query(None),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_en_baisse(db, annee, semaine, seuil, teleconseillere)


@router.get("/kaabu/evolution")
def evolution(annee: int = Query(...),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_evolution(db, annee)


@router.post("/kaabu/import")
async def import_kaabu(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Importer le fichier Excel KAABU (feuille SOURCE)."""
    if not file.filename.endswith(('.xlsx', '.xls')):
        from fastapi import HTTPException
        raise HTTPException(400, "Format non supporté. Utilisez .xlsx")

    contents = await file.read()
    # Sauvegarder temporairement
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = kaabu_service.import_excel(db, tmp_path)
        return {"success": True, **result}
    finally:
        os.unlink(tmp_path)
