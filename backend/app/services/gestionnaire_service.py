"""
Service pour la gestion des gestionnaires de réseau.
Les gestionnaires sont les agents qui collectent et envoient les fonds chez les PDVs.
Ils sont identifiés via le champ PDV.gestionnaire.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance
from typing import Optional
from datetime import date, datetime
import calendar


def get_all_gestionnaires(db: Session):
    """Retourne la liste de tous les gestionnaires distincts."""
    result = db.query(distinct(PDV.gestionnaire)).filter(
        PDV.gestionnaire != None,
        PDV.gestionnaire != ''
    ).all()
    return [r[0] for r in result if r[0]]


def get_gestionnaires_overview(db: Session, annee: int, mois: int):
    """
    Vue d'ensemble de tous les gestionnaires pour un mois donné.
    Retourne : CA collecté, montant envoyé (dépôts), montant récupéré (retraits),
    taux de recouvrement, nombre de PDVs actifs/inactifs.
    """
    gestionnaires = get_all_gestionnaires(db)
    result = []

    for gest in gestionnaires:
        # PDVs de ce gestionnaire
        pdvs = db.query(PDV).filter(
            PDV.gestionnaire == gest,
            PDV.statut != PDVStatut.DESACTIVE
        ).all()
        pdv_ids = [p.id for p in pdvs]

        if not pdv_ids:
            continue

        # Performances du mois
        perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.pdv_id.in_(pdv_ids),
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        ).all()

        ca_total = sum(p.ca or 0 for p in perfs)
        montant_envoye = sum(p.montant_depots or 0 for p in perfs)
        montant_recupere = sum(p.montant_retraits or 0 for p in perfs)
        nb_operations = sum(p.nb_operations or 0 for p in perfs)
        nb_actifs = sum(1 for p in perfs if p.est_actif)
        nb_inactifs = len(pdv_ids) - nb_actifs

        taux_recouvrement = (montant_recupere / montant_envoye * 100) if montant_envoye > 0 else 0

        # Mois précédent pour variation
        mois_prec = mois - 1 if mois > 1 else 12
        annee_prec = annee if mois > 1 else annee - 1
        perfs_prec = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.pdv_id.in_(pdv_ids),
            MonthlyPerformance.annee == annee_prec,
            MonthlyPerformance.mois == mois_prec
        ).all()
        ca_prec = sum(p.ca or 0 for p in perfs_prec)
        variation_ca = ((ca_total - ca_prec) / ca_prec * 100) if ca_prec > 0 else 0

        # Zones couvertes
        zones = list(set(p.zone for p in pdvs if p.zone))

        result.append({
            "gestionnaire": gest,
            "nb_pdvs": len(pdv_ids),
            "nb_actifs": nb_actifs,
            "nb_inactifs": nb_inactifs,
            "ca_total": ca_total,
            "montant_envoye": montant_envoye,
            "montant_recupere": montant_recupere,
            "nb_operations": nb_operations,
            "taux_recouvrement": round(taux_recouvrement, 1),
            "variation_ca": round(variation_ca, 1),
            "zones": zones,
        })

    # Trier par CA décroissant
    result.sort(key=lambda x: x["ca_total"], reverse=True)
    # Ajouter rang
    for i, g in enumerate(result):
        g["rang"] = i + 1

    return result


def get_gestionnaire_envois_recuperations(db: Session, gestionnaire: str, annee: int, mois: int):
    """
    Détail des envois et récupérations par PDV pour un gestionnaire et un mois.
    """
    pdvs = db.query(PDV).filter(
        PDV.gestionnaire == gestionnaire,
        PDV.statut != PDVStatut.DESACTIVE
    ).all()
    pdv_ids = [p.id for p in pdvs]
    pdv_map = {p.id: p for p in pdvs}

    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()

    result = []
    for perf in perfs:
        pdv = pdv_map.get(perf.pdv_id)
        if not pdv:
            continue
        montant_envoye = perf.montant_depots or 0
        montant_recupere = perf.montant_retraits or 0
        taux = (montant_recupere / montant_envoye * 100) if montant_envoye > 0 else 0
        result.append({
            "pdv_id": pdv.id,
            "pdv_nom": pdv.nom,
            "zone": pdv.zone or "—",
            "sous_zone": pdv.sous_zone or "—",
            "ca": perf.ca or 0,
            "montant_envoye": montant_envoye,
            "montant_recupere": montant_recupere,
            "taux_recouvrement": round(taux, 1),
            "nb_operations": perf.nb_operations or 0,
            "est_actif": perf.est_actif,
        })

    result.sort(key=lambda x: x["ca"], reverse=True)
    return result


def get_gestionnaire_historique_zones(db: Session, gestionnaire: str):
    """
    Historique des zones où le gestionnaire a des PDVs + performances dans chaque zone.
    """
    pdvs = db.query(PDV).filter(
        PDV.gestionnaire == gestionnaire
    ).all()
    pdv_ids = [p.id for p in pdvs]

    # Toutes les perfs disponibles
    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids)
    ).order_by(MonthlyPerformance.annee, MonthlyPerformance.mois).all()

    pdv_map = {p.id: p for p in pdvs}

    # Regrouper par zone et mois
    zones_data = {}
    for perf in perfs:
        pdv = pdv_map.get(perf.pdv_id)
        if not pdv or not pdv.zone:
            continue
        zone = pdv.zone
        key = f"{perf.annee}-{perf.mois:02d}"
        if zone not in zones_data:
            zones_data[zone] = {}
        if key not in zones_data[zone]:
            zones_data[zone][key] = {"annee": perf.annee, "mois": perf.mois, "ca": 0, "nb_pdvs": 0}
        zones_data[zone][key]["ca"] += perf.ca or 0
        zones_data[zone][key]["nb_pdvs"] += 1

    result = []
    for zone, mois_data in zones_data.items():
        entries = sorted(mois_data.values(), key=lambda x: (x["annee"], x["mois"]))
        ca_total_zone = sum(e["ca"] for e in entries)
        result.append({
            "zone": zone,
            "nb_pdvs": len(set(p.id for p in pdvs if p.zone == zone)),
            "ca_total": ca_total_zone,
            "historique": entries,
            "premier_mois": entries[0] if entries else None,
            "dernier_mois": entries[-1] if entries else None,
        })

    result.sort(key=lambda x: x["ca_total"], reverse=True)
    return result


def get_gestionnaire_evolution_mensuelle(db: Session, gestionnaire: str, nb_mois: int = 12):
    """
    Évolution mensuelle du gestionnaire sur les N derniers mois.
    """
    pdvs = db.query(PDV).filter(PDV.gestionnaire == gestionnaire).all()
    pdv_ids = [p.id for p in pdvs]

    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids)
    ).order_by(MonthlyPerformance.annee, MonthlyPerformance.mois).all()

    monthly = {}
    for perf in perfs:
        key = f"{perf.annee}-{perf.mois:02d}"
        if key not in monthly:
            monthly[key] = {
                "annee": perf.annee, "mois": perf.mois,
                "ca": 0, "montant_envoye": 0, "montant_recupere": 0,
                "nb_actifs": 0, "nb_pdvs": 0
            }
        monthly[key]["ca"] += perf.ca or 0
        monthly[key]["montant_envoye"] += perf.montant_depots or 0
        monthly[key]["montant_recupere"] += perf.montant_retraits or 0
        monthly[key]["nb_pdvs"] += 1
        if perf.est_actif:
            monthly[key]["nb_actifs"] += 1

    entries = sorted(monthly.values(), key=lambda x: (x["annee"], x["mois"]))
    # Calcul taux recouvrement
    for e in entries:
        e["taux_recouvrement"] = round(
            (e["montant_recupere"] / e["montant_envoye"] * 100) if e["montant_envoye"] > 0 else 0, 1
        )
        MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
        e["label"] = f"{MONTHS[e['mois']-1]} {e['annee']}"

    return entries[-nb_mois:]


def get_classement_gestionnaires(db: Session, annee: int, mois: int):
    """
    Classement complet avec CA, taux recouvrement, nb PDVs actifs.
    """
    return get_gestionnaires_overview(db, annee, mois)


def get_alertes_gestionnaire(db: Session, gestionnaire: str, seuil_jours: int = 30):
    """
    PDVs qu'un gestionnaire n'a pas visité (pas de performance) depuis X jours.
    Basé sur l'absence de données de performance récentes.
    """
    now = datetime.now()
    annee = now.year
    mois = now.month

    pdvs = db.query(PDV).filter(
        PDV.gestionnaire == gestionnaire,
        PDV.statut != PDVStatut.DESACTIVE
    ).all()
    pdv_ids = [p.id for p in pdvs]
    pdv_map = {p.id: p for p in pdvs}

    # PDVs avec perf ce mois
    actifs_ce_mois = db.query(MonthlyPerformance.pdv_id).filter(
        MonthlyPerformance.pdv_id.in_(pdv_ids),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois,
        MonthlyPerformance.est_actif == True
    ).all()
    actifs_ids = set(r[0] for r in actifs_ce_mois)

    alertes = []
    for pdv_id in pdv_ids:
        if pdv_id not in actifs_ids:
            pdv = pdv_map[pdv_id]
            # Dernière perf connue
            last_perf = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.pdv_id == pdv_id,
                MonthlyPerformance.est_actif == True
            ).order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).first()

            if last_perf:
                last_date = date(last_perf.annee, last_perf.mois, 1)
                jours_inactif = (date(annee, mois, 1) - last_date).days
            else:
                jours_inactif = 999

            if jours_inactif >= seuil_jours:
                alertes.append({
                    "pdv_id": pdv.id,
                    "pdv_nom": pdv.nom,
                    "zone": pdv.zone or "—",
                    "jours_inactif": jours_inactif,
                    "derniere_activite": f"{last_perf.annee}-{last_perf.mois:02d}" if last_perf else "Jamais",
                })

    alertes.sort(key=lambda x: x["jours_inactif"], reverse=True)
    return alertes
