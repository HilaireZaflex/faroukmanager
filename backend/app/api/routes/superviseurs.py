from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.core.database import get_db
from app.models.pdv import PDV, PDVStatut
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.recovery import Recovery, RecoveryStatut
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy import and_, func
from app.services.supervisor_service import (
    get_supervisor_stats,
    get_supervisor_pdvs,
    get_supervisors_comparison
)

router = APIRouter()

# ============ Schemas ============

class PDVSimple(BaseModel):
    id: int
    numero_pdv: str
    nom: str
    zone: Optional[str]
    type_pdv: str
    statut: str
    health_score: float
    est_actif_semaine: bool

class SupervisorStats(BaseModel):
    nom: str
    ca_total_mois: float
    nb_pdvs: int
    pdvs_actifs: int
    pdvs_inactifs: int
    pdvs_en_baisse: int
    score_sante_moyen: float
    taux_retention: float
    nb_recuperations_reussies: int
    rang_reseau: int
    ca_precedent_mois: float
    variation_ca_mois: float

class SupervisorPDVsResponse(BaseModel):
    nom: str
    nb_pdvs: int
    pdvs: List[PDVSimple]

class ComparaisonItem(BaseModel):
    nom: str
    ca_total: float
    nb_pdvs: int
    pdvs_actifs: int
    pdvs_inactifs: int
    taux_retention: float
    score_sante_moyen: float
    nb_recuperations_reussies: int
    variation_ca_mois: float
    rang: int

class ComparaisonResponse(BaseModel):
    annee: int
    mois: int
    nombre_superviseurs: int
    comparaison: List[ComparaisonItem]

# ============ Endpoints ============

@router.get("/superviseurs/stats", response_model=List[SupervisorStats])
def get_supervisors_stats(
    annee: int = Query(2026),
    mois: int = Query(3),
    db: Session = Depends(get_db)
):
    """
    GET /superviseurs/stats - Stats pour chaque superviseur
    Retourne:
    - ca_total (dernier mois)
    - nb_pdvs, pdvs_actifs, pdvs_inactifs, pdvs_en_baisse
    - score_sante_moyen
    - taux_retention (% PDVs actifs)
    - nb_recuperations_reussies
    - rang_reseau: classement vs autres superviseurs
    """
    # Récupérer tous les superviseurs uniques
    supervisors = db.query(PDV.superviseur).filter(
        PDV.superviseur.isnot(None)
    ).distinct().all()
    
    stats_list = []
    
    for (supervisor_name,) in supervisors:
        if not supervisor_name:
            continue
        
        stats = get_supervisor_stats(db, supervisor_name, annee, mois)
        stats_list.append(stats)
    
    # Trier par CA total DESC et assigner les rangs
    stats_list.sort(key=lambda x: x["ca_total_mois"], reverse=True)
    for idx, stat in enumerate(stats_list, 1):
        stat["rang_reseau"] = idx
    
    return stats_list

@router.get("/superviseurs/{nom}/pdvs")
def get_supervisor_pdvs_endpoint(
    nom: str,
    annee: int = Query(2026),
    mois: int = Query(3),
    semaine: int = Query(52),
    db: Session = Depends(get_db)
):
    """
    GET /superviseurs/{nom}/pdvs - Tous les PDVs d'un superviseur avec performances semaine + mensuel
    """
    pdvs = db.query(PDV).filter(PDV.superviseur == nom).all()
    
    if not pdvs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Superviseur non trouvé"
        )
    
    pdv_ids = [p.id for p in pdvs]

    # Perfs semaine
    weekly_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.pdv_id.in_(pdv_ids),
        WeeklyPerformance.annee == annee,
        WeeklyPerformance.semaine == semaine
    ).all()
    weekly_map = {p.pdv_id: p for p in weekly_perfs}

    # Perfs mensuelles pour le CA
    monthly_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()
    monthly_map = {p.pdv_id: p for p in monthly_perfs}

    pdvs_data = []
    for pdv in pdvs:
        weekly = weekly_map.get(pdv.id)
        monthly = monthly_map.get(pdv.id)
        est_actif = weekly.est_actif if weekly else False

        pdvs_data.append({
            "id": pdv.id,
            "numero_pdv": pdv.numero_pdv or "",
            "nom": pdv.nom,
            "zone": pdv.zone or "—",
            "sous_zone": pdv.sous_zone or "—",
            "quartier": pdv.quartier or "—",
            "gestionnaire": pdv.gestionnaire or "—",
            "type_pdv": str(pdv.type_pdv).replace("PDVType.", "") if pdv.type_pdv else "",
            "statut": pdv.statut.value if pdv.statut else "",
            "health_score": round(pdv.health_score or 0, 1),
            "est_actif_semaine": est_actif,
            "ca": monthly.ca or 0 if monthly else 0,
            "montant_depots": monthly.montant_depots or 0 if monthly else 0,
            "montant_retraits": monthly.montant_retraits or 0 if monthly else 0,
            "nb_operations": monthly.nb_operations or 0 if monthly else 0,
            "est_actif_mois": monthly.est_actif if monthly else False,
        })

    # Trier par CA desc
    pdvs_data.sort(key=lambda x: x["ca"], reverse=True)

    return {
        "nom": nom,
        "nb_pdvs": len(pdvs_data),
        "pdvs": pdvs_data
    }

@router.get("/superviseurs/comparaison", response_model=ComparaisonResponse)
def get_supervisors_comparison_endpoint(
    annee: int = Query(2026),
    mois: int = Query(3),
    db: Session = Depends(get_db)
):
    """
    GET /superviseurs/comparaison - Comparaison de TOUS les superviseurs sur tous les KPIs
    """
    comparaison = get_supervisors_comparison(db, annee=annee, mois=mois)
    
    # Trier par CA total DESC
    comparaison.sort(key=lambda x: x["ca_total"], reverse=True)
    
    # Assigner les rangs
    for idx, item in enumerate(comparaison, 1):
        item["rang"] = idx
    
    return {
        "annee": annee,
        "mois": mois,
        "nombre_superviseurs": len(comparaison),
        "comparaison": comparaison
    }
