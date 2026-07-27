"""
Routes API — Module Orange Awards 2026
Challenge TELCO + Orange Money
Période : 1er Juillet → 31 Octobre 2026
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_
from datetime import datetime, date
from typing import Optional, List
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.challenge import (
    ChallengeObjectif, ChallengeRecrutement,
    ChallengePLV, ChallengePointControle
)
from app.models.pdv import PDV

router = APIRouter(prefix="/challenge", tags=["challenge"])

# ── Constantes Challenge ──────────────────────────────────────────────────────
CHALLENGE_START = date(2026, 7, 1)
CHALLENGE_END   = date(2026, 10, 31)
MOIS_CHALLENGE  = ["2026-07", "2026-08", "2026-09", "2026-10"]

# Objectifs mensuels Farouk Distribution (depuis le tableau officiel)
OBJECTIFS_MENSUELS = {
    "2026-07": {
        "creation_points_controles": 10,
        "deploiement_plv": 25,
        "orange_nrj": 7,
        "recrutement_omy": 250,
        "ventes_terminaux": 25,
    },
    "2026-08": {
        "creation_points_controles": 5,
        "deploiement_plv": 25,
        "orange_nrj": 7,
        "recrutement_omy": 250,
        "ventes_terminaux": 25,
    },
    "2026-09": {
        "creation_points_controles": 5,
        "deploiement_plv": 25,
        "orange_nrj": 7,
        "recrutement_omy": 250,
        "ventes_terminaux": 25,
    },
    "2026-10": {
        "creation_points_controles": 5,
        "deploiement_plv": 25,
        "orange_nrj": 7,
        "recrutement_omy": 250,
        "ventes_terminaux": 25,
    },
}

# Totaux période complète
OBJECTIFS_PERIODE = {
    "creation_points_controles": 25,
    "deploiement_plv": 100,
    "orange_nrj": 28,
    "recrutement_omy": 1000,
    "ventes_terminaux": 100,
    "pdv_actif_pct": 90,  # % PDVs actifs
    "adoption_kaabu_transactions": 40,  # transactions/PDV sur période
    "fintech_pct_max": 2,  # taux pénétration fintech < 2%
}

def get_mois_actuel():
    """Retourne le mois actuel au format YYYY-MM."""
    return datetime.utcnow().strftime("%Y-%m")

def get_mois_challenge_ecoules():
    """Retourne les mois du challenge déjà écoulés."""
    mois_actuel = get_mois_actuel()
    return [m for m in MOIS_CHALLENGE if m <= mois_actuel]

def calc_taux(realise, objectif):
    """Calcule le taux d'atteinte en %."""
    if not objectif or objectif == 0:
        return 0
    return round(min((realise / objectif) * 100, 999), 1)

def calc_score_critere(taux, poids):
    """Calcule le score d'un critère (0 à poids si taux >= 95%)."""
    if taux >= 95:
        return poids
    elif taux >= 70:
        return round((taux / 95) * poids, 2)
    else:
        return round((taux / 95) * poids * 0.5, 2)


# ── GET /challenge/dashboard ──────────────────────────────────────────────────
@router.get("/dashboard")
def get_challenge_dashboard(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Tableau de bord principal du challenge Orange Awards 2026."""
    today = date.today()
    jours_restants = max(0, (CHALLENGE_END - today).days)
    jours_ecoules = max(0, (today - CHALLENGE_START).days)
    jours_total = (CHALLENGE_END - CHALLENGE_START).days
    avancement_periode = round((jours_ecoules / jours_total) * 100, 1) if jours_total > 0 else 0
    mois_ecoules = get_mois_challenge_ecoules()

    # ── KPIs réalisés depuis la base ────────────────────────────────────────
    # Recrutement OMY
    total_recrutes = db.query(func.count(ChallengeRecrutement.id)).filter(
        ChallengeRecrutement.mois.in_(mois_ecoules)
    ).scalar() or 0

    # PLV déployées
    total_plv = db.query(func.sum(ChallengePLV.quantite)).filter(
        ChallengePLV.mois.in_(mois_ecoules),
        ChallengePLV.valide == True
    ).scalar() or 0

    # Points contrôlés créés
    total_points = db.query(func.count(ChallengePointControle.id)).filter(
        ChallengePointControle.mois.in_(mois_ecoules)
    ).scalar() or 0

    # PDVs actifs (depuis la table PDV directement)
    total_pdvs = db.query(func.count(PDV.id)).filter(PDV.statut == "ACTIF").scalar() or 1
    # On considère 85% des PDVs actifs par défaut (à affiner avec vraies données)
    pdvs_actifs = total_pdvs
    taux_pdv_actif = 85.0  # Valeur par défaut — à mettre à jour manuellement

    # Objectifs cumulés pour les mois écoulés
    nb_mois = len(mois_ecoules) if mois_ecoules else 1
    obj_recrutes = 250 * nb_mois
    obj_plv = 25 * nb_mois
    obj_points = sum(OBJECTIFS_MENSUELS.get(m, {}).get("creation_points_controles", 5) for m in mois_ecoules) if mois_ecoules else 25
    obj_terminaux = 25 * nb_mois

    # Taux d'atteinte
    taux_recrutes = calc_taux(total_recrutes, obj_recrutes)
    taux_plv = calc_taux(total_plv, obj_plv)
    taux_points = calc_taux(total_points, obj_points)

    # Score OM
    score_om = 0
    score_om += calc_score_critere(taux_pdv_actif, 10)      # PDV actif (10%)
    score_om += calc_score_critere(taux_recrutes, 15)        # Recrutement (15%)
    score_om += calc_score_critere(taux_plv, 15)             # PLV (15%)

    # Score TELCO
    score_telco = 0
    score_telco += calc_score_critere(taux_points, 15)       # Points contrôlés (15%)
    score_telco += calc_score_critere(taux_plv, 15)          # PLV/Note DZ (15%)

    return {
        "periode": {
            "debut": CHALLENGE_START.isoformat(),
            "fin": CHALLENGE_END.isoformat(),
            "jours_restants": jours_restants,
            "jours_ecoules": jours_ecoules,
            "avancement_pct": avancement_periode,
            "mois_ecoules": mois_ecoules,
        },
        "kpis": {
            "recrutement_omy": {
                "realise": total_recrutes,
                "objectif_cumule": obj_recrutes,
                "objectif_periode": OBJECTIFS_PERIODE["recrutement_omy"],
                "taux": taux_recrutes,
                "par_mois": 250,
            },
            "deploiement_plv": {
                "realise": int(total_plv),
                "objectif_cumule": obj_plv,
                "objectif_periode": OBJECTIFS_PERIODE["deploiement_plv"],
                "taux": taux_plv,
                "par_mois": 25,
            },
            "points_controles": {
                "realise": total_points,
                "objectif_cumule": obj_points,
                "objectif_periode": OBJECTIFS_PERIODE["creation_points_controles"],
                "taux": taux_points,
                "par_mois_restant": 5,
            },
            "pdv_actifs": {
                "realise": pdvs_actifs,
                "total_pdvs": total_pdvs,
                "taux": taux_pdv_actif,
                "objectif_pct": 90,
            },
        },
        "scores": {
            "om": round(score_om, 1),
            "telco": round(score_telco, 1),
            "global": round((score_om + score_telco) / 2, 1),
        },
        "objectifs_mensuels": OBJECTIFS_MENSUELS,
    }


# ── GET /challenge/objectifs/{mois} ──────────────────────────────────────────
@router.get("/objectifs/{mois}")
def get_objectifs_mois(mois: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Objectifs et réalisés pour un mois donné (format YYYY-MM)."""
    if mois not in MOIS_CHALLENGE:
        raise HTTPException(status_code=400, detail=f"Mois hors période challenge. Mois valides: {MOIS_CHALLENGE}")

    obj = OBJECTIFS_MENSUELS.get(mois, {})

    recrutes = db.query(func.count(ChallengeRecrutement.id)).filter(ChallengeRecrutement.mois == mois).scalar() or 0
    plv = db.query(func.sum(ChallengePLV.quantite)).filter(ChallengePLV.mois == mois, ChallengePLV.valide == True).scalar() or 0
    points = db.query(func.count(ChallengePointControle.id)).filter(ChallengePointControle.mois == mois).scalar() or 0

    return {
        "mois": mois,
        "kpis": [
            {"kpi": "Recrutement OMY", "objectif": obj.get("recrutement_omy", 250), "realise": recrutes, "taux": calc_taux(recrutes, obj.get("recrutement_omy", 250)), "unite": "clients", "poids_om": 15},
            {"kpi": "Déploiement PLV", "objectif": obj.get("deploiement_plv", 25), "realise": int(plv), "taux": calc_taux(plv, obj.get("deploiement_plv", 25)), "unite": "PLV", "poids_om": 15, "poids_telco": 15},
            {"kpi": "Points Contrôlés", "objectif": obj.get("creation_points_controles", 5), "realise": points, "taux": calc_taux(points, obj.get("creation_points_controles", 5)), "unite": "points", "poids_telco": 15},
            {"kpi": "Ventes Terminaux", "objectif": obj.get("ventes_terminaux", 25), "realise": 0, "taux": 0, "unite": "terminaux", "poids_telco": 15},
            {"kpi": "Orange NRJ", "objectif": obj.get("orange_nrj", 7), "realise": 0, "taux": 0, "unite": "kits", "poids_telco": 15},
        ]
    }


# ── POST /challenge/recrutements ──────────────────────────────────────────────
@router.post("/recrutements")
def ajouter_recrutement(data: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Enregistrer un nouveau recrutement Orange Money."""
    mois = data.get("mois", get_mois_actuel())
    rec = ChallengeRecrutement(
        numero_client=data.get("numero_client"),
        nom_client=data.get("nom_client"),
        pdv_numero=data.get("pdv_numero"),
        pdv_nom=data.get("pdv_nom"),
        superviseur=data.get("superviseur"),
        developpeur=data.get("developpeur"),
        zone=data.get("zone"),
        mois=mois,
        est_actif=data.get("est_actif", True),
        notes=data.get("notes"),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"success": True, "id": rec.id, "mois": mois}


# ── GET /challenge/recrutements ───────────────────────────────────────────────
@router.get("/recrutements")
def list_recrutements(mois: Optional[str] = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Liste des recrutements OM avec stats par mois."""
    q = db.query(ChallengeRecrutement)
    if mois:
        q = q.filter(ChallengeRecrutement.mois == mois)
    else:
        q = q.filter(ChallengeRecrutement.mois.in_(MOIS_CHALLENGE))
    recs = q.order_by(ChallengeRecrutement.date_recrutement.desc()).all()

    # Stats par mois
    stats = {}
    for m in MOIS_CHALLENGE:
        cnt = db.query(func.count(ChallengeRecrutement.id)).filter(ChallengeRecrutement.mois == m).scalar() or 0
        obj = OBJECTIFS_MENSUELS.get(m, {}).get("recrutement_omy", 250)
        stats[m] = {"realise": cnt, "objectif": obj, "taux": calc_taux(cnt, obj)}

    return {
        "recrutements": [{"id": r.id, "numero_client": r.numero_client, "nom_client": r.nom_client,
                          "pdv_numero": r.pdv_numero, "pdv_nom": r.pdv_nom, "zone": r.zone,
                          "superviseur": r.superviseur, "developpeur": r.developpeur,
                          "mois": r.mois, "est_actif": r.est_actif,
                          "date_recrutement": r.date_recrutement.isoformat() if r.date_recrutement else None} for r in recs],
        "stats_par_mois": stats,
        "total": len(recs),
    }


# ── POST /challenge/plv ───────────────────────────────────────────────────────
@router.post("/plv")
def ajouter_plv(data: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Enregistrer un déploiement PLV."""
    mois = data.get("mois", get_mois_actuel())
    plv = ChallengePLV(
        pdv_numero=data.get("pdv_numero"),
        pdv_nom=data.get("pdv_nom"),
        zone=data.get("zone"),
        superviseur=data.get("superviseur"),
        type_plv=data.get("type_plv"),
        quantite=data.get("quantite", 1),
        mois=mois,
        photo_url=data.get("photo_url"),
        valide=data.get("valide", False),
        notes=data.get("notes"),
    )
    db.add(plv)
    db.commit()
    db.refresh(plv)
    return {"success": True, "id": plv.id}


# ── GET /challenge/plv ────────────────────────────────────────────────────────
@router.get("/plv")
def list_plv(mois: Optional[str] = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Liste des PLV déployées."""
    q = db.query(ChallengePLV)
    if mois:
        q = q.filter(ChallengePLV.mois == mois)
    else:
        q = q.filter(ChallengePLV.mois.in_(MOIS_CHALLENGE))
    plvs = q.order_by(ChallengePLV.date_deploiement.desc()).all()

    stats = {}
    for m in MOIS_CHALLENGE:
        cnt = db.query(func.sum(ChallengePLV.quantite)).filter(ChallengePLV.mois == m, ChallengePLV.valide == True).scalar() or 0
        obj = OBJECTIFS_MENSUELS.get(m, {}).get("deploiement_plv", 25)
        stats[m] = {"realise": int(cnt), "objectif": obj, "taux": calc_taux(cnt, obj)}

    return {
        "plv": [{"id": p.id, "pdv_numero": p.pdv_numero, "pdv_nom": p.pdv_nom,
                 "zone": p.zone, "superviseur": p.superviseur, "type_plv": p.type_plv,
                 "quantite": p.quantite, "mois": p.mois, "valide": p.valide,
                 "date_deploiement": p.date_deploiement.isoformat() if p.date_deploiement else None} for p in plvs],
        "stats_par_mois": stats,
        "total": sum(p.quantite for p in plvs if p.valide),
    }


# ── GET /challenge/classement ─────────────────────────────────────────────────
@router.get("/classement")
def get_classement(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Classement des superviseurs/développeurs selon leur contribution."""
    mois = MOIS_CHALLENGE

    # Classement recrutement par superviseur
    recruts = db.query(
        ChallengeRecrutement.superviseur,
        func.count(ChallengeRecrutement.id).label("total")
    ).filter(
        ChallengeRecrutement.mois.in_(mois),
        ChallengeRecrutement.superviseur != None
    ).group_by(ChallengeRecrutement.superviseur).order_by(func.count(ChallengeRecrutement.id).desc()).all()

    # Classement PLV par superviseur
    plvs = db.query(
        ChallengePLV.superviseur,
        func.sum(ChallengePLV.quantite).label("total")
    ).filter(
        ChallengePLV.mois.in_(mois),
        ChallengePLV.valide == True,
        ChallengePLV.superviseur != None
    ).group_by(ChallengePLV.superviseur).order_by(func.sum(ChallengePLV.quantite).desc()).all()

    return {
        "recrutement": [{"superviseur": r.superviseur, "total": r.total, "objectif_cumule": 250 * len(mois), "taux": calc_taux(r.total, 250 * len(mois))} for r in recruts],
        "plv": [{"superviseur": p.superviseur, "total": int(p.total or 0), "objectif_cumule": 25 * len(mois)} for p in plvs],
    }


# ── GET /challenge/alertes ────────────────────────────────────────────────────
@router.get("/alertes")
def get_alertes(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Alertes si un KPI est en dessous du seuil critique."""
    alertes = []
    mois_ecoules = get_mois_challenge_ecoules()
    if not mois_ecoules:
        return {"alertes": [], "nb_critiques": 0}

    nb_mois = len(mois_ecoules)

    # Recrutement
    recrutes = db.query(func.count(ChallengeRecrutement.id)).filter(ChallengeRecrutement.mois.in_(mois_ecoules)).scalar() or 0
    taux_r = calc_taux(recrutes, 250 * nb_mois)
    if taux_r < 95:
        manquant = int(250 * nb_mois - recrutes)
        alertes.append({"kpi": "Recrutement OMY", "taux": taux_r, "niveau": "critique" if taux_r < 70 else "attention", "message": f"⚠️ {manquant} recrutements manquants pour atteindre 95%", "action": f"Recruter au moins {manquant} nouveaux clients OM immédiatement"})

    # PLV
    plv = db.query(func.sum(ChallengePLV.quantite)).filter(ChallengePLV.mois.in_(mois_ecoules), ChallengePLV.valide == True).scalar() or 0
    taux_plv = calc_taux(plv, 25 * nb_mois)
    if taux_plv < 95:
        manquant = int(25 * nb_mois - plv)
        alertes.append({"kpi": "Déploiement PLV", "taux": taux_plv, "niveau": "critique" if taux_plv < 70 else "attention", "message": f"⚠️ {manquant} PLV manquantes", "action": f"Déployer {manquant} supports de visibilité"})

    nb_critiques = sum(1 for a in alertes if a["niveau"] == "critique")
    return {"alertes": alertes, "nb_critiques": nb_critiques, "nb_attention": len(alertes) - nb_critiques}


# ── POST /challenge/points-controles ─────────────────────────────────────────
@router.post("/points-controles")
def ajouter_point_controle(data: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Enregistrer un nouveau point contrôlé."""
    mois = data.get("mois", get_mois_actuel())
    pt = ChallengePointControle(
        pdv_numero=data.get("pdv_numero"),
        pdv_nom=data.get("pdv_nom"),
        zone=data.get("zone"),
        superviseur=data.get("superviseur"),
        mois=mois,
        est_actif=data.get("est_actif", True),
        ca_mensuel=data.get("ca_mensuel"),
        notes=data.get("notes"),
    )
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return {"success": True, "id": pt.id}


# ── GET /challenge/points-controles ──────────────────────────────────────────
@router.get("/points-controles")
def list_points_controles(mois: Optional[str] = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Liste des points contrôlés."""
    q = db.query(ChallengePointControle)
    if mois:
        q = q.filter(ChallengePointControle.mois == mois)
    else:
        q = q.filter(ChallengePointControle.mois.in_(MOIS_CHALLENGE))
    pts = q.order_by(ChallengePointControle.date_creation.desc()).all()

    stats = {}
    for m in MOIS_CHALLENGE:
        cnt = db.query(func.count(ChallengePointControle.id)).filter(ChallengePointControle.mois == m).scalar() or 0
        obj = OBJECTIFS_MENSUELS.get(m, {}).get("creation_points_controles", 5)
        stats[m] = {"realise": cnt, "objectif": obj, "taux": calc_taux(cnt, obj)}

    return {
        "points": [{"id": p.id, "pdv_numero": p.pdv_numero, "pdv_nom": p.pdv_nom,
                    "zone": p.zone, "superviseur": p.superviseur, "mois": p.mois,
                    "est_actif": p.est_actif, "ca_mensuel": p.ca_mensuel} for p in pts],
        "stats_par_mois": stats,
        "total": len(pts),
        "actifs": sum(1 for p in pts if p.est_actif),
    }
