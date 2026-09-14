"""
Modèle TcObjectif — Objectifs des téléconseillères.

Un objectif est rattaché au COMPTE utilisateur (users.id), jamais à un nom,
et porte sur une période précise (annee, mois). Un seul objectif par compte et par mois.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from app.core.database import Base


class TcObjectif(Base):
    __tablename__ = "tc_objectifs"

    id = Column(Integer, primary_key=True, index=True)
    tc_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    annee = Column(Integer, nullable=False, index=True)
    mois = Column(Integer, nullable=False, index=True)

    objectif_appels = Column(Integer, nullable=False, default=0)        # objectif MENSUEL d'appels
    objectif_promesses = Column(Integer, nullable=False, default=0)     # objectif MENSUEL de promesses
    objectif_appels_jour = Column(Integer, nullable=False, default=0)   # objectif JOURNALIER d'appels

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tc_user_id", "annee", "mois", name="uq_tc_objectif_periode"),
    )
