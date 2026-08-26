"""
Routes API Indicateurs Orange Award 2026
Prefix: /api/award
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.indicateur_award import IndicateurAward
from app.models.user import User
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import io

router = APIRouter()

INDICATEURS = ["OMY", "KAABU MOBILE", "NAFAMA", "TERMINAUX", "ORANGE ENERGIE", "PDV_ACTIF", "PDV_CA1000", "FINTECH"]
MOIS_ORDRE = ["JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE"]


# ─── Schemas ──────────────────────────────────────────────────────────────────
class IndicateurUpsert(BaseModel):
    indicateur: str
    mois: str
    semaine: str
    est_total: bool = False
    objectif_orange: Optional[float] = None
    realisation: Optional[float] = None
    taux_orange: Optional[float] = None
    objectif_farouk: Optional[float] = None
    taux_farouk: Optional[float] = None
    nombre_pdv: Optional[int] = None


# ─── Helper ───────────────────────────────────────────────────────────────────
def _fmt(r: IndicateurAward) -> dict:
    return {
        "id": r.id,
        "indicateur": r.indicateur,
        "mois": r.mois,
        "semaine": r.semaine,
        "est_total": r.est_total,
        "objectif_orange": r.objectif_orange,
        "realisation": r.realisation,
        "taux_orange": r.taux_orange,
        "objectif_farouk": r.objectif_farouk,
        "taux_farouk": r.taux_farouk,
        "nombre_pdv": r.nombre_pdv,
    }


def _taux_color(taux):
    if taux is None: return "grey"
    if taux >= 0.95: return "green"
    if taux >= 0.80: return "orange"
    return "red"


# ─── GET /award/dashboard ─────────────────────────────────────────────────────
@router.get("/award/dashboard")
def get_award_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Vue globale de tous les indicateurs — dernier mois disponible + totaux."""
    result = {}
    for ind in INDICATEURS:
        # Récupérer tous les TOTAL disponibles
        totaux = db.query(IndicateurAward).filter(
            IndicateurAward.indicateur == ind,
            IndicateurAward.est_total == True
        ).all()

        # Données semaine par semaine (non total)
        semaines = db.query(IndicateurAward).filter(
            IndicateurAward.indicateur == ind,
            IndicateurAward.est_total == False
        ).all()
        # Trier selon l'ordre chronologique des mois du challenge
        def sem_sort_key(s):
            mois_idx = MOIS_ORDRE.index(s.mois) if s.mois in MOIS_ORDRE else 99
            sem_num = int(s.semaine.replace('S','')) if s.semaine and s.semaine.startswith('S') else 99
            return (mois_idx, sem_num)
        semaines_sorted = sorted(semaines, key=sem_sort_key)

        # Trier les totaux aussi dans l'ordre chronologique
        def total_sort_key(t):
            return MOIS_ORDRE.index(t.mois) if t.mois in MOIS_ORDRE else 99
        totaux_sorted = sorted(totaux, key=total_sort_key)

        result[ind] = {
            "totaux": [_fmt(t) for t in totaux_sorted],
            "semaines": [_fmt(s) for s in semaines_sorted],
        }

    return result


# ─── GET /award/indicateur/{nom} ──────────────────────────────────────────────
@router.get("/award/indicateur/{nom}")
def get_indicateur_detail(
    nom: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Détail complet d'un indicateur — toutes semaines et tous mois."""
    if nom not in INDICATEURS:
        raise HTTPException(404, f"Indicateur inconnu. Valides: {INDICATEURS}")

    rows = db.query(IndicateurAward).filter(
        IndicateurAward.indicateur == nom
    ).order_by(IndicateurAward.mois, IndicateurAward.semaine).all()

    # Grouper par mois
    grouped = {}
    for r in rows:
        if r.mois not in grouped:
            grouped[r.mois] = {"mois": r.mois, "semaines": [], "total": None}
        if r.est_total:
            grouped[r.mois]["total"] = _fmt(r)
        else:
            grouped[r.mois]["semaines"].append(_fmt(r))

    return {
        "indicateur": nom,
        "mois": [grouped[m] for m in MOIS_ORDRE if m in grouped],
    }


# ─── POST /award/upsert ───────────────────────────────────────────────────────
@router.post("/award/upsert")
def upsert_indicateur(
    body: IndicateurUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Créer ou mettre à jour une ligne indicateur (saisie manuelle)."""
    if body.indicateur not in INDICATEURS:
        raise HTTPException(400, f"Indicateur inconnu. Valides: {INDICATEURS}")

    existing = db.query(IndicateurAward).filter(
        IndicateurAward.indicateur == body.indicateur,
        IndicateurAward.mois == body.mois,
        IndicateurAward.semaine == body.semaine,
    ).first()

    if existing:
        for field, value in body.dict(exclude_unset=True).items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return {"action": "updated", "data": _fmt(existing)}
    else:
        row = IndicateurAward(**body.dict())
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"action": "created", "data": _fmt(row)}


# ─── POST /award/import ───────────────────────────────────────────────────────
@router.post("/award/import")
async def import_award_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Importe le fichier Excel Suivi_Indicateur challenge.xlsx
    Chaque feuille = un indicateur (OMY, KAABU MOBILE, NAFAMA, TERMINAUX, ORANGE ENERGIE)
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "Format non supporté. Utilisez .xlsx")

    contents = await file.read()
    try:
        xl = pd.ExcelFile(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Erreur lecture fichier: {str(e)}")

    total_inserted = 0
    total_updated = 0

    for sheet in xl.sheet_names:
        if sheet not in INDICATEURS:
            continue

        df = pd.read_excel(io.BytesIO(contents), sheet_name=sheet, header=0)
        df.columns = [str(c).strip().upper() for c in df.columns]

        # Remplir les NaN du champ MOIS (merged cells → ffill)
        if 'MOIS' in df.columns:
            df['MOIS'] = df['MOIS'].ffill()
        else:
            df.rename(columns={df.columns[0]: 'MOIS'}, inplace=True)
            df['MOIS'] = df['MOIS'].ffill()

        if 'SEMAINE' not in df.columns:
            df.rename(columns={df.columns[1]: 'SEMAINE'}, inplace=True)

        for _, row in df.iterrows():
            mois = str(row.get('MOIS', '')).strip().upper()
            semaine = str(row.get('SEMAINE', '')).strip().upper()

            if not mois or not semaine or mois == 'NAN' or semaine == 'NAN':
                continue
            if mois not in [m.upper() for m in MOIS_ORDRE]:
                continue

            est_total = semaine == 'TOTAL'

            def safe_float(val):
                try:
                    v = float(val)
                    return None if pd.isna(v) else v
                except (TypeError, ValueError):
                    return None

            obj_orange = safe_float(row.get('OBJECTIF ORANGE') or row.get('OBJECTIF ORANGE '))
            realisation = safe_float(row.get('REALISATION'))
            taux_orange = safe_float(row.get('TAUX REAL ORANGE') or row.get('TAUX REAL '))
            obj_farouk = safe_float(row.get('OBJECTIF FAROUK'))
            taux_farouk = safe_float(row.get('TAUX REAL FAROUK'))
            nb_pdv = None
            if 'NOMBRE PDV' in df.columns:
                try:
                    nb_pdv_val = row.get('NOMBRE PDV')
                    nb_pdv = int(nb_pdv_val) if not pd.isna(nb_pdv_val) else None
                except (TypeError, ValueError):
                    nb_pdv = None

            existing = db.query(IndicateurAward).filter(
                IndicateurAward.indicateur == sheet,
                IndicateurAward.mois == mois,
                IndicateurAward.semaine == semaine,
            ).first()

            if existing:
                existing.objectif_orange = obj_orange
                existing.realisation = realisation
                existing.taux_orange = taux_orange
                existing.objectif_farouk = obj_farouk
                existing.taux_farouk = taux_farouk
                existing.nombre_pdv = nb_pdv
                existing.est_total = est_total
                total_updated += 1
            else:
                db.add(IndicateurAward(
                    indicateur=sheet, mois=mois, semaine=semaine, est_total=est_total,
                    objectif_orange=obj_orange, realisation=realisation,
                    taux_orange=taux_orange, objectif_farouk=obj_farouk,
                    taux_farouk=taux_farouk, nombre_pdv=nb_pdv,
                ))
                total_inserted += 1

    db.commit()
    return {
        "success": True,
        "inserted": total_inserted,
        "updated": total_updated,
        "total": total_inserted + total_updated,
        "indicateurs": [s for s in xl.sheet_names if s in INDICATEURS],
    }
