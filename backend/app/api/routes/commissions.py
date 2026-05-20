"""Routes API Commissions Réseau."""
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile, Query
from fastapi.responses import StreamingResponse
from io import BytesIO
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_pdv_filters
from app.models.user import User
from app.models.commission import PDVType, ReversementStatus
from app.services import commission_service as svc

router = APIRouter(prefix="/commissions", tags=["Commissions"])


@router.get("/periods")
def periods(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.available_periods(db)


@router.get("/dashboard")
def dashboard(
    period_key: str = Query(..., description="ex: 2026-04"),
    pdv_type: Optional[PDVType] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    f = get_pdv_filters(current_user)
    return svc.dashboard(db, period_key, pdv_type,
                         superviseur=f.get('superviseur'),
                         gestionnaire=f.get('gestionnaire'),
                         zone=f.get('zone'))


@router.get("/entries")
def list_entries(
    period_key: str = Query(...),
    pdv_type: Optional[PDVType] = None,
    quartier: Optional[str] = None,
    zone: Optional[str] = None,
    reversement_status: Optional[ReversementStatus] = None,
    gere_reversement: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = 0, limit: int = 200,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    f = get_pdv_filters(current_user)
    return svc.list_entries(db, period_key, pdv_type, quartier,
                            zone or f.get('zone'),
                            reversement_status, search, gere_reversement, skip, limit,
                            superviseur=f.get('superviseur'),
                            gestionnaire=f.get('gestionnaire'))


@router.get("/evolution")
def evolution(
    n_periods: int = 6,
    pdv_type: Optional[PDVType] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    f = get_pdv_filters(current_user)
    return svc.evolution(db, n_periods, pdv_type,
                         superviseur=f.get('superviseur'),
                         gestionnaire=f.get('gestionnaire'),
                         zone=f.get('zone'))


@router.get("/top-pdvs")
def top_pdvs(
    period_key: str = Query(...),
    n: int = 20,
    pdv_type: Optional[PDVType] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    f = get_pdv_filters(current_user)
    return svc.top_pdvs(db, period_key, n, pdv_type,
                        superviseur=f.get('superviseur'),
                        gestionnaire=f.get('gestionnaire'),
                        zone=f.get('zone'))


@router.post("/import")
def import_xlsx(
    period_key: str = Form(..., description="ex: 2026-04"),
    period_type: str = Form("MONTHLY"),
    col_numero: str = Form("numero_pdv"),
    col_nom: str = Form("pdv_nom"),
    col_type: str = Form("pdv_type"),
    col_brut: str = Form("montant_brut"),
    col_quartier: str = Form("quartier"),
    col_zone: str = Form("zone"),
    col_gestionnaire: str = Form("gestionnaire"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = file.file.read()
    col_mapping = {
        "numero_pdv": col_numero, "pdv_nom": col_nom,
        "pdv_type": col_type, "montant_brut": col_brut,
        "quartier": col_quartier, "zone": col_zone,
        "gestionnaire": col_gestionnaire,
    }
    return svc.import_xlsx(db, content, file.filename or "import.xlsx",
                           period_key, period_type, col_mapping, current_user.id)


@router.get("/export.xlsx")
def export(
    period_key: str = Query(...),
    pdv_type: Optional[PDVType] = None,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    content = svc.export_xlsx(db, period_key, pdv_type)
    fname = f"commissions_{period_key}.xlsx"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
