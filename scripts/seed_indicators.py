"""
Seed pour le module Indicateurs.
=================================
Crée :
  - 5 indicateurs (KAABU, NAFAMA, OMy, Pack 5G, Recharge Auto)
  - 5 téléconseillères
  - Scores aléatoires sur tous les PDV pour les 6 derniers mois
  - Quelques campagnes d'appel actives + tâches + appels avec commentaires
"""
import sys, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "backend"))

from datetime import datetime, timedelta
from app.core.database import SessionLocal, Base, engine
import app.models
Base.metadata.create_all(bind=engine)

from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.pdv import PDV
from app.models.indicator import (
    Indicator, IndicatorScore, IndicatorCategory, IndicatorMethod, IndicatorPeriod, IndicatorStatus,
    CallCampaign, CallTask, CallLog, CampaignStatus, CallTaskStatus, CallOutcome, EngagementLevel,
)

db = SessionLocal()
try:
    # ── 1. INDICATEURS ────────────────────────────────────────────────
    print("📊 Création des indicateurs…")
    db.query(IndicatorScore).delete()
    db.query(Indicator).delete()
    db.commit()

    INDICATORS_DATA = [
        {"code": "KAABU", "name": "KAABU", "icon": "🌾", "color": "#10b981",
         "description": "Service de transfert KAABU pour les zones rurales",
         "category": IndicatorCategory.SERVICE, "method": IndicatorMethod.THRESHOLD,
         "metric_field": "ca_kaabu", "threshold_value": 10000,
         "period": IndicatorPeriod.MONTHLY, "target_rate_pct": 70.0},
        {"code": "NAFAMA", "name": "NAFAMA", "icon": "💼", "color": "#3b82f6",
         "description": "Pack NAFAMA - Solution business",
         "category": IndicatorCategory.PRODUIT, "method": IndicatorMethod.MANUAL,
         "period": IndicatorPeriod.MONTHLY, "target_rate_pct": 60.0},
        {"code": "OMY", "name": "OMy (Orange Money y'ello)", "icon": "💳", "color": "#FF6900",
         "description": "OMy - Application Orange Money",
         "category": IndicatorCategory.SERVICE, "method": IndicatorMethod.THRESHOLD,
         "metric_field": "ca_omy", "threshold_value": 5000,
         "period": IndicatorPeriod.MONTHLY, "target_rate_pct": 80.0},
        {"code": "PACK5G", "name": "Pack 5G", "icon": "📡", "color": "#8b5cf6",
         "description": "Pack data 5G",
         "category": IndicatorCategory.PROMOTION, "method": IndicatorMethod.MANUAL,
         "period": IndicatorPeriod.MONTHLY, "target_rate_pct": 40.0},
        {"code": "RECHAUTO", "name": "Recharge Automatique", "icon": "🔄", "color": "#06b6d4",
         "description": "Activation de la recharge automatique mensuelle",
         "category": IndicatorCategory.SERVICE, "method": IndicatorMethod.MANUAL,
         "period": IndicatorPeriod.MONTHLY, "target_rate_pct": 50.0},
    ]
    indicators = []
    for d in INDICATORS_DATA:
        i = Indicator(**d, status=IndicatorStatus.ACTIVE, weight=1.0)
        db.add(i); db.flush()
        indicators.append(i)
    db.commit()
    print(f"  → {len(indicators)} indicateurs créés")

    # ── 2. TÉLÉCONSEILLÈRES ───────────────────────────────────────────
    print("📞 Création des téléconseillères…")
    TC_DATA = [
        ("Tounkara", "Aminata", "tc1@faroukmanager.com"),
        ("Diakité", "Fanta", "tc2@faroukmanager.com"),
        ("Bah", "Salimata", "tc3@faroukmanager.com"),
        ("Coulibaly", "Mariam", "tc4@faroukmanager.com"),
        ("Konaté", "Hawa", "tc5@faroukmanager.com"),
    ]
    teleconseilleres = []
    for nom, prenom, email in TC_DATA:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(email=email, nom=nom, prenom=prenom,
                     hashed_password=get_password_hash("Demo2026!"),
                     role=UserRole.TELECONSEILLERE, is_active=True)
            db.add(u); db.commit(); db.refresh(u)
        teleconseilleres.append(u)
    print(f"  → {len(teleconseilleres)} téléconseillères prêtes")

    # ── 3. SCORES PAR PDV (6 derniers mois) ───────────────────────────
    print("🔢 Génération des scores indicateurs…")
    pdvs = db.query(PDV).all()
    print(f"  → {len(pdvs)} PDV à scorer")
    if not pdvs:
        print("  ⚠ Aucun PDV en base. Lance d'abord seed_data.py")
    else:
        now = datetime.utcnow()
        for offset in range(0, 6):
            d = now - timedelta(days=30 * offset)
            period_key = d.strftime("%Y-%m")
            for pdv in pdvs:
                for ind in indicators:
                    # Probabilité que le PDV fasse l'indicateur (varie selon l'indicateur)
                    base_proba = {
                        "KAABU": 0.65, "NAFAMA": 0.55, "OMY": 0.75,
                        "PACK5G": 0.30, "RECHAUTO": 0.45,
                    }.get(ind.code, 0.5)
                    # Ajout d'une légère tendance (mois récents = un peu mieux)
                    proba = base_proba + (0.05 if offset < 2 else 0)
                    is_active = random.random() < proba
                    raw_value = None
                    if ind.method == IndicatorMethod.THRESHOLD:
                        if is_active:
                            raw_value = random.uniform(ind.threshold_value, ind.threshold_value * 5)
                        else:
                            raw_value = random.uniform(0, ind.threshold_value * 0.8)
                    db.add(IndicatorScore(
                        indicator_id=ind.id, pdv_id=pdv.id, period_key=period_key,
                        is_active=is_active, raw_value=raw_value,
                        source="seed", measured_at=d,
                    ))
            db.commit()
        print(f"  → {len(pdvs) * len(indicators) * 6} scores générés")

    # ── 4. CAMPAGNE D'APPELS DE DÉMO ──────────────────────────────────
    print("📞 Création d'une campagne d'appels de démo…")
    db.query(CallLog).delete()
    db.query(CallTask).delete()
    db.query(CallCampaign).delete()
    db.commit()

    # Campagne KAABU
    kaabu = next((i for i in indicators if i.code == "KAABU"), None)
    if kaabu and pdvs:
        campaign = CallCampaign(
            name="Campagne KAABU Avril 2026",
            description="Relance des PDV inactifs sur KAABU",
            indicator_ids=[kaabu.id],
            target_rate_pct=10.0,
            status=CampaignStatus.ACTIVE,
            starts_at=datetime.utcnow() - timedelta(days=10),
            ends_at=datetime.utcnow() + timedelta(days=20),
            created_by_id=teleconseilleres[0].id,
        )
        db.add(campaign); db.commit(); db.refresh(campaign)

        # Récupérer 50 PDV inactifs sur KAABU
        period_key = datetime.utcnow().strftime("%Y-%m")
        inactive_scores = db.query(IndicatorScore).filter(
            IndicatorScore.indicator_id == kaabu.id,
            IndicatorScore.period_key == period_key,
            IndicatorScore.is_active == False,
        ).limit(150).all()

        # Distribution round-robin
        for i, s in enumerate(inactive_scores):
            tc = teleconseilleres[i % len(teleconseilleres)]
            db.add(CallTask(
                campaign_id=campaign.id, pdv_id=s.pdv_id,
                assigned_to_id=tc.id, status=CallTaskStatus.PENDING,
            ))
        db.commit()

        # Compléter quelques tâches avec des appels (varié)
        from app.ai.indicator_intelligence import analyze_comment
        sample_comments = [
            "PDV très intéressé, veut rejoindre la semaine prochaine. Très chaud.",
            "Pas intéressé. Préfère rester chez Wave qui paie mieux.",
            "Demande à parler au RC pour avoir plus d'informations.",
            "Ne sait pas comment fonctionne KAABU. Besoin de formation.",
            "Pas d'argent en ce moment, manque de capital pour démarrer.",
            "Problème technique avec le terminal. Erreur affichée.",
            "Très satisfait de l'offre, accepte tout de suite.",
            "Pas beaucoup de clients dans son quartier, demande à voir.",
            "Refuse, ne veut pas changer ses habitudes.",
            "Parfait, je reviens vers vous demain pour finaliser.",
        ]
        outcomes_pool = [
            (CallOutcome.REACHED, EngagementLevel.YES),
            (CallOutcome.REACHED, EngagementLevel.NO),
            (CallOutcome.REACHED, EngagementLevel.CONDITIONAL),
            (CallOutcome.NO_ANSWER, EngagementLevel.UNKNOWN),
            (CallOutcome.CALLBACK, EngagementLevel.CONDITIONAL),
            (CallOutcome.WRONG_NUMBER, EngagementLevel.UNKNOWN),
        ]

        all_tasks = db.query(CallTask).filter(CallTask.campaign_id == campaign.id).all()
        # Marquer 60% comme complétés avec un log
        for t in random.sample(all_tasks, k=int(len(all_tasks) * 0.6)):
            outcome, engagement = random.choice(outcomes_pool)
            comment = random.choice(sample_comments) if outcome == CallOutcome.REACHED else None
            log = CallLog(
                task_id=t.id, pdv_id=t.pdv_id, user_id=t.assigned_to_id,
                outcome=outcome, engagement=engagement,
                duration_sec=random.randint(30, 480),
                comment=comment,
                created_at=datetime.utcnow() - timedelta(days=random.randint(0, 9)),
            )
            if comment:
                an = analyze_comment(comment)
                log.ai_sentiment = an["sentiment"]
                log.ai_categories = an["categories"]
                log.ai_heat_score = an["heat_score"]
                log.ai_summary = an["summary"]
            log.indicator_ids_discussed = [kaabu.id]
            db.add(log)
            t.status = CallTaskStatus.COMPLETED if outcome != CallOutcome.CALLBACK else CallTaskStatus.RESCHEDULED
            t.completed_at = log.created_at
        db.commit()
        n_tasks = db.query(CallTask).filter(CallTask.campaign_id == campaign.id).count()
        n_done = db.query(CallTask).filter(
            CallTask.campaign_id == campaign.id, CallTask.status == CallTaskStatus.COMPLETED).count()
        print(f"  → Campagne KAABU : {n_tasks} tâches, {n_done} complétées")

    print("\n✅ Seed indicateurs terminé")
    print("\n👥 Téléconseillères créées (mot de passe : Demo2026!) :")
    for u in teleconseilleres:
        print(f"   • {u.email:<35s} {u.prenom} {u.nom}")
finally:
    db.close()
