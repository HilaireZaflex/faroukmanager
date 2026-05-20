"""Routes API pour la Gestion des Développeurs"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import datetime, date, timedelta
from app.core.database import get_db
from app.models.developpeur import DevTask, DevDailyGoal, DevPortfolio, SuperviseurPDVObjective, TaskType, TaskStatus, TaskPriority
from app.models.user import User, UserRole
from app.models.pdv import PDV
from app.models.prospect import Prospect, ProspectStatus
from app.models.performance import MonthlyPerformance

router = APIRouter()


# ── HELPERS ───────────────────────────────────────────────────────────────────
def get_devs(db: Session):
    return db.query(User).filter(User.role == UserRole.DEVELOPPEUR, User.is_active == True).all()

def get_superviseurs(db: Session):
    return db.query(User).filter(User.role == UserRole.SUPERVISEUR, User.is_active == True).all()


# ══════════════════════════════════════════════════════════════════════════════
# VUE D'ENSEMBLE DÉVELOPPEURS
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/developpeurs/overview")
def overview_developpeurs(
    period: str = Query("2026-05"),
    db: Session = Depends(get_db)
):
    devs = get_devs(db)
    annee, mois = int(period.split("-")[0]), int(period.split("-")[1])
    result = []

    for dev in devs:
        # Prospects soumis ce mois
        date_debut = datetime(annee, mois, 1)
        date_fin = datetime(annee, mois+1, 1) if mois < 12 else datetime(annee+1, 1, 1)

        prospects_soumis = db.query(Prospect).filter(
            Prospect.submitted_by_id == dev.id,
            Prospect.submitted_at >= date_debut,
            Prospect.submitted_at < date_fin
        ).count()

        prospects_actives = db.query(Prospect).filter(
            Prospect.submitted_by_id == dev.id,
            Prospect.status == ProspectStatus.PUCE_ACTIVEE,
            Prospect.activated_at >= date_debut,
            Prospect.activated_at < date_fin
        ).count()

        taux_activation = round(prospects_actives / max(prospects_soumis, 1) * 100, 1)

        # Objectifs du mois (source principale de données)
        goal = db.query(DevDailyGoal).filter(
            DevDailyGoal.developpeur_id == dev.id,
            func.strftime('%Y-%m', DevDailyGoal.date) == period,
            DevDailyGoal.period_type == "monthly"
        ).first()

        # Tâches ce mois (toutes périodes confondues pour la démo)
        taches = db.query(DevTask).filter(DevTask.developpeur_id == dev.id).all()
        visites = sum(1 for t in taches if t.type_tache == TaskType.VISITE and t.status == TaskStatus.TERMINE)
        activations_kaabu = sum(1 for t in taches if t.type_tache == TaskType.KAABU and t.status == TaskStatus.TERMINE)

        # Portefeuille
        portefeuille = db.query(DevPortfolio).filter(
            DevPortfolio.developpeur_id == dev.id,
            DevPortfolio.is_active == True
        ).count()

        # Utiliser les données des objectifs pour afficher des vrais chiffres
        real_activ = goal.realise_activations if goal else prospects_actives
        real_pros = goal.realise_prospects if goal else prospects_soumis
        real_vis = goal.realise_visites if goal else visites
        real_kaabu = goal.realise_kaabu if goal else activations_kaabu
        real_recup = goal.realise_recuperations if goal else 0

        taux_act = round(real_activ / max(goal.objectif_activations if goal else 10, 1) * 100, 1)
        taux_recuperation = round(real_recup / max(goal.objectif_recuperations if goal else 8, 1) * 100, 1)

        result.append({
            "id": dev.id,
            "nom": f"{dev.prenom} {dev.nom}",
            "email": dev.email,
            "zone": dev.zone or "Non assigné",
            "prospects_soumis": real_pros,
            "prospects_actives": real_activ,
            "taux_activation": taux_act,
            "visites_effectuees": real_vis,
            "activations_kaabu": real_kaabu,
            "portefeuille_pdvs": portefeuille,
            "recuperations": real_recup,
            "taux_recuperation": taux_recuperation,
            "objectif_activations": goal.objectif_activations if goal else 10,
            "objectif_prospects": goal.objectif_prospects if goal else 15,
            "objectif_visites": goal.objectif_visites if goal else 20,
            "taux_activation_cible": goal.taux_activation_cible if goal else 80.0,
            "taux_recuperation_cible": goal.taux_recuperation_cible if goal else 75.0,
            "bonus_estime": int(real_activ * (goal.bonus_activation if goal else 5000)),
        })

    return {
        "period": period,
        "nb_developpeurs": len(devs),
        "developpeurs": result,
        "totaux": {
            "total_prospects": sum(d["prospects_soumis"] for d in result),
            "total_actives": sum(d["prospects_actives"] for d in result),
            "total_visites": sum(d["visites_effectuees"] for d in result),
            "taux_activation_moyen": round(sum(d["taux_activation"] for d in result) / max(len(result), 1), 1),
            "taux_recuperation_moyen": round(sum(d["taux_recuperation"] for d in result) / max(len(result), 1), 1),
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# TÂCHES / ACTIONS
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/developpeurs/taches")
def get_taches(
    developpeur_id: Optional[int] = None,
    status: Optional[str] = None,
    type_tache: Optional[str] = None,
    zone: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(DevTask)
    if developpeur_id:
        q = q.filter(DevTask.developpeur_id == developpeur_id)
    if status:
        q = q.filter(DevTask.status == status)
    if type_tache:
        q = q.filter(DevTask.type_tache == type_tache)
    if zone:
        q = q.filter(DevTask.zone == zone)

    taches = q.order_by(DevTask.created_at.desc()).limit(200).all()

    result = []
    for t in taches:
        pdv_info = None
        if t.pdv_id:
            pdv = db.query(PDV).filter(PDV.id == t.pdv_id).first()
            if pdv:
                pdv_info = {"id": pdv.id, "nom": pdv.nom, "numero": pdv.numero_pdv, "zone": pdv.zone}

        result.append({
            "id": t.id,
            "developpeur_id": t.developpeur_id,
            "developpeur_nom": f"{t.developpeur.prenom} {t.developpeur.nom}" if t.developpeur else "—",
            "assigned_by": f"{t.assigned_by.prenom} {t.assigned_by.nom}" if t.assigned_by else "—",
            "pdv": pdv_info,
            "zone": t.zone,
            "type_tache": t.type_tache,
            "titre": t.titre,
            "description": t.description,
            "priorite": t.priorite,
            "status": t.status,
            "date_echeance": t.date_echeance.isoformat() if t.date_echeance else None,
            "date_fin": t.date_fin.isoformat() if t.date_fin else None,
            "notes_resultat": t.notes_resultat,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return {"taches": result, "total": len(result)}


@router.post("/developpeurs/taches")
def create_tache(body: dict, db: Session = Depends(get_db)):
    tache = DevTask(
        developpeur_id=body["developpeur_id"],
        assigned_by_id=body.get("assigned_by_id", 1),
        pdv_id=body.get("pdv_id"),
        zone=body.get("zone"),
        type_tache=body.get("type_tache", TaskType.VISITE),
        titre=body["titre"],
        description=body.get("description"),
        priorite=body.get("priorite", TaskPriority.NORMALE),
        status=TaskStatus.EN_ATTENTE,
        date_echeance=datetime.fromisoformat(body["date_echeance"]) if body.get("date_echeance") else None,
    )
    db.add(tache)
    db.commit()
    db.refresh(tache)
    return {"success": True, "id": tache.id}


@router.put("/developpeurs/taches/{tache_id}")
def update_tache(tache_id: int, body: dict, db: Session = Depends(get_db)):
    t = db.query(DevTask).filter(DevTask.id == tache_id).first()
    if not t:
        return {"error": "Tâche introuvable"}
    for k, v in body.items():
        if hasattr(t, k) and v is not None:
            setattr(t, k, v)
    if body.get("status") == "termine":
        t.date_fin = datetime.utcnow()
    db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════════════════════════════
# OBJECTIFS JOURNALIERS / MENSUELS
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/developpeurs/objectifs")
def get_objectifs(
    developpeur_id: Optional[int] = None,
    period: str = "2026-05",
    db: Session = Depends(get_db)
):
    q = db.query(DevDailyGoal).filter(
        func.strftime('%Y-%m', DevDailyGoal.date) == period
    )
    if developpeur_id:
        q = q.filter(DevDailyGoal.developpeur_id == developpeur_id)
    goals = q.all()

    result = []
    for g in goals:
        dev = db.query(User).filter(User.id == g.developpeur_id).first()
        pct_prospects = round(g.realise_prospects / max(g.objectif_prospects, 1) * 100, 1)
        pct_visites = round(g.realise_visites / max(g.objectif_visites, 1) * 100, 1)
        pct_activ = round(g.realise_activations / max(g.objectif_activations, 1) * 100, 1)
        pct_kaabu = round(g.realise_kaabu / max(g.objectif_kaabu, 1) * 100, 1)
        pct_recup = round(g.realise_recuperations / max(g.objectif_recuperations, 1) * 100, 1)
        global_pct = round((pct_prospects + pct_visites + pct_activ + pct_kaabu + pct_recup) / 5, 1)
        bonus_calcule = g.realise_activations * g.bonus_activation + (g.bonus_objectif_atteint if global_pct >= 100 else 0)

        result.append({
            "id": g.id,
            "developpeur_id": g.developpeur_id,
            "developpeur_nom": f"{dev.prenom} {dev.nom}" if dev else "—",
            "date": g.date.isoformat() if g.date else None,
            "period_type": g.period_type,
            "objectifs": {
                "prospects": g.objectif_prospects, "visites": g.objectif_visites,
                "activations": g.objectif_activations, "kaabu": g.objectif_kaabu,
                "recuperations": g.objectif_recuperations,
            },
            "realises": {
                "prospects": g.realise_prospects, "visites": g.realise_visites,
                "activations": g.realise_activations, "kaabu": g.realise_kaabu,
                "recuperations": g.realise_recuperations,
            },
            "taux": {
                "prospects": pct_prospects, "visites": pct_visites,
                "activations": pct_activ, "kaabu": pct_kaabu,
                "recuperations": pct_recup, "global": global_pct,
            },
            "taux_activation_cible": g.taux_activation_cible,
            "taux_recuperation_cible": g.taux_recuperation_cible,
            "bonus_activation": g.bonus_activation,
            "bonus_objectif_atteint": g.bonus_objectif_atteint,
            "bonus_calcule": bonus_calcule,
            "notes": g.notes,
        })

    return {"period": period, "objectifs": result, "total": len(result)}


@router.post("/developpeurs/objectifs")
def create_objectif(body: dict, db: Session = Depends(get_db)):
    date_obj = date.fromisoformat(body.get("date", date.today().isoformat()))
    g = DevDailyGoal(
        developpeur_id=body["developpeur_id"],
        created_by_id=body.get("created_by_id", 1),
        date=date_obj,
        period_type=body.get("period_type", "monthly"),
        objectif_prospects=body.get("objectif_prospects", 15),
        objectif_visites=body.get("objectif_visites", 20),
        objectif_activations=body.get("objectif_activations", 10),
        objectif_kaabu=body.get("objectif_kaabu", 5),
        objectif_recuperations=body.get("objectif_recuperations", 8),
        realise_prospects=body.get("realise_prospects", 0),
        realise_visites=body.get("realise_visites", 0),
        realise_activations=body.get("realise_activations", 0),
        realise_kaabu=body.get("realise_kaabu", 0),
        realise_recuperations=body.get("realise_recuperations", 0),
        taux_activation_cible=body.get("taux_activation_cible", 80.0),
        taux_recuperation_cible=body.get("taux_recuperation_cible", 75.0),
        bonus_activation=body.get("bonus_activation", 5000.0),
        bonus_objectif_atteint=body.get("bonus_objectif_atteint", 25000.0),
        notes=body.get("notes"),
    )
    db.add(g); db.commit(); db.refresh(g)
    return {"success": True, "id": g.id}


@router.put("/developpeurs/objectifs/{goal_id}")
def update_objectif(goal_id: int, body: dict, db: Session = Depends(get_db)):
    g = db.query(DevDailyGoal).filter(DevDailyGoal.id == goal_id).first()
    if not g:
        return {"error": "Objectif introuvable"}
    for k, v in body.items():
        if hasattr(g, k) and v is not None:
            setattr(g, k, v)
    db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════════════════════════════
# PORTEFEUILLE PDV
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/developpeurs/portefeuille")
def get_portefeuille(
    developpeur_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(DevPortfolio).filter(DevPortfolio.is_active == True)
    if developpeur_id:
        q = q.filter(DevPortfolio.developpeur_id == developpeur_id)
    items = q.all()

    result = []
    for item in items:
        pdv = db.query(PDV).filter(PDV.id == item.pdv_id).first()
        dev = db.query(User).filter(User.id == item.developpeur_id).first()
        result.append({
            "id": item.id,
            "developpeur_id": item.developpeur_id,
            "developpeur_nom": f"{dev.prenom} {dev.nom}" if dev else "—",
            "pdv_id": item.pdv_id,
            "pdv_nom": pdv.nom if pdv else "—",
            "pdv_numero": pdv.numero_pdv if pdv else "—",
            "pdv_zone": pdv.zone if pdv else "—",
            "pdv_grade": pdv.grade if pdv else "—",
            "assigned_at": item.assigned_at.isoformat() if item.assigned_at else None,
            "last_recovery_date": item.last_recovery_date.isoformat() if item.last_recovery_date else None,
            "recovery_count": item.recovery_count,
            "total_recovered_fcfa": item.total_recovered_fcfa,
            "notes": item.notes,
        })

    return {"portefeuille": result, "total": len(result)}


@router.post("/developpeurs/portefeuille")
def add_to_portefeuille(body: dict, db: Session = Depends(get_db)):
    item = DevPortfolio(
        developpeur_id=body["developpeur_id"],
        pdv_id=body["pdv_id"],
        assigned_by_id=body.get("assigned_by_id", 1),
        notes=body.get("notes"),
    )
    db.add(item); db.commit(); db.refresh(item)
    return {"success": True, "id": item.id}


# ══════════════════════════════════════════════════════════════════════════════
# OBJECTIFS SUPERVISEURS (3 PDVs/mois)
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/developpeurs/superviseurs-pdv-objectifs")
def get_superviseurs_pdv_objectifs(
    period: str = "2026-05",
    db: Session = Depends(get_db)
):
    superviseurs = get_superviseurs(db)
    result = []

    annee, mois = int(period.split("-")[0]), int(period.split("-")[1])
    date_debut = datetime(annee, mois, 1)
    date_fin = datetime(annee, mois+1, 1) if mois < 12 else datetime(annee+1, 1, 1)

    for sup in superviseurs:
        obj = db.query(SuperviseurPDVObjective).filter(
            SuperviseurPDVObjective.superviseur_id == sup.id,
            SuperviseurPDVObjective.period_key == period
        ).first()

        # Compter les PDVs réellement remontés via prospection
        pdvs_remontes = db.query(Prospect).filter(
            Prospect.submitted_by_id == sup.id,
            Prospect.status.in_([ProspectStatus.PUCE_ACTIVEE, ProspectStatus.APPROUVEE_RC, ProspectStatus.PUCE_ATTRIBUEE]),
            Prospect.submitted_at >= date_debut,
            Prospect.submitted_at < date_fin
        ).all()

        nb_remontes = len(pdvs_remontes)
        objectif = obj.objectif_pdvs if obj else 3
        taux = round(nb_remontes / max(objectif, 1) * 100, 1)
        statut = "✅ Atteint" if nb_remontes >= objectif else ("⚠️ En cours" if nb_remontes >= objectif * 0.5 else "❌ Insuffisant")

        result.append({
            "superviseur_id": sup.id,
            "superviseur_nom": f"{sup.prenom} {sup.nom}",
            "zone": sup.zone or "—",
            "objectif_pdvs": objectif,
            "nb_remontes": nb_remontes,
            "taux_completion": taux,
            "statut": statut,
            "pdvs_details": [{"reference": p.reference, "nom": f"{p.prenom} {p.nom}", "status": p.status, "date": p.submitted_at.isoformat() if p.submitted_at else None} for p in pdvs_remontes[:5]],
        })

    result.sort(key=lambda x: x["nb_remontes"], reverse=True)

    return {
        "period": period,
        "superviseurs": result,
        "summary": {
            "total_superviseurs": len(result),
            "objectif_atteint": sum(1 for r in result if r["nb_remontes"] >= r["objectif_pdvs"]),
            "total_pdvs_remontes": sum(r["nb_remontes"] for r in result),
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# CONFIG TAUX (modifiable par admin)
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/developpeurs/config")
def get_config(db: Session = Depends(get_db)):
    return {
        "taux_activation_cible": 80.0,
        "taux_recuperation_cible": 75.0,
        "bonus_par_activation": 5000,
        "bonus_objectif_atteint": 25000,
        "objectif_pdvs_superviseur": 3,
    }


@router.get("/developpeurs/zones")
def get_zones(db: Session = Depends(get_db)):
    zones = db.query(PDV.zone).distinct().filter(PDV.zone != None).all()
    return {"zones": [z[0] for z in zones if z[0]]}


@router.get("/developpeurs/pdvs-disponibles")
def get_pdvs_disponibles(zone: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(PDV).filter(PDV.statut == "actif")
    if zone:
        q = q.filter(PDV.zone == zone)
    pdvs = q.limit(100).all()
    return {"pdvs": [{"id": p.id, "nom": p.nom, "numero": p.numero_pdv, "zone": p.zone, "grade": p.grade} for p in pdvs]}
