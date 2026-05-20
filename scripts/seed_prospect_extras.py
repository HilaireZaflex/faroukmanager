"""
Seed complémentaire pour les modules Prospection :
  - Stock de puces (200 puces, 3 lots)
  - Post-activation KPI (30/60/90 jours)
  - Badges + classement
  - Quelques notifications de démo
"""
import sys, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "backend"))

from datetime import datetime, timedelta
from app.core.database import SessionLocal, Base, engine
import app.models
Base.metadata.create_all(bind=engine)

from app.models.user import User, UserRole
from app.models.prospect import Prospect, ProspectStatus
from app.models.prospect_extras import (
    PuceStock, PuceStockStatus, Notification, NotifChannel, NotifStatus,
    DevBadge, DevObjective, PostActivationKPI,
)
from app.services import (
    prospect_postact_service as post_svc,
    prospect_gamification_service as game_svc,
)

db = SessionLocal()
try:
    # ── 1. STOCK DE PUCES ────────────────────────────────────────────────
    print("📦 Génération du stock de puces...")
    db.query(PuceStock).delete()
    db.commit()
    rc = db.query(User).filter(User.role == UserRole.RC).first()
    rc_id = rc.id if rc else None

    lots = [
        ("LOT-2026-01", 80),  # ancien
        ("LOT-2026-02", 60),
        ("LOT-2026-04", 40),  # récent (peu)
    ]
    base_serial = 73000000
    for lot_code, count in lots:
        for i in range(count):
            base_serial += 1
            puce = PuceStock(
                numero=str(base_serial), lot=lot_code,
                status=PuceStockStatus.DISPONIBLE,
                received_at=datetime.utcnow() - timedelta(days=random.randint(5, 60)),
                received_by_id=rc_id,
            )
            db.add(puce)
    db.commit()
    print(f"  → {sum(c for _, c in lots)} puces ajoutées")

    # Marquer comme RESERVEE ou ACTIVEE celles déjà liées à des prospects
    for p in db.query(Prospect).filter(Prospect.puce_numero.isnot(None)).all():
        existing = db.query(PuceStock).filter(PuceStock.numero == p.puce_numero).first()
        if not existing:
            # Créer une puce historique pour cohérence
            existing = PuceStock(
                numero=p.puce_numero, lot="LOT-HISTORIQUE",
                status=PuceStockStatus.DISPONIBLE,
                received_at=p.submitted_at or datetime.utcnow() - timedelta(days=30),
            )
            db.add(existing); db.flush()
        if p.status == ProspectStatus.PUCE_ACTIVEE:
            existing.status = PuceStockStatus.ACTIVEE
            existing.activated_at = p.activated_at
        elif p.status == ProspectStatus.PUCE_ATTRIBUEE:
            existing.status = PuceStockStatus.RESERVEE
            existing.reserved_for_prospect_id = p.id
            existing.reserved_at = p.puce_assigned_at
    db.commit()

    # Marquer 3 puces comme défectueuses pour la démo
    for p in db.query(PuceStock).filter(PuceStock.status == PuceStockStatus.DISPONIBLE).limit(3).all():
        p.status = PuceStockStatus.DEFECTUEUSE
    db.commit()

    # ── 2. POST-ACTIVATION KPI ───────────────────────────────────────────
    print("🎯 Génération des KPI post-activation...")
    db.query(PostActivationKPI).delete()
    db.commit()
    n30 = post_svc.generate_for_period(db, 30)
    n60 = post_svc.generate_for_period(db, 60)
    n90 = post_svc.generate_for_period(db, 90)
    # Ajouter aussi quelques KPI pour les puces récemment activées (cas démo)
    activated = db.query(Prospect).filter(Prospect.status == ProspectStatus.PUCE_ACTIVEE).all()
    for p in activated[:5]:
        for d in (30,):
            exists = db.query(PostActivationKPI).filter(
                PostActivationKPI.prospect_id == p.id,
                PostActivationKPI.period_days == d,
            ).first()
            if exists: continue
            ca_predit = (p.om_ca_mensuel or 400_000)
            ca_reel = round(ca_predit * random.uniform(0.4, 1.4))
            db.add(PostActivationKPI(
                prospect_id=p.id, pdv_id=p.activated_pdv_id, period_days=d,
                ca_predit=round(ca_predit), ca_reel=ca_reel,
                nb_transactions=random.randint(60, 450),
                nb_jours_actifs=random.randint(12, 30),
                is_dormant=ca_reel < ca_predit * 0.4,
                satisfaction_score=random.randint(2, 5),
            ))
    db.commit()
    print(f"  → 30j: {n30} · 60j: {n60} · 90j: {n90} · démo: 5 supplémentaires")

    # ── 3. OBJECTIFS + BADGES ────────────────────────────────────────────
    print("🏆 Génération objectifs + badges...")
    db.query(DevObjective).delete()
    db.query(DevBadge).delete()
    db.commit()
    devs = db.query(User).filter(User.role == UserRole.DEVELOPPEUR).all()
    period = datetime.utcnow().strftime("%Y-%m")
    for d in devs:
        game_svc.create_objective(
            db, d.id, period,
            target_visits=random.randint(8, 15),
            target_validations=random.randint(5, 10),
            target_activations=random.randint(2, 5),
            bonus_amount=random.choice([25000, 50000, 75000, 100000]),
        )
    granted = game_svc.compute_badges(db, period)
    print(f"  → {len(devs)} objectifs · {granted} badges attribués")

    # ── 4. NOTIFICATIONS DE DÉMO ─────────────────────────────────────────
    print("🔔 Génération de notifications de démo...")
    db.query(Notification).delete()
    db.commit()
    admins = db.query(User).filter(User.role == UserRole.ADMIN).all()
    targets = devs + (db.query(User).filter(User.role == UserRole.RC).all()) + admins[:1]
    templates = ["visit_assigned", "dev_validated", "puce_assigned", "sla_warning"]
    for u in targets:
        for tpl in random.sample(templates, k=2):
            from app.services.prospect_notif_service import _render
            sample = list(db.query(Prospect).limit(5).all())
            p = random.choice(sample) if sample else None
            ctx = {"reference": p.reference if p else "—",
                   "prospect_nom": f"{p.prenom} {p.nom}" if p else "Démo",
                   "telephone": p.telephone_principal if p else "",
                   "quartier": p.quartier if p else "Hamdallaye",
                   "dev_nom": f"{u.prenom or ''} {u.nom}".strip(),
                   "activator_nom": f"{u.prenom or ''} {u.nom}".strip(),
                   "puce_numero": p.puce_numero if p and p.puce_numero else "73XXXXXXX",
                   "comment": "—"}
            r = _render(tpl, ctx)
            n = Notification(
                recipient_user_id=u.id, channel=NotifChannel.IN_APP,
                status=random.choice([NotifStatus.SENT, NotifStatus.READ, NotifStatus.PENDING]),
                title=r["title"], message=r["message"],
                related_prospect_id=p.id if p else None, template=tpl,
                created_at=datetime.utcnow() - timedelta(hours=random.randint(0, 72)),
            )
            db.add(n)
    db.commit()
    print(f"  → notifications créées pour {len(targets)} utilisateurs")

    print("\n✅ Seed extras terminé")
finally:
    db.close()
