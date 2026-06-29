"""
Pydantic schemas pour le module Prospection.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.models.prospect import (
    ProspectStatus,
    LocalType,
    FrequentationLevel,
    IDType,
    DecisionType,
    AttachmentKind,
)


# ── Constantes métier (configurable par admin plus tard) ─────────────────────
CAPITAL_MINIMUM_NON_OM = 50000  # FCFA — seuil minimum de capital de démarrage


# ─────────────────────────────────────────────────────────────────────────────
# Sous-schémas
# ─────────────────────────────────────────────────────────────────────────────

class UserMini(BaseModel):
    id: int
    nom: str
    prenom: Optional[str] = None
    role: Optional[str] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Création d'un prospect
# ─────────────────────────────────────────────────────────────────────────────

class ProspectCreate(BaseModel):
    # Personnel
    nom: str = Field(..., min_length=1)
    prenom: str = Field(..., min_length=1)
    telephone_principal: str = Field(..., min_length=6)
    telephone_secondaire: Optional[str] = None
    quartier: Optional[str] = None
    adresse: Optional[str] = None
    piece_identite_type: Optional[IDType] = None
    piece_identite_numero: Optional[str] = None

    # OM
    fait_om: bool = False
    om_commission_mensuelle: Optional[float] = None
    om_ca_mensuel: Optional[float] = None
    om_ancienne_puce: Optional[str] = None
    om_raison_changement: Optional[str] = None
    capital_demarrage: Optional[float] = None
    source_financement: Optional[str] = None

    # PDV
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    pdv_adresse: Optional[str] = None
    pdv_nom_lieu: Optional[str] = None
    type_local: LocalType = LocalType.BOUTIQUE_FIXE
    frequentation: Optional[FrequentationLevel] = None
    concurrents: Optional[List[str]] = None

    notes: Optional[str] = None

    @field_validator("capital_demarrage")
    @classmethod
    def _check_capital(cls, v, info):
        # Validation conditionnelle : si fait_om = False et capital fourni,
        # il doit dépasser le seuil minimum.
        data = info.data
        if data.get("fait_om") is False and v is not None:
            if v < CAPITAL_MINIMUM_NON_OM:
                raise ValueError(
                    f"Capital de démarrage insuffisant : minimum requis "
                    f"{CAPITAL_MINIMUM_NON_OM} FCFA."
                )
        return v


class ProspectUpdate(BaseModel):
    """Mise à jour partielle (avant validation par dev)."""
    nom: Optional[str] = None
    prenom: Optional[str] = None
    telephone_principal: Optional[str] = None
    telephone_secondaire: Optional[str] = None
    quartier: Optional[str] = None
    adresse: Optional[str] = None
    piece_identite_type: Optional[IDType] = None
    piece_identite_numero: Optional[str] = None
    fait_om: Optional[bool] = None
    om_commission_mensuelle: Optional[float] = None
    om_ca_mensuel: Optional[float] = None
    om_ancienne_puce: Optional[str] = None
    om_raison_changement: Optional[str] = None
    capital_demarrage: Optional[float] = None
    source_financement: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    pdv_adresse: Optional[str] = None
    pdv_nom_lieu: Optional[str] = None
    type_local: Optional[LocalType] = None
    frequentation: Optional[FrequentationLevel] = None
    concurrents: Optional[List[str]] = None
    notes: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Actions du workflow
# ─────────────────────────────────────────────────────────────────────────────

class AssignVisitRequest(BaseModel):
    developer_id: int = Field(..., description="ID du développeur affecté à la visite")
    comment: Optional[str] = None


class DevDecisionRequest(BaseModel):
    """Décision du développeur après visite terrain."""
    approved: bool
    comment: str = Field(..., min_length=3, description="Justification obligatoire")
    # Peut compléter / corriger les infos GPS lors de la visite
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class RCDecisionRequest(BaseModel):
    """Décision finale du RC."""
    decision: str = Field(..., description="approve | hold | reject")
    comment: Optional[str] = None

    @field_validator("decision")
    @classmethod
    def _check(cls, v):
        if v not in {"approve", "hold", "reject"}:
            raise ValueError("decision doit être 'approve', 'hold' ou 'reject'")
        return v


class PuceAssignRequest(BaseModel):
    """Le RC attribue une puce à un développeur activateur."""
    activator_id: int = Field(..., description="ID du développeur qui activera")
    puce_numero: str = Field(..., min_length=3)
    comment: Optional[str] = None


class PuceActivateRequest(BaseModel):
    """Le développeur confirme l'activation."""
    comment: Optional[str] = None
    create_pdv: bool = Field(default=True, description="Créer automatiquement la fiche PDV à partir du prospect")
    # Champs PDV à remplir lors de l'activation
    gestionnaire: Optional[str] = None
    superviseur: Optional[str] = None
    teleconseillere: Optional[str] = None
    zone: Optional[str] = None
    sous_zone: Optional[str] = None
    quartier_pdv: Optional[str] = None


class CancelRequest(BaseModel):
    comment: str = Field(..., min_length=3, description="Raison de l'annulation")


# ─────────────────────────────────────────────────────────────────────────────
# Sortie
# ─────────────────────────────────────────────────────────────────────────────

class ProspectHistoryOut(BaseModel):
    id: int
    decision_type: DecisionType
    from_status: Optional[ProspectStatus] = None
    to_status: Optional[ProspectStatus] = None
    comment: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None
    created_at: datetime
    user: Optional[UserMini] = None

    class Config:
        from_attributes = True


class ProspectAttachmentOut(BaseModel):
    id: int
    kind: AttachmentKind
    file_name: str
    file_path: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    uploaded_at: datetime
    uploaded_by: Optional[UserMini] = None

    class Config:
        from_attributes = True


class ProspectOut(BaseModel):
    id: int
    reference: str
    status: ProspectStatus

    nom: str
    prenom: str
    telephone_principal: str
    telephone_secondaire: Optional[str] = None
    quartier: Optional[str] = None
    adresse: Optional[str] = None
    piece_identite_type: Optional[IDType] = None
    piece_identite_numero: Optional[str] = None

    fait_om: bool
    om_commission_mensuelle: Optional[float] = None
    om_ca_mensuel: Optional[float] = None
    om_ancienne_puce: Optional[str] = None
    om_raison_changement: Optional[str] = None
    capital_demarrage: Optional[float] = None
    source_financement: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None
    pdv_adresse: Optional[str] = None
    pdv_nom_lieu: Optional[str] = None
    type_local: Optional[LocalType] = None
    frequentation: Optional[FrequentationLevel] = None
    concurrents: Optional[List[str]] = None

    submitted_by: Optional[UserMini] = None
    submitted_at: datetime
    visit_assigned_to: Optional[UserMini] = None
    visit_assigned_at: Optional[datetime] = None
    visit_attempts: int = 0
    dev_decision_at: Optional[datetime] = None
    dev_decision_comment: Optional[str] = None
    rc_decision_at: Optional[datetime] = None
    rc_decision_by: Optional[UserMini] = None
    rc_decision_comment: Optional[str] = None
    puce_assigned_to: Optional[UserMini] = None
    puce_assigned_at: Optional[datetime] = None
    puce_numero: Optional[str] = None
    activated_at: Optional[datetime] = None
    activated_pdv_id: Optional[int] = None

    sla_visit_due_at: Optional[datetime] = None
    sla_rc_due_at: Optional[datetime] = None
    sla_activation_due_at: Optional[datetime] = None

    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProspectDetailOut(ProspectOut):
    history: List[ProspectHistoryOut] = []
    attachments: List[ProspectAttachmentOut] = []


class ProspectStatsOut(BaseModel):
    total: int = 0
    nouvelles: int = 0
    en_visite: int = 0
    validees_dev: int = 0
    en_attente_rc: int = 0
    approuvees_rc: int = 0
    puce_attribuees: int = 0
    activees: int = 0
    refusees: int = 0
    annulees: int = 0
    sla_en_retard: int = 0
    taux_activation: float = 0.0  # activées / total
    delai_moyen_activation_h: Optional[float] = None
