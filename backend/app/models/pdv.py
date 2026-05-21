from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Enum, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class PDVType(str, enum.Enum):
    KIOSQUE = "KIOSQUE"
    KIOSQUE_INDEPENDANT = "KIOSQUE INDEPENDANT"
    RNS = "RNS"
    RS = "RS"
    RSF = "RSF"
    NEANT = "NEANT"
    X = "X"

class PDVStatut(str, enum.Enum):
    ACTIF = "ACTIF"
    INACTIF = "INACTIF"
    RECUPERATION = "RECUPERATION"
    DESACTIVE = "DESACTIVE"

class PDVMedaille(str, enum.Enum):
    OR = "OR"
    ARGENT = "ARGENT"
    BRONZE = "BRONZE"
    AUCUNE = "AUCUNE"

class PDV(Base):
    __tablename__ = "pdvs"

    id = Column(Integer, primary_key=True, index=True)
    numero_pdv = Column(String, unique=True, index=True, nullable=False)
    nom = Column(String, nullable=False)
    numero_personnel = Column(String, nullable=True)
    type_pdv = Column(Enum(PDVType), default=PDVType.RS)
    statut = Column(Enum(PDVStatut), default=PDVStatut.ACTIF)
    medaille = Column(Enum(PDVMedaille), default=PDVMedaille.AUCUNE)

    # Localisation
    zone = Column(String, nullable=True)
    sous_zone = Column(String, nullable=True)
    quartier = Column(String, nullable=True)
    commune = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Affectation
    superviseur = Column(String, nullable=True)
    gestionnaire = Column(String, nullable=True)
    teleconseillere = Column(String, nullable=True)
    developpeur = Column(String, nullable=True)
    adresse = Column(String, nullable=True)

    # Contact
    telephone = Column(String, nullable=True)
    email_contact = Column(String, nullable=True)
    nom_gerant = Column(String, nullable=True)

    # Statuts techniques
    date_activation = Column(DateTime, nullable=True)
    numero_flotte = Column(Boolean, default=False)
    sim_au_bureau = Column(Boolean, default=False)
    sim_coupee = Column(Boolean, default=False)
    nouvelle_creation = Column(Boolean, default=False)

    # Scores IA
    health_score = Column(Float, default=50.0)
    segment = Column(String, nullable=True)
    score_risque = Column(Float, default=0.0)

    single_wallet = Column(Boolean, default=False)
    date_mise_a_jour = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    weekly_performances = relationship("WeeklyPerformance", back_populates="pdv", cascade="all, delete-orphan")
    monthly_performances = relationship("MonthlyPerformance", back_populates="pdv", cascade="all, delete-orphan")
    actions = relationship("TerrainAction", back_populates="pdv", cascade="all, delete-orphan")
    recoveries = relationship("Recovery", back_populates="pdv", cascade="all, delete-orphan", foreign_keys="Recovery.pdv_id")
