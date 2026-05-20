from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.models.pdv import PDV, PDVStatut, PDVMedaille
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.action import TerrainAction
from typing import Dict, Any, List

def _perf_montant_transaction(p) -> float:
    """Retourne montant_transaction si disponible, sinon ca (compatibilité)."""
    mt = getattr(p, 'montant_transaction', None)
    return mt if mt else (p.ca or 0.0)

def _perf_montant_ca(p) -> float:
    return getattr(p, 'montant_ca', None) or 0.0

def _perf_commission_pdg(p) -> float:
    return getattr(p, 'commission_pdg', None) or 0.0

def _perf_commission_revendeur(p) -> float:
    return getattr(p, 'commission_revendeur', None) or 0.0

def _perf_ratio(p) -> float:
    return getattr(p, 'ratio_ca_transaction', None) or 0.0


def get_monthly_dashboard(db: Session, annee: int, mois: int, filters: Dict[str, Any] = None) -> Dict[str, Any]:
    """Get monthly dashboard data avec nouveaux champs montant_transaction, montant_ca, commissions."""
    query = db.query(MonthlyPerformance).filter(
        and_(MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois)
    )
    if filters:
        if filters.get("zone"):
            query = query.join(PDV).filter(PDV.zone == filters["zone"])
        if filters.get("superviseur"):
            query = query.join(PDV).filter(PDV.superviseur == filters["superviseur"])

    performances = query.all()

    # ── Volumes de base ──────────────────────────────────────────────────────
    total_montant_transaction = sum(_perf_montant_transaction(p) for p in performances)
    total_montant_ca          = sum(_perf_montant_ca(p) for p in performances)
    total_commission_pdg      = sum(_perf_commission_pdg(p) for p in performances)
    total_commission_revendeur = sum(_perf_commission_revendeur(p) for p in performances)
    total_operations   = sum(p.nb_operations for p in performances)
    total_depots       = sum(p.nb_depots for p in performances)
    total_retraits     = sum(p.nb_retraits for p in performances)
    montant_depots     = sum(p.montant_depots for p in performances)
    montant_retraits   = sum(p.montant_retraits for p in performances)
    active_pdvs        = sum(1 for p in performances if p.est_actif)
    n                  = len(performances)

    # ── Indicateurs qualité ──────────────────────────────────────────────────
    # Ratio CA/Transaction global : mesure la part des retraits dans le volume
    ratio_ca_transaction = round(
        (total_montant_ca / total_montant_transaction * 100) if total_montant_transaction > 0 else 0.0, 2
    )
    # PDV à faible CA (bonne transaction mais mauvais CA — trop de dépôts)
    avg_ratio = sum(_perf_ratio(p) for p in performances) / n if n > 0 else 0
    pdvs_faible_ca = sum(1 for p in performances if _perf_ratio(p) < avg_ratio * 0.5 and p.est_actif)

    variations = [p.taux_variation for p in performances if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0

    # ── Compatibilité ascendante : total_ca = montant_transaction ────────────
    total_ca = total_montant_transaction

    return {
        "annee": annee,
        "mois": mois,
        # Nouveau nommage
        "total_montant_transaction": round(total_montant_transaction, 2),
        "total_montant_ca":          round(total_montant_ca, 2),
        "total_commission_pdg":      round(total_commission_pdg, 2),
        "total_commission_revendeur": round(total_commission_revendeur, 2),
        "ratio_ca_transaction":      ratio_ca_transaction,
        "pdvs_faible_ca":            pdvs_faible_ca,
        # Compatibilité (ancien nom)
        "total_ca": round(total_ca, 2),
        # Opérations
        "total_operations":  total_operations,
        "total_depots":      total_depots,
        "total_retraits":    total_retraits,
        "montant_depots":    round(montant_depots, 2),
        "montant_retraits":  round(montant_retraits, 2),
        "active_pdvs":       active_pdvs,
        "total_pdvs":        n,
        "avg_variation":     round(avg_variation, 2),
        "taux_activite":     round((active_pdvs / n * 100) if n > 0 else 0.0, 1),
    }

def get_weekly_dashboard(db: Session, annee: int, semaine: int, filters: Dict[str, Any] = None) -> Dict[str, Any]:
    """Get weekly dashboard data avec nouveaux champs montant_transaction, montant_ca, commissions."""
    query = db.query(WeeklyPerformance).filter(
        and_(WeeklyPerformance.annee == annee, WeeklyPerformance.semaine == semaine)
    )
    if filters:
        if filters.get("zone"):
            query = query.join(PDV).filter(PDV.zone == filters["zone"])
        if filters.get("superviseur"):
            query = query.join(PDV).filter(PDV.superviseur == filters["superviseur"])

    performances = query.all()

    total_montant_transaction  = sum(_perf_montant_transaction(p) for p in performances)
    total_montant_ca           = sum(_perf_montant_ca(p) for p in performances)
    total_commission_pdg       = sum(_perf_commission_pdg(p) for p in performances)
    total_commission_revendeur = sum(_perf_commission_revendeur(p) for p in performances)
    total_operations  = sum(p.nb_operations for p in performances)
    total_depots      = sum(p.nb_depots for p in performances)
    total_retraits    = sum(p.nb_retraits for p in performances)
    montant_depots    = sum(p.montant_depots for p in performances)
    montant_retraits  = sum(p.montant_retraits for p in performances)
    active_pdvs       = sum(1 for p in performances if p.est_actif)
    n                 = len(performances)

    ratio_ca_transaction = round(
        (total_montant_ca / total_montant_transaction * 100) if total_montant_transaction > 0 else 0.0, 2
    )
    avg_ratio = sum(_perf_ratio(p) for p in performances) / n if n > 0 else 0
    pdvs_faible_ca = sum(1 for p in performances if _perf_ratio(p) < avg_ratio * 0.5 and p.est_actif)

    variations = [p.taux_variation for p in performances if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0

    total_ca = total_montant_transaction  # compatibilité

    return {
        "annee": annee,
        "semaine": semaine,
        # Nouveau nommage
        "total_montant_transaction": round(total_montant_transaction, 2),
        "total_montant_ca":          round(total_montant_ca, 2),
        "total_commission_pdg":      round(total_commission_pdg, 2),
        "total_commission_revendeur": round(total_commission_revendeur, 2),
        "ratio_ca_transaction":      ratio_ca_transaction,
        "pdvs_faible_ca":            pdvs_faible_ca,
        # Compatibilité
        "total_ca": round(total_ca, 2),
        # Opérations
        "total_operations": total_operations,
        "total_depots":     total_depots,
        "total_retraits":   total_retraits,
        "montant_depots":   round(montant_depots, 2),
        "montant_retraits": round(montant_retraits, 2),
        "active_pdvs":      active_pdvs,
        "total_pdvs":       n,
        "avg_variation":    round(avg_variation, 2),
        "taux_activite":    round((active_pdvs / n * 100) if n > 0 else 0.0, 1),
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
