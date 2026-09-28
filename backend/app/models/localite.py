"""
Référentiel géographique — Zones, Sous-zones et Quartiers.

Ces listes alimentent les menus déroulants et les filtres du module
« Point de vente ». Elles sont modifiables depuis Paramètres → Zones & Localités.
"""
from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from datetime import datetime
from app.core.database import Base


class Localite(Base):
    __tablename__ = "localites"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(20), nullable=False, index=True)   # ZONE | SOUS_ZONE | QUARTIER
    nom = Column(String(200), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('type', 'nom', name='uq_localite_type_nom'),
    )
