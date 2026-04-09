from sqlalchemy.orm import Session
from app.models.user import User
from app.core.security import verify_password, get_password_hash, create_access_token, decode_token
from app.schemas.user import UserCreate
from typing import Optional

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email address."""
    return db.query(User).filter(User.email == email).first()

def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate user with email and password."""
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user

def create_user(db: Session, user_create: UserCreate) -> User:
    """Create a new user."""
    hashed_password = get_password_hash(user_create.password)
    db_user = User(
        email=user_create.email,
        nom=user_create.nom,
        prenom=user_create.prenom,
        hashed_password=hashed_password,
        role=user_create.role,
        zone=user_create.zone,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_current_user(db: Session, token: str) -> Optional[User]:
    """Get current user from JWT token."""
    payload = decode_token(token)
    if payload is None:
        return None
    
    email: str = payload.get("sub")
    if email is None:
        return None
    
    user = get_user_by_email(db, email)
    return user
