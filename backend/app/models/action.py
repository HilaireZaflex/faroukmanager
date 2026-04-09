from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class ActionType(str, enum.Enum):
    APPEL = "APPEL"
    VISITE_TERRAIN = "VISITE_TERRAIN"
    MESSAGE_WHATSAPP = "MESSAGE_WHATSAPP"
    AUTRE = "AUTRE"

class ActionResultat(str, enum.Enum):
    RECONTACTE = "RECONTACTE"
    REACTIVE = "REACTIVE"
    A_RECUPERER = "A_RECUPERER"
    NON_JOIGNABLE = "NON_JOIGNABLE"
    EN_ATTENTE = "EN_ATTENTE"

class TerrainAction(Base):
    __tablename__ = "terrain_actions"

    id = Column(Integer, primary_key=True, index=True)
    pdv_id = Column(Integer, ForeignKey("pdvs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type_action = Column(Enum(ActionType), default=ActionType.APPEL)
    resultat = Column(Enum(ActionResultat), default=ActionResultat.EN_ATTENTE)
    notes = Column(Text, nullable=True)
    date_action = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    pdv = relationship("PDV", back_populates="actions")
    user = relationship("User", back_populates="actions")
