from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class RecoveryStatut(str, enum.Enum):
    IDENTIFIE = "IDENTIFIE"
    CONTACTE = "CONTACTE"
    SIM_RECUPEREE = "SIM_RECUPEREE"
    REDEPLOYE = "REDEPLOYE"
    ABANDONNE = "ABANDONNE"

class Recovery(Base):
    __tablename__ = "recoveries"

    id = Column(Integer, primary_key=True, index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=False)
    statut = Column(Enum(RecoveryStatut), default=RecoveryStatut.IDENTIFIE)
    ca_cumule_3mois = Column(Float, default=0.0)
    date_identification = Column(DateTime, default=datetime.utcnow)
    date_contact = Column(DateTime, nullable=True)
    date_recuperation_sim = Column(DateTime, nullable=True)
    date_redeploiement = Column(DateTime, nullable=True)
    superviseur_responsable = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    nouveau_pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pdv = relationship("PDV", back_populates="recoveries", foreign_keys=[pdv_id])
