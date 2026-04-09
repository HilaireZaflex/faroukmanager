from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.pdv import PDV, PDVStatut, PDVMedaille
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.action import TerrainAction
from typing import Dict, Any, List

def get_monthly_dashboard(db: Session, annee: int, mois: int, filters: Dict[str, Any] = None) -> Dict[str, Any]:
    """Get monthly dashboard data."""
    # Base query for monthly performance
    query = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    )
    
    if filters:
        if filters.get("zone"):
            query = query.join(PDV).filter(PDV.zone == filters["zone"])
        if filters.get("superviseur"):
            query = query.join(PDV).filter(PDV.superviseur == filters["superviseur"])
    
    performances = query.all()
    
    # Calculate aggregates
    total_ca = sum(p.ca for p in performances)
    total_operations = sum(p.nb_operations for p in performances)
    total_depots = sum(p.nb_depots for p in performances)
    total_retraits = sum(p.nb_retraits for p in performances)
    montant_depots = sum(p.montant_depots for p in performances)
    montant_retraits = sum(p.montant_retraits for p in performances)
    active_pdvs = sum(1 for p in performances if p.est_actif)
    
    # Calculate average variation
    variations = [p.taux_variation for p in performances if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0
    
    return {
        "annee": annee,
        "mois": mois,
        "total_ca": total_ca,
        "total_operations": total_operations,
        "total_depots": total_depots,
        "total_retraits": total_retraits,
        "montant_depots": montant_depots,
        "montant_retraits": montant_retraits,
        "active_pdvs": active_pdvs,
        "total_pdvs": len(performances),
        "avg_variation": avg_variation,
        "taux_activite": (active_pdvs / len(performances) * 100) if performances else 0.0
    }

def get_weekly_dashboard(db: Session, annee: int, semaine: int, filters: Dict[str, Any] = None) -> Dict[str, Any]:
    """Get weekly dashboard data."""
    # Base query for weekly performance
    query = db.query(WeeklyPerformance).filter(
        and_(
            WeeklyPerformance.annee == annee,
            WeeklyPerformance.semaine == semaine
        )
    )
    
    if filters:
        if filters.get("zone"):
            query = query.join(PDV).filter(PDV.zone == filters["zone"])
        if filters.get("superviseur"):
            query = query.join(PDV).filter(PDV.superviseur == filters["superviseur"])
    
    performances = query.all()
    
    # Calculate aggregates
    total_ca = sum(p.ca for p in performances)
    total_operations = sum(p.nb_operations for p in performances)
    total_depots = sum(p.nb_depots for p in performances)
    total_retraits = sum(p.nb_retraits for p in performances)
    montant_depots = sum(p.montant_depots for p in performances)
    montant_retraits = sum(p.montant_retraits for p in performances)
    active_pdvs = sum(1 for p in performances if p.est_actif)
    
    # Calculate average variation
    variations = [p.taux_variation for p in performances if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0
    
    return {
        "annee": annee,
        "semaine": semaine,
        "total_ca": total_ca,
        "total_operations": total_operations,
        "total_depots": total_depots,
        "total_retraits": total_retraits,
        "montant_depots": montant_depots,
        "montant_retraits": montant_retraits,
        "active_pdvs": active_pdvs,
        "total_pdvs": len(performances),
        "avg_variation": avg_variation,
        "taux_activite": (active_pdvs / len(performances) * 100) if performances else 0.0
    }

def get_pareto_analysis(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    """Get Pareto analysis for the month (80/20 rule)."""
    # Get monthly performances for the month
    performances = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).order_by(MonthlyPerformance.ca.desc()).all()
    
    if not performances:
        return {
            "total_ca": 0,
            "top_20_count": 0,
            "top_20_ca": 0,
            "top_20_percentage": 0,
            "rest_count": 0,
            "rest_ca": 0,
            "rest_percentage": 0,
            "pdvs": []
        }
    
    total_ca = sum(p.ca for p in performances)
    top_20_percent_count = max(1, int(len(performances) * 0.2))
    
    top_20_pdvs = performances[:top_20_percent_count]
    top_20_ca = sum(p.ca for p in top_20_pdvs)
    top_20_percentage = (top_20_ca / total_ca * 100) if total_ca > 0 else 0
    
    rest_pdvs = performances[top_20_percent_count:]
    rest_ca = sum(p.ca for p in rest_pdvs)
    rest_percentage = (rest_ca / total_ca * 100) if total_ca > 0 else 0
    
    pdv_details = []
    for p in top_20_pdvs:
        pdv = db.query(PDV).filter(PDV.id == p.pdv_id).first()
        if pdv:
            pdv_details.append({
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "ca": p.ca,
                "zone": pdv.zone
            })
    
    return {
        "total_ca": total_ca,
        "top_20_count": top_20_percent_count,
        "top_20_ca": top_20_ca,
        "top_20_percentage": top_20_percentage,
        "rest_count": len(rest_pdvs),
        "rest_ca": rest_ca,
        "rest_percentage": rest_percentage,
        "pdvs": pdv_details
    }

def get_classements(db: Session, annee: int, mois: int, top_n: int = 10) -> Dict[str, Any]:
    """Get rankings for top performing PDVs."""
    # Get monthly performances
    performances = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).order_by(MonthlyPerformance.ca.desc()).limit(top_n).all()
    
    classement_ca = []
    for rank, perf in enumerate(performances, 1):
        pdv = db.query(PDV).filter(PDV.id == perf.pdv_id).first()
        if pdv:
            classement_ca.append({
                "rang": rank,
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "zone": pdv.zone,
                "medaille": pdv.medaille.value if pdv.medaille else "",
                "ca": perf.ca,
                "nb_operations": perf.nb_operations,
                "taux_variation": perf.taux_variation
            })
    
    # Get top PDVs by operations
    operations_perfs = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).order_by(MonthlyPerformance.nb_operations.desc()).limit(top_n).all()
    
    classement_operations = []
    for rank, perf in enumerate(operations_perfs, 1):
        pdv = db.query(PDV).filter(PDV.id == perf.pdv_id).first()
        if pdv:
            classement_operations.append({
                "rang": rank,
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "zone": pdv.zone,
                "nb_operations": perf.nb_operations,
                "ca": perf.ca
            })
    
    # Get top PDVs by growth
    growth_perfs = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).order_by(MonthlyPerformance.taux_variation.desc()).limit(top_n).all()
    
    classement_croissance = []
    for rank, perf in enumerate(growth_perfs, 1):
        pdv = db.query(PDV).filter(PDV.id == perf.pdv_id).first()
        if pdv:
            classement_croissance.append({
                "rang": rank,
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "zone": pdv.zone,
                "taux_variation": perf.taux_variation,
                "ca": perf.ca,
                "ca_mois_precedent": perf.ca_mois_precedent
            })
    
    return {
        "annee": annee,
        "mois": mois,
        "top_n": top_n,
        "classement_ca": classement_ca,
        "classement_operations": classement_operations,
        "classement_croissance": classement_croissance
    }
