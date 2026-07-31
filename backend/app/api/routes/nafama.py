"""
Routes API NAFAMA — Dashboard mensuel et hebdomadaire.
Prefix: /api/nafama
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import nafama_service
from typing import Optional
import pandas as pd
import io
from datetime import date

router = APIRouter()


# ─────────────────────────────────────────────────────────────
# METADATA
# ─────────────────────────────────────────────────────────────

@router.get("/nafama/periods")
def get_periods(db: Session = Depends(get_db)):
    """Retourne les mois et semaines disponibles dans la base NAFAMA."""
    return nafama_service.get_available_periods(db)


# ─────────────────────────────────────────────────────────────
# MENSUEL
# ─────────────────────────────────────────────────────────────

@router.get("/nafama/monthly/overview")
def monthly_overview(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
):
    """Vue d'ensemble enrichie : KPIs + CA par superviseur/zone/gestionnaire + classement."""
    return nafama_service.get_monthly_overview(db, annee, mois)


@router.get("/nafama/monthly/summary")
def monthly_summary(
    annee: int = Query(..., description="Année"),
    mois: int = Query(..., description="Mois (1-12)"),
    db: Session = Depends(get_db),
):
    """KPIs principaux du mois : CA total, nb PDVs actifs, évolution vs mois précédent."""
    return nafama_service.get_monthly_summary(db, annee, mois)


@router.get("/nafama/monthly/top")
def monthly_top(
    annee: int = Query(...),
    mois: int = Query(...),
    limit: int = Query(20, ge=5, le=200),
    db: Session = Depends(get_db),
):
    """Top PDVs du mois par CA — enrichi avec infos PDV et évolution."""
    return nafama_service.get_monthly_top_pdv(db, annee, mois, limit)


@router.get("/nafama/pdv/{numero_pdv}/monthly-history")
def pdv_monthly_history(numero_pdv: str, db: Session = Depends(get_db)):
    """Historique mensuel d'un PDV NAFAMA (courbe d'évolution)."""
    return nafama_service.get_pdv_monthly_history(db, numero_pdv)


@router.get("/nafama/pdv/{numero_pdv}/weekly-history")
def pdv_weekly_history(numero_pdv: str, db: Session = Depends(get_db)):
    """Historique hebdomadaire d'un PDV NAFAMA (courbe d'évolution)."""
    return nafama_service.get_pdv_weekly_history(db, numero_pdv)


@router.get("/nafama/monthly/pareto")
def monthly_pareto(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
):
    """Analyse Pareto mensuelle."""
    return nafama_service.get_monthly_pareto(db, annee, mois)


@router.get("/nafama/monthly/evolution")
def monthly_evolution(
    annee: int = Query(...),
    db: Session = Depends(get_db),
):
    """Évolution CA mois par mois sur l'année."""
    return nafama_service.get_monthly_evolution(db, annee)


@router.get("/nafama/monthly/evolution-detail")
def monthly_evolution_detail(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
):
    """Évolution détaillée mensuelle : CA actuel vs M-1 par PDV/superviseur/gestionnaire."""
    return nafama_service.get_monthly_evolution_detail(db, annee, mois)


@router.get("/nafama/monthly/inactive")
def monthly_inactive(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
):
    """PDVs inactifs ce mois (actifs le mois précédent)."""
    return nafama_service.get_monthly_inactive_pdv(db, annee, mois)


@router.get("/nafama/monthly/declining")
def monthly_declining(
    annee: int = Query(...),
    mois: int = Query(...),
    seuil: float = Query(-20.0, description="Seuil de baisse en % (ex: -20)"),
    db: Session = Depends(get_db),
):
    """PDVs en baisse significative vs mois précédent."""
    return nafama_service.get_monthly_declining_pdv(db, annee, mois, seuil)


# ─────────────────────────────────────────────────────────────
# HEBDOMADAIRE
# ─────────────────────────────────────────────────────────────

@router.get("/nafama/weekly/overview")
def weekly_overview(
    annee: int = Query(...),
    semaine: int = Query(...),
    db: Session = Depends(get_db),
):
    """Vue d'ensemble hebdo enrichie : KPIs + zones + superviseurs + classement."""
    return nafama_service.get_weekly_overview(db, annee, semaine)


@router.get("/nafama/weekly/summary")
def weekly_summary(
    annee: int = Query(...),
    semaine: int = Query(..., description="Numéro de semaine ISO (ex: 14)"),
    db: Session = Depends(get_db),
):
    """KPIs principaux de la semaine."""
    return nafama_service.get_weekly_summary(db, annee, semaine)


@router.get("/nafama/weekly/top")
def weekly_top(
    annee: int = Query(...),
    semaine: int = Query(...),
    limit: int = Query(20, ge=5, le=200),
    db: Session = Depends(get_db),
):
    """Top PDVs de la semaine par CA — enrichi avec infos PDV et évolution."""
    return nafama_service.get_weekly_top_pdv(db, annee, semaine, limit)


@router.get("/nafama/weekly/pareto")
def weekly_pareto(
    annee: int = Query(...),
    semaine: int = Query(...),
    db: Session = Depends(get_db),
):
    """Pareto hebdomadaire."""
    return nafama_service.get_weekly_pareto(db, annee, semaine)


@router.get("/nafama/weekly/evolution")
def weekly_evolution(
    annee: int = Query(...),
    db: Session = Depends(get_db),
):
    """Évolution CA semaine par semaine."""
    return nafama_service.get_weekly_evolution(db, annee)


@router.get("/nafama/weekly/evolution-detail")
def weekly_evolution_detail(
    annee: int = Query(...),
    semaine: int = Query(...),
    db: Session = Depends(get_db),
):
    """Évolution détaillée hebdomadaire : CA actuel vs S-1 par PDV/superviseur/gestionnaire."""
    return nafama_service.get_weekly_evolution_detail(db, annee, semaine)


@router.get("/nafama/weekly/inactive")
def weekly_inactive(
    annee: int = Query(...),
    semaine: int = Query(...),
    db: Session = Depends(get_db),
):
    """PDVs inactifs cette semaine."""
    return nafama_service.get_weekly_inactive_pdv(db, annee, semaine)


@router.get("/nafama/weekly/declining")
def weekly_declining(
    annee: int = Query(...),
    semaine: int = Query(...),
    seuil: float = Query(-20.0),
    db: Session = Depends(get_db),
):
    """PDVs en baisse vs semaine précédente."""
    return nafama_service.get_weekly_declining_pdv(db, annee, semaine, seuil)


# ─────────────────────────────────────────────────────────────
# IMPORT
# ─────────────────────────────────────────────────────────────

@router.post("/nafama/import")
async def import_nafama(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Importe un fichier Excel NAFAMA (colonnes: PDV, MONTANT SOMME, Date).
    Déduplique les lignes existantes avant insertion.
    """
    from app.models.nafama import NafamaTransaction

    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(400, "Format non supporté. Utilisez .xlsx, .xls ou .csv")

    contents = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Erreur lecture fichier: {str(e)}")

    # Normaliser colonnes
    df.columns = [c.strip().upper() for c in df.columns]
    required = {"PDV", "MONTANT SOMME", "DATE"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(400, f"Colonnes manquantes: {missing}")

    df = df.rename(columns={"MONTANT SOMME": "MONTANT"})
    df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")
    df = df.dropna(subset=["DATE", "PDV", "MONTANT"])
    df["PDV"] = df["PDV"].astype(str).str.strip()
    df["MONTANT"] = pd.to_numeric(df["MONTANT"], errors="coerce").fillna(0).astype(int)
    df["ANNEE"] = df["DATE"].dt.year
    df["MOIS"] = df["DATE"].dt.month
    df["SEMAINE"] = df["DATE"].dt.isocalendar().week.astype(int)

    # Supprimer et réimporter (upsert simple)
    db.query(NafamaTransaction).delete()
    db.commit()

    inserted = 0
    for _, row in df.iterrows():
        t = NafamaTransaction(
            numero_pdv=str(row["PDV"]),
            montant=int(row["MONTANT"]),
            date_transaction=row["DATE"].date(),
            annee=int(row["ANNEE"]),
            mois=int(row["MOIS"]),
            semaine=int(row["SEMAINE"]),
        )
        db.add(t)
        inserted += 1

    db.commit()
    return {"success": True, "inserted": inserted, "total_rows": len(df)}
