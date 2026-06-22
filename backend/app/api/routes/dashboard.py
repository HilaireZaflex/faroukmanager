from fastapi import APIRouter, Depends, Query, HTTPException
from app.api.routes.auth import get_current_user, get_pdv_filters
from app.models.user import User
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
    def _perf_mt(p):
        """Montant Transaction fiable = depots + retraits."""
        mt = getattr(p, 'montant_transaction', None)
        if mt and mt > 0:
            return mt
        return (p.montant_depots or 0.0) + (p.montant_retraits or 0.0)
    def to_dict(rank, p, pdv):
        mt = _perf_mt(p)
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
            "ca": mt,                        # compatibilité frontend (renommé montant_transaction)
            "montant_transaction": mt,        # nouveau nom correct
            "montant_ca": getattr(p, 'montant_ca', None) or 0.0,
            "commission_pdg": getattr(p, 'commission_pdg', None) or 0.0,
            "commission_revendeur": getattr(p, 'commission_revendeur', None) or 0.0,
            "ratio_ca_transaction": getattr(p, 'ratio_ca_transaction', None) or 0.0,
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
    service: str = Query('OMY'),
    top_n: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Dashboard mensuel complet — M2 du CDC."""
    # ── Filtre automatique selon rôle ──────────────────────────────────────────
    f = get_pdv_filters(current_user)
    superviseur = superviseur or f.get('superviseur')
    gestionnaire = gestionnaire or f.get('gestionnaire')
    zone = zone or f.get('zone')

    # Toutes les perfs du mois
    service_filter = service.upper() if service else 'OMY'
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois,
        MonthlyPerformance.indicateur == service_filter
    ).all()
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, quartier, sous_zone)

    if not pairs:
        # Fallback : mois précédents disponibles
        latest = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).filter(
            MonthlyPerformance.indicateur == service_filter
        ).distinct().order_by(
            MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
        ).first()
        if latest:
            all_perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.annee == latest[0],
                MonthlyPerformance.mois == latest[1],
                MonthlyPerformance.indicateur == service_filter
            ).all()
            annee, mois = latest
            pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, quartier, sous_zone)

    # ── Helpers nouveaux champs ───────────────────────────────────────────────
    def _mt(p):
        """Montant Transaction = montant_depots + montant_retraits (calcul direct et fiable)."""
        mt = getattr(p, 'montant_transaction', None)
        if mt and mt > 0:
            return mt
        # Fallback : recalcul depuis dépôts+retraits si montant_transaction non disponible
        return (p.montant_depots or 0.0) + (p.montant_retraits or 0.0)
    def _mca(p):   return getattr(p, 'montant_ca', None) or 0.0
    def _cpdg(p):  return getattr(p, 'commission_pdg', None) or 0.0
    def _crev(p):  return getattr(p, 'commission_revendeur', None) or 0.0
    def _ratio(p): return getattr(p, 'ratio_ca_transaction', None) or 0.0

    # KPIs globaux
    total_montant_transaction  = sum(_mt(p)   for p, _ in pairs)
    total_montant_ca           = sum(_mca(p)  for p, _ in pairs)
    total_commission_pdg       = sum(_cpdg(p) for p, _ in pairs)
    total_commission_revendeur = sum(_crev(p) for p, _ in pairs)
    ratio_ca_transaction = round(
        (total_montant_ca / total_montant_transaction * 100) if total_montant_transaction > 0 else 0.0, 2
    )
    # Compatibilité : total_ca = montant_transaction
    total_ca = total_montant_transaction
    total_operations = sum(p.nb_operations for p, _ in pairs)
    total_depots = sum(p.nb_depots for p, _ in pairs)
    montant_depots = sum(p.montant_depots for p, _ in pairs)
    total_retraits = sum(p.nb_retraits for p, _ in pairs)
    montant_retraits = sum(p.montant_retraits for p, _ in pairs)
    # Total réseau filtré (respecte zone, type, superviseur)
    q_total = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)
    if zone: q_total = q_total.filter(PDV.zone == zone)
    if type_pdv: q_total = q_total.filter(PDV.type_pdv == type_pdv)
    if superviseur: q_total = q_total.filter(PDV.superviseur == superviseur)
    if gestionnaire: q_total = q_total.filter(PDV.gestionnaire == gestionnaire)
    total_reseau = q_total.count()
    active_pdvs = sum(1 for p, _ in pairs if p.est_actif)
    inactive_pdvs = len(pairs) - active_pdvs
    # PDVs sans données ce mois = dans le réseau filtré mais pas dans les performances
    pdvs_sans_donnees = max(0, total_reseau - len(pairs))
    taux_activite = (active_pdvs / total_reseau * 100) if total_reseau > 0 else 0.0
    avg_ca = total_ca / len(pairs) if pairs else 0.0

    # PDV à faible CA (ratio < 50% de la moyenne)
    avg_ratio = sum(_ratio(p) for p, _ in pairs) / len(pairs) if pairs else 0
    pdvs_faible_ca = sum(1 for p, _ in pairs if _ratio(p) < avg_ratio * 0.5 and p.est_actif)

    # Taux de variation moyen vs mois précédent
    variations = [p.taux_variation for p, _ in pairs if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0

    # CA cumulé (somme des mois 1..mois)
    ca_cumule_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois <= mois
    ).all()
    ca_cumule_pairs = _filter_perfs_by_pdv(ca_cumule_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, quartier, sous_zone)
    ca_cumule = sum(_mt(p) for p, _ in ca_cumule_pairs)

    # Répartition par zone selon plusieurs indicateurs
    ca_by_zone = {}
    montant_ca_by_zone = {}
    commission_pdg_by_zone = {}
    for p, pdv in pairs:
        z = pdv.zone or "Inconnue"
        ca_by_zone[z] = ca_by_zone.get(z, 0) + _mt(p)
        montant_ca_by_zone[z] = montant_ca_by_zone.get(z, 0) + _mca(p)
        commission_pdg_by_zone[z] = commission_pdg_by_zone.get(z, 0) + _cpdg(p)

    # Répartition par superviseur (3 indicateurs)
    ca_by_superviseur = {}
    montant_ca_by_superviseur = {}
    commission_pdg_by_superviseur = {}
    for p, pdv in pairs:
        s = pdv.superviseur or "Non assigné"
        ca_by_superviseur[s] = ca_by_superviseur.get(s, 0) + _mt(p)
        montant_ca_by_superviseur[s] = montant_ca_by_superviseur.get(s, 0) + _mca(p)
        commission_pdg_by_superviseur[s] = commission_pdg_by_superviseur.get(s, 0) + _cpdg(p)

    # Répartition par gestionnaire (3 indicateurs)
    montant_ca_by_gestionnaire = {}
    commission_pdg_by_gestionnaire = {}
    for p, pdv in pairs:
        g = pdv.gestionnaire or "Non assigné"
        montant_ca_by_gestionnaire[g] = montant_ca_by_gestionnaire.get(g, 0) + _mca(p)
        commission_pdg_by_gestionnaire[g] = commission_pdg_by_gestionnaire.get(g, 0) + _cpdg(p)

    # Répartition par type PDV (3 indicateurs)
    ca_by_type = {}
    montant_ca_by_type = {}
    commission_pdg_by_type = {}
    count_by_type = {}
    for p, pdv in pairs:
        t = pdv.type_pdv.value
        ca_by_type[t] = ca_by_type.get(t, 0) + _mt(p)
        montant_ca_by_type[t] = montant_ca_by_type.get(t, 0) + _mca(p)
        commission_pdg_by_type[t] = commission_pdg_by_type.get(t, 0) + _cpdg(p)
        count_by_type[t] = count_by_type.get(t, 0) + 1

    # Répartition par gestionnaire
    ca_by_gestionnaire = {}
    for p, pdv in pairs:
        g = pdv.gestionnaire or "Non assigné"
        ca_by_gestionnaire[g] = ca_by_gestionnaire.get(g, 0) + _mt(p)

    # Classements Montant Transaction (remplace CA)
    top_ca, bottom_ca = _build_classement(pairs, lambda p: _mt(p), top_n)

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
        classement_superviseur[s]["ca"] += _mt(p)
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
        classement_gestionnaire[g]["ca"] += _mt(p)
        classement_gestionnaire[g]["nb_pdvs"] += 1
        if p.est_actif:
            classement_gestionnaire[g]["actifs"] += 1
    classement_gestionnaire_list = sorted(
        [{"gestionnaire": k, **v} for k, v in classement_gestionnaire.items()],
        key=lambda x: x["ca"], reverse=True
    )

    # PDV à traiter en urgence (Transaction très faible, actifs)
    urgents = sorted(
        [(p, pdv) for p, pdv in pairs if p.est_actif and _mt(p) < avg_ca * 0.3],
        key=lambda x: _mt(x[0])
    )[:top_n]

    return {
        "annee": annee,
        "mois": mois,
        # ── Nouveaux KPIs ──────────────────────────────────────────────────
        "total_montant_transaction":  round(total_montant_transaction, 2),
        "total_montant_ca":           round(total_montant_ca, 2),
        "total_commission_pdg":       round(total_commission_pdg, 2),
        "total_commission_revendeur": round(total_commission_revendeur, 2),
        "ratio_ca_transaction":       ratio_ca_transaction,
        "pdvs_faible_ca":             pdvs_faible_ca,
        # ── KPIs compatibilité ─────────────────────────────────────────────
        "total_ca": round(total_ca, 2),
        "ca_cumule": round(ca_cumule, 2),
        "total_operations": total_operations,
        "total_depots": total_depots,
        "montant_depots": round(montant_depots, 2),
        "total_retraits": total_retraits,
        "montant_retraits": round(montant_retraits, 2),
        "active_pdvs": active_pdvs,
        "inactive_pdvs": inactive_pdvs,
        "total_pdvs": total_reseau,
        "pdvs_avec_donnees": len(pairs),
        "pdvs_sans_donnees": pdvs_sans_donnees,
        "taux_activite": round(taux_activite, 1),
        "average_ca": round(avg_ca, 2),
        "avg_variation": round(avg_variation, 2),
        # Répartitions
        "ca_by_zone": ca_by_zone,
        "montant_ca_by_zone": montant_ca_by_zone,
        "commission_pdg_by_zone": commission_pdg_by_zone,
        "ca_by_superviseur": ca_by_superviseur,
        "montant_ca_by_superviseur": montant_ca_by_superviseur,
        "commission_pdg_by_superviseur": commission_pdg_by_superviseur,
        "ca_by_gestionnaire": ca_by_gestionnaire,
        "montant_ca_by_gestionnaire": montant_ca_by_gestionnaire,
        "commission_pdg_by_gestionnaire": commission_pdg_by_gestionnaire,
        "ca_by_type": ca_by_type,
        "montant_ca_by_type": montant_ca_by_type,
        "commission_pdg_by_type": commission_pdg_by_type,
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
    service: str = Query('OMY'),
    top_n: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Dashboard hebdomadaire complet — M3 du CDC."""
    # ── Filtre automatique selon rôle ──────────────────────────────────────────
    f = get_pdv_filters(current_user)
    superviseur = superviseur or f.get('superviseur')
    gestionnaire = gestionnaire or f.get('gestionnaire')
    zone = zone or f.get('zone')

    service_filter_w = service.upper() if service else 'OMY'
    all_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee,
        WeeklyPerformance.semaine == semaine,
        WeeklyPerformance.indicateur == service_filter_w
    ).all()
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv, sous_zone=sous_zone)

    # Fallback : dernière semaine disponible
    if not pairs:
        latest = db.query(WeeklyPerformance.annee, WeeklyPerformance.semaine).filter(
            WeeklyPerformance.indicateur == service_filter_w
        ).distinct().order_by(
            WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()
        ).first()
        if latest:
            all_perfs = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.annee == latest[0],
                WeeklyPerformance.semaine == latest[1],
                WeeklyPerformance.indicateur == service_filter_w
            ).all()
            annee, semaine = latest
            pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone, superviseur, gestionnaire, type_pdv)

    # ── Helpers nouveaux champs hebdo ────────────────────────────────────────
    def _wmt(p):
        """Montant Transaction = montant_depots + montant_retraits (calcul direct et fiable)."""
        mt = getattr(p, 'montant_transaction', None)
        if mt and mt > 0:
            return mt
        return (p.montant_depots or 0.0) + (p.montant_retraits or 0.0)
    def _wmca(p):  return getattr(p, 'montant_ca', None) or 0.0
    def _wcpdg(p): return getattr(p, 'commission_pdg', None) or 0.0
    def _wcrev(p): return getattr(p, 'commission_revendeur', None) or 0.0
    def _wratio(p): return getattr(p, 'ratio_ca_transaction', None) or 0.0

    total_montant_transaction  = sum(_wmt(p)   for p, _ in pairs)
    total_montant_ca           = sum(_wmca(p)  for p, _ in pairs)
    total_commission_pdg       = sum(_wcpdg(p) for p, _ in pairs)
    total_commission_revendeur = sum(_wcrev(p) for p, _ in pairs)
    ratio_ca_transaction = round(
        (total_montant_ca / total_montant_transaction * 100) if total_montant_transaction > 0 else 0.0, 2
    )
    avg_ratio_w = sum(_wratio(p) for p, _ in pairs) / len(pairs) if pairs else 0
    pdvs_faible_ca = sum(1 for p, _ in pairs if _wratio(p) < avg_ratio_w * 0.5 and p.est_actif)
    total_ca = total_montant_transaction  # compatibilité

    total_operations = sum(p.nb_operations for p, _ in pairs)
    total_depots = sum(p.nb_depots for p, _ in pairs)
    total_retraits = sum(p.nb_retraits for p, _ in pairs)
    montant_depots = sum(p.montant_depots for p, _ in pairs)
    montant_retraits = sum(p.montant_retraits for p, _ in pairs)
    # Total réseau filtré (respecte zone, type, superviseur)
    q_total_w = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)
    if zone: q_total_w = q_total_w.filter(PDV.zone == zone)
    if type_pdv: q_total_w = q_total_w.filter(PDV.type_pdv == type_pdv)
    if superviseur: q_total_w = q_total_w.filter(PDV.superviseur == superviseur)
    total_reseau_w = q_total_w.count()
    active_pdvs = sum(1 for p, _ in pairs if p.est_actif)
    inactive_pdvs = len(pairs) - active_pdvs
    taux_activite = (active_pdvs / total_reseau_w * 100) if total_reseau_w > 0 else 0.0
    variations = [p.taux_variation for p, _ in pairs if p.taux_variation]
    avg_variation = sum(variations) / len(variations) if variations else 0.0

    ca_by_zone = {}
    montant_ca_by_zone = {}
    commission_pdg_by_zone = {}
    ca_by_superviseur = {}
    montant_ca_by_superviseur = {}
    commission_pdg_by_superviseur = {}
    ca_by_type = {}
    for p, pdv in pairs:
        z = pdv.zone or "Inconnue"
        ca_by_zone[z] = ca_by_zone.get(z, 0) + _wmt(p)
        montant_ca_by_zone[z] = montant_ca_by_zone.get(z, 0) + _wmca(p)
        commission_pdg_by_zone[z] = commission_pdg_by_zone.get(z, 0) + _wcpdg(p)
        s = pdv.superviseur or "Non assigné"
        ca_by_superviseur[s] = ca_by_superviseur.get(s, 0) + _wmt(p)
        montant_ca_by_superviseur[s] = montant_ca_by_superviseur.get(s, 0) + _wmca(p)
        commission_pdg_by_superviseur[s] = commission_pdg_by_superviseur.get(s, 0) + _wcpdg(p)
        t = pdv.type_pdv.value
        ca_by_type[t] = ca_by_type.get(t, 0) + _wmt(p)

    # Listes actifs/inactifs
    actifs_list = [
        {"pdv_id": pdv.id, "nom": pdv.nom, "zone": pdv.zone, "superviseur": pdv.superviseur,
         "gestionnaire": pdv.gestionnaire, "type_pdv": pdv.type_pdv.value,
         "ca": p.ca, "montant_transaction": _wmt(p), "montant_ca": _wmca(p),
         "commission_pdg": _wcpdg(p), "nb_operations": p.nb_operations,
         "taux_variation": p.taux_variation or 0, "quartier": pdv.quartier,
         "nom_gerant": pdv.nom_gerant, "medaille": getattr(p, 'medaille', None)}
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
        # ── Nouveaux KPIs ──────────────────────────────────────────────────
        "total_montant_transaction":  round(total_montant_transaction, 2),
        "total_montant_ca":           round(total_montant_ca, 2),
        "total_commission_pdg":       round(total_commission_pdg, 2),
        "total_commission_revendeur": round(total_commission_revendeur, 2),
        "ratio_ca_transaction":       ratio_ca_transaction,
        "pdvs_faible_ca":             pdvs_faible_ca,
        # ── KPIs compatibilité ─────────────────────────────────────────────
        "total_ca": round(total_ca, 2),
        "total_operations": total_operations,
        "total_depots": total_depots,
        "montant_depots": round(montant_depots, 2),
        "total_retraits": total_retraits,
        "montant_retraits": round(montant_retraits, 2),
        "active_pdvs": active_pdvs,
        "inactive_pdvs": inactive_pdvs,
        "total_pdvs": total_reseau_w,
        "pdvs_avec_donnees": len(pairs),
        "pdvs_sans_donnees": total_reseau_w - len(pairs),
        "taux_activite": round(taux_activite, 1),
        "avg_variation": round(avg_variation, 2),
        # Répartitions
        "ca_by_zone": ca_by_zone,
        "montant_ca_by_zone": montant_ca_by_zone,
        "commission_pdg_by_zone": commission_pdg_by_zone,
        "ca_by_superviseur": ca_by_superviseur,
        "montant_ca_by_superviseur": montant_ca_by_superviseur,
        "commission_pdg_by_superviseur": commission_pdg_by_superviseur,
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
        "all_pdvs": [{
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "sous_zone": pdv.sous_zone,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "type_pdv": pdv.type_pdv.value,
            "quartier": pdv.quartier,
            "nom_gerant": pdv.nom_gerant,
            "ca": p.ca,
            "montant_transaction": _wmt(p),
            "montant_ca": _wmca(p),
            "commission_pdg": _wcpdg(p),
            "commission_revendeur": _wcrev(p),
            "nb_operations": p.nb_operations,
            "taux_variation": p.taux_variation or 0,
            "est_actif": p.est_actif,
        } for p, pdv in sorted(pairs, key=lambda x: x[0].ca, reverse=True)],
    }


@router.get("/dashboard/pareto")
def pareto_analysis(
    db: Session = Depends(get_db),
    annee: int = Query(2025),
    mois: int = Query(12, ge=1, le=12),
    zone: Optional[str] = None,
    cible: float = Query(80.0, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Analyse Pareto 80/20 — M4 du CDC."""
    f_user = get_pdv_filters(current_user)
    zone = zone or f_user.get('zone')
    superviseur = f_user.get('superviseur')
    gestionnaire = f_user.get('gestionnaire')
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()
    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur, gestionnaire=gestionnaire)

    if not pairs:
        return {"total_ca": 0, "pareto_pdvs": [], "top_20_percent": [], "gini_coefficient": 0}

    def _pmt(p): return getattr(p, 'montant_transaction', None) or p.ca or 0
    def _pmca(p): return getattr(p, 'montant_ca', None) or 0
    def _pcpdg(p): return getattr(p, 'commission_pdg', None) or 0

    total_ca = sum(p.ca for p, _ in pairs)
    total_mt = sum(_pmt(p) for p, _ in pairs)
    total_mca = sum(_pmca(p) for p, _ in pairs)
    total_cpdg = sum(_pcpdg(p) for p, _ in pairs)
    sorted_pairs = sorted(pairs, key=lambda x: x[0].ca, reverse=True)

    pareto_list = []
    cumul = 0
    pareto_count = 0
    for p, pdv in sorted_pairs:
        mt = _pmt(p)
        mca = _pmca(p)
        cpdg = _pcpdg(p)
        cumul += p.ca
        pct = (cumul / total_ca * 100) if total_ca else 0
        pareto_list.append({
            "rang": len(pareto_list) + 1,
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "ca": p.ca,
            "montant_transaction": mt,
            "montant_ca": mca,
            "commission_pdg": cpdg,
            "commission_revendeur": getattr(p, 'commission_revendeur', None) or 0,
            "ratio_ca_transaction": getattr(p, 'ratio_ca_transaction', None) or 0,
            "nb_operations": p.nb_operations,
            "pct_ca": (p.ca / total_ca * 100) if total_ca else 0,
            "pct_montant_transaction": (mt / total_mt * 100) if total_mt else 0,
            "pct_montant_ca": (mca / total_mca * 100) if total_mca else 0,
            "pct_commission_pdg": (cpdg / total_cpdg * 100) if total_cpdg else 0,
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
        "total_montant_transaction": total_mt,
        "total_montant_ca": total_mca,
        "total_commission_pdg": total_cpdg,
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
    current_user: User = Depends(get_current_user),
):
    """Classements Top/Bottom N — M2 du CDC."""
    f_user = get_pdv_filters(current_user)
    superviseur = superviseur or f_user.get('superviseur')
    zone = zone or f_user.get('zone')
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
    
    def _pmt(p):
        mt = getattr(p, 'montant_transaction', None)
        if mt and mt > 0: return mt
        return (p.montant_depots or 0.0) + (p.montant_retraits or 0.0)

    for pdv in pdvs:
        perfs = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.pdv_id == pdv.id
        ).order_by(MonthlyPerformance.montant_transaction.desc()).all()

        if not perfs:
            continue

        ca_max = _pmt(perfs[0])
        ca_min = _pmt(perfs[-1]) if perfs else 0
        mois_ca_max = f"{perfs[0].annee}-{perfs[0].mois:02d}" if perfs else ""

        # Count how many times in top 10 per month
        top_10_count = 0
        for annee, mois in latest_12_months:
            month_perfs = db.query(MonthlyPerformance).filter(
                MonthlyPerformance.annee == annee,
                MonthlyPerformance.mois == mois
            ).order_by(MonthlyPerformance.montant_transaction.desc()).limit(10).all()

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
        ca_mois = sum((getattr(p,'montant_transaction',None) or (p.montant_depots+p.montant_retraits) or p.ca or 0) for p in perfs)
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
    current_user: User = Depends(get_current_user),
):
    """Retourne les PDVs inactifs pour un mois donné."""
    f_user = get_pdv_filters(current_user)
    superviseur = superviseur or f_user.get('superviseur')
    zone = zone or f_user.get('zone')
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
            "ca": p.ca or 0,
            "montant_transaction": getattr(p, 'montant_transaction', None) or p.ca or 0,
            "montant_ca": getattr(p, 'montant_ca', None) or 0,
            "commission_pdg": getattr(p, 'commission_pdg', None) or 0,
            "nb_operations": p.nb_operations or 0,
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
    current_user: User = Depends(get_current_user),
):
    """Retourne les PDVs en baisse par rapport au mois précédent."""
    f_user = get_pdv_filters(current_user)
    superviseur = superviseur or f_user.get('superviseur')
    zone = zone or f_user.get('zone')
    prev_mois = mois - 1 if mois > 1 else 12
    prev_annee = annee if mois > 1 else annee - 1

    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois
    ).all()

    prev_perfs = {p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == prev_annee,
        MonthlyPerformance.mois == prev_mois
    ).all()}

    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur)

    def _mt(p): return getattr(p, 'montant_transaction', None) or p.ca or 0
    def _mca(p): return getattr(p, 'montant_ca', None) or 0
    def _cpdg(p): return getattr(p, 'commission_pdg', None) or 0

    result_pdvs = []
    for p, pdv in pairs:
        mt_actuel = _mt(p)
        prev_p = prev_perfs.get(pdv.id)
        mt_precedent = _mt(prev_p) if prev_p else 0

        # Calculer le taux de variation mensuel (actuel vs mois précédent)
        if mt_precedent > 0:
            taux = ((mt_actuel - mt_precedent) / mt_precedent) * 100
        elif mt_actuel > 0:
            taux = 100.0  # nouveau PDV actif
        else:
            taux = 0.0

        # Filtrer selon le seuil (seuil est négatif, ex: -10 = baisse de 10%)
        if taux <= seuil:
            baisse_pct = abs(taux)
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
                "ca": p.ca or 0,
                "ca_precedent": prev_p.ca if prev_p else 0,
                "montant_transaction": mt_actuel,
                "montant_transaction_precedent": mt_precedent,
                "montant_ca": _mca(p),
                "montant_ca_precedent": _mca(prev_p) if prev_p else 0,
                "commission_pdg": _cpdg(p),
                "commission_pdg_precedent": _cpdg(prev_p) if prev_p else 0,
                "taux_baisse": round(taux, 2),
                "nb_operations": p.nb_operations or 0,
                "alerte": alerte,
            })

    # Trier par taux de baisse (les plus fortes baisses en premier)
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
    current_user: User = Depends(get_current_user),
):
    """Comparaison CA mois actuel vs mois précédent (jointure réelle)."""
    f_user = get_pdv_filters(current_user)
    zone = zone or f_user.get('zone')
    _sup = f_user.get('superviseur')
    _gest = f_user.get('gestionnaire')
    # Mois précédent
    if mois == 1:
        prev_mois, prev_annee = 12, annee - 1
    else:
        prev_mois, prev_annee = mois - 1, annee

    pdv_map = _get_pdv_map(db)
    # Filtrer pdv_map selon le rôle
    if _sup:
        pdv_map = {k: v for k, v in pdv_map.items() if (v.superviseur or '') == _sup}
    elif _gest:
        pdv_map = {k: v for k, v in pdv_map.items() if (v.gestionnaire or '') == _gest}
    elif zone:
        pdv_map = {k: v for k, v in pdv_map.items() if (v.zone or '') == zone}

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

    def _mt(p): return getattr(p, 'montant_transaction', None) or p.ca or 0
    def _mca(p): return getattr(p, 'montant_ca', None) or 0
    def _cpdg(p): return getattr(p, 'commission_pdg', None) or 0

    # Calcul totaux
    total_ca_actuel = sum(perfs_actuel[pid].ca for pid in all_pdv_ids if pid in perfs_actuel)
    total_ca_precedent = sum(perfs_precedent[pid].ca for pid in all_pdv_ids if pid in perfs_precedent)
    total_mt_actuel = sum(_mt(perfs_actuel[pid]) for pid in all_pdv_ids if pid in perfs_actuel)
    total_mt_precedent = sum(_mt(perfs_precedent[pid]) for pid in all_pdv_ids if pid in perfs_precedent)
    total_mca_actuel = sum(_mca(perfs_actuel[pid]) for pid in all_pdv_ids if pid in perfs_actuel)
    total_mca_precedent = sum(_mca(perfs_precedent[pid]) for pid in all_pdv_ids if pid in perfs_precedent)
    total_cpdg_actuel = sum(_cpdg(perfs_actuel[pid]) for pid in all_pdv_ids if pid in perfs_actuel)
    total_cpdg_precedent = sum(_cpdg(perfs_precedent[pid]) for pid in all_pdv_ids if pid in perfs_precedent)
    variation_totale = total_ca_actuel - total_ca_precedent
    taux_variation_total = round((variation_totale / total_ca_precedent * 100) if total_ca_precedent > 0 else 0, 1)

    def _build_group(group_dict, label_key):
        result = []
        for k, d in sorted(group_dict.items(), key=lambda x: x[1]["mt_actuel"], reverse=True):
            var_ca = d["ca_actuel"] - d["ca_precedent"]
            var_mt = d["mt_actuel"] - d["mt_precedent"]
            var_mca = d["mca_actuel"] - d["mca_precedent"]
            var_cpdg = d["cpdg_actuel"] - d["cpdg_precedent"]
            taux = round((var_ca / d["ca_precedent"] * 100) if d["ca_precedent"] > 0 else 0)
            entry = {
                label_key: k,
                "ca_actuel": d["ca_actuel"], "ca_precedent": d["ca_precedent"],
                "montant_transaction_actuel": d["mt_actuel"], "montant_transaction_precedent": d["mt_precedent"],
                "montant_ca_actuel": d["mca_actuel"], "montant_ca_precedent": d["mca_precedent"],
                "commission_pdg_actuel": d["cpdg_actuel"], "commission_pdg_precedent": d["cpdg_precedent"],
                "variation": var_ca, "variation_mt": var_mt, "variation_mca": var_mca, "variation_cpdg": var_cpdg,
                "taux": taux,
            }
            result.append(entry)
        return result

    def _init_group(): return {"ca_actuel":0,"ca_precedent":0,"mt_actuel":0,"mt_precedent":0,"mca_actuel":0,"mca_precedent":0,"cpdg_actuel":0,"cpdg_precedent":0}

    # Par superviseur
    par_superviseur = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        s = pdv.superviseur or "Non assigné"
        if s not in par_superviseur: par_superviseur[s] = _init_group()
        if pid in perfs_actuel:
            par_superviseur[s]["ca_actuel"] += perfs_actuel[pid].ca
            par_superviseur[s]["mt_actuel"] += _mt(perfs_actuel[pid])
            par_superviseur[s]["mca_actuel"] += _mca(perfs_actuel[pid])
            par_superviseur[s]["cpdg_actuel"] += _cpdg(perfs_actuel[pid])
        if pid in perfs_precedent:
            par_superviseur[s]["ca_precedent"] += perfs_precedent[pid].ca
            par_superviseur[s]["mt_precedent"] += _mt(perfs_precedent[pid])
            par_superviseur[s]["mca_precedent"] += _mca(perfs_precedent[pid])
            par_superviseur[s]["cpdg_precedent"] += _cpdg(perfs_precedent[pid])
    par_superviseur_list = _build_group(par_superviseur, "superviseur")

    # Par gestionnaire
    par_gestionnaire = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        g = pdv.gestionnaire or "Non assigné"
        if g not in par_gestionnaire: par_gestionnaire[g] = _init_group()
        if pid in perfs_actuel:
            par_gestionnaire[g]["ca_actuel"] += perfs_actuel[pid].ca
            par_gestionnaire[g]["mt_actuel"] += _mt(perfs_actuel[pid])
            par_gestionnaire[g]["mca_actuel"] += _mca(perfs_actuel[pid])
            par_gestionnaire[g]["cpdg_actuel"] += _cpdg(perfs_actuel[pid])
        if pid in perfs_precedent:
            par_gestionnaire[g]["ca_precedent"] += perfs_precedent[pid].ca
            par_gestionnaire[g]["mt_precedent"] += _mt(perfs_precedent[pid])
            par_gestionnaire[g]["mca_precedent"] += _mca(perfs_precedent[pid])
            par_gestionnaire[g]["cpdg_precedent"] += _cpdg(perfs_precedent[pid])
    par_gestionnaire_list = _build_group(par_gestionnaire, "gestionnaire")

    # Par PDV
    par_pdv_list = []
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        p_act = perfs_actuel.get(pid)
        p_pre = perfs_precedent.get(pid)
        ca_actuel = p_act.ca if p_act else 0
        ca_precedent = p_pre.ca if p_pre else 0
        mt_actuel = _mt(p_act) if p_act else 0
        mt_precedent = _mt(p_pre) if p_pre else 0
        mca_actuel = _mca(p_act) if p_act else 0
        mca_precedent = _mca(p_pre) if p_pre else 0
        cpdg_actuel = _cpdg(p_act) if p_act else 0
        cpdg_precedent = _cpdg(p_pre) if p_pre else 0
        variation = ca_actuel - ca_precedent
        taux = round((variation / ca_precedent * 100) if ca_precedent > 0 else 0)
        par_pdv_list.append({
            "pdv_id": pdv.id, "numero_pdv": pdv.numero_pdv, "nom": pdv.nom,
            "zone": pdv.zone, "superviseur": pdv.superviseur,
            "ca_actuel": ca_actuel, "ca_precedent": ca_precedent,
            "montant_transaction_actuel": mt_actuel, "montant_transaction_precedent": mt_precedent,
            "montant_ca_actuel": mca_actuel, "montant_ca_precedent": mca_precedent,
            "commission_pdg_actuel": cpdg_actuel, "commission_pdg_precedent": cpdg_precedent,
            "variation": variation,
            "variation_mt": mt_actuel - mt_precedent,
            "variation_mca": mca_actuel - mca_precedent,
            "variation_cpdg": cpdg_actuel - cpdg_precedent,
            "taux": taux, "est_hausse": variation >= 0,
        })

    par_pdv_list = sorted(par_pdv_list, key=lambda x: abs(x["variation"]), reverse=True)

    return {
        "annee": annee, "mois": mois,
        "prev_annee": prev_annee, "prev_mois": prev_mois,
        "total_ca_actuel": total_ca_actuel, "total_ca_precedent": total_ca_precedent,
        "total_montant_transaction_actuel": total_mt_actuel, "total_montant_transaction_precedent": total_mt_precedent,
        "total_montant_ca_actuel": total_mca_actuel, "total_montant_ca_precedent": total_mca_precedent,
        "total_commission_pdg_actuel": total_cpdg_actuel, "total_commission_pdg_precedent": total_cpdg_precedent,
        "variation_totale": variation_totale, "taux_variation_total": taux_variation_total,
        "par_superviseur": par_superviseur_list,
        "par_gestionnaire": par_gestionnaire_list,
        "par_pdv": par_pdv_list,
    }



@router.get("/dashboard/monthly-progression")
def monthly_progression(
    db: Session = Depends(get_db),
    annee: Optional[int] = None,
    top_n: int = Query(1200, ge=1, le=1200),
    current_user: User = Depends(get_current_user),
):
    """Statistiques de progression historique des PDVs — version optimisée (1 seule requête SQL)."""
    f_user = get_pdv_filters(current_user)
    _sup = f_user.get('superviseur')
    _gest = f_user.get('gestionnaire')
    _zone = f_user.get('zone')
    from datetime import datetime
    from collections import defaultdict

    if annee is None:
        annee = datetime.now().year

    # Charger TOUTES les perfs de l'année en une seule requête
    all_perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee
    ).all()

    # Charger tous les PDVs en une seule requête
    q_pdvs = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)
    if _sup:
        q_pdvs = q_pdvs.filter(PDV.superviseur == _sup)
    elif _gest:
        q_pdvs = q_pdvs.filter(PDV.gestionnaire == _gest)
    elif _zone:
        q_pdvs = q_pdvs.filter(PDV.zone == _zone)
    pdvs = {p.id: p for p in q_pdvs.all()}

    # Grouper par (annee, mois) et calculer les rangs
    mois_perfs = defaultdict(list)
    for p in all_perfs:
        mois_perfs[(p.annee, p.mois)].append(p)

    rang_map = {}
    for (y, m), perfs_mois in mois_perfs.items():
        sorted_perfs = sorted(perfs_mois, key=lambda x: x.ca, reverse=True)
        for i, p in enumerate(sorted_perfs):
            rang_map[(p.pdv_id, y, m)] = i + 1

    # Grouper toutes les perfs par pdv_id
    perfs_par_pdv = defaultdict(list)
    for p in all_perfs:
        perfs_par_pdv[p.pdv_id].append(p)

    result_pdvs = []
    for pdv_id, pdv in pdvs.items():
        perfs = sorted(perfs_par_pdv.get(pdv_id, []), key=lambda x: (x.annee, x.mois), reverse=True)
        if not perfs:
            continue

        def _pmt(p): return getattr(p, 'montant_transaction', None) or p.ca or 0
        def _pmca(p): return getattr(p, 'montant_ca', None) or 0
        def _pcpdg(p): return getattr(p, 'commission_pdg', None) or 0

        nb_fois_top10 = 0
        nb_fois_top50 = 0
        ca_max = 0; mt_max = 0; mca_max = 0; cpdg_max = 0
        mois_meilleur_ca = None
        ca_min = float('inf'); mt_min = float('inf'); mca_min = float('inf'); cpdg_min = float('inf')
        mois_pire_ca = None
        historique = []

        for p in perfs:
            rang = rang_map.get((pdv_id, p.annee, p.mois))
            if rang and rang <= 10:
                nb_fois_top10 += 1
            if rang and rang <= 50:
                nb_fois_top50 += 1
            mt = _pmt(p); mca = _pmca(p); cpdg = _pcpdg(p)
            if p.ca > ca_max:
                ca_max = p.ca; mt_max = mt; mca_max = mca; cpdg_max = cpdg
                mois_meilleur_ca = f"{p.annee}-{p.mois:02d}"
            if p.est_actif and p.ca > 0 and p.ca < ca_min:
                ca_min = p.ca; mt_min = mt; mca_min = mca; cpdg_min = cpdg
                mois_pire_ca = f"{p.annee}-{p.mois:02d}"
            historique.append({
                "annee": p.annee,
                "mois": p.mois,
                "ca": p.ca,
                "montant_transaction": mt,
                "montant_ca": mca,
                "commission_pdg": cpdg,
                "rang": rang,
            })

        if ca_min == float('inf'): ca_min = 0; mt_min = 0; mca_min = 0; cpdg_min = 0

        # ── Nouvelles métriques Option A ──────────────────────────────────
        hist_sorted = sorted(historique, key=lambda x: (x['annee'], x['mois']))
        nb_mois = len(hist_sorted)

        # Variation globale : dernier mois vs premier mois
        ca_premier = hist_sorted[0]['ca'] if hist_sorted else 0
        ca_dernier = hist_sorted[-1]['ca'] if hist_sorted else 0
        variation_globale = round((ca_dernier - ca_premier) / ca_premier * 100, 2) if ca_premier > 0 else 0

        # Rang moyen sur l'année
        rangs = [h['rang'] for h in historique if h['rang'] is not None]
        rang_moyen = round(sum(rangs) / len(rangs), 1) if rangs else None

        # Tendance : hausse/baisse/stable
        if variation_globale > 5:
            tendance = "HAUSSE"
        elif variation_globale < -5:
            tendance = "BAISSE"
        else:
            tendance = "STABLE"

        # Nb fois consécutifs Top 10 (streak actuel)
        nb_mois_consecutifs_top10 = 0
        for h in reversed(hist_sorted):
            if h['rang'] is not None and h['rang'] <= 10:
                nb_mois_consecutifs_top10 += 1
            else:
                break

        # PDV régulier : actif (ca > 0) dans TOUS les mois disponibles
        mois_actifs = set((h['annee'], h['mois']) for h in historique if h['ca'] > 0)
        nb_mois_total_reseau = 5  # Jan-Mai 2026 (5 mois)
        est_regulier = len(mois_actifs) >= nb_mois_total_reseau

        # Variation mensuelle max (plus grande hausse entre 2 mois consécutifs)
        var_consec = []
        for i in range(1, len(hist_sorted)):
            ca_prec = hist_sorted[i-1]['ca']
            ca_curr = hist_sorted[i]['ca']
            if ca_prec > 0:
                var_consec.append(round((ca_curr - ca_prec) / ca_prec * 100, 2))
        meilleure_variation_mensuelle = max(var_consec) if var_consec else 0
        pire_variation_mensuelle = min(var_consec) if var_consec else 0

        result_pdvs.append({
            "pdv_id": pdv_id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "nb_fois_top10": nb_fois_top10,
            "nb_fois_top50": nb_fois_top50,
            "mois_meilleur_ca": mois_meilleur_ca,
            "mois_pire_ca": mois_pire_ca,
            "ca_max": ca_max, "montant_transaction_max": mt_max, "montant_ca_max": mca_max, "commission_pdg_max": cpdg_max,
            "ca_min": ca_min, "montant_transaction_min": mt_min, "montant_ca_min": mca_min, "commission_pdg_min": cpdg_min,
            "historique_mensuel": historique,
            # Nouvelles métriques Option A
            "variation_globale": variation_globale,
            "rang_moyen": rang_moyen,
            "tendance": tendance,
            "nb_mois_consecutifs_top10": nb_mois_consecutifs_top10,
            "est_regulier": est_regulier,
            "meilleure_variation_mensuelle": meilleure_variation_mensuelle,
            "pire_variation_mensuelle": pire_variation_mensuelle,
            "ca_premier_mois": ca_premier,
            "ca_dernier_mois": ca_dernier,
        })

    result_pdvs = sorted(result_pdvs, key=lambda x: x["nb_fois_top10"], reverse=True)[:top_n]

    # Métriques réseau: meilleur et pire mois
    ca_par_mois = {}
    for p in result_pdvs:
        for h in p.get('historique_mensuel', []):
            key = f"{h['annee']}-{h['mois']:02d}"
            ca_par_mois[key] = ca_par_mois.get(key, 0) + (h['ca'] or 0)

    MOIS_NOMS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
    meilleur_mois_reseau = None
    pire_mois_reseau = None
    if ca_par_mois:
        meilleur_key = max(ca_par_mois, key=lambda k: ca_par_mois[k])
        pire_key = min(ca_par_mois, key=lambda k: ca_par_mois[k])
        m_idx = int(meilleur_key.split('-')[1]) - 1
        p_idx = int(pire_key.split('-')[1]) - 1
        meilleur_mois_reseau = {
            'mois_key': meilleur_key,
            'nom': MOIS_NOMS_FR[m_idx] if 0 <= m_idx < 12 else meilleur_key,
            'ca_total': round(ca_par_mois[meilleur_key], 2)
        }
        pire_mois_reseau = {
            'mois_key': pire_key,
            'nom': MOIS_NOMS_FR[p_idx] if 0 <= p_idx < 12 else pire_key,
            'ca_total': round(ca_par_mois[pire_key], 2)
        }

    return {
        "annee": annee,
        "total_pdvs": len(result_pdvs),
        "pdvs": result_pdvs,
        "meilleur_mois_reseau": meilleur_mois_reseau,
        "pire_mois_reseau": pire_mois_reseau,
    }


@router.get("/dashboard/weekly-inactive")
def weekly_inactive(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    semaine: int = Query(..., ge=1, le=52),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    f_user = get_pdv_filters(current_user); superviseur = superviseur or f_user.get("superviseur"); zone = zone or f_user.get("zone")
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
            "ca": p.ca or 0,
            "montant_transaction": getattr(p, 'montant_transaction', None) or p.ca or 0,
            "montant_ca": getattr(p, 'montant_ca', None) or 0,
            "commission_pdg": getattr(p, 'commission_pdg', None) or 0,
            "nb_operations": p.nb_operations or 0,
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
    current_user: User = Depends(get_current_user),
):
    f_user = get_pdv_filters(current_user); superviseur = superviseur or f_user.get("superviseur"); zone = zone or f_user.get("zone")
    """Retourne les PDVs en baisse par rapport à la semaine précédente."""
    prev_semaine = semaine - 1 if semaine > 1 else 52
    prev_annee = annee if semaine > 1 else annee - 1

    all_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee,
        WeeklyPerformance.semaine == semaine
    ).all()

    prev_perfs = {p.pdv_id: p for p in db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == prev_annee,
        WeeklyPerformance.semaine == prev_semaine
    ).all()}

    def _wmt(p): return getattr(p, 'montant_transaction', None) or p.ca or 0
    def _wmca(p): return getattr(p, 'montant_ca', None) or 0
    def _wcpdg(p): return getattr(p, 'commission_pdg', None) or 0

    pdv_map = _get_pdv_map(db)
    pairs = _filter_perfs_by_pdv(all_perfs, pdv_map, zone=zone, superviseur=superviseur)
    
    result_pdvs = []
    for p, pdv in pairs:
        mt_actuel = _wmt(p)
        prev_p = prev_perfs.get(pdv.id)
        mt_precedent = _wmt(prev_p) if prev_p else 0

        # Calculer le taux de variation (semaine actuelle vs semaine précédente)
        if mt_precedent > 0:
            taux = ((mt_actuel - mt_precedent) / mt_precedent) * 100
        elif mt_actuel > 0:
            taux = 100.0
        else:
            taux = 0.0

        if taux <= seuil:
            baisse_pct = abs(taux)
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
                "ca": p.ca or 0,
                "ca_precedent": prev_p.ca if prev_p else 0,
                "montant_transaction": mt_actuel,
                "montant_transaction_precedent": mt_precedent,
                "montant_ca": _wmca(p),
                "montant_ca_precedent": _wmca(prev_p) if prev_p else 0,
                "commission_pdg": _wcpdg(p),
                "commission_pdg_precedent": _wcpdg(prev_p) if prev_p else 0,
                "taux_baisse": round(taux, 2),
                "nb_operations": p.nb_operations,
                "alerte": alerte,
            })

    # Trier par taux de baisse (les plus fortes baisses en premier)
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
    current_user: User = Depends(get_current_user),
):
    """Comparaison CA semaine actuelle vs semaine précédente (jointure réelle)."""
    f_user = get_pdv_filters(current_user)
    _sup = f_user.get('superviseur')
    _gest = f_user.get('gestionnaire')
    zone = zone or f_user.get('zone')

    if semaine == 1:
        prev_semaine, prev_annee = 52, annee - 1
    else:
        prev_semaine, prev_annee = semaine - 1, annee

    pdv_map = _get_pdv_map(db)
    # Filtrer pdv_map selon le rôle
    if _sup:
        pdv_map = {k: v for k, v in pdv_map.items() if (v.superviseur or '') == _sup}
    elif _gest:
        pdv_map = {k: v for k, v in pdv_map.items() if (v.gestionnaire or '') == _gest}
    elif zone:
        pdv_map = {k: v for k, v in pdv_map.items() if (v.zone or '') == zone}

    perfs_actuel = {p.pdv_id: p for p in db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee, WeeklyPerformance.semaine == semaine
    ).all()}
    perfs_precedent = {p.pdv_id: p for p in db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == prev_annee, WeeklyPerformance.semaine == prev_semaine
    ).all()}

    all_pdv_ids = set(perfs_actuel.keys()) | set(perfs_precedent.keys())
    # Restreindre aux PDVs du pdv_map filtré
    all_pdv_ids = {pid for pid in all_pdv_ids if pid in pdv_map}

    def _wmt(p): return getattr(p, 'montant_transaction', None) or p.ca or 0
    def _wmca(p): return getattr(p, 'montant_ca', None) or 0
    def _wcpdg(p): return getattr(p, 'commission_pdg', None) or 0
    def _wi(): return {"ca_actuel":0,"ca_precedent":0,"mt_actuel":0,"mt_precedent":0,"mca_actuel":0,"mca_precedent":0,"cpdg_actuel":0,"cpdg_precedent":0}

    total_ca_actuel = sum(perfs_actuel[pid].ca for pid in all_pdv_ids if pid in perfs_actuel)
    total_ca_precedent = sum(perfs_precedent[pid].ca for pid in all_pdv_ids if pid in perfs_precedent)
    total_mt_actuel = sum(_wmt(perfs_actuel[pid]) for pid in all_pdv_ids if pid in perfs_actuel)
    total_mt_precedent = sum(_wmt(perfs_precedent[pid]) for pid in all_pdv_ids if pid in perfs_precedent)
    total_mca_actuel = sum(_wmca(perfs_actuel[pid]) for pid in all_pdv_ids if pid in perfs_actuel)
    total_mca_precedent = sum(_wmca(perfs_precedent[pid]) for pid in all_pdv_ids if pid in perfs_precedent)
    total_cpdg_actuel = sum(_wcpdg(perfs_actuel[pid]) for pid in all_pdv_ids if pid in perfs_actuel)
    total_cpdg_precedent = sum(_wcpdg(perfs_precedent[pid]) for pid in all_pdv_ids if pid in perfs_precedent)
    variation_totale = total_ca_actuel - total_ca_precedent
    taux_variation_total = round((variation_totale / total_ca_precedent * 100) if total_ca_precedent > 0 else 0, 1)

    def _build_wgroup(group_dict, label_key):
        result = []
        for k, d in sorted(group_dict.items(), key=lambda x: x[1]["mt_actuel"], reverse=True):
            taux = round(((d["ca_actuel"]-d["ca_precedent"]) / d["ca_precedent"] * 100) if d["ca_precedent"] > 0 else 0)
            result.append({label_key: k,
                "ca_actuel": d["ca_actuel"], "ca_precedent": d["ca_precedent"],
                "montant_transaction_actuel": d["mt_actuel"], "montant_transaction_precedent": d["mt_precedent"],
                "montant_ca_actuel": d["mca_actuel"], "montant_ca_precedent": d["mca_precedent"],
                "commission_pdg_actuel": d["cpdg_actuel"], "commission_pdg_precedent": d["cpdg_precedent"],
                "variation": d["ca_actuel"]-d["ca_precedent"], "taux": taux})
        return result

    par_superviseur = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        s = pdv.superviseur or "Non assigné"
        if s not in par_superviseur: par_superviseur[s] = _wi()
        if pid in perfs_actuel:
            par_superviseur[s]["ca_actuel"] += perfs_actuel[pid].ca
            par_superviseur[s]["mt_actuel"] += _wmt(perfs_actuel[pid])
            par_superviseur[s]["mca_actuel"] += _wmca(perfs_actuel[pid])
            par_superviseur[s]["cpdg_actuel"] += _wcpdg(perfs_actuel[pid])
        if pid in perfs_precedent:
            par_superviseur[s]["ca_precedent"] += perfs_precedent[pid].ca
            par_superviseur[s]["mt_precedent"] += _wmt(perfs_precedent[pid])
            par_superviseur[s]["mca_precedent"] += _wmca(perfs_precedent[pid])
            par_superviseur[s]["cpdg_precedent"] += _wcpdg(perfs_precedent[pid])
    par_superviseur_list = _build_wgroup(par_superviseur, "superviseur")

    par_gestionnaire = {}
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        g = pdv.gestionnaire or "Non assigné"
        if g not in par_gestionnaire: par_gestionnaire[g] = _wi()
        if pid in perfs_actuel:
            par_gestionnaire[g]["ca_actuel"] += perfs_actuel[pid].ca
            par_gestionnaire[g]["mt_actuel"] += _wmt(perfs_actuel[pid])
            par_gestionnaire[g]["mca_actuel"] += _wmca(perfs_actuel[pid])
            par_gestionnaire[g]["cpdg_actuel"] += _wcpdg(perfs_actuel[pid])
        if pid in perfs_precedent:
            par_gestionnaire[g]["ca_precedent"] += perfs_precedent[pid].ca
            par_gestionnaire[g]["mt_precedent"] += _wmt(perfs_precedent[pid])
            par_gestionnaire[g]["mca_precedent"] += _wmca(perfs_precedent[pid])
            par_gestionnaire[g]["cpdg_precedent"] += _wcpdg(perfs_precedent[pid])
    par_gestionnaire_list = _build_wgroup(par_gestionnaire, "gestionnaire")

    par_pdv_list = []
    for pid in all_pdv_ids:
        pdv = pdv_map.get(pid)
        if not pdv: continue
        p_act = perfs_actuel.get(pid); p_pre = perfs_precedent.get(pid)
        ca_actuel = p_act.ca if p_act else 0
        ca_precedent = p_pre.ca if p_pre else 0
        mt_actuel = _wmt(p_act) if p_act else 0; mt_precedent = _wmt(p_pre) if p_pre else 0
        mca_actuel = _wmca(p_act) if p_act else 0; mca_precedent = _wmca(p_pre) if p_pre else 0
        cpdg_actuel = _wcpdg(p_act) if p_act else 0; cpdg_precedent = _wcpdg(p_pre) if p_pre else 0
        variation = ca_actuel - ca_precedent
        taux = round((variation / ca_precedent * 100) if ca_precedent > 0 else 0)
        par_pdv_list.append({"pdv_id": pdv.id, "numero_pdv": pdv.numero_pdv, "nom": pdv.nom,
            "zone": pdv.zone, "superviseur": pdv.superviseur,
            "ca_actuel": ca_actuel, "ca_precedent": ca_precedent,
            "montant_transaction_actuel": mt_actuel, "montant_transaction_precedent": mt_precedent,
            "montant_ca_actuel": mca_actuel, "montant_ca_precedent": mca_precedent,
            "commission_pdg_actuel": cpdg_actuel, "commission_pdg_precedent": cpdg_precedent,
            "variation": variation, "variation_mt": mt_actuel-mt_precedent,
            "variation_mca": mca_actuel-mca_precedent, "variation_cpdg": cpdg_actuel-cpdg_precedent,
            "taux": taux, "est_hausse": variation >= 0})

    par_pdv_list = sorted(par_pdv_list, key=lambda x: abs(x["variation"]), reverse=True)

    return {
        "annee": annee, "semaine": semaine,
        "prev_annee": prev_annee, "prev_semaine": prev_semaine,
        "total_ca_actuel": total_ca_actuel, "total_ca_precedent": total_ca_precedent,
        "total_montant_transaction_actuel": total_mt_actuel, "total_montant_transaction_precedent": total_mt_precedent,
        "total_montant_ca_actuel": total_mca_actuel, "total_montant_ca_precedent": total_mca_precedent,
        "total_commission_pdg_actuel": total_cpdg_actuel, "total_commission_pdg_precedent": total_cpdg_precedent,
        "variation_totale": variation_totale, "taux_variation_total": taux_variation_total,
        "par_superviseur": par_superviseur_list,
        "par_gestionnaire": par_gestionnaire_list,
        "par_pdv": par_pdv_list,
    }


@router.get("/dashboard/weekly-progression")
def weekly_progression(
    db: Session = Depends(get_db),
    annee: int = Query(...),
    top_n: int = Query(1200, ge=1, le=1200),
):
    """Statistiques de progression historique des PDVs — version optimisée (1 seule requête SQL)."""
    # Charger TOUTES les perfs de l'année en une seule requête
    all_perfs = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.annee == annee
    ).all()
    
    # Charger tous les PDVs en une seule requête
    pdvs = {p.id: p for p in db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE).all()}
    
    # Grouper par (annee, semaine) → liste triée par CA desc
    from collections import defaultdict
    semaine_perfs = defaultdict(list)
    for p in all_perfs:
        semaine_perfs[(p.annee, p.semaine)].append(p)
    
    # Calculer le rang de chaque PDV dans chaque semaine
    # rang_map[(pdv_id, annee, semaine)] = rang
    rang_map = {}
    for (y, w), perfs_semaine in semaine_perfs.items():
        sorted_perfs = sorted(perfs_semaine, key=lambda x: x.ca, reverse=True)
        for i, p in enumerate(sorted_perfs):
            rang_map[(p.pdv_id, y, w)] = i + 1

    # Grouper toutes les perfs par pdv_id
    perfs_par_pdv = defaultdict(list)
    for p in all_perfs:
        perfs_par_pdv[p.pdv_id].append(p)

    result_pdvs = []
    for pdv_id, pdv in pdvs.items():
        perfs = sorted(perfs_par_pdv.get(pdv_id, []), key=lambda x: (x.annee, x.semaine), reverse=True)
        if not perfs:
            continue

        def _wpmt(p): return getattr(p, 'montant_transaction', None) or p.ca or 0
        def _wpmca(p): return getattr(p, 'montant_ca', None) or 0
        def _wpcpdg(p): return getattr(p, 'commission_pdg', None) or 0

        nb_fois_top10 = 0; nb_fois_top50 = 0
        ca_max = 0; mt_max = 0; mca_max = 0; cpdg_max = 0
        semaine_meilleur_ca = None
        ca_min = float('inf'); mt_min = float('inf'); mca_min = float('inf'); cpdg_min = float('inf')
        semaine_pire_ca = None
        historique = []

        for p in perfs:
            rang = rang_map.get((pdv_id, p.annee, p.semaine))
            if rang and rang <= 10: nb_fois_top10 += 1
            if rang and rang <= 50: nb_fois_top50 += 1
            mt = _wpmt(p); mca = _wpmca(p); cpdg = _wpcpdg(p)
            if p.ca > ca_max:
                ca_max = p.ca; mt_max = mt; mca_max = mca; cpdg_max = cpdg
                semaine_meilleur_ca = f"{p.annee}-W{p.semaine:02d}"
            if p.est_actif and p.ca > 0 and p.ca < ca_min:
                ca_min = p.ca; mt_min = mt; mca_min = mca; cpdg_min = cpdg
                semaine_pire_ca = f"{p.annee}-W{p.semaine:02d}"
            historique.append({
                "annee": p.annee, "semaine": p.semaine,
                "ca": p.ca, "montant_transaction": mt, "montant_ca": mca, "commission_pdg": cpdg,
                "rang": rang,
            })

        if ca_min == float('inf'): ca_min = 0; mt_min = 0; mca_min = 0; cpdg_min = 0

        result_pdvs.append({
            "pdv_id": pdv_id, "numero_pdv": pdv.numero_pdv, "nom": pdv.nom,
            "zone": pdv.zone, "superviseur": pdv.superviseur,
            "nb_fois_top10": nb_fois_top10, "nb_fois_top50": nb_fois_top50,
            "semaine_meilleur_ca": semaine_meilleur_ca, "semaine_pire_ca": semaine_pire_ca,
            "ca_max": ca_max, "montant_transaction_max": mt_max, "montant_ca_max": mca_max, "commission_pdg_max": cpdg_max,
            "ca_min": ca_min, "montant_transaction_min": mt_min, "montant_ca_min": mca_min, "commission_pdg_min": cpdg_min,
            "historique_hebdo": historique,
        })

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
        sorted_month = sorted(all_month_perfs, key=lambda x: (getattr(x, 'montant_transaction', None) or x.ca or 0), reverse=True)
        rang_reseau = next((i+1 for i, sp in enumerate(sorted_month) if sp.pdv_id == pdv.id), None)
        montant_transaction = getattr(p, 'montant_transaction', None) or p.ca or 0
        montant_ca = getattr(p, 'montant_ca', None) or 0
        commission_pdg = getattr(p, 'commission_pdg', None) or 0
        commission_revendeur = getattr(p, 'commission_revendeur', None) or 0
        ratio_ca_transaction = getattr(p, 'ratio_ca_transaction', None) or 0
        
        historique.append({
            "annee": p.annee,
            "mois": p.mois,
            "ca": p.ca,
            "montant_transaction": montant_transaction,
            "montant_ca": montant_ca,
            "commission_pdg": commission_pdg,
            "commission_revendeur": commission_revendeur,
            "ratio_ca_transaction": ratio_ca_transaction,
            "nb_operations": p.nb_operations,
            "nb_depots": p.nb_depots,
            "montant_depots": p.montant_depots,
            "nb_retraits": p.nb_retraits,
            "montant_retraits": p.montant_retraits,
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
            "montant_transaction": getattr(p, 'montant_transaction', None) or p.ca or 0,
            "montant_ca": getattr(p, 'montant_ca', None) or 0,
            "commission_pdg": getattr(p, 'commission_pdg', None) or 0,
            "nb_operations": p.nb_operations,
            "montant_depots": p.montant_depots or 0,
            "montant_retraits": p.montant_retraits or 0,
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

    # Tous les mois disponibles
    from sqlalchemy import distinct
    mois_dispo = db.query(
        distinct(MonthlyPerformance.annee * 100 + MonthlyPerformance.mois)
    ).order_by(
        (MonthlyPerformance.annee * 100 + MonthlyPerformance.mois).asc()
    ).all()
    mois_disponibles = [
        {"annee": m[0] // 100, "mois": m[0] % 100}
        for m in mois_dispo
    ]

    # Toutes les semaines disponibles
    from sqlalchemy import distinct as dist2
    semaines_dispo = db.query(
        dist2(WeeklyPerformance.annee * 100 + WeeklyPerformance.semaine)
    ).order_by(
        (WeeklyPerformance.annee * 100 + WeeklyPerformance.semaine).asc()
    ).all()
    semaines_disponibles = [
        {"annee": s[0] // 100, "semaine": s[0] % 100}
        for s in semaines_dispo
    ]

    return {
        "last_month": {"annee": last_month[0], "mois": last_month[1]} if last_month else None,
        "last_week": {"annee": last_week[0], "semaine": last_week[1]} if last_week else None,
        "mois_disponibles": mois_disponibles,
        "semaines_disponibles": semaines_disponibles,
    }
