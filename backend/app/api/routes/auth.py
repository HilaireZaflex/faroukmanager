from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.core.database import get_db
from app.core.security import create_access_token, decode_token, get_password_hash
from app.services.auth_service import (
    authenticate_user,
    get_user_by_email,
    create_user
)
from app.models.user import User, UserRole
from app.schemas.user import (
    LoginRequest,
    Token,
    UserOut,
    UserOutWithTelephone,
    UserCreate,
    UserUpdate,
)
from typing import List, Optional

router = APIRouter()

# Intervalle minimal entre deux écritures de `users.last_seen` pour un même
# utilisateur : une requête authentifiée toutes les 10 minutes suffit à
# représenter une activité réelle, sans UPDATE à chaque appel d'API.
LAST_SEEN_THROTTLE = timedelta(minutes=10)


def _to_naive_utc(dt):
    """Ramène un datetime (naïf UTC ou avec timezone) en UTC naïf.

    Permet de soustraire des valeurs renvoyées par PostgreSQL/SQLite sans
    déclencher de TypeError « can't subtract offset-naive and offset-aware ».
    """
    if dt is None or dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _touch_last_seen(user: User, db: Session) -> None:
    """Met à jour l'activité réelle de l'utilisateur, au plus toutes les 10 min.

    Réutilise la session et l'instance `User` déjà chargées par
    `get_current_user` : aucune requête supplémentaire. Toute erreur est
    ignorée (avec rollback pour laisser la session utilisable) : le suivi
    d'activité ne doit jamais bloquer une requête authentifiée.
    """
    try:
        now = datetime.utcnow()
        dernier = _to_naive_utc(user.last_seen)
        if dernier is not None and (now - dernier) <= LAST_SEEN_THROTTLE:
            return
        user.last_seen = now
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> User:
    """Get current user from Authorization header"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    # Extract token from "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )
    
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    user = get_user_by_email(db, payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Activité réelle : trace chaque requête authentifiée (throttle 10 min).
    _touch_last_seen(user, db)

    return user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role"""
    if str(current_user.role).lower().replace('userrole.', '') not in ('admin', 'manager'):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def apply_filters_to_query(query, model, user: User):
    """Applique automatiquement les filtres PDV à une query SQLAlchemy selon le rôle de l'utilisateur."""
    filters = get_pdv_filters(user)
    if not filters:
        return query
    for field, value in filters.items():
        if value and hasattr(model, field):
            query = query.filter(getattr(model, field).ilike(f"%{value}%"))
    return query


def get_pdv_filters(user: User) -> dict:
    """
    Retourne les filtres PDV automatiques selon le rôle de l'utilisateur.
    - Admin / Manager : voient TOUT (aucun filtre)
    - Superviseur     : filtre par son nom (champ superviseur)
    - RC              : filtre par son nom (champ gestionnaire)
    - Développeur     : filtre par sa zone
    - Téléconseillère : filtre par sa zone
    """
    role = str(user.role).lower().replace('userrole.', '')

    # Le nom dans les PDVs peut être "PRENOM NOM" ou "NOM PRENOM" selon comment il a été créé
    # On utilise user.nom qui peut contenir le nom complet (ex: "ABOUBACAR SANOGO")
    # Si prenom est défini, on essaie "PRENOM NOM"
    if user.prenom and user.prenom.strip():
        nom_complet = f"{user.prenom} {user.nom}".strip()
    else:
        nom_complet = (user.nom or '').strip()

    if role in ('admin', 'manager', 'conformite', 'rc'):
        return {}  # Voient tout — pas de filtre
    elif role == 'superviseur':
        return {'superviseur': nom_complet}
    elif role == 'gestionnaire':
        return {'gestionnaire': nom_complet}
    elif role == 'developpeur':
        return {'developpeur': nom_complet}
    elif role == 'teleconseillere':
        return {'teleconseillere': nom_complet}
    return {}

@router.post("/auth/refresh")
def refresh_token(current_user: User = Depends(get_current_user)):
    """Renouvelle le token JWT de l'utilisateur connecté. Appelé automatiquement par le frontend."""
    new_token = create_access_token(
        data={"sub": current_user.email},
        expires_delta=timedelta(days=30)
    )
    return {"access_token": new_token, "token_type": "bearer"}


@router.post("/auth/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password"""
    user = authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Adresse e-mail ou mot de passe incorrect."
        )
    
    # Dernière connexion : mise à jour à CHAQUE connexion réussie (pas
    # seulement à la création du compte), en UTC naïf comme le reste de l'app.
    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(days=30)  # 30 jours — évite les déconnexions intempestives
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserOut.from_orm(user)
    }

@router.post("/auth/register", response_model=UserOut)
def register(user_data: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Register new user (admin only)"""
    user = create_user(db, user_data)
    return UserOut.from_orm(user)

@router.get("/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return UserOut.from_orm(current_user)

@router.put("/auth/me", response_model=UserOut)
def update_me(
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update own profile"""
    if user_update.nom is not None:
        current_user.nom = user_update.nom
    if user_update.prenom is not None:
        current_user.prenom = user_update.prenom
    if user_update.zone is not None:
        current_user.zone = user_update.zone
    if user_update.is_active is not None:
        current_user.is_active = user_update.is_active
    if user_update.password is not None:
        current_user.hashed_password = get_password_hash(user_update.password)
    
    db.commit()
    db.refresh(current_user)
    
    return UserOut.from_orm(current_user)

@router.get("/auth/developers")
def list_developers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste des développeurs du réseau — accessible par admin, manager et RC pour affecter les visites.
    Combine les users avec rôle developpeur ET les membres réseau avec rôle developpeur."""
    from app.models.user import UserRole
    allowed = ["admin", "ADMIN", "manager", "MANAGER", "rc", "RC", "superviseur", "SUPERVISEUR"]
    if current_user.role not in allowed:
        raise HTTPException(status_code=403, detail="Accès refusé")

    results = []

    # 1. Users avec rôle developpeur dans la table users
    devs_users = db.query(User).filter(User.role.in_(['developpeur', 'DEVELOPPEUR']), User.is_active == True).all()
    for u in devs_users:
        results.append({"id": f"user_{u.id}", "nom": u.nom, "prenom": u.prenom or "", "source": "user"})

    # 2. Membres réseau avec rôle developpeur (table equipe_reseau)
    try:
        from sqlalchemy import text
        rows = db.execute(text(
            "SELECT id, nom, telephone, zone FROM equipe_reseau WHERE role = 'developpeur' ORDER BY nom"
        )).fetchall()
        for r in rows:
            nom_parts = r[1].split(' ', 1) if r[1] else ['', '']
            results.append({
                "id": f"reseau_{r[0]}",
                "nom": nom_parts[0],
                "prenom": nom_parts[1] if len(nom_parts) > 1 else "",
                "telephone": r[2] or "",
                "zone": r[3] or "",
                "source": "reseau"
            })
    except Exception as e:
        pass

    return results

@router.get("/auth/responsables")
def list_responsables(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne la liste des responsables habilités à traiter les réclamations - accessible à tous."""
    ROLES_RESP = ['ADMIN', 'MANAGER', 'RC', 'conformite', 'responsable_produit_et_qualit_oprationnelle_']
    responsables = db.query(User).filter(User.role.in_(ROLES_RESP)).all()
    return [{"id": u.id, "nom": f"{u.prenom or ''} {u.nom or ''}".strip(), "role": u.role, "email": u.email} for u in responsables]


def _normaliser_role(role) -> str:
    """Rôle comparable côté frontend (ex. UserRole.ADMIN -> admin)."""
    return str(role or "").lower().replace('userrole.', '')


def _jours_sans_connexion(derniere_activite, now) -> Optional[int]:
    """Nombre de jours entiers écoulés depuis la dernière activité (None si aucune)."""
    derniere_activite = _to_naive_utc(derniere_activite)
    if derniere_activite is None:
        return None
    return max(0, (now - derniere_activite).days)


def _timestamp_utc(dt) -> float:
    """Timestamp POSIX comparable pour trier des datetimes naïfs (UTC) ou aware."""
    if dt is None:
        return 0.0
    dt = _to_naive_utc(dt)
    return dt.replace(tzinfo=timezone.utc).timestamp()


@router.get("/auth/users-activity")
def users_login_activity(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Activité réelle des utilisateurs (admin uniquement).

    Pour chaque utilisateur : identité, rôle, téléphone personnel, état du
    compte, dernière connexion par identifiants (`last_login`) et dernière
    activité réelle (`last_seen`, écrite à chaque requête authentifiée avec
    un throttle de 10 min).
    La référence d'ancienneté est `derniere_activite = last_seen or last_login`.
    Tri : activité la plus récente d'abord (NULLS LAST), puis la plus ancienne,
    les comptes jamais vus en dernier ; à activité identique, ordre
    alphabétique (nom puis prénom).
    Aucune donnée sensible (mot de passe, hash) n'est exposée.
    """
    now = datetime.utcnow()
    users = db.query(User).all()

    lignes = []
    for u in users:
        derniere = u.last_seen or u.last_login
        jours = _jours_sans_connexion(derniere, now)
        jamais = derniere is None
        ligne = {
            "id": u.id,
            "nom": u.nom,
            "prenom": u.prenom,
            "email": u.email,
            "role": _normaliser_role(u.role),
            "telephone": u.telephone,
            "is_active": bool(u.is_active),
            "last_login": u.last_login.isoformat() if u.last_login is not None else None,
            "last_seen": u.last_seen.isoformat() if u.last_seen is not None else None,
            "derniere_activite": derniere.isoformat() if derniere is not None else None,
            "jours_sans_connexion": jours,
            "jamais_connecte": jamais,
        }
        # Clé de tri interne (non renvoyée) — équivalent de
        # « ORDER BY derniere_activite DESC NULLS LAST, nom » :
        # 1. les comptes vus (0) avant les jamais vus (1) ;
        # 2. activité la plus récente d'abord (-timestamp) ;
        # 3. puis ordre alphabétique (nom, prénom).
        cle_tri = (
            1 if jamais else 0,
            -_timestamp_utc(derniere),
            (u.nom or "").lower(),
            (u.prenom or "").lower(),
        )
        lignes.append((cle_tri, ligne))

    lignes.sort(key=lambda paire: paire[0])
    return [ligne for _, ligne in lignes]


@router.get("/auth/users", response_model=List[UserOutWithTelephone])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    skip: int = 0,
    limit: int = 100
):
    """List all users (admin only). Inclut le téléphone personnel (optionnel)."""
    users = db.query(User).offset(skip).limit(limit).all()
    return [UserOutWithTelephone.from_orm(u) for u in users]

@router.delete("/auth/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_endpoint(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Delete user (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    db.delete(user)
    db.commit()
    return None
