"""
Module « Suivi Formation » — modèle de données.

Reprend le classeur Excel historique en trois tables :

  • formation_personnel  ← feuille « BASE DE DONNEES » (référentiel des agents)
  • formation_module     ← les 8 modules de formation (catalogue administrable)
  • formation_session    ← feuille « SUIVI FORMATIONS » (une ligne = une formation)

La feuille « FICHE INDIVIDUELLE » n'est plus stockée : elle se calcule à la
demande à partir de ces trois tables (elle est donc toujours juste).
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)

from app.core.database import Base


class FormationPersonnel(Base):
    """Un agent de Farouk Distribution (référentiel indépendant des comptes utilisateurs)."""

    __tablename__ = "formation_personnel"

    id = Column(Integer, primary_key=True)
    matricule = Column(String(40), unique=True, nullable=False, index=True)
    nom = Column(String(200), nullable=False, index=True)
    telephone = Column(String(40), nullable=True)
    gestionnaire = Column(String(200), nullable=True, index=True)
    groupe = Column(String(120), nullable=True, index=True)
    poste = Column(String(150), nullable=True, index=True)
    agence = Column(String(300), nullable=True)

    statut_emploi = Column(String(30), default="ACTIF")
    actif = Column(Boolean, default=True, nullable=False, index=True)

    # Évaluation globale (colonne « COMPRÉHENSION / ÉVALUATION » du fichier)
    evaluation_globale = Column(String(30), nullable=True)
    note_globale = Column(Float, nullable=True)          # sur 20

    # Lien facultatif vers un compte FaroukManager (rapprochement ultérieur)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FormationModule(Base):
    """Un module de formation. Catalogue modifiable depuis l'application."""

    __tablename__ = "formation_module"

    id = Column(Integer, primary_key=True)
    nom = Column(String(200), unique=True, nullable=False, index=True)
    ordre = Column(Integer, default=0, nullable=False, index=True)
    obligatoire = Column(Boolean, default=True, nullable=False)
    actif = Column(Boolean, default=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FormationSession(Base):
    """Une formation suivie par un agent sur un module, à une date donnée.

    Plusieurs sessions peuvent exister pour un même couple (agent, module) :
    c'est ce qui permet de conserver l'historique et les reformations, alors
    que le fichier Excel écrasait les dates dans une seule cellule.
    """

    __tablename__ = "formation_session"

    id = Column(Integer, primary_key=True)
    personnel_id = Column(
        Integer, ForeignKey("formation_personnel.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    module_id = Column(
        Integer, ForeignKey("formation_module.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    date_session = Column(Date, nullable=True, index=True)
    statut = Column(String(30), default="A_FORMER", nullable=False, index=True)
    evaluation = Column(String(30), nullable=True)
    note = Column(Float, nullable=True)                  # sur 20
    observation = Column(Text, nullable=True)
    formateur = Column(String(200), nullable=True)

    cree_par_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("personnel_id", "module_id", "date_session",
                         name="uq_formation_session_personnel_module_date"),
    )
