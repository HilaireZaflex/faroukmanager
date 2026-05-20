"""
Service pour la gestion des Grades & Qualification des PDVs.
Grades: Diamant, Or, Argent, Fer, Cuivre, Inactif
Critères basés sur : CA mensuel + activité (est_actif / nb_operations)
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance
from typing import Optional

# Seuils par défaut (FCFA) — modifiables via l'API
DEFAULT_SEUILS = {
    "diamant": 1_800_000,   # CA > 1.8M FCFA/mois → Diamant
    "or":      1_200_000,   # CA > 1.2M FCFA/mois → Or
    "argent":    700_000,   # CA > 700K FCFA/mois → Argent
    "fer":       300_000,   # CA > 300K FCFA/mois → Fer
    "cuivre":          1,   # CA > 0 → Cuivre
}

# Seuils d'opérations minimales par grade
DEFAULT_OPS_SEUILS = {
    "diamant": 40,   # ~40 opérations/mois
    "or":      25,   # ~25 opérations/mois
    "argent":  15,   # ~15 opérations/mois
    "fer":      5,   # ~5 opérations/mois
    "cuivre":   1,   # au moins une opération
}

GRADE_META = {
    "diamant": {"emoji": "💎", "label": "Diamant", "color": "#00d6ff", "bg": "rgba(0,214,255,0.12)"},
    "or":      {"emoji": "🥇", "label": "Or",      "color": "#FFD700", "bg": "rgba(255,215,0,0.12)"},
    "argent":  {"emoji": "🥈", "label": "Argent",  "color": "#C0C0C0", "bg": "rgba(192,192,192,0.12)"},
    "fer":     {"emoji": "🦾", "label": "Fer",     "color": "#888888", "bg": "rgba(136,136,136,0.12)"},
    "cuivre":  {"emoji": "🟤", "label": "Cuivre",  "color": "#CD7F32", "bg": "rgba(205,127,50,0.12)"},
    "inactif": {"emoji": "⬜", "label": "Inactif", "color": "#ff3d71", "bg": "rgba(255,61,113,0.12)"},
}


def _calcule_grade(ca: float, nb_ops: int, est_actif: bool, seuils: dict, ops_seuils: dict) -> str:
    if ca <= 0 or not est_actif:
        return "inactif"
    if ca >= seuils["diamant"] and nb_ops >= ops_seuils["diamant"]:
        return "diamant"
    if ca >= seuils["or"] and nb_ops >= ops_seuils["or"]:
        return "or"
    if ca >= seuils["argent"] and nb_ops >= ops_seuils["argent"]:
        return "argent"
    if ca >= seuils["fer"] and nb_ops >= ops_seuils["fer"]:
        return "fer"
    if ca > 0 and nb_ops >= ops_seuils["cuivre"]:
        return "cuivre"
    return "inactif"


def get_grades_overview(
    db: Session, annee: int, mois: int,
    seuils: Optional[dict] = None, ops_seuils: Optional[dict] = None
):
    """Vue globale : répartition des PDVs par grade + détail."""
    seuils = seuils or DEFAULT_SEUILS
    ops_seuils = ops_seuils or DEFAULT_OPS_SEUILS

    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    pdv_map = {p.id: p for p in pdvs}
    pdv_ids = [p.id for p in pdvs]

    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()
    perf_map = {p.pdv_id: p for p in perfs}

    grades = {g: [] for g in GRADE_META}

    for pdv in pdvs:
        perf = perf_map.get(pdv.id)
        ca = perf.ca or 0 if perf else 0
        nb_ops = perf.nb_operations or 0 if perf else 0
        est_actif = perf.est_actif if perf else False
        grade = _calcule_grade(ca, nb_ops, est_actif, seuils, ops_seuils)
        grades[grade].append({
            "pdv_id": pdv.id,
            "pdv_nom": pdv.nom,
            "zone": pdv.zone or "—",
            "sous_zone": pdv.sous_zone or "—",
            "quartier": pdv.quartier or "—",
            "gestionnaire": pdv.gestionnaire or "—",
            "superviseur": pdv.superviseur or "—",
            "ca": ca,
            "nb_operations": nb_ops,
            "est_actif": est_actif,
            "grade": grade,
        })

    # Trier par CA desc dans chaque grade
    for g in grades:
        grades[g].sort(key=lambda x: x["ca"], reverse=True)

    summary = []
    for g, meta in GRADE_META.items():
        pdv_list = grades[g]
        ca_total = sum(p["ca"] for p in pdv_list)
        summary.append({
            "grade": g,
            **meta,
            "nb_pdvs": len(pdv_list),
            "ca_total": ca_total,
            "pdvs": pdv_list,
        })

    return {"summary": summary, "seuils": seuils, "ops_seuils": ops_seuils}


def get_grades_evolution(
    db: Session, annee: int, mois: int,
    seuils: Optional[dict] = None, ops_seuils: Optional[dict] = None
):
    """Évolution : PDVs qui ont monté ou descendu de grade vs mois précédent."""
    seuils = seuils or DEFAULT_SEUILS
    ops_seuils = ops_seuils or DEFAULT_OPS_SEUILS

    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    pdv_map = {p.id: p for p in pdvs}
    pdv_ids = [p.id for p in pdvs]

    def get_perf_map(a, m):
        perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.pdv_id.in_(pdv_ids),
            MonthlyPerformance.annee == a,
            MonthlyPerformance.mois == m
        ).all()
        return {p.pdv_id: p for p in perfs}

    curr_map = get_perf_map(annee, mois)
    prev_map = get_perf_map(annee_prec, mois_prec)

    GRADE_ORDER = ["inactif", "cuivre", "fer", "argent", "or", "diamant"]

    montes, descendus, stables = [], [], []

    for pdv in pdvs:
        curr = curr_map.get(pdv.id)
        prev = prev_map.get(pdv.id)

        grade_curr = _calcule_grade(
            curr.ca or 0 if curr else 0,
            curr.nb_operations or 0 if curr else 0,
            curr.est_actif if curr else False,
            seuils, ops_seuils
        )
        grade_prev = _calcule_grade(
            prev.ca or 0 if prev else 0,
            prev.nb_operations or 0 if prev else 0,
            prev.est_actif if prev else False,
            seuils, ops_seuils
        )

        entry = {
            "pdv_id": pdv.id, "pdv_nom": pdv.nom,
            "zone": pdv.zone or "—", "gestionnaire": pdv.gestionnaire or "—",
            "grade_actuel": grade_curr, "grade_precedent": grade_prev,
            "ca_actuel": curr.ca or 0 if curr else 0,
            "ca_precedent": prev.ca or 0 if prev else 0,
        }

        idx_curr = GRADE_ORDER.index(grade_curr)
        idx_prev = GRADE_ORDER.index(grade_prev)

        if idx_curr > idx_prev:
            montes.append(entry)
        elif idx_curr < idx_prev:
            descendus.append(entry)
        else:
            stables.append(entry)

    return {
        "montes": sorted(montes, key=lambda x: x["ca_actuel"], reverse=True),
        "descendus": sorted(descendus, key=lambda x: x["ca_actuel"], reverse=True),
        "stables": stables,
        "stats": {
            "nb_montes": len(montes),
            "nb_descendus": len(descendus),
            "nb_stables": len(stables),
        }
    }


def get_alertes_degradation(
    db: Session, annee: int, mois: int,
    seuils: Optional[dict] = None, ops_seuils: Optional[dict] = None
):
    """
    PDVs à risque de descendre de grade : CA actuel entre 80% et 100% du seuil de leur grade.
    """
    seuils = seuils or DEFAULT_SEUILS
    ops_seuils = ops_seuils or DEFAULT_OPS_SEUILS

    overview = get_grades_overview(db, annee, mois, seuils, ops_seuils)
    alertes = []

    seuil_list = [
        ("diamant", seuils["diamant"]),
        ("or",      seuils["or"]),
        ("argent",  seuils["argent"]),
        ("fer",     seuils["fer"]),
    ]

    for item in overview["summary"]:
        grade = item["grade"]
        if grade == "inactif":
            continue
        # Trouver le seuil du grade actuel
        seuil_grade = next((s for g, s in seuil_list if g == grade), None)
        if not seuil_grade:
            continue
        for pdv in item["pdvs"]:
            ca = pdv["ca"]
            if seuil_grade > 0 and ca < seuil_grade * 1.1:
                pct_seuil = round(ca / seuil_grade * 100, 1)
                alertes.append({
                    **pdv,
                    "seuil_grade": seuil_grade,
                    "pct_seuil": pct_seuil,
                    "risque": "eleve" if pct_seuil < 90 else "modere",
                })

    alertes.sort(key=lambda x: x["pct_seuil"])
    return alertes


def get_classement_par_grade(
    db: Session, annee: int, mois: int,
    grade_filter: Optional[str] = None,
    seuils: Optional[dict] = None, ops_seuils: Optional[dict] = None
):
    """Liste paginée des PDVs dans chaque grade."""
    overview = get_grades_overview(db, annee, mois, seuils, ops_seuils)
    if grade_filter:
        for item in overview["summary"]:
            if item["grade"] == grade_filter:
                return item["pdvs"]
        return []
    return overview
