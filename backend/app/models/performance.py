from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class WeeklyPerformance(Base):
    __tablename__ = "weekly_performances"

    id = Column(Integer, primary_key=True, index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=False)
    annee = Column(Integer, nullable=False)
    semaine = Column(Integer, nullable=False)  # 1-52

    # ── Volumes opérationnels ──────────────────────────────────────────────
    # Ancien champ "ca" = dépôts + retraits, renommé montant_transaction
    # On garde "ca" en base pour compatibilité ascendante (= montant_transaction)
    ca = Column(Float, default=0.0)                    # ← DEPRECATED: alias de montant_transaction
    montant_transaction = Column(Float, default=0.0)   # Dépôts + Retraits (volume brut)
    montant_ca = Column(Float, default=0.0)            # CA Orange réel (base CASHOUT uniquement)

    nb_operations = Column(Integer, default=0)
    nb_depots = Column(Integer, default=0)
    montant_depots = Column(Float, default=0.0)
    nb_retraits = Column(Integer, default=0)
    montant_retraits = Column(Float, default=0.0)

    # ── Commissions Orange ─────────────────────────────────────────────────
    commission_pdg = Column(Float, default=0.0)        # Commission PDG (col J du fichier EXPORT)
    commission_revendeur = Column(Float, default=0.0)  # Commission Revendeur (col K du fichier EXPORT)

    # ── Indicateurs qualité ────────────────────────────────────────────────
    ratio_ca_transaction = Column(Float, default=0.0)  # montant_ca / montant_transaction × 100

    est_actif = Column(Boolean, default=False)

    # Calculés
    ca_semaine_precedente = Column(Float, default=0.0)
    taux_variation = Column(Float, default=0.0)
    indicateur = Column(String, default='OMY')

    created_at = Column(DateTime, default=datetime.utcnow)

    pdv = relationship("PDV", back_populates="weekly_performances")

class MonthlyPerformance(Base):
    __tablename__ = "monthly_performances"

    id = Column(Integer, primary_key=True, index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=False)
    annee = Column(Integer, nullable=False)
    mois = Column(Integer, nullable=False)  # 1-12

    # ── Volumes opérationnels ──────────────────────────────────────────────
    # Ancien champ "ca" = dépôts + retraits, renommé montant_transaction
    # On garde "ca" en base pour compatibilité ascendante (= montant_transaction)
    ca = Column(Float, default=0.0)                    # ← DEPRECATED: alias de montant_transaction
    montant_transaction = Column(Float, default=0.0)   # Dépôts + Retraits (volume brut)
    montant_ca = Column(Float, default=0.0)            # CA Orange réel (base CASHOUT uniquement)

    nb_operations = Column(Integer, default=0)
    nb_depots = Column(Integer, default=0)
    montant_depots = Column(Float, default=0.0)
    nb_retraits = Column(Integer, default=0)
    montant_retraits = Column(Float, default=0.0)

    # ── Commissions Orange ─────────────────────────────────────────────────
    commission_pdg = Column(Float, default=0.0)        # Commission PDG (col J du fichier EXPORT)
    commission_revendeur = Column(Float, default=0.0)  # Commission Revendeur (col K du fichier EXPORT)

    # ── Indicateurs qualité ────────────────────────────────────────────────
    ratio_ca_transaction = Column(Float, default=0.0)  # montant_ca / montant_transaction × 100

    est_actif = Column(Boolean, default=False)

    ca_mois_precedent = Column(Float, default=0.0)
    taux_variation = Column(Float, default=0.0)
    indicateur = Column(String, default='OMY')

    created_at = Column(DateTime, default=datetime.utcnow)

    pdv = relationship("PDV", back_populates="monthly_performances")
