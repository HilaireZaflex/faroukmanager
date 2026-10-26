"""
API « Suivi Formation ».

  Référentiel : /formations/personnel
  Catalogue   : /formations/modules
  Formations  : /formations/sessions
  Import      : /formations/import  (classeur Excel historique)
"""
import io
from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.core.database import get_db
from app.models.formation import FormationModule, FormationPersonnel, FormationSession
from app.models.user import User
from app.schemas.formation import (
    FormationModuleCreate, FormationModuleOut, FormationModuleUpdate,
    FormationPersonnelCreate, FormationPersonnelOut, FormationPersonnelUpdate,
    FormationSessionCreate, FormationSessionOut, FormationSessionUpdate,
)
from app.services.formation_import import importer_classeur

router = APIRouter()

# Le Responsable Conformité est le chef de file de la formation.
ROLES_ACCES = {
    "admin",
    "manager",
    "rc",
    "conformite",
    "responsable_produit_et_qualit_oprationnelle_",
}


def _role(user: User) -> str:
    return str(user.role).lower().replace("userrole.", "")


def _exiger_acces(user: User):
    if _role(user) not in ROLES_ACCES:
        raise HTTPException(
            status_code=403,
            detail="Accès réservé à l'encadrement formation "
                   "(Admin, Manager, RC, Conformité, Responsable Produit & Qualité).",
        )


# ── Agrégats de suivi ────────────────────────────────────────────────────────
def _agregats_personnel(db: Session, ids: Optional[List[int]] = None) -> Dict[int, dict]:
    """Calcule, en une passe, l'avancement de chaque agent."""
    modules_actifs = [m.id for m in db.query(FormationModule).filter(FormationModule.actif.is_(True)).all()]
    total_modules = len(modules_actifs) or 1

    q = db.query(FormationSession)
    if ids is not None:
        if not ids:
            return {}
        q = q.filter(FormationSession.personnel_id.in_(ids))
    sessions = q.all()

    par_personne: Dict[int, dict] = {}
    for s in sessions:
        agg = par_personne.setdefault(s.personnel_id, {
            "valides": set(), "a_reformer": 0, "derniere": None, "sessions": 0,
        })
        agg["sessions"] += 1
        if s.statut == "VALIDER" and s.module_id in modules_actifs:
            agg["valides"].add(s.module_id)
        if s.statut == "A_REFORMER":
            agg["a_reformer"] += 1
        if s.date_session and (agg["derniere"] is None or s.date_session > agg["derniere"]):
            agg["derniere"] = s.date_session

    resultat: Dict[int, dict] = {}
    for pid, agg in par_personne.items():
        nb_valides = len(agg["valides"])
        resultat[pid] = {
            "nb_modules": total_modules,
            "nb_valides": nb_valides,
            "nb_a_reformer": agg["a_reformer"],
            "taux_validation": round(nb_valides / total_modules * 100, 1) if total_modules else 0.0,
            "derniere_formation": agg["derniere"],
            "nb_sessions": agg["sessions"],
        }
    return resultat


def _dernieres_par_couple(db: Session, personnel_ids: List[int]) -> Dict[tuple, FormationSession]:
    """Dernière formation de chaque couple (agent, module).

    Critère : date la plus récente ; à date égale, la plus récemment créée.
    """
    if not personnel_ids:
        return {}
    sessions = (
        db.query(FormationSession)
        .filter(FormationSession.personnel_id.in_(personnel_ids))
        .all()
    )
    dernieres: Dict[tuple, FormationSession] = {}
    for s in sessions:
        cle = (s.personnel_id, s.module_id)
        actuel = dernieres.get(cle)
        if actuel is None:
            dernieres[cle] = s
            continue
        d_new = s.date_session or date.min
        d_old = actuel.date_session or date.min
        if d_new > d_old or (d_new == d_old and (s.id or 0) > (actuel.id or 0)):
            dernieres[cle] = s
    return dernieres


def _serialiser_personnel(p: FormationPersonnel, agg: dict) -> dict:
    data = FormationPersonnelOut.model_validate(p).model_dump()
    if agg:
        data.update({
            "nb_modules": agg.get("nb_modules", 0),
            "nb_valides": agg.get("nb_valides", 0),
            "nb_a_reformer": agg.get("nb_a_reformer", 0),
            "taux_validation": agg.get("taux_validation", 0.0),
            "derniere_formation": agg.get("derniere_formation"),
        })
    return data


# ── Modules ──────────────────────────────────────────────────────────────────
@router.get("/formations/modules")
def lister_modules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    modules = db.query(FormationModule).order_by(FormationModule.ordre, FormationModule.nom).all()

    compteurs = dict(
        db.query(FormationSession.module_id, func.count(FormationSession.id))
        .group_by(FormationSession.module_id).all()
    )
    valides = dict(
        db.query(FormationSession.module_id, func.count(FormationSession.id))
        .filter(FormationSession.statut == "VALIDER")
        .group_by(FormationSession.module_id).all()
    )
    sortie = []
    for m in modules:
        d = FormationModuleOut.model_validate(m).model_dump()
        d["nb_sessions"] = compteurs.get(m.id, 0)
        d["nb_valides"] = valides.get(m.id, 0)
        sortie.append(d)
    return sortie


@router.post("/formations/modules", status_code=201)
def creer_module(
    body: FormationModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    nom = (body.nom or "").strip()
    if not nom:
        raise HTTPException(400, "Le nom du module est obligatoire.")
    existe = db.query(FormationModule).filter(func.lower(FormationModule.nom) == nom.lower()).first()
    if existe:
        raise HTTPException(400, f"Le module « {nom} » existe déjà.")

    ordre = body.ordre
    if not ordre:
        ordre = (db.query(func.max(FormationModule.ordre)).scalar() or 0) + 1

    m = FormationModule(
        nom=nom, ordre=ordre, obligatoire=body.obligatoire,
        actif=body.actif, description=body.description,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return FormationModuleOut.model_validate(m).model_dump()


@router.put("/formations/modules/{module_id}")
def modifier_module(
    module_id: int,
    body: FormationModuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    m = db.query(FormationModule).filter(FormationModule.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module introuvable.")

    if body.nom is not None:
        nom = body.nom.strip()
        if not nom:
            raise HTTPException(400, "Le nom du module est obligatoire.")
        doublon = db.query(FormationModule).filter(
            func.lower(FormationModule.nom) == nom.lower(),
            FormationModule.id != module_id,
        ).first()
        if doublon:
            raise HTTPException(400, f"Le module « {nom} » existe déjà.")
        m.nom = nom

    if body.ordre is not None:
        m.ordre = body.ordre
    if body.obligatoire is not None:
        m.obligatoire = body.obligatoire
    if body.actif is not None:
        m.actif = body.actif
    if body.description is not None:
        m.description = body.description

    db.commit()
    db.refresh(m)
    return FormationModuleOut.model_validate(m).model_dump()


@router.delete("/formations/modules/{module_id}")
def supprimer_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    m = db.query(FormationModule).filter(FormationModule.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module introuvable.")

    nb = db.query(func.count(FormationSession.id)).filter(FormationSession.module_id == module_id).scalar() or 0
    if nb:
        raise HTTPException(
            400,
            f"Impossible : {nb} formation(s) sont enregistrées sur ce module. "
            f"Désactivez-le plutôt que de le supprimer.",
        )
    db.delete(m)
    db.commit()
    return {"success": True, "id": module_id}


# ── Personnel ────────────────────────────────────────────────────────────────
@router.get("/formations/personnel")
def lister_personnel(
    search: Optional[str] = Query(None, description="Nom, matricule ou téléphone"),
    groupe: Optional[str] = Query(None),
    poste: Optional[str] = Query(None),
    gestionnaire: Optional[str] = Query(None),
    actif: Optional[bool] = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)

    q = db.query(FormationPersonnel)
    if actif is not None:
        q = q.filter(FormationPersonnel.actif.is_(actif))
    if groupe:
        q = q.filter(FormationPersonnel.groupe == groupe)
    if poste:
        q = q.filter(FormationPersonnel.poste == poste)
    if gestionnaire:
        q = q.filter(FormationPersonnel.gestionnaire == gestionnaire)
    if search:
        terme = f"%{search.strip()}%"
        q = q.filter(or_(
            FormationPersonnel.nom.ilike(terme),
            FormationPersonnel.matricule.ilike(terme),
            FormationPersonnel.telephone.ilike(terme),
        ))

    total = q.count()
    personnes = q.order_by(FormationPersonnel.nom).offset(skip).limit(limit).all()
    aggs = _agregats_personnel(db, [p.id for p in personnes])
    return {
        "total": total,
        "items": [_serialiser_personnel(p, aggs.get(p.id, {})) for p in personnes],
    }


@router.get("/formations/filtres")
def filtres_personnel(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Valeurs distinctes pour alimenter les listes déroulantes de l'interface."""
    _exiger_acces(current_user)

    def distinct(colonne):
        lignes = db.query(colonne).filter(colonne.isnot(None), colonne != "").distinct().order_by(colonne).all()
        return [l[0] for l in lignes]

    return {
        "groupes": distinct(FormationPersonnel.groupe),
        "postes": distinct(FormationPersonnel.poste),
        "gestionnaires": distinct(FormationPersonnel.gestionnaire),
    }


@router.post("/formations/personnel", status_code=201)
def creer_personnel(
    body: FormationPersonnelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    matricule = (body.matricule or "").strip()
    if not matricule:
        raise HTTPException(400, "Le matricule est obligatoire.")
    if db.query(FormationPersonnel).filter(FormationPersonnel.matricule == matricule).first():
        raise HTTPException(400, f"Le matricule « {matricule} » existe déjà.")

    p = FormationPersonnel(**body.model_dump())
    p.matricule = matricule
    p.nom = (body.nom or "").strip()
    db.add(p)
    db.commit()
    db.refresh(p)
    return _serialiser_personnel(p, {})


@router.put("/formations/personnel/{personnel_id}")
def modifier_personnel(
    personnel_id: int,
    body: FormationPersonnelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    p = db.query(FormationPersonnel).filter(FormationPersonnel.id == personnel_id).first()
    if not p:
        raise HTTPException(404, "Agent introuvable.")

    donnees = body.model_dump(exclude_unset=True)
    if "matricule" in donnees:
        matricule = (donnees["matricule"] or "").strip()
        if not matricule:
            raise HTTPException(400, "Le matricule est obligatoire.")
        doublon = db.query(FormationPersonnel).filter(
            FormationPersonnel.matricule == matricule,
            FormationPersonnel.id != personnel_id,
        ).first()
        if doublon:
            raise HTTPException(400, f"Le matricule « {matricule} » est déjà utilisé.")
        donnees["matricule"] = matricule
    if "nom" in donnees:
        donnees["nom"] = (donnees["nom"] or "").strip()

    for champ, valeur in donnees.items():
        setattr(p, champ, valeur)

    db.commit()
    db.refresh(p)
    aggs = _agregats_personnel(db, [p.id])
    return _serialiser_personnel(p, aggs.get(p.id, {}))


@router.delete("/formations/personnel/{personnel_id}")
def desactiver_personnel(
    personnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Désactivation (archivage) : on ne supprime jamais un agent et son historique."""
    _exiger_acces(current_user)
    p = db.query(FormationPersonnel).filter(FormationPersonnel.id == personnel_id).first()
    if not p:
        raise HTTPException(404, "Agent introuvable.")
    p.actif = False
    db.commit()
    return {"success": True, "id": personnel_id, "actif": False}


# ── Sessions ─────────────────────────────────────────────────────────────────
def _serialiser_session(s: FormationSession, personnel=None, module=None) -> dict:
    d = FormationSessionOut.model_validate(s).model_dump()
    if personnel is not None:
        d["personnel_nom"] = personnel.nom
        d["personnel_matricule"] = personnel.matricule
    if module is not None:
        d["module_nom"] = module.nom
    return d


@router.get("/formations/matrice")
def matrice(
    search: Optional[str] = Query(None),
    groupe: Optional[str] = Query(None),
    poste: Optional[str] = Query(None),
    gestionnaire: Optional[str] = Query(None),
    actif: Optional[bool] = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tableau de suivi : personnes en lignes, modules en colonnes.

    Pour chaque couple (agent, module), on renvoie la **dernière** formation
    enregistrée. L'historique complet reste consultable via
    /formations/sessions?personnel_id=…
    """
    _exiger_acces(current_user)

    modules = (
        db.query(FormationModule)
        .filter(FormationModule.actif.is_(True))
        .order_by(FormationModule.ordre, FormationModule.nom)
        .all()
    )

    q = db.query(FormationPersonnel)
    if actif is not None:
        q = q.filter(FormationPersonnel.actif.is_(actif))
    if groupe:
        q = q.filter(FormationPersonnel.groupe == groupe)
    if poste:
        q = q.filter(FormationPersonnel.poste == poste)
    if gestionnaire:
        q = q.filter(FormationPersonnel.gestionnaire == gestionnaire)
    if search:
        terme = f"%{search.strip()}%"
        q = q.filter(or_(
            FormationPersonnel.nom.ilike(terme),
            FormationPersonnel.matricule.ilike(terme),
            FormationPersonnel.telephone.ilike(terme),
        ))

    personnes = q.order_by(FormationPersonnel.nom).all()
    ids = [p.id for p in personnes]
    aggs = _agregats_personnel(db, ids)

    dernieres = _dernieres_par_couple(db, ids)

    lignes = []
    for p in personnes:
        cellules = {}
        for m in modules:
            s = dernieres.get((p.id, m.id))
            if s is not None:
                cellules[str(m.id)] = {
                    "session_id": s.id,
                    "statut": s.statut,
                    "date_session": s.date_session.isoformat() if s.date_session else None,
                    "evaluation": s.evaluation,
                    "note": s.note,
                    "observation": s.observation,
                }
        agg = aggs.get(p.id, {})
        lignes.append({
            "id": p.id,
            "matricule": p.matricule,
            "nom": p.nom,
            "telephone": p.telephone,
            "groupe": p.groupe,
            "poste": p.poste,
            "gestionnaire": p.gestionnaire,
            "agence": p.agence,
            "evaluation_globale": p.evaluation_globale,
            "note_globale": p.note_globale,
            "nb_valides": agg.get("nb_valides", 0),
            "nb_modules": agg.get("nb_modules", 0),
            "nb_a_reformer": agg.get("nb_a_reformer", 0),
            "taux_validation": agg.get("taux_validation", 0.0),
            "derniere_formation": agg.get("derniere_formation").isoformat() if agg.get("derniere_formation") else None,
            "cellules": cellules,
        })

    return {
        "modules": [
            {"id": m.id, "nom": m.nom, "ordre": m.ordre, "obligatoire": m.obligatoire}
            for m in modules
        ],
        "personnes": lignes,
        "total": len(lignes),
    }


@router.get("/formations/personnel/{personnel_id}")
def detail_personnel(
    personnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fiche complète d'un agent : identité, avancement et historique des formations."""
    _exiger_acces(current_user)

    p = db.query(FormationPersonnel).filter(FormationPersonnel.id == personnel_id).first()
    if not p:
        raise HTTPException(404, "Agent introuvable.")

    sessions = (
        db.query(FormationSession)
        .filter(FormationSession.personnel_id == personnel_id)
        .order_by(FormationSession.date_session.desc().nullslast())
        .all()
    )
    modules = {m.id: m for m in db.query(FormationModule).all()}
    aggs = _agregats_personnel(db, [personnel_id])

    # Parcours : tous les modules actifs, avec la DERNIÈRE formation de chacun
    modules_actifs = (
        db.query(FormationModule)
        .filter(FormationModule.actif.is_(True))
        .order_by(FormationModule.ordre, FormationModule.nom)
        .all()
    )
    dernieres = _dernieres_par_couple(db, [personnel_id])

    parcours = []
    for m in modules_actifs:
        s_ = dernieres.get((personnel_id, m.id))
        parcours.append({
            "module_id": m.id,
            "module_nom": m.nom,
            "obligatoire": m.obligatoire,
            "session_id": s_.id if s_ else None,
            "statut": s_.statut if s_ else None,
            "date_session": s_.date_session.isoformat() if s_ and s_.date_session else None,
            "evaluation": s_.evaluation if s_ else None,
            "note": s_.note if s_ else None,
            "observation": s_.observation if s_ else None,
            "formateur": s_.formateur if s_ else None,
        })

    # Alerte. La feuille Excel ne testait que « à reformer » et « en cours » :
    # un agent formé sur 3 modules sur 8 y apparaissait « À JOUR », ce qui est
    # trompeur. On ajoute donc l'état INCOMPLET pour les modules non formés.
    statuts = [x["statut"] for x in parcours if x["statut"]]
    if "A_REFORMER" in statuts:
        alerte = "ACTION_REQUISE"
    elif "EN_COURS" in statuts:
        alerte = "SUIVI_EN_COURS"
    elif any(not x["statut"] for x in parcours):
        alerte = "INCOMPLET"
    else:
        alerte = "A_JOUR"

    data = _serialiser_personnel(p, aggs.get(personnel_id, {}))
    data["parcours"] = parcours
    data["alerte"] = alerte
    data["nb_non_formes"] = sum(1 for x in parcours if not x["statut"])
    data["historique"] = [
        {
            "id": s.id,
            "module_id": s.module_id,
            "module_nom": modules[s.module_id].nom if s.module_id in modules else None,
            "date_session": s.date_session.isoformat() if s.date_session else None,
            "statut": s.statut,
            "evaluation": s.evaluation,
            "note": s.note,
            "observation": s.observation,
            "formateur": s.formateur,
        }
        for s in sessions
    ]
    return data


@router.get("/formations/sessions")
def lister_sessions(
    personnel_id: Optional[int] = Query(None),
    module_id: Optional[int] = Query(None),
    statut: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)

    q = db.query(FormationSession)
    if personnel_id:
        q = q.filter(FormationSession.personnel_id == personnel_id)
    if module_id:
        q = q.filter(FormationSession.module_id == module_id)
    if statut:
        q = q.filter(FormationSession.statut == statut)

    sessions = q.order_by(FormationSession.date_session.desc().nullslast()).limit(limit).all()
    personnes = {p.id: p for p in db.query(FormationPersonnel).all()}
    modules = {m.id: m for m in db.query(FormationModule).all()}
    return [
        _serialiser_session(s, personnes.get(s.personnel_id), modules.get(s.module_id))
        for s in sessions
    ]


@router.post("/formations/sessions", status_code=201)
def creer_session(
    body: FormationSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    if not db.query(FormationPersonnel).filter(FormationPersonnel.id == body.personnel_id).first():
        raise HTTPException(404, "Agent introuvable.")
    if not db.query(FormationModule).filter(FormationModule.id == body.module_id).first():
        raise HTTPException(404, "Module introuvable.")

    doublon = db.query(FormationSession).filter(
        FormationSession.personnel_id == body.personnel_id,
        FormationSession.module_id == body.module_id,
        FormationSession.date_session == body.date_session,
    ).first()
    if doublon:
        raise HTTPException(400, "Une formation existe déjà pour cet agent, ce module et cette date.")

    s = FormationSession(**body.model_dump(), cree_par_id=current_user.id)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialiser_session(s)


@router.put("/formations/sessions/{session_id}")
def modifier_session(
    session_id: int,
    body: FormationSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    s = db.query(FormationSession).filter(FormationSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Formation introuvable.")
    for champ, valeur in body.model_dump(exclude_unset=True).items():
        setattr(s, champ, valeur)
    db.commit()
    db.refresh(s)
    return _serialiser_session(s)


@router.delete("/formations/sessions/{session_id}")
def supprimer_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _exiger_acces(current_user)
    s = db.query(FormationSession).filter(FormationSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Formation introuvable.")
    db.delete(s)
    db.commit()
    return {"success": True, "id": session_id}


# ── Pilotage ─────────────────────────────────────────────────────────────────
LIBELLE_EXPORT = {
    "VALIDER": "VALIDER",
    "EN_COURS": "EN COURS",
    "A_FORMER": "À FORMER",
    "A_REFORMER": "À REFORMER",
    "NA": "N/A",
}


def _statuts_personne(dernieres: Dict[tuple, FormationSession], pid: int, modules) -> list:
    return [
        (dernieres[(pid, m.id)].statut if (pid, m.id) in dernieres else None)
        for m in modules
    ]


def _alerte_de(statuts: list) -> str:
    if "A_REFORMER" in statuts:
        return "ACTION_REQUISE"
    if "EN_COURS" in statuts:
        return "SUIVI_EN_COURS"
    if any(s is None for s in statuts):
        return "INCOMPLET"
    return "A_JOUR"


@router.get("/formations/dashboard")
def dashboard(
    groupe: Optional[str] = Query(None),
    poste: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tableau de bord de la formation : couverture par module, groupe et poste."""
    _exiger_acces(current_user)

    modules = (
        db.query(FormationModule)
        .filter(FormationModule.actif.is_(True))
        .order_by(FormationModule.ordre, FormationModule.nom)
        .all()
    )
    q = db.query(FormationPersonnel).filter(FormationPersonnel.actif.is_(True))
    if groupe:
        q = q.filter(FormationPersonnel.groupe == groupe)
    if poste:
        q = q.filter(FormationPersonnel.poste == poste)
    personnes = q.order_by(FormationPersonnel.nom).all()

    dernieres = _dernieres_par_couple(db, [p.id for p in personnes])
    total_modules = len(modules) or 1

    # Couverture par module
    par_module = []
    for m in modules:
        compte = {"VALIDER": 0, "EN_COURS": 0, "A_REFORMER": 0, "A_FORMER": 0, "NA": 0, "VIDE": 0}
        for p in personnes:
            s = dernieres.get((p.id, m.id))
            if s is None:
                compte["VIDE"] += 1
            else:
                compte[s.statut] = compte.get(s.statut, 0) + 1
        par_module.append({
            "id": m.id,
            "nom": m.nom,
            "obligatoire": m.obligatoire,
            "nb_valides": compte["VALIDER"],
            "nb_en_cours": compte["EN_COURS"],
            "nb_a_reformer": compte["A_REFORMER"],
            "nb_non_formes": compte["VIDE"],
            "taux": round(compte["VALIDER"] / len(personnes) * 100, 1) if personnes else 0.0,
        })

    # Alertes et regroupements
    alertes = {"A_JOUR": 0, "INCOMPLET": 0, "SUIVI_EN_COURS": 0, "ACTION_REQUISE": 0}
    par_groupe: Dict[str, dict] = {}
    par_poste: Dict[str, dict] = {}

    def _ajouter(table, cle_brute, valides):
        cle = cle_brute or "—"
        a = table.setdefault(cle, {"cle": cle, "nb_personnes": 0, "valides": 0, "attendu": 0})
        a["nb_personnes"] += 1
        a["valides"] += valides
        a["attendu"] += total_modules

    total_valides = 0
    for p in personnes:
        statuts = _statuts_personne(dernieres, p.id, modules)
        valides = sum(1 for s in statuts if s == "VALIDER")
        total_valides += valides
        alertes[_alerte_de(statuts)] += 1
        _ajouter(par_groupe, p.groupe, valides)
        _ajouter(par_poste, p.poste, valides)

    def _finaliser(table):
        lignes = []
        for a in table.values():
            a["taux"] = round(a["valides"] / a["attendu"] * 100, 1) if a["attendu"] else 0.0
            lignes.append(a)
        lignes.sort(key=lambda x: (-x["taux"], x["cle"]))
        return lignes

    attendu = len(personnes) * total_modules
    return {
        "kpis": {
            "nb_personnel": len(personnes),
            "nb_modules": len(modules),
            "nb_sessions": db.query(func.count(FormationSession.id)).scalar() or 0,
            "taux_global": round(total_valides / attendu * 100, 1) if attendu else 0.0,
            "nb_valides": total_valides,
            "nb_attendus": attendu,
            "nb_a_jour": alertes["A_JOUR"],
            "nb_incomplet": alertes["INCOMPLET"],
            "nb_suivi": alertes["SUIVI_EN_COURS"],
            "nb_action": alertes["ACTION_REQUISE"],
        },
        "par_module": par_module,
        "par_groupe": _finaliser(par_groupe),
        "par_poste": _finaliser(par_poste),
        "alertes": alertes,
    }


@router.get("/formations/alertes")
def lister_alertes(
    type_alerte: Optional[str] = Query(None, alias="type"),
    groupe: Optional[str] = Query(None),
    poste: Optional[str] = Query(None),
    gestionnaire: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Agents à relancer : parcours incomplet, modules à reformer, suivi en cours."""
    _exiger_acces(current_user)

    modules = (
        db.query(FormationModule)
        .filter(FormationModule.actif.is_(True))
        .order_by(FormationModule.ordre, FormationModule.nom)
        .all()
    )
    q = db.query(FormationPersonnel).filter(FormationPersonnel.actif.is_(True))
    if groupe:
        q = q.filter(FormationPersonnel.groupe == groupe)
    if poste:
        q = q.filter(FormationPersonnel.poste == poste)
    if gestionnaire:
        q = q.filter(FormationPersonnel.gestionnaire == gestionnaire)
    personnes = q.order_by(FormationPersonnel.nom).all()

    dernieres = _dernieres_par_couple(db, [p.id for p in personnes])
    total_modules = len(modules) or 1

    compteurs = {"A_JOUR": 0, "INCOMPLET": 0, "SUIVI_EN_COURS": 0, "ACTION_REQUISE": 0}
    items = []
    for p in personnes:
        statuts = _statuts_personne(dernieres, p.id, modules)
        alerte = _alerte_de(statuts)
        compteurs[alerte] += 1

        manquants = [m.nom for m, s in zip(modules, statuts) if s is None]
        a_reformer = [m.nom for m, s in zip(modules, statuts) if s == "A_REFORMER"]
        valides = sum(1 for s in statuts if s == "VALIDER")

        if type_alerte and alerte != type_alerte:
            continue

        items.append({
            "id": p.id,
            "matricule": p.matricule,
            "nom": p.nom,
            "groupe": p.groupe,
            "poste": p.poste,
            "gestionnaire": p.gestionnaire,
            "alerte": alerte,
            "nb_valides": valides,
            "nb_modules": total_modules,
            "taux": round(valides / total_modules * 100, 1) if total_modules else 0.0,
            "modules_manquants": manquants,
            "modules_a_reformer": a_reformer,
        })

    items.sort(key=lambda x: (x["taux"], x["nom"]))
    return {"total": len(items), "items": items, "compteurs": compteurs}


# ── Export Excel ─────────────────────────────────────────────────────────────
ORANGE = "FF6900"
_GRIS = "F2F2F2"


def _entete(ws, ligne: int, titres: list):
    for i, titre in enumerate(titres, 1):
        c = ws.cell(row=ligne, column=i, value=titre)
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.fill = PatternFill("solid", fgColor=ORANGE)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[ligne].height = 30


def _largeurs(ws, largeurs: dict):
    for col, w in largeurs.items():
        ws.column_dimensions[get_column_letter(col)].width = w


def _titre_feuille(ws, texte: str, nb_colonnes: int):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(nb_colonnes, 1))
    c = ws.cell(row=1, column=1, value=texte)
    c.font = Font(bold=True, size=14, color="1F2A44")
    c.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 26


@router.get("/formations/export.xlsx")
def exporter_excel(
    groupe: Optional[str] = Query(None),
    poste: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Classeur de 4 feuilles : Synthèse, Matrice (format d'origine), Détails, Personnel."""
    _exiger_acces(current_user)

    modules = (
        db.query(FormationModule)
        .filter(FormationModule.actif.is_(True))
        .order_by(FormationModule.ordre, FormationModule.nom)
        .all()
    )
    q = db.query(FormationPersonnel).filter(FormationPersonnel.actif.is_(True))
    if groupe:
        q = q.filter(FormationPersonnel.groupe == groupe)
    if poste:
        q = q.filter(FormationPersonnel.poste == poste)
    personnes = q.order_by(FormationPersonnel.nom).all()
    ids = [p.id for p in personnes]
    dernieres = _dernieres_par_couple(db, ids)
    total_modules = len(modules) or 1

    wb = Workbook()

    # ── 1. Synthèse ──
    ws = wb.active
    ws.title = "Synthèse"
    _titre_feuille(ws, "SUIVI FORMATION — SYNTHÈSE", 7)
    ws["A2"] = f"Édité le {date.today().strftime('%d/%m/%Y')}"
    ws["A2"].font = Font(italic=True, size=9, color="666666")

    alertes = {"A_JOUR": 0, "INCOMPLET": 0, "SUIVI_EN_COURS": 0, "ACTION_REQUISE": 0}
    total_valides = 0
    par_groupe_table: Dict[str, dict] = {}
    par_poste_table: Dict[str, dict] = {}

    for p in personnes:
        statuts = _statuts_personne(dernieres, p.id, modules)
        valides = sum(1 for s in statuts if s == "VALIDER")
        total_valides += valides
        alertes[_alerte_de(statuts)] += 1
        for table, cle in ((par_groupe_table, p.groupe), (par_poste_table, p.poste)):
            k = cle or "—"
            a = table.setdefault(k, {"nb": 0, "valides": 0, "attendu": 0})
            a["nb"] += 1
            a["valides"] += valides
            a["attendu"] += total_modules

    attendu = len(personnes) * total_modules
    taux_global = round(total_valides / attendu * 100, 1) if attendu else 0.0

    ws["A4"] = "Indicateur"; ws["B4"] = "Valeur"
    for cell in ("A4", "B4"):
        ws[cell].font = Font(bold=True, color="FFFFFF")
        ws[cell].fill = PatternFill("solid", fgColor=ORANGE)
    kpis = [
        ("Agents suivis", len(personnes)),
        ("Modules", len(modules)),
        ("Modules validés", total_valides),
        ("Modules attendus", attendu),
        ("Taux global de validation", f"{taux_global} %"),
        ("Agents à jour", alertes["A_JOUR"]),
        ("Parcours incomplet", alertes["INCOMPLET"]),
        ("Suivi en cours", alertes["SUIVI_EN_COURS"]),
        ("Action requise", alertes["ACTION_REQUISE"]),
    ]
    for i, (libelle, valeur) in enumerate(kpis, start=5):
        ws.cell(row=i, column=1, value=libelle).font = Font(bold=True, size=10)
        ws.cell(row=i, column=2, value=valeur)

    ligne = 5 + len(kpis) + 2
    ws.cell(row=ligne, column=1, value="COUVERTURE PAR MODULE").font = Font(bold=True, size=11, color="1F2A44")
    _entete(ws, ligne + 1, ["Module", "Obligatoire", "Validés", "En cours", "À reformer", "Non formés", "Taux"])
    r = ligne + 2
    for m in modules:
        compte = {"VALIDER": 0, "EN_COURS": 0, "A_REFORMER": 0, "VIDE": 0}
        for p in personnes:
            s_ = dernieres.get((p.id, m.id))
            if s_ is None:
                compte["VIDE"] += 1
            else:
                compte[s_.statut] = compte.get(s_.statut, 0) + 1
        ws.cell(row=r, column=1, value=m.nom)
        ws.cell(row=r, column=2, value="Oui" if m.obligatoire else "Non")
        ws.cell(row=r, column=3, value=compte["VALIDER"])
        ws.cell(row=r, column=4, value=compte["EN_COURS"])
        ws.cell(row=r, column=5, value=compte["A_REFORMER"])
        ws.cell(row=r, column=6, value=compte["VIDE"])
        taux = round(compte["VALIDER"] / len(personnes) * 100, 1) if personnes else 0
        c = ws.cell(row=r, column=7, value=f"{taux} %")
        c.fill = PatternFill("solid", fgColor=_GRIS)
        r += 1

    for nom_table, table, titre in (
        ("groupe", par_groupe_table, "COUVERTURE PAR GROUPE"),
        ("poste", par_poste_table, "COUVERTURE PAR POSTE"),
    ):
        r += 2
        ws.cell(row=r, column=1, value=titre).font = Font(bold=True, size=11, color="1F2A44")
        _entete(ws, r + 1, ["Libellé", "Agents", "Validés", "Attendus", "Taux"])
        r += 2
        for k, a in sorted(table.items(), key=lambda x: -x[1]["valides"]):
            ws.cell(row=r, column=1, value=k)
            ws.cell(row=r, column=2, value=a["nb"])
            ws.cell(row=r, column=3, value=a["valides"])
            ws.cell(row=r, column=4, value=a["attendu"])
            taux = round(a["valides"] / a["attendu"] * 100, 1) if a["attendu"] else 0
            ws.cell(row=r, column=5, value=f"{taux} %")
            r += 1

    _largeurs(ws, {1: 52, 2: 13, 3: 11, 4: 12, 5: 12, 6: 13, 7: 10})
    ws.freeze_panes = "A5"

    # ── 2. Matrice (format d'origine du fichier Excel) ──
    ws2 = wb.create_sheet("Matrice")
    entetes = ["ID PERSONNEL", "NOM ET PRÉNOM", "N° TÉLÉPHONE", "GROUPE", "POSTE", "AGENCE"]
    for m in modules:
        entetes += [m.nom, "DATE FORMATION"]
    entetes.append("COMPRÉHENSION / ÉVALUATION")
    _entete(ws2, 1, entetes)

    for i, p in enumerate(personnes, start=2):
        ws2.cell(row=i, column=1, value=p.matricule)
        ws2.cell(row=i, column=2, value=p.nom)
        ws2.cell(row=i, column=3, value=p.telephone)
        ws2.cell(row=i, column=4, value=p.groupe)
        ws2.cell(row=i, column=5, value=p.poste)
        ws2.cell(row=i, column=6, value=p.agence)
        col = 7
        for m in modules:
            s_ = dernieres.get((p.id, m.id))
            ws2.cell(row=i, column=col, value=LIBELLE_EXPORT.get(s_.statut, s_.statut) if s_ else None)
            cellule_date = ws2.cell(row=i, column=col + 1, value=s_.date_session if s_ else None)
            cellule_date.number_format = "DD/MM/YYYY"
            col += 2
        evaluation = None
        if p.evaluation_globale:
            evaluation = p.evaluation_globale
            if p.note_globale is not None:
                evaluation = f"{evaluation} | {p.note_globale:g}/20"
        ws2.cell(row=i, column=col, value=evaluation)

    _largeurs(ws2, {1: 14, 2: 30, 3: 15, 4: 12, 5: 18, 6: 30})
    for c in range(7, 7 + len(modules) * 2 + 1):
        ws2.column_dimensions[get_column_letter(c)].width = 14
    ws2.freeze_panes = "C2"
    ws2.auto_filter.ref = f"A1:{get_column_letter(len(entetes))}{max(len(personnes) + 1, 2)}"

    # ── 3. Détail des sessions ──
    ws3 = wb.create_sheet("Détail sessions")
    _entete(ws3, 1, ["MATRICULE", "NOM", "GROUPE", "POSTE", "MODULE", "DATE",
                     "STATUT", "ÉVALUATION", "NOTE /20", "OBSERVATION", "FORMATEUR"])
    map_p = {p.id: p for p in personnes}
    map_m = {m.id: m for m in modules}
    r = 2
    for s_ in (db.query(FormationSession)
               .filter(FormationSession.personnel_id.in_(ids) if ids else False)
               .order_by(FormationSession.date_session.desc().nullslast()).all() if ids else []):
        p = map_p.get(s_.personnel_id)
        if not p:
            continue
        ws3.cell(row=r, column=1, value=p.matricule)
        ws3.cell(row=r, column=2, value=p.nom)
        ws3.cell(row=r, column=3, value=p.groupe)
        ws3.cell(row=r, column=4, value=p.poste)
        ws3.cell(row=r, column=5, value=(map_m.get(s_.module_id).nom if map_m.get(s_.module_id) else None))
        cd = ws3.cell(row=r, column=6, value=s_.date_session)
        cd.number_format = "DD/MM/YYYY"
        ws3.cell(row=r, column=7, value=LIBELLE_EXPORT.get(s_.statut, s_.statut))
        ws3.cell(row=r, column=8, value=s_.evaluation)
        ws3.cell(row=r, column=9, value=s_.note)
        ws3.cell(row=r, column=10, value=s_.observation)
        ws3.cell(row=r, column=11, value=s_.formateur)
        r += 1
    _largeurs(ws3, {1: 14, 2: 30, 3: 12, 4: 18, 5: 42, 6: 12, 7: 12, 8: 14, 9: 10, 10: 60, 11: 20})
    ws3.freeze_panes = "A2"
    ws3.auto_filter.ref = f"A1:K{max(r - 1, 2)}"

    # ── 4. Personnel ──
    ws4 = wb.create_sheet("Personnel")
    _entete(ws4, 1, ["ID PERSONNEL", "NOM ET PRÉNOM", "N° TÉLÉPHONE", "GESTIONNAIRE",
                     "GROUPE", "POSTE", "AGENCE", "STATUT", "MODULES VALIDÉS", "TAUX",
                     "DERNIÈRE FORMATION"])
    for i, p in enumerate(personnes, start=2):
        statuts = _statuts_personne(dernieres, p.id, modules)
        valides = sum(1 for s in statuts if s == "VALIDER")
        dates = [dernieres[(p.id, m.id)].date_session for m in modules
                 if (p.id, m.id) in dernieres and dernieres[(p.id, m.id)].date_session]
        ws4.cell(row=i, column=1, value=p.matricule)
        ws4.cell(row=i, column=2, value=p.nom)
        ws4.cell(row=i, column=3, value=p.telephone)
        ws4.cell(row=i, column=4, value=p.gestionnaire)
        ws4.cell(row=i, column=5, value=p.groupe)
        ws4.cell(row=i, column=6, value=p.poste)
        ws4.cell(row=i, column=7, value=p.agence)
        ws4.cell(row=i, column=8, value=p.statut_emploi)
        ws4.cell(row=i, column=9, value=f"{valides}/{total_modules}")
        ws4.cell(row=i, column=10, value=f"{round(valides / total_modules * 100, 1)} %")
        cd = ws4.cell(row=i, column=11, value=(max(dates) if dates else None))
        cd.number_format = "DD/MM/YYYY"
    _largeurs(ws4, {1: 14, 2: 30, 3: 15, 4: 26, 5: 16, 6: 18, 7: 30, 8: 10, 9: 16, 10: 9, 11: 18})
    ws4.freeze_panes = "C2"
    ws4.auto_filter.ref = f"A1:K{max(len(personnes) + 1, 2)}"

    flux = io.BytesIO()
    wb.save(flux)
    flux.seek(0)
    nom_fichier = f"suivi_formation_{date.today().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        flux,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nom_fichier}"'},
    )


# ── Import & synthèse ────────────────────────────────────────────────────────
@router.post("/formations/import")
async def importer(
    fichier: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Importe le classeur « Suivi Formation » (feuilles BASE DE DONNEES + SUIVI FORMATIONS)."""
    _exiger_acces(current_user)

    nom = (fichier.filename or "").lower()
    if not nom.endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Envoyez un fichier Excel (.xlsx ou .xlsm).")

    contenu = await fichier.read()
    if not contenu:
        raise HTTPException(400, "Le fichier est vide.")

    try:
        rapport = importer_classeur(contenu, db, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:  # erreur inattendue : on n'expose pas la trace
        db.rollback()
        raise HTTPException(500, f"Import impossible : {exc}")

    return rapport


@router.get("/formations/resume")
def resume(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compteurs d'en-tête du menu."""
    _exiger_acces(current_user)

    nb_personnel = db.query(func.count(FormationPersonnel.id)).filter(FormationPersonnel.actif.is_(True)).scalar() or 0
    nb_modules = db.query(func.count(FormationModule.id)).filter(FormationModule.actif.is_(True)).scalar() or 0
    nb_sessions = db.query(func.count(FormationSession.id)).scalar() or 0
    nb_valides = db.query(func.count(FormationSession.id)).filter(FormationSession.statut == "VALIDER").scalar() or 0
    nb_a_reformer = db.query(func.count(FormationSession.id)).filter(FormationSession.statut == "A_REFORMER").scalar() or 0

    personnes = db.query(FormationPersonnel.id).filter(FormationPersonnel.actif.is_(True)).all()
    aggs = _agregats_personnel(db, [p[0] for p in personnes])
    a_jour = sum(1 for a in aggs.values() if a["nb_modules"] and a["nb_valides"] >= a["nb_modules"])

    return {
        "nb_personnel": nb_personnel,
        "nb_modules": nb_modules,
        "nb_sessions": nb_sessions,
        "nb_valides": nb_valides,
        "nb_a_reformer": nb_a_reformer,
        "nb_a_jour": a_jour,
        "taux_global": round(nb_valides / (nb_personnel * nb_modules) * 100, 1) if nb_personnel and nb_modules else 0.0,
    }
