"""
Périmètre de visibilité des PDV selon le rôle de l'utilisateur connecté.

Réutilise la règle unique définie dans `app.api.routes.auth.get_pdv_filters`
(déjà utilisée par le dashboard OMY) pour la rendre disponible aux services
NAFAMA et KAABU :

  - admin / manager / rc / conformite : aucune restriction (None) ;
  - superviseur                        : uniquement ses propres PDV ;
  - autres rôles (gestionnaire, développeur, téléconseillère) : pour l'instant
    aucune restriction ici (comportement historique inchangé).

L'import de `get_pdv_filters` est fait DANS les fonctions pour éviter tout
import circulaire (auth.py importe les services au chargement de l'app).
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional


def _filtres_pdv(user) -> dict:
    """Retourne le dict de filtres PDV de l'utilisateur (jamais None)."""
    if user is None:
        return {}
    # Import local : évite un import circulaire app.api.routes.auth <-> services.
    from app.api.routes.auth import get_pdv_filters
    try:
        return get_pdv_filters(user) or {}
    except Exception:
        # Sécurité : en cas d'erreur inattendue on ne restreint rien
        # (comportement identique à l'absence de filtre).
        return {}


def superviseur_du_user(user) -> Optional[str]:
    """Nom du superviseur rattaché à l'utilisateur, ou None s'il voit tout.

    Utilisé par KAABU, dont les lignes portent leur propre colonne
    `superviseur` (pas de jointure PDV nécessaire).
    """
    nom = _filtres_pdv(user).get('superviseur')
    if nom is None:
        return None
    nom = str(nom).strip()
    return nom or None


def numeros_pdv_autorises(db: Session, user) -> Optional[List[str]]:
    """Liste des numéros de PDV du périmètre de l'utilisateur.
    None = aucune restriction (admin, manager, rc, conformite)."""
    from app.models.pdv import PDV

    filtre = _filtres_pdv(user)
    if 'superviseur' not in filtre:
        return None

    nom = filtre.get('superviseur')
    nom = '' if nom is None else str(nom)

    # Nom vide → aucun PDV (et surtout pas les PDV sans superviseur affecté).
    if not nom.strip():
        return []

    # Correspondance exacte, comme le dashboard OMY.
    rows = (
        db.query(PDV.numero_pdv)
        .filter(PDV.superviseur == nom)
        .distinct()
        .all()
    )
    numeros = [r[0] for r in rows if r[0]]

    # Repli insensible à la casse / aux espaces : dans les fichiers importés le
    # nom du superviseur est souvent en MAJUSCULES alors que le compte
    # utilisateur est saisi en minuscules. On ne l'utilise que si la
    # correspondance exacte ne renvoie rien (aucun élargissement du périmètre).
    if not numeros:
        rows = (
            db.query(PDV.numero_pdv)
            .filter(func.lower(func.trim(PDV.superviseur)) == nom.strip().lower())
            .distinct()
            .all()
        )
        numeros = [r[0] for r in rows if r[0]]

    return numeros
