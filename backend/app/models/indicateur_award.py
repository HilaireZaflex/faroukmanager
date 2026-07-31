"""
Modèle IndicateurAward — Suivi hebdomadaire des indicateurs Orange Awards 2026
5 indicateurs : OMY, KAABU MOBILE, NAFAMA, TERMINAUX, ORANGE ENERGIE
"""
import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, UniqueConstraint
from datetime import datetime
from app.core.database import Base


class NomIndicateur(str, enum.Enum):
    OMY = "OMY"
    KAABU_MOBILE = "KAABU MOBILE"
    NAFAMA = "NAFAMA"
    TERMINAUX = "TERMINAUX"
    ORANGE_ENERGIE = "ORANGE ENERGIE"


class IndicateurAward(Base):
    """
    Une ligne = 1 indicateur + 1 mois + 1 semaine
    Ex: OMY / JUILLET / S27 → objectif=16190484 / realisation=15705945 / taux=0.97
    """
    __tablename__ = "indicateurs_award"

    id = Column(Integer, primary_key=True, index=True)
    indicateur = Column(String, nullable=False, index=True)   # OMY, KAABU MOBILE, etc.
    mois = Column(String, nullable=False, index=True)          # JUILLET, AOÛT, etc.
    semaine = Column(String, nullable=False, index=True)       # S27, S28, ... ou TOTAL
    est_total = Column(Boolean, default=False)                 # True si ligne TOTAL du mois

    # Données Orange
    objectif_orange = Column(Float, nullable=True)
    realisation = Column(Float, nullable=True)
    taux_orange = Column(Float, nullable=True)   # ratio 0→1

    # Données Farouk
    objectif_farouk = Column(Float, nullable=True)
    taux_farouk = Column(Float, nullable=True)   # ratio 0→1

    # Pour KAABU MOBILE uniquement
    nombre_pdv = Column(Integer, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('indicateur', 'mois', 'semaine', name='uq_indicateur_mois_semaine'),
    )
