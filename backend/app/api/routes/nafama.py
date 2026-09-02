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


@router.get("/nafama/monthly/progression")
def monthly_progression(
    annee: int = Query(...),
    db: Session = Depends(get_db),
):
    """Historique mensuel complet de tous les PDVs NAFAMA pour l'année."""
    return nafama_service.get_monthly_progression(db, annee)


@router.get("/nafama/weekly/progression")
def weekly_progression(
    annee: int = Query(...),
    db: Session = Depends(get_db),
):
    """Historique hebdomadaire complet de tous les PDVs NAFAMA pour l'année."""
    return nafama_service.get_weekly_progression(db, annee)


@router.get("/nafama/monthly/comparaison")
def monthly_comparaison(
    mois_ref: int = Query(..., description="Mois de référence (1-12)"),
    annee_ref: int = Query(...),
    mois_list: str = Query(..., description="Mois à comparer, ex: '2026-07,2026-08,2026-09'"),
    db: Session = Depends(get_db),
):
    """Comparaison multi-mois des PDVs NAFAMA avec alertes et plan d'action."""
    from app.models.nafama import NafamaTransaction
    from app.models.pdv import PDV
    from sqlalchemy import func

    # Parser les mois à comparer
    mois_comp = []
    for m in mois_list.split(','):
        m = m.strip()
        if m:
            parts = m.split('-')
            if len(parts) == 2:
                mois_comp.append((int(parts[0]), int(parts[1])))

    # Tous les mois à charger = mois ref + mois comparaison
    tous_mois = [(annee_ref, mois_ref)] + mois_comp

    # Charger les CAs par PDV pour chaque mois
    MOIS_NOMS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
    mois_data = {}
    for (ann, mo) in tous_mois:
        key = f"{ann}-{mo:02d}"
        rows = db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca")
        ).filter(
            NafamaTransaction.annee == ann,
            NafamaTransaction.mois == mo
        ).group_by(NafamaTransaction.numero_pdv).all()
        mois_data[key] = {row.numero_pdv: int(row.ca) for row in rows}

    # Tous les PDVs présents dans au moins un mois
    tous_pdvs = set()
    for d in mois_data.values():
        tous_pdvs.update(d.keys())

    # Enrichir avec infos PDV
    pdv_info = {}
    if tous_pdvs:
        pdv_rows = db.query(PDV).filter(PDV.numero_pdv.in_(tous_pdvs)).all()
        pdv_info = {p.numero_pdv: p for p in pdv_rows}

    key_ref = f"{annee_ref}-{mois_ref:02d}"
    resultats = []
    for num_pdv in tous_pdvs:
        ca_ref = mois_data[key_ref].get(num_pdv, 0)
        historique = {}
        for (ann, mo) in tous_mois:
            key = f"{ann}-{mo:02d}"
            historique[key] = mois_data[key].get(num_pdv, 0)

        # Dernier mois comparé
        dernier_key = f"{mois_comp[-1][0]}-{mois_comp[-1][1]:02d}" if mois_comp else key_ref
        ca_dernier = historique.get(dernier_key, 0)

        # Variation vs référence
        variation = round((ca_dernier - ca_ref) / ca_ref * 100, 1) if ca_ref > 0 else None

        # Alerte
        if ca_ref > 0 and ca_dernier == 0:
            alerte = "DISPARU"
        elif variation is not None and variation <= -50:
            alerte = "CRITIQUE"
        elif variation is not None and variation <= -20:
            alerte = "SURVEILLANCE"
        elif variation is not None and variation >= 20:
            alerte = "PERFORMANT"
        else:
            alerte = "STABLE"

        # Action suggérée
        actions = {
            "DISPARU":     "Investigation urgente + réactivation SIM",
            "CRITIQUE":    "Appel TC urgent + visite superviseur",
            "SURVEILLANCE":"Relance TC + vérification stock NAFAMA",
            "PERFORMANT":  "Félicitations + maintien",
            "STABLE":      "Suivi standard",
        }

        p = pdv_info.get(num_pdv)
        resultats.append({
            "numero_pdv":   num_pdv,
            "nom":          p.nom if p else num_pdv,
            "zone":         p.zone if p else "—",
            "sous_zone":    p.sous_zone if p else "—",
            "superviseur":  p.superviseur if p else "—",
            "gestionnaire": p.gestionnaire if p else "—",
            "ca_ref":       ca_ref,
            "ca_dernier":   ca_dernier,
            "variation":    variation,
            "alerte":       alerte,
            "action":       actions[alerte],
            "historique":   historique,
        })

    # Trier : d'abord critiques, puis surveillance, puis disparus, etc.
    ordre = {"CRITIQUE": 0, "DISPARU": 1, "SURVEILLANCE": 2, "STABLE": 3, "PERFORMANT": 4}
    resultats.sort(key=lambda x: (ordre.get(x["alerte"], 5), -(x["ca_ref"] or 0)))

    # Stats globales
    stats = {
        "total_pdvs":     len(resultats),
        "critiques":      sum(1 for r in resultats if r["alerte"] == "CRITIQUE"),
        "surveillance":   sum(1 for r in resultats if r["alerte"] == "SURVEILLANCE"),
        "disparus":       sum(1 for r in resultats if r["alerte"] == "DISPARU"),
        "performants":    sum(1 for r in resultats if r["alerte"] == "PERFORMANT"),
        "stables":        sum(1 for r in resultats if r["alerte"] == "STABLE"),
        "mois_ref":       f"{MOIS_NOMS[mois_ref]} {annee_ref}",
        "mois_compares":  [f"{MOIS_NOMS[mo]} {ann}" for ann, mo in mois_comp],
        "colonnes":       [f"{ann}-{mo:02d}" for ann, mo in tous_mois],
        "colonnes_noms":  [f"{MOIS_NOMS[mo]} {ann}" for ann, mo in tous_mois],
    }

    return {"stats": stats, "pdvs": resultats}


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
    mode: str = Query("replace", description="'replace' = vider et réimporter, 'additive' = ajouter sans supprimer"),
    db: Session = Depends(get_db),
):
    """
    Importe un fichier Excel NAFAMA.
    mode=replace : vide la table et réimporte (défaut)
    mode=additive : ajoute les nouvelles données sans supprimer les existantes (déduplique par PDV+date)
    Colonnes acceptées: PDV ou MSISDN REVENDEUR, MONTANT SOMME, Date
    """
    from app.models.nafama import NafamaTransaction
    from sqlalchemy import and_

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

    # Mapping flexible des colonnes
    col_map = {}
    for c in df.columns:
        if "MSISDN" in c or c == "PDV":
            col_map[c] = "PDV"
        elif "MONTANT" in c:
            col_map[c] = "MONTANT"
        elif "DATE" in c:
            col_map[c] = "DATE"
    df = df.rename(columns=col_map)

    required = {"PDV", "MONTANT", "DATE"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(400, f"Colonnes manquantes: {missing}. Colonnes disponibles: {list(df.columns)}")

    df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")
    df = df.dropna(subset=["DATE", "PDV", "MONTANT"])
    df["PDV"] = df["PDV"].astype(str).str.strip()
    df["MONTANT"] = pd.to_numeric(df["MONTANT"], errors="coerce").fillna(0).astype(int)
    df["ANNEE"] = df["DATE"].dt.year
    df["MOIS"] = df["DATE"].dt.month
    df["SEMAINE"] = df["DATE"].dt.isocalendar().week.astype(int)

    if mode == "replace":
        # Vider et réimporter
        db.query(NafamaTransaction).delete()
        db.commit()
        skipped = 0
    else:
        # Mode additif: supprimer uniquement les lignes pour la même période (par date)
        dates = df["DATE"].dt.date.unique().tolist()
        deleted = db.query(NafamaTransaction).filter(
            NafamaTransaction.date_transaction.in_(dates)
        ).delete(synchronize_session=False)
        db.commit()
        skipped = deleted

    inserted = 0
    batch = []
    for _, row in df.iterrows():
        batch.append(NafamaTransaction(
            numero_pdv=str(row["PDV"]),
            montant=int(row["MONTANT"]),
            date_transaction=row["DATE"].date(),
            annee=int(row["ANNEE"]),
            mois=int(row["MOIS"]),
            semaine=int(row["SEMAINE"]),
        ))
        if len(batch) >= 2000:
            db.bulk_save_objects(batch)
            db.commit()
            inserted += len(batch)
            batch = []

    if batch:
        db.bulk_save_objects(batch)
        db.commit()
        inserted += len(batch)

    return {
        "success": True,
        "mode": mode,
        "inserted": inserted,
        "replaced_existing": skipped,
        "total_rows": len(df),
        "periode": f"{df['DATE'].min().date()} → {df['DATE'].max().date()}",
        "semaines": sorted(df['SEMAINE'].unique().tolist()),
    }
