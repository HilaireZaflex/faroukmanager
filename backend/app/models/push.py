"""Abonnements aux notifications push (PWA)."""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(String(200), nullable=False)
    auth = Column(String(100), nullable=False)
    user_agent = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PushVapid(Base):
    """Paire de clés VAPID (générée une seule fois, stockée en base)."""
    __tablename__ = "push_vapid"

    id = Column(Integer, primary_key=True)
    private_key = Column(Text, nullable=False)
    public_key = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
