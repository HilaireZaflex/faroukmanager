"""
Service pour le suivi global des Envois & Recuperations du reseau.
Calcule les soldes, taux de recouvrement, alertes et journal des operations.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance
from datetime import datetime

MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec']


def get_journal_operations(db: Session, annee: int, mois: int,
                           zone: str = None, gestionnaire: str = None):
    """
    Journal des operations : chaque PDV avec ses montants envoyés/récupérés ce mois.
    """
    q = db.query(MonthlyPerformance, PDV).join(PDV, MonthlyPerformance.pdv_id == PDV.id).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois,
    )
    if zone:
        q = q.filter(PDV.zone == zone)
    if gestionnaire:
        q = q.filter(PDV.gestionnaire == gestionnaire)

    rows = q.order_by(MonthlyPerformance.montant_depots.desc()).all()

    result = []
    for perf, pdv in rows:
        envoye = perf.montant_depots or 0
        recupere = perf.montant_retraits or 0
        solde = envoye - recupere
        taux = round(recupere / envoye * 100, 1) if envoye > 0 else 0
        result.append({
            "pdv_id": pdv.id,
            "pdv_nom": pdv.nom,
            "zone": pdv.zone or "—",
            "sous_zone": pdv.sous_zone or "—",
            "gestionnaire": pdv.gestionnaire or "—",
            "superviseur": pdv.superviseur or "—",
            "ca": perf.ca or 0,
            "montant_envoye": envoye,
            "montant_recupere": recupere,
            "solde": solde,
            "taux_recouvrement": taux,
            "nb_depots": perf.nb_depots or 0,
            "nb_retraits": perf.nb_retraits or 0,
            "nb_operations": perf.nb_operations or 0,
            "est_actif": perf.est_actif,
            "mois": mois,
            "annee": annee,
        })
    return result


def get_soldes_par_pdv(db: Session, annee: int, mois: int, zone: str = None):
    """
    Solde = montant_envoye - montant_recupere par PDV.
    Trié par solde décroissant (PDVs avec plus de liquidités non récupérées en tête).
    """
    journal = get_journal_operations(db, annee, mois, zone=zone)
    journal.sort(key=lambda x: x["solde"], reverse=True)
    return journal


def get_alertes_soldes_eleves(db: Session, annee: int, mois: int, seuil_solde: int = 1_000_000):
    """
    PDVs dont le solde (envoyé - récupéré) dépasse le seuil = risque financier.
    """
    journal = get_journal_operations(db, annee, mois)
    alertes = [r for r in journal if r["solde"] >= seuil_solde]
    alertes.sort(key=lambda x: x["solde"], reverse=True)
    return alertes


def get_par_gestionnaire(db: Session, annee: int, mois: int):
    """
    Agrégation par gestionnaire : total envoyé, récupéré, solde, taux, nb PDVs.
    """
    journal = get_journal_operations(db, annee, mois)
    gests = {}
    for r in journal:
        g = r["gestionnaire"]
        if g not in gests:
            gests[g] = {
                "gestionnaire": g,
                "montant_envoye": 0, "montant_recupere": 0,
                "solde": 0, "nb_pdvs": 0, "nb_operations": 0,
                "ca_total": 0, "nb_depots": 0, "nb_retraits": 0,
                "pdvs_solde_eleve": 0,
            }
        gests[g]["montant_envoye"] += r["montant_envoye"]
        gests[g]["montant_recupere"] += r["montant_recupere"]
        gests[g]["solde"] += r["solde"]
        gests[g]["ca_total"] += r["ca"]
        gests[g]["nb_pdvs"] += 1
        gests[g]["nb_operations"] += r["nb_operations"]
        gests[g]["nb_depots"] += r["nb_depots"]
        gests[g]["nb_retraits"] += r["nb_retraits"]
        if r["solde"] > 1_000_000:
            gests[g]["pdvs_solde_eleve"] += 1

    result = list(gests.values())
    for g in result:
        env = g["montant_envoye"]
        g["taux_recouvrement"] = round(g["montant_recupere"] / env * 100, 1) if env > 0 else 0
        g["frequence_collecte"] = round(g["nb_depots"] / max(g["nb_pdvs"], 1), 1)

    result.sort(key=lambda x: x["montant_envoye"], reverse=True)
    for i, g in enumerate(result):
        g["rang"] = i + 1
    return result


def get_taux_recouvrement(db: Session, annee: int, mois: int):
    """
    Stats globales de taux de recouvrement par zone et par gestionnaire.
    """
    journal = get_journal_operations(db, annee, mois)

    # Par zone
    zones = {}
    for r in journal:
        z = r["zone"]
        if z not in zones:
            zones[z] = {"zone": z, "envoye": 0, "recupere": 0, "solde": 0, "nb_pdvs": 0}
        zones[z]["envoye"] += r["montant_envoye"]
        zones[z]["recupere"] += r["montant_recupere"]
        zones[z]["solde"] += r["solde"]
        zones[z]["nb_pdvs"] += 1

    zones_list = list(zones.values())
    for z in zones_list:
        z["taux"] = round(z["recupere"] / z["envoye"] * 100, 1) if z["envoye"] > 0 else 0
    zones_list.sort(key=lambda x: x["taux"], reverse=True)

    # Totaux globaux
    total_envoye = sum(r["montant_envoye"] for r in journal)
    total_recupere = sum(r["montant_recupere"] for r in journal)
    total_solde = total_envoye - total_recupere
    taux_global = round(total_recupere / total_envoye * 100, 1) if total_envoye > 0 else 0

    # Evolution mensuelle (12 derniers mois)
    evolution = []
    a, m = annee, mois
    for _ in range(12):
        perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.annee == a,
            MonthlyPerformance.mois == m
        ).all()
        env = sum(p.montant_depots or 0 for p in perfs)
        rec = sum(p.montant_retraits or 0 for p in perfs)
        sol = env - rec
        taux = round(rec / env * 100, 1) if env > 0 else 0
        evolution.append({
            "label": f"{MONTHS[m-1]} {a}",
            "annee": a, "mois": m,
            "envoye": env, "recupere": rec, "solde": sol, "taux": taux
        })
        m -= 1
        if m == 0:
            m = 12
            a -= 1

    evolution.reverse()

    return {
        "total_envoye": total_envoye,
        "total_recupere": total_recupere,
        "total_solde": total_solde,
        "taux_global": taux_global,
        "par_zone": zones_list,
        "evolution": evolution,
    }
