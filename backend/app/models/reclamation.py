from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Reclamation(Base):
    __tablename__ = "reclamations"

    id = Column(Integer, primary_key=True, index=True)

    # Informations principales
    titre = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    categorie = Column(String(50), default="AUTRE")  # PDV / PERSONNEL / LOGISTIQUE / FINANCE / TECHNIQUE / AUTRE
    priorite = Column(String(20), default="NORMAL")  # URGENT / NORMAL / FAIBLE
    statut = Column(String(30), default="OUVERTE")   # OUVERTE / EN_COURS / RESOLUE / CLOTUREE / REOUVERTE / ESCALADEE

    # Acteurs
    soumetteur_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    soumetteur_nom = Column(String(200))
    responsable_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    responsable_nom = Column(String(200))

    # PDV concerné (optionnel)
    numero_pdv = Column(String(20), nullable=True)
    nom_pdv = Column(String(200), nullable=True)

    # Traitement
    reponse = Column(Text, nullable=True)
    date_limite = Column(DateTime, nullable=True)
    date_prise_en_charge = Column(DateTime, nullable=True)
    date_resolution = Column(DateTime, nullable=True)
    note_satisfaction = Column(Integer, nullable=True)  # 1-5

    # Escalade
    escaladee = Column(Boolean, default=False)
    escalade_raison = Column(Text, nullable=True)
    nb_relances = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ReclamationCommentaire(Base):
    __tablename__ = "reclamation_commentaires"

    id = Column(Integer, primary_key=True, index=True)
    reclamation_id = Column(Integer, ForeignKey("reclamations.id"), nullable=False)
    auteur_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    auteur_nom = Column(String(200))
    auteur_role = Column(String(50))
    contenu = Column(Text, nullable=False)
    est_interne = Column(Boolean, default=False)  # commentaire interne admin only
    created_at = Column(DateTime, default=datetime.utcnow)


class ReclamationNotification(Base):
    __tablename__ = "reclamation_notifications"

    id = Column(Integer, primary_key=True, index=True)
    reclamation_id = Column(Integer, ForeignKey("reclamations.id"), nullable=False)
    destinataire_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    type_notif = Column(String(50))  # NOUVELLE / REPONSE / CLOTURE / ESCALADE / RELANCE
    lue = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
