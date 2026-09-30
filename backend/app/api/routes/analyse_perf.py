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
    "source_real": "totale",        # agent (commission réelle PDV) | pdg | totale
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
    # Objectifs d'activation par zone (%, différenciés)
    "objectif_activation_defaut": 90,
    "objectifs_activation": {},
    # Segmentation dynamique
    "segments_critere": "rendement",      # volume | real | rendement
    "segments_noms": ["Diamant", "Argent", "Or", "Cuivre", "Fer"],
    "segments_paliers": [95, 80, 60, 30],  # percentiles décroissants
    # Score superviseur /100
    "score_superviseur": {
        "poids": {"objectif": 25, "rendement": 25, "productivite": 20,
                  "activation_retention": 15, "ruptures": 10, "qualite": 5},
        "cible_rendement": 0.26,   # en %
        "cible_activation": 90,    # en %
        "cible_rupture": 2,        # en % max
    },
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


def _real(p, source_real: str = "agent") -> float:
    """Commission retenue comme « REAL TTC » selon la source configurée."""
    if p is None:
        return 0.0
    rev = float(getattr(p, "commission_revendeur", None) or 0)
    pdg = float(getattr(p, "commission_pdg", None) or 0)
    if source_real == "pdg":
        return pdg
    if source_real == "totale":
        return pdg + rev
    return rev   # "agent" : commission réellement perçue par le PDV


def _valeur(p, metrique: str, source_real: str = "agent") -> float:
    """Valeur d'une performance pour la métrique choisie."""
    if p is None:
        return 0.0
    volume = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0)
    real = _real(p, source_real)
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
    source_real = cfg.get("source_real", "agent")
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

        serie = [_valeur(p, metrique, source_real) for p in serie_perf]
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
        moyenne = (sum(serie) / len(serie)) if serie else 0.0
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
            "moyenne": round(moyenne, 4) if metrique == "rendement" else round(moyenne, 2),
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
                "Meilleur", "Moyenne", "Actuel", "Perte valeur", "% perte", "Score /100",
                "Intensité", "Persistance", "Récente", "Financier", "Priorité", "Potentiel récupérable"]
    ws.append(entetes)
    for r in data.get("pdvs", []):
        ligne = [r.get("rang_risque"), r.get("rang_financier"), r.get("numero_pdv"), r.get("nom"),
                 r.get("zone"), r.get("sous_zone"), r.get("quartier"), r.get("superviseur"),
                 r.get("type_pdv"), r.get("statut")]
        ligne += list(r.get("serie") or [])
        sd = r.get("score_detail") or {}
        ligne += [r.get("var_recente"), r.get("var_globale"), r.get("nb_baisses"),
                  r.get("baisse_consecutive"), r.get("meilleur"), r.get("moyenne"), r.get("actuel"),
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


def _agg(perf_par_pdv, ids, i, source_real: str = "agent"):
    """Agrège les KPI d'un ensemble de PDV à l'indice de période i."""
    volume = real = ci = co = 0.0
    ops = 0
    actifs = 0
    for pid in ids:
        p = perf_par_pdv.get(pid, {}).get(i)
        if not p:
            continue
        v = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0)
        r = _real(p, source_real)
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
    source_real = cfg.get("source_real", "agent")

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

    cur = _agg(perf_par_pdv, pdv_ids, i_cur, source_real)
    prev = _agg(perf_par_pdv, pdv_ids, i_prev, source_real) if i_prev is not None else None
    back = _agg(perf_par_pdv, pdv_ids, i_back, source_real) if i_back != i_cur else None

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
        r = _real(pcur, source_real)
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
        best = max(_agg(perf_par_pdv, pdv_ids, i, source_real)["real"] for i in range(max(0, i_cur - n + 1), i_cur + 1))
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
        mc = _agg(perf_par_pdv, ids, i_cur, source_real)
        mp = _agg(perf_par_pdv, ids, i_prev, source_real) if i_prev is not None else None
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
        "source_real": source_real,
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


# ══════════════════════════════════════════════════════════════════════════════
# ANALYSES : Zones · Segments · Gisements de profit
# ══════════════════════════════════════════════════════════════════════════════
def _charger(db: Session, mode: str, nb: int):
    """Charge les performances des nb dernières périodes → {pdv_id: {index: perf}}."""
    periodes = _periodes(db, mode, max(2, nb))
    if not periodes:
        return periodes, {}
    if mode == "hebdo":
        conds = [and_(WeeklyPerformance.annee == p[1], WeeklyPerformance.semaine == p[2]) for p in periodes]
        rows = db.query(WeeklyPerformance).filter(or_(*conds)).all()
        def pkey(p): return (p.annee, p.semaine)
    else:
        conds = [and_(MonthlyPerformance.annee == p[1], MonthlyPerformance.mois == p[2]) for p in periodes]
        rows = db.query(MonthlyPerformance).filter(or_(*conds)).all()
        def pkey(p): return (p.annee, p.mois)
    idx = {(p[1], p[2]): i for i, p in enumerate(periodes)}
    data: Dict[int, Dict[int, Any]] = {}
    for r in rows:
        i = idx.get(pkey(r))
        if i is None:
            continue
        data.setdefault(r.pdv_id, {})[i] = r
    return periodes, data


def _pdvs_scope(db: Session, current_user: User, zone=None, superviseur=None, type_pdv=None):
    f = get_pdv_filters(current_user)
    z = f.get("zone") or zone
    s = f.get("superviseur") or superviseur
    q = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)
    if z:
        q = q.filter(PDV.zone == z)
    if s:
        q = q.filter(PDV.superviseur.ilike(f"%{s}%"))
    if type_pdv:
        q = q.filter(PDV.type_pdv == type_pdv)
    return q.all()


def _valeur_critere(p, critere: str, source_real: str):
    if p is None:
        return 0.0
    v = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0)
    r = _real(p, source_real)
    if critere == "real":
        return r
    if critere == "rendement":
        return (r / v) if v > 0 else 0.0
    return v


def _bandes_percentile(valeurs, paliers):
    """Seuils correspondant aux percentiles décroissants (ex: [95,80,60,30])."""
    vals = sorted([v for v in valeurs if v and v > 0], reverse=True)
    n = len(vals)
    if n == 0:
        return [0 for _ in paliers]
    seuils = []
    for pct in paliers:
        i = int(round(n * (100 - pct) / 100.0))
        i = max(0, min(n - 1, i))
        seuils.append(vals[i])
    return seuils


def _bande_de(valeur, seuils):
    for k, s in enumerate(seuils):
        if valeur >= s:
            return k
    return len(seuils)


@router.get("/analyse-perf/zones")
def analyse_zones(
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tableau par zone : activation, volume, REAL, rendement + objectif d'activation."""
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    source_real = cfg.get("source_real", "agent")
    periodes, perf = _charger(db, mode, max(int(cfg.get("nb_periodes", 4)), 2))
    if not periodes:
        return {"lignes": [], "periodes": []}
    i_cur = len(periodes) - 1
    pdvs = _pdvs_scope(db, current_user)

    par_zone: Dict[str, List[int]] = {}
    for p in pdvs:
        par_zone.setdefault(p.zone or "—", []).append(p.id)

    obj_def = float(cfg.get("objectif_activation_defaut", 90))
    obj_zones = cfg.get("objectifs_activation") or {}
    seuil_gv = float(cfg.get("seuil_gisement_volume", 10000000))
    seuil_gr = float(cfg.get("seuil_gisement_rendement", 0.20))

    lignes = []
    for z, ids in par_zone.items():
        m = _agg(perf, ids, i_cur, source_real)
        act = round(m["actifs"] / len(ids) * 100, 2) if ids else 0
        obj = float(obj_zones.get(z, obj_def))
        gis = 0
        for pid in ids:
            p = perf.get(pid, {}).get(i_cur)
            v = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0) if p else 0
            r = _real(p, source_real)
            if v >= seuil_gv and (r / v * 100 if v > 0 else 0) < seuil_gr:
                gis += 1
        lignes.append({
            "nom": z, "nb_pdv": len(ids), "nb_actifs": m["actifs"], "inactifs": len(ids) - m["actifs"],
            "activation": act, "objectif_activation": obj, "ecart_activation": round(act - obj, 2),
            "volume": m["volume"], "real": m["real"], "rendement": m["rendement"],
            "real_par_million": m["real_par_million"], "volume_par_actif": m["volume_par_actif"],
            "real_par_actif": m["real_par_actif"], "flux_net": m["flux_net"],
            "nb_gisements": gis,
        })
    lignes.sort(key=lambda x: x["volume"], reverse=True)

    total = _agg(perf, [p.id for p in pdvs], i_cur, source_real)
    return {
        "mode": mode, "source_real": source_real,
        "periode_courante": _label_periode(periodes[i_cur]),
        "periodes": [_label_periode(p) for p in periodes],
        "objectif_activation_defaut": obj_def,
        "lignes": lignes,
        "total": {
            "nb_pdv": len(pdvs), "nb_actifs": total["actifs"],
            "activation": round(total["actifs"] / len(pdvs) * 100, 2) if pdvs else 0,
            "volume": total["volume"], "real": total["real"],
            "rendement": total["rendement"], "real_par_million": total["real_par_million"],
            "volume_par_actif": total["volume_par_actif"], "real_par_actif": total["real_par_actif"],
        },
    }


@router.get("/analyse-perf/segments")
def analyse_segments(
    mode: Optional[str] = Query(None),
    critere: Optional[str] = Query(None, description="volume | real | rendement"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Segmentation dynamique (percentiles) selon le critère choisi."""
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    critere = (critere or cfg.get("segments_critere") or "rendement").lower()
    if critere not in ("volume", "real", "rendement"):
        critere = "rendement"
    source_real = cfg.get("source_real", "agent")
    noms = cfg.get("segments_noms") or ["Diamant", "Argent", "Or", "Cuivre", "Fer"]
    paliers = cfg.get("segments_paliers") or [95, 80, 60, 30]

    periodes, perf = _charger(db, mode, max(int(cfg.get("nb_periodes", 4)), 2))
    if not periodes:
        return {"lignes": [], "sous_segment": {}}
    i_cur = len(periodes) - 1
    pdvs = _pdvs_scope(db, current_user)
    seuil_gv = float(cfg.get("seuil_gisement_volume", 10000000))
    seuil_gr = float(cfg.get("seuil_gisement_rendement", 0.20))

    valeurs = {p.id: _valeur_critere(perf.get(p.id, {}).get(i_cur), critere, source_real) for p in pdvs}
    seuils = _bandes_percentile(list(valeurs.values()), paliers)

    par_bande: Dict[int, List[int]] = {i: [] for i in range(len(noms))}
    for pid, val in valeurs.items():
        par_bande[_bande_de(val, seuils)].append(pid)

    total_vol = _agg(perf, [p.id for p in pdvs], i_cur, source_real)["volume"] or 1
    total_real = _agg(perf, [p.id for p in pdvs], i_cur, source_real)["real"] or 1

    lignes = []
    for i, nom in enumerate(noms):
        ids = par_bande.get(i, [])
        m = _agg(perf, ids, i_cur, source_real)
        act = round(m["actifs"] / len(ids) * 100, 2) if ids else 0
        lignes.append({
            "segment": nom, "nb_pdv": len(ids), "activation": act,
            "volume": m["volume"], "real": m["real"], "rendement": m["rendement"],
            "real_par_million": m["real_par_million"],
            "pct_volume": round(m["volume"] / total_vol * 100, 2),
            "pct_real": round(m["real"] / total_real * 100, 2),
            "valeur_critere": round(seuils[i], 4) if i < len(seuils) else 0,
        })

    # Sous-classification du DERNIER segment (ex : « Fer »)
    dernier = noms[-1] if noms else "Fer"
    fer_ids = par_bande.get(len(noms) - 1, [])
    sous = {"dormant": 0, "rentable": 0, "a_potentiel": 0, "faible": 0}
    for pid in fer_ids:
        p = perf.get(pid, {}).get(i_cur)
        v = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0) if p else 0
        r = _real(p, source_real)
        ops = int(getattr(p, "nb_operations", None) or 0) if p else 0
        rend = (r / v * 100) if v > 0 else 0
        if ops == 0 and v == 0:
            sous["dormant"] += 1
        elif rend >= seuil_gr:
            sous["rentable"] += 1
        elif v >= seuil_gv:
            sous["a_potentiel"] += 1
        else:
            sous["faible"] += 1

    return {
        "mode": mode, "critere": critere, "source_real": source_real,
        "periode_courante": _label_periode(periodes[i_cur]),
        "paliers": paliers, "seuils": seuils,
        "lignes": lignes,
        "sous_segment": {"nom": dernier, **sous},
    }


@router.get("/analyse-perf/gisements")
def analyse_gisements(
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """PDV à fort volume mais faible rendement + évolution dans le temps."""
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    source_real = cfg.get("source_real", "agent")
    seuil_gv = float(cfg.get("seuil_gisement_volume", 10000000))
    seuil_gr = float(cfg.get("seuil_gisement_rendement", 0.20))

    periodes, perf = _charger(db, mode, max(int(cfg.get("nb_periodes", 4)), 2))
    if not periodes:
        return {"pdvs": [], "evolution": []}
    i_cur = len(periodes) - 1
    pdvs = _pdvs_scope(db, current_user)
    pdv_map = {p.id: p for p in pdvs}

    def est_gisement(p):
        v = float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0) if p else 0
        r = _real(p, source_real)
        return v >= seuil_gv and ((r / v * 100) if v > 0 else 0) < seuil_gr

    liste = []
    for p in pdvs:
        pc = perf.get(p.id, {}).get(i_cur)
        if est_gisement(pc):
            v = float(getattr(pc, "montant_transaction", None) or getattr(pc, "ca", None) or 0)
            r = _real(pc, source_real)
            liste.append({
                "pdv_id": p.id, "numero_pdv": p.numero_pdv, "nom": p.nom,
                "zone": p.zone, "sous_zone": p.sous_zone, "quartier": p.quartier,
                "superviseur": p.superviseur, "type_pdv": p.type_pdv.value if p.type_pdv else None,
                "volume": round(v, 2), "real": round(r, 2),
                "rendement": round((r / v * 100) if v > 0 else 0, 4),
                "operations": int(getattr(pc, "nb_operations", None) or 0),
            })
    liste.sort(key=lambda x: x["volume"], reverse=True)

    evolution = []
    for i in range(len(periodes)):
        nb = vol = 0.0
        for p in pdvs:
            pp = perf.get(p.id, {}).get(i)
            if est_gisement(pp):
                nb += 1
                vol += float(getattr(pp, "montant_transaction", None) or getattr(pp, "ca", None) or 0)
        evolution.append({"periode": _label_periode(periodes[i]), "nb": int(nb), "volume": round(vol, 2)})

    total_vol_reseau = _agg(perf, [p.id for p in pdvs], i_cur, source_real)["volume"] or 1
    vol_gis = sum(x["volume"] for x in liste)
    return {
        "mode": mode, "source_real": source_real,
        "periode_courante": _label_periode(periodes[i_cur]),
        "seuil_volume": seuil_gv, "seuil_rendement": seuil_gr,
        "kpis": {
            "nb_gisements": len(liste),
            "volume_gisements": round(vol_gis, 2),
            "pct_volume_reseau": round(vol_gis / total_vol_reseau * 100, 2),
            "real_gisements": round(sum(x["real"] for x in liste), 2),
            "rendement_moyen": round(sum(x["rendement"] for x in liste) / len(liste), 4) if liste else 0,
        },
        "evolution": evolution,
        "pdvs": liste,
        "zones": sorted({x["zone"] for x in liste if x["zone"]}),
    }


# ══════════════════════════════════════════════════════════════════════════════
# RUPTURES · SUPERVISEURS · RÉTENTION · MOTEURS
# ══════════════════════════════════════════════════════════════════════════════
def _actif(p) -> bool:
    if p is None:
        return False
    return (int(getattr(p, "nb_operations", None) or 0) > 0) or \
           (float(getattr(p, "montant_transaction", None) or getattr(p, "ca", None) or 0) > 0)


def _en_rupture_ids(perf, ids, i_cur, m):
    """PDV sans aucune opération sur les m dernières périodes, mais actif avant."""
    res = set()
    for pid in ids:
        serie = perf.get(pid, {})
        if not serie:
            continue
        indices = [i_cur - k for k in range(min(m, i_cur + 1))]
        ops_recentes = sum(int(getattr(serie.get(i), "nb_operations", None) or 0) for i in indices if serie.get(i))
        plus_ancien = min(indices) if indices else 0
        ops_avant = sum(int(getattr(serie.get(i), "nb_operations", None) or 0) for i in range(0, plus_ancien) if serie.get(i))
        if ops_recentes == 0 and ops_avant > 0:
            res.add(pid)
    return res


@router.get("/analyse-perf/ruptures")
def analyse_ruptures(
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """PDV sans opération sur plus de N périodes (global, Top 100, zone, superviseur)."""
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    source_real = cfg.get("source_real", "agent")
    m = max(int(cfg.get("seuil_rupture_periodes", 2)), 1)
    periodes, perf = _charger(db, mode, max(int(cfg.get("nb_periodes", 4)), m + 1, 4))
    if not periodes:
        return {"pdvs": [], "seuil_periodes": m}
    i_cur = len(periodes) - 1
    pdvs = _pdvs_scope(db, current_user)
    pdv_map = {p.id: p for p in pdvs}
    ids = list(pdv_map.keys())

    rupt = _en_rupture_ids(perf, ids, i_cur, m)
    reals = {pid: _real(perf.get(pid, {}).get(i_cur), source_real) for pid in ids}
    top100 = sorted(ids, key=lambda x: reals.get(x, 0), reverse=True)[:100]

    liste = []
    for pid in rupt:
        pdv = pdv_map[pid]
        serie = perf.get(pid, {})
        derniere = None
        for i in range(len(periodes) - 1, -1, -1):
            if _actif(serie.get(i)):
                derniere = _label_periode(periodes[i])
                break
        real_perdu = reals.get(pid, 0)
        liste.append({
            "pdv_id": pid, "numero_pdv": pdv.numero_pdv, "nom": pdv.nom,
            "zone": pdv.zone, "superviseur": pdv.superviseur, "quartier": pdv.quartier,
            "derniere_activite": derniere, "real_reference": round(real_perdu, 2),
        })
    liste.sort(key=lambda x: x["real_reference"], reverse=True)

    def _grouper(champ):
        g = {}
        for pid in rupt:
            k = getattr(pdv_map[pid], champ) or "—"
            g[k] = g.get(k, 0) + 1
        return sorted([{"nom": k, "nb_ruptures": v} for k, v in g.items()], key=lambda x: -x["nb_ruptures"])

    actifs = len([pid for pid in ids if _actif(perf.get(pid, {}).get(i_cur))])
    return {
        "mode": mode, "seuil_periodes": m,
        "periode_courante": _label_periode(periodes[i_cur]),
        "nb_pdv_total": len(ids), "nb_actifs": actifs,
        "nb_ruptures": len(rupt),
        "taux_rupture": round(len(rupt) / len(ids) * 100, 2) if ids else 0,
        "ruptures_top100": len([x for x in top100 if x in rupt]),
        "pdvs": liste,
        "par_zone": _grouper("zone"),
        "par_superviseur": _grouper("superviseur"),
    }


@router.get("/analyse-perf/superviseurs")
def analyse_superviseurs(
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Score Superviseur /100 : objectif, rendement, productivité, activation+rétention, ruptures, qualité."""
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    source_real = cfg.get("source_real", "agent")
    n = max(int(cfg.get("nb_periodes", 4)), 2)
    m = max(int(cfg.get("seuil_rupture_periodes", 2)), 1)
    periodes, perf = _charger(db, mode, max(n + 1, m + 1, 4))
    if not periodes:
        return {"lignes": []}
    i_cur = len(periodes) - 1
    i_prev = i_cur - 1 if i_cur >= 1 else None
    pkey_cur = _period_key(periodes[i_cur])
    pdvs = _pdvs_scope(db, current_user)

    sc = cfg.get("score_superviseur") or {}
    poids = sc.get("poids") or {"objectif": 25, "rendement": 25, "productivite": 20,
                                "activation_retention": 15, "ruptures": 10, "qualite": 5}
    cible_rend = float(sc.get("cible_rendement", 0.26))
    cible_act = float(sc.get("cible_activation", 90))
    cible_rupt = float(sc.get("cible_rupture", 2))
    seuil_gr = float(cfg.get("seuil_gisement_rendement", 0.20))

    reseau = _agg(perf, [p.id for p in pdvs], i_cur, source_real)
    cible_vol_actif = reseau["volume_par_actif"] or 1

    groupes: Dict[str, List[int]] = {}
    for p in pdvs:
        groupes.setdefault(p.superviseur or "—", []).append(p.id)

    objectifs_cfg = cfg.get("objectifs") or {}
    lignes = []
    for sup, ids in groupes.items():
        mcur = _agg(perf, ids, i_cur, source_real)
        mprev = _agg(perf, ids, i_prev, source_real) if i_prev is not None else None
        act = round(mcur["actifs"] / len(ids) * 100, 2) if ids else 0

        prev_actifs = set(pid for pid in ids if _actif(perf.get(pid, {}).get(i_prev))) if i_prev is not None else set()
        cur_actifs = set(pid for pid in ids if _actif(perf.get(pid, {}).get(i_cur)))
        retention = round(len(prev_actifs & cur_actifs) / len(prev_actifs) * 100, 2) if prev_actifs else None
        nouveaux = len(cur_actifs - prev_actifs)
        perdus = len(prev_actifs - cur_actifs)

        rupt = _en_rupture_ids(perf, ids, i_cur, m)
        taux_rupt = round(len(rupt) / mcur["actifs"] * 100, 2) if mcur["actifs"] else 0

        best = max(_agg(perf, ids, i, source_real)["real"] for i in range(max(0, i_cur - n + 1), i_cur + 1))
        obj_auto = round(best * (1 + float(cfg.get("objectif_taux_croissance", 0.05))), 2)
        manuel = (objectifs_cfg.get(f"SUPERVISEUR:{sup}") or {}).get(pkey_cur)
        objectif = float(manuel) if manuel is not None else obj_auto

        qualite = round(len([pid for pid in cur_actifs
                             if _valeur_critere(perf.get(pid, {}).get(i_cur), "rendement", source_real) * 100 >= seuil_gr
                             ]) / len(cur_actifs) * 100, 2) if cur_actifs else 0

        s_obj = min(1.0, mcur["real"] / objectif) * poids["objectif"] if objectif > 0 else 0
        s_rend = min(1.0, (mcur["rendement"] * 100) / cible_rend) * poids["rendement"] if cible_rend > 0 else 0
        s_prod = min(1.0, mcur["volume_par_actif"] / cible_vol_actif) * poids["productivite"]
        s_act = (min(1.0, act / cible_act) * 0.6 +
                 (min(1.0, (retention or 0) / 100) * 0.4)) * poids["activation_retention"]
        s_rupt = max(0.0, 1 - taux_rupt / cible_rupt) * poids["ruptures"] if cible_rupt > 0 else poids["ruptures"]
        s_qual = (qualite / 100) * poids["qualite"]
        score = round(s_obj + s_rend + s_prod + s_act + s_rupt + s_qual, 1)

        lignes.append({
            "nom": sup, "nb_pdv": len(ids), "nb_actifs": mcur["actifs"], "activation": act,
            "retention": retention, "nouveaux": nouveaux, "perdus": perdus, "solde": nouveaux - perdus,
            "volume": mcur["volume"], "real": mcur["real"], "rendement": mcur["rendement"],
            "real_par_million": mcur["real_par_million"], "volume_par_actif": mcur["volume_par_actif"],
            "real_par_actif": mcur["real_par_actif"],
            "objectif": objectif, "taux_realisation": round(mcur["real"] / objectif * 100, 2) if objectif > 0 else 0,
            "nb_ruptures": len(rupt), "taux_rupture": taux_rupt, "qualite": qualite,
            "score": score,
            "score_detail": {"objectif": round(s_obj, 1), "rendement": round(s_rend, 1),
                             "productivite": round(s_prod, 1), "activation_retention": round(s_act, 1),
                             "ruptures": round(s_rupt, 1), "qualite": round(s_qual, 1)},
        })
    lignes.sort(key=lambda x: x["score"], reverse=True)
    return {
        "mode": mode, "periodes": [_label_periode(p) for p in periodes],
        "periode_courante": _label_periode(periodes[i_cur]),
        "poids": poids, "cible_rendement": cible_rend,
        "cible_activation": cible_act, "cible_rupture": cible_rupt,
        "cible_volume_par_actif": round(cible_vol_actif, 2),
        "reseau": {"activation": round(reseau["actifs"] / len(pdvs) * 100, 2) if pdvs else 0,
                   "volume_par_actif": reseau["volume_par_actif"], "rendement": reseau["rendement"]},
        "lignes": lignes,
    }


@router.get("/analyse-perf/retention")
def analyse_retention(
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rétention, réactivation et solde d'activation (réseau et par superviseur)."""
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    periodes, perf = _charger(db, mode, max(int(cfg.get("nb_periodes", 4)), 3))
    if len(periodes) < 2:
        return {"lignes": []}
    i_cur = len(periodes) - 1
    i_prev = i_cur - 1
    pdvs = _pdvs_scope(db, current_user)

    def _stats(ids):
        cur = set(pid for pid in ids if _actif(perf.get(pid, {}).get(i_cur)))
        prev = set(pid for pid in ids if _actif(perf.get(pid, {}).get(i_prev)))
        conserves = cur & prev
        nouveaux = cur - prev
        perdus = prev - cur
        retention = round(len(conserves) / len(prev) * 100, 2) if prev else None
        reactivation = round(len(nouveaux) / len(prev), 4) if prev else None  # ratio vs inactifs
        inactifs_prev = len(ids) - len(prev)
        taux_reactiv = round(len(nouveaux) / inactifs_prev * 100, 2) if inactifs_prev else None
        return {
            "actifs_prec": len(prev), "actifs_cur": len(cur),
            "conserves": len(conserves), "nouveaux": len(nouveaux), "perdus": len(perdus),
            "solde": len(nouveaux) - len(perdus),
            "retention": retention, "taux_reactivation": taux_reactiv,
        }

    groupes: Dict[str, List[int]] = {}
    for p in pdvs:
        groupes.setdefault(p.superviseur or "—", []).append(p.id)

    lignes = []
    for sup, ids in groupes.items():
        st = _stats(ids)
        st["nom"] = sup
        st["nb_pdv"] = len(ids)
        lignes.append(st)
    lignes.sort(key=lambda x: (x["solde"]), reverse=True)

    return {
        "mode": mode,
        "periode_courante": _label_periode(periodes[i_cur]),
        "periode_precedente": _label_periode(periodes[i_prev]),
        "reseau": _stats([p.id for p in pdvs]),
        "lignes": lignes,
    }


@router.get("/analyse-perf/moteurs")
def analyse_moteurs(
    mode: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Décomposition : Volume = actifs × tx/PDV × ticket moyen ; REAL = Volume × rendement."""
    cfg = _get_config(db)
    mode = (mode or cfg.get("mode") or "mensuel").lower()
    if mode not in ("mensuel", "hebdo"):
        mode = "mensuel"
    source_real = cfg.get("source_real", "agent")
    periodes, perf = _charger(db, mode, 3)
    if len(periodes) < 2:
        return {}
    i_cur = len(periodes) - 1
    i_prev = i_cur - 1
    pdvs = _pdvs_scope(db, current_user)
    ids = [p.id for p in pdvs]

    c = _agg(perf, ids, i_cur, source_real)
    p = _agg(perf, ids, i_prev, source_real)

    A0, A1 = p["actifs"], c["actifs"]
    T0 = p["operations"] / A0 if A0 else 0
    T1 = c["operations"] / A1 if A1 else 0
    P0 = p["volume"] / p["operations"] if p["operations"] else 0
    P1 = c["volume"] / c["operations"] if c["operations"] else 0
    R0, R1 = p["rendement"], c["rendement"]
    V0, V1 = p["volume"], c["volume"]
    REAL0, REAL1 = p["real"], c["real"]

    eff_a = (A1 - A0) * T0 * P0
    eff_t = A1 * (T1 - T0) * P0
    eff_p = A1 * T1 * (P1 - P0)
    eff_v = (V1 - V0) * R0
    eff_r = V1 * (R1 - R0)

    return {
        "mode": mode, "source_real": source_real,
        "periode_courante": _label_periode(periodes[i_cur]),
        "periode_precedente": _label_periode(periodes[i_prev]),
        "volume": {"prec": V0, "cur": V1, "delta": round(V1 - V0, 2),
                   "actifs": {"prec": A0, "cur": A1},
                   "transactions_par_actif": {"prec": round(T0, 2), "cur": round(T1, 2)},
                   "ticket_moyen": {"prec": round(P0, 2), "cur": round(P1, 2)},
                   "effet_actifs": round(eff_a, 2), "effet_transactions": round(eff_t, 2),
                   "effet_ticket": round(eff_p, 2)},
        "real": {"prec": REAL0, "cur": REAL1, "delta": round(REAL1 - REAL0, 2),
                 "rendement_prec": round(R0, 6), "rendement_cur": round(R1, 6),
                 "effet_volume": round(eff_v, 2), "effet_rendement": round(eff_r, 2)},
    }
