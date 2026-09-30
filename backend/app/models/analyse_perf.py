"""
Configuration du module « Analyse Performance ».

Une seule ligne (clé = "global") stocke en JSON tous les paramètres :
périodes glissantes, seuils du score de risque, paliers de priorité, seuils
de gisement, objectifs, etc. Tout est modifiable depuis l'onglet Configuration.
"""
from sqlalchemy import Column, Integer, String, DateTime, JSON
from datetime import datetime
from app.core.database import Base


class AnalysePerfConfig(Base):
    __tablename__ = "analyse_perf_config"

    id = Column(Integer, primary_key=True, index=True)
    cle = Column(String(50), unique=True, index=True, default="global")
    valeur = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
