"""
Modèle Challenge Orange Awards 2026
Période : 1er Juillet → 31 Octobre 2026
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON, Text, ForeignKey
from datetime import datetime
from app.core.database import Base


class ChallengeObjectif(Base):
    """Objectifs mensuels du challenge par KPI."""
    __tablename__ = "challenge_objectifs"

    id = Column(Integer, primary_key=True, index=True)
    challenge_type = Column(String(20), nullable=False)  # "TELCO" ou "OM"
    kpi = Column(String(100), nullable=False)             # ex: "ca_sellout", "recrutement_omy"
    mois = Column(String(7), nullable=False)              # "2026-07", "2026-08"...
    objectif = Column(Float, nullable=False, default=0)
    realise = Column(Float, nullable=True, default=0)
    unite = Column(String(20), nullable=True)             # "FCFA", "PDV", "PLV", "clients"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChallengeRecrutement(Base):
    """Suivi des recrutements Orange Money."""
    __tablename__ = "challenge_recrutements"

    id = Column(Integer, primary_key=True, index=True)
    numero_client = Column(String(20), nullable=True)
    nom_client = Column(String(200), nullable=True)
    pdv_numero = Column(String(50), nullable=True)
    pdv_nom = Column(String(200), nullable=True)
    superviseur = Column(String(200), nullable=True)
    developpeur = Column(String(200), nullable=True)
    zone = Column(String(100), nullable=True)
    date_recrutement = Column(DateTime, nullable=False, default=datetime.utcnow)
    mois = Column(String(7), nullable=False)  # "2026-07"
    est_actif = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChallengePLV(Base):
    """Suivi du déploiement des supports de visibilité (PLV)."""
    __tablename__ = "challenge_plv"

    id = Column(Integer, primary_key=True, index=True)
    pdv_numero = Column(String(50), nullable=True)
    pdv_nom = Column(String(200), nullable=True)
    zone = Column(String(100), nullable=True)
    superviseur = Column(String(200), nullable=True)
    type_plv = Column(String(100), nullable=True)  # "Kakemono", "Affiche", "Roll-up"...
    quantite = Column(Integer, default=1)
    date_deploiement = Column(DateTime, nullable=False, default=datetime.utcnow)
    mois = Column(String(7), nullable=False)
    photo_url = Column(String(500), nullable=True)
    valide = Column(Boolean, default=False)
    valide_par = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChallengePointControle(Base):
    """Suivi des nouveaux points contrôlés créés."""
    __tablename__ = "challenge_points_controles"

    id = Column(Integer, primary_key=True, index=True)
    pdv_numero = Column(String(50), nullable=True)
    pdv_nom = Column(String(200), nullable=True)
    zone = Column(String(100), nullable=True)
    superviseur = Column(String(200), nullable=True)
    date_creation = Column(DateTime, nullable=False, default=datetime.utcnow)
    mois = Column(String(7), nullable=False)
    est_actif = Column(Boolean, default=True)
    ca_mensuel = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
