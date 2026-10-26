"""
API « Suivi Formation ».

  Référentiel : /formations/personnel
  Catalogue   : /formations/modules
  Formations  : /formations/sessions
  Import      : /formations/import  (classeur Excel historique)
"""
from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_
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

    sessions = []
    if ids:
        sessions = (
            db.query(FormationSession)
            .filter(FormationSession.personnel_id.in_(ids))
            .all()
        )

    # Dernière session par (agent, module) : date la plus récente, sinon la plus récemment créée
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
    dernieres = {}
    for s_ in sessions:
        cle = s_.module_id
        actuel = dernieres.get(cle)
        if actuel is None:
            dernieres[cle] = s_
            continue
        d_new = s_.date_session or date.min
        d_old = actuel.date_session or date.min
        if d_new > d_old or (d_new == d_old and (s_.id or 0) > (actuel.id or 0)):
            dernieres[cle] = s_

    parcours = []
    for m in modules_actifs:
        s_ = dernieres.get(m.id)
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
