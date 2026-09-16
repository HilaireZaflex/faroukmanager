"""
Routes API KAABU Mobile
Prefix: /api/kaabu
"""
from fastapi import APIRouter, Depends, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.services import kaabu_service
from typing import Optional
import tempfile, os

router = APIRouter()


@router.get("/kaabu/periods")
def get_periods(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_available_periods(db)


@router.get("/kaabu/periods-mensuel")
def get_periods_mensuel(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_available_periods_mensuel(db)


@router.get("/kaabu/mensuel/vue-ensemble")
def vue_ensemble_mensuel(annee: int = Query(...), mois: int = Query(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_vue_ensemble_mensuel(db, annee, mois)


@router.get("/kaabu/mensuel/superviseurs")
def superviseurs_mensuel(annee: int = Query(...), mois: int = Query(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_superviseur_mensuel(db, annee, mois)


@router.get("/kaabu/mensuel/gestionnaires")
def gestionnaires_mensuel(annee: int = Query(...), mois: int = Query(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_gestionnaire_mensuel(db, annee, mois)


@router.get("/kaabu/mensuel/coaches")
def coaches_mensuel(annee: int = Query(...), mois: int = Query(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_coach_mensuel(db, annee, mois)


@router.get("/kaabu/mensuel/teleconseilleres")
def telecons_mensuel(annee: int = Query(...), mois: int = Query(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_teleconseillere_mensuel(db, annee, mois)


@router.get("/kaabu/mensuel/developpeurs")
def devs_mensuel(annee: int = Query(...), mois: int = Query(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_developpeur_mensuel(db, annee, mois)


@router.get("/kaabu/mensuel/hors-zone")
def hors_zone_mensuel(annee: int = Query(...), mois: int = Query(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_hors_zone_mensuel(db, annee, mois)


@router.get("/kaabu/mensuel/inactifs")
def inactifs_mensuel(annee: int = Query(...), mois: int = Query(...),
    teleconseillere: Optional[str] = Query(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_inactifs_mensuel(db, annee, mois, teleconseillere)


@router.get("/kaabu/mensuel/en-baisse")
def en_baisse_mensuel(annee: int = Query(...), mois: int = Query(...),
    seuil: float = Query(-20.0),
    teleconseillere: Optional[str] = Query(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_en_baisse_mensuel(db, annee, mois, seuil, teleconseillere)


@router.get("/kaabu/vue-ensemble")
def vue_ensemble(annee: int = Query(...), semaine: str = Query(...),
                 db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_vue_ensemble(db, annee, semaine)


@router.get("/kaabu/superviseurs")
def par_superviseur(annee: int = Query(...), semaine: str = Query(...),
                    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_superviseur(db, annee, semaine)


@router.get("/kaabu/gestionnaires")
def par_gestionnaire(annee: int = Query(...), semaine: str = Query(...),
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_gestionnaire(db, annee, semaine)


@router.get("/kaabu/coaches")
def par_coach(annee: int = Query(...), semaine: str = Query(...),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_coach(db, annee, semaine)


@router.get("/kaabu/teleconseilleres")
def par_teleconseillere(annee: int = Query(...), semaine: str = Query(...),
                        db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_teleconseillere(db, annee, semaine)


@router.get("/kaabu/developpeurs")
def par_developpeur(annee: int = Query(...), semaine: str = Query(...),
                    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_par_developpeur(db, annee, semaine)


@router.get("/kaabu/hors-zone")
def hors_zone(annee: int = Query(...), semaine: str = Query(...),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_hors_zone(db, annee, semaine)


@router.get("/kaabu/inactifs")
def inactifs(annee: int = Query(...), semaine: str = Query(...),
             teleconseillere: Optional[str] = Query(None),
             db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_inactifs(db, annee, semaine, teleconseillere)


@router.get("/kaabu/en-baisse")
def en_baisse(annee: int = Query(...), semaine: str = Query(...),
              seuil: float = Query(-20.0),
              teleconseillere: Optional[str] = Query(None),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_en_baisse(db, annee, semaine, seuil, teleconseillere)


@router.get("/kaabu/evolution")
def evolution(annee: int = Query(...),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return kaabu_service.get_evolution(db, annee)


# ─── IMPORT ───────────────────────────────────────────────────────────────────

def _controle_fichier(file) -> None:
    from fastapi import HTTPException
    if not (file.filename or '').lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(400, f"Format non supporté pour « {file.filename} ». Utilisez .xlsx ou .xls")


def _sauver_temporaire(contents: bytes) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
        tmp.write(contents)
        return tmp.name


async def _lire_fichiers(files: list) -> list:
    """Retourne [(nom_origine, chemin_temporaire, contenu_bytes)]."""
    sortie = []
    for f in files:
        _controle_fichier(f)
        contenu = await f.read()
        sortie.append((f.filename, _sauver_temporaire(contenu), contenu))
    return sortie


@router.post("/kaabu/import/apercu")
async def apercu_import_kaabu(
    files: list[UploadFile] = File(...),
    annee: Optional[int] = Query(None),
    semaine: Optional[str] = Query(None, description="Force la semaine (ex. S36) si absente du nom de fichier"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Contrôle à blanc : analyse les fichiers SANS rien écrire en base.

    Renvoie, par fichier : la semaine détectée, le nombre de lignes, le montant,
    et si cette semaine est déjà présente en base (donc remplacée à l'import).
    """
    from fastapi import HTTPException
    from app.models.kaabu import KaabuTransaction

    fichiers = await _lire_fichiers(files)
    resultats, total_lignes, total_montant = [], 0, 0
    try:
        for nom, chemin, _ in fichiers:
            try:
                r = kaabu_service.import_excel(
                    db, chemin, filename=nom,
                    semaine_forcee=semaine, annee_forcee=annee, dry_run=True,
                )
                semaines = r.get('semaines') or []
                nb_existant = db.query(KaabuTransaction).filter(
                    KaabuTransaction.annee.in_(r.get('annees') or [2026]),
                    KaabuTransaction.semaine.in_(semaines),
                ).count() if semaines else 0
                total_lignes += r.get('inserted', 0)
                total_montant += r.get('montant_total', 0)
                resultats.append({
                    "fichier": nom,
                    "ok": True,
                    "semaine": ", ".join(semaines) or None,
                    "annee": (r.get('annees') or [None])[0],
                    "lignes": r.get('inserted', 0),
                    "pdvs_uniques": r.get('pdvs_uniques', 0),
                    "montant_total": r.get('montant_total', 0),
                    "nb_actifs": r.get('nb_actifs', 0),
                    "nb_hors_zone": r.get('nb_hors_zone', 0),
                    "deja_en_base": nb_existant,
                })
            except Exception as e:
                resultats.append({"fichier": nom, "ok": False, "erreur": str(e)})
    finally:
        for _, chemin, _ in fichiers:
            try:
                os.unlink(chemin)
            except OSError:
                pass

    return {
        "apercu": True,
        "fichiers": resultats,
        "total_lignes": total_lignes,
        "total_montant": total_montant,
        "tous_ok": all(r["ok"] for r in resultats) if resultats else False,
    }


@router.post("/kaabu/import")
async def import_kaabu(
    files: list[UploadFile] = File(...),
    mode: str = Query("remplacer", description="'remplacer' = écrase la semaine, 'completer' = n'importe que les semaines absentes"),
    annee: Optional[int] = Query(None),
    semaine: Optional[str] = Query(None, description="Force la semaine (ex. S36) si absente du nom de fichier"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Importe un ou plusieurs fichiers KAABU (format Orange 'ACTIFS KM' ou historique).

    Un fichier = une semaine. La semaine est lue dans le nom du fichier
    (ex. « DONNEES KAABU S36.xlsx ») ou forcée par le paramètre `semaine`.
    Chaque semaine importée est remplacée en bloc, en une seule transaction.
    """
    from fastapi import HTTPException
    from app.models.kaabu import KaabuTransaction

    if mode not in ("remplacer", "completer"):
        raise HTTPException(400, "mode doit être 'remplacer' ou 'completer'")

    fichiers = await _lire_fichiers(files)
    details, total_insere, total_remplace = [], 0, 0
    erreurs = []
    try:
        for nom, chemin, _ in fichiers:
            try:
                # Détection préalable de la période (pour le mode 'completer')
                r_apercu = kaabu_service.import_excel(
                    db, chemin, filename=nom,
                    semaine_forcee=semaine, annee_forcee=annee, dry_run=True,
                )
                semaines = r_apercu.get('semaines') or []
                annees = r_apercu.get('annees') or [2026]

                if mode == "completer":
                    deja = db.query(KaabuTransaction).filter(
                        KaabuTransaction.annee.in_(annees),
                        KaabuTransaction.semaine.in_(semaines),
                    ).count() if semaines else 0
                    if deja:
                        details.append({
                            "fichier": nom, "statut": "ignore",
                            "semaine": ", ".join(semaines),
                            "message": f"Semaine déjà présente ({deja} lignes) — non modifiée",
                        })
                        continue

                remplaces = db.query(KaabuTransaction).filter(
                    KaabuTransaction.annee.in_(annees),
                    KaabuTransaction.semaine.in_(semaines),
                ).count() if semaines else 0

                result = kaabu_service.import_excel(
                    db, chemin, filename=nom,
                    semaine_forcee=semaine, annee_forcee=annee,
                )
                total_insere += result.get('inserted', 0)
                total_remplace += remplaces
                details.append({
                    "fichier": nom, "statut": "importe",
                    "semaine": ", ".join(result.get('semaines') or []),
                    "annee": (result.get('annees') or [None])[0],
                    "lignes": result.get('inserted', 0),
                    "remplacees": remplaces,
                })
            except Exception as e:
                db.rollback()
                erreurs.append({"fichier": nom, "erreur": str(e)})
                details.append({"fichier": nom, "statut": "erreur", "message": str(e)})
    finally:
        for _, chemin, _ in fichiers:
            try:
                os.unlink(chemin)
            except OSError:
                pass

    return {
        "success": len(erreurs) == 0,
        "inserted": total_insere,
        "replaced_existing": total_remplace,
        "details": details,
        "erreurs": erreurs,
        "semaines": sorted({d.get("semaine") for d in details if d.get("semaine")}),
    }
