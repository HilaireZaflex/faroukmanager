"""
Modèle AppelTC — Suivi des appels téléphoniques effectués par les téléconseillères
sur les PDVs inactifs ou en baisse (OMY, NAFAMA, KAABU).
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, Text, JSON, Index, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from app.core.database import Base


class StatutAppel(str, enum.Enum):
    JOIGNABLE_PROMESSE = "JOIGNABLE_PROMESSE"          # ✅ Joignable - Promesse de reprise
    JOIGNABLE_PAS_INTERESSE = "JOIGNABLE_PAS_INTERESSE" # 📞 Joignable - Pas intéressé
    JOIGNABLE_DEJA_ACTIF = "JOIGNABLE_DEJA_ACTIF"      # 🔄 Joignable - Déjà actif
    NON_JOIGNABLE_HORS_ZONE = "NON_JOIGNABLE_HORS_ZONE" # 📵 Non joignable - Hors zone
    NON_JOIGNABLE_PAS_REPONSE = "NON_JOIGNABLE_PAS_REPONSE" # 🔕 Pas de réponse
    NUMERO_INCORRECT = "NUMERO_INCORRECT"               # ❌ Numéro incorrect
    PDV_FERME = "PDV_FERME"                             # 🏪 PDV fermé
    RAPPEL_PROGRAMME = "RAPPEL_PROGRAMME"               # 📅 Rappel programmé


class IndicateurAppel(str, enum.Enum):
    OMY = "OMY"
    NAFAMA = "NAFAMA"
    KAABU = "KAABU"


STATUT_LABELS = {
    "JOIGNABLE_PROMESSE": "✅ Joignable - Promesse de reprise",
    "JOIGNABLE_PAS_INTERESSE": "📞 Joignable - Pas intéressé",
    "JOIGNABLE_DEJA_ACTIF": "🔄 Joignable - Déjà actif",
    "NON_JOIGNABLE_HORS_ZONE": "📵 Non joignable - Hors zone",
    "NON_JOIGNABLE_PAS_REPONSE": "🔕 Pas de réponse",
    "NUMERO_INCORRECT": "❌ Numéro incorrect",
    "PDV_FERME": "🏪 PDV fermé",
    "RAPPEL_PROGRAMME": "📅 Rappel programmé",
}


class AppelTC(Base):
    __tablename__ = "appels_tc"

    id = Column(Integer, primary_key=True, index=True)

    # PDV concerné
    numero_pdv = Column(String, nullable=False, index=True)
    nom_pdv = Column(String, nullable=True)

    # Indicateur (OMY, NAFAMA, KAABU)
    indicateur = Column(SAEnum(IndicateurAppel), nullable=False, index=True)

    # Téléconseillère qui a effectué l'appel — LIEN VERS LE COMPTE UTILISATEUR
    tc_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tc_nom = Column(String, nullable=True)    # Instantané du nom pour affichage rapide

    # Indicateurs couverts par l'appel.
    # Un appel « unifié » peut couvrir plusieurs indicateurs : ["OMY","NAFAMA","KAABU"].
    # La colonne `indicateur` ci-dessus reste l'indicateur principal (compatibilité).
    # JSON sur SQLite, JSONB sur PostgreSQL (les deux dialectes sont gérés explicitement)
    indicateurs = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    # Informations de l'appel
    statut = Column(SAEnum(StatutAppel), nullable=False)
    commentaire = Column(Text, nullable=True)
    date_rappel = Column(Date, nullable=True)  # Si RAPPEL_PROGRAMME

    # Rattachement optionnel à une « mission d'appels » créée par l'encadrement.
    # NULL = appel spontané (file d'appels unifiée), non lié à une mission.
    mission_cible_id = Column(Integer, ForeignKey("mission_cibles.id"), nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_appels_tc_tc_user_created", "tc_user_id", "created_at"),
    )
