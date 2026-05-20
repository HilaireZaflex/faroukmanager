"""
Module d'IA pour les Indicateurs.
==================================
- analyze_comment    : sentiment + catégorisation + score de chaleur d'un commentaire
- aggregate_insights : insights par indicateur (top objections, recommandations)
- predict_dropouts   : PDV qui risquent de sortir d'un indicateur
- diagnose_pdv       : analyse de cause racine sur un PDV inactif
- what_if            : simulation d'impact si on récupère X% de PDV
"""
from __future__ import annotations
import re, unicodedata
from datetime import datetime, timedelta
from collections import Counter, defaultdict
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.indicator import (
    Indicator, IndicatorScore, CallLog, CallTask, IndicatorPeriod,
    CallOutcome, EngagementLevel,
)
from app.models.pdv import PDV


# ─────────────────────────────────────────────────────────────────────────────
# Lexique pour analyse simple (à terme : modèle ML / LLM)
# ─────────────────────────────────────────────────────────────────────────────
def _normalize(s: str) -> str:
    if not s: return ""
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.strip())


CATEGORIES = {
    "pas_interesse": [
        "pas interesse", "pas interessant", "ne veut pas", "refuse",
        "non merci", "ca ne m'interesse", "pas envie",
    ],
    "manque_formation": [
        "ne sait pas", "ne comprend pas", "comment faire", "formation",
        "pas explique", "expliquer", "ne maitrise", "tutoriel",
    ],
    "probleme_technique": [
        "ne marche pas", "bug", "erreur", "panne", "machine",
        "terminal", "reseau", "connexion", "probleme technique",
    ],
    "concurrence": [
        "wave", "moov", "sama money", "concurrent", "preferer wave",
        "moov me donne", "wave est mieux", "deja chez",
    ],
    "manque_fonds": [
        "pas d'argent", "manque fonds", "pas de capital", "trop cher",
        "trop couteux", "pas de moyens", "trop de frais", "commission",
    ],
    "souhaite_rc": [
        "veut parler", "responsable", "rc", "manager",
        "voir le chef", "rendez-vous", "meeting",
    ],
    "manque_clientele": [
        "pas de clients", "peu de clients", "pas de demande", "zone calme",
        "trop loin", "personne ne vient",
    ],
    "satisfait": [
        "tres bien", "super", "satisfait", "content", "merci", "parfait",
        "ravi", "j'aime", "deja en cours",
    ],
}

POSITIVE_WORDS = {"bien", "super", "merci", "ok", "oui", "parfait",
                  "satisfait", "interesse", "accepte", "d'accord", "content"}
NEGATIVE_WORDS = {"non", "refuse", "pas", "jamais", "rien", "probleme",
                  "erreur", "panne", "deteste", "trop", "cher", "manque", "absent"}


def analyze_comment(text: str) -> Dict[str, Any]:
    """Renvoie sentiment + catégories + heat_score + résumé court."""
    if not text or len(text.strip()) < 2:
        return {"sentiment": "neutral", "categories": [], "heat_score": 50.0, "summary": ""}

    norm = _normalize(text)
    words = set(re.findall(r"\b\w+\b", norm))

    # Sentiment
    pos_count = len(words & POSITIVE_WORDS)
    neg_count = len(words & NEGATIVE_WORDS)
    if pos_count > neg_count + 1: sentiment = "positive"
    elif neg_count > pos_count + 1: sentiment = "negative"
    else: sentiment = "neutral"

    # Catégorisation
    categories = []
    for cat, keywords in CATEGORIES.items():
        for kw in keywords:
            if kw in norm:
                categories.append(cat); break

    # Score de chaleur (0 = froid/perdu, 100 = très chaud)
    heat = 50
    if "satisfait" in categories: heat += 30
    if sentiment == "positive": heat += 15
    if sentiment == "negative": heat -= 20
    if "pas_interesse" in categories: heat -= 30
    if "concurrence" in categories: heat -= 15
    if "souhaite_rc" in categories: heat += 10
    if "manque_formation" in categories: heat += 5  # rattrapable
    if "probleme_technique" in categories: heat += 5  # rattrapable
    heat = max(0, min(100, heat))

    # Résumé court (premiers 80 chars)
    summary = text.strip()[:120] + ("…" if len(text) > 120 else "")

    return {
        "sentiment": sentiment,
        "categories": categories,
        "heat_score": float(heat),
        "summary": summary,
    }


# ─────────────────────────────────────────────────────────────────────────────
# AGRÉGATION DES INSIGHTS PAR INDICATEUR
# ─────────────────────────────────────────────────────────────────────────────
def aggregate_insights(db: Session, indicator_id: int,
                       since_days: int = 30) -> Dict[str, Any]:
    cutoff = datetime.utcnow() - timedelta(days=since_days)
    logs = db.query(CallLog).filter(
        CallLog.created_at >= cutoff,
        CallLog.comment.isnot(None),
    ).all()

    # Filtrer par indicateur (via tâche → campagne → indicator_ids)
    relevant = []
    for log in logs:
        if not log.task or not log.task.campaign: continue
        if indicator_id in (log.task.campaign.indicator_ids or []):
            relevant.append(log)

    if not relevant:
        return {"count": 0, "categories": [], "sentiments": {},
                "recommendations": [], "word_cloud": []}

    # Catégories
    cat_counter = Counter()
    sent_counter = Counter()
    word_counter = Counter()
    heat_total = 0
    for log in relevant:
        for c in (log.ai_categories or []):
            cat_counter[c] += 1
        sent_counter[log.ai_sentiment or "neutral"] += 1
        if log.ai_heat_score is not None: heat_total += log.ai_heat_score
        # Mots clés (>3 lettres, hors mots vides)
        if log.comment:
            for w in re.findall(r"\b\w{4,}\b", _normalize(log.comment)):
                if w not in {"pour", "avec", "dans", "cette", "votre", "nous", "vous"}:
                    word_counter[w] += 1

    # Recommandations basées sur les top catégories
    top_cats = [c for c, _ in cat_counter.most_common(3)]
    recommendations = []
    if "manque_formation" in top_cats:
        recommendations.append({
            "icon": "🎓", "title": "Formation collective",
            "detail": "Beaucoup de PDV manquent de formation. Organiser une session collective par quartier.",
            "priority": "HIGH",
        })
    if "concurrence" in top_cats:
        recommendations.append({
            "icon": "⚔️", "title": "Contre-offensive concurrence",
            "detail": "La concurrence (Wave/Moov/Sama) est citée fréquemment. Préparer un argumentaire avantages.",
            "priority": "HIGH",
        })
    if "manque_fonds" in top_cats:
        recommendations.append({
            "icon": "💰", "title": "Solutions de financement",
            "detail": "Plusieurs PDV manquent de capital. Proposer un partenariat micro-crédit Kafo Jiginew.",
            "priority": "MEDIUM",
        })
    if "souhaite_rc" in top_cats:
        recommendations.append({
            "icon": "👔", "title": "Visites RC programmées",
            "detail": "PDV demandent à parler au RC. Planifier une tournée VIP.",
            "priority": "HIGH",
        })
    if "manque_clientele" in top_cats:
        recommendations.append({
            "icon": "📍", "title": "Marketing local",
            "detail": "Manque de clients dans certaines zones. Lancer une campagne de proximité.",
            "priority": "MEDIUM",
        })
    if "probleme_technique" in top_cats:
        recommendations.append({
            "icon": "🛠️", "title": "Support technique renforcé",
            "detail": "Problèmes techniques récurrents. Audit terminaux + ligne support dédiée.",
            "priority": "HIGH",
        })

    return {
        "count": len(relevant),
        "categories": [{"key": c, "count": n} for c, n in cat_counter.most_common(10)],
        "sentiments": dict(sent_counter),
        "avg_heat_score": round(heat_total / len(relevant), 1) if relevant else 0,
        "word_cloud": [{"word": w, "count": n} for w, n in word_counter.most_common(30)],
        "recommendations": recommendations,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PRÉDICTION DROPOUT
# ─────────────────────────────────────────────────────────────────────────────
def predict_dropouts(db: Session, indicator_id: int) -> List[Dict[str, Any]]:
    """PDV qui font l'indicateur mais montrent des signaux faibles."""
    indic = db.query(Indicator).get(indicator_id)
    if not indic: return []

    from app.services import indicator_service as iss
    period_key = iss.current_period_key(indic.period)

    # PDV actifs ce mois
    active_scores = db.query(IndicatorScore).filter(
        IndicatorScore.indicator_id == indicator_id,
        IndicatorScore.period_key == period_key,
        IndicatorScore.is_active == True,
    ).all()

    at_risk = []
    for s in active_scores:
        risk = 0
        reasons = []

        # Signaux faibles : appels avec sentiment négatif récents
        recent_logs = db.query(CallLog).filter(
            CallLog.pdv_id == s.pdv_id,
            CallLog.created_at >= datetime.utcnow() - timedelta(days=60),
        ).all()
        for log in recent_logs:
            if log.ai_sentiment == "negative": risk += 25; reasons.append("Commentaire négatif récent")
            if "concurrence" in (log.ai_categories or []): risk += 30; reasons.append("Tentation concurrence")
            if "pas_interesse" in (log.ai_categories or []): risk += 35; reasons.append("Désintérêt exprimé")

        # Valeur en baisse vs période précédente
        prev_score = db.query(IndicatorScore).filter(
            IndicatorScore.indicator_id == indicator_id,
            IndicatorScore.pdv_id == s.pdv_id,
            IndicatorScore.period_key != period_key,
        ).order_by(IndicatorScore.measured_at.desc()).first()
        if prev_score and prev_score.raw_value and s.raw_value:
            if s.raw_value < prev_score.raw_value * 0.7:
                risk += 30
                reasons.append(f"Baisse forte (-{int((1-s.raw_value/prev_score.raw_value)*100)}%)")

        if risk >= 30:
            p = s.pdv
            at_risk.append({
                "pdv_id": s.pdv_id, "numero": p.numero_pdv if p else None,
                "nom": p.nom if p else None, "quartier": p.quartier if p else None,
                "risk_score": min(100, risk), "reasons": list(set(reasons)),
            })
    at_risk.sort(key=lambda x: x["risk_score"], reverse=True)
    return at_risk[:50]


# ─────────────────────────────────────────────────────────────────────────────
# DIAGNOSTIC PDV
# ─────────────────────────────────────────────────────────────────────────────
def diagnose_pdv(db: Session, pdv_id: int, indicator_id: int) -> Dict[str, Any]:
    """Pourquoi ce PDV ne fait pas cet indicateur ? Synthèse IA."""
    pdv = db.query(PDV).get(pdv_id)
    if not pdv: raise ValueError("PDV introuvable")

    logs = db.query(CallLog).filter(CallLog.pdv_id == pdv_id).order_by(CallLog.created_at.desc()).limit(20).all()
    cats = Counter()
    sentiments = Counter()
    for log in logs:
        for c in (log.ai_categories or []): cats[c] += 1
        sentiments[log.ai_sentiment or "neutral"] += 1

    main_cause = cats.most_common(1)[0][0] if cats else "inconnue"

    causes_human = {
        "pas_interesse": "Le PDV ne montre pas d'intérêt pour cet indicateur",
        "manque_formation": "Le PDV a besoin de formation",
        "probleme_technique": "Le PDV rencontre des problèmes techniques",
        "concurrence": "La concurrence a séduit ce PDV",
        "manque_fonds": "Le PDV manque de capital pour démarrer",
        "souhaite_rc": "Le PDV veut un contact direct avec le RC",
        "manque_clientele": "Le PDV n'a pas assez de clientèle dans sa zone",
        "inconnue": "Aucune information disponible. Recommandation : appeler le PDV.",
    }

    actions_suggerees = {
        "pas_interesse": ["Visite RC pour relancer", "Offre promotionnelle ciblée"],
        "manque_formation": ["Programmer une formation", "Envoyer tutoriel WhatsApp"],
        "probleme_technique": ["Audit du terminal", "Support technique dédié"],
        "concurrence": ["Argumentaire concurrence", "Bonus de fidélité"],
        "manque_fonds": ["Partenariat micro-crédit", "Capital de démarrage différé"],
        "souhaite_rc": ["Programmer une visite RC dans les 7 jours"],
        "manque_clientele": ["Campagne de communication locale", "Repositionnement"],
        "inconnue": ["Premier contact téléphonique"],
    }

    return {
        "pdv_id": pdv_id, "numero": pdv.numero_pdv, "nom": pdv.nom,
        "main_cause": main_cause,
        "main_cause_label": causes_human.get(main_cause, main_cause),
        "all_causes": [{"key": c, "count": n} for c, n in cats.most_common()],
        "sentiments": dict(sentiments),
        "n_calls": len(logs),
        "actions_suggested": actions_suggerees.get(main_cause, ["Appeler le PDV"]),
    }


# ─────────────────────────────────────────────────────────────────────────────
# WHAT-IF
# ─────────────────────────────────────────────────────────────────────────────
def what_if(db: Session, indicator_id: int, recovery_pct: float) -> Dict[str, Any]:
    """Si on récupère X% des PDV inactifs, quel serait le nouveau taux ?"""
    indic = db.query(Indicator).get(indicator_id)
    if not indic: raise ValueError("Indicateur introuvable")

    from app.services import indicator_service as iss
    period_key = iss.current_period_key(indic.period)
    s = iss.stats(db, indicator_id, period_key)
    inactive = s["inactive"]
    recovered = int(inactive * recovery_pct / 100)
    new_active = s["active"] + recovered
    new_rate = round(new_active / s["total_pdvs"] * 100, 1) if s["total_pdvs"] else 0
    return {
        "current_rate_pct": s["rate_pct"],
        "current_active": s["active"],
        "inactive": inactive,
        "scenario_recovery_pct": recovery_pct,
        "pdvs_to_recover": recovered,
        "new_active": new_active,
        "new_rate_pct": new_rate,
        "delta_pct": round(new_rate - s["rate_pct"], 1),
    }
