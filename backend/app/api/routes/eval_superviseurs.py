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

@router.post("/eval-superviseurs/calculer-tous")
def calculer_tous_scores(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calcule automatiquement les scores de TOUS les superviseurs pour le mois donné."""
    from app.models.eval_superviseur import EvalSuperviseur

    # Récupérer tous les superviseurs ayant une évaluation ce mois
    evals = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).all()

    resultats = []
    erreurs = []
    for e in evals:
        try:
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
            e.statut = 'SCORE_CALCULE'
            db.add(e)
            resultats.append({"superviseur": e.superviseur, "score": result['score_final'], "mention": result['mention']})
        except Exception as ex:
            erreurs.append({"superviseur": e.superviseur, "erreur": str(ex)[:100]})

    db.commit()

    return {
        "success": True,
        "calcules": len(resultats),
        "erreurs": len(erreurs),
        "resultats": resultats,
        "erreurs_detail": erreurs,
    }


@router.get("/eval-superviseurs/{superviseur}/commentaires")
def get_commentaires(superviseur: str, annee: int = Query(...), mois: int = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Retourne les commentaires de l'évaluation d'un superviseur."""
    from app.models.eval_superviseur import EvalSuperviseur
    e = db.query(EvalSuperviseur).filter(EvalSuperviseur.superviseur == superviseur, EvalSuperviseur.annee == annee, EvalSuperviseur.mois == mois).first()
    if not e: return []
    comments = getattr(e, 'commentaires', None) or []
    if isinstance(comments, str):
        import json
        try: comments = json.loads(comments)
        except: comments = []
    return comments

@router.post("/eval-superviseurs/{superviseur}/commentaires")
def add_commentaire(superviseur: str, payload: dict = Body(default={}), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Ajoute un commentaire à l'évaluation d'un superviseur."""
    from app.models.eval_superviseur import EvalSuperviseur
    from sqlalchemy import text
    import json
    from datetime import datetime
    annee = payload.get("annee")
    mois = payload.get("mois")
    commentaire = payload.get("commentaire", "").strip()
    type_com = payload.get("type", "SUPERVISEUR")
    if not commentaire: raise HTTPException(400, "Commentaire vide")
    e = db.query(EvalSuperviseur).filter(EvalSuperviseur.superviseur == superviseur, EvalSuperviseur.annee == annee, EvalSuperviseur.mois == mois).first()
    if not e: raise HTTPException(404, "Évaluation non trouvée")
    comments = getattr(e, 'commentaires', None) or []
    if isinstance(comments, str):
        try: comments = json.loads(comments)
        except: comments = []
    comments.append({"type": type_com, "commentaire": commentaire, "date": datetime.now().strftime("%d/%m/%Y"), "auteur": f"{current_user.prenom} {current_user.nom}".strip()})
    db.execute(text("UPDATE eval_superviseurs SET commentaires = :c WHERE id = :id"), {"c": json.dumps(comments, ensure_ascii=False), "id": e.id})
    db.commit()
    return {"success": True, "total": len(comments)}


@router.get("/eval-superviseurs/{superviseur}/historique")
def historique_superviseur(
    superviseur: str,
    nb_mois: int = Query(6),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne l'évolution des scores sur les N derniers mois pour un superviseur."""
    from app.models.eval_superviseur import EvalSuperviseur
    from datetime import date

    evals = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.score_final.isnot(None),
    ).order_by(EvalSuperviseur.annee.desc(), EvalSuperviseur.mois.desc()).limit(nb_mois).all()

    MOIS_NOMS = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
    result = []
    for e in reversed(evals):
        result.append({
            "mois": e.mois,
            "annee": e.annee,
            "label": f"{MOIS_NOMS[e.mois]} {e.annee}",
            "score_final": round(e.score_final, 1),
            "score_kpi": round(e.score_kpi or 0, 1),
            "score_mystery": round(e.score_mystery or 0, 1),
            "score_presentiel": round(e.score_presentiel or 0, 1),
            "mention": e.mention or _mention(e.score_final),
        })
    return {"superviseur": superviseur, "historique": result}


@router.get("/eval-superviseurs/classement-global")
def classement_global(
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne le classement de TOUS les superviseurs ayant validé leur évaluation (score_final calculé)."""
    from app.models.eval_superviseur import EvalSuperviseur
    # Tous les superviseurs avec un score_final calculé pour cette période
    evals = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
        EvalSuperviseur.score_final.isnot(None),
    ).order_by(EvalSuperviseur.score_final.desc()).all()

    # Objectifs de validation — critères obligatoires
    OBJECTIFS_VALIDATION = {
        "nb_pdv": 30,           # Minimum 30 PDVs
        "taux_actif_omy": 90,   # Actif OMY >= 90%
    }

    result = []
    non_valides = []
    for e in evals:
        kpis = getattr(e, 'kpis_data', {}) or {}
        if isinstance(kpis, str):
            import json
            try: kpis = json.loads(kpis)
            except: kpis = {}

        objectifs = kpis.get('objectifs', {}) if isinstance(kpis, dict) else {}
        realise = kpis if isinstance(kpis, dict) else {}

        # Vérifier les critères de validation
        # Récupérer les valeurs réelles — chercher tous les noms de champs possibles
        nb_pdv = realise.get('nb_pdv') or realise.get('nb_pdvs') or 0
        taux_actif_omy = realise.get('taux_actif_omy') or 0
        ca_omy = realise.get('montant_transactions') or realise.get('ca_omy') or 0
        commission = realise.get('commission_totale') or realise.get('commission_omy') or 0
        taux_km = realise.get('taux_actif_km') or realise.get('taux_actif_kaabu') or 0
        taux_nafama = realise.get('taux_actif_nafama') or 0
        ca_nafama = realise.get('ca_nafama') or realise.get('montant_vente_nafama') or 0

        # Objectifs — si None ou 0, la condition ne peut pas être vérifiée (on rejette par sécurité)
        obj_ca_omy = objectifs.get('montant_transactions') or objectifs.get('ca_omy') or None
        obj_commission = objectifs.get('commission_totale') or None
        # Objectifs fixés par Farouk Distribution
        obj_km = 80          # Taux Actif KM >= 80%
        obj_nafama_taux = 80 # Taux Actif NAFAMA >= 80%

        # Superviseurs exclus manuellement (cas isolés)
        EXCLUS = ['MAKAN DEMBELE']
        if e.superviseur in EXCLUS:
            raisons_rejet = [f"Cas isolé — exclu manuellement"]
            non_valides.append({"superviseur": e.superviseur, "score_final": round(e.score_final, 1), "mention": e.mention or _mention(e.score_final), "score_kpi": round(e.score_kpi or 0, 1), "score_mystery": round(e.score_mystery or 0, 1), "score_presentiel": round(e.score_presentiel or 0, 1), "zone": getattr(e, 'zone', None), "nb_pdv": nb_pdv, "raisons_rejet": raisons_rejet})
            continue
        obj_ca_nafama = objectifs.get('ca_nafama') or objectifs.get('montant_vente_nafama') or None

        raisons_rejet = []
        if nb_pdv < 30:
            raisons_rejet.append(f"NB PDV: {nb_pdv} < 30")
        if taux_actif_omy < 90:
            raisons_rejet.append(f"Actif OMY: {taux_actif_omy:.1f}% < 90%")
        if obj_ca_omy is not None and ca_omy < obj_ca_omy:
            raisons_rejet.append(f"CA OMY: {int(ca_omy):,} < objectif {int(obj_ca_omy):,}")
        if obj_commission is not None and commission < obj_commission:
            raisons_rejet.append(f"Commission: {int(commission):,} < objectif {int(obj_commission):,}")
        if taux_km < obj_km:
            raisons_rejet.append(f"Taux KM: {taux_km:.1f}% < {obj_km}%")
        if taux_nafama < obj_nafama_taux:
            raisons_rejet.append(f"Taux NAFAMA: {taux_nafama:.1f}% < {obj_nafama_taux}%")
        if obj_ca_nafama is not None and ca_nafama < obj_ca_nafama:
            raisons_rejet.append(f"CA NAFAMA: {int(ca_nafama):,} < objectif {int(obj_ca_nafama):,}")

        info = {
            "superviseur": e.superviseur,
            "score_final": round(e.score_final, 1),
            "mention": e.mention or _mention(e.score_final),
            "score_kpi": round(e.score_kpi or 0, 1),
            "score_mystery": round(e.score_mystery or 0, 1),
            "score_presentiel": round(e.score_presentiel or 0, 1),
            "zone": getattr(e, 'zone', None),
            # KPIs détaillés pour le rapport
            "nb_pdv": nb_pdv,
            "ca_omy": round(ca_omy) if ca_omy else None,
            "commission": round(commission) if commission else None,
            "actif_omy": round(taux_actif_omy, 1) if taux_actif_omy else None,
            "taux_km": round(taux_km, 1) if taux_km else None,
            "taux_nafama": round(taux_nafama, 1) if taux_nafama else None,
            "ca_nafama": round(ca_nafama) if ca_nafama else None,
            "raisons_rejet": raisons_rejet,
        }

        if not raisons_rejet:
            result.append(info)
        else:
            non_valides.append(info)

    # Trier par score final décroissant + numéroter
    result = sorted(result, key=lambda x: x['score_final'], reverse=True)
    for i, r in enumerate(result, 1):
        r['rang'] = i

    return {
        "total": len(result),
        "total_non_valides": len(non_valides),
        "annee": annee,
        "mois": mois,
        "classement": result,
        "non_valides": non_valides,
    }

def _mention(score):
    if score is None: return '—'
    if score >= 90: return '🏆 Excellent'
    if score >= 80: return '⭐ Très Bien'
    if score >= 70: return '👍 Bien'
    if score >= 60: return '💪 Assez Bien'
    if score >= 50: return '⚠️ Passable'
    return '🔴 Insuffisant'


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
        EvalSuperviseur.statut.in_(['EN_COURS', 'SCORE_CALCULE']),
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


@router.get("/eval-superviseurs/{superviseur}/pdv-details")
def get_pdv_details(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne les PDV inactifs et en baisse de CA pour le superviseur (OMY, NAFAMA, KAABU)."""
    from app.models.pdv import PDV
    from app.models.performance import MonthlyPerformance

    # Trouver le mois précédent pour comparer
    mois_prec = mois - 1 if mois > 1 else 12
    annee_prec = annee if mois > 1 else annee - 1

    # PDVs du superviseur
    pdvs = db.query(PDV).filter(
        PDV.superviseur.ilike(f"%{superviseur}%")
    ).all()
    pdv_ids = [p.id for p in pdvs]

    if not pdv_ids:
        return {"omy": {"inactifs": [], "en_baisse": []}, "nafama": {"inactifs": [], "en_baisse": []}, "kaabu": {"inactifs": [], "en_baisse": []}}

    # Performances par indicateur (OMY, NAFAMA, KAABU)
    def get_perfs_by_indicateur(indicateur_val):
        return {
            p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
                MonthlyPerformance.pdv_id.in_(pdv_ids),
                MonthlyPerformance.annee == annee,
                MonthlyPerformance.mois == mois,
                MonthlyPerformance.indicateur == indicateur_val,
            ).all()
        }

    perfs_omy = get_perfs_by_indicateur('OMY')
    perfs_nafama = get_perfs_by_indicateur('NAFAMA')
    perfs_kaabu = get_perfs_by_indicateur('KAABU')

    def pdv_info(pdv, perf):
        ca_act = perf.montant_ca if perf else None
        ca_prev = perf.ca_mois_precedent if perf else None
        taux_var = perf.taux_variation if perf else None
        return {
            "id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "quartier": pdv.quartier or '—',
            "teleconseillere": pdv.teleconseillere or '—',
            "ca_actuel": round(ca_act) if ca_act else None,
            "ca_precedent": round(ca_prev) if ca_prev else None,
            "variation_pct": round(taux_var, 1) if taux_var is not None else None,
        }

    result = {"omy": {"inactifs": [], "en_baisse": []},
              "nafama": {"inactifs": [], "en_baisse": []},
              "kaabu": {"inactifs": []}}

    for pdv in pdvs:
        # OMY
        perf_omy = perfs_omy.get(pdv.id)
        if perf_omy:
            if not perf_omy.est_actif:
                result["omy"]["inactifs"].append(pdv_info(pdv, perf_omy))
            elif perf_omy.taux_variation is not None and perf_omy.taux_variation < -30:
                result["omy"]["en_baisse"].append(pdv_info(pdv, perf_omy))

        # NAFAMA
        perf_naf = perfs_nafama.get(pdv.id)
        if perf_naf:
            if not perf_naf.est_actif:
                result["nafama"]["inactifs"].append(pdv_info(pdv, perf_naf))
            elif perf_naf.taux_variation is not None and perf_naf.taux_variation < -30:
                result["nafama"]["en_baisse"].append(pdv_info(pdv, perf_naf))

        # KAABU
        perf_kaabu = perfs_kaabu.get(pdv.id)
        if perf_kaabu and not perf_kaabu.est_actif:
            result["kaabu"]["inactifs"].append(pdv_info(pdv, perf_kaabu))

    return result


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
    e.statut = 'SCORE_CALCULE'
    db.commit()
    db.refresh(e)
    return {**_fmt(e), "detail_calcul": result['detail']}


@router.patch("/eval-superviseurs/{superviseur}/valider")
def valider_evaluation(
    superviseur: str,
    annee: int = Query(...),
    mois: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Valide l'évaluation et marque le superviseur comme TERMINEE."""
    e = db.query(EvalSuperviseur).filter(
        EvalSuperviseur.superviseur == superviseur,
        EvalSuperviseur.annee == annee,
        EvalSuperviseur.mois == mois,
    ).first()
    if not e:
        raise HTTPException(404, "Évaluation non trouvée.")
    
    if e.score_final is None:
        raise HTTPException(400, "Impossible de valider : le score n'a pas encore été calculé.")
    
    e.statut = 'TERMINEE'
    db.commit()
    db.refresh(e)
    return {**_fmt(e)}


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
        EvalSuperviseur.statut.in_(['EN_COURS', 'SCORE_CALCULE']),
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
