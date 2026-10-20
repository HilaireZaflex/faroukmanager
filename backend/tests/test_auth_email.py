"""
Tests de connexion : normalisation de l'adresse e-mail.

Contexte réel (20/10/2026) : des superviseurs n'arrivaient pas à se connecter
depuis leur téléphone. Cause : l'e-mail était comparé au caractère près, donc
une simple espace finale ou une majuscule renvoyait « identifiants incorrects ».

Base SQLite en mémoire : aucune donnée de production n'est touchée.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.core.security import get_password_hash
from app.models.user import User
from app.services.auth_service import authenticate_user, get_user_by_email


MOT_DE_PASSE = "MotDePasse123"
EMAIL_STOCKE = "superviseur@faroukmanager.com"


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__])
    session = sessionmaker(bind=engine)()
    session.add(User(
        email=EMAIL_STOCKE,
        nom="TEST",
        prenom="Superviseur",
        hashed_password=get_password_hash(MOT_DE_PASSE),
        role="SUPERVISEUR",
        is_active=True,
    ))
    session.commit()
    yield session
    session.close()


@pytest.mark.parametrize("saisie", [
    EMAIL_STOCKE,                     # exact
    EMAIL_STOCKE + " ",               # espace finale (clavier téléphone)
    " " + EMAIL_STOCKE,               # espace initiale (copier-coller)
    "  " + EMAIL_STOCKE + "  ",       # les deux
    EMAIL_STOCKE.upper(),             # majuscules
    "Superviseur@FaroukManager.com",  # casse mixte
    "\t" + EMAIL_STOCKE + "\n",       # tabulation / retour ligne
])
def test_email_trouve_quelle_que_soit_la_saisie(db, saisie):
    assert get_user_by_email(db, saisie) is not None


def test_connexion_reussie_avec_espace_finale(db):
    """C'est exactement le cas qui bloquait les utilisateurs sur le terrain."""
    user = authenticate_user(db, EMAIL_STOCKE + " ", MOT_DE_PASSE)
    assert user is not None
    assert user.email == EMAIL_STOCKE


def test_connexion_reussie_avec_majuscules(db):
    user = authenticate_user(db, EMAIL_STOCKE.upper(), MOT_DE_PASSE)
    assert user is not None


def test_mauvais_mot_de_passe_refuse(db):
    assert authenticate_user(db, EMAIL_STOCKE, "mauvais") is None


def test_email_inconnu_refuse(db):
    assert authenticate_user(db, "inconnu@faroukmanager.com", MOT_DE_PASSE) is None


@pytest.mark.parametrize("saisie", ["", "   ", None])
def test_saisie_vide_ne_plante_pas(db, saisie):
    assert get_user_by_email(db, saisie) is None
