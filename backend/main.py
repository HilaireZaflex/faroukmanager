from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api.routes import auth, pdv, dashboard, alerts, analytics, reports, performance, superviseurs, gestionnaires, potentialites, grades, envois, prospects, prospect_extras, indicators, commissions, evaluations, developpeurs, role_permissions
import app.models  # noqa - ensures all models are registered

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Système de gestion intelligente du réseau PDV - Orange Mali"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://faroukmanager.onrender.com",
        "http://localhost:3000",
        "https://faroukmanager-frontend-production-70a6.up.railway.app",
        "https://faroukmanager-frontend-production.up.railway.app",
        "https://faroukmanager-frontend.up.railway.app",
        "https://faroukmanager.up.railway.app",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api", tags=["Authentification"])
app.include_router(pdv.router, prefix="/api", tags=["PDV"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(alerts.router, prefix="/api", tags=["Alertes"])
app.include_router(analytics.router, prefix="/api", tags=["Analytics IA"])
app.include_router(reports.router, prefix="/api", tags=["Rapports"])
app.include_router(performance.router, prefix="/api", tags=["Performances"])
app.include_router(superviseurs.router, prefix="/api", tags=["Superviseurs"])
app.include_router(gestionnaires.router, prefix="/api", tags=["Gestionnaires"])
app.include_router(potentialites.router, prefix="/api", tags=["Potentialites"])
app.include_router(grades.router, prefix="/api", tags=["Grades"])
app.include_router(envois.router, prefix="/api", tags=["Envois"])
app.include_router(prospects.router, prefix="/api", tags=["Prospection"])
app.include_router(prospect_extras.router, prefix="/api", tags=["Prospection - Extras"])
app.include_router(indicators.router, prefix="/api", tags=["Indicateurs"])
app.include_router(commissions.router, prefix="/api", tags=["Commissions"])
app.include_router(evaluations.router, prefix="/api", tags=["Évaluations"])
app.include_router(developpeurs.router, prefix="/api", tags=["Développeurs"])
app.include_router(role_permissions.router, prefix="/api", tags=["Permissions"])

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "FaroukManager API", "version": settings.APP_VERSION, "status": "running"}

@app.get("/reset-admin")
async def reset_admin():
    """Route temporaire pour réinitialiser le mot de passe admin"""
    from app.core.database import SessionLocal
    from app.core.security import get_password_hash
    from app.models.user import User, UserRole
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if admin:
            admin.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
            db.commit()
            return {"message": f"✅ Mot de passe admin réinitialisé pour {settings.ADMIN_EMAIL}"}
        else:
            admin = User(
                email=settings.ADMIN_EMAIL,
                nom="Administrateur",
                prenom="",
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            return {"message": f"✅ Admin créé: {settings.ADMIN_EMAIL}"}
    finally:
        db.close()

@app.on_event("startup")
async def startup_event():
    from app.core.security import get_password_hash
    from app.core.database import SessionLocal
    from app.models.user import User, UserRole
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if admin:
            # Toujours mettre à jour le mot de passe avec celui des variables d'env
            admin.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
            db.commit()
            print(f"✅ Mot de passe admin mis à jour: {settings.ADMIN_EMAIL}")
        if not admin:
            admin_user = User(
                email=settings.ADMIN_EMAIL,
                nom=settings.ADMIN_NAME,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            print(f"✅ Admin créé: {settings.ADMIN_EMAIL}")
    finally:
        db.close()




@app.get("/migrate-pdv-columns")
async def migrate_pdv_columns():
    """Migration temporaire: ajoute les colonnes manquantes à la table pdvs"""
    from app.core.database import engine
    from sqlalchemy import text
    results = []
    with engine.connect() as conn:
        for col, col_type in [("single_wallet", "VARCHAR"), ("date_mise_a_jour", "VARCHAR")]:
            try:
                conn.execute(text(f"ALTER TABLE pdvs ADD COLUMN {col} {col_type}"))
                conn.commit()
                results.append(f"✅ Colonne {col} ajoutée")
            except Exception as e:
                results.append(f"⚠️ {col}: déjà existante ou erreur: {str(e)}")
    return {"message": "Migration terminée", "results": results}


@app.get("/update-segments")
async def update_segments():
    """Calculer et mettre à jour les segments et health scores des PDVs"""
    from app.core.database import SessionLocal
    from app.models.pdv import PDV
    from app.models.performance import WeeklyPerformance, MonthlyPerformance
    from sqlalchemy import func

    db = SessionLocal()
    pdvs = db.query(PDV).all()
    updated = 0
    
    for pdv in pdvs:
        perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.pdv_id == pdv.id
        ).order_by(WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()).limit(4).all()
        
        monthly = db.query(MonthlyPerformance).filter(
            MonthlyPerformance.pdv_id == pdv.id,
            MonthlyPerformance.annee == 2026
        ).order_by(MonthlyPerformance.mois.desc()).limit(3).all()
        
        if not perfs:
            pdv.segment = "Inactif"; pdv.health_score = 10.0; continue
        
        derniere_sem = perfs[0]
        est_actif_recent = derniere_sem.est_actif and derniere_sem.ca > 0
        semaines_inactives = sum(1 for p in perfs if not p.est_actif or p.ca == 0)
        
        if len(perfs) >= 2:
            ca_recent = perfs[0].ca or 0
            ca_avant = perfs[-1].ca or 1
            variation = ((ca_recent - ca_avant) / ca_avant * 100) if ca_avant > 0 else 0
        else:
            variation = 0
        
        ca_mensuel_moyen = sum(m.ca or 0 for m in monthly) / len(monthly) if monthly else 0
        
        if semaines_inactives >= 2:
            segment = "Inactif"; health = max(5, 30 - (semaines_inactives * 5))
        elif not est_actif_recent:
            segment = "À surveiller"; health = 35.0
        elif variation < -20:
            segment = "Déclinant"; health = max(20, 50 + variation/2)
        elif variation < -5:
            segment = "À surveiller"; health = max(40, 60 + variation/2)
        elif ca_mensuel_moyen > 500000000:
            segment = "Champion"; health = min(95, 75 + variation/4)
        else:
            segment = "Actif"; health = min(85, 65 + variation/4)
        
        pdv.segment = segment; pdv.health_score = round(health, 1)
        updated += 1
    
    db.commit()
    segments = db.query(PDV.segment, func.count(PDV.id)).group_by(PDV.segment).all()
    db.close()
    return {"updated": updated, "segments": {s: c for s,c in segments}}
