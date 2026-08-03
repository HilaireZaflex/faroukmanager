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
    """Top PDVs du mois par CA — enrichi avec infos PDV et évolution vs M-1."""
    # Mois précédent pour calcul évolution
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
            PDV.nom,
            PDV.zone,
            PDV.quartier,
            PDV.superviseur,
            PDV.gestionnaire,
            PDV.medaille,
            PDV.commune,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier,
                  PDV.superviseur, PDV.gestionnaire, PDV.medaille, PDV.commune)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .limit(limit)
        .all()
    )

    # CA mois précédent pour chaque PDV
    pdv_ids = [r.numero_pdv for r in rows]
    ca_prec_map = {}
    if pdv_ids:
        prec_rows = (
            db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
            .filter(
                NafamaTransaction.numero_pdv.in_(pdv_ids),
                NafamaTransaction.annee == annee_prec,
                NafamaTransaction.mois == mois_prec,
            )
            .group_by(NafamaTransaction.numero_pdv)
            .all()
        )
        ca_prec_map = {r.numero_pdv: int(r.ca) for r in prec_rows}

    result = []
    for i, r in enumerate(rows):
        ca = int(r.ca)
        ca_prec = ca_prec_map.get(r.numero_pdv, 0)
        evolution = round((ca - ca_prec) / ca_prec * 100, 1) if ca_prec else None
        medaille_val = r.medaille.value if r.medaille and hasattr(r.medaille, 'value') else (str(r.medaille) if r.medaille else None)
        result.append({
            "rang": i + 1,
            "numero_pdv": r.numero_pdv,
            "nom": r.nom or r.numero_pdv,
            "ca": ca,
            "ca_precedent": ca_prec,
            "evolution_pct": evolution,
            "nb_jours_actif": int(r.nb_jours),
            "zone": r.zone or "—",
            "quartier": r.quartier or "—",
            "superviseur": r.superviseur or "—",
            "gestionnaire": r.gestionnaire or "—",
            "medaille": medaille_val,
            "commune": r.commune or "—",
        })
    return result


def get_pdv_monthly_history(db: Session, numero_pdv: str) -> List[Dict]:
    """Historique mensuel d'un PDV NAFAMA — pour la courbe d'évolution."""
    rows = (
        db.query(
            NafamaTransaction.annee,
            NafamaTransaction.mois,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
        )
        .filter(NafamaTransaction.numero_pdv == numero_pdv)
        .group_by(NafamaTransaction.annee, NafamaTransaction.mois)
        .order_by(NafamaTransaction.annee, NafamaTransaction.mois)
        .all()
    )
    MOIS_ABR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    return [
        {
            "annee": r.annee,
            "mois": r.mois,
            "label": f"{MOIS_ABR[r.mois]} {r.annee}",
            "ca": int(r.ca),
            "nb_jours": int(r.nb_jours),
        }
        for r in rows
    ]


def get_pdv_weekly_history(db: Session, numero_pdv: str) -> List[Dict]:
    """Historique hebdomadaire d'un PDV NAFAMA — pour la courbe d'évolution."""
    rows = (
        db.query(
            NafamaTransaction.annee,
            NafamaTransaction.semaine,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
        )
        .filter(NafamaTransaction.numero_pdv == numero_pdv)
        .group_by(NafamaTransaction.annee, NafamaTransaction.semaine)
        .order_by(NafamaTransaction.annee, NafamaTransaction.semaine)
        .all()
    )
    return [
        {
            "annee": r.annee,
            "semaine": r.semaine,
            "label": f"S{r.semaine}",
            "ca": int(r.ca),
            "nb_jours": int(r.nb_jours),
        }
        for r in rows
    ]


def _gini(values: List[int]) -> float:
    """Calcule le coefficient de Gini (0=égalité parfaite, 1=inégalité totale)."""
    if not values or len(values) < 2:
        return 0.0
    vals = sorted(values)
    n = len(vals)
    cumul = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(vals))
    total = sum(vals) * n
    return round(cumul / total, 3) if total else 0.0


def get_monthly_pareto(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    """Analyse Pareto mensuelle enrichie avec infos PDV, Gini, fort/faible impact."""
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            PDV.nom,
            PDV.zone,
            PDV.quartier,
            PDV.superviseur,
            PDV.gestionnaire,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )
    if not rows:
        return {"items": [], "seuil_80_pct": 0, "nb_pdv_total": 0, "nb_pdv_pareto": 0, "gini_coefficient": 0}

    ca_total = sum(int(r.ca) for r in rows)
    total_pdv = len(rows)
    seuil_80 = 0
    cumul = 0
    items = []
    for i, r in enumerate(rows):
        ca = int(r.ca)
        cumul += ca
        cumul_pct = round(cumul / ca_total * 100, 1) if ca_total else 0
        if seuil_80 == 0 and cumul_pct >= 80:
            seuil_80 = i + 1
        pct_ca = round(ca / ca_total * 100, 2) if ca_total else 0
        items.append({
            "numero_pdv": r.numero_pdv,
            "nom": r.nom or r.numero_pdv,
            "zone": r.zone or "—",
            "quartier": r.quartier or "—",
            "superviseur": r.superviseur or "—",
            "gestionnaire": r.gestionnaire or "—",
            "ca": ca,
            "pct_ca": pct_ca,
            "cumul_pct": cumul_pct,
            "dans_pareto": cumul_pct <= 80,
        })
    if seuil_80 == 0:
        seuil_80 = total_pdv

    gini = _gini([int(r.ca) for r in rows])

    return {
        "items": items,
        "seuil_80_pct": round(seuil_80 / total_pdv * 100, 1),
        "nb_pdv_pareto": seuil_80,
        "nb_pdv_total": total_pdv,
        "ca_total": ca_total,
        "gini_coefficient": gini,
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


def get_monthly_evolution_detail(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    """
    Évolution détaillée mensuelle : CA actuel vs CA mois précédent
    par PDV, superviseur et gestionnaire.
    """
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    # CA actuel par PDV (avec infos)
    ca_actuel_pdv = {
        r.numero_pdv: {
            "ca": int(r.ca),
            "nom": r.nom or r.numero_pdv,
            "zone": r.zone or "—",
            "superviseur": r.superviseur or "—",
            "gestionnaire": r.gestionnaire or "—",
        }
        for r in db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            PDV.nom, PDV.zone, PDV.superviseur, PDV.gestionnaire,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.superviseur, PDV.gestionnaire)
        .all()
    }

    ca_prec_pdv = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .group_by(NafamaTransaction.numero_pdv).all()
    }

    # Par PDV
    all_pdvs = set(ca_actuel_pdv.keys()) | set(ca_prec_pdv.keys())
    par_pdv = []
    for pdv in all_pdvs:
        actuel = ca_actuel_pdv.get(pdv, {}).get("ca", 0)
        precedent = ca_prec_pdv.get(pdv, 0)
        info = ca_actuel_pdv.get(pdv, {})
        variation = actuel - precedent
        taux = round((variation / precedent) * 100) if precedent > 0 else 0
        par_pdv.append({
            "numero_pdv": pdv,
            "nom": info.get("nom", pdv),
            "zone": info.get("zone", "—"),
            "superviseur": info.get("superviseur", "—"),
            "gestionnaire": info.get("gestionnaire", "—"),
            "ca_actuel": actuel,
            "ca_precedent": precedent,
            "variation": variation,
            "taux": taux,
        })
    par_pdv.sort(key=lambda x: x["ca_actuel"], reverse=True)

    # Par Superviseur
    sup_actuel = {}
    for pdv, info in ca_actuel_pdv.items():
        s = info["superviseur"]
        sup_actuel[s] = sup_actuel.get(s, 0) + info["ca"]

    sup_prec = {}
    for r in db.query(
        PDV.superviseur, func.sum(NafamaTransaction.montant).label("ca")
    ).join(NafamaTransaction, NafamaTransaction.numero_pdv == PDV.numero_pdv
    ).filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec
    ).group_by(PDV.superviseur).all():
        if r.superviseur:
            sup_prec[r.superviseur] = int(r.ca)

    par_superviseur = []
    for s in set(list(sup_actuel.keys()) + list(sup_prec.keys())):
        if not s or s == "—": continue
        actuel = sup_actuel.get(s, 0)
        precedent = sup_prec.get(s, 0)
        variation = actuel - precedent
        taux = round((variation / precedent) * 100) if precedent > 0 else 0
        par_superviseur.append({"superviseur": s, "ca_actuel": actuel, "ca_precedent": precedent, "variation": variation, "taux": taux})
    par_superviseur.sort(key=lambda x: x["ca_actuel"], reverse=True)

    # Par Gestionnaire
    gest_actuel = {}
    for pdv, info in ca_actuel_pdv.items():
        g = info["gestionnaire"]
        gest_actuel[g] = gest_actuel.get(g, 0) + info["ca"]

    gest_prec = {}
    for r in db.query(
        PDV.gestionnaire, func.sum(NafamaTransaction.montant).label("ca")
    ).join(NafamaTransaction, NafamaTransaction.numero_pdv == PDV.numero_pdv
    ).filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec
    ).group_by(PDV.gestionnaire).all():
        if r.gestionnaire:
            gest_prec[r.gestionnaire] = int(r.ca)

    par_gestionnaire = []
    for g in set(list(gest_actuel.keys()) + list(gest_prec.keys())):
        if not g or g == "—": continue
        actuel = gest_actuel.get(g, 0)
        precedent = gest_prec.get(g, 0)
        variation = actuel - precedent
        taux = round((variation / precedent) * 100) if precedent > 0 else 0
        par_gestionnaire.append({"gestionnaire": g, "ca_actuel": actuel, "ca_precedent": precedent, "variation": variation, "taux": taux})
    par_gestionnaire.sort(key=lambda x: x["ca_actuel"], reverse=True)

    total_actuel = sum(info["ca"] for info in ca_actuel_pdv.values())
    total_prec = sum(ca_prec_pdv.values())
    total_var = total_actuel - total_prec
    total_taux = round((total_var / total_prec) * 100, 1) if total_prec > 0 else 0

    return {
        "total_ca_actuel": total_actuel,
        "total_ca_precedent": total_prec,
        "total_variation": total_var,
        "total_taux": total_taux,
        "par_pdv": par_pdv,
        "par_superviseur": par_superviseur,
        "par_gestionnaire": par_gestionnaire,
        "annee": annee, "mois": mois,
        "annee_prec": annee_prec, "mois_prec": mois_prec,
    }


def get_weekly_evolution_detail(db: Session, annee: int, semaine: int) -> Dict[str, Any]:
    """
    Évolution détaillée hebdomadaire : CA actuel vs CA semaine précédente
    par PDV, superviseur et gestionnaire.
    """
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1

    ca_actuel_pdv = {
        r.numero_pdv: {
            "ca": int(r.ca),
            "nom": r.nom or r.numero_pdv,
            "zone": r.zone or "—",
            "superviseur": r.superviseur or "—",
            "gestionnaire": r.gestionnaire or "—",
        }
        for r in db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            PDV.nom, PDV.zone, PDV.superviseur, PDV.gestionnaire,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.superviseur, PDV.gestionnaire)
        .all()
    }

    ca_prec_pdv = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .group_by(NafamaTransaction.numero_pdv).all()
    }

    all_pdvs = set(ca_actuel_pdv.keys()) | set(ca_prec_pdv.keys())
    par_pdv = []
    for pdv in all_pdvs:
        actuel = ca_actuel_pdv.get(pdv, {}).get("ca", 0)
        precedent = ca_prec_pdv.get(pdv, 0)
        info = ca_actuel_pdv.get(pdv, {})
        variation = actuel - precedent
        taux = round((variation / precedent) * 100) if precedent > 0 else 0
        par_pdv.append({
            "numero_pdv": pdv,
            "nom": info.get("nom", pdv),
            "zone": info.get("zone", "—"),
            "superviseur": info.get("superviseur", "—"),
            "gestionnaire": info.get("gestionnaire", "—"),
            "ca_actuel": actuel,
            "ca_precedent": precedent,
            "variation": variation,
            "taux": taux,
        })
    par_pdv.sort(key=lambda x: x["ca_actuel"], reverse=True)

    sup_actuel = {}
    for pdv, info in ca_actuel_pdv.items():
        s = info["superviseur"]
        sup_actuel[s] = sup_actuel.get(s, 0) + info["ca"]

    sup_prec = {}
    for r in db.query(
        PDV.superviseur, func.sum(NafamaTransaction.montant).label("ca")
    ).join(NafamaTransaction, NafamaTransaction.numero_pdv == PDV.numero_pdv
    ).filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec
    ).group_by(PDV.superviseur).all():
        if r.superviseur:
            sup_prec[r.superviseur] = int(r.ca)

    par_superviseur = []
    for s in set(list(sup_actuel.keys()) + list(sup_prec.keys())):
        if not s or s == "—": continue
        actuel = sup_actuel.get(s, 0)
        precedent = sup_prec.get(s, 0)
        variation = actuel - precedent
        taux = round((variation / precedent) * 100) if precedent > 0 else 0
        par_superviseur.append({"superviseur": s, "ca_actuel": actuel, "ca_precedent": precedent, "variation": variation, "taux": taux})
    par_superviseur.sort(key=lambda x: x["ca_actuel"], reverse=True)

    gest_actuel = {}
    for pdv, info in ca_actuel_pdv.items():
        g = info["gestionnaire"]
        gest_actuel[g] = gest_actuel.get(g, 0) + info["ca"]

    gest_prec = {}
    for r in db.query(
        PDV.gestionnaire, func.sum(NafamaTransaction.montant).label("ca")
    ).join(NafamaTransaction, NafamaTransaction.numero_pdv == PDV.numero_pdv
    ).filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec
    ).group_by(PDV.gestionnaire).all():
        if r.gestionnaire:
            gest_prec[r.gestionnaire] = int(r.ca)

    par_gestionnaire = []
    for g in set(list(gest_actuel.keys()) + list(gest_prec.keys())):
        if not g or g == "—": continue
        actuel = gest_actuel.get(g, 0)
        precedent = gest_prec.get(g, 0)
        variation = actuel - precedent
        taux = round((variation / precedent) * 100) if precedent > 0 else 0
        par_gestionnaire.append({"gestionnaire": g, "ca_actuel": actuel, "ca_precedent": precedent, "variation": variation, "taux": taux})
    par_gestionnaire.sort(key=lambda x: x["ca_actuel"], reverse=True)

    total_actuel = sum(info["ca"] for info in ca_actuel_pdv.values())
    total_prec = sum(ca_prec_pdv.values())
    total_var = total_actuel - total_prec
    total_taux = round((total_var / total_prec) * 100, 1) if total_prec > 0 else 0

    return {
        "total_ca_actuel": total_actuel,
        "total_ca_precedent": total_prec,
        "total_variation": total_var,
        "total_taux": total_taux,
        "par_pdv": par_pdv,
        "par_superviseur": par_superviseur,
        "par_gestionnaire": par_gestionnaire,
        "annee": annee, "semaine": semaine,
        "annee_prec": annee_prec_s, "semaine_prec": sem_prec,
    }


def _get_nb_mois_consecutifs_inactif(db: Session, numero_pdv: str, annee: int, mois: int) -> int:
    """
    Compte le nombre de mois consécutifs d'inactivité jusqu'à annee/mois (inclus).
    On part du mois actuel (déjà inactif) et on remonte en arrière.
    """
    count = 0
    a, m = annee, mois
    for _ in range(24):
        exists = db.query(NafamaTransaction.id).filter(
            NafamaTransaction.numero_pdv == numero_pdv,
            NafamaTransaction.annee == a,
            NafamaTransaction.mois == m,
        ).first()
        if exists:
            break  # PDV actif ce mois → on arrête
        count += 1
        # Reculer d'un mois
        m -= 1
        if m == 0:
            m = 12
            a -= 1
        # Sécurité : si on est avant le début des données, on arrête
        if a < 2025:
            break
    return count


def get_monthly_inactive_pdv(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    """
    PDVs inactifs ce mois — cherche dans une fenêtre de 6 mois pour capturer
    les PDVs absents depuis 1, 2 ou 3+ mois consécutifs.
    """
    pdvs_ce_mois = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .distinct().all()
    )

    # Collecter tous les PDVs vus dans les 6 derniers mois (fenêtre glissante)
    candidats = {}  # numero_pdv -> (ca_dernier_mois, infos PDV)
    for i in range(1, 7):
        m = mois - i
        a = annee
        while m <= 0:
            m += 12
            a -= 1

        rows = (
            db.query(
                NafamaTransaction.numero_pdv,
                func.sum(NafamaTransaction.montant).label("ca"),
                PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere,
            )
            .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
            .filter(NafamaTransaction.annee == a, NafamaTransaction.mois == m)
            .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere)
            .all()
        )
        for r in rows:
            if r.numero_pdv not in pdvs_ce_mois and r.numero_pdv not in candidats:
                # Premier mois trouvé = dernier mois actif
                candidats[r.numero_pdv] = {
                    "ca_dernier_mois": int(r.ca),
                    "nom": r.nom or r.numero_pdv,
                    "zone": r.zone or "—",
                    "quartier": r.quartier or "—",
                    "superviseur": r.superviseur or "—",
                    "gestionnaire": r.gestionnaire or "—",
                    "teleconseillere": r.teleconseillere or "",
                }

    pdvs = []
    for numero_pdv, info in candidats.items():
        nb = _get_nb_mois_consecutifs_inactif(db, numero_pdv, annee, mois)
        alerte = "🔴 Critique" if nb >= 3 else "🟠 Haute" if nb == 2 else "⚪ Normale"
        pdvs.append({
            "numero_pdv": numero_pdv,
            "nom": info["nom"],
            "zone": info["zone"],
            "quartier": info["quartier"],
            "superviseur": info["superviseur"],
            "gestionnaire": info["gestionnaire"],
            "teleconseillere": info.get("teleconseillere", ""),
            "ca_dernier_mois": info["ca_dernier_mois"],
            "nb_mois_consecutifs_inactif": nb,
            "alerte": alerte,
        })

    pdvs.sort(key=lambda x: x["nb_mois_consecutifs_inactif"], reverse=True)
    critique = [p for p in pdvs if p["nb_mois_consecutifs_inactif"] >= 3]
    haute = [p for p in pdvs if p["nb_mois_consecutifs_inactif"] == 2]
    normale = [p for p in pdvs if p["nb_mois_consecutifs_inactif"] == 1]

    return {
        "pdvs": pdvs,
        "total": len(pdvs),
        "nb_critique": len(critique),
        "nb_haute": len(haute),
        "nb_normale": len(normale),
        "annee": annee, "mois": mois,
    }


def _get_action_baisse(taux: float) -> str:
    abs_taux = abs(taux)
    if abs_taux > 30:
        return "Visite urgente + appel superviseur"
    if abs_taux > 15:
        return "Appel téléphonique + relance"
    return "Surveillance & suivi régulier"


def get_monthly_declining_pdv(db: Session, annee: int, mois: int, seuil_pct: float = -20.0) -> Dict[str, Any]:
    """PDVs en baisse significative vs mois précédent — enrichi avec infos PDV, alerte, action."""
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    # CA actuel avec infos PDV
    rows_actuel = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere)
        .all()
    )
    ca_prec_map = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec)
        .group_by(NafamaTransaction.numero_pdv).all()
    }

    declining = []
    for r in rows_actuel:
        ca_curr = int(r.ca)
        ca_p = ca_prec_map.get(r.numero_pdv, 0)
        if ca_p > 0:
            pct = (ca_curr - ca_p) / ca_p * 100
            if pct <= seuil_pct:
                abs_pct = abs(pct)
                alerte = "🔴 Critique" if abs_pct > 30 else "🟠 Haute" if abs_pct > 15 else "⚪ Normale"
                declining.append({
                    "numero_pdv": r.numero_pdv,
                    "nom": r.nom or r.numero_pdv,
                    "zone": r.zone or "—",
                    "quartier": r.quartier or "—",
                    "superviseur": r.superviseur or "—",
                    "gestionnaire": r.gestionnaire or "—",
                    "teleconseillere": r.teleconseillere or "",
                    "ca_actuel": ca_curr,
                    "ca_precedent": ca_p,
                    "variation_pct": round(pct, 1),
                    "alerte": alerte,
                    "action": _get_action_baisse(pct),
                })

    declining.sort(key=lambda x: x["variation_pct"])
    critique = [p for p in declining if abs(p["variation_pct"]) > 30]
    haute = [p for p in declining if 15 < abs(p["variation_pct"]) <= 30]
    normale = [p for p in declining if abs(p["variation_pct"]) <= 15]

    return {
        "pdvs": declining,
        "total": len(declining),
        "nb_critique": len(critique),
        "nb_haute": len(haute),
        "nb_normale": len(normale),
        "seuil": seuil_pct,
    }


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
    """Top PDVs de la semaine — enrichi avec infos PDV et évolution vs S-1."""
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1

    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
            PDV.nom,
            PDV.zone,
            PDV.quartier,
            PDV.superviseur,
            PDV.gestionnaire,
            PDV.medaille,
            PDV.commune,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier,
                  PDV.superviseur, PDV.gestionnaire, PDV.medaille, PDV.commune)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .limit(limit)
        .all()
    )

    pdv_ids = [r.numero_pdv for r in rows]
    ca_prec_map = {}
    if pdv_ids:
        prec_rows = (
            db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
            .filter(
                NafamaTransaction.numero_pdv.in_(pdv_ids),
                NafamaTransaction.annee == annee_prec_s,
                NafamaTransaction.semaine == sem_prec,
            )
            .group_by(NafamaTransaction.numero_pdv)
            .all()
        )
        ca_prec_map = {r.numero_pdv: int(r.ca) for r in prec_rows}

    result = []
    for i, r in enumerate(rows):
        ca = int(r.ca)
        ca_prec = ca_prec_map.get(r.numero_pdv, 0)
        evolution = round((ca - ca_prec) / ca_prec * 100, 1) if ca_prec else None
        medaille_val = r.medaille.value if r.medaille and hasattr(r.medaille, 'value') else (str(r.medaille) if r.medaille else None)
        result.append({
            "rang": i + 1,
            "numero_pdv": r.numero_pdv,
            "nom": r.nom or r.numero_pdv,
            "ca": ca,
            "ca_precedent": ca_prec,
            "evolution_pct": evolution,
            "nb_jours_actif": int(r.nb_jours),
            "zone": r.zone or "—",
            "quartier": r.quartier or "—",
            "superviseur": r.superviseur or "—",
            "gestionnaire": r.gestionnaire or "—",
            "medaille": medaille_val,
            "commune": r.commune or "—",
        })
    return result


def get_weekly_pareto(db: Session, annee: int, semaine: int) -> Dict[str, Any]:
    """Pareto hebdomadaire enrichi avec infos PDV, Gini, fort/faible impact."""
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            PDV.nom,
            PDV.zone,
            PDV.quartier,
            PDV.superviseur,
            PDV.gestionnaire,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire)
        .order_by(func.sum(NafamaTransaction.montant).desc())
        .all()
    )
    if not rows:
        return {"items": [], "seuil_80_pct": 0, "nb_pdv_total": 0, "nb_pdv_pareto": 0, "gini_coefficient": 0}

    ca_total = sum(int(r.ca) for r in rows)
    total_pdv = len(rows)
    seuil_80 = 0
    cumul = 0
    items = []
    for i, r in enumerate(rows):
        ca = int(r.ca)
        cumul += ca
        cumul_pct = round(cumul / ca_total * 100, 1) if ca_total else 0
        if seuil_80 == 0 and cumul_pct >= 80:
            seuil_80 = i + 1
        pct_ca = round(ca / ca_total * 100, 2) if ca_total else 0
        items.append({
            "numero_pdv": r.numero_pdv,
            "nom": r.nom or r.numero_pdv,
            "zone": r.zone or "—",
            "quartier": r.quartier or "—",
            "superviseur": r.superviseur or "—",
            "gestionnaire": r.gestionnaire or "—",
            "ca": ca,
            "pct_ca": pct_ca,
            "cumul_pct": cumul_pct,
            "dans_pareto": cumul_pct <= 80,
        })
    if seuil_80 == 0:
        seuil_80 = total_pdv

    gini = _gini([int(r.ca) for r in rows])

    return {
        "items": items,
        "seuil_80_pct": round(seuil_80 / total_pdv * 100, 1),
        "nb_pdv_pareto": seuil_80,
        "nb_pdv_total": total_pdv,
        "ca_total": ca_total,
        "gini_coefficient": gini,
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


def _get_nb_semaines_consecutives_inactif(db: Session, numero_pdv: str, annee: int, semaine: int) -> int:
    """Compte le nombre de semaines consécutives d'inactivité."""
    count = 0
    a, s = annee, semaine
    for _ in range(20):
        exists = db.query(NafamaTransaction.id).filter(
            NafamaTransaction.numero_pdv == numero_pdv,
            NafamaTransaction.annee == a,
            NafamaTransaction.semaine == s,
        ).first()
        if exists:
            break
        count += 1
        s -= 1
        if s == 0:
            s = 52
            a -= 1
    return count


def get_weekly_inactive_pdv(db: Session, annee: int, semaine: int) -> Dict[str, Any]:
    """PDVs inactifs cette semaine — enrichi avec infos PDV, nb semaines consécutives, alerte."""
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1

    pdvs_sem = set(
        r[0] for r in db.query(NafamaTransaction.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .distinct().all()
    )
    rows_prec = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca_prec"),
            PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere)
        .all()
    )

    pdvs = []
    for r in rows_prec:
        if r.numero_pdv not in pdvs_sem:
            nb = _get_nb_semaines_consecutives_inactif(db, r.numero_pdv, annee, semaine)
            alerte = "🔴 Critique" if nb >= 3 else "🟠 Haute" if nb == 2 else "⚪ Normale"
            pdvs.append({
                "numero_pdv": r.numero_pdv,
                "nom": r.nom or r.numero_pdv,
                "zone": r.zone or "—",
                "quartier": r.quartier or "—",
                "superviseur": r.superviseur or "—",
                "gestionnaire": r.gestionnaire or "—",
                "teleconseillere": r.teleconseillere or "",
                "ca_semaine_precedente": int(r.ca_prec),
                "nb_semaines_consecutives_inactif": nb,
                "alerte": alerte,
            })

    pdvs.sort(key=lambda x: x["ca_semaine_precedente"], reverse=True)
    critique = [p for p in pdvs if p["nb_semaines_consecutives_inactif"] >= 3]
    haute = [p for p in pdvs if p["nb_semaines_consecutives_inactif"] == 2]
    normale = [p for p in pdvs if p["nb_semaines_consecutives_inactif"] == 1]

    return {
        "pdvs": pdvs,
        "total": len(pdvs),
        "nb_critique": len(critique),
        "nb_haute": len(haute),
        "nb_normale": len(normale),
        "annee": annee, "semaine": semaine,
    }


def get_weekly_declining_pdv(db: Session, annee: int, semaine: int, seuil_pct: float = -20.0) -> Dict[str, Any]:
    """PDVs en baisse vs semaine précédente — enrichi avec infos PDV, alerte, action."""
    sem_prec = semaine - 1 if semaine > 1 else 52
    annee_prec_s = annee if semaine > 1 else annee - 1

    rows_actuel = (
        db.query(
            NafamaTransaction.numero_pdv,
            func.sum(NafamaTransaction.montant).label("ca"),
            PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee, NafamaTransaction.semaine == semaine)
        .group_by(NafamaTransaction.numero_pdv, PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire, PDV.teleconseillere)
        .all()
    )
    ca_prec_map = {
        r.numero_pdv: int(r.ca)
        for r in db.query(NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label("ca"))
        .filter(NafamaTransaction.annee == annee_prec_s, NafamaTransaction.semaine == sem_prec)
        .group_by(NafamaTransaction.numero_pdv).all()
    }

    declining = []
    for r in rows_actuel:
        ca_curr = int(r.ca)
        ca_p = ca_prec_map.get(r.numero_pdv, 0)
        if ca_p > 0:
            pct = (ca_curr - ca_p) / ca_p * 100
            if pct <= seuil_pct:
                abs_pct = abs(pct)
                alerte = "🔴 Critique" if abs_pct > 30 else "🟠 Haute" if abs_pct > 15 else "⚪ Normale"
                declining.append({
                    "numero_pdv": r.numero_pdv,
                    "nom": r.nom or r.numero_pdv,
                    "zone": r.zone or "—",
                    "quartier": r.quartier or "—",
                    "superviseur": r.superviseur or "—",
                    "gestionnaire": r.gestionnaire or "—",
                    "teleconseillere": r.teleconseillere or "",
                    "ca_actuel": ca_curr,
                    "ca_precedent": ca_p,
                    "variation_pct": round(pct, 1),
                    "alerte": alerte,
                    "action": _get_action_baisse(pct),
                })

    declining.sort(key=lambda x: x["variation_pct"])
    critique = [p for p in declining if abs(p["variation_pct"]) > 30]
    haute = [p for p in declining if 15 < abs(p["variation_pct"]) <= 30]
    normale = [p for p in declining if abs(p["variation_pct"]) <= 15]

    return {
        "pdvs": declining,
        "total": len(declining),
        "nb_critique": len(critique),
        "nb_haute": len(haute),
        "nb_normale": len(normale),
        "seuil": seuil_pct,
    }


# ─────────────────────────────────────────────────────────────
# PROGRESSION (historique complet par PDV)
# ─────────────────────────────────────────────────────────────

def get_monthly_progression(db: Session, annee: int) -> Dict[str, Any]:
    """
    Historique mensuel complet de chaque PDV pour l'année donnée.
    Pour chaque PDV : historique mois par mois, CA max/min, nb fois top10/top50,
    meilleur mois, pire mois, tendance.
    """
    MOIS_ABR = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

    # Tous les PDVs actifs cette année avec leur CA par mois
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            NafamaTransaction.mois,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
            PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee)
        .group_by(NafamaTransaction.numero_pdv, NafamaTransaction.mois,
                  PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire)
        .order_by(NafamaTransaction.numero_pdv, NafamaTransaction.mois)
        .all()
    )

    # Grouper par PDV
    pdv_data = {}
    for r in rows:
        key = r.numero_pdv
        if key not in pdv_data:
            pdv_data[key] = {
                "numero_pdv": r.numero_pdv,
                "nom": r.nom or r.numero_pdv,
                "zone": r.zone or "—",
                "quartier": r.quartier or "—",
                "superviseur": r.superviseur or "—",
                "gestionnaire": r.gestionnaire or "—",
                "historique_mensuel": [],
            }
        pdv_data[key]["historique_mensuel"].append({
            "mois": r.mois,
            "label": MOIS_ABR[r.mois],
            "ca": int(r.ca),
            "nb_jours": int(r.nb_jours),
        })

    # Calculer le rang par mois (top 10 et top 50)
    ca_par_mois = {}
    for pdv_id, info in pdv_data.items():
        for h in info["historique_mensuel"]:
            m = h["mois"]
            if m not in ca_par_mois:
                ca_par_mois[m] = []
            ca_par_mois[m].append((pdv_id, h["ca"]))

    nb_fois_top10 = {k: 0 for k in pdv_data}
    nb_fois_top50 = {k: 0 for k in pdv_data}
    for m, pdv_cas in ca_par_mois.items():
        sorted_pdvs = sorted(pdv_cas, key=lambda x: x[1], reverse=True)
        for i, (pdv_id, _) in enumerate(sorted_pdvs):
            if i < 10:
                nb_fois_top10[pdv_id] = nb_fois_top10.get(pdv_id, 0) + 1
            if i < 50:
                nb_fois_top50[pdv_id] = nb_fois_top50.get(pdv_id, 0) + 1

    # Stats par PDV
    pdvs = []
    ca_reseau_par_mois = {}
    for pdv_id, info in pdv_data.items():
        hist = info["historique_mensuel"]
        cas = [h["ca"] for h in hist if h["ca"] > 0]
        ca_max = max(cas) if cas else 0
        ca_min = min(cas) if cas else 0
        mois_meilleur = next((h["label"] for h in hist if h["ca"] == ca_max), "—") if ca_max else "—"
        mois_pire = next((h["label"] for h in hist if h["ca"] == ca_min), "—") if ca_min else "—"
        est_regulier = len(cas) >= len(ca_par_mois)

        # Tendance : comparer 1er et dernier mois actif
        if len(cas) >= 2:
            premiere = hist[0]["ca"]
            derniere = hist[-1]["ca"]
            tendance = "HAUSSE" if derniere > premiere else "BAISSE" if derniere < premiere else "STABLE"
            variation_globale = round((derniere - premiere) / premiere * 100, 1) if premiere > 0 else 0
        else:
            tendance = "STABLE"
            variation_globale = 0

        for h in hist:
            m = h["mois"]
            ca_reseau_par_mois[m] = ca_reseau_par_mois.get(m, 0) + h["ca"]

        pdvs.append({
            **info,
            "ca_max": ca_max,
            "ca_min": ca_min,
            "mois_meilleur_ca": mois_meilleur,
            "mois_pire_ca": mois_pire,
            "nb_fois_top10": nb_fois_top10.get(pdv_id, 0),
            "nb_fois_top50": nb_fois_top50.get(pdv_id, 0),
            "est_regulier": est_regulier,
            "tendance": tendance,
            "variation_globale": variation_globale,
            "nb_mois_actifs": len(cas),
        })

    pdvs.sort(key=lambda x: x["ca_max"], reverse=True)

    # Meilleur / pire mois du réseau
    meilleur_mois = max(ca_reseau_par_mois, key=ca_reseau_par_mois.get) if ca_reseau_par_mois else None
    pire_mois = min(ca_reseau_par_mois, key=ca_reseau_par_mois.get) if ca_reseau_par_mois else None

    return {
        "pdvs": pdvs,
        "nb_pdv_total": len(pdvs),
        "nb_reguliers": sum(1 for p in pdvs if p["est_regulier"]),
        "nb_hausse": sum(1 for p in pdvs if p["tendance"] == "HAUSSE"),
        "nb_baisse": sum(1 for p in pdvs if p["tendance"] == "BAISSE"),
        "meilleur_mois": {"label": MOIS_ABR[meilleur_mois], "ca_total": ca_reseau_par_mois[meilleur_mois]} if meilleur_mois else None,
        "pire_mois": {"label": MOIS_ABR[pire_mois], "ca_total": ca_reseau_par_mois[pire_mois]} if pire_mois else None,
        "annee": annee,
    }


def get_weekly_progression(db: Session, annee: int) -> Dict[str, Any]:
    """Historique hebdomadaire complet de chaque PDV pour l'année donnée."""
    rows = (
        db.query(
            NafamaTransaction.numero_pdv,
            NafamaTransaction.semaine,
            func.sum(NafamaTransaction.montant).label("ca"),
            func.count(NafamaTransaction.id).label("nb_jours"),
            PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire,
        )
        .outerjoin(PDV, NafamaTransaction.numero_pdv == PDV.numero_pdv)
        .filter(NafamaTransaction.annee == annee)
        .group_by(NafamaTransaction.numero_pdv, NafamaTransaction.semaine,
                  PDV.nom, PDV.zone, PDV.quartier, PDV.superviseur, PDV.gestionnaire)
        .order_by(NafamaTransaction.numero_pdv, NafamaTransaction.semaine)
        .all()
    )

    pdv_data = {}
    for r in rows:
        key = r.numero_pdv
        if key not in pdv_data:
            pdv_data[key] = {
                "numero_pdv": r.numero_pdv,
                "nom": r.nom or r.numero_pdv,
                "zone": r.zone or "—",
                "quartier": r.quartier or "—",
                "superviseur": r.superviseur or "—",
                "gestionnaire": r.gestionnaire or "—",
                "historique_hebdo": [],
            }
        pdv_data[key]["historique_hebdo"].append({
            "semaine": r.semaine,
            "label": f"S{r.semaine}",
            "ca": int(r.ca),
            "nb_jours": int(r.nb_jours),
        })

    ca_par_sem = {}
    for pdv_id, info in pdv_data.items():
        for h in info["historique_hebdo"]:
            s = h["semaine"]
            if s not in ca_par_sem:
                ca_par_sem[s] = []
            ca_par_sem[s].append((pdv_id, h["ca"]))

    nb_fois_top10 = {k: 0 for k in pdv_data}
    nb_fois_top50 = {k: 0 for k in pdv_data}
    for s, pdv_cas in ca_par_sem.items():
        sorted_pdvs = sorted(pdv_cas, key=lambda x: x[1], reverse=True)
        for i, (pdv_id, _) in enumerate(sorted_pdvs):
            if i < 10: nb_fois_top10[pdv_id] = nb_fois_top10.get(pdv_id, 0) + 1
            if i < 50: nb_fois_top50[pdv_id] = nb_fois_top50.get(pdv_id, 0) + 1

    ca_reseau_par_sem = {}
    pdvs = []
    for pdv_id, info in pdv_data.items():
        hist = info["historique_hebdo"]
        cas = [h["ca"] for h in hist if h["ca"] > 0]
        ca_max = max(cas) if cas else 0
        ca_min = min(cas) if cas else 0
        sem_meilleur = next((h["label"] for h in hist if h["ca"] == ca_max), "—") if ca_max else "—"
        sem_pire = next((h["label"] for h in hist if h["ca"] == ca_min), "—") if ca_min else "—"
        est_regulier = len(cas) >= len(ca_par_sem)
        if len(cas) >= 2:
            premiere = hist[0]["ca"]
            derniere = hist[-1]["ca"]
            tendance = "HAUSSE" if derniere > premiere else "BAISSE" if derniere < premiere else "STABLE"
            variation_globale = round((derniere - premiere) / premiere * 100, 1) if premiere > 0 else 0
        else:
            tendance = "STABLE"
            variation_globale = 0
        for h in hist:
            s = h["semaine"]
            ca_reseau_par_sem[s] = ca_reseau_par_sem.get(s, 0) + h["ca"]

        pdvs.append({
            **info,
            "ca_max": ca_max,
            "ca_min": ca_min,
            "sem_meilleure_ca": sem_meilleur,
            "sem_pire_ca": sem_pire,
            "nb_fois_top10": nb_fois_top10.get(pdv_id, 0),
            "nb_fois_top50": nb_fois_top50.get(pdv_id, 0),
            "est_regulier": est_regulier,
            "tendance": tendance,
            "variation_globale": variation_globale,
            "nb_semaines_actives": len(cas),
        })

    pdvs.sort(key=lambda x: x["ca_max"], reverse=True)
    meilleur_sem = max(ca_reseau_par_sem, key=ca_reseau_par_sem.get) if ca_reseau_par_sem else None
    pire_sem = min(ca_reseau_par_sem, key=ca_reseau_par_sem.get) if ca_reseau_par_sem else None

    return {
        "pdvs": pdvs,
        "nb_pdv_total": len(pdvs),
        "nb_reguliers": sum(1 for p in pdvs if p["est_regulier"]),
        "nb_hausse": sum(1 for p in pdvs if p["tendance"] == "HAUSSE"),
        "nb_baisse": sum(1 for p in pdvs if p["tendance"] == "BAISSE"),
        "meilleure_semaine": {"label": f"S{meilleur_sem}", "ca_total": ca_reseau_par_sem[meilleur_sem]} if meilleur_sem else None,
        "pire_semaine": {"label": f"S{pire_sem}", "ca_total": ca_reseau_par_sem[pire_sem]} if pire_sem else None,
        "annee": annee,
    }


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
