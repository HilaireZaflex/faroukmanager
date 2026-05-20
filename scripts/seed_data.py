"""
Seed script for FaroukManager - creates realistic fake data.
"""
import sys
import os
from datetime import datetime, timedelta
import random

# Add backend to path
sys.path.insert(0, '/Users/nms/FaroukManager/backend')

from app.core.database import SessionLocal, engine, Base
from app.models.user import User, UserRole
from app.models.pdv import PDV, PDVType, PDVStatut, PDVMedaille
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.action import TerrainAction, ActionType, ActionResultat
from app.models.recovery import Recovery, RecoveryStatut
from app.core.security import get_password_hash
from passlib.context import CryptContext

# Create password context directly to avoid bcrypt issues
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
from sqlalchemy import and_

# Realistic Mali names and locations
MALIAN_FIRST_NAMES = [
    "Mamadou", "Mariam", "Ibrahim", "Aïssatou", "Issa", "Fatou", "Moussa", "Aminata",
    "Ali", "Coumba", "Ousmane", "Hawa", "Kalidou", "Ndeye", "Daouda", "Aida",
    "Sekou", "Awa", "Souleymane", "Ramata", "Kader", "Oumou", "Mohamed", "Miriam",
    "Idrissa", "Jeneba", "Abdoulaye", "Sata", "Amadou", "Néné"
]

MALIAN_LAST_NAMES = [
    "Traore", "Diallo", "Sow", "Diouf", "Ba", "Kane", "Soulé", "Bah",
    "Cisse", "Ndiaye", "Sarr", "Gueye", "Ndong", "Dembele", "Sacko", "Diarra",
    "Sidibe", "Toure", "Kante", "Berte"
]

PDV_NAMES = [
    "Store Orange Bamako Centre",
    "Orange Corner Marché",
    "Orange Boutique Centre",
    "Orange Kiosk",
    "Orange Point de Vente",
    "Orange Revendeur Officiel",
    "Orange Service Centre",
    "Orange Express",
    "Agence Orange",
    "Orange Point Relais",
    "Orange Partenaire",
    "Orange Franchise",
    "Orange Distribution",
    "Orange Retail Point",
    "Orange Seller",
    "Orange Marchand",
    "Orange Zone Commerciale",
    "Orange Quartier",
    "Orange Débit",
    "Orange Boutique Locale"
]

ZONES = [
    "Bamako Centre",
    "Bamako Nord",
    "Bamako Sud",
    "Bamako Est",
    "Bamako Ouest",
    "Kati",
    "Koulikoro",
    "Sikasso"
]

SOUS_ZONES_MAP = {
    "Bamako Centre": ["Zone 1", "Zone 2", "Zone 3"],
    "Bamako Nord": ["Hippodrome", "Koulouba", "Bankadjalan"],
    "Bamako Sud": ["Magnambougou", "Dalibougou", "Lassa"],
    "Bamako Est": ["Commune V", "Commune VI", "Faladie"],
    "Bamako Ouest": ["Aci 2000", "Commune II", "Faladié"],
    "Kati": ["Centre Kati", "Kati Est", "Kati Ouest"],
    "Koulikoro": ["Centre Koulikoro", "Kolokani", "Niono"],
    "Sikasso": ["Centre Sikasso", "Sikasso Nord", "Sikasso Sud"]
}


def create_tables():
    """Create all database tables."""
    # Drop all tables first to ensure clean state
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created")


def create_users(db):
    """Create users (admin, managers, supervisors)."""
    users = []
    
    # Admin user
    admin = User(
        email="admin@faroukmanager.com",
        nom="Admin",
        prenom="FaroukManager",
        hashed_password=pwd_context.hash("Admin2026!"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db.add(admin)
    users.append(admin)
    
    # Managers
    manager_names = [("Malik", "Cisse"), ("Aïssatou", "Sow")]
    for i, (nom, prenom) in enumerate(manager_names):
        manager = User(
            email=f"manager{i+1}@faroukmanager.com",
            nom=nom,
            prenom=prenom,
            hashed_password=pwd_context.hash("Manager2026!"),
            role=UserRole.MANAGER,
            zone=ZONES[i % len(ZONES)],
            is_active=True
        )
        db.add(manager)
        users.append(manager)
    
    # Supervisors (one per zone)
    for i, zone in enumerate(ZONES):
        first = random.choice(MALIAN_FIRST_NAMES)
        last = random.choice(MALIAN_LAST_NAMES)
        supervisor = User(
            email=f"superviseur{i+1}@faroukmanager.com",
            nom=last,
            prenom=first,
            hashed_password=pwd_context.hash("Superviseur2026!"),
            role=UserRole.SUPERVISEUR,
            zone=zone,
            is_active=True
        )
        db.add(supervisor)
        users.append(supervisor)
    
    db.commit()
    print(f"✅ Created {len(users)} users")
    return users


def create_pdvs(db):
    """Create PDVs with realistic distribution."""
    pdvs = []
    pdv_counter = 1000
    supervisors = db.query(User).filter(User.role == UserRole.SUPERVISEUR).all()
    
    for zone in ZONES:
        sous_zones = SOUS_ZONES_MAP.get(zone, ["Default"])
        # 25 PDVs per zone
        for i in range(25):
            pdv_counter += 1
            pdv_type = random.choices(
                [PDVType.RS, PDVType.RSF, PDVType.RNS, PDVType.KIOSQUE],
                weights=[60, 20, 15, 5]
            )[0]
            
            # Some PDVs are inactive or in recovery
            statut = random.choices(
                [PDVStatut.ACTIF, PDVStatut.INACTIF, PDVStatut.RECUPERATION],
                weights=[70, 20, 10]
            )[0]
            
            supervisor = [s for s in supervisors if s.zone == zone]
            supervisor = supervisor[0] if supervisor else supervisors[0]
            
            pdv = PDV(
                numero_pdv=f"PDV{pdv_counter}",
                nom=f"{random.choice(PDV_NAMES)} - {zone}",
                type_pdv=pdv_type,
                statut=statut,
                zone=zone,
                sous_zone=random.choice(sous_zones),
                quartier=f"Quartier {random.randint(1, 5)}",
                commune=f"Commune {zone}",
                superviseur=supervisor.nom,
                telephone=f"+223 {random.randint(60000000, 99999999)}",
                nom_gerant=f"{random.choice(MALIAN_FIRST_NAMES)} {random.choice(MALIAN_LAST_NAMES)}",
                date_activation=datetime.utcnow() - timedelta(days=random.randint(30, 365)),
                numero_flotte=random.choice([True, False]),
                sim_au_bureau=random.choice([True, False]),
                sim_coupee=random.choice([True, False]) if random.random() < 0.1 else False,
                nouvelle_creation=random.choice([True, False]) if random.random() < 0.05 else False,
                health_score=50.0,
                segment="Stable",
                score_risque=0.0
            )
            db.add(pdv)
            pdvs.append(pdv)
    
    db.commit()
    print(f"✅ Created {len(pdvs)} PDVs")
    return pdvs


def create_performance_data(db, pdvs):
    """Create 12 months and 12 weeks of performance data."""
    weekly_perfs = []
    monthly_perfs = []
    
    now = datetime.utcnow()
    
    for pdv in pdvs:
        # Create 12 months of monthly data
        for months_back in range(12):
            perf_date = now - timedelta(days=30 * months_back)
            annee = perf_date.year
            mois = perf_date.month
            
            # Realistic CA based on PDV type
            if pdv.type_pdv == PDVType.KIOSQUE:
                base_ca = random.randint(50000, 300000)
            elif pdv.type_pdv == PDVType.RNS:
                base_ca = random.randint(100000, 500000)
            elif pdv.type_pdv == PDVType.RSF:
                base_ca = random.randint(200000, 1000000)
            else:  # RS
                base_ca = random.randint(300000, 2000000)
            
            # Add trend (some declining, some growing)
            trend_factor = 1.0 + (random.random() - 0.5) * 0.3 * (1 - months_back / 12)
            
            ca = base_ca * trend_factor
            if pdv.statut == PDVStatut.INACTIF:
                ca = 0
            
            est_actif = ca > 0
            
            nb_operations = random.randint(5, 50) if est_actif else 0
            nb_depots = random.randint(2, 15) if est_actif else 0
            montant_depots = random.randint(50000, 500000) if est_actif else 0
            nb_retraits = random.randint(2, 15) if est_actif else 0
            montant_retraits = random.randint(50000, 500000) if est_actif else 0
            montant_transaction = max(0, ca)
            montant_ca = round(min(montant_transaction, montant_retraits + random.uniform(0.75, 1.0) * montant_depots * 0.15), 2) if est_actif else 0
            commission_pdg = round(montant_ca * random.uniform(0.008, 0.02), 2) if est_actif else 0
            commission_revendeur = round(montant_ca * random.uniform(0.003, 0.01), 2) if est_actif else 0
            ratio_ca_transaction = round((montant_ca / montant_transaction) * 100, 2) if montant_transaction > 0 else 0

            monthly_perf = MonthlyPerformance(
                pdv_id=pdv.id,
                annee=annee,
                mois=mois,
                ca=montant_transaction,
                montant_transaction=montant_transaction,
                montant_ca=montant_ca,
                nb_operations=nb_operations,
                nb_depots=nb_depots,
                montant_depots=montant_depots,
                nb_retraits=nb_retraits,
                montant_retraits=montant_retraits,
                commission_pdg=commission_pdg,
                commission_revendeur=commission_revendeur,
                ratio_ca_transaction=ratio_ca_transaction,
                est_actif=est_actif
            )
            db.add(monthly_perf)
            monthly_perfs.append(monthly_perf)
        
        # Create 52 weeks of weekly data for current year
        for week in range(1, 53):
            week_date = now - timedelta(weeks=52 - week)
            annee = week_date.year
            semaine = week
            
            # Base CA from monthly data
            base_weekly_ca = random.randint(int(base_ca / 4 * 0.7), int(base_ca / 4 * 1.3))
            
            # Trend
            trend_factor = 1.0 + (random.random() - 0.5) * 0.4
            weekly_ca = base_weekly_ca * trend_factor
            
            if pdv.statut == PDVStatut.INACTIF:
                weekly_ca = 0
            
            est_actif = weekly_ca > 0
            
            nb_operations = random.randint(2, 15) if est_actif else 0
            nb_depots = random.randint(1, 5) if est_actif else 0
            montant_depots = random.randint(20000, 200000) if est_actif else 0
            nb_retraits = random.randint(1, 5) if est_actif else 0
            montant_retraits = random.randint(20000, 200000) if est_actif else 0
            montant_transaction = max(0, weekly_ca)
            montant_ca = round(min(montant_transaction, montant_retraits + random.uniform(0.75, 1.0) * montant_depots * 0.15), 2) if est_actif else 0
            commission_pdg = round(montant_ca * random.uniform(0.008, 0.02), 2) if est_actif else 0
            commission_revendeur = round(montant_ca * random.uniform(0.003, 0.01), 2) if est_actif else 0
            ratio_ca_transaction = round((montant_ca / montant_transaction) * 100, 2) if montant_transaction > 0 else 0

            weekly_perf = WeeklyPerformance(
                pdv_id=pdv.id,
                annee=annee,
                semaine=semaine,
                ca=montant_transaction,
                montant_transaction=montant_transaction,
                montant_ca=montant_ca,
                nb_operations=nb_operations,
                nb_depots=nb_depots,
                montant_depots=montant_depots,
                nb_retraits=nb_retraits,
                montant_retraits=montant_retraits,
                commission_pdg=commission_pdg,
                commission_revendeur=commission_revendeur,
                ratio_ca_transaction=ratio_ca_transaction,
                est_actif=est_actif
            )
            db.add(weekly_perf)
            weekly_perfs.append(weekly_perf)
    
    db.commit()

    # Calculer taux_variation mensuel (comparaison mois précédent)
    all_monthly = db.query(MonthlyPerformance).order_by(
        MonthlyPerformance.pdv_id, MonthlyPerformance.annee, MonthlyPerformance.mois
    ).all()
    perf_index = {(p.pdv_id, p.annee, p.mois): p for p in all_monthly}
    for p in all_monthly:
        prev_mois = p.mois - 1 if p.mois > 1 else 12
        prev_annee = p.annee if p.mois > 1 else p.annee - 1
        prev = perf_index.get((p.pdv_id, prev_annee, prev_mois))
        if prev and prev.ca and prev.ca > 0:
            p.taux_variation = round(((p.ca - prev.ca) / prev.ca) * 100, 2)
        else:
            p.taux_variation = 0.0

    # Calculer taux_variation hebdomadaire (comparaison semaine précédente)
    all_weekly = db.query(WeeklyPerformance).order_by(
        WeeklyPerformance.pdv_id, WeeklyPerformance.annee, WeeklyPerformance.semaine
    ).all()
    weekly_index = {(p.pdv_id, p.annee, p.semaine): p for p in all_weekly}
    for p in all_weekly:
        prev_sem = p.semaine - 1 if p.semaine > 1 else 52
        prev_ann = p.annee if p.semaine > 1 else p.annee - 1
        prev = weekly_index.get((p.pdv_id, prev_ann, prev_sem))
        if prev and prev.ca and prev.ca > 0:
            p.taux_variation = round(((p.ca - prev.ca) / prev.ca) * 100, 2)
        else:
            p.taux_variation = 0.0

    db.commit()
    print(f"✅ Created {len(monthly_perfs)} monthly performances")
    print(f"✅ Created {len(weekly_perfs)} weekly performances")
    print(f"✅ taux_variation calculé pour {len(all_monthly)} mois et {len(all_weekly)} semaines")


def create_terrain_actions(db):
    """Create 50 terrain actions."""
    actions = []
    pdvs = db.query(PDV).all()
    users = db.query(User).filter(User.role == UserRole.SUPERVISEUR).all()
    
    for i in range(50):
        pdv = random.choice(pdvs)
        user = random.choice(users)
        
        action = TerrainAction(
            pdv_id=pdv.id,
            user_id=user.id,
            type_action=random.choice(list(ActionType)),
            resultat=random.choices(
                list(ActionResultat),
                weights=[25, 25, 20, 20, 10]
            )[0],
            notes=f"Action terrain du {datetime.utcnow().strftime('%Y-%m-%d')}",
            date_action=datetime.utcnow() - timedelta(days=random.randint(1, 30))
        )
        db.add(action)
        actions.append(action)
    
    db.commit()
    print(f"✅ Created {len(actions)} terrain actions")


def create_recovery_records(db):
    """Create 30 recovery records."""
    recoveries = []
    pdvs = db.query(PDV).filter(
        and_(
            PDV.statut == PDVStatut.INACTIF,
            PDV.sim_coupee == True
        )
    ).all()
    
    # Use up to 30 PDVs for recovery
    recovery_pdvs = random.sample(pdvs, min(30, len(pdvs)))
    
    for pdv in recovery_pdvs:
        recovery = Recovery(
            pdv_id=pdv.id,
            statut=random.choices(
                list(RecoveryStatut),
                weights=[30, 25, 20, 15, 10]
            )[0],
            ca_cumule_3mois=random.randint(100000, 1000000),
            date_identification=datetime.utcnow() - timedelta(days=random.randint(7, 90)),
            date_contact=datetime.utcnow() - timedelta(days=random.randint(1, 60)) if random.random() > 0.3 else None,
            superviseur_responsable=random.choice([s.nom for s in db.query(User).filter(User.role == UserRole.SUPERVISEUR).all()]),
            notes="PDV en processus de récupération"
        )
        db.add(recovery)
        recoveries.append(recovery)
    
    db.commit()
    print(f"✅ Created {len(recoveries)} recovery records")


def update_health_scores(db):
    """Update health scores for all PDVs."""
    from app.ai.health_score import calculate_health_score, classify_segment
    
    pdvs = db.query(PDV).all()
    for pdv in pdvs:
        weekly_perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.pdv_id == pdv.id
        ).order_by(WeeklyPerformance.annee, WeeklyPerformance.semaine).all()
        
        health_score = calculate_health_score(pdv, weekly_perfs)
        
        # Calculate trend
        if len(weekly_perfs) >= 2:
            recent_ca = [wp.ca for wp in weekly_perfs[-8:] if wp.ca > 0]
            if len(recent_ca) >= 2:
                import statistics
                x = list(range(len(recent_ca)))
                mean_x = statistics.mean(x)
                mean_y = statistics.mean(recent_ca)
                numerator = sum((x[i] - mean_x) * (recent_ca[i] - mean_y) for i in range(len(x)))
                denominator = sum((x[i] - mean_x) ** 2 for i in range(len(x)))
                ca_trend = (numerator / denominator) if denominator > 0 else 0
            else:
                ca_trend = 0
        else:
            ca_trend = 0
        
        segment = classify_segment(health_score, ca_trend)
        
        pdv.health_score = health_score
        pdv.segment = segment
        pdv.score_risque = abs(min(1.0, ca_trend / 100000)) if ca_trend < 0 else 0
    
    db.commit()
    print(f"✅ Updated health scores for {len(pdvs)} PDVs")


def print_summary(db):
    """Print summary of created data."""
    from sqlalchemy import func
    
    total_pdvs = db.query(PDV).count()
    total_users = db.query(User).count()
    total_weekly_perfs = db.query(WeeklyPerformance).count()
    total_monthly_perfs = db.query(MonthlyPerformance).count()
    total_actions = db.query(TerrainAction).count()
    total_recoveries = db.query(Recovery).count()
    
    active_pdvs = db.query(PDV).filter(PDV.statut == PDVStatut.ACTIF).count()
    total_ca = db.query(func.sum(MonthlyPerformance.ca)).scalar() or 0
    
    print("\n" + "="*60)
    print("📊 FaroukManager Seed Data Summary")
    print("="*60)
    print(f"Users created:              {total_users}")
    print(f"PDVs created:               {total_pdvs}")
    print(f"  - Active PDVs:            {active_pdvs}")
    print(f"  - Inactive PDVs:          {total_pdvs - active_pdvs}")
    print(f"Monthly performances:       {total_monthly_perfs}")
    print(f"Weekly performances:        {total_weekly_perfs}")
    print(f"Terrain actions:            {total_actions}")
    print(f"Recovery records:           {total_recoveries}")
    print(f"Total CA (all months):      {total_ca:,.0f} FCFA")
    print("="*60)
    print("✅ Seed data successfully created!")
    print("🚀 Ready to start the FaroukManager backend")
    print("="*60 + "\n")


def main():
    """Main seed function."""
    print("\n🌱 Starting FaroukManager seed data creation...\n")
    
    # Create tables
    create_tables()
    
    # Create session
    db = SessionLocal()
    
    try:
        # Create data
        create_users(db)
        pdvs = create_pdvs(db)
        create_performance_data(db, pdvs)
        create_terrain_actions(db)
        create_recovery_records(db)
        update_health_scores(db)
        
        # Print summary
        print_summary(db)
        
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()
