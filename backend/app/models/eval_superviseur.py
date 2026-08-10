"""
Modèles pour l'évaluation des superviseurs.
"""
from sqlalchemy import Column, Integer, String, Float, JSON, Date, DateTime, UniqueConstraint
from datetime import datetime
from app.core.database import Base


class EvalSuperviseur(Base):
    """Évaluation mensuelle d'un superviseur."""
    __tablename__ = "eval_superviseurs"

    id = Column(Integer, primary_key=True, index=True)
    superviseur = Column(String, nullable=False, index=True)
    annee = Column(Integer, nullable=False)
    mois = Column(Integer, nullable=False)

    # KPIs (stockés pour référence)
    kpis_data = Column(JSON, nullable=True)         # Données brutes KPIs
    score_kpi = Column(Float, nullable=True)         # Score KPI 0-100

    # Mystery calls TC
    mystery_calls = Column(JSON, nullable=True)      # [{pdv, tc, notes...}]
    pdvs_mystery_generes = Column(JSON, nullable=True) # PDVs générés pour les appels
    score_mystery = Column(Float, nullable=True)     # Score mystery 0-100

    # Présentiel
    pdvs_presentiel_generes = Column(JSON, nullable=True)  # PDVs générés pour présentiel
    note_maitrise_pdv = Column(Float, nullable=True)    # /10
    note_maitrise_zone = Column(Float, nullable=True)   # /10
    score_presentiel = Column(Float, nullable=True)     # Score présentiel 0-100

    # Score final
    score_final = Column(Float, nullable=True)
    mention = Column(String, nullable=True)
    statut = Column(String, default='EN_COURS')  # EN_COURS | TERMINEE

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint('superviseur', 'annee', 'mois', name='uq_eval_sup_mois'),
    )
