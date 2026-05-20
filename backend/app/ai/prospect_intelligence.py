"""
Module d'Intelligence Artificielle pour la Prospection OM.
==========================================================
Fournit 4 services :
  1. score_prospect()         → score 0-100 + breakdown des facteurs
  2. recommendation()         → Go / Conditional / No-Go avec justification
  3. predict_revenue()        → CA prévisionnel (3 premiers mois)
  4. find_duplicates()        → détection de fiches similaires (nom/tel/adresse/GPS)

Approche : règles métier + heuristiques pondérées (pas de modèle ML lourd).
Tous les calculs sont déterministes et explicables (XAI).
"""
from __future__ import annotations

import math
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.models.prospect import (
    Prospect, ProspectStatus, FrequentationLevel, LocalType,
)
from app.models.pdv import PDV


# ─────────────────────────────────────────────────────────────────────────────
# Constantes & barèmes (tunables)
# ─────────────────────────────────────────────────────────────────────────────
WEIGHTS = {
    "frequentation":   25,   # Très fréquentée +25, Moyenne +12, Faible +3
    "capital":         20,   # >= 200k → +20, 100-199k → +12, 50-99k → +6
    "om_history":      20,   # CA mensuel passé / commission
    "concurrence":     15,   # nb concurrents (-) ; densité PDV Orange (+/-)
    "completeness":    10,   # qualité de la fiche (champs remplis)
    "local_type":      10,   # Boutique fixe > Kiosque > Table > Mobile
}
TOTAL_WEIGHT = sum(WEIGHTS.values())  # = 100

# Seuils Go / Conditional / No-Go
GO_THRESHOLD = 70
NOGO_THRESHOLD = 40

# Rayon (km) de "zone" pour mesurer la densité PDV
ZONE_RADIUS_KM = 1.5

# Rayon pour considérer 2 GPS comme "même point"
DUP_GPS_RADIUS_KM = 0.05  # 50m


# ─────────────────────────────────────────────────────────────────────────────
# Helpers GPS
# ─────────────────────────────────────────────────────────────────────────────
def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Distance Haversine (en km) entre deux points GPS."""
    if None in (lat1, lon1, lat2, lon2):
        return float("inf")
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalize(s: Optional[str]) -> str:
    """Normalisation simple pour matching (accents, casse, espaces)."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s.strip().lower())
    return s


def _normalize_phone(p: Optional[str]) -> str:
    if not p:
        return ""
    return re.sub(r"\D", "", p)[-8:]  # 8 derniers chiffres (Mali)


# ─────────────────────────────────────────────────────────────────────────────
# 1. SCORING — score 0-100
# ─────────────────────────────────────────────────────────────────────────────
def _score_frequentation(p: Prospect) -> Tuple[float, str]:
    if p.frequentation == FrequentationLevel.TRES_FREQUENTE:
        return WEIGHTS["frequentation"], "Lieu très fréquenté"
    if p.frequentation == FrequentationLevel.MOYENNE:
        return WEIGHTS["frequentation"] * 0.6, "Fréquentation moyenne"
    if p.frequentation == FrequentationLevel.FAIBLE:
        return WEIGHTS["frequentation"] * 0.2, "Lieu peu fréquenté (risque)"
    return WEIGHTS["frequentation"] * 0.4, "Fréquentation non renseignée"


def _score_capital(p: Prospect) -> Tuple[float, str]:
    if p.fait_om:
        # Pas pertinent pour les anciens OM (on évalue via om_history)
        return WEIGHTS["capital"] * 0.6, "Profil ancien OM (capital sans objet)"
    cap = p.capital_demarrage or 0
    if cap >= 200_000:
        return WEIGHTS["capital"], f"Capital solide ({cap:,.0f} F)"
    if cap >= 100_000:
        return WEIGHTS["capital"] * 0.6, f"Capital moyen ({cap:,.0f} F)"
    if cap >= 50_000:
        return WEIGHTS["capital"] * 0.3, f"Capital faible ({cap:,.0f} F)"
    return 0, "Capital insuffisant"


def _score_om_history(p: Prospect) -> Tuple[float, str]:
    if not p.fait_om:
        # Nouveau venu : neutre
        return WEIGHTS["om_history"] * 0.5, "Nouveau prospect (sans historique)"
    ca = p.om_ca_mensuel or 0
    com = p.om_commission_mensuelle or 0
    if ca >= 1_500_000 or com >= 60_000:
        return WEIGHTS["om_history"], f"Excellent historique OM (CA {ca:,.0f} F)"
    if ca >= 700_000 or com >= 30_000:
        return WEIGHTS["om_history"] * 0.7, f"Bon historique OM (CA {ca:,.0f} F)"
    if ca >= 200_000:
        return WEIGHTS["om_history"] * 0.4, f"Historique OM modeste"
    return WEIGHTS["om_history"] * 0.2, "Historique OM faible"


def _score_concurrence(db: Session, p: Prospect) -> Tuple[float, str]:
    """Pénalise si beaucoup de concurrents directs ; bonus si zone Orange peu dense."""
    pts = WEIGHTS["concurrence"]
    msgs = []
    nb_conc = len(p.concurrents or [])
    if nb_conc == 0:
        msgs.append("Pas de concurrent direct")
    else:
        penalty = min(nb_conc * 0.25, 0.7)  # max -70%
        pts *= (1 - penalty)
        msgs.append(f"{nb_conc} concurrent(s) présent(s)")

    # Densité PDV Orange dans la zone (cherche un sur-quotient = bon, pas saturé = bonus)
    if p.latitude and p.longitude:
        nb_pdv_orange = _count_orange_pdv_nearby(db, p.latitude, p.longitude)
        if nb_pdv_orange == 0:
            pts += 2  # zone vierge = opportunité
            msgs.append("Zone Orange vierge (opportunité)")
        elif nb_pdv_orange >= 8:
            pts *= 0.5
            msgs.append(f"Zone Orange saturée ({nb_pdv_orange} PDV)")
        else:
            msgs.append(f"{nb_pdv_orange} PDV Orange dans la zone")

    pts = max(0, min(WEIGHTS["concurrence"], pts))
    return pts, " · ".join(msgs)


def _count_orange_pdv_nearby(db: Session, lat: float, lng: float) -> int:
    """Comptage rapide via bounding box, puis filtrage Haversine."""
    delta = ZONE_RADIUS_KM / 111.0
    candidates = db.query(PDV).filter(
        PDV.latitude.between(lat - delta, lat + delta),
        PDV.longitude.between(lng - delta, lng + delta),
    ).all()
    return sum(
        1 for x in candidates
        if x.latitude and x.longitude
        and _haversine_km(lat, lng, x.latitude, x.longitude) <= ZONE_RADIUS_KM
    )


def _score_completeness(p: Prospect) -> Tuple[float, str]:
    fields = [
        p.nom, p.prenom, p.telephone_principal, p.quartier, p.adresse,
        p.piece_identite_type, p.piece_identite_numero,
        p.latitude, p.longitude, p.type_local, p.frequentation,
    ]
    filled = sum(1 for f in fields if f not in (None, ""))
    pct = filled / len(fields)
    return WEIGHTS["completeness"] * pct, f"Fiche {pct*100:.0f}% complète"


def _score_local_type(p: Prospect) -> Tuple[float, str]:
    mapping = {
        LocalType.BOUTIQUE_FIXE: 1.0,
        LocalType.KIOSQUE:       0.7,
        LocalType.TABLE:         0.4,
        LocalType.MOBILE:        0.2,
        LocalType.AUTRE:         0.5,
    }
    coef = mapping.get(p.type_local, 0.5)
    label = p.type_local.value if p.type_local else "non renseigné"
    return WEIGHTS["local_type"] * coef, f"Type local : {label}"


def score_prospect(db: Session, p: Prospect) -> Dict[str, Any]:
    """Renvoie un score 0-100 + breakdown des facteurs (explainable)."""
    factors = []
    total = 0.0

    for fn, key in [
        (_score_frequentation, "frequentation"),
        (_score_capital,       "capital"),
        (_score_om_history,    "om_history"),
        (_score_completeness,  "completeness"),
        (_score_local_type,    "local_type"),
    ]:
        pts, msg = fn(p)
        factors.append({"key": key, "max": WEIGHTS[key], "points": round(pts, 1), "reason": msg})
        total += pts

    pts, msg = _score_concurrence(db, p)
    factors.append({"key": "concurrence", "max": WEIGHTS["concurrence"], "points": round(pts, 1), "reason": msg})
    total += pts

    score = round(min(100, max(0, total)), 1)
    return {
        "score": score,
        "factors": factors,
        "label": _score_label(score),
    }


def _score_label(score: float) -> str:
    if score >= 80: return "Excellent"
    if score >= 65: return "Bon"
    if score >= 50: return "Acceptable"
    if score >= 35: return "Faible"
    return "Critique"


# ─────────────────────────────────────────────────────────────────────────────
# 2. RECOMMANDATION Go / No-Go
# ─────────────────────────────────────────────────────────────────────────────
def recommendation(db: Session, p: Prospect) -> Dict[str, Any]:
    s = score_prospect(db, p)
    score = s["score"]

    if score >= GO_THRESHOLD:
        decision, color = "GO", "#10b981"
        msg = f"Profil très solide (score {score}/100). Approbation recommandée."
    elif score < NOGO_THRESHOLD:
        decision, color = "NO_GO", "#ef4444"
        msg = f"Profil à risque (score {score}/100). Refus recommandé."
    else:
        decision, color = "CONDITIONAL", "#eab308"
        msg = f"Profil mitigé (score {score}/100). Investigation complémentaire."

    # Top 2 forces / faiblesses
    sorted_factors = sorted(s["factors"], key=lambda f: f["points"] / max(f["max"], 1), reverse=True)
    strengths = [f for f in sorted_factors[:2]]
    weaknesses = [f for f in sorted_factors[-2:]]

    return {
        "decision": decision,
        "color": color,
        "score": score,
        "label": s["label"],
        "message": msg,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "factors": s["factors"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. PRÉDICTION CA (3 premiers mois)
# ─────────────────────────────────────────────────────────────────────────────
def predict_revenue(db: Session, p: Prospect) -> Dict[str, Any]:
    """
    Estime le CA mensuel sur les 3 premiers mois.
    Heuristique :
      - base = CA moyen de la zone (PDV proches), sinon défaut 400 000 F
      - ajusté par fréquentation, type local et concurrence
      - effet rampe : 50% M1, 80% M2, 100% M3
    """
    base = _zone_baseline_ca(db, p) or 400_000

    coef_freq = {
        FrequentationLevel.TRES_FREQUENTE: 1.4,
        FrequentationLevel.MOYENNE: 1.0,
        FrequentationLevel.FAIBLE: 0.5,
    }.get(p.frequentation, 0.9)

    coef_local = {
        LocalType.BOUTIQUE_FIXE: 1.2,
        LocalType.KIOSQUE: 1.0,
        LocalType.TABLE: 0.7,
        LocalType.MOBILE: 0.5,
        LocalType.AUTRE: 0.8,
    }.get(p.type_local, 0.9)

    coef_conc = max(0.6, 1 - 0.1 * len(p.concurrents or []))
    coef_om = 1.3 if (p.fait_om and (p.om_ca_mensuel or 0) > 700_000) else 1.0

    # Si historique OM existant, ancrer la base sur lui
    if p.fait_om and p.om_ca_mensuel:
        base = (base + p.om_ca_mensuel) / 2

    target = base * coef_freq * coef_local * coef_conc * coef_om

    forecast = [
        {"month": 1, "ca": round(target * 0.50)},
        {"month": 2, "ca": round(target * 0.80)},
        {"month": 3, "ca": round(target * 1.00)},
    ]
    confidence = "HIGH" if (p.latitude and p.frequentation and p.type_local) else "MEDIUM"
    if not (p.fait_om or p.frequentation):
        confidence = "LOW"

    return {
        "base_zone_ca": round(base),
        "coefficients": {
            "frequentation": round(coef_freq, 2),
            "local_type": round(coef_local, 2),
            "concurrence": round(coef_conc, 2),
            "om_history": round(coef_om, 2),
        },
        "forecast": forecast,
        "ca_total_3m": sum(f["ca"] for f in forecast),
        "ca_target_m3": round(target),
        "confidence": confidence,
    }


def _zone_baseline_ca(db: Session, p: Prospect) -> Optional[float]:
    """CA moyen actuel des PDV proches (si dispo dans la table performance)."""
    if not (p.latitude and p.longitude):
        return None
    delta = ZONE_RADIUS_KM / 111.0
    nearby = db.query(PDV).filter(
        PDV.latitude.between(p.latitude - delta, p.latitude + delta),
        PDV.longitude.between(p.longitude - delta, p.longitude + delta),
    ).all()
    cas = []
    for x in nearby:
        if not (x.latitude and x.longitude):
            continue
        if _haversine_km(p.latitude, p.longitude, x.latitude, x.longitude) > ZONE_RADIUS_KM:
            continue
        # Si tu as un champ ca_mensuel sur PDV, on le prend
        ca = getattr(x, "ca_mensuel", None) or getattr(x, "ca_moyen", None)
        if ca:
            cas.append(float(ca))
    if not cas:
        return None
    return sum(cas) / len(cas)


# ─────────────────────────────────────────────────────────────────────────────
# 4. DÉTECTION DE DOUBLONS
# ─────────────────────────────────────────────────────────────────────────────
def find_duplicates(db: Session, p: Prospect) -> List[Dict[str, Any]]:
    """Cherche d'autres prospects similaires (téléphone, nom, GPS, adresse)."""
    candidates = db.query(Prospect).filter(Prospect.id != p.id).all()
    norm_phone = _normalize_phone(p.telephone_principal)
    norm_phone2 = _normalize_phone(p.telephone_secondaire)
    norm_nom = _normalize(p.nom)
    norm_prenom = _normalize(p.prenom)
    norm_quartier = _normalize(p.quartier)

    results = []
    for c in candidates:
        score = 0
        reasons = []

        # Téléphone (poids fort)
        cph1, cph2 = _normalize_phone(c.telephone_principal), _normalize_phone(c.telephone_secondaire)
        if norm_phone and norm_phone in (cph1, cph2):
            score += 50; reasons.append("Téléphone principal identique")
        elif norm_phone2 and norm_phone2 in (cph1, cph2) and norm_phone2:
            score += 30; reasons.append("Téléphone secondaire identique")

        # Nom + prénom
        if norm_nom and norm_nom == _normalize(c.nom):
            score += 15; reasons.append("Même nom")
        if norm_prenom and norm_prenom == _normalize(c.prenom):
            score += 15; reasons.append("Même prénom")

        # Quartier identique
        if norm_quartier and norm_quartier == _normalize(c.quartier):
            score += 5; reasons.append("Même quartier")

        # GPS très proche
        if p.latitude and c.latitude:
            d = _haversine_km(p.latitude, p.longitude, c.latitude, c.longitude)
            if d <= DUP_GPS_RADIUS_KM:
                score += 25; reasons.append(f"GPS très proche ({int(d*1000)} m)")
            elif d <= 0.2:
                score += 10; reasons.append(f"GPS proche ({int(d*1000)} m)")

        # Pièce d'identité identique (forte indication)
        if p.piece_identite_numero and p.piece_identite_numero == c.piece_identite_numero:
            score += 40; reasons.append("Pièce d'identité identique")

        if score >= 25:
            results.append({
                "id": c.id,
                "reference": c.reference,
                "nom": c.nom, "prenom": c.prenom,
                "telephone": c.telephone_principal,
                "quartier": c.quartier,
                "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
                "match_score": min(100, score),
                "reasons": reasons,
            })
    results.sort(key=lambda x: x["match_score"], reverse=True)
    return results[:10]


# ─────────────────────────────────────────────────────────────────────────────
# Vue agrégée pour le dashboard IA
# ─────────────────────────────────────────────────────────────────────────────
def overview(db: Session) -> Dict[str, Any]:
    """Statistiques pour l'onglet 'Vue IA' : top GO, top NoGo, distribution."""
    actifs = db.query(Prospect).filter(Prospect.status.notin_([
        ProspectStatus.PUCE_ACTIVEE, ProspectStatus.REFUSEE_RC, ProspectStatus.ANNULEE,
    ])).all()

    scored = []
    for p in actifs:
        rec = recommendation(db, p)
        scored.append({
            "id": p.id, "reference": p.reference,
            "nom": p.nom, "prenom": p.prenom,
            "quartier": p.quartier, "status": p.status.value,
            "score": rec["score"], "decision": rec["decision"],
            "label": rec["label"],
        })

    distribution = {"GO": 0, "CONDITIONAL": 0, "NO_GO": 0}
    for s in scored:
        distribution[s["decision"]] += 1

    top_go = sorted([s for s in scored if s["decision"] == "GO"],
                    key=lambda x: x["score"], reverse=True)[:5]
    top_nogo = sorted([s for s in scored if s["decision"] == "NO_GO"],
                      key=lambda x: x["score"])[:5]
    avg = round(sum(s["score"] for s in scored) / len(scored), 1) if scored else 0

    return {
        "total_evalues": len(scored),
        "score_moyen": avg,
        "distribution": distribution,
        "top_go": top_go,
        "top_nogo": top_nogo,
        "all": sorted(scored, key=lambda x: x["score"], reverse=True),
    }
