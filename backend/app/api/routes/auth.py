from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.database import get_db
from app.core.security import create_access_token, decode_token, get_password_hash
from app.services.auth_service import (
    authenticate_user,
    get_user_by_email,
    create_user
)
from app.models.user import User, UserRole
from app.schemas.user import LoginRequest, Token, UserOut, UserCreate, UserUpdate
from typing import List, Optional

router = APIRouter()

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
    
    return user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role"""
    if current_user.role != UserRole.ADMIN:
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

    if role in ('admin', 'manager', 'conformite'):
        return {}  # Voient tout
    elif role == 'superviseur':
        return {'superviseur': nom_complet}
    elif role == 'gestionnaire':
        return {'gestionnaire': nom_complet}
    elif role == 'developpeur':
        return {'developpeur': nom_complet}
    elif role == 'teleconseillere':
        return {'teleconseillere': nom_complet}
    elif role == 'rc':
        return {'gestionnaire': nom_complet}
    return {}

@router.post("/auth/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password"""
    user = authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=480)
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
    allowed = [UserRole.ADMIN, UserRole.MANAGER, UserRole.RC, UserRole.SUPERVISEUR]
    if current_user.role not in allowed:
        raise HTTPException(status_code=403, detail="Accès refusé")

    results = []

    # 1. Users avec rôle developpeur dans la table users
    devs_users = db.query(User).filter(User.role == UserRole.DEVELOPPEUR, User.is_active == True).all()
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

@router.get("/auth/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    skip: int = 0,
    limit: int = 100
):
    """List all users (admin only)"""
    users = db.query(User).offset(skip).limit(limit).all()
    return [UserOut.from_orm(u) for u in users]

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
