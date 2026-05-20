"""
Service pour l'analyse des potentialités réseau.
Identifie les zones chaudes/froides, les opportunités d'expansion et les déséquilibres dépôts/retraits.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance
from datetime import datetime


def _get_last_months(annee: int, mois: int, n: int = 3):
    """Retourne les n derniers mois (annee, mois) avant le mois donné."""
    result = []
    a, m = annee, mois
    for _ in range(n):
        result.append((a, m))
        m -= 1
        if m == 0:
            m = 12
            a -= 1
    return result


def get_zones_heatmap(db: Session, annee: int, mois: int):
    """
    Carte thermique par zone : CA, dépôts, retraits, nb_ops, nb_pdvs_actifs.
    Calcule aussi un score de chaleur normalisé (0-100).
    """
    # Récupérer tous les PDVs avec leur zone
    pdvs = db.query(PDV).filter(PDV.zone != None, PDV.zone != '').all()
    pdv_map = {p.id: p for p in pdvs}
    pdv_ids = [p.id for p in pdvs]

    # Performances du mois
    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()

    zones_data = {}
    for perf in perfs:
        pdv = pdv_map.get(perf.pdv_id)
        if not pdv or not pdv.zone:
            continue
        zone = pdv.zone
        if zone not in zones_data:
            zones_data[zone] = {
                "zone": zone,
                "ca": 0, "montant_depots": 0, "montant_retraits": 0,
                "nb_operations": 0, "nb_pdvs_actifs": 0, "nb_pdvs_total": 0,
                "nb_depots": 0, "nb_retraits": 0
            }
        zones_data[zone]["ca"] += perf.ca or 0
        zones_data[zone]["montant_depots"] += perf.montant_depots or 0
        zones_data[zone]["montant_retraits"] += perf.montant_retraits or 0
        zones_data[zone]["nb_operations"] += perf.nb_operations or 0
        zones_data[zone]["nb_depots"] += perf.nb_depots or 0
        zones_data[zone]["nb_retraits"] += perf.nb_retraits or 0
        if perf.est_actif:
            zones_data[zone]["nb_pdvs_actifs"] += 1

    # Nb PDVs total par zone
    for pdv in pdvs:
        if pdv.zone in zones_data:
            zones_data[pdv.zone]["nb_pdvs_total"] += 1

    result = list(zones_data.values())

    # Calculer ratio dépôts/retraits et score chaleur
    max_ca = max((z["ca"] for z in result), default=1) or 1
    max_ops = max((z["nb_operations"] for z in result), default=1) or 1

    for z in result:
        ratio = (z["montant_retraits"] / z["montant_depots"] * 100) if z["montant_depots"] > 0 else 0
        z["ratio_depot_retrait"] = round(ratio, 1)
        # Score = 40% CA + 40% ops + 20% taux actifs
        taux_actif = (z["nb_pdvs_actifs"] / z["nb_pdvs_total"] * 100) if z["nb_pdvs_total"] > 0 else 0
        score = (z["ca"] / max_ca * 40) + (z["nb_operations"] / max_ops * 40) + (taux_actif / 100 * 20)
        z["score_chaleur"] = round(score, 1)
        z["taux_actif"] = round(taux_actif, 1)

    result.sort(key=lambda x: x["score_chaleur"], reverse=True)
    return result


def get_quartiers_analyse(db: Session, annee: int, mois: int):
    """
    Analyse par quartier : volume ops, CA, dépôts, retraits, densité PDVs.
    """
    pdvs = db.query(PDV).filter(PDV.quartier != None, PDV.quartier != '').all()
    pdv_map = {p.id: p for p in pdvs}
    pdv_ids = [p.id for p in pdvs]

    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()

    quartiers_data = {}
    for perf in perfs:
        pdv = pdv_map.get(perf.pdv_id)
        if not pdv or not pdv.quartier:
            continue
        q = pdv.quartier
        if q not in quartiers_data:
            quartiers_data[q] = {
                "quartier": q, "zone": pdv.zone or "—",
                "ca": 0, "montant_depots": 0, "montant_retraits": 0,
                "nb_operations": 0, "nb_pdvs_actifs": 0, "nb_pdvs_total": 0,
                "nb_depots": 0, "nb_retraits": 0
            }
        quartiers_data[q]["ca"] += perf.ca or 0
        quartiers_data[q]["montant_depots"] += perf.montant_depots or 0
        quartiers_data[q]["montant_retraits"] += perf.montant_retraits or 0
        quartiers_data[q]["nb_operations"] += perf.nb_operations or 0
        quartiers_data[q]["nb_depots"] += perf.nb_depots or 0
        quartiers_data[q]["nb_retraits"] += perf.nb_retraits or 0
        if perf.est_actif:
            quartiers_data[q]["nb_pdvs_actifs"] += 1

    for pdv in pdvs:
        if pdv.quartier and pdv.quartier in quartiers_data:
            quartiers_data[pdv.quartier]["nb_pdvs_total"] += 1

    result = list(quartiers_data.values())
    max_ops = max((q["nb_operations"] for q in result), default=1) or 1
    max_ca = max((q["ca"] for q in result), default=1) or 1

    for q in result:
        ratio = (q["montant_retraits"] / q["montant_depots"] * 100) if q["montant_depots"] > 0 else 0
        q["ratio_depot_retrait"] = round(ratio, 1)
        taux_actif = (q["nb_pdvs_actifs"] / q["nb_pdvs_total"] * 100) if q["nb_pdvs_total"] > 0 else 0
        q["taux_actif"] = round(taux_actif, 1)
        # Score potentiel : ops/PDV (sous-utilisé = fort potentiel si peu de PDVs mais bcp d'ops)
        ops_par_pdv = q["nb_operations"] / max(q["nb_pdvs_total"], 1)
        score = (q["ca"] / max_ca * 50) + (q["nb_operations"] / max_ops * 30) + (taux_actif / 100 * 20)
        q["score_potentiel"] = round(score, 1)
        q["ops_par_pdv"] = round(ops_par_pdv, 1)

    result.sort(key=lambda x: x["score_potentiel"], reverse=True)
    return result


def get_opportunites_expansion(db: Session, annee: int, mois: int):
    """
    Zones/quartiers avec peu de PDVs mais beaucoup d'opérations = opportunité d'expansion.
    Score d'opportunité = ops_par_pdv normalisé.
    """
    quartiers = get_quartiers_analyse(db, annee, mois)
    # Filtrer : peu de PDVs (< mediane) mais beaucoup d'ops (> mediane)
    if not quartiers:
        return []
    nb_pdvs_vals = sorted([q["nb_pdvs_total"] for q in quartiers])
    nb_ops_vals = sorted([q["nb_operations"] for q in quartiers])
    med_pdvs = nb_pdvs_vals[len(nb_pdvs_vals)//2] if nb_pdvs_vals else 1
    med_ops = nb_ops_vals[len(nb_ops_vals)//2] if nb_ops_vals else 0

    max_ops_par_pdv = max((q["ops_par_pdv"] for q in quartiers), default=1) or 1

    opportunites = []
    for q in quartiers:
        if q["nb_operations"] > med_ops:
            score_opp = round(q["ops_par_pdv"] / max_ops_par_pdv * 100, 1)
            opportunites.append({**q, "score_opportunite": score_opp,
                                  "type": "sous_exploite" if q["nb_pdvs_total"] <= med_pdvs else "fort_potentiel"})

    opportunites.sort(key=lambda x: x["score_opportunite"], reverse=True)
    return opportunites[:20]


def get_zones_en_declin(db: Session, annee: int, mois: int):
    """
    Zones dont le CA baisse depuis 2+ mois consécutifs.
    """
    mois_list = _get_last_months(annee, mois, 4)  # 4 derniers mois

    pdvs = db.query(PDV).filter(PDV.zone != None, PDV.zone != '').all()
    pdv_map = {p.id: p for p in pdvs}
    zones = list(set(p.zone for p in pdvs if p.zone))

    result = []
    for zone in zones:
        zone_pdv_ids = [p.id for p in pdvs if p.zone == zone]
        monthly_ca = []
        for (a, m) in reversed(mois_list):
            perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.pdv_id.in_(zone_pdv_ids),
                MonthlyPerformance.annee == a,
                MonthlyPerformance.mois == m
            ).all()
            ca = sum(p.ca or 0 for p in perfs)
            monthly_ca.append({"annee": a, "mois": m, "ca": ca})

        # Vérifier déclin (au moins 2 mois consécutifs de baisse)
        baisses = 0
        for i in range(1, len(monthly_ca)):
            if monthly_ca[i]["ca"] < monthly_ca[i-1]["ca"] and monthly_ca[i-1]["ca"] > 0:
                baisses += 1

        if baisses >= 2:
            variation = 0
            if monthly_ca[0]["ca"] > 0:
                variation = ((monthly_ca[-1]["ca"] - monthly_ca[0]["ca"]) / monthly_ca[0]["ca"] * 100)
            result.append({
                "zone": zone,
                "nb_pdvs": len(zone_pdv_ids),
                "mois_baisse": baisses,
                "variation_ca": round(variation, 1),
                "historique": monthly_ca,
                "ca_actuel": monthly_ca[-1]["ca"]
            })

    result.sort(key=lambda x: x["variation_ca"])
    return result


def get_comparatif_zones(db: Session, annee: int, mois: int):
    """
    Comparatif dépôts vs retraits par zone sur le mois sélectionné.
    """
    return get_zones_heatmap(db, annee, mois)


def get_score_potentiel_zones(db: Session, annee: int, mois: int):
    """
    Score de potentiel par sous-zone avec détails.
    """
    pdvs = db.query(PDV).filter(PDV.sous_zone != None, PDV.sous_zone != '').all()
    if not pdvs:
        return get_quartiers_analyse(db, annee, mois)

    pdv_map = {p.id: p for p in pdvs}
    pdv_ids = [p.id for p in pdvs]

    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()

    sz_data = {}
    for perf in perfs:
        pdv = pdv_map.get(perf.pdv_id)
        if not pdv or not pdv.sous_zone:
            continue
        sz = pdv.sous_zone
        if sz not in sz_data:
            sz_data[sz] = {
                "sous_zone": sz, "zone": pdv.zone or "—",
                "ca": 0, "montant_depots": 0, "montant_retraits": 0,
                "nb_operations": 0, "nb_pdvs_actifs": 0, "nb_pdvs_total": 0,
                "nb_depots": 0, "nb_retraits": 0
            }
        sz_data[sz]["ca"] += perf.ca or 0
        sz_data[sz]["montant_depots"] += perf.montant_depots or 0
        sz_data[sz]["montant_retraits"] += perf.montant_retraits or 0
        sz_data[sz]["nb_operations"] += perf.nb_operations or 0
        sz_data[sz]["nb_depots"] += perf.nb_depots or 0
        sz_data[sz]["nb_retraits"] += perf.nb_retraits or 0
        if perf.est_actif:
            sz_data[sz]["nb_pdvs_actifs"] += 1

    for pdv in pdvs:
        if pdv.sous_zone and pdv.sous_zone in sz_data:
            sz_data[pdv.sous_zone]["nb_pdvs_total"] += 1

    result = list(sz_data.values())
    max_ca = max((s["ca"] for s in result), default=1) or 1
    max_ops = max((s["nb_operations"] for s in result), default=1) or 1

    for s in result:
        taux_actif = (s["nb_pdvs_actifs"] / s["nb_pdvs_total"] * 100) if s["nb_pdvs_total"] > 0 else 0
        ratio = (s["montant_retraits"] / s["montant_depots"] * 100) if s["montant_depots"] > 0 else 0
        ops_par_pdv = s["nb_operations"] / max(s["nb_pdvs_total"], 1)
        score = (s["ca"] / max_ca * 40) + (s["nb_operations"] / max_ops * 40) + (taux_actif / 100 * 20)
        s["score_potentiel"] = round(score, 1)
        s["taux_actif"] = round(taux_actif, 1)
        s["ratio_depot_retrait"] = round(ratio, 1)
        s["ops_par_pdv"] = round(ops_par_pdv, 1)

    result.sort(key=lambda x: x["score_potentiel"], reverse=True)
    return result
