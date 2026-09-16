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
from app.models.indicateur_award import IndicateurAward

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

def get_mois_clos():
    """Mois du challenge RÉELLEMENT TERMINÉS (le mois en cours est exclu).

    Un mois incomplet ne doit pas compter dans les objectifs cumulés,
    sinon le taux d'atteinte est artificiellement sous-évalué.
    """
    mois_actuel = get_mois_actuel()
    return [m for m in MOIS_CHALLENGE if m < mois_actuel]

# Correspondance mois challenge (2026-07) → mois des indicateurs Award (JUILLET)
MOIS_LABELS = {
    "2026-07": "JUILLET",
    "2026-08": "AOÛT",
    "2026-09": "SEPTEMBRE",
    "2026-10": "OCTOBRE",
}

def _award_totaux(db: Session, indicateur: str, mois_challenge: list):
    """Objectif et réalisation cumulés d'un indicateur Award sur des mois du challenge.

    Utilisé pour PDV actif, Ventes terminaux et Orange NRJ, qui sont suivis
    dans la table `indicateurs_award` (données réelles) et non plus en dur.
    """
    labels = [MOIS_LABELS[m] for m in mois_challenge if m in MOIS_LABELS]
    if not labels:
        return 0.0, 0.0
    rows = db.query(IndicateurAward).filter(
        IndicateurAward.indicateur == indicateur,
        IndicateurAward.est_total == True,
        IndicateurAward.mois.in_(labels),
    ).all()
    objectif = sum(float(r.objectif_orange or 0) for r in rows)
    realise = sum(float(r.realisation or 0) for r in rows)
    return objectif, realise

def _objectif_mensuel(db: Session, kpi: str, mois: str) -> float:
    """Objectif d'un KPI pour un mois : valeur en base si personnalisée, sinon défaut du code."""
    row = db.query(ChallengeObjectif).filter(
        ChallengeObjectif.kpi == kpi,
        ChallengeObjectif.mois == mois,
    ).first()
    if row is not None and row.objectif is not None:
        return float(row.objectif)
    return float(OBJECTIFS_MENSUELS.get(mois, {}).get(kpi, 0) or 0)

def _jours_ecoules_du_mois(mois: str, courant: str) -> float:
    """Fraction du mois écoulée (1.0 si le mois est terminé)."""
    import calendar
    if mois != courant:
        return 1.0
    annee, mm = int(mois[:4]), int(mois[5:7])
    jours = calendar.monthrange(annee, mm)[1]
    return min(datetime.utcnow().day, jours) / jours if jours else 1.0

def _objectif_periode(db: Session, kpi: str, mois_liste: list) -> float:
    """Somme des objectifs du challenge sur une période.

    Le mois en cours est compté AU PRORATA des jours écoulés, pour que le score
    soit à la fois réactif (il bouge dès une saisie) et équitable.
    """
    courant = get_mois_actuel()
    total = 0.0
    for m in mois_liste:
        total += _objectif_mensuel(db, kpi, m) * _jours_ecoules_du_mois(m, courant)
    return round(total, 2)

def _award_periode(db: Session, indicateur: str, mois_liste: list):
    """Objectif et réalisation cumulés d'un indicateur Award.

    L'objectif du mois en cours est proratisé (jours écoulés).
    """
    courant = get_mois_actuel()
    objectif = 0.0
    realise = 0.0
    for m in mois_liste:
        o, r = _award_totaux(db, indicateur, [m])
        objectif += o * _jours_ecoules_du_mois(m, courant)
        realise += r
    return round(objectif, 2), round(realise, 2)

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
    # Mois pris en compte dans le score : tous les mois entamés, mois en cours inclus
    # (pour que le score réagisse immédiatement à une saisie). L'objectif du mois en
    # cours est proratisé sur les jours écoulés.
    mois_clos = get_mois_clos()
    mois_score = get_mois_challenge_ecoules()
    nb_mois = len(mois_score)

    # Recrutement OMY (table challenge)
    total_recrutes = db.query(func.count(ChallengeRecrutement.id)).filter(
        ChallengeRecrutement.mois.in_(mois_score)
    ).scalar() or 0

    # PLV déployées et validées (table challenge)
    total_plv = db.query(func.sum(ChallengePLV.quantite)).filter(
        ChallengePLV.mois.in_(mois_score),
        ChallengePLV.valide == True
    ).scalar() or 0

    # Points contrôlés créés (table challenge)
    total_points = db.query(func.count(ChallengePointControle.id)).filter(
        ChallengePointControle.mois.in_(mois_score)
    ).scalar() or 0

    # Nombre total de PDV actifs (information de contexte)
    total_pdvs = db.query(func.count(PDV.id)).filter(PDV.statut == "ACTIF").scalar() or 1

    # PDV actifs / Ventes terminaux / Orange NRJ : données RÉELLES des indicateurs Award
    obj_pdv, real_pdv = _award_periode(db, "PDV_ACTIF", mois_score)
    obj_term, real_term = _award_periode(db, "TERMINAUX", mois_score)
    obj_nrj, real_nrj = _award_periode(db, "ORANGE ENERGIE", mois_score)

    # Objectifs cumulés (base de données si personnalisés, sinon valeurs par défaut)
    obj_recrutes = _objectif_periode(db, "recrutement_omy", mois_score) or (250 * nb_mois)
    obj_plv = _objectif_periode(db, "deploiement_plv", mois_score) or (25 * nb_mois)
    obj_points = _objectif_periode(db, "creation_points_controles", mois_score)
    obj_terminaux = obj_term or _objectif_periode(db, "ventes_terminaux", mois_score) or (25 * nb_mois)
    obj_nrj = obj_nrj or _objectif_periode(db, "orange_nrj", mois_score) or (7 * nb_mois)

    # Taux d'atteinte
    taux_recrutes = calc_taux(total_recrutes, obj_recrutes)
    taux_plv = calc_taux(total_plv, obj_plv)
    taux_points = calc_taux(total_points, obj_points)
    taux_pdv = calc_taux(real_pdv, obj_pdv)
    taux_term = calc_taux(real_term, obj_terminaux)
    taux_nrj = calc_taux(real_nrj, obj_nrj)

    # ── Scores (pondérations officielles déclarées) ──
    POIDS_OM = 40      # PDV actif 10 + Recrutement 15 + PLV 15
    POIDS_TELCO = 60   # Points 15 + PLV 15 + Terminaux 15 + NRJ 15

    score_om = (
        calc_score_critere(taux_pdv, 10) +
        calc_score_critere(taux_recrutes, 15) +
        calc_score_critere(taux_plv, 15)
    )
    score_telco = (
        calc_score_critere(taux_points, 15) +
        calc_score_critere(taux_plv, 15) +
        calc_score_critere(taux_term, 15) +
        calc_score_critere(taux_nrj, 15)
    )
    # Chaque challenge est ramené sur 100 avant la moyenne (les maxima diffèrent)
    om_pct = round(score_om / POIDS_OM * 100, 1) if POIDS_OM else 0
    telco_pct = round(score_telco / POIDS_TELCO * 100, 1) if POIDS_TELCO else 0

    return {
        "periode": {
            "debut": CHALLENGE_START.isoformat(),
            "fin": CHALLENGE_END.isoformat(),
            "jours_restants": jours_restants,
            "jours_ecoules": jours_ecoules,
            "avancement_pct": avancement_periode,
            "mois_ecoules": mois_ecoules,
            "mois_clos": mois_clos,
            "mois_score": mois_score,
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
            "ventes_terminaux": {
                "realise": int(real_term),
                "objectif_cumule": int(obj_terminaux),
                "taux": taux_term,
                "source": "indicateurs_award",
            },
            "orange_nrj": {
                "realise": int(real_nrj),
                "objectif_cumule": int(obj_nrj),
                "taux": taux_nrj,
                "source": "indicateurs_award",
            },
            "pdv_actifs": {
                "realise": int(real_pdv),
                "total_pdvs": total_pdvs,
                "objectif_cumule": int(obj_pdv),
                "taux": taux_pdv,
                "objectif_pct": 90,
                "source": "indicateurs_award",
            },
        },
        "scores": {
            "om": round(score_om, 1),
            "om_max": POIDS_OM,
            "om_pct": om_pct,
            "telco": round(score_telco, 1),
            "telco_max": POIDS_TELCO,
            "telco_pct": telco_pct,
            "global": round((om_pct + telco_pct) / 2, 1),
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

    # Ventes terminaux / Orange NRJ / PDV actif : données réelles des indicateurs Award
    _, real_term = _award_totaux(db, "TERMINAUX", [mois])
    _, real_nrj = _award_totaux(db, "ORANGE ENERGIE", [mois])
    obj_pdv_m, real_pdv = _award_totaux(db, "PDV_ACTIF", [mois])
    obj_pdv_m = int(obj_pdv_m) or obj.get("pdv_actif", 1016)

    return {
        "mois": mois,
        "kpis": [
            {"kpi": "Recrutement OMY", "objectif": obj.get("recrutement_omy", 250), "realise": recrutes, "taux": calc_taux(recrutes, obj.get("recrutement_omy", 250)), "unite": "clients", "poids_om": 15},
            {"kpi": "Déploiement PLV", "objectif": obj.get("deploiement_plv", 25), "realise": int(plv), "taux": calc_taux(plv, obj.get("deploiement_plv", 25)), "unite": "PLV", "poids_om": 15, "poids_telco": 15},
            {"kpi": "Points Contrôlés", "objectif": obj.get("creation_points_controles", 5), "realise": points, "taux": calc_taux(points, obj.get("creation_points_controles", 5)), "unite": "points", "poids_telco": 15},
            {"kpi": "Ventes Terminaux", "objectif": obj.get("ventes_terminaux", 25), "realise": int(real_term), "taux": calc_taux(real_term, obj.get("ventes_terminaux", 25)), "unite": "terminaux", "poids_telco": 15, "source": "indicateurs_award"},
            {"kpi": "Orange NRJ", "objectif": obj.get("orange_nrj", 7), "realise": int(real_nrj), "taux": calc_taux(real_nrj, obj.get("orange_nrj", 7)), "unite": "kits", "poids_telco": 15, "source": "indicateurs_award"},
            {"kpi": "PDV actifs", "objectif": obj_pdv_m, "realise": int(real_pdv), "taux": calc_taux(real_pdv, obj_pdv_m), "unite": "PDV", "poids_om": 10, "source": "indicateurs_award"},
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
    # On se base sur les mois terminés (cohérent avec le tableau de bord)
    mois = get_mois_clos() or MOIS_CHALLENGE

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
    mois_clos = get_mois_clos()
    if not mois_clos:
        return {"alertes": [], "nb_critiques": 0}

    nb_mois = len(mois_clos)

    # Recrutement
    recrutes = db.query(func.count(ChallengeRecrutement.id)).filter(ChallengeRecrutement.mois.in_(mois_clos)).scalar() or 0
    taux_r = calc_taux(recrutes, 250 * nb_mois)
    if taux_r < 95:
        manquant = int(250 * nb_mois - recrutes)
        alertes.append({"kpi": "Recrutement OMY", "taux": taux_r, "niveau": "critique" if taux_r < 70 else "attention", "message": f"⚠️ {manquant} recrutements manquants pour atteindre 95%", "action": f"Recruter au moins {manquant} nouveaux clients OM immédiatement"})

    # PLV
    plv = db.query(func.sum(ChallengePLV.quantite)).filter(ChallengePLV.mois.in_(mois_clos), ChallengePLV.valide == True).scalar() or 0
    taux_plv = calc_taux(plv, 25 * nb_mois)
    if taux_plv < 95:
        manquant = int(25 * nb_mois - plv)
        alertes.append({"kpi": "Déploiement PLV", "taux": taux_plv, "niveau": "critique" if taux_plv < 70 else "attention", "message": f"⚠️ {manquant} PLV manquantes", "action": f"Déployer {manquant} supports de visibilité"})

    # Ventes terminaux (source Award)
    obj_term, real_term = _award_totaux(db, "TERMINAUX", mois_clos)
    if obj_term:
        taux_term = calc_taux(real_term, obj_term)
        if taux_term < 95:
            alertes.append({"kpi": "Ventes Terminaux", "taux": taux_term, "niveau": "critique" if taux_term < 70 else "attention", "message": f"⚠️ {int(obj_term - real_term)} terminaux manquants", "action": "Relancer les ventes de terminaux sur le réseau"})

    # Orange NRJ (source Award)
    obj_nrj, real_nrj = _award_totaux(db, "ORANGE ENERGIE", mois_clos)
    if obj_nrj:
        taux_nrj = calc_taux(real_nrj, obj_nrj)
        if taux_nrj < 95:
            alertes.append({"kpi": "Orange NRJ", "taux": taux_nrj, "niveau": "critique" if taux_nrj < 70 else "attention", "message": f"⚠️ {int(obj_nrj - real_nrj)} kits Orange Énergie manquants", "action": "Prioriser la vente de kits Orange Énergie"})

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


# ─────────────────────────────────────────────────────────────────────────────
# MODIFICATION / SUPPRESSION DES DONNÉES
# ─────────────────────────────────────────────────────────────────────────────

def _maj(objet, data: dict, champs: list):
    """Applique à l'objet les champs présents dans la requête."""
    for c in champs:
        if c in data:
            setattr(objet, c, data[c])

def _date_iso(valeur):
    """Convertit une date ISO ; lève 400 si invalide."""
    if not valeur:
        return None
    try:
        return datetime.fromisoformat(valeur)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Date invalide (format attendu AAAA-MM-JJ)")


# ── Recrutements ──
@router.put("/recrutements/{rec_id}")
def modifier_recrutement(rec_id: int, data: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Modifier un recrutement existant."""
    rec = db.query(ChallengeRecrutement).filter(ChallengeRecrutement.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recrutement introuvable")
    _maj(rec, data, ["numero_client", "nom_client", "pdv_numero", "pdv_nom",
                     "superviseur", "developpeur", "zone", "mois", "est_actif", "notes"])
    if "date_recrutement" in data:
        d = _date_iso(data["date_recrutement"])
        if d:
            rec.date_recrutement = d
    db.commit()
    db.refresh(rec)
    return {"success": True, "id": rec.id}

@router.delete("/recrutements/{rec_id}")
def supprimer_recrutement(rec_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Supprimer un recrutement."""
    rec = db.query(ChallengeRecrutement).filter(ChallengeRecrutement.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recrutement introuvable")
    db.delete(rec)
    db.commit()
    return {"success": True, "id": rec_id}


# ── PLV ──
@router.put("/plv/{plv_id}")
def modifier_plv(plv_id: int, data: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Modifier un déploiement PLV."""
    plv = db.query(ChallengePLV).filter(ChallengePLV.id == plv_id).first()
    if not plv:
        raise HTTPException(status_code=404, detail="PLV introuvable")
    _maj(plv, data, ["pdv_numero", "pdv_nom", "zone", "superviseur", "type_plv",
                     "quantite", "mois", "photo_url", "valide", "valide_par", "notes"])
    if "date_deploiement" in data:
        d = _date_iso(data["date_deploiement"])
        if d:
            plv.date_deploiement = d
    db.commit()
    db.refresh(plv)
    return {"success": True, "id": plv.id}

@router.delete("/plv/{plv_id}")
def supprimer_plv(plv_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Supprimer un déploiement PLV."""
    plv = db.query(ChallengePLV).filter(ChallengePLV.id == plv_id).first()
    if not plv:
        raise HTTPException(status_code=404, detail="PLV introuvable")
    db.delete(plv)
    db.commit()
    return {"success": True, "id": plv_id}


# ── Points contrôlés ──
@router.put("/points-controles/{pt_id}")
def modifier_point_controle(pt_id: int, data: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Modifier un point contrôlé."""
    pt = db.query(ChallengePointControle).filter(ChallengePointControle.id == pt_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="Point contrôlé introuvable")
    _maj(pt, data, ["pdv_numero", "pdv_nom", "zone", "superviseur", "mois",
                    "est_actif", "ca_mensuel", "notes"])
    if "date_creation" in data:
        d = _date_iso(data["date_creation"])
        if d:
            pt.date_creation = d
    db.commit()
    db.refresh(pt)
    return {"success": True, "id": pt.id}

@router.delete("/points-controles/{pt_id}")
def supprimer_point_controle(pt_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Supprimer un point contrôlé."""
    pt = db.query(ChallengePointControle).filter(ChallengePointControle.id == pt_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="Point contrôlé introuvable")
    db.delete(pt)
    db.commit()
    return {"success": True, "id": pt_id}


# ─────────────────────────────────────────────────────────────────────────────
# OBJECTIFS MENSUELS PILOTABLES
# ─────────────────────────────────────────────────────────────────────────────

KPI_LIBELLES = {
    "recrutement_omy": ("Recrutement OMY", "clients"),
    "deploiement_plv": ("Déploiement PLV", "PLV"),
    "creation_points_controles": ("Points contrôlés", "points"),
    "ventes_terminaux": ("Ventes terminaux", "terminaux"),
    "orange_nrj": ("Orange NRJ", "kits"),
}

@router.get("/objectifs-config")
def get_objectifs_config(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Objectifs mensuels effectifs (valeur personnalisée en base, sinon valeur par défaut)."""
    objectifs = []
    for mois in MOIS_CHALLENGE:
        for kpi, (libelle, unite) in KPI_LIBELLES.items():
            row = db.query(ChallengeObjectif).filter(
                ChallengeObjectif.kpi == kpi,
                ChallengeObjectif.mois == mois,
            ).first()
            defaut = OBJECTIFS_MENSUELS.get(mois, {}).get(kpi, 0)
            objectifs.append({
                "mois": mois,
                "kpi": kpi,
                "libelle": libelle,
                "unite": unite,
                "objectif": float(row.objectif) if row is not None and row.objectif is not None else float(defaut or 0),
                "personnalise": row is not None,
            })
    return {
        "objectifs": objectifs,
        "mois": MOIS_CHALLENGE,
        "kpis": [{"kpi": k, "libelle": v[0], "unite": v[1]} for k, v in KPI_LIBELLES.items()],
    }

@router.put("/objectifs-config")
def set_objectif_config(data: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Créer ou modifier l'objectif mensuel d'un KPI."""
    mois = data.get("mois")
    kpi = data.get("kpi")
    if mois not in MOIS_CHALLENGE:
        raise HTTPException(status_code=400, detail=f"Mois invalide. Valides : {MOIS_CHALLENGE}")
    if kpi not in KPI_LIBELLES:
        raise HTTPException(status_code=400, detail=f"KPI invalide. Valides : {list(KPI_LIBELLES)}")
    try:
        valeur = float(data.get("objectif", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Objectif invalide")
    if valeur < 0:
        raise HTTPException(status_code=400, detail="L'objectif doit être positif")

    row = db.query(ChallengeObjectif).filter(
        ChallengeObjectif.kpi == kpi,
        ChallengeObjectif.mois == mois,
    ).first()
    if row:
        row.objectif = valeur
        row.updated_at = datetime.utcnow()
    else:
        db.add(ChallengeObjectif(
            challenge_type=data.get("challenge_type", "OM"),
            kpi=kpi, mois=mois, objectif=valeur,
            unite=KPI_LIBELLES[kpi][1],
        ))
    db.commit()
    return {"success": True, "mois": mois, "kpi": kpi, "objectif": valeur}

@router.delete("/objectifs-config/{mois}/{kpi}")
def reset_objectif_config(mois: str, kpi: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Revenir à l'objectif par défaut (supprime la personnalisation)."""
    row = db.query(ChallengeObjectif).filter(
        ChallengeObjectif.kpi == kpi,
        ChallengeObjectif.mois == mois,
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"success": True, "mois": mois, "kpi": kpi, "reinitialise": True}
