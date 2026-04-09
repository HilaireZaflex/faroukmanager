from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from app.models.pdv import PDV, PDVStatut
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.recovery import Recovery, RecoveryStatut
from typing import List, Dict, Any
from datetime import datetime, timedelta

def get_supervisor_stats(
    db: Session,
    supervisor_name: str,
    annee: int,
    mois: int
) -> Dict[str, Any]:
    """
    Récupère les stats d'un superviseur pour un mois donné.
    Retourne: ca_total, nb_pdvs, pdvs_actifs, pdvs_inactifs, pdvs_en_baisse,
              score_sante_moyen, taux_retention, nb_recuperations_reussies, variation_ca_mois
    """
    # Récupérer tous les PDVs du superviseur
    pdvs = db.query(PDV).filter(PDV.superviseur == supervisor_name).all()
    
    if not pdvs:
        return {
            "nom": supervisor_name,
            "ca_total_mois": 0.0,
            "nb_pdvs": 0,
            "pdvs_actifs": 0,
            "pdvs_inactifs": 0,
            "pdvs_en_baisse": 0,
            "score_sante_moyen": 0.0,
            "taux_retention": 0.0,
            "nb_recuperations_reussies": 0,
            "rang_reseau": 0,
            "ca_precedent_mois": 0.0,
            "variation_ca_mois": 0.0
        }
    
    pdv_ids = [p.id for p in pdvs]
    
    # CA du mois actuel
    monthly_perfs_current = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.pdv_id.in_(pdv_ids),
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        )
    ).all()
    
    ca_total = sum(p.ca for p in monthly_perfs_current)
    
    # CA du mois précédent
    prev_mois = mois - 1
    prev_annee = annee
    if prev_mois < 1:
        prev_mois = 12
        prev_annee -= 1
    
    monthly_perfs_prev = db.query(MonthlyPerformance).filter(
        and_(
            MonthlyPerformance.pdv_id.in_(pdv_ids),
            MonthlyPerformance.annee == prev_annee,
            MonthlyPerformance.mois == prev_mois
        )
    ).all()
    
    ca_prev = sum(p.ca for p in monthly_perfs_prev)
    
    # Variation CA
    if ca_prev > 0:
        variation_ca = ((ca_total - ca_prev) / ca_prev) * 100
    else:
        variation_ca = 0.0 if ca_total == 0 else 100.0
    
    # PDVs actifs / inactifs ce mois
    pdvs_actifs = sum(1 for p in monthly_perfs_current if p.est_actif)
    pdvs_inactifs = len(monthly_perfs_current) - pdvs_actifs
    
    # PDVs en baisse
    pdvs_en_baisse = sum(1 for p in monthly_perfs_current if p.taux_variation < -10)
    
    # Score santé moyen
    health_scores = [p.health_score for p in pdvs]
    score_sante_moyen = sum(health_scores) / len(health_scores) if health_scores else 0.0
    
    # Taux de rétention (% PDVs actifs)
    total_with_data = len(monthly_perfs_current)
    taux_retention = (pdvs_actifs / total_with_data * 100) if total_with_data > 0 else 0.0
    
    # Nombre de récupérations réussies
    recoveries_reussies = db.query(Recovery).filter(
        and_(
            Recovery.pdv_id.in_(pdv_ids),
            Recovery.statut == RecoveryStatut.REDEPLOYE
        )
    ).count()
    
    return {
        "nom": supervisor_name,
        "ca_total_mois": ca_total,
        "nb_pdvs": len(pdvs),
        "pdvs_actifs": pdvs_actifs,
        "pdvs_inactifs": pdvs_inactifs,
        "pdvs_en_baisse": pdvs_en_baisse,
        "score_sante_moyen": score_sante_moyen,
        "taux_retention": taux_retention,
        "nb_recuperations_reussies": recoveries_reussies,
        "rang_reseau": 0,  # Sera assigné après le tri
        "ca_precedent_mois": ca_prev,
        "variation_ca_mois": variation_ca
    }

def get_supervisor_pdvs(
    db: Session,
    supervisor_name: str,
    annee: int,
    semaine: int
) -> List[Dict[str, Any]]:
    """
    Récupère tous les PDVs d'un superviseur avec leurs performances de la semaine.
    """
    pdvs = db.query(PDV).filter(PDV.superviseur == supervisor_name).all()
    
    pdvs_data = []
    for pdv in pdvs:
        # Récupérer perf de la semaine
        perf = db.query(WeeklyPerformance).filter(
            and_(
                WeeklyPerformance.pdv_id == pdv.id,
                WeeklyPerformance.annee == annee,
                WeeklyPerformance.semaine == semaine
            )
        ).first()
        
        est_actif = perf.est_actif if perf else False
        
        pdvs_data.append({
            "id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "type_pdv": str(pdv.type_pdv) if pdv.type_pdv else "",
            "statut": pdv.statut.value if pdv.statut else "",
            "health_score": pdv.health_score,
            "est_actif_semaine": est_actif
        })
    
    return pdvs_data

def get_supervisors_comparison(
    db: Session,
    annee: int,
    mois: int
) -> List[Dict[str, Any]]:
    """
    Comparaison de TOUS les superviseurs sur tous les KPIs.
    """
    supervisors = db.query(PDV.superviseur).filter(
        PDV.superviseur.isnot(None)
    ).distinct().all()
    
    comparaison = []
    
    for (supervisor_name,) in supervisors:
        if not supervisor_name:
            continue
        
        stats = get_supervisor_stats(db, supervisor_name, annee, mois)
        
        comparaison.append({
            "nom": stats["nom"],
            "ca_total": stats["ca_total_mois"],
            "nb_pdvs": stats["nb_pdvs"],
            "pdvs_actifs": stats["pdvs_actifs"],
            "pdvs_inactifs": stats["pdvs_inactifs"],
            "taux_retention": stats["taux_retention"],
            "score_sante_moyen": stats["score_sante_moyen"],
            "nb_recuperations_reussies": stats["nb_recuperations_reussies"],
            "variation_ca_mois": stats["variation_ca_mois"],
            "rang": 0  # Sera assigné après le tri
        })
    
    return comparaison
