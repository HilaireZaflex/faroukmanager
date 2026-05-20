"""Modèles pour la Gestion des Développeurs réseau"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON, ForeignKey, Enum, Text, Date
from sqlalchemy.orm import relationship
from app.core.database import Base


class TaskType(str, enum.Enum):
    VISITE = "visite"
    PROSPECTION = "prospection"
    ACTIVATION = "activation"
    RECUPERATION = "recuperation"
    FORMATION = "formation"
    KAABU = "kaabu"
    AUTRE = "autre"


class TaskStatus(str, enum.Enum):
    EN_ATTENTE = "en_attente"
    EN_COURS = "en_cours"
    TERMINE = "termine"
    ANNULE = "annule"


class TaskPriority(str, enum.Enum):
    BASSE = "basse"
    NORMALE = "normale"
    HAUTE = "haute"
    URGENTE = "urgente"


class DevTask(Base):
    """Action/Tâche assignée à un développeur — par PDV ou par zone"""
    __tablename__ = "dev_tasks"

    id = Column(Integer, primary_key=True, index=True)
    # Assignation
    developpeur_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Cible : PDV spécifique ou zone entière
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=True)
    zone = Column(String, nullable=True)            # si attribution par zone

    # Détails de la tâche
    type_tache = Column(Enum(TaskType), nullable=False, default=TaskType.VISITE)
    titre = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    priorite = Column(Enum(TaskPriority), default=TaskPriority.NORMALE)
    status = Column(Enum(TaskStatus), default=TaskStatus.EN_ATTENTE)

    # Dates
    date_echeance = Column(DateTime, nullable=True)
    date_debut = Column(DateTime, nullable=True)
    date_fin = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Résultat
    notes_resultat = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Relations
    developpeur = relationship("User", foreign_keys=[developpeur_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])
    pdv = relationship("PDV", foreign_keys=[pdv_id])


class DevDailyGoal(Base):
    """Objectifs journaliers/mensuels définis par l'admin pour un développeur"""
    __tablename__ = "dev_daily_goals"

    id = Column(Integer, primary_key=True, index=True)
    developpeur_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Période
    date = Column(Date, nullable=False)            # date cible (jour ou début semaine)
    period_type = Column(String, default="daily")  # daily, weekly, monthly

    # Objectifs
    objectif_prospects = Column(Integer, default=3)     # nb prospects à soumettre
    objectif_visites = Column(Integer, default=5)       # nb visites terrain
    objectif_activations = Column(Integer, default=2)   # nb PDVs à activer
    objectif_kaabu = Column(Integer, default=1)         # nb activations KAABU
    objectif_recuperations = Column(Integer, default=3) # nb PDVs à récupérer

    # Réalisé (mis à jour automatiquement)
    realise_prospects = Column(Integer, default=0)
    realise_visites = Column(Integer, default=0)
    realise_activations = Column(Integer, default=0)
    realise_kaabu = Column(Integer, default=0)
    realise_recuperations = Column(Integer, default=0)

    # Bonus & taux
    taux_activation_cible = Column(Float, default=80.0)   # % cible admin
    taux_recuperation_cible = Column(Float, default=75.0) # % cible admin
    bonus_activation = Column(Float, default=5000.0)      # FCFA par activation
    bonus_objectif_atteint = Column(Float, default=25000.0) # bonus global si 100%

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    developpeur = relationship("User", foreign_keys=[developpeur_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


class DevPortfolio(Base):
    """Portefeuille de PDVs assignés à un développeur"""
    __tablename__ = "dev_portfolios"

    id = Column(Integer, primary_key=True, index=True)
    developpeur_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    assigned_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)

    # Stats récupération
    last_recovery_date = Column(DateTime, nullable=True)
    recovery_count = Column(Integer, default=0)
    total_recovered_fcfa = Column(Float, default=0.0)

    developpeur = relationship("User", foreign_keys=[developpeur_id])
    pdv = relationship("PDV", foreign_keys=[pdv_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])


class SuperviseurPDVObjective(Base):
    """Objectif mensuel : chaque superviseur doit remonter 3 nouveaux PDVs"""
    __tablename__ = "superviseur_pdv_objectives"

    id = Column(Integer, primary_key=True, index=True)
    superviseur_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    period_key = Column(String, nullable=False)   # ex: "2026-05"
    objectif_pdvs = Column(Integer, default=3)    # configurable par admin
    pdvs_remontes = Column(JSON, default=list)     # liste des PDV ids remontés
    nb_remontes = Column(Integer, default=0)
    is_complete = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    superviseur = relationship("User", foreign_keys=[superviseur_id])
