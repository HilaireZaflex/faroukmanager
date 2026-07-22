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
from app.api.routes import auth, pdv, dashboard, alerts, analytics, reports, performance, superviseurs, gestionnaires, potentialites, grades, envois, prospects, prospect_extras, indicators, commissions, evaluations, developpeurs, role_permissions, notifications
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
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
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
app.include_router(notifications.router, prefix="/api", tags=["Notifications"])
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




@app.get("/clean-orphan-performances")
async def clean_orphan_performances():
    """Supprime les performances (mensuelle/hebdo) liées à des PDVs DESACTIVES ou inexistants"""
    from app.core.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        # Récupérer uniquement les IDs de PDVs ACTIFS (non désactivés)
        valid_ids = {row[0] for row in db.execute(
            text("SELECT id FROM pdvs WHERE statut != 'DESACTIVE'")
        ).fetchall()}

        total_pdvs = db.execute(text("SELECT COUNT(*) FROM pdvs")).scalar()
        
        if not valid_ids:
            return {"message": "Aucun PDV valide trouvé", "pdvs_valides": 0}

        ids_str = ','.join(str(i) for i in valid_ids)

        # Supprimer performances mensuelles orphelines
        result_monthly = db.execute(text(
            f"DELETE FROM monthly_performances WHERE pdv_id NOT IN ({ids_str})"
        ))
        deleted_monthly = result_monthly.rowcount

        # Supprimer performances hebdomadaires orphelines
        result_weekly = db.execute(text(
            f"DELETE FROM weekly_performances WHERE pdv_id NOT IN ({ids_str})"
        ))
        deleted_weekly = result_weekly.rowcount

        db.commit()
        return {
            "message": "✅ Nettoyage terminé",
            "performances_mensuelles_supprimees": deleted_monthly,
            "performances_hebdomadaires_supprimees": deleted_weekly,
            "pdvs_valides": len(valid_ids),
            "pdvs_total_en_base": total_pdvs,
            "pdvs_desactives": total_pdvs - len(valid_ids)
        }
    finally:
        db.close()

@app.get("/update-taux-variation")
async def update_taux_variation():
    """Recalcule le taux_variation (semaine N vs N-1) pour toutes les performances hebdo"""
    from app.core.database import SessionLocal
    from app.models.performance import WeeklyPerformance
    from sqlalchemy import text
    db = SessionLocal()
    try:
        # Récupérer toutes les semaines distinctes
        semaines = db.execute(text(
            "SELECT DISTINCT annee, semaine FROM weekly_performances ORDER BY annee, semaine"
        )).fetchall()
        
        updated = 0
        for annee, semaine in semaines:
            sem_prec = semaine - 1 if semaine > 1 else 52
            annee_prec = annee if semaine > 1 else annee - 1
            
            # Mettre à jour taux_variation pour chaque PDV
            db.execute(text(f"""
                UPDATE weekly_performances w
                SET taux_variation = CASE 
                    WHEN prev.ca > 0 THEN ROUND(((w.ca - prev.ca) / prev.ca * 100)::numeric, 2)
                    WHEN w.ca > 0 THEN 100.0
                    ELSE 0.0
                END
                FROM (
                    SELECT pdv_id, ca FROM weekly_performances
                    WHERE annee = {annee_prec} AND semaine = {sem_prec}
                ) prev
                WHERE w.pdv_id = prev.pdv_id
                AND w.annee = {annee} AND w.semaine = {semaine}
            """))
            updated += db.execute(text(
                f"SELECT COUNT(*) FROM weekly_performances WHERE annee={annee} AND semaine={semaine}"
            )).scalar()
        
        db.commit()
        return {"message": f"✅ taux_variation recalculé", "semaines_traitees": len(semaines), "lignes_total": updated}
    finally:
        db.close()

@app.get("/purge-desactives")
async def purge_desactives():
    """Supprime définitivement les PDVs DESACTIVES et toutes leurs données liées"""
    from app.core.database import SessionLocal
    from sqlalchemy import text
    db = SessionLocal()
    try:
        # Récupérer les IDs des PDVs DESACTIVES
        desactives = db.execute(text("SELECT id, numero_pdv FROM pdvs WHERE statut = 'DESACTIVE'")).fetchall()
        if not desactives:
            return {"message": "✅ Aucun PDV DESACTIVE trouvé", "supprimés": 0}
        
        ids = [str(row[0]) for row in desactives]
        numeros = [row[1] for row in desactives]
        ids_str = ','.join(ids)
        
        # Trouver toutes les tables qui ont une FK vers pdvs via information_schema
        fk_tables = db.execute(text("""
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.referential_constraints AS rc
                ON tc.constraint_name = rc.constraint_name
            JOIN information_schema.table_constraints AS ccu
                ON ccu.constraint_name = rc.unique_constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = 'pdvs'
        """)).fetchall()
        
        stats = {}
        for table_name, col_name in fk_tables:
            try:
                n = db.execute(text(f'DELETE FROM "{table_name}" WHERE "{col_name}" IN ({ids_str})')).rowcount
                if n > 0:
                    stats[table_name] = n
            except Exception as e:
                stats[f"{table_name}_erreur"] = str(e)[:50]
        
        # Supprimer les PDVs eux-mêmes
        del_pdvs = db.execute(text("DELETE FROM pdvs WHERE statut = 'DESACTIVE'")).rowcount
        
        db.commit()
        return {
            "message": f"✅ Purge complète terminée",
            "pdvs_supprimes": del_pdvs,
            "donnees_liees_supprimees": stats,
            "numeros_supprimes": numeros[:10]
        }
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()

@app.get("/api/reseau/equipe")
async def get_equipe_reseau():
    """Retourne la liste de toute l'équipe réseau avec leurs numéros de téléphone"""
    from app.core.database import SessionLocal
    from app.models.pdv import PDV
    from sqlalchemy import text

    db = SessionLocal()
    try:
        # Créer la table si elle n'existe pas
        try:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS equipe_reseau (
                    id SERIAL PRIMARY KEY,
                    nom VARCHAR(200) NOT NULL,
                    role VARCHAR(50) NOT NULL,
                    telephone VARCHAR(50),
                    email VARCHAR(100),
                    zone VARCHAR(100),
                    UNIQUE(nom, role)
                )
            """))
            db.commit()
        except Exception as e:
            db.rollback()

        # Charger les numéros sauvegardés
        try:
            phones_rows = db.execute(text("SELECT nom, role, telephone, zone FROM equipe_reseau")).fetchall()
            phones = {(r[0], r[1]): {"telephone": r[2], "zone": r[3]} for r in phones_rows}
        except:
            phones = {}

        pdvs = db.query(PDV).filter(PDV.statut != 'DESACTIVE').all()

        superviseurs    = {}
        gestionnaires   = {}
        developpeurs    = {}
        teleconseilleres = {}
        rc              = {}
        conformite      = {}

        EXCLUS = {'AU BUREAU', 'NAN', 'NONE', '', '1172'}

        # 1. Extraire depuis les PDVs
        for p in pdvs:
            for attr, dct, role in [
                ('superviseur', superviseurs, 'superviseur'),
                ('gestionnaire', gestionnaires, 'gestionnaire'),
                ('developpeur', developpeurs, 'developpeur'),
                ('teleconseillere', teleconseilleres, 'teleconseillere'),
            ]:
                val = getattr(p, attr, None)
                if val and val.strip().upper() not in {e.upper() for e in EXCLUS}:
                    nom = val.strip()
                    if nom not in dct:
                        info = phones.get((nom, role), {})
                        dct[nom] = {
                            "telephone": info.get("telephone", "") if isinstance(info, dict) else "",
                            "zone": info.get("zone", "") if isinstance(info, dict) else "",
                        }

        # 2. Compléter avec la table equipe_reseau (membres manuels + ceux absents des PDVs)
        role_map = {
            'superviseur':    superviseurs,
            'gestionnaire':   gestionnaires,
            'developpeur':    developpeurs,
            'teleconseillere':teleconseilleres,
            'rc':             rc,
            'conformite':     conformite,
        }
        for nom_db, role_db in [(r[0], r[1]) for r in phones.keys()]:
            if role_db in role_map and nom_db not in role_map[role_db]:
                info = phones.get((nom_db, role_db), {})
                role_map[role_db][nom_db] = {
                    "telephone": info.get("telephone", "") if isinstance(info, dict) else "",
                    "zone": info.get("zone", "") if isinstance(info, dict) else "",
                }

        def to_list(dct):
            return [{"nom": k, "telephone": v.get("telephone",""), "zone": v.get("zone","")} for k, v in sorted(dct.items())]

        return {
            "superviseurs":    to_list(superviseurs),
            "gestionnaires":   to_list(gestionnaires),
            "developpeurs":    to_list(developpeurs),
            "teleconseilleres":to_list(teleconseilleres),
            "rc":              to_list(rc),
            "conformite":      to_list(conformite),
        }
    finally:
        db.close()

@app.post("/api/reseau/equipe/update")
async def update_equipe_reseau(data: dict):
    """Sauvegarde les numéros de téléphone de l'équipe réseau"""
    from app.core.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS equipe_reseau (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(200) NOT NULL,
                role VARCHAR(50) NOT NULL,
                telephone VARCHAR(50),
                email VARCHAR(100),
                zone VARCHAR(100),
                UNIQUE(nom, role)
            )
        """))
        db.commit()

        membres = data.get('membres', [])
        updated = 0
        for m in membres:
            nom = m.get('nom', '').strip()
            role = m.get('role', '').strip()
            tel = m.get('telephone', '').strip()
            if nom and role:
                db.execute(text("""
                    INSERT INTO equipe_reseau (nom, role, telephone)
                    VALUES (:nom, :role, :tel)
                    ON CONFLICT (nom, role) DO UPDATE SET telephone = :tel
                """), {"nom": nom, "role": role, "tel": tel})
                updated += 1

        db.commit()
        return {"message": f"✅ {updated} numéros sauvegardés", "updated": updated}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


@app.post("/api/reseau/equipe/add")
async def add_membre_equipe(data: dict):
    """Ajoute un nouveau membre à l'équipe réseau"""
    from app.core.database import SessionLocal
    from sqlalchemy import text
    db = SessionLocal()
    try:
        nom   = data.get('nom', '').strip()
        role  = data.get('role', '').strip()
        tel   = data.get('telephone', '').strip()
        email = data.get('email', '').strip()
        zone  = data.get('zone', '').strip()
        if not nom or not role:
            return {"error": "Nom et rôle obligatoires"}
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS equipe_reseau (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(200) NOT NULL,
                role VARCHAR(50) NOT NULL,
                telephone VARCHAR(50),
                email VARCHAR(100),
                zone VARCHAR(100),
                UNIQUE(nom, role)
            )
        """))
        db.execute(text("""
            INSERT INTO equipe_reseau (nom, role, telephone, email, zone)
            VALUES (:nom, :role, :tel, :email, :zone)
            ON CONFLICT (nom, role) DO UPDATE
            SET telephone=:tel, email=:email, zone=:zone
        """), {"nom": nom, "role": role, "tel": tel, "email": email, "zone": zone})
        db.commit()
        return {"success": True, "message": f"✅ {nom} ajouté(e) comme {role}"}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


@app.put("/api/reseau/equipe/{role}/{nom_encoded}")
async def update_membre_equipe(role: str, nom_encoded: str, data: dict):
    """Met à jour les infos d'un membre de l'équipe"""
    from app.core.database import SessionLocal
    from sqlalchemy import text
    import urllib.parse
    db = SessionLocal()
    try:
        nom = urllib.parse.unquote(nom_encoded)
        tel   = data.get('telephone', '').strip()
        email = data.get('email', '').strip()
        zone  = data.get('zone', '').strip()
        new_nom = data.get('nom', nom).strip()
        db.execute(text("""
            UPDATE equipe_reseau SET nom=:new_nom, telephone=:tel, email=:email, zone=:zone
            WHERE nom=:nom AND role=:role
        """), {"nom": nom, "role": role, "new_nom": new_nom, "tel": tel, "email": email, "zone": zone})
        db.commit()
        return {"success": True, "message": f"✅ {new_nom} mis à jour"}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


@app.delete("/api/reseau/equipe/{role}/{nom_encoded}")
async def delete_membre_equipe(role: str, nom_encoded: str):
    """Supprime un membre de l'équipe réseau"""
    from app.core.database import SessionLocal
    from sqlalchemy import text
    import urllib.parse
    db = SessionLocal()
    try:
        nom = urllib.parse.unquote(nom_encoded)
        db.execute(text("DELETE FROM equipe_reseau WHERE nom=:nom AND role=:role"), {"nom": nom, "role": role})
        db.commit()
        return {"success": True, "message": f"✅ {nom} supprimé(e)"}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()

@app.get("/db-info")
async def db_info():
    """Diagnostic: affiche quelle base de données est utilisée"""
    from app.core.config import settings
    from app.core.database import SessionLocal
    from sqlalchemy import text
    db = SessionLocal()
    try:
        url = settings.DATABASE_URL
        db_type = "postgresql" if "postgresql" in url or "postgres" in url else "sqlite"
        # Compter les tables
        if db_type == "postgresql":
            tables = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).fetchall()
        else:
            tables = db.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
        
        pdv_count = db.execute(text("SELECT COUNT(*) FROM pdvs")).scalar()
        perf_monthly = db.execute(text("SELECT COUNT(*) FROM monthly_performances")).scalar()
        perf_weekly = db.execute(text("SELECT COUNT(*) FROM weekly_performances")).scalar()
        
        return {
            "db_type": db_type,
            "database_url_prefix": url[:30] + "...",
            "tables": [t[0] for t in tables],
            "pdvs": pdv_count,
            "monthly_performances": perf_monthly,
            "weekly_performances": perf_weekly
        }
    finally:
        db.close()

@app.get("/clean-nan-pdvs")
async def clean_nan_pdvs():
    """Nettoie tous les champs 'nan' (string) stockés en base dans la table pdvs"""
    from app.core.database import SessionLocal
    from app.models.pdv import PDV
    from sqlalchemy import text

    NAN_VALUES = ('nan', 'NaN', 'None', 'none', 'NAT', 'nat')
    STRING_FIELDS = [
        'nom', 'numero_personnel', 'zone', 'sous_zone', 'quartier',
        'commune', 'superviseur', 'gestionnaire', 'teleconseillere',
        'developpeur', 'adresse', 'telephone', 'email_contact',
        'nom_gerant', 'notes', 'segment', 'date_mise_a_jour'
    ]

    db = SessionLocal()
    try:
        pdvs = db.query(PDV).all()
        updated = 0
        for pdv in pdvs:
            changed = False
            for field in STRING_FIELDS:
                val = getattr(pdv, field, None)
                if isinstance(val, str) and val.strip() in NAN_VALUES:
                    setattr(pdv, field, None)
                    changed = True
            if changed:
                updated += 1
        db.commit()
        return {
            "message": f"✅ Nettoyage terminé : {updated} PDVs mis à jour sur {len(pdvs)} total",
            "pdvs_updated": updated,
            "pdvs_total": len(pdvs)
        }
    finally:
        db.close()

@app.post("/debug-create-prospect")
async def debug_create_prospect(request: Request):
    """Debug endpoint: simule exactement create_prospect et retourne l'erreur complète"""
    import traceback
    from app.core.database import SessionLocal
    from app.models.user import User
    from app.schemas.prospect import ProspectCreate
    from app.services.prospection_service import create_prospect
    db = SessionLocal()
    try:
        body = await request.json()
        admin = db.query(User).filter(User.email == "admin@faroukmanager.com").first()
        payload = ProspectCreate(**body)
        p = create_prospect(db, payload, admin)
        return {"success": True, "id": p.id, "reference": p.reference}
    except Exception as e:
        db.rollback()
        return {"error": str(e), "traceback": traceback.format_exc()[-2000:]}
    finally:
        db.close()

@app.get("/migrate-prospect-tables")
async def migrate_prospect_tables():
    """Migration: crée les tables prospect_history et prospect_attachments si manquantes"""
    from app.core.database import engine
    from sqlalchemy import text
    results = []
    sqls = [
        """CREATE TABLE IF NOT EXISTS prospect_history (
            id SERIAL PRIMARY KEY,
            prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE NOT NULL,
            user_id INTEGER REFERENCES users(id),
            decision_type VARCHAR(50) NOT NULL,
            from_status VARCHAR(50),
            to_status VARCHAR(50),
            comment TEXT,
            extra JSON,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS prospect_attachments (
            id SERIAL PRIMARY KEY,
            prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE NOT NULL,
            kind VARCHAR(50) DEFAULT 'AUTRE' NOT NULL,
            filename VARCHAR(500) NOT NULL,
            file_path VARCHAR(1000) NOT NULL,
            file_size INTEGER,
            mime_type VARCHAR(100),
            uploaded_by_id INTEGER REFERENCES users(id),
            uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL
        )""",
    ]
    with engine.connect() as conn:
        for sql in sqls:
            try:
                conn.execute(text(sql))
                conn.commit()
                table = sql.split("IF NOT EXISTS ")[1].split(" ")[0]
                results.append({"table": table, "status": "OK"})
            except Exception as e:
                results.append({"sql": sql[:60], "status": str(e)[:100]})
    return {"results": results}

@app.get("/migrate-prospect-enums")
async def migrate_prospect_enums():
    """Migration: crée les types Enum PostgreSQL manquants pour la table prospects"""
    from app.core.database import engine
    from sqlalchemy import text
    enums = [
        ("idtype", ["CNI", "NINA", "PASSEPORT", "PERMIS", "AUTRE"]),
        ("localtype", ["BOUTIQUE_FIXE", "KIOSQUE", "TABLE", "MOBILE", "AUTRE"]),
        ("frequentationlevel", ["TRES_FREQUENTE", "MOYENNE", "FAIBLE"]),
        ("prospectstatus", ["NOUVELLE", "EN_VISITE", "VALIDEE_DEV", "REFUSEE_DEV", "EN_ATTENTE_RC", "APPROUVEE_RC", "REFUSEE_RC", "PUCE_ATTRIBUEE", "PUCE_ACTIVEE", "ANNULEE"]),
        ("decisiontype", ["SUBMIT", "ASSIGN_VISIT", "DEV_APPROVE", "DEV_REJECT", "RC_APPROVE", "RC_REJECT", "ASSIGN_PUCE", "ACTIVATE", "CANCEL", "NOTE"]),
    ]
    results = []
    with engine.connect() as conn:
        for enum_name, values in enums:
            vals = ", ".join([f"'{v}'" for v in values])
            try:
                conn.execute(text(f"CREATE TYPE {enum_name} AS ENUM ({vals})"))
                conn.commit()
                results.append({"enum": enum_name, "status": "CREATED"})
            except Exception as e:
                err = str(e)
                if "already exists" in err:
                    results.append({"enum": enum_name, "status": "ALREADY_EXISTS"})
                else:
                    results.append({"enum": enum_name, "status": err[:80]})
        # Modifier les colonnes pour utiliser les bons types
        alter_sqls = [
            "ALTER TABLE prospects ALTER COLUMN type_local TYPE VARCHAR(50)",
            "ALTER TABLE prospects ALTER COLUMN frequentation TYPE VARCHAR(50)",
            "ALTER TABLE prospects ALTER COLUMN piece_identite_type TYPE VARCHAR(50)",
            "ALTER TABLE prospects ALTER COLUMN status TYPE VARCHAR(50)",
        ]
        for sql in alter_sqls:
            try:
                conn.execute(text(sql))
                conn.commit()
                results.append({"sql": sql[:60], "status": "OK"})
            except Exception as e:
                results.append({"sql": sql[:60], "status": str(e)[:80]})
    return {"results": results}

@app.get("/migrate-prospect-columns")
async def migrate_prospect_columns():
    """Migration: ajoute les colonnes manquantes à la table prospects"""
    from app.core.database import engine
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS submitted_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assigned_dev_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assigned_dev_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sla_visit_due_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dev_decision VARCHAR(20)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dev_notes TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dev_decided_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sla_rc_due_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS rc_decision VARCHAR(20)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS rc_notes TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS rc_decided_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS rc_decided_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assigned_puce VARCHAR(100)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS puce_assigned_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sla_activation_due_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS activated_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cancelled_reason TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cancelled_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_score FLOAT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_recommendation TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_go_nogo VARCHAR(10)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_risk_factors TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS latitude FLOAT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS longitude FLOAT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS pdv_adresse VARCHAR(500)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS pdv_nom_lieu VARCHAR(200)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS concurrents JSON",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS notes TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS visit_assigned_to_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS visit_assigned_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dev_decision_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dev_decision_comment TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS visit_attempts INTEGER DEFAULT 0",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS rc_decision_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS rc_decision_by_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS rc_decision_comment TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS puce_assigned_to_id INTEGER REFERENCES users(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS puce_numero VARCHAR(100)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS activated_pdv_id INTEGER REFERENCES pdvs(id)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS puce_assigned_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS type_local VARCHAR(50) DEFAULT 'BOUTIQUE_FIXE'",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS frequentation VARCHAR(50)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS piece_identite_type VARCHAR(50)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS telephone_secondaire VARCHAR(50)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS quartier VARCHAR(200)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS adresse VARCHAR(500)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS piece_identite_numero VARCHAR(100)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS fait_om BOOLEAN DEFAULT FALSE",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS om_commission_mensuelle FLOAT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS om_ca_mensuel FLOAT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS om_ancienne_puce VARCHAR(100)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS om_raison_changement TEXT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS capital_demarrage FLOAT",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS source_financement VARCHAR(200)",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sla_visit_due_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sla_rc_due_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sla_activation_due_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP",
    ]
    results = []
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
                results.append({"sql": sql[:60], "status": "OK"})
            except Exception as e:
                results.append({"sql": sql[:60], "status": str(e)[:80]})
    return {"migrations": results}

@app.get("/migrate-pdv-history")
async def migrate_pdv_history():
    """Migration: crée la table pdv_history si elle n'existe pas encore."""
    from app.core.database import engine
    from sqlalchemy import text, inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if 'pdv_history' in tables:
        return {"status": "ok", "message": "Table pdv_history existe déjà"}
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pdv_history (
                id SERIAL PRIMARY KEY,
                pdv_id INTEGER REFERENCES pdvs(id) ON DELETE CASCADE,
                numero_pdv VARCHAR,
                event_type VARCHAR NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR,
                prospect_reference VARCHAR,
                prospect_id INTEGER,
                ancien_nom_gerant VARCHAR, ancien_telephone VARCHAR,
                ancien_superviseur VARCHAR, ancien_gestionnaire VARCHAR,
                ancien_teleconseillere VARCHAR, ancien_developpeur VARCHAR,
                ancien_zone VARCHAR, ancien_sous_zone VARCHAR,
                ancien_quartier VARCHAR, ancien_adresse VARCHAR,
                ancien_statut VARCHAR, ancien_type_pdv VARCHAR,
                ancien_date_activation TIMESTAMP,
                nouveau_nom_gerant VARCHAR, nouveau_telephone VARCHAR,
                nouveau_superviseur VARCHAR, nouveau_gestionnaire VARCHAR,
                nouveau_teleconseillere VARCHAR, nouveau_developpeur VARCHAR,
                nouveau_zone VARCHAR, nouveau_sous_zone VARCHAR,
                nouveau_quartier VARCHAR, nouveau_adresse VARCHAR,
                nouveau_type_pdv VARCHAR,
                workflow_steps JSONB,
                comment TEXT,
                extra JSONB
            )
        """))
        conn.commit()
    return {"status": "ok", "message": "Table pdv_history créée avec succès"}

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
