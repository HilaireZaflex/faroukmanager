"""
Service d'évaluation des superviseurs — FaroukManager
Agrège les KPIs depuis OMY, NAFAMA, KAABU et PDV
Pondération : KPIs 70% | Mystery TC 20% | Présentiel 10%
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from datetime import date, datetime
from typing import Optional, List, Dict, Any
import random

from app.models.pdv import PDV
from app.models.user import User


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _pct_score(valeur, objectif) -> float:
    """Score normalisé sur 100 basé sur l'atteinte de l'objectif."""
    if not objectif or objectif == 0:
        return 0.0
    return round(min(valeur / objectif * 100, 100), 2)


def _prev_month(annee: int, mois: int):
    """Retourne (annee, mois) du mois précédent."""
    if mois == 1:
        return annee - 1, 12
    return annee, mois - 1


def _get_semaines_mois(db: Session, annee: int, mois: int) -> List[str]:
    """Retourne les semaines KAABU correspondant au mois donné."""
    from app.models.kaabu import KaabuTransaction
    import datetime as dt
    rows = db.query(KaabuTransaction.semaine).filter(
        KaabuTransaction.annee == annee
    ).distinct().all()
    semaines = []
    for (sem,) in rows:
        try:
            w = int(sem.replace('S', '').replace('s', '').strip())
            d = dt.date.fromisocalendar(annee, w, 1)
            if d.month == mois:
                semaines.append(sem)
        except:
            pass
    return semaines


# ─── KPIs PAR SUPERVISEUR ─────────────────────────────────────────────────────

def get_kpis_superviseur(db: Session, superviseur: str, annee: int, mois: int) -> Dict[str, Any]:
    """
    Agrège tous les KPIs d'un superviseur pour le mois donné.
    Sources: OMY (MonthlyPerformance), NAFAMA (NafamaTransaction), KAABU, PDV
    """
    from app.models.pdv import PDV
    from app.models.performance import MonthlyPerformance
    from app.models.nafama import NafamaTransaction
    from app.models.kaabu import KaabuTransaction

    # ── 1. NB PDVs dans le portefeuille ──────────────────────────────────────
    nb_pdv = db.query(func.count(PDV.id)).filter(
        PDV.superviseur.ilike(f"%{superviseur}%"),
        PDV.statut != 'DESACTIVE' if hasattr(PDV, 'statut') else True,
    ).scalar() or 0

    # Récupérer les numéros PDV du superviseur
    pdvs_sup = db.query(PDV.numero_pdv).filter(
        PDV.superviseur.ilike(f"%{superviseur}%")
    ).all()
    numeros_pdv = [r[0] for r in pdvs_sup if r[0]]

    # ── 2. CA OMY + ACTIF OMY ────────────────────────────────────────────────
    perf_rows = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois,
        MonthlyPerformance.indicateur == 'OMY',
        MonthlyPerformance.pdv_id.in_(
            db.query(PDV.id).filter(PDV.superviseur.ilike(f"%{superviseur}%"))
        )
    ).all()

    ca_omy = sum(p.montant_transaction or p.ca or 0 for p in perf_rows)
    nb_actif_omy = sum(1 for p in perf_rows if p.est_actif)
    taux_actif_omy = round(nb_actif_omy / len(perf_rows) * 100, 1) if perf_rows else 0
    moy_ca_omy = round(ca_omy / nb_actif_omy, 0) if nb_actif_omy else 0

    # ── 3. COMMISSIONS OMY ────────────────────────────────────────────────────
    # Commissions depuis MonthlyPerformance (commission_pdg = commission agent réelle)
    try:
        comm_perf = db.query(
            func.sum(MonthlyPerformance.commission_pdg).label("total_comm"),
            func.count(MonthlyPerformance.id).label("nb")
        ).filter(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois,
            MonthlyPerformance.indicateur == 'OMY',
            MonthlyPerformance.pdv_id.in_(
                db.query(PDV.id).filter(PDV.superviseur.ilike(f"%{superviseur}%"))
            )
        ).first()
        commission_omy = int(comm_perf.total_comm or 0)
        nb_comm = int(comm_perf.nb or 0)
        moy_commission = round(commission_omy / nb_comm, 0) if nb_comm else 0
    except Exception as e:
        commission_omy = 0
        moy_commission = 0

    # ── 4. NAFAMA ─────────────────────────────────────────────────────────────
    if numeros_pdv:
        nafama_rows = db.query(NafamaTransaction).filter(
            NafamaTransaction.annee == annee,
            NafamaTransaction.mois == mois,
            NafamaTransaction.numero_pdv.in_(numeros_pdv)
        ).all()
        ca_nafama = sum(r.montant or 0 for r in nafama_rows)
        pdvs_actifs_nafama = len(set(r.numero_pdv for r in nafama_rows))
        taux_actif_nafama = round(pdvs_actifs_nafama / nb_pdv * 100, 1) if nb_pdv else 0
    else:
        ca_nafama = 0
        pdvs_actifs_nafama = 0
        taux_actif_nafama = 0

    # ── 5. KAABU MOBILE ───────────────────────────────────────────────────────
    semaines_mois = _get_semaines_mois(db, annee, mois)
    try:
        if numeros_pdv and semaines_mois:
            from sqlalchemy import text
            kaabu_rows = db.query(KaabuTransaction.numero_pdv, KaabuTransaction.est_actif).filter(
                KaabuTransaction.annee == annee,
                KaabuTransaction.semaine.in_(semaines_mois),
                KaabuTransaction.numero_pdv.in_(numeros_pdv)
            ).all()
            pdvs_actifs_km = len(set(r.numero_pdv for r in kaabu_rows if r.est_actif))
            taux_actif_km = round(pdvs_actifs_km / nb_pdv * 100, 1) if nb_pdv else 0
        else:
            taux_actif_km = 0
    except Exception:
        taux_actif_km = 0

    # ── Calcul des scores KPI (sur 100 chacun) ────────────────────────────────
    OBJECTIFS = {
        'nb_pdv': 30,
        'ca_omy': 800_000_000,
        'commission_omy': 800_000,
        'taux_actif_omy': 100,
        'taux_actif_km': 90,
        'taux_actif_nafama': 85,
        'ca_nafama': 6_000_000,
    }

    scores_kpi = {
        'nb_pdv': _pct_score(nb_pdv, OBJECTIFS['nb_pdv']),
        'ca_omy': _pct_score(ca_omy, OBJECTIFS['ca_omy']),
        'commission_omy': _pct_score(commission_omy, OBJECTIFS['commission_omy']),
        'taux_actif_omy': _pct_score(taux_actif_omy, OBJECTIFS['taux_actif_omy']),
        'taux_actif_km': _pct_score(taux_actif_km, OBJECTIFS['taux_actif_km']),
        'taux_actif_nafama': _pct_score(taux_actif_nafama, OBJECTIFS['taux_actif_nafama']),
        'ca_nafama': _pct_score(ca_nafama, OBJECTIFS['ca_nafama']),
    }
    # Score KPI global = moyenne des scores
    score_kpi_global = round(sum(scores_kpi.values()) / len(scores_kpi), 2)

    # Infos superviseur depuis les PDVs
    pdv_sample = db.query(PDV).filter(PDV.superviseur.ilike(f"%{superviseur}%")).first()
    sous_zones = list(set(p[0] for p in db.query(PDV.sous_zone).filter(PDV.superviseur.ilike(f"%{superviseur}%"), PDV.sous_zone.isnot(None)).all()))
    zone_sup = pdv_sample.zone if pdv_sample else None
    types_pdv = list(set(str(p[0].value if hasattr(p[0],'value') else p[0]) for p in db.query(PDV.type_pdv).filter(PDV.superviseur.ilike(f"%{superviseur}%"), PDV.type_pdv.isnot(None)).all() if p[0]))

    return {
        'superviseur': superviseur,
        'annee': annee,
        'mois': mois,
        # Infos superviseur
        'zone': zone_sup,
        'sous_zones': sous_zones,
        'types_pdv': types_pdv,
        # Valeurs brutes
        'nb_pdv': nb_pdv,
        'ca_omy': int(ca_omy),
        'moy_ca_omy': int(moy_ca_omy),
        'commission_omy': int(commission_omy),
        'moy_commission': int(moy_commission),
        'taux_actif_omy': taux_actif_omy,
        'taux_actif_km': taux_actif_km,
        'nb_actif_nafama': pdvs_actifs_nafama,
        'taux_actif_nafama': taux_actif_nafama,
        'ca_nafama': int(ca_nafama),
        # Objectifs
        'objectifs': OBJECTIFS,
        # Scores KPI (0-100)
        'scores_kpi': scores_kpi,
        'score_kpi_global': score_kpi_global,
    }


# ─── GÉNÉRATION PDVs MYSTERY ──────────────────────────────────────────────────

def generer_pdvs_mystery(db: Session, superviseur: str, nb: int = 5, exclus: List[str] = None) -> List[Dict]:
    """
    Génère aléatoirement N PDVs à appeler pour le mystery shopping.
    Exclut les PDVs déjà appelés (injoignables).
    """
    exclus = exclus or []
    q = db.query(PDV).filter(
        PDV.superviseur.ilike(f"%{superviseur}%"),
    )
    if exclus:
        q = q.filter(PDV.numero_pdv.notin_(exclus))
    pdvs = q.all()

    if len(pdvs) <= nb:
        selected = pdvs
    else:
        selected = random.sample(pdvs, nb)

    return [
        {
            "numero_pdv": p.numero_pdv,
            "nom": p.nom,
            "nom_gerant": getattr(p, 'nom_gerant', None),
            # Le numero_pdv EST le numéro flotte Orange (ex: 77995927)
            "numero_flotte": str(p.numero_pdv) if p.numero_pdv else None,
            # numero_personnel = numéro personnel du gérant
            "numero_personnel": str(p.numero_personnel).strip() if p.numero_personnel else None,
            "telephone": str(p.numero_pdv) if p.numero_pdv else None,  # alias
            "quartier": p.quartier,
            "localite": getattr(p, 'commune', None),
            "zone": p.zone,
            "superviseur": p.superviseur,
            "teleconseillere": p.teleconseillere,
        }
        for p in selected
    ]


# ─── GÉNÉRATION PDVs PRÉSENTIEL ───────────────────────────────────────────────

def generer_pdvs_presentiel(db: Session, superviseur: str, nb: int = 5) -> List[Dict]:
    """Génère N PDVs aléatoires pour le test de maîtrise en présentiel."""
    pdvs = db.query(PDV).filter(
        PDV.superviseur.ilike(f"%{superviseur}%"),
    ).all()

    if len(pdvs) <= nb:
        selected = pdvs
    else:
        selected = random.sample(pdvs, nb)

    return [
        {
            "numero_pdv": p.numero_pdv,
            "nom": p.nom,
            "numero_flotte": str(p.numero_pdv) if p.numero_pdv else None,
            "numero_personnel": str(p.numero_personnel).strip() if p.numero_personnel else None,
            "telephone": str(p.numero_pdv) if p.numero_pdv else None,
            "quartier": p.quartier,
            "adresse": getattr(p, 'adresse', None) or p.quartier or "—",
            "flotte": str(p.numero_pdv) if p.numero_pdv else None,
        }
        for p in selected
    ]


# ─── CALCUL SCORE FINAL ───────────────────────────────────────────────────────

def calculer_score_final(
    score_kpi: float,           # Score KPI global (0-100)
    mystery_calls: List[Dict],  # Liste des appels TC avec leurs notes
    note_maitrise_pdv: float,   # Note /10 maîtrise PDVs
    note_maitrise_zone: float,  # Note /10 maîtrise zone
) -> Dict[str, Any]:
    """
    Calcule le score final de l'évaluation.
    KPIs=70% | Mystery=20% | Présentiel=10%
    """
    # Score mystery (moyenne des 3 questions × 5 PDVs)
    if mystery_calls:
        total_mystery = 0
        nb_valid = 0
        for call in mystery_calls:
            if call.get('statut') == 'JOIGNABLE':
                q1 = call.get('note_connaissance', 0) or 0
                q2 = call.get('note_visite', 0) or 0
                q3 = call.get('note_superviseur', 0) or 0
                moy = (q1 + q2 + q3) / 3
                total_mystery += moy
                nb_valid += 1
        score_mystery_10 = total_mystery / nb_valid if nb_valid else 0
        score_mystery_100 = round(score_mystery_10 * 10, 2)
    else:
        score_mystery_100 = 0

    # Score présentiel
    note_pres = (note_maitrise_pdv + note_maitrise_zone) / 2
    score_presentiel_100 = round(note_pres * 10, 2)

    # Score final pondéré
    score_final = round(
        score_kpi * 0.70 +
        score_mystery_100 * 0.20 +
        score_presentiel_100 * 0.10,
        2
    )

    mention = (
        "⭐⭐⭐ Excellent" if score_final >= 90 else
        "⭐⭐ Très Bien" if score_final >= 75 else
        "⭐ Bien" if score_final >= 60 else
        "⚠️ Passable" if score_final >= 50 else
        "🔴 Insuffisant"
    )

    return {
        'score_kpi': score_kpi,
        'score_mystery': score_mystery_100,
        'score_presentiel': score_presentiel_100,
        'score_final': score_final,
        'mention': mention,
        'detail': {
            'poids_kpi': 0.70,
            'poids_mystery': 0.20,
            'poids_presentiel': 0.10,
            'contribution_kpi': round(score_kpi * 0.70, 2),
            'contribution_mystery': round(score_mystery_100 * 0.20, 2),
            'contribution_presentiel': round(score_presentiel_100 * 0.10, 2),
        }
    }


# ─── LISTE SUPERVISEURS ───────────────────────────────────────────────────────

def get_liste_superviseurs(db: Session) -> List[str]:
    """Retourne tous les superviseurs distincts dans la base PDV."""
    rows = db.query(PDV.superviseur).filter(
        PDV.superviseur.isnot(None),
        PDV.superviseur != '',
    ).distinct().order_by(PDV.superviseur).all()
    return [r[0] for r in rows if r[0]]
