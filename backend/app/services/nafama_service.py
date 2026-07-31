"""
Service NAFAMA — logique métier pour les dashboards mensuel et hebdomadaire.
Toutes les données viennent de la table nafama_transactions.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, text
from app.models.nafama import NafamaTransaction
from app.models.pdv import PDV
from typing import Optional, List, Dict, Any
import math


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _pareto(items: List[Dict], montant_key="ca") -> List[Dict]:
    """Ajoute cumul_pct à chaque item trié par montant desc."""
    total = sum(i[montant_key] for i in items) or 1
    cumul = 0
    for i in items:
        cumul += i[montant_key]
        i["cumul_pct"] = round(cumul / total * 100, 1)
    return items


# ─────────────────────────────────────────────────────────────
# VUE D'ENSEMBLE ENRICHIE (superviseurs, zones, gestionnaires)
# ─────────────────────────────────────────────────────────────

def get_monthly_overview(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    """
    Vue d'ensemble complète pour le dashboard mensuel :
    - KPIs principaux
    - CA par superviseur, zone, gestionnaire
    - Classement superviseurs
    """
    # ── KPIs de base ──
    row = (
        db.query(
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
            func.sum(NafamaTransaction.montant).label("ca_total"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .first()
    )
    ca_total = int(row.ca_total or 0)
    nb_pdv = int(row.nb_pdv or 0)
    ca_moyen = round(ca_total / nb_pdv, 0) if nb_pdv else 0

    # Mois précédent
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1
    row_prec = (
        db.query(func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .first()
    )
    ca_prec = int(row_prec.ca or 0)
    evolution = round((ca_total - ca_prec) / ca_prec * 100, 1) if ca_prec else 0

    pdvs_ce_mois = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .distinct().all()
    )
    pdvs_prec = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .distinct().all()
    )
    nb_inactifs = len(pdvs_prec - pdvs_ce_mois)
    nb_nouveaux = len(pdvs_ce_mois - pdvs_prec)

    # ── CA par Superviseur ──
    sup_rows = (
        db.query(
            PDV.superviseur,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv_actifs"),
        )
        .join(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(PDV.superviseur)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )

    # PDVs inactifs par superviseur (présents M-1 mais absents ce mois)
    sup_inactifs = {}
    if pdvs_prec:
        inactif_set = pdvs_prec - pdvs_ce_mois
        if inactif_set:
            inact_rows = (
                db.query(PDV.superviseur, func.count(PDV.id).label("nb"))
                .filter(PDV.numero_pdv.in_(inactif_set))
                .group_by(PDV.superviseur)
                .all()
            )
            sup_inactifs = {r.superviseur: int(r.nb) for r in inact_rows}

    ca_by_superviseur = {r.superviseur: int(r.ca) for r in sup_rows if r.superviseur}
    classement_superviseurs = [
        {
            "superviseur": r.superviseur or "—",
            "ca_total": int(r.ca),
            "nb_pdvs": int(r.nb_pdv_actifs),
            "actifs": int(r.nb_pdv_actifs),
            "inactifs": sup_inactifs.get(r.superviseur, 0),
            "ca_moyen": round(int(r.ca) / int(r.nb_pdv_actifs), 0) if r.nb_pdv_actifs else 0,
        }
        for r in sup_rows if r.superviseur
    ]

    # ── CA par Zone ──
    zone_rows = (
        db.query(
            PDV.zone,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
        )
        .join(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(PDV.zone)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )
    ca_by_zone = {r.zone or "Inconnue": int(r.ca) for r in zone_rows}

    # ── CA par Gestionnaire ──
    gest_rows = (
        db.query(
            PDV.gestionnaire,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
        )
        .join(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(PDV.gestionnaire)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )
    ca_by_gestionnaire = {(r.gestionnaire or "—"): int(r.ca) for r in gest_rows}

    return {
        # KPIs
        "ca_total": ca_total,
        "nb_pdv_actifs": nb_pdv,
        "ca_moyen": int(ca_moyen),
        "evolution_pct": evolution,
        "ca_mois_precedent": ca_prec,
        "nb_pdv_inactifs": nb_inactifs,
        "nb_nouveaux_pdv": nb_nouveaux,
        "annee": annee,
        "mois": mois,
        # Graphiques
        "ca_by_superviseur": ca_by_superviseur,
        "ca_by_zone": ca_by_zone,
        "ca_by_gestionnaire": ca_by_gestionnaire,
        "classement_superviseurs": classement_superviseurs,
    }


# ─────────────────────────────────────────────────────────────
# MENSUEL
# ─────────────────────────────────────────────────────────────

def get_monthly_summary(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    """Vue d'ensemble mensuelle : CA total, nb PDV actifs, moyenne, évolution vs mois précédent."""

    # Mois courant
    rows = (
        db.query(
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
            func.sum(NafamaTransaction.montant).label("ca_total"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .first()
    )
    ca_total = int(rows.ca_total or 0)
    nb_pdv = int(rows.nb_pdv or 0)
    ca_moyen = round(ca_total / nb_pdv, 0) if nb_pdv else 0

    # Mois précédent
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1
    rows_prec = (
        db.query(func.sum(NafamaTransaction.montant).label("ca_total"))
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .first()
    )
    ca_prec = int(rows_prec.ca_total or 0)
    evolution = round((ca_total - ca_prec) / ca_prec * 100, 1) if ca_prec else 0

    # Nb PDV inactifs (présents dans d'autres mois mais pas ce mois)
    pdvs_ce_mois = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .distinct().all()
    )
    pdvs_prec = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .distinct().all()
    )
    nb_inactifs = len(pdvs_prec - pdvs_ce_mois)
    nb_nouveaux = len(pdvs_ce_mois - pdvs_prec)

    return {
        "ca_total": ca_total,
        "nb_pdv_actifs": nb_pdv,
        "ca_moyen": int(ca_moyen),
        "evolution_pct": evolution,
        "ca_mois_precedent": ca_prec,
        "nb_pdv_inactifs": nb_inactifs,
        "nb_nouveaux_pdv": nb_nouveaux,
        "annee": annee,
        "mois": mois,
    }


def get_monthly_top_pdv(
    db: Session, annee: int, mois: int, limit: int = 20
) -> List[Dict]:
    """Top PDVs du mois par CA."""
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(NafamaTransaction.numero_pdv)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .limit(limit)
        .all()
    )
    return [
        {"numero_pdv": r.numero_pdv, "ca": int(r.ca), "nb_jours_actif": int(r.nb_jours), "rang": i + 1}
        for i, r in enumerate(rows)
    ]


def get_monthly_pareto(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    """Analyse Pareto mensuelle : quels % de PDVs font 80% du CA."""
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(NafamaTransaction.numero_pdv)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )
    if not rows:
        return {"items": [], "seuil_80_pct": 0, "nb_pdv_total": 0}

    items = [{"numero_pdv": r.numero_pdv, "ca": int(r.ca)} for r in rows]
    items = _pareto(items)
    total_pdv = len(items)
    seuil_80 = next((i + 1 for i, it in enumerate(items) if it["cumul_pct"] >= 80), total_pdv)

    return {
        "items": items,
        "seuil_80_pct": round(seuil_80 / total_pdv * 100, 1),
        "nb_pdv_pareto": seuil_80,
        "nb_pdv_total": total_pdv,
    }


def get_monthly_evolution(db: Session, annee: int) -> List[Dict]:
    """Évolution mensuelle sur toute l'année (pour le graphique)."""
    rows = (
        db.query(
            NafamaTransaction.mois,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
        )
        .filter(NafamaTransaction.annee == annee)
        .group_by(NafamaTransaction.mois)
        .order_by(NafamaTransaction.mois)
        .all()
    )
    mois_noms = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    return [
        {"mois": r.mois, "label": mois_noms[r.mois], "ca": int(r.ca), "nb_pdv": int(r.nb_pdv)}
        for r in rows
    ]


def get_monthly_inactive_pdv(db: Session, annee: int, mois: int) -> List[Dict]:
    """PDVs qui étaient actifs le mois précédent mais absents ce mois."""
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    pdvs_ce_mois = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .distinct().all()
    )

    rows_prec = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca_prec"),
        )
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .group_by(NafamaTransaction.numero_pdv)
        .all()
    )

    inactifs = [
        {"numero_pdv": r.numero_pdv, "ca_dernier_mois": int(r.ca_prec)}
        for r in rows_prec
        if r.numero_pdv not in pdvs_ce_mois
    ]
    inactifs.sort(key=lambda x: x["ca_dernier_mois"], reverse=True)
    return inactifs


def get_monthly_declining_pdv(db: Session, annee: int, mois: int, seuil_pct: float = -20.0) -> List[Dict]:
    """PDVs en baisse significative vs mois précédent."""
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    ca_mois = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(NafamaTransaction.numero_pdv).all()
    }
    ca_prec = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .group_by(NafamaTransaction.numero_pdv).all()
    }

    declining = []
    for pdv, ca_curr in ca_mois.items():
        if pdv in ca_prec and ca_prec[pdv] > 0:
            pct = (ca_curr - ca_prec[pdv]) / ca_prec[pdv] * 100
            if pct <= seuil_pct:
                declining.append({
                    "numero_pdv": pdv,
                    "ca_actuel": ca_curr,
                    "ca_precedent": ca_prec[pdv],
                    "variation_pct": round(pct, 1),
                })
    declining.sort(key=lambda x: x["variation_pct"])
    return declining


# ─────────────────────────────────────────────────────────────
# VUE D'ENSEMBLE HEBDO ENRICHIE
# ─────────────────────────────────────────────────────────────

def get_weekly_overview(db: Session, annee: int, semaine: int) -> Dict[str, Any]:
    """Vue d'ensemble hebdo enrichie : KPIs + CA par superviseur/zone + classement."""

    # KPIs de base
    row = (
        db.query(
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
            func.sum(NafamaTransaction.montant).label("ca_total"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .first()
    )
    ca_total = int(row.ca_total or 0)
    nb_pdv = int(row.nb_pdv or 0)
    ca_moyen = round(ca_total / nb_pdv, 0) if nb_pdv else 0

    # Semaine précédente
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1
    row_prec = (
        db.query(func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .first()
    )
    ca_prec = int(row_prec.ca or 0)
    evolution = round((ca_total - ca_prec) / ca_prec * 100, 1) if ca_prec else 0

    pdvs_sem = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .distinct().all()
    )
    pdvs_prec_s = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .distinct().all()
    )
    nb_inactifs = len(pdvs_prec_s - pdvs_sem)
    nb_nouveaux = len(pdvs_sem - pdvs_prec_s)

    # CA par Superviseur
    sup_rows = (
        db.query(
            PDV.superviseur,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv_actifs"),
        )
        .join(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(PDV.superviseur)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )

    # PDVs inactifs par superviseur
    sup_inactifs = {}
    if pdvs_prec_s:
        inactif_set = pdvs_prec_s - pdvs_sem
        if inactif_set:
            inact_rows = (
                db.query(PDV.superviseur, func.count(PDV.id).label("nb"))
                .filter(PDV.numero_pdv.in_(inactif_set))
                .group_by(PDV.superviseur).all()
            )
            sup_inactifs = {r.superviseur: int(r.nb) for r in inact_rows}

    classement_superviseurs = [
        {
            "superviseur": r.superviseur or "—",
            "ca_total": int(r.ca),
            "nb_pdvs": int(r.nb_pdv_actifs),
            "actifs": int(r.nb_pdv_actifs),
            "inactifs": sup_inactifs.get(r.superviseur, 0),
            "ca_moyen": round(int(r.ca) / int(r.nb_pdv_actifs), 0) if r.nb_pdv_actifs else 0,
        }
        for r in sup_rows if r.superviseur
    ]

    # CA par Zone
    zone_rows = (
        db.query(
            PDV.zone,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
        )
        .join(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(PDV.zone)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )

    return {
        "ca_total": ca_total,
        "nb_pdv_actifs": nb_pdv,
        "ca_moyen": int(ca_moyen),
        "evolution_pct": evolution,
        "ca_semaine_precedente": ca_prec,
        "nb_pdv_inactifs": nb_inactifs,
        "nb_nouveaux_pdv": nb_nouveaux,
        "annee": annee,
        "semaine": semaine,
        "ca_by_zone": {r.zone or "Inconnue": int(r.ca) for r in zone_rows},
        "ca_by_superviseur": {r.superviseur: int(r.ca) for r in sup_rows if r.superviseur},
        "classement_superviseurs": classement_superviseurs,
    }


# ─────────────────────────────────────────────────────────────
# HEBDOMADAIRE
# ─────────────────────────────────────────────────────────────

def get_weekly_summary(db: Session, annee: int, semaine: int) -> Dict[str, Any]:
    """Vue d'ensemble hebdomadaire."""
    rows = (
        db.query(
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
            func.sum(NafamaTransaction.montant).label("ca_total"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .first()
    )
    ca_total = int(rows.ca_total or 0)
    nb_pdv = int(rows.nb_pdv or 0)
    ca_moyen = round(ca_total / nb_pdv, 0) if nb_pdv else 0

    # Semaine précédente
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1
    rows_prec = (
        db.query(func.sum(NafamaTransaction.montant).label("ca_total"))
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .first()
    )
    ca_prec = int(rows_prec.ca_total or 0)
    evolution = round((ca_total - ca_prec) / ca_prec * 100, 1) if ca_prec else 0

    pdvs_sem = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .distinct().all()
    )
    pdvs_prec_s = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .distinct().all()
    )
    nb_inactifs = len(pdvs_prec_s - pdvs_sem)
    nb_nouveaux = len(pdvs_sem - pdvs_prec_s)

    return {
        "ca_total": ca_total,
        "nb_pdv_actifs": nb_pdv,
        "ca_moyen": int(ca_moyen),
        "evolution_pct": evolution,
        "ca_semaine_precedente": ca_prec,
        "nb_pdv_inactifs": nb_inactifs,
        "nb_nouveaux_pdv": nb_nouveaux,
        "annee": annee,
        "semaine": semaine,
    }


def get_weekly_top_pdv(db: Session, annee: int, semaine: int, limit: int = 20) -> List[Dict]:
    """Top PDVs de la semaine."""
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(NafamaTransaction.numero_pdv)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .limit(limit)
        .all()
    )
    return [
        {"numero_pdv": r.numero_pdv, "ca": int(r.ca), "nb_jours_actif": int(r.nb_jours), "rang": i + 1}
        for i, r in enumerate(rows)
    ]


def get_weekly_pareto(db: Session, annee: int, semaine: int) -> Dict[str, Any]:
    """Pareto hebdomadaire."""
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
        )
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(NafamaTransaction.numero_pdv)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )
    if not rows:
        return {"items": [], "seuil_80_pct": 0, "nb_pdv_total": 0}

    items = [{"numero_pdv": r.numero_pdv, "ca": int(r.ca)} for r in rows]
    items = _pareto(items)
    total_pdv = len(items)
    seuil_80 = next((i + 1 for i, it in enumerate(items) if it["cumul_pct"] >= 80), total_pdv)

    return {
        "items": items,
        "seuil_80_pct": round(seuil_80 / total_pdv * 100, 1),
        "nb_pdv_pareto": seuil_80,
        "nb_pdv_total": total_pdv,
    }


def get_weekly_evolution(db: Session, annee: int) -> List[Dict]:
    """Évolution semaine par semaine sur l'année."""
    rows = (
        db.query(
            NafamaTransaction.semaine,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(func.distinct(NafamaTransaction.numero_pdv)).label("nb_pdv"),
        )
        .filter(NafamaTransaction.annee == annee)
        .group_by(NafamaTransaction.semaine)
        .order_by(NafamaTransaction.semaine)
        .all()
    )
    return [
        {"semaine": r.semaine, "label": f"S{r.semaine}", "ca": int(r.ca), "nb_pdv": int(r.nb_pdv)}
        for r in rows
    ]


def get_weekly_inactive_pdv(db: Session, annee: int, semaine: int) -> List[Dict]:
    """PDVs inactifs cette semaine (actifs la semaine précédente)."""
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1

    pdvs_sem = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .distinct().all()
    )
    rows_prec = (
        db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca_prec"))
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .group_by(NafamaTransaction.numero_pdv).all()
    )
    inactifs = [
        {"numero_pdv": r.numero_pdv, "ca_semaine_precedente": int(r.ca_prec)}
        for r in rows_prec if r.numero_pdv not in pdvs_sem
    ]
    inactifs.sort(key=lambda x: x["ca_semaine_precedente"], reverse=True)
    return inactifs


def get_weekly_declining_pdv(db: Session, annee: int, semaine: int, seuil_pct: float = -20.0) -> List[Dict]:
    """PDVs en baisse vs semaine précédente."""
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1

    ca_sem = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(NafamaTransaction.numero_pdv).all()
    }
    ca_prec = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .group_by(NafamaTransaction.numero_pdv).all()
    }

    declining = []
    for pdv, ca_curr in ca_sem.items():
        if pdv in ca_prec and ca_prec[pdv] > 0:
            pct = (ca_curr - ca_prec[pdv]) / ca_prec[pdv] * 100
            if pct <= seuil_pct:
                declining.append({
                    "numero_pdv": pdv,
                    "ca_actuel": ca_curr,
                    "ca_precedent": ca_prec[pdv],
                    "variation_pct": round(pct, 1),
                })
    declining.sort(key=lambda x: x["variation_pct"])
    return declining


# ─────────────────────────────────────────────────────────────
# METADATA : semaines et mois disponibles
# ─────────────────────────────────────────────────────────────

def get_available_periods(db: Session) -> Dict[str, Any]:
    """Retourne les mois et semaines disponibles dans la base."""
    mois_rows = (
        db.query(NafamaTransaction.annee, NafamaTransaction.mois)
        .distinct()
        .order_by(NafamaTransaction.annee, NafamaTransaction.mois)
        .all()
    )
    sem_rows = (
        db.query(NafamaTransaction.annee, NafamaTransaction.semaine)
        .distinct()
        .order_by(NafamaTransaction.annee, NafamaTransaction.semaine)
        .all()
    )
    mois_noms = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                 "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
    return {
        "mois": [{"annee": r.annee, "mois": r.mois, "label": mois_noms[r.mois]} for r in mois_rows],
        "semaines": [{"annee": r.annee, "semaine": r.semaine, "label": f"S{r.semaine} - {r.annee}"} for r in sem_rows],
    }
