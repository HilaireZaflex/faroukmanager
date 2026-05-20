from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.pdv import PDV, PDVStatut
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.action import TerrainAction, ActionType, ActionResultat
from app.models.user import User
from app.models.recovery import Recovery, RecoveryStatut
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy import and_, desc, or_
from app.api.routes.auth import require_admin
from app.services.alert_service import (
    get_inactive_pdvs_with_history,
    get_declining_pdvs_with_risk,
    generate_weekly_recommendations,
    check_auto_recovery_trigger
)

router = APIRouter()

# ============ Schemas ============

class PDVInactiveAlert(BaseModel):
    pdv_id: int
    numero_pdv: str
    nom: str
    zone: Optional[str]
    sous_zone: Optional[str]
    superviseur: Optional[str]
    gestionnaire: Optional[str]
    teleconseillere: Optional[str]
    type_pdv: str
    telephone: Optional[str]
    semaines_consecutives_inactif: int
    derniere_activite: Optional[datetime]
    ca_precedent: float
    priorite: str  # 'CRITIQUE'|'HAUTE'|'NORMALE'

class InactiveAlertsResponse(BaseModel):
    count: int
    semaine: int
    annee: int
    pdvs: List[PDVInactiveAlert]

class HistoriquePerf(BaseModel):
    semaine: int
    ca: float
    est_actif: bool
    taux_variation: float

class PDVDecliningAlert(BaseModel):
    pdv_id: int
    numero_pdv: str
    nom: str
    zone: Optional[str]
    superviseur: Optional[str]
    gestionnaire: Optional[str]
    teleconseillere: Optional[str]
    type_pdv: str
    ca: float
    ca_precedent: float
    taux_variation: float
    historique_4sem: List[HistoriquePerf]
    score_risque: float
    type_baisse: str  # 'ANORMALE'|'NORMALE'

class DecliningAlertsResponse(BaseModel):
    count: int
    seuil: float
    pdvs: List[PDVDecliningAlert]

class RecoveryPDVData(BaseModel):
    id: int
    pdv_id: int
    nom: str
    zone: Optional[str]
    superviseur: Optional[str]
    statut: str
    ca_3mois: float
    date_identification: datetime
    date_contact: Optional[datetime]
    date_recuperation_sim: Optional[datetime]
    date_redeploiement: Optional[datetime]
    superviseur_responsable: Optional[str]
    notes: Optional[str]
    sim_recuperee: bool
    numero_flotte: bool
    sim_au_bureau: bool
    sim_coupee: bool
    nouvelle_creation: bool

class RecoverySynthese(BaseModel):
    a_recuperer: int
    recuperees: int
    redeployees: int
    taux_recuperation: float

class RecoveryAlertsResponse(BaseModel):
    count: int
    synthese: RecoverySynthese
    pdvs: List[RecoveryPDVData]

class RecoveryUpdate(BaseModel):
    recovery_id: int
    statut: str
    notes: Optional[str]
    superviseur_responsable: Optional[str]

class TerrainActionCreate(BaseModel):
    pdv_id: int
    type_action: str  # APPEL|VISITE_TERRAIN|MESSAGE_WHATSAPP|AUTRE
    resultat: str    # RECONTACTE|REACTIVE|A_RECUPERER|NON_JOIGNABLE|EN_ATTENTE
    notes: Optional[str] = None

class TerrainActionResponse(BaseModel):
    id: int
    pdv_id: int
    type_action: str
    resultat: str
    notes: Optional[str]
    date_action: datetime
    created_at: datetime
    user_nom: Optional[str]

    class Config:
        from_attributes = True

class RecommendationItem(BaseModel):
    priorite: int  # 1-10
    type: str  # APPEL_URGENT|INTERVENTION|RECUPERATION|GROUPEE
    message: str
    pdv_id: int
    pdv_nom: str
    zone: Optional[str]
    telephone: Optional[str]
    raison: str

class RecommendationsResponse(BaseModel):
    count: int
    semaine: int
    annee: int
    recommandations: List[RecommendationItem]

# ============ Endpoints ============

@router.get("/alerts/inactive", response_model=InactiveAlertsResponse)
def list_inactive_alerts(
    annee: int = Query(2026, description="Année"),
    semaine: int = Query(52, description="Semaine (1-52)"),
    zone: Optional[str] = Query(None),
    superviseur: Optional[str] = Query(None),
    type_pdv: Optional[str] = Query(None),
    gestionnaire: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    GET /alerts/inactive - PDVs inactifs depuis le plus longtemps
    - Cherche les WeeklyPerformance(annee, semaine) avec est_actif=False
    - Si pas de données pour cette semaine, utilise la dernière semaine disponible
    - Pour chaque PDV inactif, calcule combien de semaines CONSÉCUTIVES il est inactif
    - Retourne liste triée par semaines_consecutives_inactif DESC
    """
    inactive_pdvs = get_inactive_pdvs_with_history(
        db,
        annee=annee,
        semaine=semaine,
        zone=zone,
        superviseur=superviseur,
        type_pdv=type_pdv,
        gestionnaire=gestionnaire
    )
    
    return {
        "count": len(inactive_pdvs),
        "semaine": semaine,
        "annee": annee,
        "pdvs": inactive_pdvs
    }

@router.get("/alerts/declining", response_model=DecliningAlertsResponse)
def list_declining_alerts(
    annee: int = Query(2026, description="Année"),
    semaine: int = Query(52, description="Semaine (1-52)"),
    seuil: float = Query(15.0, description="Seuil de baisse (%)"),
    zone: Optional[str] = Query(None),
    superviseur: Optional[str] = Query(None),
    type_pdv: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    GET /alerts/declining - PDVs avec baisse de CA significative
    - Cherche WeeklyPerformance(annee, semaine) avec taux_variation < -seuil
    - Pour chaque PDV, récupère historique 4 semaines
    - Calcule score_risque et type_baisse (ANORMALE si > 30% ou 3 sem consécutives)
    - Retourne liste triée par taux_variation ASC (plus grandes baisses en premier)
    """
    declining_pdvs = get_declining_pdvs_with_risk(
        db,
        annee=annee,
        semaine=semaine,
        seuil=seuil,
        zone=zone,
        superviseur=superviseur,
        type_pdv=type_pdv
    )
    
    return {
        "count": len(declining_pdvs),
        "seuil": seuil,
        "pdvs": declining_pdvs
    }

@router.get("/alerts/recovery", response_model=RecoveryAlertsResponse)
def list_recovery_alerts(db: Session = Depends(get_db)):
    """
    GET /alerts/recovery - PDVs en processus de récupération
    - PDVs avec statut RECUPERATION dans la DB
    - Pour chaque, calcule CA des 3 derniers mois depuis MonthlyPerformance
    - Retourne synthèse (a_recuperer, recuperees, redeployees, taux_recuperation)
    """
    # Get all recoveries
    recoveries = db.query(Recovery).filter(
        Recovery.statut != RecoveryStatut.ABANDONNE
    ).all()
    
    recovery_pdvs = []
    stats = {"a_recuperer": 0, "recuperees": 0, "redeployees": 0}
    
    for recovery in recoveries:
        pdv = db.query(PDV).filter(PDV.id == recovery.pdv_id).first()
        if not pdv:
            continue
        
        # Calculer CA des 3 derniers mois
        three_months_ago = datetime.utcnow() - timedelta(days=90)
        monthly_perfs = db.query(MonthlyPerformance).filter(
            and_(
                MonthlyPerformance.pdv_id == pdv.id,
                MonthlyPerformance.created_at >= three_months_ago
            )
        ).all()
        
        ca_3mois = sum(p.ca for p in monthly_perfs)
        
        # Compter statuts
        if recovery.statut == RecoveryStatut.IDENTIFIE:
            stats["a_recuperer"] += 1
        elif recovery.statut == RecoveryStatut.SIM_RECUPEREE:
            stats["recuperees"] += 1
        elif recovery.statut == RecoveryStatut.REDEPLOYE:
            stats["redeployees"] += 1
        
        recovery_pdvs.append({
            "id": recovery.id,
            "pdv_id": pdv.id,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "statut": recovery.statut.value,
            "ca_3mois": ca_3mois,
            "date_identification": recovery.date_identification,
            "date_contact": recovery.date_contact,
            "date_recuperation_sim": recovery.date_recuperation_sim,
            "date_redeploiement": recovery.date_redeploiement,
            "superviseur_responsable": recovery.superviseur_responsable,
            "notes": recovery.notes,
            "sim_recuperee": recovery.date_recuperation_sim is not None,
            "numero_flotte": pdv.numero_flotte,
            "sim_au_bureau": pdv.sim_au_bureau,
            "sim_coupee": pdv.sim_coupee,
            "nouvelle_creation": pdv.nouvelle_creation
        })
    
    total = len(recovery_pdvs)
    taux_recuperation = (stats["recuperees"] / total * 100) if total > 0 else 0.0
    
    return {
        "count": total,
        "synthese": {
            "a_recuperer": stats["a_recuperer"],
            "recuperees": stats["recuperees"],
            "redeployees": stats["redeployees"],
            "taux_recuperation": taux_recuperation
        },
        "pdvs": recovery_pdvs
    }

@router.post("/alerts/recovery/update", status_code=status.HTTP_200_OK)
def update_recovery(
    update_data: RecoveryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    POST /alerts/recovery/update - Mettre à jour le statut d'une récupération
    """
    recovery = db.query(Recovery).filter(
        Recovery.id == update_data.recovery_id
    ).first()
    
    if not recovery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recovery not found"
        )
    
    recovery.statut = RecoveryStatut(update_data.statut)
    recovery.notes = update_data.notes or recovery.notes
    recovery.superviseur_responsable = update_data.superviseur_responsable or recovery.superviseur_responsable
    recovery.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(recovery)
    
    return {"status": "updated", "recovery_id": recovery.id}

@router.get("/alerts/recovery/synthese")
def get_recovery_synthese(db: Session = Depends(get_db)):
    """
    GET /alerts/recovery/synthese - Synthèse mensuelle complète des récupérations
    """
    recoveries = db.query(Recovery).all()
    
    stats = {
        "a_recuperer": 0,
        "recuperees": 0,
        "redeployees": 0,
        "abandonnees": 0,
        "total": len(recoveries)
    }
    
    for recovery in recoveries:
        if recovery.statut == RecoveryStatut.IDENTIFIE:
            stats["a_recuperer"] += 1
        elif recovery.statut == RecoveryStatut.SIM_RECUPEREE:
            stats["recuperees"] += 1
        elif recovery.statut == RecoveryStatut.REDEPLOYE:
            stats["redeployees"] += 1
        elif recovery.statut == RecoveryStatut.ABANDONNE:
            stats["abandonnees"] += 1
    
    stats["taux_recuperation"] = (stats["recuperees"] / stats["total"] * 100) if stats["total"] > 0 else 0.0
    stats["taux_redeploiement"] = (stats["redeployees"] / stats["total"] * 100) if stats["total"] > 0 else 0.0
    
    return stats

@router.post("/alerts/actions", response_model=TerrainActionResponse, status_code=status.HTTP_201_CREATED)
def create_terrain_action(
    action_data: TerrainActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    POST /alerts/actions - Créer une action terrain
    type_action: APPEL|VISITE_TERRAIN|MESSAGE_WHATSAPP|AUTRE
    resultat: RECONTACTE|REACTIVE|A_RECUPERER|NON_JOIGNABLE|EN_ATTENTE
    """
    pdv = db.query(PDV).filter(PDV.id == action_data.pdv_id).first()
    if not pdv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDV not found"
        )
    
    action = TerrainAction(
        pdv_id=action_data.pdv_id,
        user_id=current_user.id,
        type_action=ActionType(action_data.type_action),
        resultat=ActionResultat(action_data.resultat),
        notes=action_data.notes
    )
    
    db.add(action)
    db.commit()
    db.refresh(action)
    
    return {
        "id": action.id,
        "pdv_id": action.pdv_id,
        "type_action": action.type_action.value,
        "resultat": action.resultat.value,
        "notes": action.notes,
        "date_action": action.date_action,
        "created_at": action.created_at,
        "user_nom": current_user.nom
    }

@router.get("/alerts/actions/{pdv_id}", response_model=List[TerrainActionResponse])
def get_pdv_actions(pdv_id: int, db: Session = Depends(get_db)):
    """
    GET /alerts/actions/{pdv_id} - Historique des actions terrain pour un PDV
    """
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDV not found"
        )
    
    actions = db.query(TerrainAction).filter(
        TerrainAction.pdv_id == pdv_id
    ).order_by(desc(TerrainAction.date_action)).all()
    
    return [
        {
            "id": a.id,
            "pdv_id": a.pdv_id,
            "type_action": a.type_action.value,
            "resultat": a.resultat.value,
            "notes": a.notes,
            "date_action": a.date_action,
            "created_at": a.created_at,
            "user_nom": a.user.nom if a.user else None
        }
        for a in actions
    ]

@router.get("/alerts/recovery/liste")
def get_recovery_liste(
    db: Session = Depends(get_db),
    seuil: float = Query(5000000, description="Seuil CA récupération en FCFA"),
    annee: int = Query(None),
    mois: int = Query(None),
):
    """
    Liste des PDV à récupérer : PDV dont la somme du CA du mois en cours
    et du mois précédent est inférieure au seuil (défaut 5 000 000 FCFA).
    Le mois en cours est le mois de traitement (fourni ou déduit de la date du jour).
    """
    from datetime import date
    from sqlalchemy import func

    today = date.today()

    from app.models.performance import MonthlyPerformance

    MOIS_NOMS = {
        1: 'Janvier', 2: 'Février', 3: 'Mars', 4: 'Avril',
        5: 'Mai', 6: 'Juin', 7: 'Juillet', 8: 'Août',
        9: 'Septembre', 10: 'Octobre', 11: 'Novembre', 12: 'Décembre'
    }

    # Mois de traitement = dernier mois disponible en base
    if mois is None or annee is None:
        last = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois)\
                 .order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc())\
                 .first()
        if last:
            mois_courant, annee_courante = last.mois, last.annee
        else:
            mois_courant = today.month
            annee_courante = today.year
    else:
        mois_courant = mois
        annee_courante = annee

    # Mois précédent
    if mois_courant == 1:
        mois_prec = 12
        annee_prec = annee_courante - 1
    else:
        mois_prec = mois_courant - 1
        annee_prec = annee_courante

    perfs_courant = {
        p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
            MonthlyPerformance.annee == annee_courante,
            MonthlyPerformance.mois == mois_courant
        ).all()
    }
    perfs_prec = {
        p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
            MonthlyPerformance.annee == annee_prec,
            MonthlyPerformance.mois == mois_prec
        ).all()
    }

    from datetime import timedelta
    from app.models.action import TerrainAction
    date_limite_activation = today - timedelta(days=31)

    # PDVs actifs (non désactivés)
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()

    liste = []
    exclusions = {"au_bureau": 0, "activation_recente": 0, "nouvelle_creation": 0, "inactif_zero_ops": 0, "flotte": 0}
    exclusions_detail = {"au_bureau": [], "activation_recente": [], "nouvelle_creation": [], "inactif_zero_ops": [], "flotte": []}

    def pdv_mini(pdv, ca_prec=0, ca_courant=0):
        return {
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "zone": pdv.zone,
            "sous_zone": pdv.sous_zone,
            "type_pdv": pdv.type_pdv.value if pdv.type_pdv else None,
            "telephone": pdv.telephone,
            "date_activation": pdv.date_activation.isoformat() if pdv.date_activation else None,
            "ca_mois_precedent": round(ca_prec, 2),
            "ca_mois_courant": round(ca_courant, 2),
            "ca_total": round(ca_prec + ca_courant, 2),
        }

    for pdv in pdvs:
        # Récupérer les montants de transactions pour CE PDV (pour toutes les exclusions)
        pc = perfs_courant.get(pdv.id)
        pp = perfs_prec.get(pdv.id)
        mt_c = pc.montant_transaction if pc else 0.0
        mt_p = pp.montant_transaction if pp else 0.0

        # ── EXCLUSION 1 : superviseur AU BUREAU
        if pdv.superviseur and 'AU BUREAU' in pdv.superviseur.upper():
            exclusions["au_bureau"] += 1
            exclusions_detail["au_bureau"].append(pdv_mini(pdv, mt_p, mt_c))
            continue

        # ── EXCLUSION 2 : activation récente (< 1 mois)
        if pdv.date_activation and pdv.date_activation.date() >= date_limite_activation:
            exclusions["activation_recente"] += 1
            exclusions_detail["activation_recente"].append(pdv_mini(pdv, mt_p, mt_c))
            continue

        # ── EXCLUSION 3 : nouvelle création (flag explicite)
        if pdv.nouvelle_creation:
            exclusions["nouvelle_creation"] += 1
            exclusions_detail["nouvelle_creation"].append(pdv_mini(pdv, mt_p, mt_c))
            continue

        # ── EXCLUSION 4 : PDV FLOTTE (numéro de flotte)
        if pdv.numero_flotte:
            exclusions["flotte"] += 1
            exclusions_detail["flotte"].append(pdv_mini(pdv, mt_p, mt_c))
            continue

        # Critère : somme du MONTANT DES TRANSACTIONS des 2 mois
        # montant_transaction = volume réel d'argent brassé (CASHIN + CASHOUT)
        mt_courant = pc.montant_transaction if pc else 0.0
        mt_prec    = pp.montant_transaction if pp else 0.0
        mt_total   = mt_courant + mt_prec   # Somme 2 mois comparée au seuil

        # On garde aussi le CA pour affichage info
        ca_courant = pc.ca if pc else 0.0
        ca_prec    = pp.ca if pp else 0.0

        nb_ops_courant = pc.nb_operations if pc else 0
        nb_ops_prec    = pp.nb_operations if pp else 0
        nb_ops_total   = nb_ops_courant + nb_ops_prec

        # ── EXCLUSION 4 : 0 opérations sur les 2 mois (= inactifs purs)
        if nb_ops_total == 0:
            exclusions["inactif_zero_ops"] += 1
            exclusions_detail["inactif_zero_ops"].append(pdv_mini(pdv, mt_prec, mt_courant))
            continue

        # PDV à récupérer : montant transactions cumulé des 2 mois < seuil
        if mt_total < seuil:
            actions = db.query(TerrainAction).filter(TerrainAction.pdv_id == pdv.id).order_by(
                TerrainAction.date_action.desc()
            ).first()

            deja_en_recuperation = pdv.statut == PDVStatut.RECUPERATION
            mois_recuperation_precedent = None
            if actions:
                mois_recuperation_precedent = MOIS_NOMS.get(actions.date_action.month, '') + ' ' + str(actions.date_action.year)

            liste.append({
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "superviseur": pdv.superviseur,
                "gestionnaire": pdv.gestionnaire,
                "teleconseillere": pdv.teleconseillere,
                "zone": pdv.zone,
                "sous_zone": pdv.sous_zone,
                "type_pdv": pdv.type_pdv.value if pdv.type_pdv else None,
                "statut": pdv.statut.value if pdv.statut else None,
                "telephone": pdv.telephone,
                "date_activation": pdv.date_activation.isoformat() if pdv.date_activation else None,
                "numero_flotte": pdv.numero_flotte,
                "nouvelle_creation": pdv.nouvelle_creation,
                "ca_mois_courant":   round(mt_courant, 2),
                "ca_mois_precedent": round(mt_prec, 2),
                "ca_total":          round(mt_total, 2),
                "nb_operations_courant": nb_ops_courant,
                "nb_operations_prec":    nb_ops_prec,
                "deja_en_recuperation":  deja_en_recuperation,
                "mois_recuperation_precedent": mois_recuperation_precedent,
            })

    # Trier par montant total croissant (les plus critiques en premier)
    liste.sort(key=lambda x: x["ca_total"])

    return {
        "mois_courant": mois_courant,
        "annee_courante": annee_courante,
        "mois_courant_nom": MOIS_NOMS[mois_courant],
        "mois_precedent_nom": MOIS_NOMS[mois_prec],
        "annee_precedente": annee_prec,
        "seuil": seuil,
        "total": len(liste),
        "liste": liste,
        "exclusions": exclusions,
        "exclusions_detail": exclusions_detail,
    }


@router.get("/alerts/recovery/tracking")
def get_recovery_tracking(
    mois: int = Query(None),
    annee: int = Query(None),
    db: Session = Depends(get_db),
):
    """Retourne tous les statuts de suivi pour un mois donné (ou le dernier mois dispo)."""
    from app.models.recovery_tracking import RecoveryTracking
    from app.models.performance import MonthlyPerformance

    if mois is None or annee is None:
        last = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois)\
                 .order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).first()
        mois = last.mois if last else 3
        annee = last.annee if last else 2026

    trackings = db.query(RecoveryTracking).filter(
        RecoveryTracking.mois == mois,
        RecoveryTracking.annee == annee,
    ).all()

    return {
        "mois": mois, "annee": annee,
        "total": len(trackings),
        "trackings": [
            {
                "id": t.id,
                "pdv_id": t.pdv_id,
                "statut": t.statut.value,
                "commentaire": t.commentaire,
                "date_contact": t.date_contact.isoformat() if t.date_contact else None,
                "date_sim_recuperee": t.date_sim_recuperee.isoformat() if t.date_sim_recuperee else None,
                "date_redeploye": t.date_redeploye.isoformat() if t.date_redeploye else None,
                "nouveau_titulaire": t.nouveau_titulaire,
                "nouveau_telephone": t.nouveau_telephone,
                "updated_by": t.updated_by,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
                "ca_mois_courant": t.ca_mois_courant,
                "ca_mois_precedent": t.ca_mois_precedent,
                "ca_total": t.ca_total,
            }
            for t in trackings
        ],
        "stats": {
            "IDENTIFIE":     sum(1 for t in trackings if t.statut.value == "IDENTIFIE"),
            "CONTACTE":      sum(1 for t in trackings if t.statut.value == "CONTACTE"),
            "SIM_RECUPEREE": sum(1 for t in trackings if t.statut.value == "SIM_RECUPEREE"),
            "REDEPLOYE":     sum(1 for t in trackings if t.statut.value == "REDEPLOYE"),
        }
    }


@router.post("/alerts/recovery/tracking/init")
def init_recovery_tracking(
    mois: int = Query(None),
    annee: int = Query(None),
    seuil: float = Query(5000000),
    db: Session = Depends(get_db),
):
    """
    Initialise le tracking du mois : crée une entrée IDENTIFIE pour chaque PDV
    de la liste de récupération qui n'a pas encore de suivi ce mois.
    """
    from app.models.recovery_tracking import RecoveryTracking, RecoveryStatut
    from app.models.performance import MonthlyPerformance
    from datetime import timedelta, date

    today = date.today()
    if mois is None or annee is None:
        last = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois)\
                 .order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).first()
        mois = last.mois if last else 3
        annee = last.annee if last else 2026

    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    perfs_courant = {p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois).all()}
    perfs_prec = {p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee_prec, MonthlyPerformance.mois == mois_prec).all()}

    # PDVs déjà trackés ce mois
    deja = set(t.pdv_id for t in db.query(RecoveryTracking.pdv_id).filter(
        RecoveryTracking.mois == mois, RecoveryTracking.annee == annee).all())

    date_limite = today - timedelta(days=31)
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()

    created = 0
    for pdv in pdvs:
        if pdv.id in deja: continue
        if pdv.superviseur and 'AU BUREAU' in pdv.superviseur.upper(): continue
        if pdv.date_activation and pdv.date_activation.date() >= date_limite: continue
        if pdv.nouvelle_creation: continue

        pc = perfs_courant.get(pdv.id)
        pp = perfs_prec.get(pdv.id)
        ca_c = pc.ca if pc else 0.0
        ca_p = pp.ca if pp else 0.0
        nb_ops = (pc.nb_operations if pc else 0) + (pp.nb_operations if pp else 0)

        if nb_ops == 0: continue
        if ca_c + ca_p >= seuil: continue

        db.add(RecoveryTracking(
            pdv_id=pdv.id, mois=mois, annee=annee,
            statut=RecoveryStatut.IDENTIFIE,
            ca_mois_courant=round(ca_c, 2),
            ca_mois_precedent=round(ca_p, 2),
            ca_total=round(ca_c + ca_p, 2),
        ))
        created += 1

    db.commit()
    return {"message": f"{created} PDV initialisés dans le suivi", "created": created, "mois": mois, "annee": annee}


@router.put("/alerts/recovery/tracking/{tracking_id}")
def update_recovery_tracking(
    tracking_id: int,
    statut: str = Query(...),
    commentaire: str = Query(None),
    nouveau_titulaire: str = Query(None),
    nouveau_telephone: str = Query(None),
    updated_by: str = Query(None),
    db: Session = Depends(get_db),
):
    """Met à jour le statut d'un PDV dans le suivi de récupération."""
    from app.models.recovery_tracking import RecoveryTracking, RecoveryStatut
    from datetime import datetime

    t = db.query(RecoveryTracking).filter(RecoveryTracking.id == tracking_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Suivi non trouvé")

    try:
        t.statut = RecoveryStatut(statut)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Statut invalide: {statut}")

    now = datetime.utcnow()
    if statut == "CONTACTE" and not t.date_contact:
        t.date_contact = now
    elif statut == "SIM_RECUPEREE" and not t.date_sim_recuperee:
        t.date_sim_recuperee = now
    elif statut == "REDEPLOYE" and not t.date_redeploye:
        t.date_redeploye = now

    if commentaire is not None: t.commentaire = commentaire
    if nouveau_titulaire is not None: t.nouveau_titulaire = nouveau_titulaire
    if nouveau_telephone is not None: t.nouveau_telephone = nouveau_telephone
    if updated_by is not None: t.updated_by = updated_by
    t.updated_at = now

    db.commit()
    db.refresh(t)
    return {"message": "Statut mis à jour", "id": t.id, "statut": t.statut.value}


@router.post("/alerts/recovery/tracking/pdv/{pdv_id}")
def upsert_pdv_tracking(
    pdv_id: int,
    statut: str = Query(...),
    mois: int = Query(None),
    annee: int = Query(None),
    commentaire: str = Query(None),
    nouveau_titulaire: str = Query(None),
    nouveau_telephone: str = Query(None),
    updated_by: str = Query(None),
    db: Session = Depends(get_db),
):
    """Crée ou met à jour le suivi d'un PDV spécifique pour le mois donné."""
    from app.models.recovery_tracking import RecoveryTracking, RecoveryStatut
    from app.models.performance import MonthlyPerformance
    from datetime import datetime

    if mois is None or annee is None:
        last = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois)\
                 .order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).first()
        mois = last.mois if last else 3
        annee = last.annee if last else 2026

    t = db.query(RecoveryTracking).filter(
        RecoveryTracking.pdv_id == pdv_id,
        RecoveryTracking.mois == mois,
        RecoveryTracking.annee == annee,
    ).first()

    now = datetime.utcnow()

    if not t:
        t = RecoveryTracking(pdv_id=pdv_id, mois=mois, annee=annee)
        db.add(t)

    try:
        t.statut = RecoveryStatut(statut)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Statut invalide: {statut}")

    if statut == "CONTACTE" and not t.date_contact: t.date_contact = now
    elif statut == "SIM_RECUPEREE" and not t.date_sim_recuperee: t.date_sim_recuperee = now
    elif statut == "REDEPLOYE" and not t.date_redeploye: t.date_redeploye = now

    if commentaire is not None: t.commentaire = commentaire
    if nouveau_titulaire is not None: t.nouveau_titulaire = nouveau_titulaire
    if nouveau_telephone is not None: t.nouveau_telephone = nouveau_telephone
    if updated_by is not None: t.updated_by = updated_by
    t.updated_at = now

    db.commit()
    db.refresh(t)
    return {"message": "Suivi mis à jour", "id": t.id, "statut": t.statut.value, "pdv_id": pdv_id}


@router.get("/alerts/recommendations")
def get_recommendations(
    annee: Optional[int] = Query(None),
    semaine: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    GET /alerts/recommendations - 10 actions prioritaires de la semaine (Innovation 4 du CDC)
    - PDVs inactifs depuis le plus longtemps → appel urgent
    - PDVs en forte baisse → intervention
    - Zones avec problèmes groupés
    - Récupérations à lancer
    Si annee/semaine non fournis, utilise la dernière semaine disponible en base.
    """
    from app.models.performance import WeeklyPerformance
    from sqlalchemy import func as sqlfunc

    # Détecter automatiquement la dernière semaine disponible
    if annee is None or semaine is None:
        last = db.query(
            WeeklyPerformance.annee,
            WeeklyPerformance.semaine
        ).filter(WeeklyPerformance.est_actif == True).order_by(
            WeeklyPerformance.annee.desc(),
            WeeklyPerformance.semaine.desc()
        ).first()
        if last:
            annee = annee or last.annee
            semaine = semaine or last.semaine
        else:
            annee = annee or 2026
            semaine = semaine or 1

    recommendations = generate_weekly_recommendations(db, annee=annee, semaine=semaine)

    return {
        "count": len(recommendations),
        "semaine": semaine,
        "annee": annee,
        "recommandations": recommendations
    }
