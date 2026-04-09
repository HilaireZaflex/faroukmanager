from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class WeeklyPerformanceBase(BaseModel):
    pdv_id: int
    annee: int
    semaine: int
    ca: float = 0.0
    nb_operations: int = 0
    nb_depots: int = 0
    montant_depots: float = 0.0
    nb_retraits: int = 0
    montant_retraits: float = 0.0
    est_actif: bool = False
    ca_semaine_precedente: float = 0.0
    taux_variation: float = 0.0

class WeeklyPerformanceCreate(WeeklyPerformanceBase):
    pass

class WeeklyPerformanceOut(WeeklyPerformanceBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class MonthlyPerformanceBase(BaseModel):
    pdv_id: int
    annee: int
    mois: int
    ca: float = 0.0
    nb_operations: int = 0
    nb_depots: int = 0
    montant_depots: float = 0.0
    nb_retraits: int = 0
    montant_retraits: float = 0.0
    est_actif: bool = False
    ca_mois_precedent: float = 0.0
    taux_variation: float = 0.0

class MonthlyPerformanceCreate(MonthlyPerformanceBase):
    pass

class MonthlyPerformanceOut(MonthlyPerformanceBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True
