"""
Tests de la fusion du référentiel géographique (Paramètres → Zones & Localités).

Contexte métier : un même quartier peut être saisi de plusieurs façons
(« Badalabougou », « badalabougou », « Badalabougou  »). La fusion doit :
  1. rattacher TOUS les PDV de ces écritures au nom conservé,
  2. ne JAMAIS toucher aux PDV hors sélection,
  3. laisser une seule entrée dans le référentiel,
  4. rester réservée à l'encadrement.

Base SQLite en mémoire : aucune donnée de production n'est touchée.
"""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.localite import Localite
from app.models.pdv import PDV
from app.api.routes.localites import FusionIn, fusionner_localites


class _Utilisateur:
    def __init__(self, role):
        self.role = role


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[PDV.__table__, Localite.__table__])
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture()
def referentiel(db):
    """3 écritures du même quartier + 1 autre, et 5 PDV répartis dessus."""
    for nom in ["Badalabougou", "badalabougou", "Badalabougou  ", "Sabalibougou"]:
        db.add(Localite(type="QUARTIER", nom=nom))
    for numero, quartier in [
        ("1", "Badalabougou"),
        ("2", "badalabougou"),
        ("3", "Badalabougou  "),
        ("4", "BAMAKO"),
        ("5", "Sabalibougou"),
    ]:
        db.add(PDV(numero_pdv=numero, nom=f"PDV {numero}", quartier=quartier))
    db.commit()
    return db


def _ids(db, noms):
    return [l.id for l in db.query(Localite).filter(Localite.nom.in_(noms)).all()]


def _quartiers(db):
    return {p.numero_pdv: p.quartier for p in db.query(PDV).all()}


def test_fusion_avec_espaces_et_casse(referentiel):
    db = referentiel
    ids = _ids(db, ["Badalabougou", "badalabougou", "Badalabougou  "])

    res = fusionner_localites(
        FusionIn(type="QUARTIER", ids=ids, nom_final="Badalabougou"),
        db,
        _Utilisateur("responsable_produit_et_qualit_oprationnelle_"),
    )

    assert res["pdvs_mis_a_jour"] == 3
    assert res["entrees_supprimees"] == 2
    assert sorted(l.nom for l in db.query(Localite).all()) == ["Badalabougou", "Sabalibougou"]

    quartiers = _quartiers(db)
    assert quartiers["1"] == quartiers["2"] == quartiers["3"] == "Badalabougou"


def test_les_pdv_hors_selection_ne_bougent_pas(referentiel):
    db = referentiel
    ids = _ids(db, ["Badalabougou", "badalabougou"])

    fusionner_localites(FusionIn(type="QUARTIER", ids=ids, nom_final="Badalabougou"), db,
                        _Utilisateur("admin"))

    quartiers = _quartiers(db)
    assert quartiers["4"] == "BAMAKO"
    assert quartiers["5"] == "Sabalibougou"


def test_fusion_vers_un_nom_totalement_nouveau(referentiel):
    db = referentiel
    ids = _ids(db, ["Badalabougou", "badalabougou", "Badalabougou  ", "Sabalibougou"])

    res = fusionner_localites(
        FusionIn(type="QUARTIER", ids=ids, nom_final="Badalabougou Centre"), db,
        _Utilisateur("manager"),
    )

    assert res["pdvs_mis_a_jour"] == 4
    assert [l.nom for l in db.query(Localite).all()] == ["Badalabougou Centre"]
    quartiers = _quartiers(db)
    assert quartiers["1"] == quartiers["5"] == "Badalabougou Centre"
    assert quartiers["4"] == "BAMAKO"


def test_refus_si_moins_de_deux_entrees(referentiel):
    db = referentiel
    ids = _ids(db, ["Badalabougou"])
    with pytest.raises(HTTPException) as err:
        fusionner_localites(FusionIn(type="QUARTIER", ids=ids, nom_final="X"), db, _Utilisateur("admin"))
    assert err.value.status_code == 400


def test_refus_pour_un_role_non_autorise(referentiel):
    db = referentiel
    ids = _ids(db, ["Badalabougou", "badalabougou"])
    with pytest.raises(HTTPException) as err:
        fusionner_localites(
            FusionIn(type="QUARTIER", ids=ids, nom_final="Badalabougou"), db,
            _Utilisateur("teleconseillere"),
        )
    assert err.value.status_code == 403


def test_refus_si_types_melanges(referentiel):
    db = referentiel
    db.add(Localite(type="ZONE", nom="BAMAKO RG"))
    db.commit()
    ids = _ids(db, ["Badalabougou", "BAMAKO RG"])
    with pytest.raises(HTTPException) as err:
        fusionner_localites(FusionIn(type="QUARTIER", ids=ids, nom_final="X"), db, _Utilisateur("admin"))
    assert err.value.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# Régression : cas réel « BAMAKO COURA » / « Bamako coura » (espaces + casse).
#
# La table `localites` porte la contrainte UNIQUE (type, nom). L'ancien code
# renommait l'entrée conservée AVANT de supprimer les autres : quand on gardait
# le nom porté par l'autre ligne, le renommage créait un doublon encore présent
# en base → erreur, et l'utilisateur voyait « Fusion impossible ».
# ─────────────────────────────────────────────────────────────────────────────

def test_fusion_bamako_coura_en_gardant_le_nom_de_lautre_ligne(referentiel):
    """Sur ce cas précis la 1re ligne est « Bamako coura » (espace final) et la 2e « BAMAKO COURA »."""
    db = referentiel
    db.add(Localite(type="QUARTIER", nom="Bamako coura "))
    db.add(Localite(type="QUARTIER", nom="BAMAKO COURA"))
    db.add(PDV(numero_pdv="10", nom="PDV 10", quartier="BAMAKO COURA"))
    db.add(PDV(numero_pdv="11", nom="PDV 11", quartier="bamako coura"))
    db.commit()

    ids = _ids(db, ["Bamako coura ", "BAMAKO COURA"])

    # On conserve le nom de la SECONDE ligne : c'est ce choix qui échouait avant.
    res = fusionner_localites(
        FusionIn(type="QUARTIER", ids=ids, nom_final="BAMAKO COURA"), db, _Utilisateur("admin")
    )

    assert res["entrees_supprimees"] == 1
    noms = [l.nom for l in db.query(Localite).filter(Localite.type == "QUARTIER").all()]
    assert noms.count("BAMAKO COURA") == 1
    assert "Bamako coura " not in noms

    quartiers = _quartiers(db)
    assert quartiers["10"] == quartiers["11"] == "BAMAKO COURA"


def test_fusion_bamako_coura_en_gardant_le_nom_avec_espace(referentiel):
    """Même paire, mais on conserve le nom de la 1re ligne (espace final ignoré)."""
    db = referentiel
    db.add(Localite(type="QUARTIER", nom="Bamako coura "))
    db.add(Localite(type="QUARTIER", nom="BAMAKO COURA"))
    db.commit()

    ids = _ids(db, ["Bamako coura ", "BAMAKO COURA"])
    res = fusionner_localites(
        FusionIn(type="QUARTIER", ids=ids, nom_final="Bamako coura "), db, _Utilisateur("admin")
    )

    assert res["entrees_supprimees"] == 1
    noms = [l.nom for l in db.query(Localite).filter(Localite.type == "QUARTIER").all()]
    assert "BAMAKO COURA" not in noms
    assert len([n for n in noms if n.strip().lower() == "bamako coura"]) == 1


def test_fusion_dans_les_deux_sens_ne_laisse_quune_entree():
    """Quel que soit le nom conservé, il ne doit rester qu'une seule écriture."""
    for nom_final in ["BAMAKO COURA", "Bamako coura "]:
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine, tables=[PDV.__table__, Localite.__table__])
        db = sessionmaker(bind=engine)()

        db.add(Localite(type="QUARTIER", nom="Bamako coura "))
        db.add(Localite(type="QUARTIER", nom="BAMAKO COURA"))
        for numero, quartier in [("1", "BAMAKO COURA"), ("2", "bamako coura")]:
            db.add(PDV(numero_pdv=numero, nom=f"PDV {numero}", quartier=quartier))
        db.commit()

        ids = _ids(db, ["Bamako coura ", "BAMAKO COURA"])
        fusionner_localites(FusionIn(type="QUARTIER", ids=ids, nom_final=nom_final), db,
                            _Utilisateur("admin"))

        restants = [l.nom for l in db.query(Localite).filter(Localite.type == "QUARTIER").all()]
        identiques = [n for n in restants if n.strip().lower() == "bamako coura"]
        assert len(identiques) == 1, f"nom_final={nom_final!r} → {restants}"
        assert _quartiers(db)["1"] == _quartiers(db)["2"]
        db.close()
