from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.action import ActionType, ActionResultat

class TerrainActionBase(BaseModel):
    pdv_id: int
    user_id: int
    type_action: ActionType = ActionType.APPEL
    resultat: ActionResultat = ActionResultat.EN_ATTENTE
    notes: Optional[str] = None
    date_action: datetime

class TerrainActionCreate(TerrainActionBase):
    pass

class TerrainActionOut(TerrainActionBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True
