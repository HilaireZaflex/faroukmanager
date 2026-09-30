"""
Routes API — Module « Analyse Performance ».

Phase 1 : détection & priorisation des PDV en baisse
  - GET  /api/analyse-perf/config        → paramètres (seuils, poids, périodes…)
  - PUT  /api/analyse-perf/config        → mise à jour des paramètres
  - GET  /api/analyse-perf/recuperation  → analyse + score de risque + TOP à récupérer
  - GET  /api/analyse-perf/export        → export Excel de l'analyse

Métriques disponibles : volume (dépôts+retraits), real (commission réelle agent),
rendement (real ÷ volume). Analyse en périodes glissantes (mois ou semaines).
"""
import io
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from app.core.database import get_db
from app.api.routes.auth import get_current_user, get_pdv_filters
from app.models.user import User
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance, WeeklyPerformance
from app.models.analyse_perf import AnalysePerfConfig

router = APIRouter()

MOIS_NOMS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
             'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

# ── Configuration par défaut (tout est modifiable) ───────────────────────────
CONFIG_DEFAUT: Dict[str, Any] = {
    "mode": "mensuel",              # mensuel | hebdo
    "nb_periodes": 4,               # périodes glissantes analysées
    "metrique": "volume",           # volume | real | rendement
    "paliers": {"p1": 70, "p2": 50, "p3": 30},
    "score": {
        "intensite": {"seuils": [40, 30, 20, 10], "points": [30, 25, 20, 10, 0]},
        "persistance": {"points": {"3": 25, "2": 15, "1": 5, "0": 0}},
        "recente": {"seuils": [30, 20, 10], "points": [20, 15, 10, 5]},
        "financier": {
            "points": [25, 20, 15, 10, 5, 0],
            "seuils_volume": [10000000, 5000000, 2000000, 1000000, 0],
            "seuils_real": [25000, 12500, 5000, 2500, 0],
            "seuils_rendement": [0.001, 0.0005, 0.0002, 0.0001, 0],
        },
    },
    "nb_top": 50,
    "seuil_gisement_volume": 10000000,
    "seuil_gisement_rendement": 0.20,     # en %
    "seuil_rupture_periodes": 2,
    "objectif_taux_croissance": 0.05,
    "objectif_source": "auto",            # auto | manuel
}


def _get_config(db: Session) -> Dict[str, Any]:
    row = db.query(AnalysePerfConfig).filter(AnalysePerfConfig.cle == "global").first()
    cfg = dict(CONFIG_DEFAUT)
    if row and isinstance(row.valeur, dict):
        cfg.update(row.valeur)
    return cfg


def _save_config(db: Session, valeur: Dict[str, Any]) -> Dict[str, Any]:
    row = db.query(AnalysePerfConfig).filter(AnalysePerfConfig.cle == "global").first()
    if row is None:
        row = AnalysePerfConfig(cle="global", valeur=valeur)
        db.add(row)
    else:
        row.valeur = valeur
    db.commit()
    db.refresh(row)
    return row.valeur


# ── Helpers de calcul ─────────────────────────────────────────────────────────
def _periodes(db: Session, mode: str, n: int):
    """N dernières périodes disponibles (de la plus ancienne à la plus récente)."""
    if mode == "hebdo":
        rows = db.query(WeeklyPerformance.annee, WeeklyPerformance.semaine).distinct()\
            .order_by(WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc())\
            .limit(n).all()
        return [("hebdo", int(a), int(s)) for a, s in reversed(rows)]
    rows = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).distinct()\
        .order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc())\
        .limit(n).all()
    return [("mensuel", int(a), int(m)) for a, m in reversed(rows)]


def _label_periode(p):
    """p = (mode, annee, valeur)."""
    if p[0] == "hebdo":
        return f"S{p[2]:02d}"
    return f"{MOIS_NOMS[p[2]][:4]}. {p[1]}"


def _valeur(p, metrique: str) -> float:
    """Valeur d'une performance pour la métrique choisie."""
    if p is None:
        return 0.0
    volume = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0)
    real = float(getattr(p, "commission_revendeur", None) or 0)
    if metrique == "real":
        return real
    if metrique == "rendement":
        return (real / volume) if volume > 0 else 0.0
    return volume


def _variation(prev: float, cur: float) -> float:
    """Variation en % (0 si pas de base)."""
    if prev and prev > 0:
        return (cur - prev) / prev * 100.0
    if cur > 0:
        return 100.0  # apparition
    return 0.0


def _score_intensite(pct_perte: float, cfg: Dict[str, Any]) -> int:
    s = cfg["score"]["intensite"]
    for seuil, pts in zip(s["seuils"], s["points"]):
        if pct_perte >= seuil:
            return pts
    return s["points"][-1]


def _score_persistance(nb_baisses: int, cfg: Dict[str, Any]) -> int:
    pts = cfg["score"]["persistance"]["points"]
    return int(pts.get(str(min(nb_baisses, 3)), 0))


def _score_recente(var_recente: float, cfg: Dict[str, Any]) -> int:
    s = cfg["score"]["recente"]
    if var_recente >= 0:
        return 0
    mag = abs(var_recente)
    for seuil, pts in zip(s["seuils"], s["points"]):
        if mag >= seuil:
            return pts
    return s["points"][-1]


def _score_financier(perte: float, metrique: str, cfg: Dict[str, Any]) -> int:
    s = cfg["score"]["financier"]
    if perte <= 0:
        return 0
    seuils = s.get(f"seuils_{metrique}") or s.get("seuils_volume") or []
    for seuil, pts in zip(seuils, s["points"]):
        if perte >= seuil:
            return pts
    return s["points"][-2] if len(s["points"]) >= 2 else 0


def _priorite(score: int, cfg: Dict[str, Any]) -> str:
    pal = cfg["paliers"]
    if score >= pal["p1"]:
        return "P1"
    if score >= pal["p2"]:
        return "P2"
    if score >= pal["p3"]:
        return "P3"
    return "P4"


def _libelle_priorite(p: str) -> str:
    return {"P1": "🔴 P1 - URGENCE", "P2": "🟠 P2 - À RÉCUPÉRER",
            "P3": "🟡 P3 - À SURVEILLER", "P4": "🟢 P4 - STABLE"}.get(p, p)


# ── Config ────────────────────────────────────────────────────────────────────
@router.get("/analyse-perf/config")
def get_config(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_config(db)


@router.put("/analyse-perf/config")
def update_config(body: Dict[str, Any], db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """Met à jour les paramètres (fusion partielle avec les valeurs par défaut)."""
    actuel = _get_config(db)
    actuel.update(body or {})
    return _save_config(db, actuel)


# ── Analyse + récupération ────────────────────────────────────────────────────
def _construire_analyse(db: Session, cfg: Dict[str, Any], mode: str, metrique: str,
                        zone: Optional[str], superviseur: Optional[str],
                        type_pdv: Optional[str], current_user: User):
    nb = max(2, int(cfg.get("nb_periodes", 4)))
    periodes = _periodes(db, mode, nb)
    if len(periodes) < 2:
        return {"periodes": [_label_periode(p) for p in periodes], "pdvs": [], "kpis": {}}

    # Charger toutes les performances des périodes retenues
    if mode == "hebdo":
        conds = [and_(WeeklyPerformance.annee == p[1], WeeklyPerformance.semaine == p[2]) for p in periodes]
        rows = db.query(WeeklyPerformance).filter(or_(*conds)).all()
        def pkey(p): return (p.annee, p.semaine)
    else:
        conds = [and_(MonthlyPerformance.annee == p[1], MonthlyPerformance.mois == p[2]) for p in periodes]
        rows = db.query(MonthlyPerformance).filter(or_(*conds)).all()
        def pkey(p): return (p.annee, p.mois)

    idx_par_cle = {(p[1], p[2]): i for i, p in enumerate(periodes)}
    series: Dict[int, List[Optional[Any]]] = {}
    for r in rows:
        k = pkey(r)
        i = idx_par_cle.get(k)
        if i is None:
            continue
        series.setdefault(r.pdv_id, [None] * len(periodes))[i] = r

    # Charger les PDV concernés
    pdv_ids = list(series.keys())
    if not pdv_ids:
        return {"periodes": [_label_periode(p) for p in periodes], "pdvs": [], "kpis": {}}
    pdvs = {p.id: p for p in db.query(PDV).filter(PDV.id.in_(pdv_ids)).all()}

    # Filtres rôle + manuels
    f_user = get_pdv_filters(current_user)
    zone_f = f_user.get("zone") or zone
    sup_f = f_user.get("superviseur") or superviseur

    resultat: List[Dict[str, Any]] = []
    for pid, serie_perf in series.items():
        pdv = pdvs.get(pid)
        if pdv is None or pdv.statut == PDVStatut.DESACTIVE:
            continue
        if zone_f and (pdv.zone or "") != zone_f:
            continue
        if sup_f and sup_f.lower() not in (pdv.superviseur or "").lower():
            continue
        if type_pdv and (pdv.type_pdv.value if pdv.type_pdv else "") != type_pdv:
            continue

        serie = [_valeur(p, metrique) for p in serie_perf]
        if not any(v and v > 0 for v in serie):
            continue

        variations = [_variation(serie[i], serie[i + 1]) for i in range(len(serie) - 1)]
        var_recente = variations[-1] if variations else 0.0
        nb_baisses = sum(1 for i in range(len(serie) - 1) if serie[i + 1] < serie[i])
        # baisses consécutives à la fin
        cons = 0
        for i in range(len(serie) - 2, -1, -1):
            if serie[i + 1] < serie[i]:
                cons += 1
            else:
                break
        meilleur = max(serie) if serie else 0.0
        actuel = serie[-1] if serie else 0.0
        premier = serie[0] if serie else 0.0
        perte = max(0.0, meilleur - actuel)
        pct_perte = (perte / meilleur * 100.0) if meilleur > 0 else 0.0
        var_globale = _variation(premier, actuel)

        sc_i = _score_intensite(pct_perte, cfg)
        sc_p = _score_persistance(nb_baisses, cfg)
        sc_r = _score_recente(var_recente, cfg)
        sc_f = _score_financier(perte, metrique, cfg)
        score = int(sc_i + sc_p + sc_r + sc_f)
        prio = _priorite(score, cfg)

        resultat.append({
            "pdv_id": pid,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "sous_zone": pdv.sous_zone,
            "quartier": pdv.quartier,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "type_pdv": pdv.type_pdv.value if pdv.type_pdv else None,
            "statut": pdv.statut.value if pdv.statut else None,
            "serie": [round(v, 4) if metrique == "rendement" else round(v, 2) for v in serie],
            "variations": [round(v, 2) for v in variations],
            "var_recente": round(var_recente, 2),
            "var_globale": round(var_globale, 2),
            "nb_baisses": nb_baisses,
            "baisse_consecutive": cons,
            "meilleur": round(meilleur, 4) if metrique == "rendement" else round(meilleur, 2),
            "actuel": round(actuel, 4) if metrique == "rendement" else round(actuel, 2),
            "perte_valeur": round(perte, 4) if metrique == "rendement" else round(perte, 2),
            "pct_perte": round(pct_perte, 2),
            "score": score,
            "score_detail": {"intensite": sc_i, "persistance": sc_p, "recente": sc_r, "financier": sc_f},
            "priorite": prio,
            "priorite_label": _libelle_priorite(prio),
            "potentiel_recuperable": round(perte, 4) if metrique == "rendement" else round(perte, 2),
        })

    # Classements
    par_perte = sorted(resultat, key=lambda x: x["perte_valeur"], reverse=True)
    for i, r in enumerate(par_perte):
        r["rang_financier"] = i + 1
    par_score = sorted(resultat, key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(par_score):
        r["rang_risque"] = i + 1

    resultat.sort(key=lambda x: (x["score"], x["perte_valeur"]), reverse=True)

    # KPI de synthèse
    def _total(champ):
        return round(sum(r[champ] for r in resultat), 2)
    kpis = {
        "nb_pdv_analyses": len(resultat),
        "nb_baisse": sum(1 for r in resultat if r["pct_perte"] > 0),
        "nb_p1": sum(1 for r in resultat if r["priorite"] == "P1"),
        "nb_p2": sum(1 for r in resultat if r["priorite"] == "P2"),
        "nb_p3": sum(1 for r in resultat if r["priorite"] == "P3"),
        "nb_p4": sum(1 for r in resultat if r["priorite"] == "P4"),
        "perte_totale": _total("perte_valeur"),
        "potentiel_total": _total("potentiel_recuperable"),
        "metrique": metrique,
    }
    return {
        "periodes": [_label_periode(p) for p in periodes],
        "mode": mode,
        "metrique": metrique,
        "kpis": kpis,
        "pdvs": resultat,
    }


@router.get("/analyse-perf/recuperation")
def recuperation(
    mode: Optional[str] = Query(None, description="mensuel | hebdo"),
    metrique: Optional[str] = Query(None, description="volume | real | rendement"),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    type_pdv: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    metrique = (metrique or cfg.get("metrique") or "volume").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    if metrique not in ("volume", "real", "rendement"):
        metrique = "volume"
    data = _construire_analyse(db, cfg, mode, metrique, zone, superviseur, type_pdv, current_user)
    data["config"] = cfg
    data["top"] = data["pdvs"][: int(cfg.get("nb_top", 50))]
    return data


@router.get("/analyse-perf/export")
def export_analyse(
    mode: Optional[str] = Query(None),
    metrique: Optional[str] = Query(None),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    type_pdv: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export Excel de l'analyse (trié par score de risque décroissant)."""
    from openpyxl import Workbook
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    metrique = (metrique or cfg.get("metrique") or "volume").lower()
    data = _construire_analyse(db, cfg, mode, metrique, zone, superviseur, type_pdv, current_user)

    wb = Workbook()
    ws = wb.active
    ws.title = "PDV à récupérer"
    entetes = ["Rang risque", "Rang financier", "N° PDV", "Nom", "Zone", "Sous-zone",
               "Quartier", "Superviseur", "Type", "Statut"]
    for lab in data.get("periodes", []):
        entetes.append(lab)
    entetes += ["Var récente %", "Var globale %", "Nb baisses", "Baisses consécutives",
                "Meilleur", "Actuel", "Perte valeur", "% perte", "Score /100",
                "Intensité", "Persistance", "Récente", "Financier", "Priorité", "Potentiel récupérable"]
    ws.append(entetes)
    for r in data.get("pdvs", []):
        ligne = [r.get("rang_risque"), r.get("rang_financier"), r.get("numero_pdv"), r.get("nom"),
                 r.get("zone"), r.get("sous_zone"), r.get("quartier"), r.get("superviseur"),
                 r.get("type_pdv"), r.get("statut")]
        ligne += list(r.get("serie") or [])
        sd = r.get("score_detail") or {}
        ligne += [r.get("var_recente"), r.get("var_globale"), r.get("nb_baisses"),
                  r.get("baisse_consecutive"), r.get("meilleur"), r.get("actuel"),
                  r.get("perte_valeur"), r.get("pct_perte"), r.get("score"),
                  sd.get("intensite"), sd.get("persistance"), sd.get("recente"), sd.get("financier"),
                  r.get("priorite_label"), r.get("potentiel_recuperable")]
        ws.append(ligne)

    flux = io.BytesIO()
    wb.save(flux)
    flux.seek(0)
    return StreamingResponse(
        flux,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="pdv_a_recuperer.xlsx"'},
    )


# ══════════════════════════════════════════════════════════════════════════════
# SYNTHÈSE DIRECTION GÉNÉRALE (KPI hiérarchisés + drill-down)
# ══════════════════════════════════════════════════════════════════════════════
def _period_key(p) -> str:
    return f"{p[1]:04d}-{p[2]:02d}" if p[0] == "mensuel" else f"{p[1]:04d}-S{p[2]:02d}"


def _pct(prev, cur):
    if prev and prev > 0:
        return round((cur - prev) / prev * 100, 2)
    return None


def _agg(perf_par_pdv, ids, i):
    """Agrège les KPI d'un ensemble de PDV à l'indice de période i."""
    volume = real = ci = co = 0.0
    ops = 0
    actifs = 0
    for pid in ids:
        p = perf_par_pdv.get(pid, {}).get(i)
        if not p:
            continue
        v = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0)
        r = float(getattr(p, "commission_revendeur", None) or 0)
        o = int(getattr(p, "nb_operations", None) or 0)
        volume += v
        real += r
        ci += float(getattr(p, "montant_depots", None) or 0)
        co += float(getattr(p, "montant_retraits", None) or 0)
        ops += o
        if o > 0 or v > 0:
            actifs += 1
    rendement = real / volume if volume > 0 else 0.0
    return {
        "volume": round(volume, 2), "real": round(real, 2),
        "ci": round(ci, 2), "co": round(co, 2), "flux_net": round(ci - co, 2),
        "operations": ops, "actifs": actifs,
        "rendement": round(rendement, 6),
        "real_par_million": round(rendement * 1_000_000, 2),
        "volume_par_actif": round(volume / actifs, 2) if actifs else 0,
        "real_par_actif": round(real / actifs, 2) if actifs else 0,
    }


@router.get("/analyse-perf/synthese")
def synthese(
    mode: Optional[str] = Query(None),
    niveau: str = Query("zone", description="zone | superviseur | pdv"),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    if niveau not in ("zone", "superviseur", "pdv"):
        niveau = "zone"
    n = max(int(cfg.get("nb_periodes", 4)), 2)
    m = max(int(cfg.get("seuil_rupture_periodes", 2)), 1)

    periodes = _periodes(db, mode, max(n + 1, m + 1, 6))
    if len(periodes) < 2:
        return {"periodes": [], "kpis": {}, "lignes": [], "mode": mode, "niveau": niveau}

    if mode == "hebdo":
        conds = [and_(WeeklyPerformance.annee == p[1], WeeklyPerformance.semaine == p[2]) for p in periodes]
        rows = db.query(WeeklyPerformance).filter(or_(*conds)).all()
        def pkey(p): return (p.annee, p.semaine)
    else:
        conds = [and_(MonthlyPerformance.annee == p[1], MonthlyPerformance.mois == p[2]) for p in periodes]
        rows = db.query(MonthlyPerformance).filter(or_(*conds)).all()
        def pkey(p): return (p.annee, p.mois)

    idx = {(p[1], p[2]): i for i, p in enumerate(periodes)}
    perf_par_pdv: Dict[int, Dict[int, Any]] = {}
    for r in rows:
        i = idx.get(pkey(r))
        if i is None:
            continue
        perf_par_pdv.setdefault(r.pdv_id, {})[i] = r

    f_user = get_pdv_filters(current_user)
    zone_f = f_user.get("zone") or zone
    sup_f = f_user.get("superviseur") or superviseur
    q = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)
    if zone_f:
        q = q.filter(PDV.zone == zone_f)
    if sup_f:
        q = q.filter(PDV.superviseur.ilike(f"%{sup_f}%"))
    pdvs = q.all()
    pdv_ids = [p.id for p in pdvs]
    pdv_map = {p.id: p for p in pdvs}
    total_pdv = len(pdvs)

    i_cur = len(periodes) - 1
    i_prev = i_cur - 1 if i_cur >= 1 else None
    i_back = max(0, i_cur - n)

    cur = _agg(perf_par_pdv, pdv_ids, i_cur)
    prev = _agg(perf_par_pdv, pdv_ids, i_prev) if i_prev is not None else None
    back = _agg(perf_par_pdv, pdv_ids, i_back) if i_back != i_cur else None

    act_cur = round(cur["actifs"] / total_pdv * 100, 2) if total_pdv else 0
    act_prev = round(prev["actifs"] / total_pdv * 100, 2) if (prev and total_pdv) else None

    seuil_gv = float(cfg.get("seuil_gisement_volume", 10000000))
    seuil_gr = float(cfg.get("seuil_gisement_rendement", 0.20))   # en %

    en_rupture = set()
    gisements = set()
    reals: Dict[int, float] = {}
    vol_par_pdv: Dict[int, float] = {}
    for pid in pdv_ids:
        serie = perf_par_pdv.get(pid, {})
        pcur = serie.get(i_cur)
        v = float(getattr(pcur, "montant_transaction", None) or getattr(pcur, "ca", None) or 0) if pcur else 0
        r = float(getattr(pcur, "commission_revendeur", None) or 0) if pcur else 0
        reals[pid] = r
        vol_par_pdv[pid] = v
        rend = (r / v * 100) if v > 0 else 0
        if v >= seuil_gv and rend < seuil_gr:
            gisements.add(pid)
        indices_rupture = [i_cur - k for k in range(min(m, i_cur + 1))]
        ops_recentes = sum(int(getattr(serie.get(i), "nb_operations", None) or 0)
                           for i in indices_rupture if serie.get(i))
        plus_ancien = min(indices_rupture) if indices_rupture else 0
        ops_avant = sum(int(getattr(serie.get(i), "nb_operations", None) or 0)
                        for i in range(0, plus_ancien) if serie.get(i))
        if ops_recentes == 0 and ops_avant > 0:
            en_rupture.add(pid)

    top100 = sorted(pdv_ids, key=lambda x: reals.get(x, 0), reverse=True)[:100]
    real_top100 = sum(reals.get(x, 0) for x in top100)
    concentration = round(real_top100 / cur["real"] * 100, 2) if cur["real"] > 0 else 0
    ruptures_top100 = len([x for x in top100 if x in en_rupture])
    vol_gisements = sum(vol_par_pdv.get(pid, 0) for pid in gisements)

    # Objectif (manuel prioritaire, sinon auto)
    scope_key = "RESEAU" if not (zone_f or sup_f) else (f"ZONE:{zone_f}" if zone_f else f"SUPERVISEUR:{sup_f}")
    objectifs = cfg.get("objectifs") or {}
    pkey_cur = _period_key(periodes[i_cur])
    manuel = (objectifs.get(scope_key) or {}).get(pkey_cur)
    if manuel is not None:
        objectif = float(manuel)
        source = "manuel"
    else:
        best = max(_agg(perf_par_pdv, pdv_ids, i)["real"] for i in range(max(0, i_cur - n + 1), i_cur + 1))
        objectif = round(best * (1 + float(cfg.get("objectif_taux_croissance", 0.05))), 2)
        source = "auto"
    taux_realisation = round(cur["real"] / objectif * 100, 2) if objectif > 0 else 0

    kpis = {
        "real": cur["real"], "rendement": cur["rendement"], "real_par_million": cur["real_par_million"],
        "volume": cur["volume"], "activation": act_cur, "volume_par_actif": cur["volume_par_actif"],
        "real_par_actif": cur["real_par_actif"], "flux_net": cur["flux_net"], "ci": cur["ci"], "co": cur["co"],
        "nb_pdv_total": total_pdv, "nb_actifs": cur["actifs"],
        "nb_gisements": len(gisements), "volume_gisements": round(vol_gisements, 2),
        "pct_volume_gisements": round(vol_gisements / cur["volume"] * 100, 2) if cur["volume"] > 0 else 0,
        "nb_ruptures": len(en_rupture), "ruptures_top100": ruptures_top100,
        "concentration_top100": concentration,
        "objectif": objectif, "objectif_source": source, "taux_realisation": taux_realisation,
        "var_real": _pct(prev["real"], cur["real"]) if prev else None,
        "var_volume": _pct(prev["volume"], cur["volume"]) if prev else None,
        "var_rendement": _pct(prev["rendement"], cur["rendement"]) if prev else None,
        "var_activation": round(act_cur - act_prev, 2) if act_prev is not None else None,
        "var_real_4": _pct(back["real"], cur["real"]) if back else None,
        "var_volume_4": _pct(back["volume"], cur["volume"]) if back else None,
    }

    def cle_groupe(pid):
        pdv = pdv_map.get(pid)
        if pdv is None:
            return "—"
        if niveau == "zone":
            return pdv.zone or "—"
        if niveau == "superviseur":
            return pdv.superviseur or "—"
        return f"{pdv.numero_pdv} — {pdv.nom}"

    groupes: Dict[str, List[int]] = {}
    for pid in pdv_ids:
        groupes.setdefault(cle_groupe(pid), []).append(pid)

    lignes = []
    for nom, ids in groupes.items():
        mc = _agg(perf_par_pdv, ids, i_cur)
        mp = _agg(perf_par_pdv, ids, i_prev) if i_prev is not None else None
        act = round(mc["actifs"] / len(ids) * 100, 2) if ids else 0
        lignes.append({
            "nom": nom, "nb_pdv": len(ids),
            "pdv_id": (ids[0] if niveau == "pdv" and ids else None),
            "real": mc["real"], "volume": mc["volume"], "rendement": mc["rendement"],
            "real_par_million": mc["real_par_million"], "activation": act,
            "volume_par_actif": mc["volume_par_actif"], "real_par_actif": mc["real_par_actif"],
            "flux_net": mc["flux_net"],
            "nb_gisements": len([x for x in ids if x in gisements]),
            "nb_ruptures": len([x for x in ids if x in en_rupture]),
            "var_real": _pct(mp["real"], mc["real"]) if mp else None,
            "var_volume": _pct(mp["volume"], mc["volume"]) if mp else None,
        })
    lignes.sort(key=lambda x: x["real"], reverse=True)

    return {
        "mode": mode, "niveau": niveau,
        "period_key_courante": pkey_cur,
        "periode_courante": _label_periode(periodes[i_cur]),
        "periode_precedente": _label_periode(periodes[i_prev]) if i_prev is not None else None,
        "periode_reference": _label_periode(periodes[i_back]) if i_back != i_cur else None,
        "periodes": [_label_periode(p) for p in periodes],
        "zone": zone_f, "superviseur": sup_f,
        "kpis": kpis,
        "lignes": lignes,
    }


@router.put("/analyse-perf/objectif")
def set_objectif(body: Dict[str, Any], db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """Définit (ou supprime si valeur = null) l'objectif REAL TTC d'un scope/période."""
    cfg = _get_config(db)
    objectifs = dict(cfg.get("objectifs") or {})
    scope = body.get("scope") or "RESEAU"
    per = dict(objectifs.get(scope) or {})
    pkey = body.get("period_key")
    if not pkey:
        raise HTTPException(status_code=400, detail="period_key requis")
    valeur = body.get("valeur")
    if valeur is None:
        per.pop(pkey, None)
    else:
        per[pkey] = float(valeur)
    objectifs[scope] = per
    cfg["objectifs"] = objectifs
    _save_config(db, cfg)
    return {"success": True, "scope": scope, "period_key": pkey, "valeur": valeur}
