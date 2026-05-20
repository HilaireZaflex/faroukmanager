"""Seed Évaluations — données de démonstration."""
import sys, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'backend'))

from datetime import datetime, timedelta
from app.core.database import SessionLocal, Base, engine
import app.models
Base.metadata.create_all(bind=engine)

from app.models.user import User, UserRole
from app.models.pdv import PDV
from app.models.evaluation import (
    EvalCampaign, EvalScore, EvalRoleType, EvalPeriodType, EvalStatus,
    MysteryCallTask, MysteryCallLog, MysteryCallStatus, MysteryCallType,
    EvalManualNote, EvalObjective,
)
from app.services import eval_service as svc, eval_config_service as cfg_svc

db = SessionLocal()
try:
    # Purge
    db.query(EvalObjective).delete()
    db.query(EvalManualNote).delete()
    db.query(MysteryCallLog).delete()
    db.query(MysteryCallTask).delete()
    db.query(EvalScore).delete()
    db.query(EvalCampaign).delete()
    db.commit()
    print("🗑  Base nettoyée")

    tcs = db.query(User).filter(User.role == UserRole.TELECONSEILLERE, User.is_active == True).all()
    sups = db.query(User).filter(User.role == UserRole.SUPERVISEUR, User.is_active == True).all()
    devs = db.query(User).filter(User.role == UserRole.DEVELOPPEUR, User.is_active == True).all()
    managers = db.query(User).filter(User.role == UserRole.MANAGER, User.is_active == True).all()
    pdvs = db.query(PDV).filter(PDV.telephone.isnot(None)).all()

    now = datetime.utcnow()
    period_key = now.strftime("%Y-%m")
    date_start = now.replace(day=1)
    date_end = (date_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    date_start_str = date_start.isoformat()
    date_end_str = date_end.isoformat()

    roles_config = [
        (EvalRoleType.SUPERVISEUR,     sups,     "Évaluation Superviseurs"),
        (EvalRoleType.DEVELOPPEUR,     devs,     "Évaluation Développeurs"),
        (EvalRoleType.TELECONSEILLERE, tcs,      "Évaluation Téléconseillères"),
        (EvalRoleType.GESTIONNAIRE,    managers, "Évaluation Gestionnaires"),
    ]

    for role_type, users, name in roles_config:
        if not users:
            print(f"  ⚠ Aucun {role_type.value}, ignoré")
            continue

        # Créer la campagne
        campaign = svc.create_campaign(db, {
            "name": f"{name} — {period_key}",
            "role_type": role_type.value,
            "period_type": "MONTHLY",
            "period_key": period_key,
            "date_start": date_start_str,
            "date_end": date_end_str,
            "target_user_ids": [u.id for u in users],
            "mystery_call_user_ids": [u.id for u in tcs] if tcs else None,
            "n_mystery_calls": 5,
        }, users[0].id if users else 1)
        print(f"  ✅ Campagne créée : {campaign.name}")

        # Ajouter notes manuelles pour superviseurs (connaissance terrain)
        if role_type == EvalRoleType.SUPERVISEUR:
            for u in users:
                for criterion, max_note in [("geo_knowledge", 10), ("mystery_last_visit", 10)]:
                    db.add(EvalManualNote(
                        campaign_id=campaign.id, user_id=u.id,
                        criterion=criterion,
                        note=round(random.uniform(5.5, 9.5), 1),
                        max_note=max_note,
                        comment=f"Évaluation terrain {criterion} — {period_key}",
                        added_by_id=users[0].id,
                    ))
            db.commit()

        # Créer appels mystères si PDV disponibles
        if pdvs and tcs:
            for i, agent in enumerate(users):
                sample_pdvs = random.sample(pdvs, min(5, len(pdvs)))
                for j, pdv in enumerate(sample_pdvs):
                    tc = tcs[j % len(tcs)]
                    call_type = MysteryCallType.LAST_VISIT if role_type in (EvalRoleType.SUPERVISEUR, EvalRoleType.GESTIONNAIRE) else MysteryCallType.QUALITY_CHECK
                    task = MysteryCallTask(
                        campaign_id=campaign.id, target_user_id=agent.id,
                        pdv_id=pdv.id, tc_user_id=tc.id,
                        call_type=call_type, status=MysteryCallStatus.DONE,
                        question=f"Quand votre {role_type.value} est-il passé ?",
                        completed_at=now - timedelta(days=random.randint(0, 5)),
                    )
                    db.add(task); db.flush()
                    note = round(random.uniform(5.0, 9.5), 1)
                    db.add(MysteryCallLog(
                        task_id=task.id, tc_user_id=tc.id,
                        outcome="REACHED",
                        answer=random.choice([
                            "Il est passé il y a 3 jours",
                            "La semaine dernière",
                            "Il y a environ 2 semaines",
                            "Je ne me souviens pas exactement",
                        ]),
                        note=note,
                        comment=f"Appel mystère effectué, note {note}/10",
                        duration_sec=random.randint(60, 300),
                    ))
            db.commit()

        # Objectifs pour développeurs
        if role_type == EvalRoleType.DEVELOPPEUR:
            for u in users:
                for criterion, target, unit, bonus in [
                    ("target_activations", random.randint(3, 8), "activations", 25000),
                    ("target_visits", random.randint(10, 20), "visites", 15000),
                    ("target_validations", random.randint(5, 12), "validations", 10000),
                ]:
                    db.add(EvalObjective(
                        campaign_id=campaign.id, user_id=u.id,
                        criterion=criterion, target_value=target, unit=unit,
                        bonus_if_reached=bonus, status="VALIDATED",
                        proposed_by_id=u.id, validated_by_id=users[0].id,
                    ))
            db.commit()

        # Calculer tous les scores
        result = svc.compute_all_scores(db, campaign.id)
        print(f"    📊 {result['computed']}/{result['total']} scores calculés")

        # Clôturer
        svc.close_campaign(db, campaign.id)
        print(f"    🔒 Campagne clôturée")

    # Résumé final
    print("\n" + "═"*55)
    dash = svc.dashboard(db)
    print(f"  📊 Total campagnes : {dash['total_campaigns']}")
    print(f"  🏆 Total scores    : {dash['total_scores']}")
    print(f"  ⭐ Score moyen     : {dash['avg_score_global']}/100")
    print(f"\n  🏅 Top performers :")
    for p in dash['top_performers'][:5]:
        print(f"     {p['name']:<25s} {p['role']:<18s} → {p['score']:.1f} ({p['label']})")
    print("═"*55)
    print("\n✅ Seed évaluations terminé")
finally:
    db.close()
