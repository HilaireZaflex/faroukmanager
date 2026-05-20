"""
Module Prospection - Modèles SQLAlchemy
========================================
Gère le cycle de vie d'une demande de puce Orange Money,
depuis la soumission par un superviseur/développeur jusqu'à
l'activation finale sur le terrain.

Workflow :
  NOUVELLE -> EN_VISITE -> VALIDEE_DEV / REFUSEE_DEV
           -> EN_ATTENTE_RC / APPROUVEE_RC / REFUSEE_RC
           -> PUCE_ATTRIBUEE -> PUCE_ACTIVEE
           -> ANNULEE (à tout moment)
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Float, Enum, Text,
    ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


# ─────────────────────────────────────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────────────────────────────────────

class ProspectStatus(str, enum.Enum):
    """États possibles d'une demande de puce."""
    NOUVELLE = "NOUVELLE"                    # créée par superviseur/développeur
    EN_VISITE = "EN_VISITE"                  # un développeur a été affecté
    VALIDEE_DEV = "VALIDEE_DEV"              # développeur a validé après visite
    REFUSEE_DEV = "REFUSEE_DEV"              # développeur a refusé (peut être réaffecté)
    EN_ATTENTE_RC = "EN_ATTENTE_RC"          # RC met en attente (manque puces)
    APPROUVEE_RC = "APPROUVEE_RC"            # RC a approuvé
    REFUSEE_RC = "REFUSEE_RC"                # RC a refusé (définitif)
    PUCE_ATTRIBUEE = "PUCE_ATTRIBUEE"        # puce attribuée à un activateur
    PUCE_ACTIVEE = "PUCE_ACTIVEE"            # activation terminée
    ANNULEE = "ANNULEE"                      # annulée à tout moment


class LocalType(str, enum.Enum):
    BOUTIQUE_FIXE = "BOUTIQUE_FIXE"
    KIOSQUE = "KIOSQUE"
    TABLE = "TABLE"
    MOBILE = "MOBILE"
    AUTRE = "AUTRE"


class FrequentationLevel(str, enum.Enum):
    TRES_FREQUENTE = "TRES_FREQUENTE"
    MOYENNE = "MOYENNE"
    FAIBLE = "FAIBLE"


class IDType(str, enum.Enum):
    CNI = "CNI"
    PASSEPORT = "PASSEPORT"
    PERMIS = "PERMIS"
    NINA = "NINA"
    AUTRE = "AUTRE"


class DecisionType(str, enum.Enum):
    """Types de décisions enregistrées dans l'historique."""
    SUBMIT = "SUBMIT"
    ASSIGN_VISIT = "ASSIGN_VISIT"
    DEV_VALIDATE = "DEV_VALIDATE"
    DEV_REJECT = "DEV_REJECT"
    RC_APPROVE = "RC_APPROVE"
    RC_HOLD = "RC_HOLD"
    RC_REJECT = "RC_REJECT"
    PUCE_ASSIGN = "PUCE_ASSIGN"
    PUCE_ACTIVATE = "PUCE_ACTIVATE"
    CANCEL = "CANCEL"
    REASSIGN = "REASSIGN"


# ─────────────────────────────────────────────────────────────────────────────
# MODÈLE PRINCIPAL : Prospect
# ─────────────────────────────────────────────────────────────────────────────

class Prospect(Base):
    """Fiche d'un prospect / demande de puce Orange Money."""
    __tablename__ = "prospects"

    id = Column(Integer, primary_key=True, index=True)

    # ── Référence unique métier (ex: PROS-2026-000123) ─────────────────────
    reference = Column(String, unique=True, index=True, nullable=False)

    # ── Statut workflow ────────────────────────────────────────────────────
    status = Column(
        Enum(ProspectStatus),
        default=ProspectStatus.NOUVELLE,
        nullable=False,
        index=True
    )

    # ── Informations personnelles ──────────────────────────────────────────
    nom = Column(String, nullable=False)
    prenom = Column(String, nullable=False)
    telephone_principal = Column(String, nullable=False, index=True)
    telephone_secondaire = Column(String, nullable=True)
    quartier = Column(String, nullable=True)
    adresse = Column(String, nullable=True)
    piece_identite_type = Column(Enum(IDType), nullable=True)
    piece_identite_numero = Column(String, nullable=True)

    # ── Historique Orange Money ────────────────────────────────────────────
    fait_om = Column(Boolean, default=False, nullable=False)
    # Si fait_om == True
    om_commission_mensuelle = Column(Float, nullable=True)   # FCFA
    om_ca_mensuel = Column(Float, nullable=True)             # FCFA
    om_ancienne_puce = Column(String, nullable=True)
    om_raison_changement = Column(Text, nullable=True)
    # Si fait_om == False
    capital_demarrage = Column(Float, nullable=True)         # FCFA
    source_financement = Column(String, nullable=True)

    # ── Localisation du futur PDV (GPS obligatoire pour valider) ───────────
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    pdv_adresse = Column(String, nullable=True)
    pdv_nom_lieu = Column(String, nullable=True)
    type_local = Column(Enum(LocalType), default=LocalType.BOUTIQUE_FIXE)
    frequentation = Column(Enum(FrequentationLevel), nullable=True)
    concurrents = Column(JSON, nullable=True)  # ex: ["Moov", "Wave"]

    # ── Workflow / suivi utilisateurs ─────────────────────────────────────
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Développeur affecté pour la visite terrain
    visit_assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    visit_assigned_at = Column(DateTime, nullable=True)
    # Décision développeur
    dev_decision_at = Column(DateTime, nullable=True)
    dev_decision_comment = Column(Text, nullable=True)
    # Compteur de réaffectations (2ème opinion possible)
    visit_attempts = Column(Integer, default=0, nullable=False)

    # Décision RC
    rc_decision_at = Column(DateTime, nullable=True)
    rc_decision_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rc_decision_comment = Column(Text, nullable=True)

    # Attribution puce
    puce_assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    puce_assigned_at = Column(DateTime, nullable=True)
    puce_numero = Column(String, nullable=True, index=True)

    # Activation
    activated_at = Column(DateTime, nullable=True)
    activated_pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=True)

    # ── SLA (calculé à partir de submitted_at) ─────────────────────────────
    # Délais maximum recommandés (en heures) — voir prospection_service
    sla_visit_due_at = Column(DateTime, nullable=True)       # 48h
    sla_rc_due_at = Column(DateTime, nullable=True)          # 72h après validation dev
    sla_activation_due_at = Column(DateTime, nullable=True)  # 48h après attribution

    # ── Notes internes ─────────────────────────────────────────────────────
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── Relations ──────────────────────────────────────────────────────────
    submitted_by = relationship("User", foreign_keys=[submitted_by_id])
    visit_assigned_to = relationship("User", foreign_keys=[visit_assigned_to_id])
    rc_decision_by = relationship("User", foreign_keys=[rc_decision_by_id])
    puce_assigned_to = relationship("User", foreign_keys=[puce_assigned_to_id])

    history = relationship(
        "ProspectHistory",
        back_populates="prospect",
        cascade="all, delete-orphan",
        order_by="ProspectHistory.created_at.desc()"
    )
    attachments = relationship(
        "ProspectAttachment",
        back_populates="prospect",
        cascade="all, delete-orphan"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Historique : journal de toutes les actions/décisions sur un prospect
# ─────────────────────────────────────────────────────────────────────────────

class ProspectHistory(Base):
    """Trace immuable de chaque action sur un prospect."""
    __tablename__ = "prospect_history"

    id = Column(Integer, primary_key=True, index=True)
    prospect_id = Column(Integer, ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    decision_type = Column(Enum(DecisionType), nullable=False)
    from_status = Column(Enum(ProspectStatus), nullable=True)
    to_status = Column(Enum(ProspectStatus), nullable=True)

    comment = Column(Text, nullable=True)
    extra = Column(JSON, nullable=True)  # données additionnelles (ex: id puce)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    prospect = relationship("Prospect", back_populates="history")
    user = relationship("User")


# ─────────────────────────────────────────────────────────────────────────────
# Pièces jointes : photos local, CNI, etc.
# ─────────────────────────────────────────────────────────────────────────────

class AttachmentKind(str, enum.Enum):
    PHOTO_LOCAL_FACADE = "PHOTO_LOCAL_FACADE"
    PHOTO_LOCAL_INTERIEUR = "PHOTO_LOCAL_INTERIEUR"
    PIECE_IDENTITE = "PIECE_IDENTITE"
    AUTRE = "AUTRE"


class ProspectAttachment(Base):
    __tablename__ = "prospect_attachments"

    id = Column(Integer, primary_key=True, index=True)
    prospect_id = Column(Integer, ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)

    kind = Column(Enum(AttachmentKind), default=AttachmentKind.AUTRE, nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)

    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    prospect = relationship("Prospect", back_populates="attachments")
    uploaded_by = relationship("User")
