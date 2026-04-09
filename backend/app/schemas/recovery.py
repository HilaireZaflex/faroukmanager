from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.recovery import RecoveryStatut

class RecoveryBase(BaseModel):
    pdv_id: int
    statut: RecoveryStatut = RecoveryStatut.IDENTIFIE
    ca_cumule_3mois: float = 0.0
    date_identification: datetime
    date_contact: Optional[datetime] = None
    date_recuperation_sim: Optional[datetime] = None
    date_redeploiement: Optional[datetime] = None
    superviseur_responsable: Optional[str] = None
    notes: Optional[str] = None
    nouveau_pdv_id: Optional[int] = None

class RecoveryCreate(RecoveryBase):
    pass

class RecoveryUpdate(BaseModel):
    statut: Optional[RecoveryStatut] = None
    ca_cumule_3mois: Optional[float] = None
    date_contact: Optional[datetime] = None
    date_recuperation_sim: Optional[datetime] = None
    date_redeploiement: Optional[datetime] = None
    superviseur_responsable: Optional[str] = None
    notes: Optional[str] = None
    nouveau_pdv_id: Optional[int] = None

class RecoveryOut(RecoveryBase):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True
