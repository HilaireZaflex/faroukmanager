"""
Routes API Appels TC — Suivi des appels téléphoniques des téléconseillères
Prefix: /api/appels-tc
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, extract
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.appel_tc import AppelTC, StatutAppel, IndicateurAppel, STATUT_LABELS
from app.models.tc_objectif import TcObjectif
from app.models.user import User
from app.models.pdv import PDV
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AppelCreate(BaseModel):
    numero_pdv: str
    nom_pdv: Optional[str] = None
    indicateur: Optional[IndicateurAppel] = None
    indicateurs: Optional[List[str]] = None      # appel « unifié » : plusieurs indicateurs à la fois
    statut: StatutAppel
    commentaire: Optional[str] = None
    date_rappel: Optional[date] = None


class ObjectifIn(BaseModel):
    tc_user_id: Optional[int] = None   # None => appliquer à TOUTES les téléconseillères
    annee: int
    mois: int
    objectif_appels: int = 0
    objectif_promesses: int = 0
    objectif_appels_jour: int = 0


# ─── Helper ───────────────────────────────────────────────────────────────────

VALID_INDICATEURS = ("OMY", "NAFAMA", "KAABU")


def _full_name(user: User) -> str:
    """Nom complet d'un compte utilisateur (repli sur l'email)."""
    return f"{user.prenom or ''} {user.nom or ''}".strip() or (user.email or "")


def _normalize_indicateurs(indicateurs, principal=None) -> list:
    """Liste des indicateurs valides, sans doublon et dans l'ordre reçu.

    Accepte une chaîne "OMY,NAFAMA" ou une liste, plus un indicateur principal optionnel.
    """
    valeurs = []
    if principal is not None:
        valeurs.append(principal.value if hasattr(principal, "value") else str(principal))
    if indicateurs:
        if isinstance(indicateurs, str):
            valeurs.extend(indicateurs.split(","))
        else:
            valeurs.extend(indicateurs)
    resultat = []
    for v in valeurs:
        v = (v or "").strip().upper()
        if v in VALID_INDICATEURS and v not in resultat:
            resultat.append(v)
    return resultat


def _fmt(a: AppelTC) -> dict:
    return {
        "id": a.id,
        "numero_pdv": a.numero_pdv,
        "nom_pdv": a.nom_pdv,
        "indicateur": a.indicateur.value if a.indicateur else None,
        "indicateurs": list(a.indicateurs) if a.indicateurs else ([a.indicateur.value] if a.indicateur else []),
        "tc_user_id": a.tc_user_id,
        "tc_nom": a.tc_nom,
        "statut": a.statut.value if a.statut else None,
        "statut_label": STATUT_LABELS.get(a.statut.value if a.statut else "", ""),
        "commentaire": a.commentaire,
        "date_rappel": a.date_rappel.isoformat() if a.date_rappel else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/appels-tc")
def create_appel(
    body: AppelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enregistrer un appel TC sur un PDV (un appel « unifié » = un seul enregistrement)."""
    inds = _normalize_indicateurs(body.indicateurs, body.indicateur)
    if not inds:
        raise HTTPException(400, "Au moins un indicateur valide est requis (OMY, NAFAMA ou KAABU)")

    tc_nom = _full_name(current_user)

    appel = AppelTC(
        numero_pdv=body.numero_pdv,
        nom_pdv=body.nom_pdv,
        indicateur=inds[0],
        indicateurs=inds,
        tc_user_id=current_user.id,
        tc_nom=tc_nom,
        statut=body.statut,
        commentaire=body.commentaire,
        date_rappel=body.date_rappel,
    )
    db.add(appel)
    db.commit()
    db.refresh(appel)

    # Envoyer une notification aux admins/RC
    try:
        from app.services.notification_service import send_notification
        statut_label = STATUT_LABELS.get(body.statut.value, body.statut.value)
        send_notification(
            db=db,
            title=f"📞 Appel TC — {body.numero_pdv}",
            message=f"{tc_nom} a appelé le PDV {body.nom_pdv or body.numero_pdv} [{', '.join(inds)}] : {statut_label}",
            target_roles=["ADMIN", "RC"],
        )
    except Exception:
        pass  # Notification non bloquante

    return _fmt(appel)


@router.get("/appels-tc")
def list_appels(
    numero_pdv: Optional[str] = Query(None),
    indicateur: Optional[str] = Query(None),
    tc_user_id: Optional[int] = Query(None, description="Filtrer sur un COMPTE téléconseillère précis"),
    mes_appels_seulement: bool = Query(False, description="Si True, retourne uniquement les appels de l'utilisateur connecté"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lister les appels TC — filtrable par PDV, indicateur, ou user."""
    q = db.query(AppelTC)

    if numero_pdv:
        q = q.filter(AppelTC.numero_pdv == numero_pdv)
    if indicateur:
        q = q.filter(AppelTC.indicateur == indicateur)
    if tc_user_id:
        q = q.filter(AppelTC.tc_user_id == tc_user_id)
    if mes_appels_seulement:
        q = q.filter(AppelTC.tc_user_id == current_user.id)

    total = q.count()
    items = q.order_by(desc(AppelTC.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_fmt(a) for a in items],
    }


@router.get("/appels-tc/pdv/{numero_pdv}")
def get_appels_pdv(
    numero_pdv: str,
    indicateur: Optional[str] = Query(None),
    mes_appels_seulement: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historique des appels TC pour un PDV spécifique."""
    q = db.query(AppelTC).filter(AppelTC.numero_pdv == numero_pdv)
    if indicateur:
        q = q.filter(AppelTC.indicateur == indicateur)
    if mes_appels_seulement:
        q = q.filter(AppelTC.tc_user_id == current_user.id)

    items = q.order_by(desc(AppelTC.created_at)).limit(50).all()
    return [_fmt(a) for a in items]


@router.get("/appels-tc/stats")
def get_appels_stats(
    indicateur: Optional[str] = Query(None),
    tc_user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statistiques des appels TC par statut."""
    q = db.query(AppelTC.statut, func.count(AppelTC.id).label("count"))
    if indicateur:
        q = q.filter(AppelTC.indicateur == indicateur)
    if tc_user_id:
        q = q.filter(AppelTC.tc_user_id == tc_user_id)

    rows = q.group_by(AppelTC.statut).all()
    return {
        "par_statut": [
            {
                "statut": r.statut.value,
                "label": STATUT_LABELS.get(r.statut.value, ""),
                "count": r.count,
            }
            for r in rows
        ],
        "total": sum(r.count for r in rows),
    }


@router.get("/appels-tc/dashboard-admin")
def get_dashboard_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dashboard admin complet : stats par TC, par statut, par indicateur, tendance."""
    from datetime import date, timedelta
    from sqlalchemy import cast, Date as SADate

    today = date.today()
    hier = today - timedelta(days=1)
    semaine = today - timedelta(days=7)
    mois = today - timedelta(days=30)

    # ── Stats globales ──
    total = db.query(func.count(AppelTC.id)).scalar()
    aujourd_hui = db.query(func.count(AppelTC.id)).filter(
        func.date(AppelTC.created_at) == today
    ).scalar()
    cette_semaine = db.query(func.count(AppelTC.id)).filter(
        AppelTC.created_at >= semaine
    ).scalar()
    ce_mois = db.query(func.count(AppelTC.id)).filter(
        AppelTC.created_at >= mois
    ).scalar()

    # ── Statuts positifs (joignable + promesse) ──
    positifs = db.query(func.count(AppelTC.id)).filter(
        AppelTC.statut.in_(["JOIGNABLE_PROMESSE", "JOIGNABLE_DEJA_ACTIF"])
    ).scalar()
    negatifs = db.query(func.count(AppelTC.id)).filter(
        AppelTC.statut.in_(["NON_JOIGNABLE_HORS_ZONE", "NON_JOIGNABLE_PAS_REPONSE", "PDV_FERME"])
    ).scalar()
    rappels_en_attente = db.query(func.count(AppelTC.id)).filter(
        AppelTC.statut == "RAPPEL_PROGRAMME",
        AppelTC.date_rappel <= today,
    ).scalar()

    # ── Par TC — regroupé par COMPTE utilisateur, en 3 requêtes (plus de N+1) ──
    POSITIFS = ("JOIGNABLE_PROMESSE", "JOIGNABLE_DEJA_ACTIF")

    par_tc_rows = db.query(
        AppelTC.tc_user_id,
        func.count(AppelTC.id).label("total"),
        func.max(AppelTC.created_at).label("dernier_appel"),
    ).group_by(AppelTC.tc_user_id).all()

    statuts_map = {}
    for uid, st, cnt in db.query(
        AppelTC.tc_user_id, AppelTC.statut, func.count(AppelTC.id)
    ).group_by(AppelTC.tc_user_id, AppelTC.statut).all():
        key = st.value if hasattr(st, "value") else str(st)
        statuts_map.setdefault(uid, {})[key] = int(cnt)

    auj_map = {uid: int(cnt) for uid, cnt in db.query(
        AppelTC.tc_user_id, func.count(AppelTC.id)
    ).filter(func.date(AppelTC.created_at) == today).group_by(AppelTC.tc_user_id).all()}

    # Nom canonique depuis le COMPTE utilisateur (le nom stocké sert de repli)
    users_map = {u.id: _full_name(u) for u in db.query(User).all()}
    nom_stocke = {uid: nom for uid, nom in db.query(
        AppelTC.tc_user_id, func.max(AppelTC.tc_nom)
    ).group_by(AppelTC.tc_user_id).all()}

    par_tc_detail = []
    for row in par_tc_rows:
        details = statuts_map.get(row.tc_user_id, {})
        total_tc = int(row.total or 0)
        positifs_tc = sum(details.get(s, 0) for s in POSITIFS)

        par_tc_detail.append({
            "tc_user_id": row.tc_user_id,
            "tc_nom": users_map.get(row.tc_user_id) or nom_stocke.get(row.tc_user_id) or f"Compte #{row.tc_user_id}",
            "total": total_tc,
            "positifs": positifs_tc,
            "taux_joignabilite": round(positifs_tc / total_tc * 100, 1) if total_tc else 0,
            "aujourd_hui": auj_map.get(row.tc_user_id, 0),
            "dernier_appel": row.dernier_appel.isoformat() if row.dernier_appel else None,
            "par_statut": details,
        })

    par_tc_detail.sort(key=lambda x: x["total"], reverse=True)

    # ── Par indicateur ──
    par_indicateur = db.query(
        AppelTC.indicateur, func.count(AppelTC.id).label("count")
    ).group_by(AppelTC.indicateur).all()

    # ── Par statut global ──
    par_statut = db.query(
        AppelTC.statut, func.count(AppelTC.id).label("count")
    ).group_by(AppelTC.statut).all()

    # ── Tendance 7 jours ──
    tendance = []
    for i in range(6, -1, -1):
        jour = today - timedelta(days=i)
        cnt = db.query(func.count(AppelTC.id)).filter(
            func.date(AppelTC.created_at) == jour
        ).scalar()
        tendance.append({
            "date": jour.isoformat(),
            "label": jour.strftime("%a %d"),
            "count": int(cnt or 0),
        })

    return {
        "global": {
            "total": int(total or 0),
            "aujourd_hui": int(aujourd_hui or 0),
            "cette_semaine": int(cette_semaine or 0),
            "ce_mois": int(ce_mois or 0),
            "positifs": int(positifs or 0),
            "negatifs": int(negatifs or 0),
            "rappels_en_attente": int(rappels_en_attente or 0),
            "taux_joignabilite": round(int(positifs or 0) / int(total) * 100, 1) if total else 0,
        },
        "par_tc": par_tc_detail,
        "par_indicateur": {r.indicateur.value: int(r.count) for r in par_indicateur if r.indicateur},
        "par_statut": [
            {"statut": r.statut.value, "label": STATUT_LABELS.get(r.statut.value, ""), "count": int(r.count)}
            for r in par_statut if r.statut
        ],
        "tendance_7j": tendance,
    }


@router.get("/tc/liste-unifiee")
def get_liste_unifiee(
    annee: int = Query(None),
    mois: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Liste unifiée d'appels TC : chaque PDV n'apparaît qu'une seule fois
    avec TOUTES ses alertes agrégées (OMY inactif, NAFAMA en baisse, KAABU inactif, etc.)
    Trié par score de priorité (plus critique en premier).
    """
    from datetime import date, timedelta
    from app.models.pdv import PDV
    from app.models.performance import MonthlyPerformance
    from app.models.nafama import NafamaTransaction
    from app.models.kaabu import KaabuTransaction
    from sqlalchemy import func

    today = date.today()
    if not annee:
        annee = today.year
    if not mois:
        mois = today.month

    # Mois précédent
    if mois == 1:
        mois_prec, annee_prec = 12, annee - 1
    else:
        mois_prec, annee_prec = mois - 1, annee

    MOIS_NOMS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

    # ── Appels déjà faits dans les 48h (cooldown) ──────────────────────────
    cooldown_limite = today - timedelta(hours=48)
    appels_recents = db.query(AppelTC.numero_pdv).filter(
        AppelTC.created_at >= cooldown_limite
    ).distinct().all()
    pdvs_en_cooldown = {r[0] for r in appels_recents}

    # ── PDVs ACTIFS de base ─────────────────────────────────────────────────
    pdv_query = db.query(PDV).filter(PDV.statut == 'ACTIF')
    # Construire le nom complet — essayer prénom+nom et nom+prénom
    nom_prenom = f"{current_user.prenom or ''} {current_user.nom or ''}".strip()
    prenom_nom = f"{current_user.nom or ''} {current_user.prenom or ''}".strip()
    nom_complet = nom_prenom  # format standard: FATOUMATA DOUMBIA
    # Rôle comparé SANS tenir compte de la casse ('TELECONSEILLERE' vs 'teleconseillere')
    role_norm = str(current_user.role or '').lower().replace('userrole.', '')
    if role_norm == 'superviseur' and nom_prenom:
        pdv_query = pdv_query.filter(or_(PDV.superviseur == nom_prenom, PDV.superviseur == prenom_nom))
    elif role_norm in ('teleconseillere', 'tc'):
        # Lien par COMPTE (fiable) OU par nom (repli)
        pdv_query = pdv_query.filter(or_(
            PDV.teleconseillere_user_id == current_user.id,
            PDV.teleconseillere == nom_prenom,
            PDV.teleconseillere == prenom_nom,
        ))
    pdvs = pdv_query.all()
    pdv_map = {p.numero_pdv: p for p in pdvs}

    # ── OMY : performances mensuelles ──────────────────────────────────────
    perfs_curr = {p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee, MonthlyPerformance.mois == mois).all()}
    perfs_prec = {p.pdv_id: p for p in db.query(MonthlyPerformance).filter(
        MonthlyPerformance.annee == annee_prec, MonthlyPerformance.mois == mois_prec).all()}
    pdv_id_to_num = {p.id: p.numero_pdv for p in pdvs}

    # ── NAFAMA : montants mensuels ──────────────────────────────────────────
    nafama_curr = {r.numero_pdv: int(r.total) for r in db.query(
        NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label('total')
    ).filter(NafamaTransaction.annee == annee, NafamaTransaction.mois == mois
    ).group_by(NafamaTransaction.numero_pdv).all()}
    nafama_prec = {r.numero_pdv: int(r.total) for r in db.query(
        NafamaTransaction.numero_pdv, func.sum(NafamaTransaction.montant).label('total')
    ).filter(NafamaTransaction.annee == annee_prec, NafamaTransaction.mois == mois_prec
    ).group_by(NafamaTransaction.numero_pdv).all()}

    # ── KAABU : transactions mensuelles (via semaines ISO) ─────────────────
    import calendar as cal_mod
    from datetime import timedelta as td
    def semaines_mois(an, mo):
        premier = date(an, mo, 1)
        dernier = date(an, mo, cal_mod.monthrange(an, mo)[1])
        sems = set()
        d = premier
        while d <= dernier:
            sems.add(f"S{d.isocalendar()[1]:02d}")
            d += td(days=7)
        return list(sems)
    sems_curr = semaines_mois(annee, mois)
    sems_prec = semaines_mois(annee_prec, mois_prec)
    kaabu_curr = {r.numero_pdv: int(r.total) for r in db.query(
        KaabuTransaction.numero_pdv, func.sum(KaabuTransaction.montant_cashout).label('total')
    ).filter(KaabuTransaction.annee == annee, KaabuTransaction.semaine.in_(sems_curr)
    ).group_by(KaabuTransaction.numero_pdv).all()}
    kaabu_prec = {r.numero_pdv: int(r.total) for r in db.query(
        KaabuTransaction.numero_pdv, func.sum(KaabuTransaction.montant_cashout).label('total')
    ).filter(KaabuTransaction.annee == annee_prec, KaabuTransaction.semaine.in_(sems_prec)
    ).group_by(KaabuTransaction.numero_pdv).all()}

    # ── Agréger les alertes par PDV ─────────────────────────────────────────
    resultats = []
    SEUIL_BAISSE = 0.20  # -20% = en baisse

    for num_pdv, pdv in pdv_map.items():
        if num_pdv in pdvs_en_cooldown:
            continue

        alertes = []
        score = 0

        # OMY
        pdv_id = pdv.id
        omy_curr = getattr(perfs_curr.get(pdv_id), 'montant_transaction', 0) or 0
        omy_prec = getattr(perfs_prec.get(pdv_id), 'montant_transaction', 0) or 0
        if omy_curr == 0 and omy_prec > 0:
            alertes.append({"indicateur": "OMY", "type": "INACTIF", "details": "0 transaction OMY ce mois", "couleur": "rouge", "score": 40})
            score += 40
        elif omy_curr > 0 and omy_prec > 0:
            var_omy = (omy_curr - omy_prec) / omy_prec
            if var_omy <= -SEUIL_BAISSE:
                alertes.append({"indicateur": "OMY", "type": "BAISSE", "details": f"Baisse OMY {round(var_omy*100)}% vs {MOIS_NOMS[mois_prec]}", "couleur": "orange", "score": 20})
                score += 20

        # NAFAMA
        naf_curr = nafama_curr.get(num_pdv, 0)
        naf_prec = nafama_prec.get(num_pdv, 0)
        if naf_curr == 0 and naf_prec > 0:
            alertes.append({"indicateur": "NAFAMA", "type": "INACTIF", "details": "0 transaction NAFAMA ce mois", "couleur": "rouge", "score": 35})
            score += 35
        elif naf_curr > 0 and naf_prec > 0:
            var_naf = (naf_curr - naf_prec) / naf_prec
            if var_naf <= -SEUIL_BAISSE:
                alertes.append({"indicateur": "NAFAMA", "type": "BAISSE", "details": f"Baisse NAFAMA {round(var_naf*100)}% vs {MOIS_NOMS[mois_prec]}", "couleur": "orange", "score": 15})
                score += 15

        # KAABU
        kaabu_c = kaabu_curr.get(num_pdv, 0)
        kaabu_p = kaabu_prec.get(num_pdv, 0)
        if kaabu_c == 0 and kaabu_p > 0:
            alertes.append({"indicateur": "KAABU", "type": "INACTIF", "details": "0 transaction KAABU ce mois", "couleur": "rouge", "score": 25})
            score += 25
        elif kaabu_c > 0 and kaabu_p > 0:
            var_kaabu = (kaabu_c - kaabu_p) / kaabu_p
            if var_kaabu <= -SEUIL_BAISSE:
                alertes.append({"indicateur": "KAABU", "type": "BAISSE", "details": f"Baisse KAABU {round(var_kaabu*100)}% vs {MOIS_NOMS[mois_prec]}", "couleur": "orange", "score": 10})
                score += 10

        if not alertes:
            continue

        # Dernier appel
        dernier_appel = db.query(AppelTC).filter(
            AppelTC.numero_pdv == num_pdv
        ).order_by(AppelTC.created_at.desc()).first()

        resultats.append({
            "numero_pdv":    num_pdv,
            "nom":           pdv.nom or num_pdv,
            "zone":          pdv.zone or "—",
            "sous_zone":     pdv.sous_zone or "—",
            "superviseur":   pdv.superviseur or "—",
            "teleconseillere": pdv.teleconseillere or "—",
            "telephone":     pdv.telephone or "—",
            "score":         score,
            "nb_alertes":    len(alertes),
            "alertes":       alertes,
            "omy_curr":      omy_curr,
            "omy_prec":      omy_prec,
            "nafama_curr":   naf_curr,
            "nafama_prec":   naf_prec,
            "kaabu_curr":    kaabu_c,
            "kaabu_prec":    kaabu_p,
            "dernier_appel": dernier_appel.created_at.strftime('%Y-%m-%d') if dernier_appel else None,
            "dernier_statut": dernier_appel.statut if dernier_appel else None,
            "en_cooldown":   False,
        })

    resultats.sort(key=lambda x: -x['score'])

    stats = {
        "total_pdvs":       len(resultats),
        "score_max":        max((r['score'] for r in resultats), default=0),
        "multi_alertes":    sum(1 for r in resultats if r['nb_alertes'] >= 2),
        "inactifs_omy":     sum(1 for r in resultats if any(a['indicateur']=='OMY' and a['type']=='INACTIF' for a in r['alertes'])),
        "inactifs_nafama":  sum(1 for r in resultats if any(a['indicateur']=='NAFAMA' and a['type']=='INACTIF' for a in r['alertes'])),
        "inactifs_kaabu":   sum(1 for r in resultats if any(a['indicateur']=='KAABU' and a['type']=='INACTIF' for a in r['alertes'])),
        "en_cooldown":      len(pdvs_en_cooldown),
        "mois":             MOIS_NOMS[mois],
        "annee":            annee,
    }

    return {"pdvs": resultats, "stats": stats}


@router.post("/tc/marquer-appele/{numero_pdv}")
def marquer_appele(
    numero_pdv: str,
    statut: str = Query(...),
    commentaire: str = Query(None),
    indicateurs: str = Query(""),  # "OMY,NAFAMA,KAABU"
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marquer un PDV comme appelé depuis la liste unifiée.

    Un appel « unifié » couvre plusieurs indicateurs mais compte pour UN SEUL appel.
    """
    from app.models.pdv import PDV

    try:
        statut_enum = StatutAppel(statut)
    except ValueError:
        raise HTTPException(400, f"Statut d'appel invalide : {statut}")

    inds = _normalize_indicateurs(indicateurs)
    if not inds:
        raise HTTPException(400, "Au moins un indicateur valide est requis (OMY, NAFAMA ou KAABU)")

    pdv = db.query(PDV).filter(PDV.numero_pdv == numero_pdv).first()
    nom_pdv = pdv.nom if pdv else numero_pdv

    appel = AppelTC(
        numero_pdv=numero_pdv,
        nom_pdv=nom_pdv,
        indicateur=inds[0],
        indicateurs=inds,
        tc_user_id=current_user.id,
        tc_nom=_full_name(current_user),
        statut=statut_enum,
        commentaire=commentaire,
    )
    db.add(appel)
    db.commit()
    db.refresh(appel)
    return {
        "success": True,
        "message": f"Appel enregistré pour {numero_pdv}",
        "appel_id": appel.id,
        "indicateurs": inds,
    }


@router.get("/appels-tc/suivi/par-tc")
def suivi_par_tc(
    annee: int = Query(None),
    mois: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suivi détaillé par TC : appels effectués, file unifiée, taux joignabilité."""
    from datetime import date
    from app.models.pdv import PDV
    from sqlalchemy import func

    today = date.today()
    if not annee: annee = today.year
    if not mois:  mois = today.month

    # Tous les appels du mois
    appels_mois = db.query(AppelTC).filter(
        func.extract('year', AppelTC.created_at) == annee,
        func.extract('month', AppelTC.created_at) == mois,
    ).all()

    # Grouper par COMPTE utilisateur (tc_user_id)
    from collections import defaultdict
    tc_stats = defaultdict(lambda: {
        'total': 0, 'joignables': 0, 'injoignables': 0,
        'promesses': 0, 'rappels': 0, 'par_indicateur': defaultdict(int),
        'derniere_activite': None, 'pdvs_appeles': set()
    })

    for a in appels_mois:
        uid = a.tc_user_id
        tc_stats[uid]['total'] += 1
        ind = a.indicateur.value if hasattr(a.indicateur, 'value') else (a.indicateur or 'AUTRE')
        tc_stats[uid]['par_indicateur'][ind] += 1
        tc_stats[uid]['pdvs_appeles'].add(a.numero_pdv)
        statut = a.statut.value if hasattr(a.statut, 'value') else str(a.statut or '')
        if statut in ('JOIGNABLE_PROMESSE', 'JOIGNABLE_PAS_INTERESSE', 'JOIGNABLE_DEJA_ACTIF'):
            tc_stats[uid]['joignables'] += 1
        elif 'NON_JOIGNABLE' in statut:
            tc_stats[uid]['injoignables'] += 1
        if statut == 'JOIGNABLE_PROMESSE':
            tc_stats[uid]['promesses'] += 1
        if statut == 'RAPPEL_PROGRAMME':
            tc_stats[uid]['rappels'] += 1
        if not tc_stats[uid]['derniere_activite'] or a.created_at > tc_stats[uid]['derniere_activite']:
            tc_stats[uid]['derniere_activite'] = a.created_at

    # PDVs assignés — par COMPTE, avec repli par nom tant que le lien n'est pas rempli
    pdvs_par_uid = {uid: int(nb) for uid, nb in db.query(
        PDV.teleconseillere_user_id, func.count(PDV.id)
    ).filter(PDV.statut == 'ACTIF', PDV.teleconseillere_user_id.isnot(None)
    ).group_by(PDV.teleconseillere_user_id).all()}

    pdvs_par_nom = {n: int(c) for n, c in db.query(
        PDV.teleconseillere, func.count(PDV.id)
    ).filter(PDV.statut == 'ACTIF', PDV.teleconseillere.isnot(None)
    ).group_by(PDV.teleconseillere).all()}

    # Noms canoniques depuis les COMPTES (repli : nom stocké sur l'appel)
    users_map = {u.id: _full_name(u) for u in db.query(User).all()}
    noms_stockes = {a.tc_user_id: a.tc_nom for a in appels_mois if a.tc_nom}

    result = []
    for uid, stats in tc_stats.items():
        nom = users_map.get(uid) or noms_stockes.get(uid) or f"Compte #{uid}"
        nb_pdvs = pdvs_par_uid.get(uid) or pdvs_par_nom.get(nom, 0)
        nb_appeles = len(stats['pdvs_appeles'])
        taux = round(stats['joignables'] / stats['total'] * 100) if stats['total'] > 0 else 0
        result.append({
            'tc_user_id': uid,
            'tc_nom': nom,
            'pdvs_assignes': nb_pdvs,
            'pdvs_appeles_mois': nb_appeles,
            'pdvs_restants': max(0, nb_pdvs - nb_appeles),
            'total_appels': stats['total'],
            'joignables': stats['joignables'],
            'injoignables': stats['injoignables'],
            'promesses': stats['promesses'],
            'rappels': stats['rappels'],
            'taux_joignabilite': taux,
            'par_indicateur': dict(stats['par_indicateur']),
            'derniere_activite': stats['derniere_activite'].strftime('%Y-%m-%d %H:%M') if stats['derniere_activite'] else None,
        })

    result.sort(key=lambda x: -x['total_appels'])
    return {'par_tc': result, 'annee': annee, 'mois': mois}


@router.get("/appels-tc/suivi/performance-mensuelle")
def performance_mensuelle(
    nb_mois: int = Query(6),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Performance mensuelle des TCs sur les N derniers mois."""
    from datetime import date
    from sqlalchemy import func
    from collections import defaultdict

    today = date.today()
    mois_list = []
    for i in range(nb_mois - 1, -1, -1):
        mo = (today.month - 1 - i) % 12 + 1
        an = today.year + ((today.month - 1 - i) // 12)
        if mo <= 0: mo += 12
        mois_list.append((an, mo))

    MOIS_NOMS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
    users_map = {u.id: _full_name(u) for u in db.query(User).all()}

    result = []
    for ann, mo in mois_list:
        appels = db.query(AppelTC).filter(
            func.extract('year', AppelTC.created_at) == ann,
            func.extract('month', AppelTC.created_at) == mo,
        ).all()
        tc_data = defaultdict(lambda: {'total': 0, 'joignables': 0, 'promesses': 0})
        for a in appels:
            # Rattachement au COMPTE utilisateur, avec repli sur le nom stocké
            nom = users_map.get(a.tc_user_id) or a.tc_nom or 'Inconnu'
            statut = a.statut.value if hasattr(a.statut, 'value') else str(a.statut or '')
            tc_data[nom]['total'] += 1
            if 'JOIGNABLE' in statut and 'NON' not in statut:
                tc_data[nom]['joignables'] += 1
            if statut == 'JOIGNABLE_PROMESSE':
                tc_data[nom]['promesses'] += 1
        result.append({
            'mois': f"{MOIS_NOMS[mo]} {ann}",
            'annee': ann, 'mois_num': mo,
            'total': len(appels),
            'par_tc': {nom: d for nom, d in tc_data.items()},
        })

    return {'historique': result}


@router.get("/tc/comptes")
def get_tc_comptes(
    annee: int = Query(None),
    mois: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste des COMPTES téléconseillères avec leur activité et leurs PDV affectés.

    C'est le lien explicite entre un appel et le COMPTE qui l'a effectué :
    les statistiques sont rattachées à `users.id`, pas à un nom écrit en texte.
    """
    today = date.today()
    if not annee:
        annee = today.year
    if not mois:
        mois = today.month

    # Comptes dont le rôle contient « teleconseill »
    comptes = [u for u in db.query(User).order_by(User.nom).all()
               if 'teleconseill' in str(u.role or '').lower()]

    # PDV affectés — par COMPTE, avec repli par nom tant que le lien n'est pas rempli
    pdvs_par_uid = {uid: int(nb) for uid, nb in db.query(
        PDV.teleconseillere_user_id, func.count(PDV.id)
    ).filter(PDV.statut == 'ACTIF', PDV.teleconseillere_user_id.isnot(None)
    ).group_by(PDV.teleconseillere_user_id).all()}

    pdvs_par_nom = {n: int(c) for n, c in db.query(
        PDV.teleconseillere, func.count(PDV.id)
    ).filter(PDV.statut == 'ACTIF', PDV.teleconseillere.isnot(None)
    ).group_by(PDV.teleconseillere).all()}

    # Activité du mois, par COMPTE
    agg = {}
    for uid, statut, created in db.query(
        AppelTC.tc_user_id, AppelTC.statut, AppelTC.created_at
    ).filter(
        extract('year', AppelTC.created_at) == annee,
        extract('month', AppelTC.created_at) == mois,
    ).all():
        d = agg.setdefault(uid, {'total': 0, 'joignables': 0, 'promesses': 0, 'dernier': None})
        d['total'] += 1
        sv = statut.value if hasattr(statut, 'value') else str(statut or '')
        if sv in ('JOIGNABLE_PROMESSE', 'JOIGNABLE_PAS_INTERESSE', 'JOIGNABLE_DEJA_ACTIF'):
            d['joignables'] += 1
        if sv == 'JOIGNABLE_PROMESSE':
            d['promesses'] += 1
        if created and (not d['dernier'] or created > d['dernier']):
            d['dernier'] = created

    resultat = []
    for u in comptes:
        nom = _full_name(u)
        a = agg.get(u.id, {})
        total = a.get('total', 0)
        joignables = a.get('joignables', 0)
        resultat.append({
            'tc_user_id': u.id,
            'tc_nom': nom,
            'email': u.email,
            'role': str(u.role),
            'is_active': bool(u.is_active),
            'pdvs_assignes': pdvs_par_uid.get(u.id) or pdvs_par_nom.get(nom, 0),
            'appels_mois': total,
            'joignables': joignables,
            'promesses': a.get('promesses', 0),
            'taux_joignabilite': round(joignables / total * 100, 1) if total else 0,
            'dernier_appel': a['dernier'].isoformat() if a.get('dernier') else None,
        })

    resultat.sort(key=lambda x: -x['appels_mois'])
    return {
        'comptes': resultat,
        'total_comptes': len(resultat),
        'annee': annee,
        'mois': mois,
    }


@router.get("/tc/mes-stats")
def get_mes_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statistiques PERSONNELLES de l'utilisateur connecté.

    Ne retourne que ses propres données : sert de vue personnelle aux téléconseillères.
    """
    today = date.today()
    annee, mois = today.year, today.month

    base = db.query(AppelTC).filter(AppelTC.tc_user_id == current_user.id)
    total = base.count()

    appels_mois = base.filter(
        extract('year', AppelTC.created_at) == annee,
        extract('month', AppelTC.created_at) == mois,
    ).all()

    def _sv(a):
        return a.statut.value if hasattr(a.statut, 'value') else str(a.statut or '')

    POSITIFS = ('JOIGNABLE_PROMESSE', 'JOIGNABLE_PAS_INTERESSE', 'JOIGNABLE_DEJA_ACTIF')
    joignables = sum(1 for a in appels_mois if _sv(a) in POSITIFS)
    promesses = sum(1 for a in appels_mois if _sv(a) == 'JOIGNABLE_PROMESSE')
    rappels = sum(1 for a in appels_mois if _sv(a) == 'RAPPEL_PROGRAMME')
    aujourd_hui = sum(1 for a in appels_mois if a.created_at and a.created_at.date() == today)

    par_indicateur, par_statut = {}, {}
    for a in appels_mois:
        ind = a.indicateur.value if hasattr(a.indicateur, 'value') else str(a.indicateur or 'AUTRE')
        par_indicateur[ind] = par_indicateur.get(ind, 0) + 1
        s = _sv(a)
        par_statut[s] = par_statut.get(s, 0) + 1

    pdvs_appeles = {a.numero_pdv for a in appels_mois}

    pdvs_assignes = db.query(func.count(PDV.id)).filter(
        PDV.statut == 'ACTIF',
        or_(
            PDV.teleconseillere_user_id == current_user.id,
            PDV.teleconseillere == _full_name(current_user),
            PDV.teleconseillere == f"{current_user.nom or ''} {current_user.prenom or ''}".strip(),
        ),
    ).scalar() or 0

    derniers = base.order_by(desc(AppelTC.created_at)).limit(10).all()

    return {
        "user": {"id": current_user.id, "nom": _full_name(current_user), "role": str(current_user.role)},
        "annee": annee,
        "mois": mois,
        "appels_total": int(total),
        "appels_mois": len(appels_mois),
        "appels_aujourd_hui": aujourd_hui,
        "joignables": joignables,
        "promesses": promesses,
        "rappels": rappels,
        "taux_joignabilite": round(joignables / len(appels_mois) * 100, 1) if appels_mois else 0,
        "pdvs_assignes": int(pdvs_assignes),
        "pdvs_appeles_mois": len(pdvs_appeles),
        "par_indicateur": par_indicateur,
        "par_statut": par_statut,
        "derniers_appels": [_fmt(a) for a in derniers],
    }


# ─── Objectifs des téléconseillères ───────────────────────────────────────────

def _require_objectif_manager(current_user: User):
    """La gestion des objectifs est réservée aux administrateurs, managers et RC."""
    role = str(current_user.role or '').lower().replace('userrole.', '')
    if role not in ('admin', 'manager', 'rc'):
        raise HTTPException(403, "Accès refusé : gestion des objectifs réservée aux administrateurs, managers et RC")


def _comptes_tc(db: Session) -> list:
    """Tous les comptes dont le rôle est téléconseillère."""
    return [u for u in db.query(User).order_by(User.nom).all()
            if 'teleconseill' in str(u.role or '').lower()]


def _realise_mois(db: Session, annee: int, mois: int) -> dict:
    """Réalisé par COMPTE pour un mois : appels, promesses, joignables, aujourd'hui."""
    from collections import defaultdict
    today = date.today()
    agg = defaultdict(lambda: {'appels': 0, 'promesses': 0, 'joignables': 0, 'aujourd_hui': 0})
    for uid, statut, created in db.query(
        AppelTC.tc_user_id, AppelTC.statut, AppelTC.created_at
    ).filter(
        extract('year', AppelTC.created_at) == annee,
        extract('month', AppelTC.created_at) == mois,
    ).all():
        d = agg[uid]
        d['appels'] += 1
        sv = statut.value if hasattr(statut, 'value') else str(statut or '')
        if sv in ('JOIGNABLE_PROMESSE', 'JOIGNABLE_PAS_INTERESSE', 'JOIGNABLE_DEJA_ACTIF'):
            d['joignables'] += 1
        if sv == 'JOIGNABLE_PROMESSE':
            d['promesses'] += 1
        if created and created.date() == today:
            d['aujourd_hui'] += 1
    return agg


@router.get("/tc/objectifs")
def get_objectifs(
    annee: int = Query(None),
    mois: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Objectifs et réalisé, par COMPTE téléconseillère, pour une période donnée."""
    today = date.today()
    if not annee:
        annee = today.year
    if not mois:
        mois = today.month

    objectifs = {
        o.tc_user_id: o for o in db.query(TcObjectif).filter(
            TcObjectif.annee == annee, TcObjectif.mois == mois
        ).all()
    }
    realise = _realise_mois(db, annee, mois)

    lignes = []
    for u in _comptes_tc(db):
        o = objectifs.get(u.id)
        r = realise.get(u.id, {}) or {}
        obj_appels = int(o.objectif_appels) if o else 0
        obj_promesses = int(o.objectif_promesses) if o else 0
        obj_jour = int(o.objectif_appels_jour) if o else 0
        appels = int(r.get('appels', 0))
        promesses = int(r.get('promesses', 0))
        auj = int(r.get('aujourd_hui', 0))

        lignes.append({
            'objectif_id': o.id if o else None,
            'tc_user_id': u.id,
            'tc_nom': _full_name(u),
            'email': u.email,
            'is_active': bool(u.is_active),
            'objectif_appels': obj_appels,
            'objectif_promesses': obj_promesses,
            'objectif_appels_jour': obj_jour,
            'appels_mois': appels,
            'promesses_mois': promesses,
            'joignables_mois': int(r.get('joignables', 0)),
            'appels_aujourd_hui': auj,
            'taux_realisation': round(appels / obj_appels * 100, 1) if obj_appels else 0,
            'taux_realisation_jour': round(auj / obj_jour * 100, 1) if obj_jour else 0,
            'taux_realisation_promesses': round(promesses / obj_promesses * 100, 1) if obj_promesses else 0,
        })

    lignes.sort(key=lambda x: (x['tc_nom'] or ''))
    return {'annee': annee, 'mois': mois, 'lignes': lignes}


@router.put("/tc/objectifs")
def set_objectif(
    body: ObjectifIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Créer ou mettre à jour l'objectif d'une TC.

    Si `tc_user_id` est absent, l'objectif est appliqué à TOUTES les téléconseillères.
    """
    _require_objectif_manager(current_user)

    if body.mois < 1 or body.mois > 12:
        raise HTTPException(400, "Le mois doit être compris entre 1 et 12")

    if body.tc_user_id:
        cibles = [u for u in _comptes_tc(db) if u.id == body.tc_user_id]
        if not cibles:
            raise HTTPException(404, "Compte téléconseillère introuvable")
    else:
        cibles = _comptes_tc(db)
        if not cibles:
            raise HTTPException(404, "Aucun compte téléconseillère")

    for u in cibles:
        o = db.query(TcObjectif).filter(
            TcObjectif.tc_user_id == u.id,
            TcObjectif.annee == body.annee,
            TcObjectif.mois == body.mois,
        ).first()
        if o is None:
            o = TcObjectif(tc_user_id=u.id, annee=body.annee, mois=body.mois)
            db.add(o)
        o.objectif_appels = max(0, int(body.objectif_appels or 0))
        o.objectif_promesses = max(0, int(body.objectif_promesses or 0))
        o.objectif_appels_jour = max(0, int(body.objectif_appels_jour or 0))
    db.commit()

    return {
        'success': True,
        'mis_a_jour': len(cibles),
        'annee': body.annee,
        'mois': body.mois,
        'toutes_les_tc': not bool(body.tc_user_id),
    }


@router.delete("/tc/objectifs/{objectif_id}")
def delete_objectif(
    objectif_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer un objectif (administrateur, manager ou RC)."""
    _require_objectif_manager(current_user)
    o = db.query(TcObjectif).filter(TcObjectif.id == objectif_id).first()
    if not o:
        raise HTTPException(404, "Objectif introuvable")
    db.delete(o)
    db.commit()
    return {'success': True}


@router.delete("/appels-tc/{appel_id}")
def delete_appel(
    appel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer un appel TC (admin ou auteur uniquement)."""
    role = (current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)).upper()
    appel = db.query(AppelTC).filter(AppelTC.id == appel_id).first()
    if not appel:
        raise HTTPException(404, "Appel non trouvé")
    if role not in ("ADMIN", "RC") and appel.tc_user_id != current_user.id:
        raise HTTPException(403, "Non autorisé")
    db.delete(appel)
    db.commit()
    return {"success": True}
