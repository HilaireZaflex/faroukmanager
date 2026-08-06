"""
Modèle KaabuTransaction — Transactions hebdomadaires KAABU Mobile
Une ligne = 1 PDV × 1 semaine
"""
from sqlalchemy import Column, Integer, String, Float, BigInteger, Index, UniqueConstraint
from app.core.database import Base


class KaabuTransaction(Base):
    __tablename__ = "kaabu_transactions"

    id = Column(Integer, primary_key=True, index=True)

    # Identifiants
    numero_pdv = Column(String, nullable=False, index=True)
    login = Column(String, nullable=True)
    semaine = Column(String, nullable=False, index=True)   # ex: S27
    annee = Column(Integer, nullable=False, index=True)

    # Volumes et montants
    volume_cashin = Column(Integer, nullable=True, default=0)
    montant_cashin = Column(BigInteger, nullable=True, default=0)
    volume_cashout = Column(Integer, nullable=True, default=0)
    montant_cashout = Column(BigInteger, nullable=True, default=0)
    volume_kaabu = Column(Integer, nullable=True, default=0)   # cashin + cashout
    montant_global = Column(BigInteger, nullable=True, default=0)

    # Catégorie (Sanou, Wari, etc.)
    categorie = Column(String, nullable=True)
    segment = Column(String, nullable=True)   # Or, Silver, Bronze...

    # Situation Login
    situation_login = Column(String, nullable=True)   # ACTIF REGULIER S31, Ancienne Activation, etc.
    est_actif = Column(Integer, nullable=True, default=0)   # 1=actif, 0=inactif

    # Hiérarchie
    superviseur = Column(String, nullable=True, index=True)
    groupe = Column(String, nullable=True, index=True)         # GRP 1, GRP 2... = Gestionnaire
    teleconseillere = Column(String, nullable=True, index=True)
    coach_distri = Column(String, nullable=True, index=True)
    developpeur = Column(String, nullable=True, index=True)
    agent_operation_speciale = Column(String, nullable=True)

    # Localisation
    type_pdv = Column(String, nullable=True)     # RNS, KIOSQUE...
    localite = Column(String, nullable=True)
    quartier = Column(String, nullable=True)
    est_hors_zone = Column(Integer, nullable=True, default=0)  # 1 si Bittard/Hors Zone

    __table_args__ = (
        # Pas de contrainte unique car un PDV peut avoir plusieurs catégories par semaine
        # On agrège lors de l'import
        Index('ix_kaabu_sem_annee', 'semaine', 'annee'),
        Index('ix_kaabu_sup', 'superviseur'),
        Index('ix_kaabu_groupe', 'groupe'),
    )
