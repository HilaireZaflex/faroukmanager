"""Schémas Pydantic du module « Suivi Formation »."""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Personnel ────────────────────────────────────────────────────────────────
class FormationPersonnelBase(BaseModel):
    matricule: str = Field(..., min_length=1, max_length=40)
    nom: str = Field(..., min_length=1, max_length=200)
    telephone: Optional[str] = None
    gestionnaire: Optional[str] = None
    groupe: Optional[str] = None
    poste: Optional[str] = None
    agence: Optional[str] = None
    statut_emploi: Optional[str] = "ACTIF"
    actif: bool = True
    evaluation_globale: Optional[str] = None
    note_globale: Optional[float] = None


class FormationPersonnelCreate(FormationPersonnelBase):
    pass


class FormationPersonnelUpdate(BaseModel):
    matricule: Optional[str] = None
    nom: Optional[str] = None
    telephone: Optional[str] = None
    gestionnaire: Optional[str] = None
    groupe: Optional[str] = None
    poste: Optional[str] = None
    agence: Optional[str] = None
    statut_emploi: Optional[str] = None
    actif: Optional[bool] = None
    evaluation_globale: Optional[str] = None
    note_globale: Optional[float] = None
    user_id: Optional[int] = None


class FormationPersonnelOut(FormationPersonnelBase):
    id: int
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Agrégats calculés à la lecture (non stockés)
    nb_modules: int = 0
    nb_valides: int = 0
    nb_a_reformer: int = 0
    taux_validation: float = 0.0
    derniere_formation: Optional[date] = None

    class Config:
        from_attributes = True


# ── Modules ──────────────────────────────────────────────────────────────────
class FormationModuleBase(BaseModel):
    nom: str = Field(..., min_length=1, max_length=200)
    ordre: int = 0
    obligatoire: bool = True
    actif: bool = True
    description: Optional[str] = None


class FormationModuleCreate(FormationModuleBase):
    pass


class FormationModuleUpdate(BaseModel):
    nom: Optional[str] = None
    ordre: Optional[int] = None
    obligatoire: Optional[bool] = None
    actif: Optional[bool] = None
    description: Optional[str] = None


class FormationModuleOut(FormationModuleBase):
    id: int
    nb_sessions: int = 0
    nb_valides: int = 0

    class Config:
        from_attributes = True


# ── Sessions ─────────────────────────────────────────────────────────────────
class FormationSessionBase(BaseModel):
    personnel_id: int
    module_id: int
    date_session: Optional[date] = None
    statut: str = Field("A_FORMER")
    evaluation: Optional[str] = None
    note: Optional[float] = None
    observation: Optional[str] = None
    formateur: Optional[str] = None


class FormationSessionCreate(FormationSessionBase):
    pass


class FormationSessionUpdate(BaseModel):
    date_session: Optional[date] = None
    statut: Optional[str] = None
    evaluation: Optional[str] = None
    note: Optional[float] = None
    observation: Optional[str] = None
    formateur: Optional[str] = None


class FormationSessionOut(FormationSessionBase):
    id: int
    personnel_nom: Optional[str] = None
    personnel_matricule: Optional[str] = None
    module_nom: Optional[str] = None
    cree_par_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
