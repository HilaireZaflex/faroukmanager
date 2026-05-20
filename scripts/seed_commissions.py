"""
Seed Commissions Réseau — données réalistes pour Orange Mali.
Génère 6 mois de commissions pour les 206 PDV avec les 4 types.
"""
import sys, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "backend"))

from datetime import datetime, timedelta
from app.core.database import SessionLocal, Base, engine
import app.models
Base.metadata.create_all(bind=engine)

from app.models.pdv import PDV
from app.models.commission import (
    CommissionEntry, CommissionImport, PDVType, ReversementStatus,
    TYPE_GERE_REVERSEMENT, TAUX_RESEAU, TAUX_PDV,
)

db = SessionLocal()
try:
    # Purge
    db.query(CommissionEntry).delete()
    db.query(CommissionImport).delete()
    db.commit()

    pdvs = db.query(PDV).all()
    if not pdvs:
        print("⚠ Aucun PDV en base. Lance d'abord seed_data.py"); exit()

    print(f"📊 Génération commissions pour {len(pdvs)} PDV sur 6 mois…")

    # Assigner un type à chaque PDV (proportions réalistes Orange Mali)
    TYPES_POOL = (
        [PDVType.RNS] * 40 +
        [PDVType.RSF] * 30 +
        [PDVType.RS]  * 20 +
        [PDVType.KIOSQUE] * 10
    )
    pdv_types = {}
    for p in pdvs:
        pdv_types[p.id] = random.choice(TYPES_POOL)

    # Plages de commissions réalistes par type (FCFA)
    BRUT_RANGES = {
        PDVType.RNS:     (5_000,  180_000),
        PDVType.RSF:     (8_000,  250_000),
        PDVType.RS:      (15_000, 400_000),
        PDVType.KIOSQUE: (20_000, 600_000),
    }

    now = datetime.utcnow()
    QUARTIERS_ZONES = [
        ("Hamdallaye", "Bamako Nord"), ("Badalabougou", "Bamako Sud"),
        ("Sotuba", "Bamako Est"), ("Magnambougou", "Bamako Est"),
        ("Faladiè", "Bamako Est"), ("Lafiabougou", "Bamako Ouest"),
        ("Niamakoro", "Bamako Sud"), ("Banconi", "Bamako Nord"),
        ("Djélibougou", "Bamako Nord"), ("Kalaban Coura", "Bamako Sud"),
        ("Sogoniko", "Bamako Sud"), ("ACI 2000", "Bamako Centre"),
        ("Korofina", "Bamako Nord"), ("Sébénikoro", "Bamako Ouest"),
        ("Bagadadji", "Bamako Centre"),
    ]
    pdv_quartiers = {p.id: random.choice(QUARTIERS_ZONES) for p in pdvs}

    total_entries = 0
    for month_offset in range(0, 6):
        d = now - timedelta(days=30 * month_offset)
        period_key = d.strftime("%Y-%m")

        for p in pdvs:
            pdv_type = pdv_types[p.id]
            quartier, zone = pdv_quartiers[p.id]

            # Simuler quelques PDV inactifs ce mois (5% de chance)
            if random.random() < 0.05:
                continue

            brut_min, brut_max = BRUT_RANGES[pdv_type]
            # Tendance croissante récente (+5% par mois vers le présent)
            trend = 1.0 + (month_offset * 0.03)
            montant_brut = round(random.uniform(brut_min, brut_max) / trend, 2)
            montant_reseau = round(montant_brut * TAUX_RESEAU, 2)
            montant_pdv    = round(montant_brut * TAUX_PDV, 2)
            gere_rev = TYPE_GERE_REVERSEMENT[pdv_type]

            # Statut reversement pour KIOSQUE/RS
            if gere_rev:
                if month_offset > 2:  # anciens mois = payés
                    rev_status = ReversementStatus.PAYE
                    montant_rev = montant_pdv
                elif month_offset == 1:
                    rev_status = random.choice([
                        ReversementStatus.PAYE,
                        ReversementStatus.PARTIEL,
                        ReversementStatus.EN_ATTENTE,
                    ])
                    montant_rev = montant_pdv if rev_status == ReversementStatus.PAYE else \
                                  round(montant_pdv * random.uniform(0.3, 0.8), 2) if rev_status == ReversementStatus.PARTIEL else 0
                else:  # mois courant
                    rev_status = random.choice([
                        ReversementStatus.EN_ATTENTE,
                        ReversementStatus.EN_ATTENTE,
                        ReversementStatus.PARTIEL,
                    ])
                    montant_rev = round(montant_pdv * random.uniform(0.2, 0.6), 2) if rev_status == ReversementStatus.PARTIEL else 0
            else:
                rev_status = ReversementStatus.NON_APPLICABLE
                montant_rev = 0

            gestionnaire = random.choice(["Gestionnaire 1", "Gestionnaire 2", "Gestionnaire 3"])
            superviseur = random.choice(["Superviseur A", "Superviseur B", "Superviseur C"])

            db.add(CommissionEntry(
                pdv_id=p.id,
                pdv_numero=str(p.numero_pdv or f"PDV{p.id:04d}"),
                pdv_nom=getattr(p, "nom", None) or f"PDV {p.id}",
                pdv_type=pdv_type,
                quartier=quartier,
                zone=zone,
                gestionnaire=gestionnaire,
                superviseur=superviseur,
                period_key=period_key,
                period_type="MONTHLY",
                montant_brut=montant_brut,
                montant_reseau=montant_reseau,
                montant_pdv=montant_pdv,
                gere_reversement=gere_rev,
                reversement_status=rev_status,
                montant_reverse=montant_rev,
                source="seed",
            ))
            total_entries += 1

        db.commit()
        # Stats de la période
        from sqlalchemy import func
        r = db.query(
            func.count(CommissionEntry.id),
            func.sum(CommissionEntry.montant_brut),
            func.sum(CommissionEntry.montant_reseau),
        ).filter(CommissionEntry.period_key == period_key).first()
        n, brut, reseau = r
        print(f"  {period_key}: {n} PDV · Brut {brut/1_000_000:.2f} MFCFA · Réseau {reseau/1_000_000:.2f} MFCFA")

    print(f"\n✅ {total_entries} entrées de commissions générées")

    # Stats finales
    last_period = now.strftime("%Y-%m")
    from app.services import commission_service as svc
    dash = svc.dashboard(db, last_period)
    print(f"\n📊 Dashboard {last_period} :")
    print(f"   PDV actifs       : {dash['n_pdv_total']}")
    print(f"   Total brut (100%): {dash['total_brut']:>15,.2f} F")
    print(f"   Part réseau (30%): {dash['total_reseau']:>15,.2f} F ← ce que le PDG garde")
    print(f"   Part PDV (70%)   : {dash['total_pdv']:>15,.2f} F")
    print(f"\n   Ventilation par type :")
    for t in dash["by_type"]:
        print(f"     {t['type']:<8s} ({t['n_pdv']:>3d} PDV) Réseau: {t['reseau']:>12,.2f} F | PDV: {t['pdv']:>12,.2f} F")
    print(f"\n   Top 3 quartiers par brut :")
    for q in dash["by_quartier"][:3]:
        print(f"     {q['quartier']:<20s} Réseau: {q['reseau']:>10,.2f} F")
    if dash["reversements"]["total_a_reverser"] > 0:
        rev = dash["reversements"]
        print(f"\n   Reversements KIOSQUE+RS :")
        print(f"     Total à reverser : {rev['total_a_reverser']:>12,.2f} F")
        print(f"     Déjà reversé     : {rev['total_reverse']:>12,.2f} F")
        print(f"     Reste à payer    : {rev['total_reste']:>12,.2f} F")
finally:
    db.close()
