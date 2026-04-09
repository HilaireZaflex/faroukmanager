from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.pdv import PDVType, PDVStatut, PDVMedaille

class PDVBase(BaseModel):
    numero_pdv: str
    nom: str
    numero_personnel: Optional[str] = None
    type_pdv: PDVType = PDVType.RS
    statut: PDVStatut = PDVStatut.ACTIF
    medaille: PDVMedaille = PDVMedaille.AUCUNE
    zone: Optional[str] = None
    sous_zone: Optional[str] = None
    quartier: Optional[str] = None
    commune: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    superviseur: Optional[str] = None
    gestionnaire: Optional[str] = None
    teleconseillere: Optional[str] = None
    telephone: Optional[str] = None
    email_contact: Optional[str] = None
    nom_gerant: Optional[str] = None
    date_activation: Optional[datetime] = None
    numero_flotte: bool = False
    sim_au_bureau: bool = False
    sim_coupee: bool = False
    nouvelle_creation: bool = False
    health_score: float = 50.0
    segment: Optional[str] = None
    score_risque: float = 0.0
    notes: Optional[str] = None

class PDVCreate(PDVBase):
    pass

class PDVStatsResponse(BaseModel):
    total_pdvs: int = 0
    pdvs_actifs: int = 0
    pdvs_inactifs: int = 0
    pdvs_recuperation: int = 0
    taux_activite: float = 0.0
    ca_total_mois: float = 0.0
    ca_moyen_pdv: float = 0.0
    nb_medaille_or: int = 0
    nb_medaille_argent: int = 0
    nb_medaille_bronze: int = 0
    nb_sim_coupee: int = 0
    nb_flotte: int = 0
    zones: list = []

class PDVUpdate(BaseModel):
    numero_pdv: Optional[str] = None
    nom: Optional[str] = None
    numero_personnel: Optional[str] = None
    type_pdv: Optional[PDVType] = None
    statut: Optional[PDVStatut] = None
    medaille: Optional[PDVMedaille] = None
    zone: Optional[str] = None
    sous_zone: Optional[str] = None
    quartier: Optional[str] = None
    commune: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    superviseur: Optional[str] = None
    gestionnaire: Optional[str] = None
    teleconseillere: Optional[str] = None
    developpeur: Optional[str] = None
    adresse: Optional[str] = None
    telephone: Optional[str] = None
    email_contact: Optional[str] = None
    nom_gerant: Optional[str] = None
    date_activation: Optional[datetime] = None
    numero_flotte: Optional[bool] = None
    sim_au_bureau: Optional[bool] = None
    sim_coupee: Optional[bool] = None
    nouvelle_creation: Optional[bool] = None
    health_score: Optional[float] = None
    segment: Optional[str] = None
    score_risque: Optional[float] = None
    notes: Optional[str] = None

class PDVOut(PDVBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True
