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
    nom_complet = f"{user.prenom} {user.nom}".strip() if user.prenom else user.nom

    if role in ('admin', 'manager'):
        return {}  # Pas de filtre — voient tout
    elif role == 'superviseur':
        return {'superviseur': nom_complet}
    elif role == 'rc':
        return {'gestionnaire': nom_complet}
    elif role in ('developpeur', 'teleconseillere'):
        return {'zone': user.zone} if user.zone else {}
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
