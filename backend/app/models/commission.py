"""
Modèle Commissions Réseau.
===========================
Gère les commissions Orange Mali par PDV et par période.

Règle universelle (tous types RNS / RSF / RS / KIOSQUE) :
  - Orange verse 100% au PDG
  - Part réseau = 30% du brut
  - Part PDV    = 70% du brut (à reverser si KIOSQUE/RS, déjà parti si RNS/RSF)

La différence RNS/RSF vs RS/KIOSQUE est gérée dans le champ `pdv_gere_reversement` :
  - KIOSQUE / RS  : True  → le réseau gère le reversement des 70%
  - RNS / RSF     : False → Orange paie directement le PDV, le réseau ne gère pas les 70%
"""
from datetime import datetime
import enum
from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, Float, Text,
    ForeignKey, Enum, JSON, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class PDVType(str, enum.Enum):
    RNS    = "RNS"      # Revendeur Non Supervisé
    RSF    = "RSF"      # Revendeur Supervisé Fixe
    RS     = "RS"       # Revendeur Supervisé
    KIOSQUE = "KIOSQUE" # Kiosque


class ReversementStatus(str, enum.Enum):
    NON_APPLICABLE = "NON_APPLICABLE"  # RNS / RSF : Orange paie directement
    EN_ATTENTE     = "EN_ATTENTE"      # KIOSQUE/RS : à reverser
    PARTIEL        = "PARTIEL"         # Reversement partiel
    PAYE           = "PAYE"            # Reversement complet effectué


# Mapping type → gestion reversement
TYPE_GERE_REVERSEMENT = {
    PDVType.RNS:     False,   # Orange verse directement au PDV
    PDVType.RSF:     False,   # Orange verse directement au PDV
    PDVType.RS:      True,    # PDG reçoit tout, doit reverser les 70%
    PDVType.KIOSQUE: True,    # PDG reçoit tout, doit reverser les 70%
}

TAUX_RESEAU = 0.30   # 30% au réseau
TAUX_PDV    = 0.70   # 70% au PDV


class CommissionEntry(Base):
    """
    Une ligne de commission = un PDV pour une période donnée.
    Importée depuis Excel ou saisie manuellement.
    """
    __tablename__ = "commission_entries"

    id = Column(Integer, primary_key=True, index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=True, index=True)

    # Identifiant PDV tel qu'il apparaît dans l'export Orange
    pdv_numero = Column(String, nullable=False, index=True)
    pdv_nom    = Column(String, nullable=True)
    pdv_type   = Column(Enum(PDVType), nullable=False, index=True)
    quartier   = Column(String, nullable=True, index=True)
    zone       = Column(String, nullable=True, index=True)
    sous_zone  = Column(String, nullable=True)
    gestionnaire = Column(String, nullable=True)
    superviseur  = Column(String, nullable=True)

    # Période (ex: "2026-04" ou "2026-W17")
    period_key = Column(String, nullable=False, index=True)
    period_type = Column(String, default="MONTHLY")  # MONTHLY / WEEKLY

    # Montants (FCFA)
    montant_brut     = Column(Float, nullable=False)   # 100% reçu d'Orange
    montant_reseau   = Column(Float, nullable=False)   # 30% = part du PDG
    montant_pdv      = Column(Float, nullable=False)   # 70% = part du PDV

    # Gestion du reversement (KIOSQUE / RS uniquement)
    gere_reversement = Column(Boolean, default=False)  # True si KIOSQUE/RS
    reversement_status = Column(
        Enum(ReversementStatus),
        default=ReversementStatus.NON_APPLICABLE,
        index=True,
    )
    montant_reverse  = Column(Float, default=0.0)   # Ce qui a déjà été reversé
    date_reversement = Column(DateTime, nullable=True)
    notes_reversement = Column(Text, nullable=True)

    # Metadata import
    source     = Column(String, default="import_xlsx")
    imported_at = Column(DateTime, default=datetime.utcnow)
    imported_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    extra = Column(JSON, nullable=True)  # Colonnes supplémentaires de l'Excel

    pdv      = relationship("PDV", foreign_keys=[pdv_id])
    imported_by = relationship("User", foreign_keys=[imported_by_id])

    __table_args__ = (
        UniqueConstraint("pdv_numero", "period_key", name="uq_commission_pdv_period"),
        Index("ix_commission_period_type", "period_key", "pdv_type"),
    )


class CommissionImport(Base):
    """Trace d'un import Excel (pour audit)."""
    __tablename__ = "commission_imports"

    id = Column(Integer, primary_key=True)
    filename   = Column(String, nullable=False)
    period_key = Column(String, nullable=False)
    period_type = Column(String, default="MONTHLY")
    imported_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    imported_at = Column(DateTime, default=datetime.utcnow)
    n_created  = Column(Integer, default=0)
    n_updated  = Column(Integer, default=0)
    n_skipped  = Column(Integer, default=0)
    notes      = Column(Text, nullable=True)
