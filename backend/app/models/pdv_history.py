"""
Modèle PDVHistory — Historique complet des modifications d'un PDV.
Sauvegarde :
  - Le snapshot de l'ancien gérant/PDV avant remplacement
  - La référence du prospect (processus d'activation)
  - Toutes les informations du nouveau gérant
  - Les étapes du workflow de prospection
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey, JSON
from datetime import datetime
from app.core.database import Base


class PDVHistory(Base):
    __tablename__ = "pdv_history"

    id = Column(Integer, primary_key=True, index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id", ondelete="CASCADE"), nullable=False, index=True)
    numero_pdv = Column(String, nullable=False, index=True)

    # Type d'événement
    event_type = Column(String, nullable=False)  # ACTIVATION, MODIFICATION, IMPORT, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, nullable=True)  # Nom de l'utilisateur

    # ── Référence prospect (si activation via prospection) ────────────────
    prospect_reference = Column(String, nullable=True)  # ex: PROS-2026-000005
    prospect_id = Column(Integer, nullable=True)

    # ── Snapshot ANCIEN gérant (avant remplacement) ───────────────────────
    ancien_nom_gerant = Column(String, nullable=True)
    ancien_telephone = Column(String, nullable=True)
    ancien_superviseur = Column(String, nullable=True)
    ancien_gestionnaire = Column(String, nullable=True)
    ancien_teleconseillere = Column(String, nullable=True)
    ancien_developpeur = Column(String, nullable=True)
    ancien_zone = Column(String, nullable=True)
    ancien_sous_zone = Column(String, nullable=True)
    ancien_quartier = Column(String, nullable=True)
    ancien_adresse = Column(String, nullable=True)
    ancien_statut = Column(String, nullable=True)
    ancien_type_pdv = Column(String, nullable=True)
    ancien_date_activation = Column(DateTime, nullable=True)

    # ── Snapshot NOUVEAU gérant (après remplacement) ──────────────────────
    nouveau_nom_gerant = Column(String, nullable=True)
    nouveau_telephone = Column(String, nullable=True)
    nouveau_superviseur = Column(String, nullable=True)
    nouveau_gestionnaire = Column(String, nullable=True)
    nouveau_teleconseillere = Column(String, nullable=True)
    nouveau_developpeur = Column(String, nullable=True)
    nouveau_zone = Column(String, nullable=True)
    nouveau_sous_zone = Column(String, nullable=True)
    nouveau_quartier = Column(String, nullable=True)
    nouveau_adresse = Column(String, nullable=True)
    nouveau_type_pdv = Column(String, nullable=True)

    # ── Workflow prospection complet (JSON) ───────────────────────────────
    workflow_steps = Column(JSON, nullable=True)
    # Format: [
    #   {"etape": 1, "label": "Soumission", "date": "...", "par": "..."},
    #   {"etape": 2, "label": "Attribution visite", "date": "...", "par": "..."},
    #   {"etape": 3, "label": "Visite terrain", "date": "...", "par": "..."},
    #   {"etape": 4, "label": "Validation RC", "date": "...", "par": "..."},
    #   {"etape": 5, "label": "Attribution puce", "date": "...", "par": "..."},
    #   {"etape": 6, "label": "Activation finale", "date": "...", "par": "..."},
    # ]

    # ── Commentaire libre ─────────────────────────────────────────────────
    comment = Column(Text, nullable=True)
    extra = Column(JSON, nullable=True)
