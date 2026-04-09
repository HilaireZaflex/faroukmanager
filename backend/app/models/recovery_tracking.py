"""
Modèle de suivi de récupération des PDV.
Chaque entrée représente le statut d'un PDV pour un mois de traitement donné.
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class RecoveryStatut(str, enum.Enum):
    IDENTIFIE    = "IDENTIFIE"      # PDV détecté dans la liste auto
    CONTACTE     = "CONTACTE"       # Le gestionnaire a appelé / contacté
    SIM_RECUPEREE = "SIM_RECUPEREE" # La SIM a été physiquement récupérée
    REDEPLOYE    = "REDEPLOYE"      # PDV redéployé à un nouveau titulaire


class RecoveryTracking(Base):
    __tablename__ = "recovery_tracking"

    id           = Column(Integer, primary_key=True, index=True)
    pdv_id       = Column(Integer, ForeignKey("pdvs.id"), nullable=False, index=True)
    mois         = Column(Integer, nullable=False)   # mois de traitement (ex: 3 = Mars)
    annee        = Column(Integer, nullable=False)   # année de traitement (ex: 2026)

    statut       = Column(Enum(RecoveryStatut), default=RecoveryStatut.IDENTIFIE, nullable=False)
    commentaire  = Column(Text, nullable=True)
    date_contact = Column(DateTime, nullable=True)   # date du 1er contact
    date_sim_recuperee = Column(DateTime, nullable=True)
    date_redeploye     = Column(DateTime, nullable=True)

    # Infos sur la nouvelle attribution (si redéployé)
    nouveau_titulaire  = Column(String, nullable=True)
    nouveau_telephone  = Column(String, nullable=True)

    # Qui a fait la mise à jour
    updated_by   = Column(String, nullable=True)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at   = Column(DateTime, default=datetime.utcnow)

    # CA de référence au moment de l'identification
    ca_mois_courant   = Column(Float, default=0.0)
    ca_mois_precedent = Column(Float, default=0.0)
    ca_total          = Column(Float, default=0.0)

    pdv = relationship("PDV", backref="recovery_trackings")
