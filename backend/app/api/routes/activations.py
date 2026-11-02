"""
Suivi des PDV activés via la Prospection.

Menu « Suivi des activations » : pour chaque PDV issu d'une activation
prospection, on mesure sa production, son évolution depuis l'activation,
et s'il travaille ou non.

Règles validées :
  • période analysée  : à partir du mois d'activation
  • productif         : ≥ 30 opérations sur le dernier mois
  • endormi           : aucune opération depuis plus de 30 jours
  • mois antérieurs   : disponibles, mais derrière un bouton (non inclus par défaut)
"""
from __future__ import annotations

import io
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.core.database import get_db
from app.models.pdv import PDV, PDVStatut
from app.models.performance import MonthlyPerformance, WeeklyPerformance
from app.models.prospect import Prospect
from app.models.user import User

router = APIRouter()

ROLES_ACCES = {"admin", "manager", "rc", "conformite"}

SEUIL_OPS_PRODUCTIF = 30      # opérations sur le dernier mois
SEUIL_JOURS_ENDORMI = 30      # jours sans opération

LIBELLE_STATUT = {
    "JAMAIS_ACTIF": "Jamais actif",
    "ENDORMI": "Endormi",
    "FAIBLE": "Faible",
    "PRODUCTIF": "Productif",
}


def _role(user: User) -> str:
    return str(user.role).lower().replace("userrole.", "")


def _exiger_acces(user: User):
    if _role(user) not in ROLES_ACCES:
        raise HTTPException(
            status_code=403,
            detail="Accès réservé à l'encadrement (Admin, Manager, RC, Conformité).",
        )


# ── Utilitaires de dates ─────────────────────────────────────────────────────
def _fin_semaine(annee: int, semaine: int) -> Optional[date]:
    """Dimanche de la semaine ISO."""
    try:
        return date.fromisocalendar(annee, semaine, 7)
    except (ValueError, TypeError):
        return None


def _mois_en_liste(debut: tuple, fin: tuple) -> List[tuple]:
    """Liste des (annee, mois) de `debut` à `fin` inclus."""
    (a, m), (af, mf) = debut, fin
    out = []
    while (a, m) <= (af, mf):
        out.append((a, m))
        m += 1
        if m > 12:
            m = 1
            a += 1
    return out


def _anciennete(date_activation: Optional[date]) -> Dict[str, Any]:
    if not date_activation:
        return {"jours": None, "label": "—", "mois": None}
    jours = (date.today() - date_activation).days
    mois = jours // 30
    reste = jours - mois * 30
    if jours < 0:
        return {"jours": jours, "label": "date future", "mois": None}
    if mois == 0:
        label = f"{jours} jour(s)"
    else:
        label = f"{mois} mois et {reste} j"
    return {"jours": jours, "label": label, "mois": mois}


def _pct(avant: float, apres: float) -> Optional[float]:
    if avant and avant > 0:
        return round((apres - avant) / avant * 100, 1)
    return None


def _statut(ops_total: int, ops_dernier: int, jours_sans: Optional[int]) -> str:
    if ops_total == 0:
        return "JAMAIS_ACTIF"
    if jours_sans is not None and jours_sans > SEUIL_JOURS_ENDORMI:
        return "ENDORMI"
    if ops_dernier < SEUIL_OPS_PRODUCTIF:
        return "FAIBLE"
    return "PRODUCTIF"


# ── Construction des données ─────────────────────────────────────────────────
def _construire(db: Session) -> Dict[str, Any]:
    prospects = (
        db.query(Prospect)
        .filter(Prospect.status == "PUCE_ACTIVEE", Prospect.activated_pdv_id.isnot(None))
        .all()
    )
    pdv_ids = list({p.activated_pdv_id for p in prospects if p.activated_pdv_id})
    if not pdv_ids:
        return {"pdvs": [], "dernier_mois": None, "mois_disponibles": []}

    pdvs = {p.id: p for p in db.query(PDV).filter(PDV.id.in_(pdv_ids)).all()}

    # Performances mensuelles
    mensuel: Dict[int, Dict[tuple, MonthlyPerformance]] = {}
    for mp in db.query(MonthlyPerformance).filter(MonthlyPerformance.pdv_id.in_(pdv_ids)).all():
        mensuel.setdefault(mp.pdv_id, {})[(mp.annee, mp.mois)] = mp

    # Performances hebdomadaires (pour la récence)
    hebdo: Dict[int, List[WeeklyPerformance]] = {}
    for w in db.query(WeeklyPerformance).filter(WeeklyPerformance.pdv_id.in_(pdv_ids)).all():
        hebdo.setdefault(w.pdv_id, []).append(w)

    # Dernier mois disponible au niveau réseau
    dernier = db.query(
        func.max(MonthlyPerformance.annee * 100 + MonthlyPerformance.mois)
    ).scalar()
    if dernier:
        dernier_mois = (int(dernier) // 100, int(dernier) % 100)
    else:
        aujourd_hui = date.today()
        dernier_mois = (aujourd_hui.year, aujourd_hui.month)

    lignes = []
    for pr in prospects:
        pdv = pdvs.get(pr.activated_pdv_id)
        if pdv is None or pdv.statut == PDVStatut.DESACTIVE:
            continue

        date_activation = pr.activated_at.date() if isinstance(pr.activated_at, datetime) else pr.activated_at
        if not date_activation:
            continue
        mois_activation = (date_activation.year, date_activation.month)

        perfs = mensuel.get(pdv.id, {})
        # Mois pris en compte : de l'activation au dernier mois disponible
        fin = max(dernier_mois, mois_activation)
        periode = _mois_en_liste(mois_activation, fin)
        serie = []
        for (a, m) in periode:
            mp = perfs.get((a, m))
            serie.append({
                "annee": a,
                "mois": m,
                "ca": round(mp.montant_transaction or 0, 2) if mp else 0.0,
                "operations": int(mp.nb_operations or 0) if mp else 0,
                "actif": bool(mp.est_actif) if mp else False,
            })

        # Mois antérieurs à l'activation (affichés à la demande)
        anterieurs = []
        for (a, m) in sorted(perfs.keys()):
            if (a, m) >= mois_activation:
                continue
            mp = perfs[(a, m)]
            anterieurs.append({
                "annee": a, "mois": m,
                "ca": round(mp.montant_transaction or 0, 2),
                "operations": int(mp.nb_operations or 0),
            })

        # Première / dernière opération (données hebdomadaires)
        semaines = hebdo.get(pdv.id, [])
        actives = [w for w in semaines if (w.nb_operations or 0) > 0]
        premiere_date = derniere_date = None
        if actives:
            w_min = min(actives, key=lambda w: (w.annee, w.semaine))
            w_max = max(actives, key=lambda w: (w.annee, w.semaine))
            premiere_date = _fin_semaine(w_min.annee, w_min.semaine)
            derniere_date = _fin_semaine(w_max.annee, w_max.semaine)

        delai_demarrage = None
        if premiere_date and premiere_date >= date_activation:
            delai_demarrage = (premiere_date - date_activation).days

        jours_sans_operation = None
        if derniere_date:
            jours_sans_operation = max(0, (date.today() - derniere_date).days)

        total_ca = sum(x["ca"] for x in serie)
        total_ops = sum(x["operations"] for x in serie)
        dernier_mois_serie = serie[-1] if serie else {"ca": 0, "operations": 0}
        avant_dernier = serie[-2] if len(serie) >= 2 else None

        evolution = _pct(avant_dernier["ca"], dernier_mois_serie["ca"]) if avant_dernier else None

        # Tendance : 3 derniers mois strictement croissants
        en_croissance = False
        ca3 = [x["ca"] for x in serie[-3:]]
        if len(ca3) == 3 and ca3[0] > 0 and ca3[0] < ca3[1] < ca3[2]:
            en_croissance = True
        en_baisse = False
        if len(ca3) == 3 and ca3[0] > 0 and ca3[0] > ca3[1] > ca3[2]:
            en_baisse = True

        statut = _statut(total_ops, dernier_mois_serie["operations"], jours_sans_operation)

        dev = pr.puce_assigned_to or pr.visit_assigned_to or pr.submitted_by

        lignes.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "sous_zone": pdv.sous_zone,
            "quartier": pdv.quartier,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "telephone": pdv.telephone,
            "statut_pdv": pdv.statut.value if pdv.statut else None,
            "date_activation": date_activation.isoformat(),
            "mois_activation": f"{mois_activation[1]:02d}/{mois_activation[0]}",
            "anciennete": _anciennete(date_activation),
            "delai_demarrage_jours": delai_demarrage,
            "jours_sans_operation": jours_sans_operation,
            "statut_activation": statut,
            "statut_label": LIBELLE_STATUT[statut],
            "en_croissance": en_croissance,
            "en_baisse": en_baisse,
            "total_ca": round(total_ca, 2),
            "total_operations": total_ops,
            "panier_moyen": round(total_ca / total_ops, 2) if total_ops else 0.0,
            "ca_dernier_mois": dernier_mois_serie["ca"],
            "operations_dernier_mois": dernier_mois_serie["operations"],
            "evolution_pct": evolution,
            "serie": serie,
            "mois_anterieurs": anterieurs,
            "nb_mois_anterieurs": len(anterieurs),
            "developpeur": f"{dev.prenom or ''} {dev.nom or ''}".strip() if dev else None,
            "prospect_reference": pr.reference,
        })

    lignes.sort(key=lambda x: (x["statut_activation"] != "JAMAIS_ACTIF",
                               x["jours_sans_operation"] or 0,
                               -x["total_ca"]), reverse=False)
    return {"pdvs": lignes, "dernier_mois": dernier_mois, "mois_disponibles": []}


def _filtrer(lignes: List[dict], **f) -> List[dict]:
    out = lignes
    if f.get("search"):
        t = f["search"].lower()
        out = [l for l in out if t in (l["nom"] or "").lower()
               or t in (l["numero_pdv"] or "").lower()
               or t in (l["superviseur"] or "").lower()]
    if f.get("statut"):
        out = [l for l in out if l["statut_activation"] == f["statut"]]
    if f.get("zone"):
        out = [l for l in out if l["zone"] == f["zone"]]
    if f.get("superviseur"):
        out = [l for l in out if l["superviseur"] == f["superviseur"]]
    if f.get("developpeur"):
        out = [l for l in out if l["developpeur"] == f["developpeur"]]
    if f.get("cohorte"):
        out = [l for l in out if l["mois_activation"] == f["cohorte"]]
    return out


@router.get("/activations")
def lister_activations(
    search: Optional[str] = Query(None),
    statut: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    superviseur: Optional[str] = Query(None),
    developpeur: Optional[str] = Query(None),
    cohorte: Optional[str] = Query(None, description="MM/AAAA du mois d'activation"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    data = _construire(db)
    lignes = _filtrer(data["pdvs"], search=search, statut=statut, zone=zone,
                      superviseur=superviseur, developpeur=developpeur, cohorte=cohorte)

    toutes = data["pdvs"]
    valeurs = {
        "zones": sorted({l["zone"] for l in toutes if l["zone"]}),
        "superviseurs": sorted({l["superviseur"] for l in toutes if l["superviseur"]}),
        "developpeurs": sorted({l["developpeur"] for l in toutes if l["developpeur"]}),
        "cohortes": sorted({l["mois_activation"] for l in toutes},
                           key=lambda c: (c[3:], c[:2])),
    }
    return {
        "total": len(lignes),
        "dernier_mois": f"{data['dernier_mois'][1]:02d}/{data['dernier_mois'][0]}" if data["dernier_mois"] else None,
        "items": lignes,
        "filtres": valeurs,
    }


@router.get("/activations/synthese")
def synthese_activations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """KPI de pilotage : statuts, survie 30/60/90 jours, cohortes, développeurs."""
    _exiger_acces(current_user)
    lignes = _construire(db)["pdvs"]

    total = len(lignes)
    par_statut = {k: 0 for k in LIBELLE_STATUT}
    for l in lignes:
        par_statut[l["statut_activation"]] += 1

    def survie(jours: int) -> Optional[float]:
        concernes = [l for l in lignes
                     if l["anciennete"]["jours"] is not None and l["anciennete"]["jours"] >= jours]
        if not concernes:
            return None
        actifs = [l for l in concernes
                  if l["jours_sans_operation"] is not None and l["jours_sans_operation"] <= jours]
        return round(len(actifs) / len(concernes) * 100, 1)

    cohortes: Dict[str, dict] = {}
    for l in lignes:
        c = cohortes.setdefault(l["mois_activation"], {"cohorte": l["mois_activation"], "nb": 0,
                                                       "productifs": 0, "jamais_actifs": 0,
                                                       "ca": 0.0, "ops": 0})
        c["nb"] += 1
        c["ca"] += l["total_ca"]
        c["ops"] += l["total_operations"]
        if l["statut_activation"] == "PRODUCTIF":
            c["productifs"] += 1
        if l["statut_activation"] == "JAMAIS_ACTIF":
            c["jamais_actifs"] += 1

    devs: Dict[str, dict] = {}
    for l in lignes:
        d = devs.setdefault(l["developpeur"] or "—", {"developpeur": l["developpeur"] or "—",
                                                      "nb": 0, "productifs": 0, "jamais_actifs": 0,
                                                      "ca": 0.0})
        d["nb"] += 1
        d["ca"] += l["total_ca"]
        if l["statut_activation"] == "PRODUCTIF":
            d["productifs"] += 1
        if l["statut_activation"] == "JAMAIS_ACTIF":
            d["jamais_actifs"] += 1

    return {
        "total": total,
        "par_statut": par_statut,
        "survie": {"j30": survie(30), "j60": survie(60), "j90": survie(90)},
        "cohortes": sorted(cohortes.values(), key=lambda c: (c["cohorte"][3:], c["cohorte"][:2])),
        "developpeurs": sorted(devs.values(), key=lambda d: -d["nb"]),
        "delai_moyen_demarrage": round(
            sum(l["delai_demarrage_jours"] for l in lignes if l["delai_demarrage_jours"] is not None)
            / max(1, sum(1 for l in lignes if l["delai_demarrage_jours"] is not None)), 1),
    }


# ── Export Excel ─────────────────────────────────────────────────────────────
ORANGE = "FF6900"


def _entete(ws, ligne: int, titres: List[str]):
    for i, t in enumerate(titres, 1):
        c = ws.cell(row=ligne, column=i, value=t)
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.fill = PatternFill("solid", fgColor=ORANGE)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[ligne].height = 30


@router.get("/activations/export.xlsx")
def exporter_activations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    lignes = _construire(db)["pdvs"]

    wb = Workbook()

    # 1. Synthèse
    ws = wb.active
    ws.title = "Synthèse"
    ws["A1"] = "SUIVI DES PDV ACTIVÉS — PROSPECTION"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"Édité le {date.today().strftime('%d/%m/%Y')}"
    ws["A2"].font = Font(italic=True, size=9, color="666666")

    _entete(ws, 4, ["Indicateur", "Valeur"])
    kpis = [
        ("PDV activés", len(lignes)),
        ("Productifs", sum(1 for l in lignes if l["statut_activation"] == "PRODUCTIF")),
        ("Faibles", sum(1 for l in lignes if l["statut_activation"] == "FAIBLE")),
        ("Endormis", sum(1 for l in lignes if l["statut_activation"] == "ENDORMI")),
        ("Jamais actifs", sum(1 for l in lignes if l["statut_activation"] == "JAMAIS_ACTIF")),
        ("CA cumulé", round(sum(l["total_ca"] for l in lignes), 0)),
        ("Opérations cumulées", sum(l["total_operations"] for l in lignes)),
    ]
    for i, (k, v) in enumerate(kpis, start=5):
        ws.cell(row=i, column=1, value=k).font = Font(bold=True)
        ws.cell(row=i, column=2, value=v)

    r = 5 + len(kpis) + 2
    ws.cell(row=r, column=1, value="PAR COHORTE D'ACTIVATION").font = Font(bold=True, size=11)
    _entete(ws, r + 1, ["Cohorte", "PDV", "Productifs", "Jamais actifs", "CA", "Opérations"])
    cohortes = {}
    for l in lignes:
        c = cohortes.setdefault(l["mois_activation"], {"nb": 0, "prod": 0, "jamais": 0, "ca": 0, "ops": 0})
        c["nb"] += 1; c["ca"] += l["total_ca"]; c["ops"] += l["total_operations"]
        if l["statut_activation"] == "PRODUCTIF": c["prod"] += 1
        if l["statut_activation"] == "JAMAIS_ACTIF": c["jamais"] += 1
    rr = r + 2
    for co, c in sorted(cohortes.items(), key=lambda x: (x[0][3:], x[0][:2])):
        ws.cell(row=rr, column=1, value=co)
        ws.cell(row=rr, column=2, value=c["nb"])
        ws.cell(row=rr, column=3, value=c["prod"])
        ws.cell(row=rr, column=4, value=c["jamais"])
        ws.cell(row=rr, column=5, value=round(c["ca"], 0))
        ws.cell(row=rr, column=6, value=c["ops"])
        rr += 1
    for col, w in {1: 30, 2: 10, 3: 12, 4: 14, 5: 18, 6: 12}.items():
        ws.column_dimensions[get_column_letter(col)].width = w

    # 2. Liste détaillée
    ws2 = wb.create_sheet("Liste")
    _entete(ws2, 1, ["N° PDV", "Nom", "Zone", "Superviseur", "Développeur",
                     "Activé le", "Ancienneté", "Cohorte", "Statut",
                     "Délai démarrage (j)", "Jours sans opération",
                     "CA cumulé", "Opérations cumulées", "Panier moyen",
                     "CA dernier mois", "Opérations dernier mois", "Évolution %"])
    for i, l in enumerate(lignes, start=2):
        ws2.cell(row=i, column=1, value=l["numero_pdv"])
        ws2.cell(row=i, column=2, value=l["nom"])
        ws2.cell(row=i, column=3, value=l["zone"])
        ws2.cell(row=i, column=4, value=l["superviseur"])
        ws2.cell(row=i, column=5, value=l["developpeur"])
        ws2.cell(row=i, column=6, value=l["date_activation"])
        ws2.cell(row=i, column=7, value=l["anciennete"]["label"])
        ws2.cell(row=i, column=8, value=l["mois_activation"])
        ws2.cell(row=i, column=9, value=l["statut_label"])
        ws2.cell(row=i, column=10, value=l["delai_demarrage_jours"])
        ws2.cell(row=i, column=11, value=l["jours_sans_operation"])
        ws2.cell(row=i, column=12, value=round(l["total_ca"], 0))
        ws2.cell(row=i, column=13, value=l["total_operations"])
        ws2.cell(row=i, column=14, value=round(l["panier_moyen"], 0))
        ws2.cell(row=i, column=15, value=round(l["ca_dernier_mois"], 0))
        ws2.cell(row=i, column=16, value=l["operations_dernier_mois"])
        ws2.cell(row=i, column=17, value=l["evolution_pct"])
    largeurs = {1: 12, 2: 30, 3: 12, 4: 24, 5: 24, 6: 12, 7: 16, 8: 10, 9: 14,
                10: 18, 11: 20, 12: 16, 13: 18, 14: 14, 15: 16, 16: 20, 17: 12}
    for col, w in largeurs.items():
        ws2.column_dimensions[get_column_letter(col)].width = w
    ws2.freeze_panes = "C2"
    ws2.auto_filter.ref = f"A1:Q{max(len(lignes) + 1, 2)}"

    # 3. Évolution mensuelle
    ws3 = wb.create_sheet("Évolution")
    _entete(ws3, 1, ["N° PDV", "Nom", "Mois", "CA", "Opérations", "Actif"])
    r = 2
    for l in lignes:
        for m in l["serie"]:
            ws3.cell(row=r, column=1, value=l["numero_pdv"])
            ws3.cell(row=r, column=2, value=l["nom"])
            ws3.cell(row=r, column=3, value=f"{m['mois']:02d}/{m['annee']}")
            ws3.cell(row=r, column=4, value=round(m["ca"], 0))
            ws3.cell(row=r, column=5, value=m["operations"])
            ws3.cell(row=r, column=6, value="Oui" if m["actif"] else "Non")
            r += 1
    for col, w in {1: 12, 2: 30, 3: 10, 4: 16, 5: 12, 6: 8}.items():
        ws3.column_dimensions[get_column_letter(col)].width = w
    ws3.freeze_panes = "A2"
    ws3.auto_filter.ref = f"A1:F{max(r - 1, 2)}"

    flux = io.BytesIO()
    wb.save(flux)
    flux.seek(0)
    return StreamingResponse(
        flux,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="activations_prospection_{date.today().strftime("%Y%m%d")}.xlsx"'},
    )
