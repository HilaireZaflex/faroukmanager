"""
Modèles du module Indicateurs.
================================
- Indicator              : définition d'un indicateur (nom, code, méthode de calcul)
- IndicatorVersion       : versioning de la définition
- IndicatorScore         : snapshot par PDV/période (PDV fait/fait pas)
- CallCampaign           : campagne d'appels téléphoniques
- CallTask               : tâche individuelle (un PDV à appeler)
- CallLog                : trace d'un appel + commentaires + analyse IA
- FieldCampaign          : campagne de visites terrain (similaire CallCampaign)
- FieldVisit             : trace d'une visite terrain
- IndicatorTicket        : ticket de suivi d'un PDV problématique
- IndicatorAlert         : règle d'alerte automatique
"""
from datetime import datetime
import enum
from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, Float, Text,
    ForeignKey, Enum, JSON, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


# ─────────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────────
class IndicatorCategory(str, enum.Enum):
    PRODUIT = "PRODUIT"
    SERVICE = "SERVICE"
    PROMOTION = "PROMOTION"
    CAMPAGNE = "CAMPAGNE"
    QUALITE = "QUALITE"
    AUTRE = "AUTRE"


class IndicatorMethod(str, enum.Enum):
    MANUAL = "MANUAL"        # Saisie manuelle ou import (boolean)
    THRESHOLD = "THRESHOLD"  # Métrique > seuil
    FORMULA = "FORMULA"      # Formule libre


class IndicatorPeriod(str, enum.Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"


class IndicatorStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ARCHIVED = "ARCHIVED"


class CampaignStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class CallTaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"
    RESCHEDULED = "RESCHEDULED"


class CallOutcome(str, enum.Enum):
    REACHED = "REACHED"            # ✅ joint
    NO_ANSWER = "NO_ANSWER"        # ❌ pas de réponse
    WRONG_NUMBER = "WRONG_NUMBER"  # 📞 faux numéro
    REFUSED = "REFUSED"            # 🚫 refus
    CALLBACK = "CALLBACK"          # 🔁 à rappeler
    BUSY = "BUSY"                  # 📵 occupé
    OFF = "OFF"                    # 📴 éteint


class EngagementLevel(str, enum.Enum):
    YES = "YES"           # Accepte
    CONDITIONAL = "CONDITIONAL"  # Conditionnel
    NO = "NO"            # Refuse
    UNKNOWN = "UNKNOWN"


class TicketStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


# ─────────────────────────────────────────────────────────────────────────────
# 1. INDICATOR — Définition d'un indicateur
# ─────────────────────────────────────────────────────────────────────────────
class Indicator(Base):
    __tablename__ = "indicators"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)  # KBU, NFM, OMY...
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(Enum(IndicatorCategory), default=IndicatorCategory.PRODUIT, index=True)
    icon = Column(String, nullable=True)        # Emoji ou nom Lucide
    color = Column(String, nullable=True)       # #RRGGBB

    method = Column(Enum(IndicatorMethod), default=IndicatorMethod.MANUAL)
    # Pour THRESHOLD : nom du champ de métrique (ex: "ca_kaabu")
    metric_field = Column(String, nullable=True)
    threshold_value = Column(Float, nullable=True)
    # Pour FORMULA : expression Python sandboxed
    formula = Column(Text, nullable=True)

    period = Column(Enum(IndicatorPeriod), default=IndicatorPeriod.MONTHLY)
    status = Column(Enum(IndicatorStatus), default=IndicatorStatus.ACTIVE, index=True)

    # Cibles & objectifs (optionnels)
    target_rate_pct = Column(Float, nullable=True)     # Ex: viser 70%
    weight = Column(Float, default=1.0)                # Pour indicateurs composés

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id])
    versions = relationship("IndicatorVersion", back_populates="indicator", cascade="all, delete-orphan")
    scores = relationship("IndicatorScore", back_populates="indicator", cascade="all, delete-orphan")


class IndicatorVersion(Base):
    """Historique des modifications de la définition d'un indicateur."""
    __tablename__ = "indicator_versions"

    id = Column(Integer, primary_key=True)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), index=True, nullable=False)
    version_no = Column(Integer, nullable=False)
    snapshot = Column(JSON, nullable=False)       # Toute la définition à ce moment
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)
    change_note = Column(Text, nullable=True)

    indicator = relationship("Indicator", back_populates="versions")


# ─────────────────────────────────────────────────────────────────────────────
# 2. INDICATOR_SCORE — Snapshot par PDV/période
# ─────────────────────────────────────────────────────────────────────────────
class IndicatorScore(Base):
    """
    Représente "PDV X fait l'indicateur Y pour la période Z" (oui/non).
    Un enregistrement par (PDV, indicateur, période).
    """
    __tablename__ = "indicator_scores"

    id = Column(Integer, primary_key=True, index=True)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), index=True, nullable=False)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), index=True, nullable=False)
    period_key = Column(String, nullable=False, index=True)  # "2026-04" ou "2026-W17"

    is_active = Column(Boolean, default=False, index=True)   # Le PDV fait l'indicateur ?
    raw_value = Column(Float, nullable=True)                  # Valeur métrique mesurée (CA, etc.)
    target_value = Column(Float, nullable=True)               # Seuil/objectif appliqué

    measured_at = Column(DateTime, default=datetime.utcnow)
    source = Column(String, nullable=True)                    # "import_xlsx", "api", "manual"
    extra = Column(JSON, nullable=True)

    indicator = relationship("Indicator", back_populates="scores")
    pdv = relationship("PDV")

    __table_args__ = (
        UniqueConstraint("indicator_id", "pdv_id", "period_key", name="uq_score"),
        Index("ix_score_indic_period", "indicator_id", "period_key"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. CAMPAGNES D'APPELS
# ─────────────────────────────────────────────────────────────────────────────
class CallCampaign(Base):
    __tablename__ = "call_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    indicator_ids = Column(JSON, nullable=True)            # liste IDs indicateurs ciblés
    target_rate_pct = Column(Float, nullable=True)         # objectif ex: +10%
    status = Column(Enum(CampaignStatus), default=CampaignStatus.DRAFT, index=True)

    starts_at = Column(DateTime, default=datetime.utcnow)
    ends_at = Column(DateTime, nullable=True)

    filter_zone = Column(String, nullable=True)
    filter_quartier = Column(String, nullable=True)
    filter_extra = Column(JSON, nullable=True)             # autres filtres

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    tasks = relationship("CallTask", back_populates="campaign", cascade="all, delete-orphan")


class CallTask(Base):
    """Une tâche d'appel = un PDV à appeler par une téléconseillère."""
    __tablename__ = "call_tasks"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("call_campaigns.id"), index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), index=True, nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    status = Column(Enum(CallTaskStatus), default=CallTaskStatus.PENDING, index=True)
    priority = Column(Integer, default=0)                  # Tri dans la file d'attente
    scheduled_for = Column(DateTime, nullable=True)        # Pour les rappels
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    campaign = relationship("CallCampaign", back_populates="tasks")
    pdv = relationship("PDV")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    logs = relationship("CallLog", back_populates="task", cascade="all, delete-orphan")


class CallLog(Base):
    """Trace d'un appel effectué + commentaires + analyse IA."""
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("call_tasks.id"), index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    outcome = Column(Enum(CallOutcome), nullable=False)
    engagement = Column(Enum(EngagementLevel), default=EngagementLevel.UNKNOWN)
    duration_sec = Column(Integer, nullable=True)
    comment = Column(Text, nullable=True)

    # Analyse IA du commentaire
    ai_sentiment = Column(String, nullable=True)        # positive / neutral / negative
    ai_categories = Column(JSON, nullable=True)         # ["pas_interesse", "concurrence"]
    ai_heat_score = Column(Float, nullable=True)        # 0-100 chaud/froid
    ai_summary = Column(Text, nullable=True)

    # Indicateurs discutés pendant l'appel
    indicator_ids_discussed = Column(JSON, nullable=True)

    # Géolocalisation de la téléconseillère (anti-fraude)
    call_lat = Column(Float, nullable=True)
    call_lng = Column(Float, nullable=True)

    callback_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("CallTask", back_populates="logs")
    pdv = relationship("PDV")
    user = relationship("User", foreign_keys=[user_id])


# ─────────────────────────────────────────────────────────────────────────────
# 4. CAMPAGNES TERRAIN (visites par développeurs)
# ─────────────────────────────────────────────────────────────────────────────
class FieldCampaign(Base):
    __tablename__ = "field_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    indicator_ids = Column(JSON, nullable=True)
    status = Column(Enum(CampaignStatus), default=CampaignStatus.DRAFT, index=True)
    starts_at = Column(DateTime, default=datetime.utcnow)
    ends_at = Column(DateTime, nullable=True)
    filter_extra = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    visits = relationship("FieldVisit", back_populates="campaign", cascade="all, delete-orphan")


class FieldVisit(Base):
    __tablename__ = "field_visits"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("field_campaigns.id"), index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), index=True, nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    status = Column(Enum(CallTaskStatus), default=CallTaskStatus.PENDING, index=True)

    visited_at = Column(DateTime, nullable=True)
    visited_lat = Column(Float, nullable=True)
    visited_lng = Column(Float, nullable=True)
    photo_url = Column(String, nullable=True)
    report = Column(Text, nullable=True)
    action_taken = Column(String, nullable=True)
    indicator_ids_discussed = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    campaign = relationship("FieldCampaign", back_populates="visits")
    pdv = relationship("PDV")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])


# ─────────────────────────────────────────────────────────────────────────────
# 5. TICKETS (suivi PDV problématiques)
# ─────────────────────────────────────────────────────────────────────────────
class IndicatorTicket(Base):
    __tablename__ = "indicator_tickets"

    id = Column(Integer, primary_key=True, index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), index=True, nullable=False)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), index=True, nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(TicketStatus), default=TicketStatus.OPEN, index=True)
    priority = Column(Integer, default=0)
    opened_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pdv = relationship("PDV")
    indicator = relationship("Indicator")


# ─────────────────────────────────────────────────────────────────────────────
# 6. ALERTES configurables
# ─────────────────────────────────────────────────────────────────────────────
class IndicatorAlertRule(Base):
    __tablename__ = "indicator_alert_rules"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), index=True, nullable=True)
    rule_type = Column(String, nullable=False)         # "min_rate", "champion_drop", "trend"
    threshold = Column(Float, nullable=True)
    scope = Column(JSON, nullable=True)                 # {"zone": "Bamako"}
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
