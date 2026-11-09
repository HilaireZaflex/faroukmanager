"""
Modèle ProspectEnergia — Prospects pour la vente de kits solaires ENERGIA
(DIABARANI ou YELEN)
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, Enum as SAEnum
from app.core.database import Base


class NomKitEnergia(str, enum.Enum):
    DIABARANI = "DIABARANI"
    YELEN = "YELEN"


class ProspectEnergia(Base):
    __tablename__ = "prospects_energia"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, unique=True, nullable=False, index=True)

    # Kit
    nom_kit = Column(SAEnum(NomKitEnergia), nullable=False)
    pret_payer_immediatement = Column(Boolean, default=False, nullable=False)
    date_prospection = Column(Date, nullable=True)

    # Infos client
    nom = Column(String, nullable=False)
    prenom = Column(String, nullable=False)
    telephone = Column(String, nullable=False)
    quartier = Column(String, nullable=True)

    # Localisation GPS
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Pièce d'identité / RCCM
    piece_identite = Column(String, nullable=True)  # Type de pièce + numéro

    # Installation et suivi (le prospecteur installe lui-même le kit puis assure le suivi)
    statut = Column(String(30), default="PROSPECT", nullable=False)   # PROSPECT | INSTALLE | SUIVI
    date_installation = Column(Date, nullable=True)
    numero_batterie = Column(String(100), nullable=True)               # n° de batterie posée
    date_activation = Column(Date, nullable=True)                     # date d'activation du kit
    date_relance = Column(Date, nullable=True)                        # prochaine action de suivi

    # Métadonnées
    created_by = Column(Integer, nullable=True)  # user id
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(String, nullable=True)
