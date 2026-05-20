"""
Modèles complémentaires pour le module Prospection.
====================================================
- PuceStock      : inventaire des puces disponibles
- Notification   : centre de notifications (in-app + log SMS/WhatsApp)
- DevBadge       : badges gamification développeurs
- DevObjective   : objectifs mensuels des développeurs
- PostActivationKPI : suivi 30/60/90j d'une puce activée
- WorkflowConfig : configuration paramétrable du workflow (super-admin)
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, Float, Text,
    ForeignKey, Enum, JSON, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.core.database import Base


# ─────────────────────────────────────────────────────────────────────────────
# 1. STOCK DE PUCES
# ─────────────────────────────────────────────────────────────────────────────
class PuceStockStatus(str, enum.Enum):
    DISPONIBLE = "DISPONIBLE"
    RESERVEE = "RESERVEE"      # Attribuée à un prospect mais non activée
    ACTIVEE = "ACTIVEE"        # Plus dans le stock
    DEFECTUEUSE = "DEFECTUEUSE"
    PERDUE = "PERDUE"


class PuceStock(Base):
    __tablename__ = "puce_stock"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String, unique=True, index=True, nullable=False)
    lot = Column(String, index=True, nullable=True)        # Code du lot
    serie = Column(String, nullable=True)                  # Série (range)
    status = Column(Enum(PuceStockStatus), default=PuceStockStatus.DISPONIBLE, index=True)

    received_at = Column(DateTime, default=datetime.utcnow)
    received_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)

    # Liens
    reserved_for_prospect_id = Column(Integer, ForeignKey("prospects.id"), nullable=True)
    reserved_at = Column(DateTime, nullable=True)
    activated_at = Column(DateTime, nullable=True)

    received_by = relationship("User", foreign_keys=[received_by_id])
    prospect = relationship("Prospect", foreign_keys=[reserved_for_prospect_id])


# ─────────────────────────────────────────────────────────────────────────────
# 2. NOTIFICATIONS
# ─────────────────────────────────────────────────────────────────────────────
class NotifChannel(str, enum.Enum):
    IN_APP = "IN_APP"
    SMS = "SMS"
    WHATSAPP = "WHATSAPP"
    EMAIL = "EMAIL"


class NotifStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    READ = "READ"
    FAILED = "FAILED"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    recipient_phone = Column(String, nullable=True)        # Pour SMS/WhatsApp prospect
    channel = Column(Enum(NotifChannel), default=NotifChannel.IN_APP, index=True)
    status = Column(Enum(NotifStatus), default=NotifStatus.PENDING, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String, nullable=True)                   # /prospection/123 etc.
    related_prospect_id = Column(Integer, ForeignKey("prospects.id"), nullable=True, index=True)
    template = Column(String, nullable=True)               # ex: 'visit_assigned'
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)

    recipient = relationship("User", foreign_keys=[recipient_user_id])


# ─────────────────────────────────────────────────────────────────────────────
# 3. GAMIFICATION
# ─────────────────────────────────────────────────────────────────────────────
class DevBadge(Base):
    __tablename__ = "dev_badges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    code = Column(String, index=True, nullable=False)      # 'top_prospecteur_mois'
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True)                   # emoji ou nom d'icône
    earned_at = Column(DateTime, default=datetime.utcnow)
    period = Column(String, nullable=True)                 # ex: '2026-04'
    extra = Column(JSON, nullable=True)

    user = relationship("User")
    __table_args__ = (Index("ix_dev_badge_user_period", "user_id", "period"),)


class DevObjective(Base):
    __tablename__ = "dev_objectives"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    period = Column(String, nullable=False)                # '2026-04'
    target_visits = Column(Integer, default=0)
    target_validations = Column(Integer, default=0)
    target_activations = Column(Integer, default=0)
    bonus_amount = Column(Float, default=0.0)              # FCFA si atteint
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    __table_args__ = (UniqueConstraint("user_id", "period", name="uq_dev_obj"),)


# ─────────────────────────────────────────────────────────────────────────────
# 4. SUIVI POST-ACTIVATION
# ─────────────────────────────────────────────────────────────────────────────
class PostActivationKPI(Base):
    __tablename__ = "post_activation_kpi"

    id = Column(Integer, primary_key=True, index=True)
    prospect_id = Column(Integer, ForeignKey("prospects.id"), index=True, nullable=False)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=True)
    period_days = Column(Integer, nullable=False)          # 30, 60 ou 90
    measured_at = Column(DateTime, default=datetime.utcnow)

    ca_predit = Column(Float, nullable=True)
    ca_reel = Column(Float, nullable=True)
    nb_transactions = Column(Integer, default=0)
    nb_jours_actifs = Column(Integer, default=0)
    is_dormant = Column(Boolean, default=False)
    satisfaction_score = Column(Integer, nullable=True)    # 1-5
    notes = Column(Text, nullable=True)

    prospect = relationship("Prospect")


# ─────────────────────────────────────────────────────────────────────────────
# 5. CONFIG WORKFLOW (paramétrable par super-admin)
# ─────────────────────────────────────────────────────────────────────────────
class WorkflowConfig(Base):
    __tablename__ = "workflow_config"

    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(JSON, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
