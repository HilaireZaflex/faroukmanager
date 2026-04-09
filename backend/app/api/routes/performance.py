from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.pdv import PDV
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.user import User
from app.api.routes.auth import require_admin
from pydantic import BaseModel
from datetime import datetime
import io
import csv

router = APIRouter()

class PerformanceBase(BaseModel):
    pdv_id: int
    ca: float = 0.0
    nb_operations: int = 0
    nb_depots: int = 0
    montant_depots: float = 0.0
    nb_retraits: int = 0
    montant_retraits: float = 0.0
    est_actif: bool = False

class WeeklyPerformanceCreate(PerformanceBase):
    annee: int
    semaine: int

class MonthlyPerformanceCreate(PerformanceBase):
    annee: int
    mois: int

class WeeklyPerformanceResponse(WeeklyPerformanceCreate):
    id: int
    ca_semaine_precedente: float
    taux_variation: float
    created_at: datetime

    class Config:
        from_attributes = True

class MonthlyPerformanceResponse(MonthlyPerformanceCreate):
    id: int
    ca_mois_precedent: float
    taux_variation: float
    created_at: datetime

    class Config:
        from_attributes = True

@router.post("/performance/weekly")
def bulk_import_weekly(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Bulk import weekly performance data"""
    try:
        contents = file.file.read()
        stream = io.StringIO(contents.decode("utf8"))
        reader = csv.DictReader(stream)
        
        created_count = 0
        updated_count = 0
        errors = []
        
        for idx, row in enumerate(reader, start=2):
            try:
                pdv_id = int(row.get("pdv_id", 0))
                annee = int(row.get("annee", 2026))
                semaine = int(row.get("semaine", 1))
                
                # Verify PDV exists
                pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
                if not pdv:
                    errors.append(f"Row {idx}: PDV {pdv_id} not found")
                    continue
                
                # Check if exists
                existing = db.query(WeeklyPerformance).filter(
                    WeeklyPerformance.pdv_id == pdv_id,
                    WeeklyPerformance.annee == annee,
                    WeeklyPerformance.semaine == semaine
                ).first()
                
                ca = float(row.get("ca", 0))
                ca_prev = float(row.get("ca_semaine_precedente", 0))
                
                # Calculate variation
                taux_variation = 0
                if ca_prev > 0:
                    taux_variation = ((ca - ca_prev) / ca_prev) * 100
                
                if existing:
                    existing.ca = ca
                    existing.nb_operations = int(row.get("nb_operations", 0))
                    existing.nb_depots = int(row.get("nb_depots", 0))
                    existing.montant_depots = float(row.get("montant_depots", 0))
                    existing.nb_retraits = int(row.get("nb_retraits", 0))
                    existing.montant_retraits = float(row.get("montant_retraits", 0))
                    existing.est_actif = row.get("est_actif", "false").lower() == "true"
                    existing.ca_semaine_precedente = ca_prev
                    existing.taux_variation = taux_variation
                    db.commit()
                    updated_count += 1
                else:
                    perf = WeeklyPerformance(
                        pdv_id=pdv_id,
                        annee=annee,
                        semaine=semaine,
                        ca=ca,
                        nb_operations=int(row.get("nb_operations", 0)),
                        nb_depots=int(row.get("nb_depots", 0)),
                        montant_depots=float(row.get("montant_depots", 0)),
                        nb_retraits=int(row.get("nb_retraits", 0)),
                        montant_retraits=float(row.get("montant_retraits", 0)),
                        est_actif=row.get("est_actif", "false").lower() == "true",
                        ca_semaine_precedente=ca_prev,
                        taux_variation=taux_variation
                    )
                    db.add(perf)
                    db.commit()
                    created_count += 1
                    
            except Exception as e:
                errors.append(f"Row {idx}: {str(e)}")
        
        return {
            "status": "success",
            "created": created_count,
            "updated": updated_count,
            "errors": errors,
            "total_rows": idx
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing file: {str(e)}"
        )

@router.post("/performance/monthly")
def bulk_import_monthly(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Bulk import monthly performance data"""
    try:
        contents = file.file.read()
        stream = io.StringIO(contents.decode("utf8"))
        reader = csv.DictReader(stream)
        
        created_count = 0
        updated_count = 0
        errors = []
        
        for idx, row in enumerate(reader, start=2):
            try:
                pdv_id = int(row.get("pdv_id", 0))
                annee = int(row.get("annee", 2026))
                mois = int(row.get("mois", 1))
                
                # Verify PDV exists
                pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
                if not pdv:
                    errors.append(f"Row {idx}: PDV {pdv_id} not found")
                    continue
                
                # Check if exists
                existing = db.query(MonthlyPerformance).filter(
                    MonthlyPerformance.pdv_id == pdv_id,
                    MonthlyPerformance.annee == annee,
                    MonthlyPerformance.mois == mois
                ).first()
                
                ca = float(row.get("ca", 0))
                ca_prev = float(row.get("ca_mois_precedent", 0))
                
                # Calculate variation
                taux_variation = 0
                if ca_prev > 0:
                    taux_variation = ((ca - ca_prev) / ca_prev) * 100
                
                if existing:
                    existing.ca = ca
                    existing.nb_operations = int(row.get("nb_operations", 0))
                    existing.nb_depots = int(row.get("nb_depots", 0))
                    existing.montant_depots = float(row.get("montant_depots", 0))
                    existing.nb_retraits = int(row.get("nb_retraits", 0))
                    existing.montant_retraits = float(row.get("montant_retraits", 0))
                    existing.est_actif = row.get("est_actif", "false").lower() == "true"
                    existing.ca_mois_precedent = ca_prev
                    existing.taux_variation = taux_variation
                    db.commit()
                    updated_count += 1
                else:
                    perf = MonthlyPerformance(
                        pdv_id=pdv_id,
                        annee=annee,
                        mois=mois,
                        ca=ca,
                        nb_operations=int(row.get("nb_operations", 0)),
                        nb_depots=int(row.get("nb_depots", 0)),
                        montant_depots=float(row.get("montant_depots", 0)),
                        nb_retraits=int(row.get("nb_retraits", 0)),
                        montant_retraits=float(row.get("montant_retraits", 0)),
                        est_actif=row.get("est_actif", "false").lower() == "true",
                        ca_mois_precedent=ca_prev,
                        taux_variation=taux_variation
                    )
                    db.add(perf)
                    db.commit()
                    created_count += 1
                    
            except Exception as e:
                errors.append(f"Row {idx}: {str(e)}")
        
        return {
            "status": "success",
            "created": created_count,
            "updated": updated_count,
            "errors": errors,
            "total_rows": idx
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing file: {str(e)}"
        )

@router.get("/performance/pdv/{pdv_id}/weekly", response_model=List[WeeklyPerformanceResponse])
def get_pdv_weekly_history(
    pdv_id: int,
    db: Session = Depends(get_db),
    annee: int = None,
    limit: int = 52
):
    """Get weekly history for a PDV"""
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDV not found"
        )
    
    query = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.pdv_id == pdv_id
    )
    
    if annee:
        query = query.filter(WeeklyPerformance.annee == annee)
    
    performances = query.order_by(
        WeeklyPerformance.annee.desc(),
        WeeklyPerformance.semaine.desc()
    ).limit(limit).all()
    
    return [WeeklyPerformanceResponse.from_orm(p) for p in performances]

@router.get("/performance/pdv/{pdv_id}/monthly", response_model=List[MonthlyPerformanceResponse])
def get_pdv_monthly_history(
    pdv_id: int,
    db: Session = Depends(get_db),
    annee: int = None,
    limit: int = 24
):
    """Get monthly history for a PDV"""
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDV not found"
        )
    
    query = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id == pdv_id
    )
    
    if annee:
        query = query.filter(MonthlyPerformance.annee == annee)
    
    performances = query.order_by(
        MonthlyPerformance.annee.desc(),
        MonthlyPerformance.mois.desc()
    ).limit(limit).all()
    
    return [MonthlyPerformanceResponse.from_orm(p) for p in performances]
