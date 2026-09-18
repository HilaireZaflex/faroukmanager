"""
Modèle AppelMigration — Appels de prospection « migration en commission directe ».

Chaque téléconseillère appelle uniquement ses PDV de type RS ou KIOSQUE et pose
trois questions de qualification. Un PDV est VALIDÉ seulement si les trois
critères sont remplis, sinon l'appel est REJETÉ.
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Index,
)
from app.core.database import Base


# Types de PDV concernés par la migration
MIGRATION_TYPES_PDV = ["RS", "KIOSQUE"]

# Pièces d'identité acceptées
MIGRATION_TYPES_PIECE = ["NINA", "PASSEPORT", "CARTE_BIOMETRIQUE", "AUTRE"]

MIGRATION_TYPE_PIECE_LABELS = {
    "NINA": "Carte NINA",
    "PASSEPORT": "Passeport",
    "CARTE_BIOMETRIQUE": "Carte biométrique",
    "AUTRE": "Autre pièce",
}


class AppelMigration(Base):
    __tablename__ = "appels_migration"

    id = Column(Integer, primary_key=True, index=True)

    # PDV concerné
    numero_pdv = Column(String, nullable=False, index=True)
    nom_pdv = Column(String, nullable=True)
    type_pdv = Column(String(30), nullable=True)   # RS / KIOSQUE

    # Téléconseillère (compte)
    tc_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tc_nom = Column(String(200), nullable=True)

    # ── Réponses aux 3 questions ──
    veut_migrer = Column(Boolean, nullable=False, default=False)        # Q1 : souhaite migrer en commission directe
    a_rccm = Column(Boolean, nullable=False, default=False)             # Q2 : possède le RCCM
    a_piece_identite = Column(Boolean, nullable=False, default=False)   # Q3 : possède une pièce d'identité valide
    type_piece = Column(String(30), nullable=True)                      # NINA / PASSEPORT / CARTE_BIOMETRIQUE / AUTRE

    # ── Résultat ──
    statut = Column(String(20), nullable=False, default="REJETE")       # VALIDE / REJETE
    motif_rejet = Column(Text, nullable=True)
    commentaire = Column(Text, nullable=True)

    # ── Dépôt des pièces au bureau ──
    # La TC coche cette case APRÈS l'appel, quand le PDV apporte réellement
    # ses documents au bureau. La date est enregistrée automatiquement.
    pieces_au_bureau = Column(Boolean, nullable=False, default=False, index=True)
    date_depot_bureau = Column(DateTime, nullable=True)
    depot_par_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    depot_par_nom = Column(String(200), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_appels_migration_tc_created", "tc_user_id", "created_at"),
    )
