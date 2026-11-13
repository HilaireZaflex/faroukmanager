"""
Périmètre « équipe » (superviseurs) et périmètre des évaluations.

Règle unique, alignée sur `app.api.routes.auth.get_pdv_filters` :

  · admin / manager / rc / conformite → voient tout (aucune restriction) ;
  · superviseur                        → lui-même uniquement ;
  · gestionnaire                       → les superviseurs rattachés à au moins
                                         un de ses PDV (`PDV.gestionnaire`) ;
  · téléconseillère / développeur / …  → aucune équipe encadrée. Pour les
                                         évaluations, ces rôles ne voient que
                                         leur propre ligne (jamais celle des
                                         autres).

Deux notions distinctes sont exposées :

  - `ids_utilisateurs_perimetre`  : lignes d'évaluation (EvalScore.user_id,
    EvalObjective.user_id, MysteryCallTask.target_user_id…) ;
  - `superviseurs_du_perimetre` / `ids_superviseurs_perimetre` : listes de
    superviseurs (pages « Équipe & Réseau », évaluations des superviseurs qui
    sont stockées par NOM et non par identifiant).

Les imports de `get_pdv_filters` et des modèles sont faits DANS les fonctions
pour éviter tout import circulaire (auth.py importe les services au chargement
de l'application).
"""
from __future__ import annotations

from typing import Iterable, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session


#: Rôles à vision globale : ils ne sont JAMAIS restreints.
ROLES_ENCADREMENT = ("admin", "manager", "rc", "conformite")


# ─────────────────────────────────────────────────────────────────────────────
# Identité / rôle
# ─────────────────────────────────────────────────────────────────────────────
def role_de(user) -> str:
    """Rôle normalisé : minuscules, préfixe « UserRole. » retiré."""
    if user is None:
        return ""
    return str(getattr(user, "role", "") or "").lower().replace("userrole.", "").strip()


def est_encadrement(user) -> bool:
    """True si l'utilisateur a une vision globale (admin, manager, rc, conformité).

    Ces rôles ne doivent jamais être restreints. Les rôles « encadrant » mais
    locaux (superviseur, gestionnaire) ont, eux, un périmètre limité : ce sont
    justement ceux que ce module calcule.
    """
    return role_de(user) in ROLES_ENCADREMENT


def nom_complet(user) -> str:
    """Nom « PRENOM NOM » tel qu'il est stocké dans les PDV / commissions."""
    if user is None:
        return ""
    prenom = (getattr(user, "prenom", None) or "").strip()
    nom = (getattr(user, "nom", None) or "").strip()
    return f"{prenom} {nom}".strip() if prenom else nom


def nom_gestionnaire_de(user) -> str:
    """Nom sous lequel les PDV référencent ce gestionnaire (get_pdv_filters)."""
    if user is None:
        return ""
    from app.api.routes.auth import get_pdv_filters  # import local : anti-cycle

    try:
        filtres = get_pdv_filters(user) or {}
    except Exception:
        return ""
    return str(filtres.get("gestionnaire") or "").strip()


# ─────────────────────────────────────────────────────────────────────────────
# Superviseurs d'un gestionnaire
# ─────────────────────────────────────────────────────────────────────────────
def _variantes_nom(nom: str) -> List[str]:
    """« PRENOM NOM » et « NOM PRENOM » — les PDV utilisent les deux ordres."""
    base = (nom or "").strip()
    if not base:
        return []
    variantes = [base]
    morceaux = base.split()
    if len(morceaux) > 1:
        inverse = " ".join(reversed(morceaux))
        if inverse.lower() != base.lower():
            variantes.append(inverse)
    return variantes


def superviseurs_du_gestionnaire(db: Session, nom_gestionnaire: str) -> List[str]:
    """Noms distincts des superviseurs ayant au moins UN PDV de ce gestionnaire.

    Correspondance exacte (insensible à la casse et aux espaces de bord, et
    tolérante à l'ordre « PRENOM NOM » / « NOM PRENOM ») : aucun élargissement
    du périmètre.
    """
    from app.models.pdv import PDV  # import local : anti-cycle

    nom = (nom_gestionnaire or "").strip()
    if not nom:
        return []

    variantes = [v.lower() for v in _variantes_nom(nom)]
    rows = (
        db.query(PDV.superviseur)
        .filter(func.lower(func.trim(PDV.gestionnaire)).in_(variantes))
        .filter(PDV.superviseur.isnot(None))
        .filter(func.trim(PDV.superviseur) != "")
        .distinct()
        .all()
    )

    noms: List[str] = []
    vus = set()
    for (sup,) in rows:
        valeur = (sup or "").strip()
        if valeur and valeur.lower() not in vus:
            vus.add(valeur.lower())
            noms.append(valeur)
    return noms


# ─────────────────────────────────────────────────────────────────────────────
# Périmètre exprimé en NOMS de superviseurs
# ─────────────────────────────────────────────────────────────────────────────
def _noms_du_superviseur(db: Session, user) -> List[str]:
    """Nom(s) sous le(s)quel(s) les évaluations du superviseur sont stockées."""
    from app.models.pdv import PDV  # import local : anti-cycle

    nom = nom_complet(user)
    if not nom:
        return []

    variantes = [v.lower() for v in _variantes_nom(nom)]
    rows = (
        db.query(PDV.superviseur)
        .filter(func.lower(func.trim(PDV.superviseur)).in_(variantes))
        .filter(PDV.superviseur.isnot(None))
        .distinct()
        .all()
    )
    noms = {}
    for (sup,) in rows:
        valeur = (sup or "").strip()
        if valeur:
            noms[valeur.lower()] = valeur
    # Toujours inclure le nom du compte, même si aucun PDV ne le référence
    # encore (le superviseur doit voir sa propre évaluation).
    noms.setdefault(nom.lower(), nom)
    return list(noms.values())


def superviseurs_du_perimetre(db: Session, user) -> Optional[List[str]]:
    """Noms des superviseurs autorisés.

    - None  → aucune restriction (admin / manager / rc / conformité, et rôles
              non encadrants pour lesquels le comportement reste inchangé) ;
    - []    → périmètre vide : ne rien retourner (surtout pas « tout ») ;
    - [...] → uniquement ces superviseurs.
    """
    if user is None:
        return None
    role = role_de(user)
    if est_encadrement(user):
        return None
    if role == "gestionnaire":
        return superviseurs_du_gestionnaire(db, nom_gestionnaire_de(user))
    if role == "superviseur":
        return _noms_du_superviseur(db, user)
    # Autres rôles : comportement historique inchangé (téléconseillère qui
    # consulte les PDV d'un superviseur pour ses appels, développeur, etc.).
    return None


def _condition_noms_utilisateurs(noms: Iterable[str]):
    """Critère SQL : nom complet d'un compte utilisateur ∈ `noms`.

    Tolère « PRENOM NOM » comme « NOM PRENOM », ainsi qu'un `nom` qui
    contiendrait déjà le nom complet.
    """
    from app.models.user import User  # import local : anti-cycle

    prenom = func.coalesce(User.prenom, "")
    nom = func.coalesce(User.nom, "")
    complet = func.lower(func.trim(prenom + " " + nom))
    inverse = func.lower(func.trim(nom + " " + prenom))
    nom_seul = func.lower(func.trim(nom))
    return or_(complet.in_(noms), inverse.in_(noms), nom_seul.in_(noms))


def _ids_utilisateurs_pour_noms(db: Session, noms: Iterable[str]) -> List[int]:
    from app.models.user import User  # import local : anti-cycle

    valeurs = sorted({str(n).strip().lower() for n in noms if n and str(n).strip()})
    if not valeurs:
        return []
    rows = db.query(User.id).filter(_condition_noms_utilisateurs(valeurs)).all()
    return sorted({r[0] for r in rows if r[0] is not None})


def ids_superviseurs_perimetre(db: Session, user) -> Optional[List[int]]:
    """Identifiants des comptes superviseurs autorisés (None = tout)."""
    noms = superviseurs_du_perimetre(db, user)
    if noms is None:
        return None
    return _ids_utilisateurs_pour_noms(db, noms)


# ─────────────────────────────────────────────────────────────────────────────
# Périmètre exprimé en IDENTIFIANTS d'utilisateurs (lignes d'évaluation)
# ─────────────────────────────────────────────────────────────────────────────
def ids_utilisateurs_perimetre(db: Session, user) -> Optional[List[int]]:
    """Identifiants des utilisateurs dont les lignes d'évaluation sont visibles.

    - None  → aucune restriction (admin / manager / rc / conformité) ;
    - []    → aucune ligne visible (périmètre vide) ;
    - [...] → ces utilisateurs uniquement.
    """
    if user is None:
        return None
    role = role_de(user)
    if est_encadrement(user):
        return None

    if role == "gestionnaire":
        noms = superviseurs_du_gestionnaire(db, nom_gestionnaire_de(user))
        if not noms:
            return []
        return _ids_utilisateurs_pour_noms(db, noms)

    if role == "superviseur":
        ids = set()
        if getattr(user, "id", None) is not None:
            ids.add(user.id)
        noms = _noms_du_superviseur(db, user)
        if noms:
            ids.update(_ids_utilisateurs_pour_noms(db, noms))
        return sorted(ids)

    # Téléconseillère, développeur, commercial… : uniquement sa propre ligne.
    uid = getattr(user, "id", None)
    return [uid] if uid is not None else []


# ─────────────────────────────────────────────────────────────────────────────
# Filtres SQL réutilisables
# ─────────────────────────────────────────────────────────────────────────────
def filtrer_par_ids(query, colonne, ids: Optional[List[int]]):
    """Applique `colonne IN ids` ; None = pas de filtre, [] = aucun résultat."""
    if ids is None:
        return query
    if not ids:
        return query.filter(colonne.in_([]))
    return query.filter(colonne.in_(ids))


def filtrer_par_utilisateurs(query, colonne, db: Session, user):
    """Filtre une requête sur une colonne `user_id` selon le périmètre."""
    return filtrer_par_ids(query, colonne, ids_utilisateurs_perimetre(db, user))


def filtrer_par_superviseurs(query, colonne, db: Session, user):
    """Filtre une requête sur une colonne texte contenant le nom du superviseur."""
    noms = superviseurs_du_perimetre(db, user)
    if noms is None:
        return query
    valeurs = sorted({n.strip().lower() for n in noms if n and n.strip()})
    if not valeurs:
        return query.filter(colonne.in_([]))
    return query.filter(func.lower(func.trim(colonne)).in_(valeurs))


# ─────────────────────────────────────────────────────────────────────────────
# Contrôles d'accès explicites (403 hors périmètre)
# ─────────────────────────────────────────────────────────────────────────────
def utilisateur_autorise(db: Session, user, user_id) -> bool:
    ids = ids_utilisateurs_perimetre(db, user)
    if ids is None:
        return True
    try:
        return int(user_id) in ids
    except (TypeError, ValueError):
        return False


def verifier_utilisateur(db: Session, user, user_id):
    """Lève 403 si `user_id` est hors du périmètre de l'utilisateur connecté."""
    if not utilisateur_autorise(db, user, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé : cet utilisateur est hors de votre périmètre.",
        )
    return user_id


def superviseur_autorise(db: Session, user, nom_superviseur) -> bool:
    noms = superviseurs_du_perimetre(db, user)
    if noms is None:
        return True
    cible = str(nom_superviseur or "").strip().lower()
    return cible in {n.strip().lower() for n in noms if n and n.strip()}


def verifier_superviseur(db: Session, user, nom_superviseur):
    """Lève 403 si le superviseur demandé est hors du périmètre."""
    if not superviseur_autorise(db, user, nom_superviseur):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé : ce superviseur est hors de votre périmètre.",
        )
    return nom_superviseur
