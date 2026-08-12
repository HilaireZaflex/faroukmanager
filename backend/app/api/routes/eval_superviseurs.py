"""
Routes API — Évaluation des Superviseurs
Prefix: /api/eval-superviseurs
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.eval_superviseur import EvalSuperviseur
from app.services import eval_superviseur_service as svc
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import date

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class MysteryCallInput(BaseModel):
    numero_pdv: str
    tc_user_id: Optional[int] = None
    tc_nom: Optional[str] = None
    statut: str  # JOIGNABLE | INJOIGNABLE
    note_connaissance: Optional[float] = None   # /10 - nom superviseur
    note_visite: Optional[float] = None         # /10 - visite effectuée
    note_superviseur: Optional[float] = None    # /10 - note donnée au superviseur
    commentaire: Optional[str] = None


class PresentielInput(BaseModel):
    note_maitrise_pdv: float    # /10
    note_maitrise_zone: float   # /10


# ─── Helper format ────────────────────────────────────────────────────────────

def _fmt(e: EvalSuperviseur) -> dict:
    return {
        "id": e.id,
        "superviseur": e.superviseur,
        "annee": e.annee,
        "mois": e.mois,
        "kpis_data": e.kpis_data,
        "score_kpi": e.score_kpi,
        "mystery_calls": e.mystery_calls or [],
        "pdvs_mystery_generes": e.pdvs_mystery_generes or [],
        "score_mystery": e.score_mystery,
        "pdvs_presentiel_generes": e.pdvs_presentiel_generes or [],
        "note_maitrise_pdv": e.note_maitrise_pdv,
        "note_maitrise_zone": e.note_maitrise_zone,
        "score_presentiel": e.score_presentiel,
        "score_final": e.score_final,
        "mention": e.mention,
        "statut": e.statut,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


# ─── Liste superviseurs ────────────────────────────────────────────────────────

@router.get("/eval-superviseurs/superviseurs")
def liste_superviseurs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste tous les superviseurs disponibles."""
    return svc.get_liste_superviseurs(db)


# ─── KPIs d'un superviseur ────────────────────────────────────────────────────

@router.get("/eval-superviseurs/kpis/{superviseur}")
def get_kpis(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupère les KPIs d'un superviseur pour le mois donné."""
    return svc.get_kpis_superviseur(db, superviseur, annee, mois)


# ─── Initialiser une évaluation ───────────────────────────────────────────────

@router.post("/eval-superviseurs/initialiser")
def initialiser_evaluation(
    superviseur: str = Body(...),
    annee: int = Body(...),
    mois: int = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crée ou réinitialise une évaluation pour un superviseur/mois."""
    # Vérifier si existe déjà
    existing = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).first()

    # Charger les KPIs
    kpis = svc.get_kpis_superviseur(db, superviseur, annee, mois)

    # Générer les PDVs mystery et présentiel
    pdvs_mystery = svc.generer_pdvs_mystery(db, superviseur, 5)
    pdvs_presentiel = svc.generer_pdvs_presentiel(db, superviseur, 5)

    if existing:
        existing.kpis_data = kpis
        existing.score_kpi = kpis['score_kpi_global']
        existing.pdvs_mystery_generes = pdvs_mystery
        existing.pdvs_presentiel_generes = pdvs_presentiel
        existing.statut = 'EN_COURS'
        existing.mystery_calls = []
        existing.note_maitrise_pdv = None
        existing.note_maitrise_zone = None
        existing.score_final = None
        existing.mention = None
        existing.created_by = current_user.id
        db.commit()
        db.refresh(existing)
        return _fmt(existing)
    else:
        eval_obj = EvalSuperviseur(
            superviseur=superviseur,
            annee=annee,
            mois=mois,
            kpis_data=kpis,
            score_kpi=kpis['score_kpi_global'],
            pdvs_mystery_generes=pdvs_mystery,
            pdvs_presentiel_generes=pdvs_presentiel,
            mystery_calls=[],
            statut='EN_COURS',
            created_by=current_user.id,
        )
        db.add(eval_obj)
        db.commit()
        db.refresh(eval_obj)
        return _fmt(eval_obj)


# ─── Récupérer une évaluation ─────────────────────────────────────────────────

@router.get("/eval-superviseurs/ma-liste-mystery")
def ma_liste_mystery_early(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne la liste des PDVs à appeler pour la TC connectée. (Route prioritaire)"""
    tc_nom = (current_user.nom or '').strip()
    tc_prenom = (current_user.prenom or '').strip()
    tc_full = f"{tc_prenom} {tc_nom}".strip().lower()
    tc_nom_lower = tc_nom.lower()

    evals = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
        EvalSuperviseur.statut == 'EN_COURS',
    ).all()

    ma_liste = []
    for e in evals:
        for pdv in (e.pdvs_mystery_generes or []):
            tc_pdv = (pdv.get('teleconseillere') or '').lower()
            if (tc_nom_lower and tc_nom_lower in tc_pdv) or \
               (tc_full and tc_full in tc_pdv) or \
               (tc_pdv and tc_pdv in tc_full):
                call = next((c for c in (e.mystery_calls or []) if c['numero_pdv'] == pdv['numero_pdv']), None)
                ma_liste.append({
                    "superviseur": e.superviseur,
                    "pdv": pdv,
                    "statut_appel": call['statut'] if call else None,
                    "notes": call if call else None,
                    "eval_id": e.id,
                })

    return {"tc_nom": tc_nom, "total": len(ma_liste), "liste": ma_liste}


@router.get("/eval-superviseurs/{superviseur}")
def get_evaluation(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupère l'évaluation d'un superviseur pour le mois donné."""
    e = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).first()
    if not e:
        raise HTTPException(404, "Évaluation non trouvée. Initialisez d'abord.")
    return _fmt(e)


# ─── Ajouter un appel TC (mystery) ────────────────────────────────────────────

@router.post("/eval-superviseurs/{superviseur}/mystery-call")
def ajouter_mystery_call(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    call: MysteryCallInput = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enregistre le résultat d'un appel TC (mystery call)."""
    e = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).first()
    if not e:
        raise HTTPException(404, "Évaluation non trouvée.")

    calls = list(e.mystery_calls or [])

    # Si injoignable → REMPLACER ce PDV dans la liste (pas en ajouter un)
    if call.statut == 'INJOIGNABLE':
        exclus = [c['numero_pdv'] for c in calls]
        exclus.append(call.numero_pdv)
        pdvs_generes = list(e.pdvs_mystery_generes or [])

        # Trouver et remplacer le PDV injoignable dans la liste générée
        nouveaux = svc.generer_pdvs_mystery(db, superviseur, 1, exclus)
        if nouveaux:
            # Remplacer le PDV injoignable par le nouveau (garde toujours 5 PDVs)
            for idx, p in enumerate(pdvs_generes):
                if p['numero_pdv'] == call.numero_pdv:
                    pdvs_generes[idx] = nouveaux[0]
                    break
            else:
                # Si pas trouvé, remplacer le dernier qui dépasse 5
                if len(pdvs_generes) >= 5:
                    pdvs_generes = pdvs_generes[:4] + [nouveaux[0]]
                else:
                    pdvs_generes.append(nouveaux[0])
            e.pdvs_mystery_generes = pdvs_generes

    # Ajouter l'appel
    call_data = call.dict()
    call_data['tc_nom'] = call.tc_nom or f"{current_user.prenom or ''} {current_user.nom or ''}".strip()
    call_data['tc_user_id'] = current_user.id
    call_data['date_appel'] = str(date.today())

    # Remplacer si même PDV existe
    calls = [c for c in calls if c['numero_pdv'] != call.numero_pdv]
    calls.append(call_data)
    e.mystery_calls = calls

    # Recalculer score mystery
    joignables = [c for c in calls if c.get('statut') == 'JOIGNABLE']
    if joignables:
        total = sum(
            ((c.get('note_connaissance') or 0) + (c.get('note_visite') or 0) + (c.get('note_superviseur') or 0)) / 3
            for c in joignables
        )
        score_mys_10 = total / len(joignables)
        e.score_mystery = round(score_mys_10 * 10, 2)

    db.commit()
    db.refresh(e)

    # Renvoyer aussi un PDV de remplacement si injoignable
    remplacement = None
    if call.statut == 'INJOIGNABLE':
        exclus_final = [c['numero_pdv'] for c in calls]
        nouveaux_r = svc.generer_pdvs_mystery(db, superviseur, 1, exclus_final)
        if nouveaux_r:
            remplacement = nouveaux_r[0]

    return {**_fmt(e), "pdv_remplacement": remplacement}


# ─── Saisir notes présentiel ──────────────────────────────────────────────────

@router.post("/eval-superviseurs/{superviseur}/presentiel")
def saisir_presentiel(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    notes: PresentielInput = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Saisit les notes de l'évaluation présentielle."""
    e = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).first()
    if not e:
        raise HTTPException(404, "Évaluation non trouvée.")

    e.note_maitrise_pdv = notes.note_maitrise_pdv
    e.note_maitrise_zone = notes.note_maitrise_zone
    moy = (notes.note_maitrise_pdv + notes.note_maitrise_zone) / 2
    e.score_presentiel = round(moy * 10, 2)

    db.commit()
    db.refresh(e)
    return _fmt(e)


# ─── Régénérer PDVs mystery (remplacement) ───────────────────────────────────

@router.post("/eval-superviseurs/{superviseur}/regenerer-mystery-pdv")
def regenerer_mystery_pdv(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    exclus: List[str] = Body(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Génère un PDV de remplacement pour les injoignables."""
    nouveaux = svc.generer_pdvs_mystery(db, superviseur, 1, exclus)
    return {"pdv": nouveaux[0] if nouveaux else None}


# ─── Régénérer PDVs présentiel ────────────────────────────────────────────────

@router.post("/eval-superviseurs/{superviseur}/regenerer-presentiel")
def regenerer_presentiel(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Regénère les PDVs pour le test présentiel."""
    e = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).first()
    if not e:
        raise HTTPException(404, "Évaluation non trouvée.")
    pdvs = svc.generer_pdvs_presentiel(db, superviseur, 5)
    e.pdvs_presentiel_generes = pdvs
    db.commit()
    return {"pdvs": pdvs}


# ─── Calculer le score final ──────────────────────────────────────────────────

@router.post("/eval-superviseurs/{superviseur}/calculer")
def calculer_score(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calcule/recalcule le score final de l'évaluation."""
    e = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).first()
    if not e:
        raise HTTPException(404, "Évaluation non trouvée.")

    result = svc.calculer_score_final(
        score_kpi=e.score_kpi or 0,
        mystery_calls=e.mystery_calls or [],
        note_maitrise_pdv=e.note_maitrise_pdv or 0,
        note_maitrise_zone=e.note_maitrise_zone or 0,
    )

    e.score_mystery = result['score_mystery']
    e.score_presentiel = result['score_presentiel']
    e.score_final = result['score_final']
    e.mention = result['mention']
    e.statut = 'TERMINEE'
    db.commit()
    db.refresh(e)
    return {**_fmt(e), "detail_calcul": result['detail']}


# ─── Classement tous superviseurs ─────────────────────────────────────────────

@router.post("/eval-superviseurs/lancer-tous")
def lancer_evaluation_tous(
    annee: int = Body(...),
    mois: int = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lance l'évaluation pour TOUS les superviseurs actifs en une fois (J-1)."""
    superviseurs = [s for s in svc.get_liste_superviseurs(db) if s and s != '#VALUE!']
    resultats = []
    for superviseur in superviseurs:
        try:
            kpis = svc.get_kpis_superviseur(db, superviseur, annee, mois)
            if kpis.get('nb_pdv', 0) < 5:
                continue  # Ignorer superviseurs avec moins de 5 PDVs
            pdvs_mystery = svc.generer_pdvs_mystery(db, superviseur, 5)
            pdvs_presentiel = svc.generer_pdvs_presentiel(db, superviseur, 5)

            existing = db.query(EvalSuperviseur).filter(
                EvalSuperviseur.superviseur == superviseur,
                EvalSuperviseur.annee == annee,
                EvalSuperviseur.mois == mois,
            ).first()

            if existing:
                existing.kpis_data = kpis
                existing.score_kpi = kpis['score_kpi_global']
                existing.pdvs_mystery_generes = pdvs_mystery
                existing.pdvs_presentiel_generes = pdvs_presentiel
                existing.statut = 'EN_COURS'
                existing.mystery_calls = []
                existing.note_maitrise_pdv = None
                existing.note_maitrise_zone = None
                existing.score_final = None
                existing.created_by = current_user.id
            else:
                db.add(EvalSuperviseur(
                    superviseur=superviseur, annee=annee, mois=mois,
                    kpis_data=kpis, score_kpi=kpis['score_kpi_global'],
                    pdvs_mystery_generes=pdvs_mystery,
                    pdvs_presentiel_generes=pdvs_presentiel,
                    mystery_calls=[], statut='EN_COURS',
                    created_by=current_user.id,
                ))
            resultats.append({"superviseur": superviseur, "nb_pdv_mystery": len(pdvs_mystery), "score_kpi": kpis['score_kpi_global']})
        except Exception as e:
            resultats.append({"superviseur": superviseur, "erreur": str(e)})

    db.commit()

    # Grouper les PDVs mystery par TC pour notification
    tc_listes = {}
    for r in resultats:
        if 'erreur' not in r:
            eval_obj = db.query(EvalSuperviseur).filter(
                EvalSuperviseur.superviseur == r['superviseur'],
                EvalSuperviseur.annee == annee,
                EvalSuperviseur.mois == mois,
            ).first()
            if eval_obj and eval_obj.pdvs_mystery_generes:
                for pdv in eval_obj.pdvs_mystery_generes:
                    tc = pdv.get('teleconseillere') or 'Non assignée'
                    if tc not in tc_listes:
                        tc_listes[tc] = []
                    tc_listes[tc].append({
                        "superviseur": r['superviseur'],
                        "pdv": pdv,
                    })

    return {
        "success": True,
        "nb_superviseurs": len(resultats),
        "nb_evalues": len([r for r in resultats if 'erreur' not in r]),
        "superviseurs": resultats,
        "tc_listes": tc_listes,  # Liste par TC des PDVs à appeler
    }


@router.get("/eval-superviseurs/ma-liste-mystery")
def ma_liste_mystery(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne la liste des PDVs à appeler pour la TC connectée."""
    # Construire le nom de la TC pour la recherche (nom seul suffit car unique)
    tc_nom = (current_user.nom or '').strip()
    tc_prenom = (current_user.prenom or '').strip()
    tc_full = f"{tc_prenom} {tc_nom}".strip().lower()
    tc_nom_lower = tc_nom.lower()

    # Chercher dans toutes les évaluations du mois
    evals = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
        EvalSuperviseur.statut == 'EN_COURS',
    ).all()

    ma_liste = []
    for e in evals:
        for pdv in (e.pdvs_mystery_generes or []):
            tc_pdv = (pdv.get('teleconseillere') or '').lower()
            # Correspondance flexible: nom seul OU nom complet
            if (tc_nom_lower and tc_nom_lower in tc_pdv) or \
               (tc_full and tc_full in tc_pdv) or \
               (tc_pdv and tc_pdv in tc_full):
                # Vérifier si déjà appelé
                call = next((c for c in (e.mystery_calls or []) if c['numero_pdv'] == pdv['numero_pdv']), None)
                ma_liste.append({
                    "superviseur": e.superviseur,
                    "pdv": pdv,
                    "statut_appel": call['statut'] if call else None,
                    "notes": call if call else None,
                    "eval_id": e.id,
                })

    return {"tc_nom": tc_nom, "total": len(ma_liste), "liste": ma_liste}


@router.get("/eval-superviseurs/classement/tous")
def classement_superviseurs(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Classement de tous les superviseurs évalués pour le mois."""
    evals = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
        EvalSuperviseur.score_final.isnot(None),
    ).order_by(EvalSuperviseur.score_final.desc()).all()

    return [
        {
            "rang": i + 1,
            "superviseur": e.superviseur,
            "score_final": e.score_final,
            "score_kpi": e.score_kpi,
            "score_mystery": e.score_mystery,
            "score_presentiel": e.score_presentiel,
            "mention": e.mention,
            "statut": e.statut,
        }
        for i, e in enumerate(evals)
    ]
