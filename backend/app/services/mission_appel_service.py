"""
Service « Missions d'appels » (Phase 1).

L'encadrement (Admin, RC, Manager, Responsable Conformité, Responsable Produit
& Qualité) compose une mission : titre, consigne, cible, objectifs, échéance.
Le service construit la liste des cibles (PDV et/ou personnes), l'attribue aux
téléconseillères, puis suit l'avancement à partir du journal `appels_tc`.

Règle de lecture : les informations d'affichage (nom, quartier, superviseur,
téléphone) sont relues depuis `pdvs` / `users` — jamais recopiées — pour rester
justes après une correction dans « Points de vente ».
"""
from __future__ import annotations

from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.mission_appel import (
    MissionAppel, MissionCible,
    TypeMission, PrioriteMission, StatutMission, CibleType, StatutCible,
    TYPE_MISSION_LABELS, PRIORITE_LABELS, STATUT_MISSION_LABELS,
)
from app.models.pdv import PDV
from app.models.user import User
from app.models.performance import MonthlyPerformance
from app.models.appel_tc import AppelTC, StatutAppel, STATUT_LABELS


# ─────────────────────────────────────────────────────────────────────────────
# RÔLES AUTORISÉS À CRÉER / PILOTER UNE MISSION
# ─────────────────────────────────────────────────────────────────────────────
ROLES_CREATEURS = {
    "admin",
    "rc",
    "manager",
    "conformite",
    "responsable_produit_et_qualit_oprationnelle_",
    "responsable_produit_et_qualite_operationnelle",
}

# Statuts d'appel considérés comme « PDV joint »
STATUTS_JOIGNABLES = {
    StatutAppel.JOIGNABLE_PROMESSE.value,
    StatutAppel.JOIGNABLE_PAS_INTERESSE.value,
    StatutAppel.JOIGNABLE_DEJA_ACTIF.value,
    StatutAppel.RAPPEL_PROGRAMME.value,
}


def normalise_role(user: Optional[User]) -> str:
    if user is None:
        return ""
    return str(getattr(user, "role", "") or "").lower().strip()


def peut_creer(user: Optional[User]) -> bool:
    return normalise_role(user) in ROLES_CREATEURS


def exige_createur(user: Optional[User]) -> None:
    if not peut_creer(user):
        raise HTTPException(403, "Seuls l'Admin, le RC, le Manager, la Conformité et le "
                                 "Responsable Produit & Qualité peuvent gérer les missions d'appels.")


def _nom_complet(u: Optional[User]) -> str:
    if u is None:
        return ""
    return f"{u.prenom or ''} {u.nom or ''}".strip() or (u.email or "")


# ─────────────────────────────────────────────────────────────────────────────
# LECTURE DE LA GÉOGRAPHIE / DES CONTACTS (sources de vérité)
# ─────────────────────────────────────────────────────────────────────────────

def _infos_pdv(db: Session, numeros: List[str]) -> Dict[str, Dict[str, Any]]:
    """Nom, quartier, zone, superviseur, gestionnaire, téléphone ACTUELS."""
    nums = [str(n) for n in numeros if n]
    if not nums:
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for p in db.query(PDV).filter(PDV.numero_pdv.in_(nums)).all():
        out[str(p.numero_pdv)] = {
            "pdv_id": p.id,
            "nom": p.nom,
            "numero_pdv": p.numero_pdv,
            "quartier": p.quartier,
            "zone": p.zone,
            "sous_zone": p.sous_zone,
            "superviseur": p.superviseur,
            "gestionnaire": p.gestionnaire,
            "teleconseillere": p.teleconseillere,
            "telephone": p.telephone,
        }
    return out


def _infos_personnes(db: Session, user_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    ids = [int(i) for i in user_ids if i]
    if not ids:
        return {}
    out: Dict[int, Dict[str, Any]] = {}
    for u in db.query(User).filter(User.id.in_(ids)).all():
        out[u.id] = {
            "user_id": u.id,
            "nom": _nom_complet(u),
            "role": normalise_role(u),
            "telephone": u.telephone,
            "zone": u.zone,
        }
    return out


# ─────────────────────────────────────────────────────────────────────────────
# DÉTECTION DES SITUATIONS (motif de sélection d'un PDV)
# ─────────────────────────────────────────────────────────────────────────────
SITUATION_LABELS = {
    "OMY_INACTIF":     "OMY inactif",
    "OMY_BAISSE":      "OMY en baisse",
    "NAFAMA_INACTIF":  "NAFAMA inactif",
    "NAFAMA_BAISSE":   "NAFAMA en baisse",
    "KAABU_INACTIF":   "KAABU inactif",
    "JAMAIS_APPELE":   "Jamais appelé",
    "PAS_APPELE_DEPUIS": "Pas appelé récemment",
}


def _situations_par_pdv(db: Session, pdv_par_id: Dict[int, str],
                        annee: int, mois: int,
                        jours_sans_appel: Optional[int] = None) -> Dict[int, List[str]]:
    """Pour chaque PDV : la liste des constats détectés (sert de motif).

    `pdv_par_id` : {pdv_id: numero_pdv}
    """
    res: Dict[int, List[str]] = {pid: [] for pid in pdv_par_id}
    if not pdv_par_id:
        return res

    perfs = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id.in_(list(pdv_par_id.keys())),
        MonthlyPerformance.annee == annee,
        MonthlyPerformance.mois == mois,
        MonthlyPerformance.indicateur.in_(['OMY', 'NAFAMA', 'KAABU']),
    ).all()
    for p in perfs:
        ind = (p.indicateur or 'OMY').upper()
        if not p.est_actif:
            res.setdefault(p.pdv_id, []).append(f"{ind}_INACTIF")
        elif p.taux_variation is not None and p.taux_variation <= -30:
            res.setdefault(p.pdv_id, []).append(f"{ind}_BAISSE")

    # Dernier appel connu par numéro de PDV
    numeros = [str(n) for n in pdv_par_id.values() if n]
    derniers = dict(
        db.query(AppelTC.numero_pdv, func.max(AppelTC.created_at))
        .filter(AppelTC.numero_pdv.in_(numeros))
        .group_by(AppelTC.numero_pdv).all()
    ) if numeros else {}
    limite = None
    if jours_sans_appel:
        limite = datetime.utcnow() - timedelta(days=int(jours_sans_appel))

    for pid, numero in pdv_par_id.items():
        last = derniers.get(str(numero)) if numero else None
        if last is None:
            res.setdefault(pid, []).append("JAMAIS_APPELE")
        elif limite is not None and last < limite:
            res.setdefault(pid, []).append("PAS_APPELE_DEPUIS")
    return res


def _libelles_situations(codes: List[str], taux: Dict[str, Any] | None = None) -> List[str]:
    out = []
    for c in codes:
        lab = SITUATION_LABELS.get(c, c)
        if taux and c.endswith("_BAISSE"):
            v = taux.get(c.split("_")[0])
            if v is not None:
                lab = f"{lab} ({v:+.0f}%)"
        out.append(lab)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# SÉLECTION DES CIBLES
# ─────────────────────────────────────────────────────────────────────────────

def _pdvs_candidats(db: Session, filtres: Dict[str, Any]) -> List[PDV]:
    q = db.query(PDV)
    statuts = filtres.get("statuts_pdv") or ["ACTIF"]
    if statuts:
        q = q.filter(PDV.statut.in_(statuts))
    if filtres.get("superviseurs"):
        q = q.filter(PDV.superviseur.in_(filtres["superviseurs"]))
    if filtres.get("gestionnaires"):
        q = q.filter(PDV.gestionnaire.in_(filtres["gestionnaires"]))
    if filtres.get("zones"):
        q = q.filter(PDV.zone.in_(filtres["zones"]))
    if filtres.get("sous_zones"):
        q = q.filter(PDV.sous_zone.in_(filtres["sous_zones"]))
    if filtres.get("quartiers"):
        q = q.filter(PDV.quartier.in_(filtres["quartiers"]))
    if filtres.get("numeros_inclus"):
        q = q.filter(PDV.numero_pdv.in_([str(n) for n in filtres["numeros_inclus"]]))
    return q.all()


def _users_candidats(db: Session, filtres: Dict[str, Any]) -> List[User]:
    q = db.query(User).filter(User.is_active == True)  # noqa: E712
    if filtres.get("user_ids"):
        return q.filter(User.id.in_([int(i) for i in filtres["user_ids"]])).all()
    roles = filtres.get("roles_personnes")
    if roles:
        q = q.filter(func.lower(User.role).in_([str(r).lower() for r in roles]))
    else:
        # Par défaut : l'encadrement terrain, jamais les TC (ce sont les exécutantes)
        q = q.filter(func.lower(User.role).in_(["superviseur", "gestionnaire"]))
    return q.all()


def _mode_cible(filtres: Dict[str, Any]) -> str:
    """PDV (défaut) · PERSONNE · MIXTE."""
    mode = str(filtres.get("mode") or "").upper()
    if mode in ("PDV", "PERSONNE", "MIXTE"):
        return mode
    return "MIXTE" if filtres.get("inclure_personnes") else "PDV"


def apercu_cibles(db: Session, filtres: Dict[str, Any],
                  annee: Optional[int] = None, mois: Optional[int] = None) -> Dict[str, Any]:
    """Aperçu (avant création) : combien de cibles et lesquelles."""
    filtres = filtres or {}
    aujourdhui = date.today()
    annee = annee or aujourdhui.year
    mois = mois or aujourdhui.month

    cibles: List[Dict[str, Any]] = []
    mode = _mode_cible(filtres)

    # ── Cibles PDV ──
    pdvs = _pdvs_candidats(db, filtres) if mode in ("PDV", "MIXTE") else []
    infos = _infos_pdv(db, [p.numero_pdv for p in pdvs])
    sit = _situations_par_pdv(db, {p.id: p.numero_pdv for p in pdvs},
                              annee, mois, filtres.get("jours_sans_appel"))

    voulues = filtres.get("situations") or []
    for p in pdvs:
        codes = sit.get(p.id, [])
        if voulues and not any(c in codes for c in voulues):
            continue
        d = infos.get(str(p.numero_pdv), {})
        cibles.append({
            "type_cible": "PDV",
            "pdv_id": p.id,
            "pdv_numero": p.numero_pdv,
            "nom": d.get("nom") or p.nom,
            "quartier": d.get("quartier"),
            "zone": d.get("zone"),
            "superviseur": d.get("superviseur"),
            "gestionnaire": d.get("gestionnaire"),
            "telephone": d.get("telephone"),
            "motif": " · ".join(_libelles_situations(codes)) or "Sélection manuelle",
            "situation": codes[0] if codes else None,
            "situations": codes,
        })

    # ── Cibles PERSONNE ──
    if mode in ("PERSONNE", "MIXTE"):
        for u in _users_candidats(db, filtres):
            cibles.append({
                "type_cible": "PERSONNE",
                "target_user_id": u.id,
                "nom": _nom_complet(u),
                "role": normalise_role(u),
                "zone": u.zone,
                "telephone": u.telephone,
                "motif": "Appel direct à la personne",
                "situation": None,
                "situations": [],
            })

    return {
        "total": len(cibles),
        "total_pdv": sum(1 for c in cibles if c["type_cible"] == "PDV"),
        "total_personnes": sum(1 for c in cibles if c["type_cible"] == "PERSONNE"),
        "sans_telephone": sum(1 for c in cibles if not c.get("telephone")),
        "mode": mode,
        "cibles": cibles,
        "annee": annee,
        "mois": mois,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CRÉATION / MODIFICATION
# ─────────────────────────────────────────────────────────────────────────────

def _enum_ou_defaut(enum_cls, valeur, defaut):
    if valeur is None or valeur == "":
        return defaut
    if isinstance(valeur, enum_cls):
        return valeur
    try:
        return enum_cls(str(valeur).upper())
    except ValueError:
        try:
            return enum_cls(valeur)
        except ValueError:
            return defaut


def creer_mission(db: Session, payload: Dict[str, Any], user: User) -> MissionAppel:
    exige_createur(user)

    titre = (payload.get("titre") or "").strip()
    if not titre:
        raise HTTPException(400, "Le titre de la mission est obligatoire.")

    filtres = payload.get("filtres") or {}
    aujourdhui = date.today()
    annee = int(payload.get("annee") or aujourdhui.year)
    mois = int(payload.get("mois") or aujourdhui.month)

    # Cibles explicitement fournies (cases cochées dans l'aperçu) ou recalculées
    cibles_demandees = payload.get("cibles")
    if cibles_demandees is None:
        cibles_demandees = apercu_cibles(db, filtres, annee, mois)["cibles"]

    # PDV : on privilégie le numéro (stable) sur l'id
    cibles_pdv: List[Dict[str, Any]] = []
    cibles_personnes: List[Dict[str, Any]] = []
    for c in cibles_demandees or []:
        if (c.get("type_cible") or "PDV").upper() == "PERSONNE":
            if c.get("target_user_id"):
                cibles_personnes.append(c)
        elif c.get("pdv_numero"):
            cibles_pdv.append(c)

    if not cibles_pdv and not cibles_personnes:
        raise HTTPException(400, "Aucune cible sélectionnée : la mission serait vide.")

    mission = MissionAppel(
        titre=titre,
        type_mission=_enum_ou_defaut(TypeMission, payload.get("type_mission"), TypeMission.AUTRE),
        consigne=payload.get("consigne"),
        objectif_texte=payload.get("objectif_texte"),
        objectif_nb_appels=_entier_ou_none(payload.get("objectif_nb_appels")),
        objectif_nb_promesses=_entier_ou_none(payload.get("objectif_nb_promesses")),
        objectif_taux_joignabilite=_float_ou_none(payload.get("objectif_taux_joignabilite")),
        commentaire_obligatoire=bool(payload.get("commentaire_obligatoire")),
        statuts_autorises=payload.get("statuts_autorises") or None,
        date_debut=_date_ou_none(payload.get("date_debut")) or aujourdhui,
        echeance=_date_ou_none(payload.get("echeance")),
        priorite=_enum_ou_defaut(PrioriteMission, payload.get("priorite"), PrioriteMission.NORMALE),
        statut=_enum_ou_defaut(StatutMission, payload.get("statut"), StatutMission.ACTIVE),
        filtres=filtres or None,
        created_by_id=user.id,
        created_by_nom=_nom_complet(user),
    )
    db.add(mission)
    db.flush()

    ordre = 0
    for c in cibles_pdv:
        db.add(MissionCible(
            mission_id=mission.id, type_cible=CibleType.PDV,
            pdv_id=c.get("pdv_id"), pdv_numero=str(c.get("pdv_numero")),
            motif=c.get("motif"), situation=c.get("situation"),
            statut=StatutCible.A_APPELER, ordre=ordre,
        ))
        ordre += 1
    for c in cibles_personnes:
        db.add(MissionCible(
            mission_id=mission.id, type_cible=CibleType.PERSONNE,
            target_user_id=int(c.get("target_user_id")),
            motif=c.get("motif") or "Appel direct à la personne",
            statut=StatutCible.A_APPELER, ordre=ordre,
        ))
        ordre += 1

    db.commit()
    db.refresh(mission)
    return mission


def _entier_ou_none(v):
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _float_ou_none(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _date_ou_none(v):
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def modifier_mission(db: Session, mission_id: int, payload: Dict[str, Any], user: User) -> MissionAppel:
    exige_createur(user)
    m = _get_mission(db, mission_id)
    if m.statut in (StatutMission.TERMINEE, StatutMission.ANNULEE):
        raise HTTPException(400, "Mission clôturée : elle ne peut plus être modifiée.")

    if "titre" in payload and (payload.get("titre") or "").strip():
        m.titre = payload["titre"].strip()
    if "consigne" in payload:
        m.consigne = payload.get("consigne")
    if "objectif_texte" in payload:
        m.objectif_texte = payload.get("objectif_texte")
    if "objectif_nb_appels" in payload:
        m.objectif_nb_appels = _entier_ou_none(payload.get("objectif_nb_appels"))
    if "objectif_nb_promesses" in payload:
        m.objectif_nb_promesses = _entier_ou_none(payload.get("objectif_nb_promesses"))
    if "objectif_taux_joignabilite" in payload:
        m.objectif_taux_joignabilite = _float_ou_none(payload.get("objectif_taux_joignabilite"))
    if "commentaire_obligatoire" in payload:
        m.commentaire_obligatoire = bool(payload.get("commentaire_obligatoire"))
    if "statuts_autorises" in payload:
        m.statuts_autorises = payload.get("statuts_autorises") or None
    if "echeance" in payload:
        m.echeance = _date_ou_none(payload.get("echeance"))
    if "priorite" in payload:
        m.priorite = _enum_ou_defaut(PrioriteMission, payload.get("priorite"), m.priorite)
    if "type_mission" in payload:
        m.type_mission = _enum_ou_defaut(TypeMission, payload.get("type_mission"), m.type_mission)
    if "statut" in payload:
        m.statut = _enum_ou_defaut(StatutMission, payload.get("statut"), m.statut)

    db.commit()
    db.refresh(m)
    return m


def cloturer_mission(db: Session, mission_id: int, user: User, statut: str = "TERMINEE") -> MissionAppel:
    exige_createur(user)
    m = _get_mission(db, mission_id)
    m.statut = _enum_ou_defaut(StatutMission, statut, StatutMission.TERMINEE)
    m.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(m)
    return m


def _get_mission(db: Session, mission_id: int) -> MissionAppel:
    m = db.query(MissionAppel).filter(MissionAppel.id == mission_id).first()
    if not m:
        raise HTTPException(404, "Mission introuvable.")
    return m


# ─────────────────────────────────────────────────────────────────────────────
# ATTRIBUTION AUX TÉLÉCONSEILLÈRES
# ─────────────────────────────────────────────────────────────────────────────

def tcs_disponibles(db: Session) -> List[Dict[str, Any]]:
    users = db.query(User).filter(
        User.is_active == True,  # noqa: E712
        func.lower(User.role).in_(["teleconseillere", "tc"]),
    ).order_by(User.nom).all()
    return [{"id": u.id, "nom": _nom_complet(u), "telephone": u.telephone} for u in users]


def attribuer(db: Session, mission_id: int, payload: Dict[str, Any], user: User) -> Dict[str, Any]:
    """Attribue les cibles aux TC : liste explicite, ou répartition automatique."""
    exige_createur(user)
    m = _get_mission(db, mission_id)

    user_ids = [int(i) for i in (payload.get("user_ids") or []) if i]
    strategy = payload.get("strategy") or "balanced"
    if not user_ids:
        raise HTTPException(400, "Sélectionnez au moins une téléconseillère.")

    tcs = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    if not tcs:
        raise HTTPException(400, "Téléconseillère(s) introuvable(s).")

    cibles = db.query(MissionCible).filter(MissionCible.mission_id == mission_id).all()
    if not cibles:
        raise HTTPException(400, "Cette mission n'a aucune cible.")

    # Ré-attribution : on remet à zéro l'affectation puis on redistribue
    infos = _infos_pdv(db, [c.pdv_numero for c in cibles if c.pdv_numero])
    ordre_tcs = list(tcs.keys())

    if strategy == "by_zone":
        groupes: Dict[str, List[MissionCible]] = {}
        for c in cibles:
            cle = (infos.get(str(c.pdv_numero)) or {}).get("quartier") or "_sans_quartier"
            groupes.setdefault(cle, []).append(c)
        for i, (_, lot) in enumerate(groupes.items()):
            uid = ordre_tcs[i % len(ordre_tcs)]
            for c in lot:
                _affecter(c, uid, tcs[uid])
    else:
        # Équilibrée : on donne la cible la moins chargée à tour de rôle
        for i, c in enumerate(sorted(cibles, key=lambda x: x.ordre or 0)):
            uid = ordre_tcs[i % len(ordre_tcs)]
            _affecter(c, uid, tcs[uid])

    db.commit()
    return {
        "mission_id": m.id,
        "attribuees": len(cibles),
        "par_tc": {(_nom_complet(tcs[i])): sum(1 for c in cibles if c.assigned_to_id == i) for i in ordre_tcs},
    }


def _affecter(cible: MissionCible, uid: int, u: User) -> None:
    cible.assigned_to_id = uid
    cible.assigned_to_nom = _nom_complet(u)
    cible.assigned_at = datetime.utcnow()
    if cible.statut == StatutCible.ABANDONNE:
        cible.statut = StatutCible.A_APPELER
        cible.abandon_motif = None


def desattribuer(db: Session, mission_id: int, payload: Dict[str, Any], user: User) -> Dict[str, Any]:
    exige_createur(user)
    _get_mission(db, mission_id)
    cible_ids = [int(i) for i in (payload.get("cible_ids") or []) if i]
    q = db.query(MissionCible).filter(MissionCible.mission_id == mission_id)
    if cible_ids:
        q = q.filter(MissionCible.id.in_(cible_ids))
    n = 0
    for c in q.all():
        c.assigned_to_id = None
        c.assigned_to_nom = None
        c.assigned_at = None
        c.statut = StatutCible.A_APPELER
        n += 1
    db.commit()
    return {"retirees": n}


# ─────────────────────────────────────────────────────────────────────────────
# LECTURE / SUIVI
# ─────────────────────────────────────────────────────────────────────────────

def _cible_to_dict(c: MissionCible, pdv_infos: Dict[str, Dict[str, Any]],
                   personnes: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    base = {
        "id": c.id,
        "mission_id": c.mission_id,
        "type_cible": c.type_cible.value if hasattr(c.type_cible, "value") else str(c.type_cible),
        "motif": c.motif,
        "situation": c.situation,
        "statut": c.statut.value if hasattr(c.statut, "value") else str(c.statut),
        "assigned_to_id": c.assigned_to_id,
        "assigned_to_nom": c.assigned_to_nom,
        "nb_appels": c.nb_appels or 0,
        "dernier_appel_at": c.dernier_appel_at.isoformat() if c.dernier_appel_at else None,
        "dernier_statut": c.dernier_statut,
        "dernier_statut_label": STATUT_LABELS.get(c.dernier_statut or "", c.dernier_statut),
        "abandon_motif": c.abandon_motif,
        "ordre": c.ordre,
        "telephone": None,
        "nom": None,
    }
    if base["type_cible"] == "PDV":
        d = pdv_infos.get(str(c.pdv_numero)) or {}
        base.update({
            "pdv_id": d.get("pdv_id") or c.pdv_id,
            "pdv_numero": c.pdv_numero,
            "nom": d.get("nom") or c.pdv_numero,
            "quartier": d.get("quartier"),
            "zone": d.get("zone"),
            "superviseur": d.get("superviseur"),
            "gestionnaire": d.get("gestionnaire"),
            "teleconseillere": d.get("teleconseillere"),
            "telephone": d.get("telephone"),
        })
    else:
        d = personnes.get(c.target_user_id) or {}
        base.update({
            "target_user_id": c.target_user_id,
            "nom": d.get("nom") or c.target_user_id,
            "role": d.get("role"),
            "zone": d.get("zone"),
            "telephone": d.get("telephone"),
        })
    return base


def avancement(mission: MissionAppel, cibles: List[MissionCible]) -> Dict[str, Any]:
    total = len(cibles)
    faits = sum(1 for c in cibles if c.statut == StatutCible.APPELE)
    injoignables = sum(1 for c in cibles if c.statut == StatutCible.INJOIGNABLE)
    abandonnes = sum(1 for c in cibles if c.statut == StatutCible.ABANDONNE)
    restants = total - faits - abandonnes
    promesses = sum(1 for c in cibles if c.dernier_statut == StatutAppel.JOIGNABLE_PROMESSE.value)
    joignables = sum(1 for c in cibles if c.dernier_statut in STATUTS_JOIGNABLES)
    appeles = sum(1 for c in cibles if c.nb_appels)
    return {
        "total": total,
        "appeles": appeles,
        "termines": faits,
        "injoignables": injoignables,
        "abandonnes": abandonnes,
        "restants": restants,
        "promesses": promesses,
        "joignables": joignables,
        "taux_avancement": round(faits / total * 100, 1) if total else 0,
        "taux_joignabilite": round(joignables / appeles * 100, 1) if appeles else 0,
        "en_retard": bool(mission.echeance and mission.echeance < date.today()
                          and restants > 0
                          and mission.statut == StatutMission.ACTIVE),
    }


def detail_mission(db: Session, mission_id: int, user: Optional[User] = None,
                   seulement_mes_cibles: bool = False) -> Dict[str, Any]:
    m = _get_mission(db, mission_id)
    cibles = db.query(MissionCible).filter(MissionCible.mission_id == mission_id)\
        .order_by(MissionCible.ordre, MissionCible.id).all()
    if seulement_mes_cibles and user is not None:
        cibles = [c for c in cibles if c.assigned_to_id == user.id]

    pdv_infos = _infos_pdv(db, [c.pdv_numero for c in cibles if c.pdv_numero])
    personnes = _infos_personnes(db, [c.target_user_id for c in cibles if c.target_user_id])

    av = avancement(m, cibles)
    return {
        "mission": _mission_to_dict(m, av),
        "cibles": [_cible_to_dict(c, pdv_infos, personnes) for c in cibles],
        "avancement": av,
    }


def _mission_to_dict(m: MissionAppel, av: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "id": m.id,
        "titre": m.titre,
        "type_mission": m.type_mission.value if hasattr(m.type_mission, "value") else str(m.type_mission),
        "type_mission_label": TYPE_MISSION_LABELS.get(
            m.type_mission.value if hasattr(m.type_mission, "value") else str(m.type_mission), "—"),
        "consigne": m.consigne,
        "objectif_texte": m.objectif_texte,
        "objectif_nb_appels": m.objectif_nb_appels,
        "objectif_nb_promesses": m.objectif_nb_promesses,
        "objectif_taux_joignabilite": m.objectif_taux_joignabilite,
        "commentaire_obligatoire": bool(m.commentaire_obligatoire),
        "statuts_autorises": m.statuts_autorises,
        "date_debut": m.date_debut.isoformat() if m.date_debut else None,
        "echeance": m.echeance.isoformat() if m.echeance else None,
        "priorite": m.priorite.value if hasattr(m.priorite, "value") else str(m.priorite),
        "priorite_label": PRIORITE_LABELS.get(
            m.priorite.value if hasattr(m.priorite, "value") else str(m.priorite), "—"),
        "statut": m.statut.value if hasattr(m.statut, "value") else str(m.statut),
        "statut_label": STATUT_MISSION_LABELS.get(
            m.statut.value if hasattr(m.statut, "value") else str(m.statut), "—"),
        "filtres": m.filtres,
        "created_by_id": m.created_by_id,
        "created_by_nom": m.created_by_nom,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "closed_at": m.closed_at.isoformat() if m.closed_at else None,
        "avancement": av,
    }


def lister_missions(db: Session, user: User, statut: Optional[str] = None,
                    seulement_actives: bool = False,
                    mes_missions: bool = False) -> List[Dict[str, Any]]:
    q = db.query(MissionAppel)
    if not peut_creer(user):
        if mes_missions:
            q = q.join(MissionCible, MissionCible.mission_id == MissionAppel.id)\
                 .filter(MissionCible.assigned_to_id == user.id).distinct()
        else:
            q = q.filter(MissionAppel.created_by_id == user.id)
    elif mes_missions:
        q = q.filter(MissionAppel.created_by_id == user.id)
    if statut:
        q = q.filter(MissionAppel.statut == _enum_ou_defaut(StatutMission, statut, StatutMission.ACTIVE))
    if seulement_actives:
        q = q.filter(MissionAppel.statut == StatutMission.ACTIVE)

    missions = q.order_by(MissionAppel.created_at.desc()).limit(200).all()
    if not missions:
        return []

    ids = [m.id for m in missions]
    tous = db.query(MissionCible).filter(MissionCible.mission_id.in_(ids)).all()
    par_mission: Dict[int, List[MissionCible]] = {}
    for c in tous:
        par_mission.setdefault(c.mission_id, []).append(c)

    out = []
    for m in missions:
        cibles = par_mission.get(m.id, [])
        av = avancement(m, cibles)
        d = _mission_to_dict(m, av)
        d["mes_cibles"] = sum(1 for c in cibles
                              if user and c.assigned_to_id == user.id and c.statut != StatutCible.APPELE)
        d["tcs"] = sorted({c.assigned_to_nom for c in cibles if c.assigned_to_nom})
        out.append(d)
    # Les missions urgentes / à échéance passent devant
    prio = {"URGENTE": 0, "HAUTE": 1, "NORMALE": 2}
    out.sort(key=lambda d: (1 if d["statut"] != "ACTIVE" else 0,
                            prio.get(d["priorite"], 3),
                            d["echeance"] or "9999-12-31"))
    return out


def stats_mission(db: Session, mission_id: int, user: Optional[User] = None) -> Dict[str, Any]:
    detail = detail_mission(db, mission_id, user)
    cibles = detail["cibles"]

    par_tc: Dict[str, Dict[str, Any]] = {}
    for c in cibles:
        cle = c.get("assigned_to_nom") or "Non attribué"
        s = par_tc.setdefault(cle, {"tc": cle, "total": 0, "termines": 0, "appeles": 0,
                                    "promesses": 0, "injoignables": 0, "joignables": 0})
        s["total"] += 1
        if c["statut"] == "APPELE":
            s["termines"] += 1
        if c["statut"] == "INJOIGNABLE":
            s["injoignables"] += 1
        if c["nb_appels"]:
            s["appeles"] += 1
        if c["dernier_statut"] == StatutAppel.JOIGNABLE_PROMESSE.value:
            s["promesses"] += 1
        if c["dernier_statut"] in STATUTS_JOIGNABLES:
            s["joignables"] += 1

    for s in par_tc.values():
        s["taux_avancement"] = round(s["termines"] / s["total"] * 100, 1) if s["total"] else 0
        s["taux_joignabilite"] = round(s["joignables"] / s["appeles"] * 100, 1) if s["appeles"] else 0

    par_statut: Dict[str, int] = {}
    for c in cibles:
        if c["dernier_statut"]:
            par_statut[c["dernier_statut"]] = par_statut.get(c["dernier_statut"], 0) + 1

    return {
        "mission": detail["mission"],
        "avancement": detail["avancement"],
        "par_tc": sorted(par_tc.values(), key=lambda s: -s["total"]),
        "par_statut_appel": par_statut,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CÔTÉ TÉLÉCONSEILLÈRE
# ─────────────────────────────────────────────────────────────────────────────

def mes_missions(db: Session, user: User) -> List[Dict[str, Any]]:
    rows = db.query(MissionAppel, MissionCible).join(
        MissionCible, MissionCible.mission_id == MissionAppel.id
    ).filter(
        MissionCible.assigned_to_id == user.id,
        MissionAppel.statut == StatutMission.ACTIVE,
    ).all()
    par_mission: Dict[int, Dict[str, Any]] = {}
    for m, c in rows:
        d = par_mission.setdefault(m.id, {"mission": m, "cibles": []})
        d["cibles"].append(c)
    out = []
    for mid, d in par_mission.items():
        obj = _mission_to_dict(d["mission"], avancement(d["mission"], d["cibles"]))
        obj["mes_cibles"] = sum(1 for c in d["cibles"] if c.statut != StatutCible.APPELE)
        out.append(obj)
    prio = {"URGENTE": 0, "HAUTE": 1, "NORMALE": 2}
    out.sort(key=lambda x: (prio.get(x["priorite"], 3), x["echeance"] or "9999-12-31"))
    return out


def marquer_cible(db: Session, cible_id: int, payload: Dict[str, Any], user: User) -> Dict[str, Any]:
    c = db.query(MissionCible).filter(MissionCible.id == cible_id).first()
    if not c:
        raise HTTPException(404, "Cible introuvable.")
    if c.assigned_to_id != user.id and not peut_creer(user):
        raise HTTPException(403, "Cette cible ne vous est pas attribuée.")

    statut = (payload.get("statut") or "").upper()
    if statut:
        c.statut = _enum_ou_defaut(StatutCible, statut, c.statut)
        if c.statut == StatutCible.ABANDONNE:
            c.abandon_motif = payload.get("abandon_motif")
            if not c.abandon_motif:
                raise HTTPException(400, "Indiquez le motif d'abandon.")
    db.commit()
    return {"id": c.id, "statut": c.statut.value}


def enregistrer_appel(db: Session, cible_id: int, payload: Dict[str, Any], user: User) -> Dict[str, Any]:
    """Enregistre l'appel dans le journal `appels_tc` ET met à jour la cible."""
    c = db.query(MissionCible).filter(MissionCible.id == cible_id).first()
    if not c:
        raise HTTPException(404, "Cible introuvable.")
    if c.assigned_to_id != user.id and not peut_creer(user):
        raise HTTPException(403, "Cette cible ne vous est pas attribuée.")

    mission = _get_mission(db, c.mission_id)
    statut_appel = payload.get("statut")
    if not statut_appel:
        raise HTTPException(400, "Le statut de l'appel est obligatoire.")
    try:
        statut_enum = StatutAppel(statut_appel)
    except ValueError:
        raise HTTPException(400, f"Statut d'appel inconnu : {statut_appel}")

    # Statuts autorisés par la mission
    autorises = mission.statuts_autorises or None
    if autorises and statut_appel not in autorises:
        raise HTTPException(400, "Ce statut n'est pas autorisé pour cette mission.")

    commentaire = (payload.get("commentaire") or "").strip()
    if mission.commentaire_obligatoire and not commentaire:
        raise HTTPException(400, "Le commentaire est obligatoire pour cette mission.")

    # Cible « personne » : pas de numéro PDV dans le journal → on garde le
    # numéro renseigné dans le payload, sinon vide.
    numero_pdv = c.pdv_numero or (payload.get("numero_pdv") or "")
    nom_pdv = None
    if c.type_cible == CibleType.PDV:
        info = _infos_pdv(db, [c.pdv_numero]).get(str(c.pdv_numero)) or {}
        nom_pdv = info.get("nom")
    else:
        info = _infos_personnes(db, [c.target_user_id]).get(c.target_user_id) or {}
        nom_pdv = info.get("nom")

    appel = AppelTC(
        numero_pdv=numero_pdv,
        nom_pdv=nom_pdv,
        indicateur=payload.get("indicateur") or "OMY",
        tc_user_id=user.id,
        tc_nom=_nom_complet(user),
        indicateurs=payload.get("indicateurs"),
        statut=statut_enum,
        commentaire=commentaire or None,
        date_rappel=_date_ou_none(payload.get("date_rappel")),
        mission_cible_id=c.id,
    )
    db.add(appel)

    c.nb_appels = (c.nb_appels or 0) + 1
    c.dernier_appel_at = datetime.utcnow()
    c.dernier_statut = statut_enum.value
    c.statut = (StatutCible.INJOIGNABLE if statut_enum == StatutAppel.NON_JOIGNABLE_PAS_REPONSE
                else StatutCible.APPELE)
    db.commit()
    db.refresh(appel)

    return {
        "appel_id": appel.id,
        "cible_id": c.id,
        "statut_cible": c.statut.value,
        "mission_id": mission.id,
    }


def cibles_a_faire(db: Session, user: User, limit: int = 500) -> List[Dict[str, Any]]:
    """File d'appels des missions pour la TC connectée."""
    cibles = db.query(MissionCible).join(
        MissionAppel, MissionAppel.id == MissionCible.mission_id
    ).filter(
        MissionCible.assigned_to_id == user.id,
        MissionAppel.statut == StatutMission.ACTIVE,
        MissionCible.statut.in_([StatutCible.A_APPELER, StatutCible.EN_COURS, StatutCible.INJOIGNABLE]),
    ).order_by(MissionCible.ordre).limit(limit).all()

    pdv_infos = _infos_pdv(db, [c.pdv_numero for c in cibles if c.pdv_numero])
    personnes = _infos_personnes(db, [c.target_user_id for c in cibles if c.target_user_id])
    missions = {m.id: m for m in db.query(MissionAppel).filter(
        MissionAppel.id.in_([c.mission_id for c in cibles])).all()} if cibles else {}

    out = []
    for c in cibles:
        d = _cible_to_dict(c, pdv_infos, personnes)
        m = missions.get(c.mission_id)
        if m:
            d["mission_titre"] = m.titre
            d["mission_type"] = m.type_mission.value if hasattr(m.type_mission, "value") else str(m.type_mission)
            d["mission_consigne"] = m.consigne
            d["mission_priorite"] = m.priorite.value if hasattr(m.priorite, "value") else str(m.priorite)
            d["mission_echeance"] = m.echeance.isoformat() if m.echeance else None
            d["mission_objectif"] = m.objectif_texte
        out.append(d)
    return out
