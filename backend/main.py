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


@app.get("/api/dashboard/accueil-complet")
async def accueil_complet(
    annee: int = 2026,
    mois: int = 4,
    db = None
):
    """Endpoint agrégé - toutes les données de l'accueil en 1 requête"""
    from app.core.database import SessionLocal
    from app.models.performance import MonthlyPerformance, WeeklyPerformance
    from app.models.pdv import PDV, PDVStatut
    from sqlalchemy import func
    
    db = SessionLocal()
    try:
        # 1. Last available
        last_month = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).order_by(
            MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
        ).first()
        last_week = db.query(WeeklyPerformance.annee, WeeklyPerformance.semaine).order_by(
            WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()
        ).first()
        
        mois_dispo = db.query(
            func.distinct(MonthlyPerformance.annee * 100 + MonthlyPerformance.mois)
        ).order_by((MonthlyPerformance.annee * 100 + MonthlyPerformance.mois).asc()).all()
        
        semaines_dispo = db.query(
            func.distinct(WeeklyPerformance.annee * 100 + WeeklyPerformance.semaine)
        ).order_by((WeeklyPerformance.annee * 100 + WeeklyPerformance.semaine).asc()).all()

        # 2. Stats PDVs
        total_pdvs = db.query(func.count(PDV.id)).scalar()
        actifs_db = db.query(func.count(PDV.id)).filter(PDV.statut == PDVStatut.ACTIF).scalar()
        recup = db.query(func.count(PDV.id)).filter(PDV.statut == PDVStatut.RECUPERATION).scalar()
        
        # 3. Dashboard mensuel agrégé
        monthly_agg = db.query(
            func.count(MonthlyPerformance.id).label('total'),
            func.sum(MonthlyPerformance.montant_transaction).label('ca'),
            func.sum(MonthlyPerformance.montant_ca).label('montant_ca'),
            func.sum(MonthlyPerformance.nb_operations).label('ops'),
            func.sum(MonthlyPerformance.commission_pdg).label('comm'),
        ).filter(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois
        ).first()
        pdvs_actifs_count = db.query(func.count(MonthlyPerformance.id)).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois,
            MonthlyPerformance.est_actif == True
        ).scalar() or 0
        
        # Inactifs ce mois
        inactifs = db.query(func.count(MonthlyPerformance.id)).filter(
            MonthlyPerformance.annee == annee,
            MonthlyPerformance.mois == mois,
            MonthlyPerformance.est_actif == False
        ).scalar()

        return {
            "last_available": {
                "last_month": {"annee": last_month[0], "mois": last_month[1]} if last_month else None,
                "last_week": {"annee": last_week[0], "semaine": last_week[1]} if last_week else None,
                "mois_disponibles": [{"annee": m[0]//100, "mois": m[0]%100} for m in mois_dispo],
                "semaines_disponibles": [{"annee": s[0]//100, "semaine": s[0]%100} for s in semaines_dispo],
            },
            "pdv_stats": {
                "total_pdvs": total_pdvs,
                "actifs": actifs_db,
                "inactifs": inactifs,
                "en_recuperation": recup,
            },
            "dashboard_mensuel": {
                "total_pdvs": total_pdvs,
                "active_pdvs": pdvs_actifs_count,
                "inactive_pdvs": inactifs,
                "total_montant_transaction": float(monthly_agg.ca or 0),
                "total_montant_ca": float(monthly_agg.montant_ca or 0),
                "total_operations": int(monthly_agg.ops or 0),
                "total_commission_pdg": float(monthly_agg.comm or 0),
            }
        }
    finally:
        db.close()


@app.get("/api/dashboard/omy-complet")
async def omy_complet(annee: int = 2026, mois: int = 4, semaine: int = None):
    """Endpoint agrégé - toutes les données du dashboard OMY en 1 requête"""
    from app.core.database import SessionLocal
    from app.models.performance import MonthlyPerformance, WeeklyPerformance
    from app.models.pdv import PDV, PDVStatut
    from sqlalchemy import func, desc
    
    db = SessionLocal()
    try:
        # 1. Stats globales du mois
        monthly_agg = db.query(
            func.count(MonthlyPerformance.id).label('total'),
            func.sum(MonthlyPerformance.montant_transaction).label('ca'),
            func.sum(MonthlyPerformance.montant_ca).label('montant_ca'),
            func.sum(MonthlyPerformance.nb_operations).label('ops'),
            func.sum(MonthlyPerformance.commission_pdg).label('comm'),
            func.sum(MonthlyPerformance.commission_revendeur).label('comm_rev'),
            func.sum(MonthlyPerformance.nb_depots).label('depots'),
            func.sum(MonthlyPerformance.nb_retraits).label('retraits'),

        ).filter(MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois).first()
        pdvs_actifs_count = db.query(func.count(MonthlyPerformance.id)).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois,
            MonthlyPerformance.est_actif == True
        ).scalar() or 0

        inactifs = db.query(func.count(MonthlyPerformance.id)).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois,
            MonthlyPerformance.est_actif == False
        ).scalar()

        total_pdvs = db.query(func.count(PDV.id)).scalar()

        # 2. Top 10 PDVs
        top_pdvs = db.query(MonthlyPerformance, PDV).join(PDV).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois,
            MonthlyPerformance.est_actif == True
        ).order_by(desc(MonthlyPerformance.montant_transaction)).limit(10).all()

        # 3. Stats par zone
        zones_agg = db.query(
            PDV.zone,
            func.count(MonthlyPerformance.id).label('count'),
            func.sum(MonthlyPerformance.montant_transaction).label('ca'),
            func.count(MonthlyPerformance.id).label('actifs_total'),
        ).join(PDV, MonthlyPerformance.pdv_id == PDV.id).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois, PDV.zone != None
        ).group_by(PDV.zone).all()

        # 4. Last available
        last_month = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).order_by(
            MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).first()
        last_week = db.query(WeeklyPerformance.annee, WeeklyPerformance.semaine).order_by(
            WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()).first()
        mois_dispo = db.query(func.distinct(MonthlyPerformance.annee * 100 + MonthlyPerformance.mois)).order_by(
            (MonthlyPerformance.annee * 100 + MonthlyPerformance.mois).asc()).all()
        semaines_dispo = db.query(func.distinct(WeeklyPerformance.annee * 100 + WeeklyPerformance.semaine)).order_by(
            (WeeklyPerformance.annee * 100 + WeeklyPerformance.semaine).asc()).all()

        ca_total = float(monthly_agg.ca or 0)
        montant_ca = float(monthly_agg.montant_ca or 0)

        return {
            "last_available": {
                "last_month": {"annee": last_month[0], "mois": last_month[1]} if last_month else None,
                "last_week": {"annee": last_week[0], "semaine": last_week[1]} if last_week else None,
                "mois_disponibles": [{"annee": m[0]//100, "mois": m[0]%100} for m in mois_dispo],
                "semaines_disponibles": [{"annee": s[0]//100, "semaine": s[0]%100} for s in semaines_dispo],
            },
            "dashboard": {
                "total_pdvs": total_pdvs,
                "active_pdvs": pdvs_actifs_count,
                "inactive_pdvs": inactifs,
                "total_montant_transaction": ca_total,
                "total_montant_ca": montant_ca,
                "total_operations": int(monthly_agg.ops or 0),
                "total_commission_pdg": float(monthly_agg.comm or 0),
                "total_commission_revendeur": float(monthly_agg.comm_rev or 0),
                "total_depots": int(monthly_agg.depots or 0),
                "total_retraits": int(monthly_agg.retraits or 0),
                "ratio_ca_transaction": round(montant_ca / ca_total * 100, 2) if ca_total > 0 else 0,
                "taux_activite": round(pdvs_actifs_count / total_pdvs * 100, 1) if total_pdvs > 0 else 0,
            },
            "top_pdvs": [{"numero_pdv": p.numero_pdv, "nom": p.nom, "zone": p.zone, 
                          "ca": float(m.montant_transaction or 0), "nb_operations": m.nb_operations,
                          "superviseur": p.superviseur} for m, p in top_pdvs],
            "ca_by_zone": {z.zone: {"ca": float(z.ca or 0), "count": z.count, "actifs": int(z.actifs or 0)} 
                          for z in zones_agg if z.zone},
        }
    finally:
        db.close()


@app.get("/debug-omy-complet")
async def debug_omy_complet(annee: int = 2026, mois: int = 4):
    """Debug endpoint pour omy-complet"""
    from app.core.database import SessionLocal
    from app.models.performance import MonthlyPerformance, WeeklyPerformance
    from app.models.pdv import PDV, PDVStatut
    from sqlalchemy import func, desc
    import traceback
    
    db = SessionLocal()
    try:
        step = "monthly_agg"
        monthly_agg = db.query(
            func.count(MonthlyPerformance.id).label('total'),
            func.sum(MonthlyPerformance.montant_transaction).label('ca'),
            func.sum(MonthlyPerformance.montant_ca).label('montant_ca'),
            func.sum(MonthlyPerformance.nb_operations).label('ops'),
            func.sum(MonthlyPerformance.commission_pdg).label('comm'),
            func.sum(MonthlyPerformance.commission_revendeur).label('comm_rev'),
            func.sum(MonthlyPerformance.nb_depots).label('depots'),
            func.sum(MonthlyPerformance.nb_retraits).label('retraits'),
        ).filter(MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois).first()
        
        step = "pdvs_actifs_count"
        pdvs_actifs_count = db.query(func.count(MonthlyPerformance.id)).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois,
            MonthlyPerformance.est_actif == True
        ).scalar() or 0
        
        step = "total_pdvs"
        total_pdvs = db.query(func.count(PDV.id)).scalar()
        
        step = "top_pdvs"
        top_pdvs = db.query(MonthlyPerformance, PDV).join(PDV).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois,
            MonthlyPerformance.est_actif == True
        ).order_by(desc(MonthlyPerformance.montant_transaction)).limit(5).all()
        
        step = "zones_agg"
        zones_agg = db.query(
            PDV.zone,
            func.count(MonthlyPerformance.id).label('count'),
            func.sum(MonthlyPerformance.montant_transaction).label('ca'),
        ).join(PDV, MonthlyPerformance.pdv_id == PDV.id).filter(
            MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois, PDV.zone != None
        ).group_by(PDV.zone).all()
        
        return {
            "status": "ok",
            "step_reached": step,
            "monthly_ca": float(monthly_agg.ca or 0),
            "pdvs_actifs": pdvs_actifs_count,
            "total_pdvs": total_pdvs,
            "top_pdvs_count": len(top_pdvs),
            "zones_count": len(zones_agg),
        }
    except Exception as e:
        return {"error": str(e), "step": step, "traceback": traceback.format_exc()[-500:]}
    finally:
        db.close()
