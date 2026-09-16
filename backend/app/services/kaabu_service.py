"""
Service KAABU Mobile — Toute la logique métier pour les dashboards hebdo.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, case
from app.models.kaabu import KaabuTransaction
from typing import List, Dict, Any, Optional
import os


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _pct(a, b): return round(a / b * 100, 1) if b else 0
def _taux(op, total): return round(op / total, 4) if total else 0


import datetime

def _semaine_to_mois(annee: int, semaine: str) -> int:
    """Convertit une semaine ISO (ex: 'S14') en mois (1-12) de l'année donnée.

    On se base sur le JEUDI de la semaine (jour de référence ISO), et non sur
    le lundi :
      - le lundi de la semaine ISO 1 peut tomber fin décembre de l'année
        précédente (2026 : S01 démarre le lundi 29/12/2025) → un mois
        « Décembre » fantôme apparaissait dans les périodes mensuelles ;
      - le lundi sous-estime le mois : S27 (29/06 → 05/07) était comptée en
        Juin alors que la semaine appartient à Juillet.
    Le jeudi donne : JUILLET = S27-S31, AOÛT = S32-S35, SEPTEMBRE = S36-S37.
    """
    try:
        w = int(semaine.replace('S', '').replace('s', '').strip())
        d = datetime.date.fromisocalendar(annee, w, 4)   # jeudi de la semaine
        if d.year < annee:
            d = datetime.date(annee, 1, 1)
        elif d.year > annee:
            d = datetime.date(annee, 12, 31)
        return d.month
    except:
        return 0


def _get_semaines_du_mois(db: Session, annee: int, mois: int) -> List[str]:
    """Retourne les semaines ISO qui appartiennent à un mois donné."""
    semaines = [r[0] for r in db.query(KaabuTransaction.semaine)
                .filter(KaabuTransaction.annee == annee)
                .distinct().all()]
    return [s for s in semaines if _semaine_to_mois(annee, s) == mois]


# ─── PÉRIODES DISPONIBLES ─────────────────────────────────────────────────────

def get_available_periods_mensuel(db: Session) -> Dict[str, Any]:
    """Retourne les mois disponibles calculés depuis les semaines.

    Renvoie aussi `dernier` : le mois de la DERNIÈRE semaine présente en base.
    C'est ce que l'interface doit sélectionner par défaut (le dernier mois
    rempli), plutôt que le dernier élément de la liste triée.
    """
    rows = (db.query(KaabuTransaction.annee, KaabuTransaction.semaine)
            .distinct().order_by(KaabuTransaction.annee, KaabuTransaction.semaine).all())
    mois_set = set()
    dernier = None
    for r in rows:
        m = _semaine_to_mois(r.annee, r.semaine)
        if m > 0:
            mois_set.add((r.annee, m))
            # les semaines sont triées : la dernière rencontrée est la plus récente
            dernier = {"annee": r.annee, "mois": m, "semaine": r.semaine}
    MOIS_NOMS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
    mois_list = sorted(mois_set)
    return {
        "mois": [{"annee": a, "mois": m, "label": MOIS_NOMS[m]} for a, m in mois_list],
        "dernier": dernier,
    }


def get_available_periods(db: Session) -> Dict[str, Any]:
    rows = (
        db.query(KaabuTransaction.annee, KaabuTransaction.semaine)
        .distinct()
        .order_by(KaabuTransaction.annee, KaabuTransaction.semaine)
        .all()
    )
    semaines = [{"annee": r.annee, "semaine": r.semaine, "label": f"{r.semaine} · {r.annee}"}
                for r in rows]
    return {"semaines": semaines, "total": len(semaines)}


# ─── VUE D'ENSEMBLE ───────────────────────────────────────────────────────────

def get_vue_ensemble(db: Session, annee: int, semaine: str) -> Dict[str, Any]:
    """KPIs globaux pour une semaine donnée."""
    rows = db.query(KaabuTransaction).filter(
        KaabuTransaction.annee == annee,
        KaabuTransaction.semaine == semaine
    ).all()

    if not rows:
        return {"semaine": semaine, "annee": annee, "total_pdv": 0}

    total_pdv = len(set(r.numero_pdv for r in rows))
    actifs = sum(1 for r in rows if r.est_actif)
    inactifs = total_pdv - actifs
    volume_total = sum(r.volume_kaabu or 0 for r in rows)
    montant_total = sum(r.montant_global or 0 for r in rows)
    vol_cashin = sum(r.volume_cashin or 0 for r in rows)
    vol_cashout = sum(r.volume_cashout or 0 for r in rows)
    mnt_cashin = sum(r.montant_cashin or 0 for r in rows)
    mnt_cashout = sum(r.montant_cashout or 0 for r in rows)

    # Semaine précédente pour évolution
    # Trouver la semaine précédente
    all_sems = [r[0] for r in db.query(KaabuTransaction.semaine).filter(
        KaabuTransaction.annee == annee
    ).distinct().order_by(KaabuTransaction.semaine).all()]
    prev_sem = None
    if semaine in all_sems:
        idx = all_sems.index(semaine)
        if idx > 0:
            prev_sem = all_sems[idx - 1]

    volume_prec = 0
    montant_prec = 0
    actifs_prec = 0
    if prev_sem:
        rows_prec = db.query(KaabuTransaction).filter(
            KaabuTransaction.annee == annee,
            KaabuTransaction.semaine == prev_sem
        ).all()
        volume_prec = sum(r.volume_kaabu or 0 for r in rows_prec)
        montant_prec = sum(r.montant_global or 0 for r in rows_prec)
        actifs_prec = sum(1 for r in rows_prec if r.est_actif)

    # Segments
    par_segment = {}
    for r in rows:
        seg = r.segment or "Non défini"
        if seg not in par_segment:
            par_segment[seg] = {"total": 0, "actifs": 0, "volume": 0, "montant": 0}
        par_segment[seg]["total"] += 1
        if r.est_actif:
            par_segment[seg]["actifs"] += 1
        par_segment[seg]["volume"] += r.volume_kaabu or 0
        par_segment[seg]["montant"] += r.montant_global or 0

    return {
        "semaine": semaine,
        "annee": annee,
        "semaine_precedente": prev_sem,
        "total_pdv": total_pdv,
        "actifs": actifs,
        "inactifs": inactifs,
        "taux_activite": _taux(actifs, total_pdv),
        "volume_kaabu": volume_total,
        "montant_global": montant_total,
        "volume_cashin": vol_cashin,
        "montant_cashin": mnt_cashin,
        "volume_cashout": vol_cashout,
        "montant_cashout": mnt_cashout,
        "evolution_volume": round((volume_total - volume_prec) / volume_prec * 100, 1) if volume_prec else 0,
        "evolution_montant": round((montant_total - montant_prec) / montant_prec * 100, 1) if montant_prec else 0,
        "evolution_actifs": actifs - actifs_prec,
        "par_segment": [
            {"segment": k, **v, "taux": _taux(v["actifs"], v["total"])}
            for k, v in sorted(par_segment.items(), key=lambda x: -x[1]["volume"])
        ],
    }


# ─── PAR SUPERVISEUR ──────────────────────────────────────────────────────────

def get_par_superviseur(db: Session, annee: int, semaine: str) -> List[Dict]:
    rows = (
        db.query(
            KaabuTransaction.superviseur,
            func.count(distinct(KaabuTransaction.numero_pdv)).label("total_pdv"),
            func.sum(case((KaabuTransaction.est_actif == 1, 1), else_=0)).label("actifs"),
            func.sum(KaabuTransaction.volume_kaabu).label("volume"),
            func.sum(KaabuTransaction.montant_global).label("montant"),
        )
        .filter(KaabuTransaction.annee == annee, KaabuTransaction.semaine == semaine)
        .group_by(KaabuTransaction.superviseur)
        .order_by(func.sum(KaabuTransaction.montant_global).desc())
        .all()
    )
    total_montant = sum(r.montant or 0 for r in rows) or 1
    result = []
    for i, r in enumerate(rows):
        actifs = int(r.actifs or 0)
        total = int(r.total_pdv or 0)
        montant = int(r.montant or 0)
        result.append({
            "rang": i + 1,
            "superviseur": r.superviseur or "—",
            "total_pdv": total,
            "actifs": actifs,
            "inactifs": total - actifs,
            "taux": _taux(actifs, total),
            "volume": int(r.volume or 0),
            "montant": montant,
            "part_vente": round(montant / total_montant, 4),
        })
    return result


# ─── PAR GESTIONNAIRE (Groupes) ───────────────────────────────────────────────

def get_par_gestionnaire(db: Session, annee: int, semaine: str) -> List[Dict]:
    rows = (
        db.query(
            KaabuTransaction.groupe,
            func.count(distinct(KaabuTransaction.numero_pdv)).label("total_pdv"),
            func.sum(case((KaabuTransaction.est_actif == 1, 1), else_=0)).label("actifs"),
            func.sum(KaabuTransaction.volume_kaabu).label("volume"),
            func.sum(KaabuTransaction.montant_global).label("montant"),
        )
        .filter(KaabuTransaction.annee == annee, KaabuTransaction.semaine == semaine)
        .group_by(KaabuTransaction.groupe)
        .order_by(func.sum(KaabuTransaction.montant_global).desc())
        .all()
    )
    total_montant = sum(r.montant or 0 for r in rows) or 1
    result = []
    for i, r in enumerate(rows):
        actifs = int(r.actifs or 0)
        total = int(r.total_pdv or 0)
        montant = int(r.montant or 0)
        result.append({
            "rang": i + 1,
            "groupe": r.groupe or "—",
            "total_pdv": total,
            "actifs": actifs,
            "inactifs": total - actifs,
            "taux": _taux(actifs, total),
            "volume": int(r.volume or 0),
            "montant": montant,
            "part_vente": round(montant / total_montant, 4),
        })
    return result


# ─── PAR COACH ────────────────────────────────────────────────────────────────

def get_par_coach(db: Session, annee: int, semaine: str) -> List[Dict]:
    rows = (
        db.query(
            KaabuTransaction.coach_distri,
            func.count(distinct(KaabuTransaction.numero_pdv)).label("total_pdv"),
            func.sum(case((KaabuTransaction.est_actif == 1, 1), else_=0)).label("actifs"),
            func.sum(KaabuTransaction.volume_kaabu).label("volume"),
            func.sum(KaabuTransaction.montant_global).label("montant"),
        )
        .filter(KaabuTransaction.annee == annee, KaabuTransaction.semaine == semaine,
                KaabuTransaction.coach_distri.isnot(None))
        .group_by(KaabuTransaction.coach_distri)
        .order_by(func.sum(KaabuTransaction.montant_global).desc())
        .all()
    )
    total_montant = sum(r.montant or 0 for r in rows) or 1
    result = []
    for i, r in enumerate(rows):
        actifs = int(r.actifs or 0)
        total = int(r.total_pdv or 0)
        montant = int(r.montant or 0)
        result.append({
            "rang": i + 1,
            "coach": r.coach_distri or "—",
            "total_pdv": total,
            "actifs": actifs,
            "taux": _taux(actifs, total),
            "volume": int(r.volume or 0),
            "montant": montant,
            "part_vente": round(montant / total_montant, 4),
        })
    return result


# ─── PAR TÉLÉCONSEILLÈRE ──────────────────────────────────────────────────────

def get_par_teleconseillere(db: Session, annee: int, semaine: str) -> List[Dict]:
    rows = (
        db.query(
            KaabuTransaction.teleconseillere,
            func.count(distinct(KaabuTransaction.numero_pdv)).label("total_pdv"),
            func.sum(case((KaabuTransaction.est_actif == 1, 1), else_=0)).label("actifs"),
            func.sum(KaabuTransaction.volume_kaabu).label("volume"),
            func.sum(KaabuTransaction.montant_global).label("montant"),
        )
        .filter(KaabuTransaction.annee == annee, KaabuTransaction.semaine == semaine,
                KaabuTransaction.teleconseillere.isnot(None))
        .group_by(KaabuTransaction.teleconseillere)
        .order_by(func.sum(KaabuTransaction.montant_global).desc())
        .all()
    )
    total_montant = sum(r.montant or 0 for r in rows) or 1
    result = []
    for i, r in enumerate(rows):
        actifs = int(r.actifs or 0)
        total = int(r.total_pdv or 0)
        montant = int(r.montant or 0)
        result.append({
            "rang": i + 1,
            "teleconseillere": r.teleconseillere or "—",
            "total_pdv": total,
            "actifs": actifs,
            "inactifs": total - actifs,
            "taux": _taux(actifs, total),
            "volume": int(r.volume or 0),
            "montant": montant,
            "part_vente": round(montant / total_montant, 4),
        })
    return result


# ─── PAR DÉVELOPPEUR ──────────────────────────────────────────────────────────

def get_par_developpeur(db: Session, annee: int, semaine: str) -> List[Dict]:
    rows = (
        db.query(
            KaabuTransaction.developpeur,
            func.count(distinct(KaabuTransaction.numero_pdv)).label("total_pdv"),
            func.sum(case((KaabuTransaction.est_actif == 1, 1), else_=0)).label("actifs"),
            func.sum(KaabuTransaction.volume_kaabu).label("volume"),
            func.sum(KaabuTransaction.montant_global).label("montant"),
        )
        .filter(KaabuTransaction.annee == annee, KaabuTransaction.semaine == semaine,
                KaabuTransaction.developpeur.isnot(None))
        .group_by(KaabuTransaction.developpeur)
        .order_by(func.sum(KaabuTransaction.montant_global).desc())
        .all()
    )
    total_montant = sum(r.montant or 0 for r in rows) or 1
    result = []
    for i, r in enumerate(rows):
        actifs = int(r.actifs or 0)
        total = int(r.total_pdv or 0)
        montant = int(r.montant or 0)
        result.append({
            "rang": i + 1,
            "developpeur": r.developpeur or "—",
            "total_pdv": total,
            "actifs": actifs,
            "taux": _taux(actifs, total),
            "volume": int(r.volume or 0),
            "montant": montant,
            "part_vente": round(montant / total_montant, 4),
        })
    return result


# ─── HORS ZONE / BITTARD ──────────────────────────────────────────────────────

def get_hors_zone(db: Session, annee: int, semaine: str) -> Dict[str, Any]:
    rows = (
        db.query(KaabuTransaction)
        .filter(
            KaabuTransaction.annee == annee,
            KaabuTransaction.semaine == semaine,
            KaabuTransaction.est_hors_zone == 1,
        )
        .order_by(KaabuTransaction.montant_global.desc())
        .all()
    )
    # Regrouper par agent hors zone
    par_agent = {}
    for r in rows:
        agent = r.agent_operation_speciale or r.developpeur or "—"
        if agent not in par_agent:
            par_agent[agent] = {"agent": agent, "total_pdv": 0, "actifs": 0, "volume": 0, "montant": 0, "pdvs": []}
        par_agent[agent]["total_pdv"] += 1
        if r.est_actif:
            par_agent[agent]["actifs"] += 1
        par_agent[agent]["volume"] += r.volume_kaabu or 0
        par_agent[agent]["montant"] += r.montant_global or 0
        par_agent[agent]["pdvs"].append({
            "numero_pdv": r.numero_pdv,
            "login": r.login,
            "localite": r.localite,
            "quartier": r.quartier,
            "est_actif": r.est_actif,
            "volume": r.volume_kaabu or 0,
            "montant": r.montant_global or 0,
        })

    agents = sorted(par_agent.values(), key=lambda x: -x["montant"])
    for a in agents:
        a["taux"] = _taux(a["actifs"], a["total_pdv"])

    return {
        "total_pdv": len(rows),
        "actifs": sum(1 for r in rows if r.est_actif),
        "volume": sum(r.volume_kaabu or 0 for r in rows),
        "montant": sum(r.montant_global or 0 for r in rows),
        "par_agent": agents,
    }


# ─── PDVs INACTIFS ────────────────────────────────────────────────────────────

def _population_kaabu(db: Session, annee: int) -> set:
    """PDV connus de KAABU sur l'année (apparus au moins une semaine)."""
    return {r[0] for r in db.query(KaabuTransaction.numero_pdv).filter(
        KaabuTransaction.annee == annee
    ).distinct().all() if r[0]}


def _infos_pdv_recent(db: Session, annee: int) -> Dict[str, Any]:
    """Dernière ligne connue par PDV (sert à afficher un PDV inactif)."""
    rows = (db.query(KaabuTransaction)
            .filter(KaabuTransaction.annee == annee)
            .order_by(KaabuTransaction.semaine).all())
    info: Dict[str, Any] = {}
    for r in rows:
        info[r.numero_pdv] = r
    return info


def _pdvs_inactifs(db: Session, annee: int, semaines: List[str],
                   teleconseillere: Optional[str] = None) -> List[Any]:
    """PDV inactifs sur une période.

    Un PDV est inactif s'il fait partie de la population KAABU de l'année mais
    n'a AUCUNE activité sur la période (aucune ligne avec est_actif = 1).

    Cette définition couvre les deux formats :
      - historique S01-S31 : les lignes présentes mais étiquetées INACTIF
        par Orange ne sont pas dans l'ensemble actif → elles ressortent ;
      - nouveau format 'ACTIFS KM' : la feuille ne contient que des PDV actifs,
        donc les inactifs sont les PDV du référentiel ABSENTS de la semaine.
    """
    population = _population_kaabu(db, annee)
    actifs = {r[0] for r in db.query(KaabuTransaction.numero_pdv).filter(
        KaabuTransaction.annee == annee,
        KaabuTransaction.semaine.in_(semaines),
        KaabuTransaction.est_actif == 1,
    ).distinct().all() if r[0]}

    info = _infos_pdv_recent(db, annee)
    result = []
    for num in sorted(population - actifs):
        r = info.get(num)
        if r is None:
            continue
        if teleconseillere and teleconseillere.lower() not in (r.teleconseillere or '').lower():
            continue
        result.append(r)
    return result


def get_inactifs(db: Session, annee: int, semaine: str, teleconseillere: Optional[str] = None) -> Dict[str, Any]:
    # Semaine précédente (pour afficher le dernier volume connu)
    all_sems = [r[0] for r in db.query(KaabuTransaction.semaine).filter(
        KaabuTransaction.annee == annee
    ).distinct().order_by(KaabuTransaction.semaine).all()]
    prev_sem = None
    if semaine in all_sems:
        idx = all_sems.index(semaine)
        if idx > 0:
            prev_sem = all_sems[idx - 1]

    prev_data = {}
    if prev_sem:
        prev_rows = db.query(KaabuTransaction).filter(
            KaabuTransaction.annee == annee,
            KaabuTransaction.semaine == prev_sem,
        ).all()
        prev_data = {r.numero_pdv: r for r in prev_rows}

    rows = _pdvs_inactifs(db, annee, [semaine], teleconseillere)
    # tri par superviseur puis numéro, comme avant
    rows.sort(key=lambda r: ((r.superviseur or ''), r.numero_pdv))

    pdvs = []
    for r in rows:
        prev = prev_data.get(r.numero_pdv)
        pdvs.append({
            "numero_pdv": r.numero_pdv,
            "login": r.login,
            "superviseur": r.superviseur,
            "groupe": r.groupe,
            "teleconseillere": r.teleconseillere,
            "coach": r.coach_distri,
            "developpeur": r.developpeur,
            "localite": r.localite,
            "quartier": r.quartier,
            "situation_login": r.situation_login,
            "segment": r.segment,
            "volume_precedent": prev.volume_kaabu if prev else 0,
            "montant_precedent": prev.montant_global if prev else 0,
            "etait_actif_avant": bool(prev and prev.est_actif),
        })

    return {
        "total": len(pdvs),
        "semaine": semaine,
        "semaine_precedente": prev_sem,
        "pdvs": pdvs,
    }


# ─── PDVs EN BAISSE ───────────────────────────────────────────────────────────

def get_en_baisse(db: Session, annee: int, semaine: str, seuil_pct: float = -20.0, teleconseillere: Optional[str] = None) -> Dict[str, Any]:
    # Semaine précédente
    all_sems = [r[0] for r in db.query(KaabuTransaction.semaine).filter(
        KaabuTransaction.annee == annee
    ).distinct().order_by(KaabuTransaction.semaine).all()]
    prev_sem = None
    if semaine in all_sems:
        idx = all_sems.index(semaine)
        if idx > 0:
            prev_sem = all_sems[idx - 1]

    if not prev_sem:
        return {"total": 0, "pdvs": [], "seuil": seuil_pct}

    # PDVs actifs cette semaine
    q_curr = db.query(KaabuTransaction).filter(
        KaabuTransaction.annee == annee,
        KaabuTransaction.semaine == semaine,
        KaabuTransaction.est_actif == 1,
    )
    if teleconseillere:
        q_curr = q_curr.filter(KaabuTransaction.teleconseillere.ilike(f"%{teleconseillere}%"))
    curr_rows = {r.numero_pdv: r for r in q_curr.all()}

    # PDVs précédents
    prev_rows = {r.numero_pdv: r for r in db.query(KaabuTransaction).filter(
        KaabuTransaction.annee == annee,
        KaabuTransaction.semaine == prev_sem,
        KaabuTransaction.est_actif == 1,
    ).all()}

    declining = []
    for pdv, curr in curr_rows.items():
        if pdv in prev_rows:
            prev = prev_rows[pdv]
            if prev.volume_kaabu and prev.volume_kaabu > 0:
                pct = (curr.volume_kaabu - prev.volume_kaabu) / prev.volume_kaabu * 100
                if pct <= seuil_pct:
                    abs_pct = abs(pct)
                    alerte = "🔴 Critique" if abs_pct > 40 else "🟠 Haute" if abs_pct > 20 else "⚪ Normale"
                    declining.append({
                        "numero_pdv": pdv,
                        "login": curr.login,
                        "superviseur": curr.superviseur,
                        "groupe": curr.groupe,
                        "teleconseillere": curr.teleconseillere,
                        "localite": curr.localite,
                        "quartier": curr.quartier,
                        "segment": curr.segment,
                        "volume_actuel": curr.volume_kaabu or 0,
                        "volume_precedent": prev.volume_kaabu or 0,
                        "montant_actuel": curr.montant_global or 0,
                        "montant_precedent": prev.montant_global or 0,
                        "variation_pct": round(pct, 1),
                        "alerte": alerte,
                    })

    declining.sort(key=lambda x: x["variation_pct"])
    critique = [p for p in declining if abs(p["variation_pct"]) > 40]
    haute = [p for p in declining if 20 < abs(p["variation_pct"]) <= 40]
    normale = [p for p in declining if abs(p["variation_pct"]) <= 20]

    return {
        "total": len(declining),
        "nb_critique": len(critique),
        "nb_haute": len(haute),
        "nb_normale": len(normale),
        "seuil": seuil_pct,
        "semaine_precedente": prev_sem,
        "pdvs": declining,
    }


# ─── ÉVOLUTION MULTI-SEMAINES ─────────────────────────────────────────────────

def get_evolution(db: Session, annee: int) -> List[Dict]:
    rows = (
        db.query(
            KaabuTransaction.semaine,
            func.count(distinct(KaabuTransaction.numero_pdv)).label("total_pdv"),
            func.sum(case((KaabuTransaction.est_actif == 1, 1), else_=0)).label("actifs"),
            func.sum(KaabuTransaction.volume_kaabu).label("volume"),
            func.sum(KaabuTransaction.montant_global).label("montant"),
        )
        .filter(KaabuTransaction.annee == annee)
        .group_by(KaabuTransaction.semaine)
        .order_by(KaabuTransaction.semaine)
        .all()
    )
    return [
        {
            "semaine": r.semaine,
            "label": r.semaine,
            "total_pdv": int(r.total_pdv or 0),
            "actifs": int(r.actifs or 0),
            "taux": _taux(int(r.actifs or 0), int(r.total_pdv or 0)),
            "volume": int(r.volume or 0),
            "montant": int(r.montant or 0),
        }
        for r in rows
    ]


# ─── FONCTIONS MENSUELLES (agrégation des semaines du mois) ──────────────────

def _get_semaines_filter(db, annee, mois):
    sems = _get_semaines_du_mois(db, annee, mois)
    return sems


def get_vue_ensemble_mensuel(db: Session, annee: int, mois: int) -> Dict[str, Any]:
    sems = _get_semaines_du_mois(db, annee, mois)
    if not sems:
        return {"annee": annee, "mois": mois, "total_pdv": 0}
    rows = db.query(KaabuTransaction).filter(
        KaabuTransaction.annee == annee,
        KaabuTransaction.semaine.in_(sems)
    ).all()
    pdvs = set(r.numero_pdv for r in rows)
    actifs_pdvs = set(r.numero_pdv for r in rows if r.est_actif)
    volume = sum(r.volume_kaabu or 0 for r in rows)
    montant = sum(r.montant_global or 0 for r in rows)
    vol_cin = sum(r.volume_cashin or 0 for r in rows)
    mnt_cin = sum(r.montant_cashin or 0 for r in rows)
    vol_cout = sum(r.volume_cashout or 0 for r in rows)
    mnt_cout = sum(r.montant_cashout or 0 for r in rows)

    # Mois précédent
    prev_mois = mois - 1 if mois > 1 else 12
    prev_annee = annee if mois > 1 else annee - 1
    sems_prec = _get_semaines_du_mois(db, prev_annee, prev_mois)
    rows_prec = db.query(KaabuTransaction).filter(
        KaabuTransaction.annee == prev_annee,
        KaabuTransaction.semaine.in_(sems_prec)
    ).all() if sems_prec else []
    vol_prec = sum(r.volume_kaabu or 0 for r in rows_prec)
    mnt_prec = sum(r.montant_global or 0 for r in rows_prec)
    actifs_prec = len(set(r.numero_pdv for r in rows_prec if r.est_actif))

    par_segment = {}
    for r in rows:
        seg = r.segment or "Non défini"
        if seg not in par_segment:
            par_segment[seg] = {"total": 0, "actifs": 0, "volume": 0, "montant": 0}
        par_segment[seg]["total"] += 1
        if r.est_actif:
            par_segment[seg]["actifs"] += 1
        par_segment[seg]["volume"] += r.volume_kaabu or 0
        par_segment[seg]["montant"] += r.montant_global or 0

    total = len(pdvs)
    actifs = len(actifs_pdvs)
    return {
        "annee": annee, "mois": mois, "semaines_incluses": sems,
        "total_pdv": total, "actifs": actifs, "inactifs": total - actifs,
        "taux_activite": _taux(actifs, total),
        "volume_kaabu": volume, "montant_global": montant,
        "volume_cashin": vol_cin, "montant_cashin": mnt_cin,
        "volume_cashout": vol_cout, "montant_cashout": mnt_cout,
        "evolution_volume": round((volume - vol_prec) / vol_prec * 100, 1) if vol_prec else 0,
        "evolution_montant": round((montant - mnt_prec) / mnt_prec * 100, 1) if mnt_prec else 0,
        "evolution_actifs": actifs - actifs_prec,
        "par_segment": [{"segment": k, **v, "taux": _taux(v["actifs"], v["total"])} for k, v in sorted(par_segment.items(), key=lambda x: -x[1]["volume"])],
    }


def _classement_mensuel(db, annee, mois, col_name):
    """Classement générique par colonne pour les données mensuelles."""
    sems = _get_semaines_du_mois(db, annee, mois)
    if not sems:
        return []
    from sqlalchemy import func, distinct, case
    col = getattr(KaabuTransaction, col_name)
    rows = (
        db.query(
            col,
            func.count(distinct(KaabuTransaction.numero_pdv)).label("total_pdv"),
            func.sum(case((KaabuTransaction.est_actif == 1, 1), else_=0)).label("actifs"),
            func.sum(KaabuTransaction.volume_kaabu).label("volume"),
            func.sum(KaabuTransaction.montant_global).label("montant"),
        )
        .filter(KaabuTransaction.annee == annee, KaabuTransaction.semaine.in_(sems), col.isnot(None))
        .group_by(col)
        .order_by(func.sum(KaabuTransaction.montant_global).desc())
        .all()
    )
    total_montant = sum(r.montant or 0 for r in rows) or 1
    result = []
    for i, r in enumerate(rows):
        actifs = int(r.actifs or 0); total = int(r.total_pdv or 0); montant = int(r.montant or 0)
        val = getattr(r, col_name, None) or "—"
        result.append({"rang": i+1, col_name: val, "total_pdv": total, "actifs": actifs, "inactifs": total - actifs,
                       "taux": _taux(actifs, total), "volume": int(r.volume or 0), "montant": montant, "part_vente": round(montant/total_montant, 4)})
    return result


def get_par_superviseur_mensuel(db, annee, mois): return _classement_mensuel(db, annee, mois, "superviseur")
def get_par_gestionnaire_mensuel(db, annee, mois): return _classement_mensuel(db, annee, mois, "groupe")
def get_par_coach_mensuel(db, annee, mois): return _classement_mensuel(db, annee, mois, "coach_distri")
def get_par_teleconseillere_mensuel(db, annee, mois): return _classement_mensuel(db, annee, mois, "teleconseillere")
def get_par_developpeur_mensuel(db, annee, mois): return _classement_mensuel(db, annee, mois, "developpeur")


def get_hors_zone_mensuel(db, annee, mois):
    sems = _get_semaines_du_mois(db, annee, mois)
    if not sems:
        return {"total_pdv": 0, "par_agent": []}
    # Réutiliser la logique hebdo mais pour toutes les semaines du mois
    rows = (db.query(KaabuTransaction).filter(
        KaabuTransaction.annee == annee,
        KaabuTransaction.semaine.in_(sems),
        KaabuTransaction.est_hors_zone == 1,
    ).order_by(KaabuTransaction.montant_global.desc()).all())
    par_agent = {}
    for r in rows:
        agent = r.agent_operation_speciale or r.developpeur or "—"
        if agent not in par_agent:
            par_agent[agent] = {"agent": agent, "total_pdv": 0, "actifs": 0, "volume": 0, "montant": 0, "pdvs": []}
        par_agent[agent]["total_pdv"] += 1
        if r.est_actif: par_agent[agent]["actifs"] += 1
        par_agent[agent]["volume"] += r.volume_kaabu or 0
        par_agent[agent]["montant"] += r.montant_global or 0
    agents = sorted(par_agent.values(), key=lambda x: -x["montant"])
    for a in agents: a["taux"] = _taux(a["actifs"], a["total_pdv"])
    return {"total_pdv": len(rows), "actifs": sum(1 for r in rows if r.est_actif),
            "volume": sum(r.volume_kaabu or 0 for r in rows), "montant": sum(r.montant_global or 0 for r in rows),
            "par_agent": agents}


def get_inactifs_mensuel(db, annee, mois, teleconseillere=None):
    sems = _get_semaines_du_mois(db, annee, mois)
    if not sems:
        return {"total": 0, "pdvs": []}
    # Même règle que l'hebdomadaire : inactif = PDV de la population KAABU
    # de l'année sans aucune activité sur le mois.
    rows = _pdvs_inactifs(db, annee, sems, teleconseillere)
    rows.sort(key=lambda r: ((r.superviseur or ''), r.numero_pdv))
    pdvs = [{"numero_pdv": r.numero_pdv, "login": r.login, "superviseur": r.superviseur,
             "groupe": r.groupe, "teleconseillere": r.teleconseillere, "localite": r.localite,
             "quartier": r.quartier, "segment": r.segment, "situation_login": r.situation_login}
            for r in rows]
    return {"total": len(pdvs), "mois": mois, "annee": annee, "pdvs": pdvs}


def get_en_baisse_mensuel(db, annee, mois, seuil_pct=-20.0, teleconseillere=None):
    sems = _get_semaines_du_mois(db, annee, mois)
    prev_mois = mois - 1 if mois > 1 else 12; prev_annee = annee if mois > 1 else annee - 1
    sems_prec = _get_semaines_du_mois(db, prev_annee, prev_mois)
    if not sems or not sems_prec:
        return {"total": 0, "pdvs": [], "seuil": seuil_pct}
    from sqlalchemy import func, distinct

    def _vol_par_pdv(sems_list, an):
        return {r[0]: int(r[1]) for r in db.query(KaabuTransaction.numero_pdv, func.sum(KaabuTransaction.volume_kaabu))
                .filter(KaabuTransaction.annee == an, KaabuTransaction.semaine.in_(sems_list), KaabuTransaction.est_actif == 1)
                .group_by(KaabuTransaction.numero_pdv).all()}

    curr_vol = _vol_par_pdv(sems, annee)
    prec_vol = _vol_par_pdv(sems_prec, prev_annee)

    # Infos PDV
    infos = {r.numero_pdv: r for r in db.query(KaabuTransaction).filter(
        KaabuTransaction.annee == annee, KaabuTransaction.semaine.in_(sems[:1])).all()}

    declining = []
    for pdv, vol in curr_vol.items():
        if pdv in prec_vol and prec_vol[pdv] > 0:
            pct = (vol - prec_vol[pdv]) / prec_vol[pdv] * 100
            if pct <= seuil_pct:
                r = infos.get(pdv)
                if teleconseillere and r and not (teleconseillere.lower() in (r.teleconseillere or '').lower()):
                    continue
                abs_pct = abs(pct)
                alerte = "🔴 Critique" if abs_pct > 40 else "🟠 Haute" if abs_pct > 20 else "⚪ Normale"
                declining.append({
                    "numero_pdv": pdv, "superviseur": r.superviseur if r else None,
                    "groupe": r.groupe if r else None, "teleconseillere": r.teleconseillere if r else None,
                    "localite": r.localite if r else None, "segment": r.segment if r else None,
                    "volume_actuel": vol, "volume_precedent": prec_vol[pdv],
                    "montant_actuel": 0, "montant_precedent": 0,
                    "variation_pct": round(pct, 1), "alerte": alerte,
                })
    declining.sort(key=lambda x: x["variation_pct"])
    return {"total": len(declining), "nb_critique": sum(1 for d in declining if abs(d["variation_pct"]) > 40),
            "nb_haute": sum(1 for d in declining if 20 < abs(d["variation_pct"]) <= 40),
            "nb_normale": sum(1 for d in declining if abs(d["variation_pct"]) <= 20),
            "seuil": seuil_pct, "pdvs": declining}


# ─── IMPORT EXCEL ─────────────────────────────────────────────────────────────

def _parse_periode_depuis_nom(nom: str) -> Optional[tuple]:
    """Déduit (annee, semaine) d'un nom de fichier, ex. 'DONNEES KAABU S36.xlsx'.

    Les fichiers hebdomadaires du nouveau format ('ACTIFS KM') ne contiennent
    ni colonne SEMAINE ni colonne ANNEE : la période n'est que dans le nom.
    Retourne None si aucune semaine n'est trouvée (on refuse alors d'importer
    plutôt que de deviner).
    """
    import re
    base = os.path.basename(nom or '')
    m = re.search(r'(?<![A-Za-z0-9])S\s*(\d{1,2})(?![0-9])', base, re.IGNORECASE)
    if not m:
        return None
    num = int(m.group(1))
    if not (1 <= num <= 53):
        return None
    semaine = f"S{num:02d}"
    m2 = re.search(r'(?<![0-9])(20\d{2})(?![0-9])', base)
    annee = int(m2.group(1)) if m2 else 2026
    return annee, semaine


def _pdvs_hors_zone(db: Session) -> set:
    """Ensemble des PDV hors zone.

    Deux sources complémentaires :
      - l'historique : PDV déjà marqués hors zone dans les imports précédents ;
      - le référentiel : pdvs.quartier contenant 'HORS ZONE'.
    Le nouveau format hebdomadaire ne porte plus l'information hors zone,
    on la reporte donc depuis l'historique.
    """
    from app.models.pdv import PDV as PDVModel
    hist = {r[0] for r in db.query(KaabuTransaction.numero_pdv).filter(
        KaabuTransaction.est_hors_zone == 1
    ).distinct().all() if r[0]}
    ref = set()
    try:
        from sqlalchemy import func as _func
        ref = {str(r[0]).strip() for r in db.query(PDVModel.numero_pdv).filter(
            _func.upper(_func.coalesce(PDVModel.quartier, '')).like('%HORS ZONE%')
        ).all() if r[0]}
    except Exception:
        ref = set()
    return hist | ref


def import_excel(db: Session, filepath: str, filename: Optional[str] = None,
                 semaine_forcee: Optional[str] = None,
                 annee_forcee: Optional[int] = None,
                 dry_run: bool = False) -> Dict[str, Any]:
    import pandas as pd

    # Lire la feuille SOURCE (essayer plusieurs noms)
    try:
        df = pd.read_excel(filepath, sheet_name='SOURCE')
    except:
        xl = pd.ExcelFile(filepath)
        df = pd.read_excel(filepath, sheet_name=xl.sheet_names[0])

    df.columns = [str(c).strip() for c in df.columns]

    # ── Normalisation des en-têtes ────────────────────────────────────────────
    # Fichier Orange : les en-têtes contiennent des espaces parasites et une
    # casse irrégulière ('COACH-DISTRI OML  ', 'DEVELOPPEUR ', ' RS'...).
    # Les anciennes clés de col_map conservaient ces espaces, alors que
    # df.columns était déjà nettoyé → la correspondance échouait et les
    # colonnes étaient importées vides (coach_distri, developpeur).
    def _norm_header(h) -> str:
        return ' '.join(str(h).replace('\u00a0', ' ').strip().upper().split())

    # Renommer les colonnes — supporte les 2 formats de fichier KAABU
    col_map = {
        # Format DASHBOARD SUIVI KAABU
        'NUMERO PDV': 'numero_pdv',
        'CATEGORIE': 'categorie',
        'volume_Cashin': 'volume_cashin',
        'Montant_Cashin': 'montant_cashin',
        'volume_Cashout': 'volume_cashout',
        'Montant_Cashout': 'montant_cashout',
        'VOLUME KAABU': 'volume_kaabu',
        'Montant Global': 'montant_global',
        'SEMAINE': 'semaine',
        'ANNEE': 'annee',
        'LOGIN': 'login',
        'SUPERVISEUR': 'superviseur',
        'GROUPE': 'groupe',
        'TELECONSEILLERE': 'teleconseillere',
        'TYPE': 'type_pdv',
        'LOCALITE': 'localite',
        'QUARTIER': 'quartier',
        'SITUATION LOGIN': 'situation_login',
        'SEGMENT': 'segment',
        'COACH-DISTRI OML': 'coach_distri',
        'DEVELOPPEUR': 'developpeur',
        "AGENT D'OPERATION SPECIALE": 'agent_operation_speciale',
        # Format DONNEES KAABU (simplifié)
        'Montant_Cashin': 'montant_cashin',
        'Montant_Cashout': 'montant_cashout',
        # Format ACTIFS KM (nouveau format hebdomadaire, 1 fichier = 1 semaine)
        # 'point_vente', 'DZ' et 'PARTENAIRE' sont volontairement ignorés.
        'NUMERO_UTILISATEUR': 'numero_pdv',
        # 'agent' du nouveau format = 'LOGIN' de l'ancien (nom + numéro PDV,
        # vérifié identique pour 92 % des PDV communs).
        'AGENT': 'login',
    }
    _renorm = {_norm_header(k): v for k, v in col_map.items()}
    df = df.rename(columns={
        c: _renorm[_norm_header(c)]
        for c in df.columns if _norm_header(c) in _renorm
    })
    df = df.dropna(subset=['numero_pdv'])
    df['numero_pdv'] = df['numero_pdv'].astype(str).str.strip()

    # ── Nouveau format hebdomadaire (feuille 'ACTIFS KM') ──────────────────────
    # Pas de colonnes SEMAINE / ANNEE : la période est dans le nom du fichier.
    a_colonne_semaine = 'semaine' in df.columns
    if not a_colonne_semaine:
        if semaine_forcee:
            annee_fichier = int(annee_forcee or 2026)
            semaine_fichier = str(semaine_forcee).strip().upper()
        else:
            periode = _parse_periode_depuis_nom(filename or filepath)
            if not periode:
                raise ValueError(
                    "Impossible de déterminer la semaine : le fichier ne contient pas de "
                    "colonne SEMAINE et le nom du fichier n'indique pas de semaine "
                    "(attendu : un nom contenant 'S32', 'S33', ...), et aucune semaine "
                    "n'a été précisée dans le formulaire."
                )
            annee_fichier, semaine_fichier = periode
        df['semaine'] = semaine_fichier
        df['annee'] = annee_fichier

    df['semaine'] = df['semaine'].astype(str).str.strip()

    # Gérer l'année : depuis colonne ou déterminer depuis semaine (2026 par défaut)
    if 'annee' in df.columns:
        df['annee'] = pd.to_numeric(df['annee'], errors='coerce').fillna(2026).astype(int)
    else:
        df['annee'] = 2026

    # Calculer VOLUME KAABU si manquant (= vol_cashin + vol_cashout)
    if 'volume_kaabu' not in df.columns:
        vc = pd.to_numeric(df.get('volume_cashin', 0), errors='coerce').fillna(0)
        vco = pd.to_numeric(df.get('volume_cashout', 0), errors='coerce').fillna(0)
        df['volume_kaabu'] = (vc + vco).astype(int)

    # Calculer Montant Global si manquant (= montant_cashin + montant_cashout)
    if 'montant_global' not in df.columns:
        mc = pd.to_numeric(df.get('montant_cashin', 0), errors='coerce').fillna(0)
        mco = pd.to_numeric(df.get('montant_cashout', 0), errors='coerce').fillna(0)
        df['montant_global'] = (mc + mco).astype(int)

    # ── Enrichissement depuis la table PDV (zone, superviseur, gestionnaire, etc.) ──
    from app.models.pdv import PDV as PDVModel
    pdv_info = {
        str(p.numero_pdv).strip(): {
            'superviseur': p.superviseur,
            'groupe': p.zone,          # Zone → groupe dans KAABU
            'teleconseillere': p.teleconseillere,
            'coach_distri': None,
            'developpeur': p.developpeur,
            # 'localite' correspond au QUARTIER du référentiel (vérifié : 1052/1098
            # PDV). La colonne 'commune' est vide dans toute la table pdvs.
            'localite': p.quartier,
            'quartier': p.quartier,
            'segment': p.segment,
            'type_pdv': str(p.type_pdv.value) if p.type_pdv and hasattr(p.type_pdv, 'value') else None,
            'sous_zone': p.sous_zone,
            'gestionnaire': p.gestionnaire,
        }
        for p in db.query(PDVModel).all()
        if p.numero_pdv
    }

    # Appliquer l'enrichissement ligne par ligne
    for col_kaabu, col_pdv in [
        ('superviseur', 'superviseur'), ('groupe', 'groupe'),
        ('teleconseillere', 'teleconseillere'), ('coach_distri', 'coach_distri'),
        ('developpeur', 'developpeur'), ('localite', 'localite'),
        ('quartier', 'quartier'), ('segment', 'segment'),
        # Ajoutés : ces colonnes existaient dans pdv_info mais n'étaient jamais
        # reportées, elles restaient vides pour les fichiers sans colonne TYPE.
        ('type_pdv', 'type_pdv'), ('sous_zone', 'sous_zone'),
        ('gestionnaire', 'gestionnaire'),
    ]:
        if col_kaabu not in df.columns:
            df[col_kaabu] = df['numero_pdv'].map(lambda x: pdv_info.get(x, {}).get(col_pdv))
        else:
            # Compléter les valeurs manquantes depuis la base PDV
            mask = df[col_kaabu].isna() | (df[col_kaabu] == '')
            df.loc[mask, col_kaabu] = df.loc[mask, 'numero_pdv'].map(
                lambda x: pdv_info.get(x, {}).get(col_pdv)
            )

    # ── Actif / inactif ────────────────────────────────────────────────────────
    # Ancien format : Orange fournit SITUATION LOGIN ('ACTIF REGULIER S31',
    # 'INACTIF S31', ...) et l'inactivité se lit dans le libellé.
    # Nouveau format 'ACTIFS KM' : la feuille ne liste QUE les PDV actifs et il
    # n'y a pas de situation login → toutes les lignes sont actives. Les inactifs
    # d'une semaine sont alors les PDV du référentiel ABSENTS de cette semaine
    # (calculé à la lecture des dashboards, pas ici).
    if 'situation_login' not in df.columns:
        df['situation_login'] = 'ACTIF KM'

    # Déterminer est_actif depuis SITUATION LOGIN
    def is_actif(situation):
        if pd.isna(situation): return 0
        s = str(situation).upper()
        # 'INACTIF' contient la sous-chaîne 'ACTIF' : il faut tester INACTIF
        # en premier, sinon tous les PDV inactifs étaient marqués actifs.
        if 'INACTIF' in s:
            return 0
        return 1 if 'ACTIF' in s else 0

    def is_hors_zone(agent_op, developpeur):
        for val in [agent_op, developpeur]:
            if pd.notna(val) and 'HORS ZONE' in str(val).upper():
                return 1
        return 0

    def safe_int(val):
        try:
            v = float(val)
            return 0 if pd.isna(v) else int(v)
        except: return 0

    # ── Hors zone ──────────────────────────────────────────────────────────────
    # L'ancien format portait 'HORS ZONE' dans AGENT D'OPERATION SPECIALE.
    # Le nouveau format ne l'a plus : on reporte l'historique (PDV déjà marqués
    # hors zone lors des imports précédents, complétés par pdvs.quartier).
    hors_zone_pdvs = _pdvs_hors_zone(db)

    # ── Mode aperçu : on n'écrit RIEN, on renvoie seulement ce qui serait importé ──
    if dry_run:
        def _num(col):
            if col not in df.columns:
                return 0
            return int(pd.to_numeric(df[col], errors='coerce').fillna(0).sum())

        nb_actifs = int(df['situation_login'].apply(is_actif).sum())
        nb_hors_zone = int(sum(
            1 for _, r in df.iterrows()
            if is_hors_zone(r.get('agent_operation_speciale'), r.get('developpeur'))
            or str(r.get('numero_pdv', '')).strip() in hors_zone_pdvs
        ))
        return {
            "apercu": True,
            "inserted": int(len(df)),
            "semaines": sorted(df['semaine'].astype(str).unique().tolist()),
            "annees": sorted(int(a) for a in df['annee'].unique().tolist()),
            "pdvs_uniques": int(df['numero_pdv'].nunique()),
            "montant_total": _num('montant_global'),
            "volume_total": _num('volume_kaabu'),
            "nb_actifs": nb_actifs,
            "nb_hors_zone": nb_hors_zone,
            "colonnes_source": [str(c) for c in df.columns],
        }

    # Supprimer et réimporter — en UNE SEULE transaction.
    # Avant, un commit était fait juste après la suppression puis tous les 1000
    # enregistrements : une erreur ou une coupure en cours de route laissait la
    # table amputée (incident du 16/09/2026, table réduite à 1000 lignes).
    # Désormais aucun commit intermédiaire : soit l'import complet réussit,
    # soit rien n'est modifié.
    if 'semaine' in df.columns and 'annee' in df.columns:
        annees = df['annee'].unique()
        semaines = df['semaine'].unique()
        db.query(KaabuTransaction).filter(
            KaabuTransaction.annee.in_(annees.tolist()),
            KaabuTransaction.semaine.in_(semaines.tolist()),
        ).delete(synchronize_session=False)

    inserted = 0
    batch = []
    for _, row in df.iterrows():
        t = KaabuTransaction(
            numero_pdv=str(row.get('numero_pdv', '')).strip(),
            login=str(row.get('login', '')) if pd.notna(row.get('login')) else None,
            semaine=str(row.get('semaine', '')).strip(),
            annee=int(row.get('annee', 2026)),
            categorie=str(row.get('categorie', '')) if pd.notna(row.get('categorie')) else None,
            volume_cashin=safe_int(row.get('volume_cashin')),
            montant_cashin=safe_int(row.get('montant_cashin')),
            volume_cashout=safe_int(row.get('volume_cashout')),
            montant_cashout=safe_int(row.get('montant_cashout')),
            volume_kaabu=safe_int(row.get('volume_kaabu')),
            montant_global=safe_int(row.get('montant_global')),
            superviseur=str(row.get('superviseur', '')) if pd.notna(row.get('superviseur')) else None,
            groupe=str(row.get('groupe', '')) if pd.notna(row.get('groupe')) else None,
            teleconseillere=str(row.get('teleconseillere', '')) if pd.notna(row.get('teleconseillere')) else None,
            coach_distri=str(row.get('coach_distri', '')) if pd.notna(row.get('coach_distri')) else None,
            developpeur=str(row.get('developpeur', '')) if pd.notna(row.get('developpeur')) else None,
            agent_operation_speciale=str(row.get('agent_operation_speciale', '')) if pd.notna(row.get('agent_operation_speciale')) else None,
            type_pdv=str(row.get('type_pdv', '')) if pd.notna(row.get('type_pdv')) else None,
            localite=str(row.get('localite', '')) if pd.notna(row.get('localite')) else None,
            quartier=str(row.get('quartier', '')) if pd.notna(row.get('quartier')) else None,
            situation_login=str(row.get('situation_login', '')) if pd.notna(row.get('situation_login')) else None,
            segment=str(row.get('segment', '')) if pd.notna(row.get('segment')) else None,
            est_actif=is_actif(row.get('situation_login')),
            est_hors_zone=1 if (is_hors_zone(
                row.get('agent_operation_speciale'), row.get('developpeur')
            ) or str(row.get('numero_pdv', '')).strip() in hors_zone_pdvs) else 0,
        )
        batch.append(t)
        inserted += 1
        if len(batch) >= 1000:
            db.bulk_save_objects(batch)
            batch = []

    if batch:
        db.bulk_save_objects(batch)

    # Commit unique : tout ou rien
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "inserted": inserted,
        "semaines": sorted(df['semaine'].unique().tolist()),
        "annees": sorted(df['annee'].unique().tolist()),
        "pdvs_uniques": df['numero_pdv'].nunique(),
    }
