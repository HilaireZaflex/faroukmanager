"""
Modèles du module Évaluation 360°.
====================================
- EvalConfig        : pondérations configurables par type de rôle
- EvalCampaign      : une campagne d'évaluation (période + scope)
- EvalScore         : score global d'un agent pour une campagne
- EvalKPISnapshot   : snapshot des KPI automatiques
- MysteryCallTask   : tâche d'appel mystère assignée à une TC
- MysteryCallLog    : résultat d'un appel mystère
- EvalManualNote    : notes manuelles saisies par RC/Admin
- EvalObjective     : objectifs négociés en début de période
- EvalPeerReview    : évaluation 360° pairs (optionnel)
"""
from datetime import datetime
import enum
from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, Float, Text,
    ForeignKey, Enum, JSON, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class EvalRoleType(str, enum.Enum):
    SUPERVISEUR     = "SUPERVISEUR"
    GESTIONNAIRE    = "GESTIONNAIRE"
    DEVELOPPEUR     = "DEVELOPPEUR"
    TELECONSEILLERE = "TELECONSEILLERE"


class EvalPeriodType(str, enum.Enum):
    WEEKLY    = "WEEKLY"
    MONTHLY   = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    CUSTOM    = "CUSTOM"


class EvalStatus(str, enum.Enum):
    DRAFT     = "DRAFT"
    ACTIVE    = "ACTIVE"    # KPI calculés, appels en cours
    REVIEW    = "REVIEW"    # Notes manuelles en cours de saisie
    CLOSED    = "CLOSED"    # Score final calculé
    ARCHIVED  = "ARCHIVED"


class MysteryCallStatus(str, enum.Enum):
    PENDING   = "PENDING"
    DONE      = "DONE"
    FAILED    = "FAILED"    # PDV injoignable


class MysteryCallType(str, enum.Enum):
    LAST_VISIT      = "LAST_VISIT"     # Quand a eu lieu le dernier passage ?
    GEO_KNOWLEDGE   = "GEO_KNOWLEDGE"  # Test connaissance terrain (posé à l'agent)
    QUALITY_CHECK   = "QUALITY_CHECK"  # Vérification qualité interaction TC


# ─────────────────────────────────────────────────────────────────────────────
# 1. CONFIGURATION DES PONDÉRATIONS (par rôle, configurable par admin)
# ─────────────────────────────────────────────────────────────────────────────
class EvalConfig(Base):
    __tablename__ = "eval_configs"

    id = Column(Integer, primary_key=True)
    role_type   = Column(Enum(EvalRoleType), nullable=False, unique=True)
    name        = Column(String, nullable=False)
    weights     = Column(JSON, nullable=False)   # dict des pondérations
    criteria    = Column(JSON, nullable=False)   # liste des critères avec max
    is_active   = Column(Boolean, default=True)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    updated_by = relationship("User", foreign_keys=[updated_by_id])


# ─────────────────────────────────────────────────────────────────────────────
# 2. CAMPAGNE D'ÉVALUATION
# ─────────────────────────────────────────────────────────────────────────────
class EvalCampaign(Base):
    __tablename__ = "eval_campaigns"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    role_type   = Column(Enum(EvalRoleType), nullable=False, index=True)
    period_type = Column(Enum(EvalPeriodType), nullable=False)
    period_key  = Column(String, nullable=False, index=True)  # ex: "2026-04", "2026-W17"
    date_start  = Column(DateTime, nullable=False)
    date_end    = Column(DateTime, nullable=False)
    status      = Column(Enum(EvalStatus), default=EvalStatus.DRAFT, index=True)

    # Agents évalués (null = tous les agents du rôle)
    target_user_ids = Column(JSON, nullable=True)

    # Config de pondération utilisée (snapshot au moment de la création)
    config_snapshot = Column(JSON, nullable=True)

    # Appels mystères
    n_mystery_calls = Column(Integer, default=5)  # PDV par agent
    mystery_call_user_ids = Column(JSON, nullable=True)  # TC assignées

    created_at  = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at   = Column(DateTime, nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    scores     = relationship("EvalScore", back_populates="campaign", cascade="all, delete-orphan")
    mystery_tasks = relationship("MysteryCallTask", back_populates="campaign", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# 3. SCORE GLOBAL D'UN AGENT
# ─────────────────────────────────────────────────────────────────────────────
class EvalScore(Base):
    __tablename__ = "eval_scores"

    id          = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("eval_campaigns.id"), index=True, nullable=False)
    user_id     = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # Scores par dimension (0-100)
    score_kpi        = Column(Float, nullable=True)   # KPI automatiques
    score_terrain    = Column(Float, nullable=True)   # Appels mystères + présence
    score_mystery    = Column(Float, nullable=True)   # Notes appels mystères
    score_manual     = Column(Float, nullable=True)   # Notes manuelles RC/Admin
    score_discipline = Column(Float, nullable=True)   # Discipline / SLA (dev)
    score_quality    = Column(Float, nullable=True)   # Qualité (TC)
    score_impact     = Column(Float, nullable=True)   # Impact terrain (TC/Dev)

    # Score final pondéré
    score_final      = Column(Float, nullable=True)
    score_label      = Column(String, nullable=True)  # Excellent / Bien / etc.
    rank             = Column(Integer, nullable=True)  # Classement parmi les pairs

    # KPI snapshot (détail des métriques brutes)
    kpi_data    = Column(JSON, nullable=True)
    manual_notes = Column(JSON, nullable=True)

    # Plan d'amélioration IA
    ai_improvement_plan = Column(Text, nullable=True)

    # Statut
    is_final    = Column(Boolean, default=False)
    computed_at = Column(DateTime, nullable=True)
    validated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Bonus calculé
    bonus_amount = Column(Float, default=0.0)
    bonus_details = Column(JSON, nullable=True)

    campaign    = relationship("EvalCampaign", back_populates="scores")
    user        = relationship("User", foreign_keys=[user_id])
    validated_by = relationship("User", foreign_keys=[validated_by_id])

    __table_args__ = (
        UniqueConstraint("campaign_id", "user_id", name="uq_eval_score"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4. APPELS MYSTÈRES
# ─────────────────────────────────────────────────────────────────────────────
class MysteryCallTask(Base):
    """Tâche d'appel mystère : une TC doit appeler un PDV lié à un agent évalué."""
    __tablename__ = "mystery_call_tasks"

    id          = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("eval_campaigns.id"), index=True)
    target_user_id = Column(Integer, ForeignKey("users.id"), index=True)  # Agent évalué
    pdv_id      = Column(Integer, ForeignKey("pdvs.id"), nullable=False)
    tc_user_id  = Column(Integer, ForeignKey("users.id"), index=True)     # TC qui appelle
    call_type   = Column(Enum(MysteryCallType), nullable=False)
    status      = Column(Enum(MysteryCallStatus), default=MysteryCallStatus.PENDING)
    created_at  = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Question posée pendant l'appel
    question    = Column(Text, nullable=True)

    campaign    = relationship("EvalCampaign", back_populates="mystery_tasks")
    target_user = relationship("User", foreign_keys=[target_user_id])
    pdv         = relationship("PDV")
    tc_user     = relationship("User", foreign_keys=[tc_user_id])
    logs        = relationship("MysteryCallLog", back_populates="task", cascade="all, delete-orphan")


class MysteryCallLog(Base):
    """Résultat d'un appel mystère."""
    __tablename__ = "mystery_call_logs"

    id      = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("mystery_call_tasks.id"), index=True)
    tc_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Résultat de l'appel
    outcome     = Column(String, nullable=False)  # REACHED / NO_ANSWER / etc.
    answer      = Column(Text, nullable=True)      # Réponse du PDV
    note        = Column(Float, nullable=True)     # Note 0-10 attribuée
    comment     = Column(Text, nullable=True)      # Commentaire TC
    duration_sec = Column(Integer, nullable=True)

    # Pour le type GEO_KNOWLEDGE : réponse de l'agent évalué
    agent_answer = Column(Text, nullable=True)
    agent_score  = Column(Float, nullable=True)

    created_at  = Column(DateTime, default=datetime.utcnow)

    task    = relationship("MysteryCallTask", back_populates="logs")
    tc_user = relationship("User", foreign_keys=[tc_user_id])


# ─────────────────────────────────────────────────────────────────────────────
# 5. NOTES MANUELLES (RC / Admin)
# ─────────────────────────────────────────────────────────────────────────────
class EvalManualNote(Base):
    __tablename__ = "eval_manual_notes"

    id          = Column(Integer, primary_key=True)
    campaign_id = Column(Integer, ForeignKey("eval_campaigns.id"), index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), index=True)  # Agent évalué
    criterion   = Column(String, nullable=False)   # ex: "geo_knowledge"
    note        = Column(Float, nullable=False)    # 0-10
    max_note    = Column(Float, default=10.0)
    comment     = Column(Text, nullable=True)
    added_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    added_at    = Column(DateTime, default=datetime.utcnow)

    added_by = relationship("User", foreign_keys=[added_by_id])


# ─────────────────────────────────────────────────────────────────────────────
# 6. OBJECTIFS NÉGOCIÉS
# ─────────────────────────────────────────────────────────────────────────────
class EvalObjective(Base):
    __tablename__ = "eval_objectives"

    id          = Column(Integer, primary_key=True)
    campaign_id = Column(Integer, ForeignKey("eval_campaigns.id"), index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), index=True)
    criterion   = Column(String, nullable=False)   # ex: "target_activations"
    target_value = Column(Float, nullable=False)
    actual_value = Column(Float, nullable=True)
    unit        = Column(String, nullable=True)    # ex: "activations", "FCFA", "%"
    bonus_if_reached = Column(Float, default=0.0)
    proposed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Agent lui-même
    validated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True) # RC/Admin
    status      = Column(String, default="PROPOSED")  # PROPOSED / VALIDATED / REJECTED
    created_at  = Column(DateTime, default=datetime.utcnow)

    proposed_by = relationship("User", foreign_keys=[proposed_by_id])
    validated_by = relationship("User", foreign_keys=[validated_by_id])

    __table_args__ = (
        UniqueConstraint("campaign_id", "user_id", "criterion", name="uq_eval_obj"),
    )
