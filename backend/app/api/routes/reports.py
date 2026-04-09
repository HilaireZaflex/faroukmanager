from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance, WeeklyPerformance
from app.models.action import TerrainAction
from app.models.user import User
from app.api.routes.auth import require_admin
from datetime import datetime, timedelta
from sqlalchemy import and_, desc

router = APIRouter()

@router.get("/reports/weekly-roadmap")
def get_weekly_roadmap(
    db: Session = Depends(get_db),
    zone: Optional[str] = Query(None),
    superviseur: Optional[str] = Query(None)
):
    """Weekly roadmap for teleconseilleres"""
    # Get inactive PDVs this week
    one_week_ago = datetime.utcnow() - timedelta(days=7)
    weekly_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.created_at >= one_week_ago
    ).all()
    
    inactive_pdv_ids = [p.pdv_id for p in weekly_perfs if not p.est_actif]
    
    # Filter by zone/superviseur if provided
    pdv_filter = [PDV.id.in_(inactive_pdv_ids)] if inactive_pdv_ids else []
    if zone:
        pdv_filter.append(PDV.zone == zone)
    if superviseur:
        pdv_filter.append(PDV.superviseur == superviseur)
    
    pdvs = db.query(PDV).filter(and_(*pdv_filter)).all() if pdv_filter else []
    
    # Get recent actions
    recent_actions = db.query(TerrainAction).filter(
        TerrainAction.created_at >= one_week_ago
    ).order_by(desc(TerrainAction.date_action)).all()
    
    roadmap_items = []
    for pdv in pdvs:
        pdv_actions = [a for a in recent_actions if a.pdv_id == pdv.id]
        
        roadmap_items.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "teleconseillere": pdv.teleconseillere,
            "priority": "HIGH" if len(pdv_actions) == 0 else "MEDIUM",
            "last_action": pdv_actions[0].date_action if pdv_actions else None,
            "actions_count": len(pdv_actions)
        })
    
    return {
        "week_start": datetime.utcnow() - timedelta(days=7),
        "week_end": datetime.utcnow(),
        "total_pdvs_to_contact": len(roadmap_items),
        "roadmap": sorted(roadmap_items, key=lambda x: x["priority"] == "HIGH", reverse=True)
    }

@router.get("/reports/orange-mali")
def get_orange_mali_report(
    db: Session = Depends(get_db),
    annee: int = Query(2026),
    mois: int = Query(1, ge=1, le=12)
):
    """Orange Mali monthly report data"""
    monthly_perfs = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).all()
    
    pdvs = db.query(PDV).all()
    
    total_ca = sum(p.ca for p in monthly_perfs)
    total_operations = sum(p.nb_operations for p in monthly_perfs)
    total_active_pdvs = sum(1 for p in monthly_perfs if p.est_actif)
    total_pdvs = len([p for p in pdvs if p.statut != PDVStatut.DESACTIVE])
    
    # CA by type
    ca_by_type = {}
    for perf in monthly_perfs:
        pdv = next((p for p in pdvs if p.id == perf.pdv_id), None)
        if pdv:
            type_key = pdv.type_pdv.value
            if type_key not in ca_by_type:
                ca_by_type[type_key] = 0
            ca_by_type[type_key] += perf.ca
    
    # Top PDVs
    top_pdvs = sorted(
        [
            {
                "pdv_id": perf.pdv_id,
                "numero_pdv": next((p.numero_pdv for p in pdvs if p.id == perf.pdv_id), ""),
                "nom": next((p.nom for p in pdvs if p.id == perf.pdv_id), ""),
                "ca": perf.ca,
                "operations": perf.nb_operations
            }
            for perf in monthly_perfs
        ],
        key=lambda x: x["ca"],
        reverse=True
    )[:10]
    
    return {
        "period": f"{annee}-{mois:02d}",
        "total_ca": round(total_ca, 2),
        "total_operations": total_operations,
        "active_pdvs": total_active_pdvs,
        "total_pdvs": total_pdvs,
        "activation_rate": round((total_active_pdvs / total_pdvs * 100) if total_pdvs > 0 else 0, 2),
        "ca_by_type": ca_by_type,
        "top_pdvs": top_pdvs,
        "average_ca_per_pdv": round(total_ca / total_active_pdvs if total_active_pdvs > 0 else 0, 2)
    }

@router.post("/reports/orange-mali/pdf")
def generate_orange_mali_pdf(
    db: Session = Depends(get_db),
    annee: int = Query(2026),
    mois: int = Query(1, ge=1, le=12),
    admin: User = Depends(require_admin)
):
    """Generate PDF report (stub - actual PDF generation would be done with reportlab or similar)"""
    report_data = {
        "period": f"{annee}-{mois:02d}",
        "generated_at": datetime.utcnow().isoformat(),
        "message": "PDF generation would be implemented with reportlab or similar library"
    }
    
    return {
        "status": "success",
        "filename": f"orange_mali_report_{annee}_{mois:02d}.pdf",
        "data": report_data
    }

@router.get("/reports/competition")
def get_competition_dashboard(db: Session = Depends(get_db)):
    """Competition dashboard data"""
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    monthly_perfs = db.query(MonthlyPerformance).all()
    
    # Calculate CA per PDV
    pdv_cas = {}
    for perf in monthly_perfs:
        if perf.pdv_id not in pdv_cas:
            pdv_cas[perf.pdv_id] = 0
        pdv_cas[perf.pdv_id] += perf.ca
    
    # Top performers
    top_pdvs = sorted(
        [
            {
                "id": p.id,
                "numero_pdv": p.numero_pdv,
                "nom": p.nom,
                "zone": p.zone,
                "superviseur": p.superviseur,
                "medaille": p.medaille.value,
                "ca": pdv_cas.get(p.id, 0),
                "health_score": p.health_score
            }
            for p in pdvs
        ],
        key=lambda x: x["ca"],
        reverse=True
    )
    
    # Zone leaders
    zone_leaders = {}
    for pdv_data in top_pdvs:
        zone = pdv_data["zone"]
        if zone and zone not in zone_leaders:
            zone_leaders[zone] = pdv_data
    
    return {
        "total_pdvs": len(pdvs),
        "top_10_pdvs": top_pdvs[:10],
        "zone_leaders": list(zone_leaders.values()),
        "total_network_ca": sum(pdv_cas.values()),
        "competition_metrics": {
            "gold_medal_count": sum(1 for p in pdvs if p.medaille.value == "OR"),
            "silver_medal_count": sum(1 for p in pdvs if p.medaille.value == "ARGENT"),
            "bronze_medal_count": sum(1 for p in pdvs if p.medaille.value == "BRONZE")
        }
    }
