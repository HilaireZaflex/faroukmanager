from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import Optional
from app.core.database import get_db
from app.models.pdv import PDV, PDVStatut, PDVType
from app.models.performance import MonthlyPerformance, WeeklyPerformance

router = APIRouter()

def _get_pdv_map(db):
    """Retourne un dict {pdv_id: pdv} pour tous les PDVs actifs."""
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    return {p.id: p for p in pdvs}

def _filter_perfs_by_pdv(performances, pdv_map, zone=None, superviseur=None, gestionnaire=None, type_pdv=None, quartier=None, sous_zone=None):
    """Filtre les performances selon les critères PDV."""
    result = []
    for p in performances:
        pdv = pdv_map.get(p.pdv_id)
        if not pdv:
            continue
        if zone and pdv.zone != zone:
            continue
        if superviseur and pdv.superviseur != superviseur:
            continue
        if gestionnaire and pdv.gestionnaire != gestionnaire:
            continue
        if type_pdv and pdv.type_pdv.value != type_pdv:
            continue
        if quartier and pdv.quartier != quartier:
            continue
        if sous_zone and pdv.sous_zone != sous_zone:
            continue
        result.append((p, pdv))
    return result

def _build_classement(perf_pdv_pairs, key_fn, top_n=10):
    """Construit un classement top/bottom N."""
    sorted_pairs = sorted(perf_pdv_pairs, key=lambda x: key_fn(x[0]), reverse=True)
    def to_dict(rank, p, pdv):
        return {
            "rang": rank,
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "type_pdv": pdv.type_pdv.value,
            "quartier": pdv.quartier,
            "medaille": pdv.medaille.value if pdv.medaille else "AUCUNE",
            "ca": p.ca,
            "nb_operations": p.nb_operations,
            "nb_depots": p.nb_depots,
            "montant_depots": p.montant_depots,
            "nb_retraits": p.nb_retraits,
            "montant_retraits": p.montant_retraits,
            "taux_variation": p.taux_variation,
            "est_actif": p.est_actif,
        }
    top = [to_dict(i+1, p, pdv) for i, (p, pdv) in enumerate(sorted_pairs[:top_n])]
    bottom = [to_dict(i+1, p, pdv) for i, (p, pdv) in enumerate(reversed(sorted_pairs[-top_n:]))]
    return top, bottom


@router.get("/dashboard/monthly")
def monthly_dashboard(
    db: Session = Depends(get_db),
    annee: int = Query(2025),
    mois: int = Query(12, ge=1, le=12),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    gestionnaire: Optional[str] = None,
    type_pdv: Optional[str] = None,
    quartier: Optional[str] = None,
    sous_zone: Optional[str] = None,
    top_n: int = Query(10, ge=1, le=100),
):
    """Dashboard mensuel complet — M2 du CDC."""
    # Toutes les perfs du mois
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, quartier, sous_zone)

    if not pairs:
        # Fallback : mois précédents disponibles
        latest = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).distinct().order_by(
            MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
        ).first()
        if latest:
            all_perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.annee == latest[0],
                MonthlyPerformance.mois == latest[1]
            ).all()
            annee, mois = latest
            pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, quartier, sous_zone)

    # KPIs globaux
    total_ca = sum(p.ca for p, _ in pairs)
    total_operations = sum(p.nb_operations for p, _ in pairs)
    total_depots = sum(p.nb_depots for p, _ in pairs)
    montant_depots = sum(p.montant_depots for p, _ in pairs)
    total_retraits = sum(p.nb_retraits for p, _ in pairs)
    montant_retraits = sum(p.montant_retraits for p, _ in pairs)
    active_pdvs = sum(1 for p, _ in pairs if p.est_actif)
    inactive_pdvs = len(pairs) - active_pdvs
    taux_activite = (active_pdvs / len(pairs) * 100) if pairs else 0.0
    avg_ca = total_ca / len(pairs) if pairs else 0.0

    # Taux de variation moyen vs mois précédent
    variations = [p.taux_variation for p, _ in pairs if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0

    # CA cumulé (somme des mois 1..mois)
    ca_cumule_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois <= mois
    ).all()
    ca_cumule_pairs = _filter_perfs_by_pdv(ca_cumule_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, quartier, sous_zone)
    ca_cumule = sum(p.ca for p, _ in ca_cumule_pairs)

    # Répartition par zone
    ca_by_zone = {}
    for p, pdv in pairs:
        z = pdv.zone or "Inconnue"
        ca_by_zone[z] = ca_by_zone.get(z, 0) + p.ca

    # Répartition par superviseur
    ca_by_superviseur = {}
    for p, pdv in pairs:
        s = pdv.superviseur or "Non assigné"
        ca_by_superviseur[s] = ca_by_superviseur.get(s, 0) + p.ca

    # Répartition par type PDV
    ca_by_type = {}
    count_by_type = {}
    for p, pdv in pairs:
        t = pdv.type_pdv.value
        ca_by_type[t] = ca_by_type.get(t, 0) + p.ca
        count_by_type[t] = count_by_type.get(t, 0) + 1

    # Répartition par gestionnaire
    ca_by_gestionnaire = {}
    for p, pdv in pairs:
        g = pdv.gestionnaire or "Non assigné"
        ca_by_gestionnaire[g] = ca_by_gestionnaire.get(g, 0) + p.ca

    # Classements CA
    top_ca, bottom_ca = _build_classement(pairs, lambda p: p.ca, top_n)

    # Classements dépôts
    top_depots, bottom_depots = _build_classement(pairs, lambda p: p.montant_depots, top_n)

    # Classements retraits
    top_retraits, bottom_retraits = _build_classement(pairs, lambda p: p.montant_retraits, top_n)

    # Classements par superviseur
    classement_superviseur = {}
    for p, pdv in pairs:
        s = pdv.superviseur or "Non assigné"
        if s not in classement_superviseur:
            classement_superviseur[s] = {"ca": 0, "nb_pdvs": 0, "actifs": 0, "inactifs": 0}
        classement_superviseur[s]["ca"] += p.ca
        classement_superviseur[s]["nb_pdvs"] += 1
        if p.est_actif:
            classement_superviseur[s]["actifs"] += 1
        else:
            classement_superviseur[s]["inactifs"] += 1
    classement_superviseur_list = sorted(
        [{"superviseur": k, "ca_total": v["ca"], "ca_moyen": v["ca"] / v["nb_pdvs"] if v["nb_pdvs"] else 0, **v}
         for k, v in classement_superviseur.items()],
        key=lambda x: x["ca_total"], reverse=True
    )

    # Classements par gestionnaire
    classement_gestionnaire = {}
    for p, pdv in pairs:
        g = pdv.gestionnaire or "Non assigné"
        if g not in classement_gestionnaire:
            classement_gestionnaire[g] = {"ca": 0, "nb_pdvs": 0, "actifs": 0}
        classement_gestionnaire[g]["ca"] += p.ca
        classement_gestionnaire[g]["nb_pdvs"] += 1
        if p.est_actif:
            classement_gestionnaire[g]["actifs"] += 1
    classement_gestionnaire_list = sorted(
        [{"gestionnaire": k, **v} for k, v in classement_gestionnaire.items()],
        key=lambda x: x["ca"], reverse=True
    )

    # PDV à traiter en urgence (CA très faible, actifs)
    urgents = sorted(
        [(p, pdv) for p, pdv in pairs if p.est_actif and p.ca < avg_ca * 0.3],
        key=lambda x: x[0].ca
    )[:top_n]

    return {
        "annee": annee,
        "mois": mois,
        # KPIs principaux
        "total_ca": total_ca,
        "ca_cumule": ca_cumule,
        "total_operations": total_operations,
        "total_depots": total_depots,
        "montant_depots": montant_depots,
        "total_retraits": total_retraits,
        "montant_retraits": montant_retraits,
        "active_pdvs": active_pdvs,
        "inactive_pdvs": inactive_pdvs,
        "total_pdvs": len(pairs),
        "taux_activite": taux_activite,
        "average_ca": avg_ca,
        "avg_variation": avg_variation,
        # Répartitions
        "ca_by_zone": ca_by_zone,
        "ca_by_superviseur": ca_by_superviseur,
        "ca_by_gestionnaire": ca_by_gestionnaire,
        "ca_by_type": ca_by_type,
        "count_by_type": count_by_type,
        # Classements
        "top_pdvs_ca": top_ca,
        "bottom_pdvs_ca": bottom_ca,
        "top_pdvs_depots": top_depots,
        "bottom_pdvs_depots": bottom_depots,
        "top_pdvs_retraits": top_retraits,
        "bottom_pdvs_retraits": bottom_retraits,
        "classement_superviseurs": classement_superviseur_list,
        "classement_gestionnaires": classement_gestionnaire_list,
        "pdvs_urgents": [
            {"pdv_id": pdv.id, "nom": pdv.nom, "zone": pdv.zone, "superviseur": pdv.superviseur, "ca": p.ca}
            for p, pdv in urgents
        ],
    }


@router.get("/dashboard/weekly")
def weekly_dashboard(
    db: Session = Depends(get_db),
    annee: int = Query(2025),
    semaine: int = Query(50, ge=1, le=52),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    gestionnaire: Optional[str] = None,
    type_pdv: Optional[str] = None,
    sous_zone: Optional[str] = None,
    top_n: int = Query(10, ge=1, le=100),
):
    """Dashboard hebdomadaire complet — M3 du CDC."""
    all_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee,
        WeeklyPerformance.semaine == semaine
    ).all()
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, sous_zone=sous_zone)

    # Fallback : dernière semaine disponible
    if not pairs:
        latest = db.query(WeeklyPerformance.annee, WeeklyPerformance.semaine).distinct().order_by(
            WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()
        ).first()
        if latest:
            all_perfs = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.annee == latest[0],
                WeeklyPerformance.semaine == latest[1]
            ).all()
            annee, semaine = latest
            pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv)

    total_ca = sum(p.ca for p, _ in pairs)
    total_operations = sum(p.nb_operations for p, _ in pairs)
    total_depots = sum(p.nb_depots for p, _ in pairs)
    total_retraits = sum(p.nb_retraits for p, _ in pairs)
    montant_depots = sum(p.montant_depots for p, _ in pairs)
    montant_retraits = sum(p.montant_retraits for p, _ in pairs)
    active_pdvs = sum(1 for p, _ in pairs if p.est_actif)
    inactive_pdvs = len(pairs) - active_pdvs
    taux_activite = (active_pdvs / len(pairs) * 100) if pairs else 0.0
    variations = [p.taux_variation for p, _ in pairs if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0

    ca_by_zone = {}
    for p, pdv in pairs:
        z = pdv.zone or "Inconnue"
        ca_by_zone[z] = ca_by_zone.get(z, 0) + p.ca

    ca_by_superviseur = {}
    for p, pdv in pairs:
        s = pdv.superviseur or "Non assigné"
        ca_by_superviseur[s] = ca_by_superviseur.get(s, 0) + p.ca

    ca_by_type = {}
    for p, pdv in pairs:
        t = pdv.type_pdv.value
        ca_by_type[t] = ca_by_type.get(t, 0) + p.ca

    # Listes actifs/inactifs
    actifs_list = [
        {"pdv_id": pdv.id, "nom": pdv.nom, "zone": pdv.zone, "superviseur": pdv.superviseur,
         "gestionnaire": pdv.gestionnaire, "type_pdv": pdv.type_pdv.value, "ca": p.ca, "nb_operations": p.nb_operations}
        for p, pdv in pairs if p.est_actif
    ]
    inactifs_list = [
        {"pdv_id": pdv.id, "nom": pdv.nom, "zone": pdv.zone, "superviseur": pdv.superviseur,
         "gestionnaire": pdv.gestionnaire, "type_pdv": pdv.type_pdv.value, "teleconseillere": pdv.teleconseillere}
        for p, pdv in pairs if not p.est_actif
    ]

    # Actifs/inactifs par superviseur
    presence_par_superviseur = {}
    for p, pdv in pairs:
        s = pdv.superviseur or "Non assigné"
        if s not in presence_par_superviseur:
            presence_par_superviseur[s] = {"actifs": 0, "inactifs": 0, "ca": 0}
        if p.est_actif:
            presence_par_superviseur[s]["actifs"] += 1
        else:
            presence_par_superviseur[s]["inactifs"] += 1
        presence_par_superviseur[s]["ca"] += p.ca

    # Actifs/inactifs par type
    presence_par_type = {}
    for p, pdv in pairs:
        t = pdv.type_pdv.value
        if t not in presence_par_type:
            presence_par_type[t] = {"actifs": 0, "inactifs": 0, "ca": 0}
        if p.est_actif:
            presence_par_type[t]["actifs"] += 1
        else:
            presence_par_type[t]["inactifs"] += 1
        presence_par_type[t]["ca"] += p.ca

    # Top/Bottom CA
    top_ca, bottom_ca = _build_classement(pairs, lambda p: p.ca, top_n)

    # Indicateurs colorés : hausse/baisse/stable
    hausses = [(p, pdv) for p, pdv in pairs if p.taux_variation and p.taux_variation > 5]
    baisses = [(p, pdv) for p, pdv in pairs if p.taux_variation and p.taux_variation < -5]
    stables = [(p, pdv) for p, pdv in pairs if p.taux_variation and -5 <= p.taux_variation <= 5]

    return {
        "annee": annee,
        "semaine": semaine,
        # KPIs
        "total_ca": total_ca,
        "total_operations": total_operations,
        "total_depots": total_depots,
        "montant_depots": montant_depots,
        "total_retraits": total_retraits,
        "montant_retraits": montant_retraits,
        "active_pdvs": active_pdvs,
        "inactive_pdvs": inactive_pdvs,
        "total_pdvs": len(pairs),
        "taux_activite": taux_activite,
        "avg_variation": avg_variation,
        # Répartitions
        "ca_by_zone": ca_by_zone,
        "ca_by_superviseur": ca_by_superviseur,
        "ca_by_type": ca_by_type,
        # Listes de présence
        "actifs_list": actifs_list,
        "inactifs_list": inactifs_list,
        "presence_par_superviseur": presence_par_superviseur,
        "presence_par_type": presence_par_type,
        # Indicateurs colorés
        "nb_hausses": len(hausses),
        "nb_baisses": len(baisses),
        "nb_stables": len(stables),
        # Classements
        "top_pdvs": top_ca,
        "bottom_pdvs": bottom_ca,
    }


@router.get("/dashboard/pareto")
def pareto_analysis(
    db: Session = Depends(get_db),
    annee: int = Query(2025),
    mois: int = Query(12, ge=1, le=12),
    zone: Optional[str] = None,
    cible: float = Query(80.0, ge=1, le=100),
):
    """Analyse Pareto 80/20 — M4 du CDC."""
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone)

    if not pairs:
        return {"total_ca": 0, "pareto_pdvs": [], "top_20_percent": [], "gini_coefficient": 0}

    total_ca = sum(p.ca for p, _ in pairs)
    sorted_pairs = sorted(pairs, key=lambda x: x[0].ca, reverse=True)

    pareto_list = []
    cumul = 0
    pareto_count = 0
    for p, pdv in sorted_pairs:
        cumul += p.ca
        pct = (cumul / total_ca * 100) if total_ca else 0
        pareto_list.append({
            "rang": len(pareto_list) + 1,
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "ca": p.ca,
            "pct_ca": (p.ca / total_ca * 100) if total_ca else 0,
            "cumul_ca": cumul,
            "cumul_pct": pct,
            "dans_pareto": pct <= cible,
        })
        if pct <= cible:
            pareto_count += 1

    # Gini
    cas = [p.ca for p, _ in pairs]
    cas.sort()
    n = len(cas)
    gini = 0
    if n > 1 and sum(cas) > 0:
        cumul_cas = 0
        for i, c in enumerate(cas):
            cumul_cas += c
        numerator = sum((2 * (i + 1) - n - 1) * c for i, c in enumerate(cas))
        gini = abs(numerator) / (n * sum(cas))

    top_20 = pareto_list[:max(1, int(len(pareto_list) * 0.2))]
    top_20_ca = sum(p["ca"] for p in top_20)

    return {
        "annee": annee,
        "mois": mois,
        "total_ca": total_ca,
        "total_pdvs": len(pairs),
        "pareto_count": pareto_count,
        "pareto_percentage": (pareto_count / len(pairs) * 100) if pairs else 0,
        "gini_coefficient": round(gini, 4),
        "pareto_pdvs": pareto_list,
        "top_20_percent": top_20,
        "top_20_ca": top_20_ca,
        "cible": cible,
    }


@router.get("/dashboard/classements")
def classements(
    db: Session = Depends(get_db),
    annee: int = Query(2025),
    mois: int = Query(12, ge=1, le=12),
    n: int = Query(10, ge=1, le=100),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    type_pdv: Optional[str] = None,
):
    """Classements Top/Bottom N — M2 du CDC."""
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur, type_pdv=type_pdv)

    # Fallback si pas de données pour ce mois
    if not pairs:
        latest = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).distinct().order_by(
            MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
        ).first()
        if latest:
            all_perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.annee == latest[0],
                MonthlyPerformance.mois == latest[1]
            ).all()
            pairs = _filter_perfs_by_pdv(all_perfs, pdv_map)

    top_ca, bottom_ca = _build_classement(pairs, lambda p: p.ca, n)
    top_depots, bottom_depots = _build_classement(pairs, lambda p: p.montant_depots, n)
    top_retraits, bottom_retraits = _build_classement(pairs, lambda p: p.montant_retraits, n)
    top_ops, bottom_ops = _build_classement(pairs, lambda p: p.nb_operations, n)

    # Par superviseur
    by_superviseur = {}
    for p, pdv in pairs:
        s = pdv.superviseur or "Non assigné"
        if s not in by_superviseur:
            by_superviseur[s] = []
        by_superviseur[s].append((p, pdv))
    top_by_sup = {}
    for s, sp in by_superviseur.items():
        t, b = _build_classement(sp, lambda p: p.ca, min(n, len(sp)))
        top_by_sup[s] = {"top": t, "bottom": b}

    # Par type PDV
    by_type = {}
    for p, pdv in pairs:
        t = pdv.type_pdv.value
        if t not in by_type:
            by_type[t] = []
        by_type[t].append((p, pdv))
    top_by_type = {}
    for t, tp in by_type.items():
        tt, bt = _build_classement(tp, lambda p: p.ca, min(n, len(tp)))
        top_by_type[t] = {"top": tt, "bottom": bt}

    # Par quartier
    by_quartier = {}
    for p, pdv in pairs:
        q = pdv.quartier or "Non assigné"
        if q not in by_quartier:
            by_quartier[q] = []
        by_quartier[q].append((p, pdv))
    top_by_quartier = {}
    for q, qp in by_quartier.items():
        t, b = _build_classement(qp, lambda p: p.ca, min(n, len(qp)))
        top_by_quartier[q] = {"top": t, "bottom": b}

    # Par gestionnaire
    by_gestionnaire = {}
    for p, pdv in pairs:
        g = pdv.gestionnaire or "Non assigné"
        if g not in by_gestionnaire:
            by_gestionnaire[g] = []
        by_gestionnaire[g].append((p, pdv))
    top_by_gest = {}
    for g, gp in by_gestionnaire.items():
        t, b = _build_classement(gp, lambda p: p.ca, min(n, len(gp)))
        top_by_gest[g] = {"top": t, "bottom": b}

    return {
        "annee": annee, "mois": mois, "top_n": n,
        # Globaux
        "top": top_ca,  # alias pour compatibilité frontend
        "bottom": bottom_ca,
        "top_pdvs_ca": top_ca,
        "bottom_pdvs_ca": bottom_ca,
        "top_pdvs_depots": top_depots,
        "bottom_pdvs_depots": bottom_depots,
        "top_pdvs_retraits": top_retraits,
        "bottom_pdvs_retraits": bottom_retraits,
        "top_pdvs_operations": top_ops,
        "bottom_pdvs_operations": bottom_ops,
        # Par catégorie
        "top_by_superviseur": top_by_sup,
        "top_by_type": top_by_type,
        "top_by_quartier": top_by_quartier,
        "top_by_gestionnaire": top_by_gest,
    }


@router.get("/dashboard/pdv-records")
def pdv_records(db: Session = Depends(get_db)):
    """PDV records: CA max, CA min, nombre de fois dans top 10 (12 derniers mois)"""
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    
    # Get last 12 months of data
    latest_12_months = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).distinct().order_by(
        MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
    ).limit(12).all()
    
    records = []
    
    for pdv in pdvs:
        perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.pdv_id == pdv.id
        ).order_by(MonthlyPerformance.ca.desc()).all()
        
        if not perfs:
            continue
        
        ca_max = perfs[0].ca
        ca_min = perfs[-1].ca if perfs else 0
        mois_ca_max = f"{perfs[0].annee}-{perfs[0].mois:02d}" if perfs else ""
        
        # Count how many times in top 10 per month
        top_10_count = 0
        for annee, mois in latest_12_months:
            month_perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.annee == annee,
                MonthlyPerformance.mois == mois
            ).order_by(MonthlyPerformance.ca.desc()).limit(10).all()
            
            if any(p.pdv_id == pdv.id for p in month_perfs):
                top_10_count += 1
        
        records.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "gestionnaire": pdv.gestionnaire,
            "ca_max": round(ca_max, 0),
            "mois_ca_max": mois_ca_max,
            "ca_min": round(ca_min, 0),
            "nb_fois_top10": top_10_count,
            "health_score": round(pdv.health_score, 1),
            "segment": pdv.segment
        })
    
    # Sort by ca_max descending
    records = sorted(records, key=lambda x: x["ca_max"], reverse=True)
    
    return {
        "total_pdvs": len(records),
        "records": records,
        "period_months": len(latest_12_months)
    }


@router.get("/dashboard/network-stats")
def network_stats(db: Session = Depends(get_db)):
    """Statistiques globales du réseau."""
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    from sqlalchemy import desc
    latest = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).distinct().order_by(
        MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
    ).first()
    ca_total = 0
    ca_mois = 0
    if latest:
        perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.annee == latest[0],
            MonthlyPerformance.mois == latest[1]
        ).all()
        ca_mois = sum(p.ca for p in perfs)
        ca_total = db.query(func.sum(MonthlyPerformance.ca)).scalar() or 0

    health_scores = [p.health_score for p in pdvs if p.health_score]
    avg_health = sum(health_scores) / len(health_scores) if health_scores else 0
    zones = set(p.zone for p in pdvs if p.zone)
    superviseurs = set(p.superviseur for p in pdvs if p.superviseur)
    actifs = sum(1 for p in pdvs if p.statut.value == "ACTIF")
    inactifs = sum(1 for p in pdvs if p.statut.value == "INACTIF")

    return {
        "total_pdvs": len(pdvs),
        "actifs": actifs,
        "inactifs": inactifs,
        "taux_activite": (actifs / len(pdvs) * 100) if pdvs else 0,
        "ca_total_historique": ca_total,
        "ca_dernier_mois": ca_mois,
        "average_ca": ca_mois / actifs if actifs else 0,
        "zones_count": len(zones),
        "superviseurs_count": len(superviseurs),
        "average_health_score": round(avg_health, 1),
    }
# New endpoints to add to dashboard.py

@router.get("/dashboard/monthly-inactive")
def monthly_inactive(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    mois: int = Query(..., ge=1, le=12),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
):
    """Retourne les PDVs inactifs pour un mois donné."""
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois,
        MonthlyPerformance.est_actif == False
    ).all()
    
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur)
    
    result_pdvs = []
    for p, pdv in pairs:
        # Compter les mois consécutifs inactifs avant ce mois
        nb_mois_inactif = 1
        prev_mois = mois - 1
        prev_annee = annee
        if prev_mois == 0:
            prev_mois = 12
            prev_annee -= 1
        
        while True:
            prev_perf = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.pdv_id == pdv.id,
                MonthlyPerformance.annee == prev_annee,
                MonthlyPerformance.mois == prev_mois
            ).first()
            
            if not prev_perf or prev_perf.est_actif:
                break
            
            nb_mois_inactif += 1
            prev_mois -= 1
            if prev_mois == 0:
                prev_mois = 12
                prev_annee -= 1
        
        # Déterminer l'alerte
        if nb_mois_inactif >= 3:
            alerte = "CRITIQUE"
        elif nb_mois_inactif == 2:
            alerte = "HAUTE"
        else:
            alerte = "NORMALE"
        
        result_pdvs.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "sous_zone": pdv.sous_zone,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "teleconseillere": pdv.teleconseillere,
            "telephone": pdv.telephone,
            "nom_gerant": pdv.nom_gerant,
            "numero_personnel": pdv.numero_personnel,
            "type_pdv": pdv.type_pdv.value,
            "nb_mois_consecutifs_inactif": nb_mois_inactif,
            "alerte": alerte,
        })
    
    return {
        "annee": annee,
        "mois": mois,
        "count": len(result_pdvs),
        "pdvs": result_pdvs,
    }


@router.get("/dashboard/monthly-declining")
def monthly_declining(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    mois: int = Query(..., ge=1, le=12),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    seuil: float = Query(-10.0),
):
    """Retourne les PDVs en baisse par rapport au mois précédent."""
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()
    
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur)
    
    result_pdvs = []
    for p, pdv in pairs:
        if p.taux_variation is not None and p.taux_variation <= seuil:
            # Déterminer l'alerte basée sur la baisse
            baisse_pct = abs(p.taux_variation)
            if baisse_pct > 30:
                alerte = "CRITIQUE"
            elif baisse_pct > 15:
                alerte = "HAUTE"
            else:
                alerte = "NORMALE"
            
            result_pdvs.append({
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "zone": pdv.zone,
                "sous_zone": pdv.sous_zone,
                "superviseur": pdv.superviseur,
                "gestionnaire": pdv.gestionnaire,
                "teleconseillere": pdv.teleconseillere,
                "telephone": pdv.telephone,
                "nom_gerant": pdv.nom_gerant,
                "numero_personnel": pdv.numero_personnel,
                "type_pdv": pdv.type_pdv.value,
                "ca": p.ca,
                "ca_precedent": p.ca_mois_precedent,
                "taux_baisse": p.taux_variation,
                "nb_operations": p.nb_operations,
                "alerte": alerte,
            })
    
    # Trier par taux de baisse décroissant
    result_pdvs = sorted(result_pdvs, key=lambda x: x["taux_baisse"])
    
    return {
        "annee": annee,
        "mois": mois,
        "count": len(result_pdvs),
        "seuil": seuil,
        "pdvs": result_pdvs,
    }


@router.get("/dashboard/monthly-evolution")
def monthly_evolution(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    mois: int = Query(..., ge=1, le=12),
    zone: Optional[str] = None,
):
    """Comparaison CA mois actuel vs mois précédent (jointure réelle)."""
    # Mois précédent
    if mois == 1:
        prev_mois, prev_annee = 12, annee - 1
    else:
        prev_mois, prev_annee = mois - 1, annee

    pdv_map = _get_pdv_map(db)

    # Performances mois actuel
    perfs_actuel = {p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois
    ).all()}

    # Performances mois précédent (jointure réelle)
    perfs_precedent = {p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == prev_annee, MonthlyPerformance.mois == prev_mois
    ).all()}

    # Filtrer par zone si demandé
    all_pdv_ids = set(perfs_actuel.keys()) | set(perfs_precedent.keys())
    if zone:
        all_pdv_ids = {pid for pid in all_pdv_ids if pdv_map.get(pid) and pdv_map[pid].zone == zone}

    # Calcul totaux
    total_ca_actuel = sum(perfs_actuel[pid].ca for pid in all_pdv_ids if pid in perfs_actuel)
    total_ca_precedent = sum(perfs_precedent[pid].ca for pid in all_pdv_ids if pid in perfs_precedent)
    variation_totale = total_ca_actuel - total_ca_precedent
    taux_variation_total = round((variation_totale / total_ca_precedent * 100) if total_ca_precedent > 0 else 0, 1)

    # Par superviseur
    par_superviseur = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        s = pdv.superviseur or "Non assigné"
        if s not in par_superviseur:
            par_superviseur[s] = {"ca_actuel": 0, "ca_precedent": 0}
        if pid in perfs_actuel:
            par_superviseur[s]["ca_actuel"] += perfs_actuel[pid].ca
        if pid in perfs_precedent:
            par_superviseur[s]["ca_precedent"] += perfs_precedent[pid].ca

    par_superviseur_list = []
    for s, data in sorted(par_superviseur.items(), key=lambda x: x[1]["ca_actuel"], reverse=True):
        variation = data["ca_actuel"] - data["ca_precedent"]
        taux = round((variation / data["ca_precedent"] * 100) if data["ca_precedent"] > 0 else 0)
        par_superviseur_list.append({
            "superviseur": s, "ca_actuel": data["ca_actuel"],
            "ca_precedent": data["ca_precedent"], "variation": variation, "taux": taux,
        })

    # Par gestionnaire
    par_gestionnaire = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        g = pdv.gestionnaire or "Non assigné"
        if g not in par_gestionnaire:
            par_gestionnaire[g] = {"ca_actuel": 0, "ca_precedent": 0}
        if pid in perfs_actuel:
            par_gestionnaire[g]["ca_actuel"] += perfs_actuel[pid].ca
        if pid in perfs_precedent:
            par_gestionnaire[g]["ca_precedent"] += perfs_precedent[pid].ca

    par_gestionnaire_list = []
    for g, data in sorted(par_gestionnaire.items(), key=lambda x: x[1]["ca_actuel"], reverse=True):
        variation = data["ca_actuel"] - data["ca_precedent"]
        taux = round((variation / data["ca_precedent"] * 100) if data["ca_precedent"] > 0 else 0)
        par_gestionnaire_list.append({
            "gestionnaire": g, "ca_actuel": data["ca_actuel"],
            "ca_precedent": data["ca_precedent"], "variation": variation, "taux": taux,
        })

    # Par PDV
    par_pdv_list = []
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        ca_actuel = perfs_actuel[pid].ca if pid in perfs_actuel else 0
        ca_precedent = perfs_precedent[pid].ca if pid in perfs_precedent else 0
        variation = ca_actuel - ca_precedent
        taux = round((variation / ca_precedent * 100) if ca_precedent > 0 else 0)
        par_pdv_list.append({
            "pdv_id": pdv.id, "numero_pdv": pdv.numero_pdv, "nom": pdv.nom,
            "zone": pdv.zone, "superviseur": pdv.superviseur,
            "ca_actuel": ca_actuel, "ca_precedent": ca_precedent,
            "variation": variation, "taux": taux, "est_hausse": variation >= 0,
        })

    par_pdv_list = sorted(par_pdv_list, key=lambda x: abs(x["variation"]), reverse=True)[:100]

    return {
        "annee": annee, "mois": mois,
        "prev_annee": prev_annee, "prev_mois": prev_mois,
        "total_ca_actuel": total_ca_actuel, "total_ca_precedent": total_ca_precedent,
        "variation_totale": variation_totale, "taux_variation_total": taux_variation_total,
        "par_superviseur": par_superviseur_list,
        "par_gestionnaire": par_gestionnaire_list,
        "par_pdv": par_pdv_list,
    }



@router.get("/dashboard/monthly-progression")
def monthly_progression(
    db: Session = Depends(get_db),
    annee: Optional[int] = None,
    top_n: int = Query(20, ge=1, le=100),
):
    """Statistiques de progression historique des PDVs."""
    from datetime import datetime
    
    if annee is None:
        annee = datetime.now().year
    
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    
    result_pdvs = []
    for pdv in pdvs:
        # Toutes les performances mensuelles
        perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.pdv_id == pdv.id
        ).order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).all()
        
        if not perfs:
            continue
        
        # Compter top 10 et top 50 pour chaque mois
        nb_fois_top10 = 0
        nb_fois_top50 = 0
        mois_meilleur_ca = None
        ca_max = 0
        mois_pire_ca = None
        ca_min = float('inf')
        
        # Grouper par mois unique
        mois_uniques = {}
        for p in perfs:
            key = (p.annee, p.mois)
            if key not in mois_uniques:
                mois_uniques[key] = []
            mois_uniques[key].append(p)
        
        for (y, m), month_perfs in mois_uniques.items():
            # Trouver tous les PDVs de ce mois
            all_month_perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.annee == y,
                MonthlyPerformance.mois == m
            ).all()
            sorted_month = sorted(all_month_perfs, key=lambda x: x.ca, reverse=True)
            
            # Trouver la perf du PDV courant dans ce mois
            pdv_perf = next((p for p in month_perfs), None)
            if pdv_perf:
                rank = next((i+1 for i, p in enumerate(sorted_month) if p.pdv_id == pdv.id), None)
                if rank and rank <= 10:
                    nb_fois_top10 += 1
                if rank and rank <= 50:
                    nb_fois_top50 += 1
                
                if pdv_perf.ca > ca_max:
                    ca_max = pdv_perf.ca
                    mois_meilleur_ca = f"{y}-{m:02d}"
                
                if pdv_perf.est_actif and pdv_perf.ca > 0 and pdv_perf.ca < ca_min:
                    ca_min = pdv_perf.ca
                    mois_pire_ca = f"{y}-{m:02d}"
        
        if ca_min == float('inf'):
            ca_min = 0
        
        # Historique des 12 derniers mois
        historique = []
        for p in perfs[:12]:  # Les 12 premiers (les plus récents)
            all_month_perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.annee == p.annee,
                MonthlyPerformance.mois == p.mois
            ).all()
            sorted_month = sorted(all_month_perfs, key=lambda x: x.ca, reverse=True)
            rang = next((i+1 for i, sp in enumerate(sorted_month) if sp.pdv_id == pdv.id), None)
            
            historique.append({
                "annee": p.annee,
                "mois": p.mois,
                "ca": p.ca,
                "rang": rang,
            })
        
        result_pdvs.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "nb_fois_top10": nb_fois_top10,
            "nb_fois_top50": nb_fois_top50,
            "mois_meilleur_ca": mois_meilleur_ca,
            "mois_pire_ca": mois_pire_ca,
            "ca_max": ca_max,
            "ca_min": ca_min,
            "historique_mensuel": historique,
        })
    
    # Trier par nb_fois_top10 descendant
    result_pdvs = sorted(result_pdvs, key=lambda x: x["nb_fois_top10"], reverse=True)[:top_n]
    
    return {
        "annee": annee,
        "total_pdvs": len(result_pdvs),
        "pdvs": result_pdvs,
    }


@router.get("/dashboard/weekly-inactive")
def weekly_inactive(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    semaine: int = Query(..., ge=1, le=52),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
):
    """Retourne les PDVs inactifs pour une semaine donnée."""
    all_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee,
        WeeklyPerformance.semaine == semaine,
        WeeklyPerformance.est_actif == False
    ).all()
    
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur)
    
    result_pdvs = []
    for p, pdv in pairs:
        # Compter les semaines consécutives inactives avant cette semaine
        nb_semaines_inactif = 1
        prev_semaine = semaine - 1
        prev_annee = annee
        if prev_semaine == 0:
            prev_semaine = 52
            prev_annee -= 1
        
        while True:
            prev_perf = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.pdv_id == pdv.id,
                WeeklyPerformance.annee == prev_annee,
                WeeklyPerformance.semaine == prev_semaine
            ).first()
            
            if not prev_perf or prev_perf.est_actif:
                break
            
            nb_semaines_inactif += 1
            prev_semaine -= 1
            if prev_semaine == 0:
                prev_semaine = 52
                prev_annee -= 1
        
        # Déterminer l'alerte
        if nb_semaines_inactif >= 3:
            alerte = "CRITIQUE"
        elif nb_semaines_inactif == 2:
            alerte = "HAUTE"
        else:
            alerte = "NORMALE"
        
        result_pdvs.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "sous_zone": pdv.sous_zone,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "teleconseillere": pdv.teleconseillere,
            "telephone": pdv.telephone,
            "nom_gerant": pdv.nom_gerant,
            "numero_personnel": pdv.numero_personnel,
            "type_pdv": pdv.type_pdv.value,
            "nb_semaines_consecutives_inactif": nb_semaines_inactif,
            "alerte": alerte,
        })
    
    return {
        "annee": annee,
        "semaine": semaine,
        "count": len(result_pdvs),
        "pdvs": result_pdvs,
    }


@router.get("/dashboard/weekly-declining")
def weekly_declining(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    semaine: int = Query(..., ge=1, le=52),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    seuil: float = Query(-10.0),
):
    """Retourne les PDVs en baisse par rapport à la semaine précédente."""
    all_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee,
        WeeklyPerformance.semaine == semaine
    ).all()
    
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur)
    
    result_pdvs = []
    for p, pdv in pairs:
        if p.taux_variation is not None and p.taux_variation <= seuil:
            # Déterminer l'alerte basée sur la baisse
            baisse_pct = abs(p.taux_variation)
            if baisse_pct > 30:
                alerte = "CRITIQUE"
            elif baisse_pct > 15:
                alerte = "HAUTE"
            else:
                alerte = "NORMALE"
            
            result_pdvs.append({
                "pdv_id": pdv.id,
                "numero_pdv": pdv.numero_pdv,
                "nom": pdv.nom,
                "zone": pdv.zone,
                "sous_zone": pdv.sous_zone,
                "superviseur": pdv.superviseur,
                "gestionnaire": pdv.gestionnaire,
                "teleconseillere": pdv.teleconseillere,
                "telephone": pdv.telephone,
                "nom_gerant": pdv.nom_gerant,
                "numero_personnel": pdv.numero_personnel,
                "type_pdv": pdv.type_pdv.value,
                "ca": p.ca,
                "ca_precedent": p.ca_semaine_precedente,
                "taux_baisse": p.taux_variation,
                "nb_operations": p.nb_operations,
                "alerte": alerte,
            })
    
    # Trier par taux de baisse décroissant
    result_pdvs = sorted(result_pdvs, key=lambda x: x["taux_baisse"])
    
    return {
        "annee": annee,
        "semaine": semaine,
        "count": len(result_pdvs),
        "seuil": seuil,
        "pdvs": result_pdvs,
    }



@router.get("/dashboard/weekly-evolution")
def weekly_evolution(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    semaine: int = Query(..., ge=1, le=52),
    zone: Optional[str] = None,
):
    """Comparaison CA semaine actuelle vs semaine précédente (jointure réelle)."""
    if semaine == 1:
        prev_semaine, prev_annee = 52, annee - 1
    else:
        prev_semaine, prev_annee = semaine - 1, annee

    pdv_map = _get_pdv_map(db)

    perfs_actuel = {p.pdv_id: p for p in db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee, WeeklyPerformance.semaine == semaine
    ).all()}
    perfs_precedent = {p.pdv_id: p for p in db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == prev_annee, WeeklyPerformance.semaine == prev_semaine
    ).all()}

    all_pdv_ids = set(perfs_actuel.keys()) | set(perfs_precedent.keys())
    if zone:
        all_pdv_ids = {pid for pid in all_pdv_ids if pdv_map.get(pid) and pdv_map[pid].zone == zone}

    total_ca_actuel = sum(perfs_actuel[pid].ca for pid in all_pdv_ids if pid in perfs_actuel)
    total_ca_precedent = sum(perfs_precedent[pid].ca for pid in all_pdv_ids if pid in perfs_precedent)
    variation_totale = total_ca_actuel - total_ca_precedent
    taux_variation_total = round((variation_totale / total_ca_precedent * 100) if total_ca_precedent > 0 else 0, 1)

    par_superviseur = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        s = pdv.superviseur or "Non assigné"
        if s not in par_superviseur:
            par_superviseur[s] = {"ca_actuel": 0, "ca_precedent": 0}
        if pid in perfs_actuel: par_superviseur[s]["ca_actuel"] += perfs_actuel[pid].ca
        if pid in perfs_precedent: par_superviseur[s]["ca_precedent"] += perfs_precedent[pid].ca

    par_superviseur_list = []
    for s, data in sorted(par_superviseur.items(), key=lambda x: x[1]["ca_actuel"], reverse=True):
        variation = data["ca_actuel"] - data["ca_precedent"]
        taux = round((variation / data["ca_precedent"] * 100) if data["ca_precedent"] > 0 else 0)
        par_superviseur_list.append({"superviseur": s, "ca_actuel": data["ca_actuel"],
            "ca_precedent": data["ca_precedent"], "variation": variation, "taux": taux})

    par_gestionnaire = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        g = pdv.gestionnaire or "Non assigné"
        if g not in par_gestionnaire:
            par_gestionnaire[g] = {"ca_actuel": 0, "ca_precedent": 0}
        if pid in perfs_actuel: par_gestionnaire[g]["ca_actuel"] += perfs_actuel[pid].ca
        if pid in perfs_precedent: par_gestionnaire[g]["ca_precedent"] += perfs_precedent[pid].ca

    par_gestionnaire_list = []
    for g, data in sorted(par_gestionnaire.items(), key=lambda x: x[1]["ca_actuel"], reverse=True):
        variation = data["ca_actuel"] - data["ca_precedent"]
        taux = round((variation / data["ca_precedent"] * 100) if data["ca_precedent"] > 0 else 0)
        par_gestionnaire_list.append({"gestionnaire": g, "ca_actuel": data["ca_actuel"],
            "ca_precedent": data["ca_precedent"], "variation": variation, "taux": taux})

    par_pdv_list = []
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        ca_actuel = perfs_actuel[pid].ca if pid in perfs_actuel else 0
        ca_precedent = perfs_precedent[pid].ca if pid in perfs_precedent else 0
        variation = ca_actuel - ca_precedent
        taux = round((variation / ca_precedent * 100) if ca_precedent > 0 else 0)
        par_pdv_list.append({"pdv_id": pdv.id, "numero_pdv": pdv.numero_pdv, "nom": pdv.nom,
            "zone": pdv.zone, "superviseur": pdv.superviseur,
            "ca_actuel": ca_actuel, "ca_precedent": ca_precedent,
            "variation": variation, "taux": taux, "est_hausse": variation >= 0})

    par_pdv_list = sorted(par_pdv_list, key=lambda x: abs(x["variation"]), reverse=True)[:100]

    return {
        "annee": annee, "semaine": semaine,
        "prev_annee": prev_annee, "prev_semaine": prev_semaine,
        "total_ca_actuel": total_ca_actuel, "total_ca_precedent": total_ca_precedent,
        "variation_totale": variation_totale, "taux_variation_total": taux_variation_total,
        "par_superviseur": par_superviseur_list,
        "par_gestionnaire": par_gestionnaire_list,
        "par_pdv": par_pdv_list,
    }


@router.get("/dashboard/weekly-progression")
def weekly_progression(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    top_n: int = Query(20, ge=1, le=100),
):
    """Statistiques de progression historique des PDVs pour les semaines."""
    pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()
    
    result_pdvs = []
    for pdv in pdvs:
        # Toutes les performances hebdomadaires
        perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.pdv_id == pdv.id
        ).order_by(WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()).all()
        
        if not perfs:
            continue
        
        # Compter top 10 et top 50 pour chaque semaine
        nb_fois_top10 = 0
        nb_fois_top50 = 0
        semaine_meilleur_ca = None
        ca_max = 0
        semaine_pire_ca = None
        ca_min = float('inf')
        
        # Grouper par semaine unique
        semaine_uniques = {}
        for p in perfs:
            key = (p.annee, p.semaine)
            if key not in semaine_uniques:
                semaine_uniques[key] = []
            semaine_uniques[key].append(p)
        
        for (y, w), week_perfs in semaine_uniques.items():
            # Trouver tous les PDVs de cette semaine
            all_week_perfs = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.annee == y,
                WeeklyPerformance.semaine == w
            ).all()
            sorted_week = sorted(all_week_perfs, key=lambda x: x.ca, reverse=True)
            
            # Trouver la perf du PDV courant dans cette semaine
            pdv_perf = next((p for p in week_perfs), None)
            if pdv_perf:
                rank = next((i+1 for i, p in enumerate(sorted_week) if p.pdv_id == pdv.id), None)
                if rank and rank <= 10:
                    nb_fois_top10 += 1
                if rank and rank <= 50:
                    nb_fois_top50 += 1
                
                if pdv_perf.ca > ca_max:
                    ca_max = pdv_perf.ca
                    semaine_meilleur_ca = f"{y}-W{w:02d}"
                
                if pdv_perf.est_actif and pdv_perf.ca > 0 and pdv_perf.ca < ca_min:
                    ca_min = pdv_perf.ca
                    semaine_pire_ca = f"{y}-W{w:02d}"
        
        if ca_min == float('inf'):
            ca_min = 0
        
        # Historique des 52 dernières semaines
        historique = []
        for p in perfs[:52]:  # Les 52 premiers (les plus récents)
            all_week_perfs = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.annee == p.annee,
                WeeklyPerformance.semaine == p.semaine
            ).all()
            sorted_week = sorted(all_week_perfs, key=lambda x: x.ca, reverse=True)
            rang = next((i+1 for i, sp in enumerate(sorted_week) if sp.pdv_id == pdv.id), None)
            
            historique.append({
                "annee": p.annee,
                "semaine": p.semaine,
                "ca": p.ca,
                "rang": rang,
            })
        
        result_pdvs.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "nb_fois_top10": nb_fois_top10,
            "nb_fois_top50": nb_fois_top50,
            "semaine_meilleur_ca": semaine_meilleur_ca,
            "semaine_pire_ca": semaine_pire_ca,
            "ca_max": ca_max,
            "ca_min": ca_min,
            "historique_hebdo": historique,
        })
    
    # Trier par nb_fois_top10 descendant
    result_pdvs = sorted(result_pdvs, key=lambda x: x["nb_fois_top10"], reverse=True)[:top_n]
    
    return {
        "annee": annee,
        "total_pdvs": len(result_pdvs),
        "pdvs": result_pdvs,
    }


@router.get("/dashboard/pdv-monthly-history/{pdv_id}")
def pdv_monthly_history(
    pdv_id: int,
    db: Session = Depends(get_db),
    annee: Optional[int] = None,
):
    """Retourne l'historique mensuel complet d'un PDV."""
    from datetime import datetime
    
    if annee is None:
        annee = datetime.now().year
    
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(status_code=404, detail="PDV not found")
    
    # Toutes les performances mensuelles du PDV
    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id == pdv_id
    ).order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).all()
    
    historique = []
    for p in perfs:
        # Calculer le rang du PDV pour ce mois
        all_month_perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.annee == p.annee,
            MonthlyPerformance.mois == p.mois
        ).all()
        sorted_month = sorted(all_month_perfs, key=lambda x: x.ca, reverse=True)
        rang_reseau = next((i+1 for i, sp in enumerate(sorted_month) if sp.pdv_id == pdv.id), None)
        
        historique.append({
            "annee": p.annee,
            "mois": p.mois,
            "ca": p.ca,
            "nb_operations": p.nb_operations,
            "est_actif": p.est_actif,
            "taux_variation": p.taux_variation,
            "rang_reseau": rang_reseau,
        })
    
    return {
        "pdv_id": pdv.id,
        "numero_pdv": pdv.numero_pdv,
        "nom": pdv.nom,
        "zone": pdv.zone,
        "superviseur": pdv.superviseur,
        "historique": historique,
    }


@router.get("/dashboard/pdv-weekly-history/{pdv_id}")
def pdv_weekly_history(
    pdv_id: int,
    db: Session = Depends(get_db),
    annee: Optional[int] = None,
):
    """Retourne l'historique hebdomadaire complet d'un PDV."""
    from datetime import datetime
    
    if annee is None:
        annee = datetime.now().year
    
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(status_code=404, detail="PDV not found")
    
    # Toutes les performances hebdomadaires du PDV
    perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.pdv_id == pdv_id
    ).order_by(WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()).all()
    
    historique = []
    for p in perfs:
        # Calculer le rang du PDV pour cette semaine
        all_week_perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.annee == p.annee,
            WeeklyPerformance.semaine == p.semaine
        ).all()
        sorted_week = sorted(all_week_perfs, key=lambda x: x.ca, reverse=True)
        rang_reseau = next((i+1 for i, sp in enumerate(sorted_week) if sp.pdv_id == pdv.id), None)
        
        historique.append({
            "annee": p.annee,
            "semaine": p.semaine,
            "ca": p.ca,
            "nb_operations": p.nb_operations,
            "est_actif": p.est_actif,
            "taux_variation": p.taux_variation,
            "rang_reseau": rang_reseau,
        })
    
    return {
        "pdv_id": pdv.id,
        "numero_pdv": pdv.numero_pdv,
        "nom": pdv.nom,
        "zone": pdv.zone,
        "superviseur": pdv.superviseur,
        "historique": historique,
    }


@router.get("/dashboard/last-available")
def last_available(db: Session = Depends(get_db)):
    """Retourne le dernier mois et la dernière semaine avec des données."""
    # Dernier mois disponible
    last_month = db.query(
        MonthlyPerformance.annee, MonthlyPerformance.mois
    ).order_by(
        MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
    ).first()

    # Dernière semaine disponible
    last_week = db.query(
        WeeklyPerformance.annee, WeeklyPerformance.semaine
    ).order_by(
        WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()
    ).first()

    return {
        "last_month": {"annee": last_month[0], "mois": last_month[1]} if last_month else None,
        "last_week": {"annee": last_week[0], "semaine": last_week[1]} if last_week else None,
    }
