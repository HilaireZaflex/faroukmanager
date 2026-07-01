from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False)          # VISITE_ASSIGNEE, DECISION_RECUE, APPROBATION_RC, ACTIVATION_ASSIGNEE, ACTIVATION_CONFIRMEE
    titre = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    prospect_reference = Column(String(50), nullable=True)
    prospect_nom = Column(String(200), nullable=True)
    etape = Column(Integer, nullable=True)              # 2, 3, 4, 5, 6
    action_requise = Column(String(200), nullable=True) # description courte de l'action
    lu = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    lu_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="notifications")
