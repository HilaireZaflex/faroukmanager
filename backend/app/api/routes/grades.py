"""
Routes API pour la gestion des Grades & Qualification des PDVs.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.grades_service import (
    get_grades_overview,
    get_grades_evolution,
    get_alertes_degradation,
    get_classement_par_grade,
    DEFAULT_SEUILS,
    DEFAULT_OPS_SEUILS,
)
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/grades", tags=["Grades"])
NOW = datetime.now()


def parse_seuils(
    s_diamant: Optional[int] = None, s_or: Optional[int] = None,
    s_argent: Optional[int] = None, s_fer: Optional[int] = None,
    ops_diamant: Optional[int] = None, ops_or: Optional[int] = None,
    ops_argent: Optional[int] = None, ops_fer: Optional[int] = None,
    ops_cuivre: Optional[int] = None,
):
    seuils = {**DEFAULT_SEUILS}
    ops = {**DEFAULT_OPS_SEUILS}
    if s_diamant is not None: seuils["diamant"] = s_diamant
    if s_or is not None:      seuils["or"] = s_or
    if s_argent is not None:  seuils["argent"] = s_argent
    if s_fer is not None:     seuils["fer"] = s_fer
    if ops_diamant is not None: ops["diamant"] = ops_diamant
    if ops_or is not None:      ops["or"] = ops_or
    if ops_argent is not None:  ops["argent"] = ops_argent
    if ops_fer is not None:     ops["fer"] = ops_fer
    if ops_cuivre is not None:  ops["cuivre"] = ops_cuivre
    return seuils, ops


@router.get("/overview")
def grades_overview(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    s_diamant: Optional[int] = Query(default=None),
    s_or: Optional[int] = Query(default=None),
    s_argent: Optional[int] = Query(default=None),
    s_fer: Optional[int] = Query(default=None),
    ops_diamant: Optional[int] = Query(default=None),
    ops_or: Optional[int] = Query(default=None),
    ops_argent: Optional[int] = Query(default=None),
    ops_fer: Optional[int] = Query(default=None),
    ops_cuivre: Optional[int] = Query(default=None),
    db: Session = Depends(get_db)
):
    seuils, ops = parse_seuils(s_diamant, s_or, s_argent, s_fer, ops_diamant, ops_or, ops_argent, ops_fer, ops_cuivre)
    return get_grades_overview(db, annee, mois, seuils, ops)


@router.get("/evolution")
def grades_evolution(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    s_diamant: Optional[int] = Query(default=None),
    s_or: Optional[int] = Query(default=None),
    s_argent: Optional[int] = Query(default=None),
    s_fer: Optional[int] = Query(default=None),
    db: Session = Depends(get_db)
):
    seuils, ops = parse_seuils(s_diamant, s_or, s_argent, s_fer)
    return get_grades_evolution(db, annee, mois, seuils, ops)


@router.get("/alertes")
def alertes_degradation(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    s_diamant: Optional[int] = Query(default=None),
    s_or: Optional[int] = Query(default=None),
    s_argent: Optional[int] = Query(default=None),
    s_fer: Optional[int] = Query(default=None),
    db: Session = Depends(get_db)
):
    seuils, ops = parse_seuils(s_diamant, s_or, s_argent, s_fer)
    return get_alertes_degradation(db, annee, mois, seuils, ops)


@router.get("/classement")
def classement_par_grade(
    annee: int = Query(default=NOW.year),
    mois: int = Query(default=NOW.month),
    grade: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    return get_classement_par_grade(db, annee, mois, grade)


@router.get("/seuils-defaut")
def seuils_defaut():
    return {"seuils": DEFAULT_SEUILS, "ops_seuils": DEFAULT_OPS_SEUILS}
