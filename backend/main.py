from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import time

# Cache global en mémoire (survit aux requêtes, pas aux redémarrages)
_APP_CACHE = {}
_APP_CACHE_TIME = {}
CACHE_TTL = 600  # 10 minutes

def get_cache(key):
    if key in _APP_CACHE and (time.time() - _APP_CACHE_TIME.get(key, 0)) < CACHE_TTL:
        return _APP_CACHE[key]
    return None

def set_cache(key, value):
    _APP_CACHE[key] = value
    _APP_CACHE_TIME[key] = time.time()
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
    # Précalculer les données lentes en arrière-plan
    asyncio.create_task(warmup_cache())

async def warmup_cache():
    """Précalculer les données lentes au démarrage"""
    import asyncio
    await asyncio.sleep(5)  # Attendre que le serveur soit prêt
    try:
        from app.core.database import SessionLocal
        from app.ai.predictions import get_at_risk_pdvs, forecast_network_ca
        db = SessionLocal()
        print("🔥 Warmup cache: calcul des prédictions...")
        at_risk = get_at_risk_pdvs(db, threshold=0.3)
        forecast = forecast_network_ca(db, horizon_weeks=4)
        set_cache("predictions", {"at_risk": at_risk, "forecast": forecast})
        print(f"✅ Warmup terminé: {len(at_risk)} PDVs à risque calculés")
        db.close()
    except Exception as e:
        print(f"⚠️ Warmup échoué: {e}")

@app.on_event("startup")
async def startup_event_original():
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


@app.get("/fix-commissions-types")
async def fix_commissions_types():
    """Corriger gere_reversement selon le type PDV"""
    from app.core.database import SessionLocal
    from app.models.commission import CommissionEntry, PDVType as CommPDVType, ReversementStatus, TAUX_RESEAU, TAUX_PDV, TYPE_GERE_REVERSEMENT
    from sqlalchemy import func
    
    db = SessionLocal()
    entries = db.query(CommissionEntry).all()
    fixed = 0
    
    for e in entries:
        correct_gere = TYPE_GERE_REVERSEMENT.get(e.pdv_type, True)
        if e.gere_reversement != correct_gere:
            e.gere_reversement = correct_gere
            e.reversement_status = ReversementStatus.EN_ATTENTE if correct_gere else ReversementStatus.NON_APPLICABLE
            fixed += 1
    
    db.commit()
    
    # Stats après correction
    stats = db.query(
        CommissionEntry.pdv_type,
        CommissionEntry.gere_reversement,
        func.count(CommissionEntry.id)
    ).group_by(CommissionEntry.pdv_type, CommissionEntry.gere_reversement).all()
    
    db.close()
    return {
        "fixed": fixed,
        "stats": [{"type": str(t), "gere": g, "count": c} for t, g, c in stats]
    }
