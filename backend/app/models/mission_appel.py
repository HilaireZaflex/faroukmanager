"""
Modèles « Missions d'appels » (Phase 1).

Une mission d'appels est créée par l'ENCADREMENT — Admin, RC, Manager,
Responsable Conformité, Responsable Produit & Qualité Opérationnelle — puis
attribuée à une ou plusieurs téléconseillères, qui la reçoivent dans leur
Accueil TC avec le titre, la consigne, les objectifs et la liste détaillée
des cibles à appeler.

Deux natures de cible :
  · PDV       → le PDV (numéro de téléphone de la fiche PDV)
  · PERSONNE  → un utilisateur (superviseur, gestionnaire, TC, autre)

Choix de conception : on ne recopie QUE ce qui est par nature figé (le motif
de sélection, les compteurs, le statut). Les informations d'affichage (nom,
quartier, superviseur, téléphone) sont relues à la volée depuis `pdvs` /
`users`, qui sont les sources de vérité — sinon on reproduit le bug des
quartiers périmés corrigé sur les commissions.
"""
import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, DateTime, Date, Text, Boolean, Float, JSON,
    Index, Enum as SAEnum, ForeignKey,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base

# JSON sur SQLite, JSONB sur PostgreSQL (comme appels_tc et kaabu)
JSONVariant = JSON().with_variant(JSONB, "postgresql")


# ─── Énumérations ─────────────────────────────────────────────────────────────

class TypeMission(str, enum.Enum):
    RELANCE_ACTIVITE     = "RELANCE_ACTIVITE"       # Relancer des PDV peu actifs
    VERIFICATION_TERRAIN = "VERIFICATION_TERRAIN"   # Vérifier qu'un agent passe bien
    ENQUETE              = "ENQUETE"                # Enquête / sondage
    MIGRATION            = "MIGRATION"              # Dossier de migration
    CONTROLE_CONFORMITE  = "CONTROLE_CONFORMITE"    # Contrôle conformité
    AUTRE                = "AUTRE"


class PrioriteMission(str, enum.Enum):
    NORMALE = "NORMALE"
    HAUTE   = "HAUTE"
    URGENTE = "URGENTE"


class StatutMission(str, enum.Enum):
    BROUILLON = "BROUILLON"   # créée, pas encore diffusée
    ACTIVE    = "ACTIVE"      # visible dans la file des TC
    TERMINEE  = "TERMINEE"
    ANNULEE   = "ANNULEE"


class CibleType(str, enum.Enum):
    PDV      = "PDV"
    PERSONNE = "PERSONNE"


class StatutCible(str, enum.Enum):
    A_APPELER   = "A_APPELER"     # dans la file de la TC
    EN_COURS    = "EN_COURS"      # ouverte, pas encore enregistrée
    APPELE      = "APPELE"        # appel enregistré
    INJOIGNABLE = "INJOIGNABLE"   # à retenter (rappel programmé)
    ABANDONNE   = "ABANDONNE"     # retirée avec un motif


# ─── Libellés (repris côté frontend pour l'affichage) ─────────────────────────

TYPE_MISSION_LABELS = {
    "RELANCE_ACTIVITE":     "📈 Relance activité",
    "VERIFICATION_TERRAIN": "🚶 Vérification terrain",
    "ENQUETE":              "📊 Enquête / sondage",
    "MIGRATION":            "🚀 Migration",
    "CONTROLE_CONFORMITE":  "🛡️ Contrôle conformité",
    "AUTRE":                "📞 Autre",
}

PRIORITE_LABELS = {
    "NORMALE": "Normale",
    "HAUTE":   "🔶 Haute",
    "URGENTE": "🔴 Urgente",
}

STATUT_MISSION_LABELS = {
    "BROUILLON": "Brouillon",
    "ACTIVE":    "Active",
    "TERMINEE":  "Terminée",
    "ANNULEE":   "Annulée",
}


# ─── Mission ──────────────────────────────────────────────────────────────────

class MissionAppel(Base):
    """Un lot d'appels créé par l'encadrement et attribué à des TC."""
    __tablename__ = "missions_appels"

    id = Column(Integer, primary_key=True, index=True)

    # ── Ce que l'encadrement définit ──
    titre                = Column(String(250), nullable=False)
    type_mission         = Column(SAEnum(TypeMission), default=TypeMission.AUTRE, index=True)
    consigne             = Column(Text, nullable=True)      # texte à lire / respecter
    objectif_texte       = Column(Text, nullable=True)      # objectif en clair
    objectif_nb_appels   = Column(Integer, nullable=True)   # objectif chiffré
    objectif_nb_promesses = Column(Integer, nullable=True)
    objectif_taux_joignabilite = Column(Float, nullable=True)  # en %
    commentaire_obligatoire = Column(Boolean, default=False, nullable=False)
    # Statuts d'appel autorisés pour cette mission (liste de StatutAppel.value).
    # NULL = tous les statuts sont permis.
    statuts_autorises    = Column(JSONVariant, nullable=True)

    # ── Cadre temporel ──
    date_debut = Column(Date, nullable=True)
    echeance   = Column(Date, nullable=True, index=True)

    priorite = Column(SAEnum(PrioriteMission), default=PrioriteMission.NORMALE, index=True)
    statut   = Column(SAEnum(StatutMission), default=StatutMission.ACTIVE, index=True)

    # Filtres utilisés pour construire la cible (traçabilité / duplication)
    filtres = Column(JSONVariant, nullable=True)

    # ── Créateur (encadrement) ──
    created_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_by_nom = Column(String(200), nullable=True)   # instantané du nom du créateur
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at      = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_missions_appels_statut_echeance", "statut", "echeance"),
        Index("ix_missions_appels_createur", "created_by_id", "created_at"),
    )


class MissionCible(Base):
    """Une cible à appeler dans le cadre d'une mission."""
    __tablename__ = "mission_cibles"

    id         = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions_appels.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    type_cible = Column(SAEnum(CibleType), default=CibleType.PDV, nullable=False, index=True)

    # Cible PDV (l'un des deux est renseigné selon type_cible)
    pdv_id     = Column(Integer, ForeignKey("pdvs.id"), nullable=True, index=True)
    pdv_numero = Column(String(50), nullable=True, index=True)

    # Cible PERSONNE
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Pourquoi cette cible est dans la liste (figé : c'est un constat daté)
    motif = Column(Text, nullable=True)
    # Situation détectée au moment de la constitution (ex: "OMY inactif 3 mois")
    situation = Column(String(200), nullable=True)

    # ── Attribution ──
    assigned_to_id  = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    assigned_to_nom = Column(String(200), nullable=True)   # instantané pour l'affichage
    assigned_at     = Column(DateTime, nullable=True)

    # ── Avancement ──
    statut       = Column(SAEnum(StatutCible), default=StatutCible.A_APPELER,
                          nullable=False, index=True)
    nb_appels    = Column(Integer, default=0, nullable=False)
    dernier_appel_at = Column(DateTime, nullable=True)
    dernier_statut   = Column(String(60), nullable=True)   # StatutAppel.value du dernier appel
    abandon_motif    = Column(Text, nullable=True)
    ordre            = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_mission_cibles_mission_statut", "mission_id", "statut"),
        Index("ix_mission_cibles_assigned", "assigned_to_id", "statut"),
    )
