from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    SUPERVISEUR = "superviseur"
    GESTIONNAIRE = "gestionnaire"
    TELECONSEILLERE = "teleconseillere"
    DEVELOPPEUR = "developpeur"
    RC = "rc"                    # Responsable Commercial
    CONFORMITE = "conformite"    # Responsable de Conformité

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    nom = Column(String, nullable=False)
    prenom = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.SUPERVISEUR)
    zone = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    actions = relationship("TerrainAction", back_populates="user")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
