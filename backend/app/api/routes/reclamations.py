from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta
from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.reclamation import Reclamation, ReclamationCommentaire, ReclamationNotification

router = APIRouter()

# ─── Helpers ─────────────────────────────────────────────────────────────────

def notifier(db: Session, reclamation_id: int, destinataire_id: int, message: str, type_notif: str):
    notif = ReclamationNotification(
        reclamation_id=reclamation_id,
        destinataire_id=destinataire_id,
        message=message,
        type_notif=type_notif,
    )
    db.add(notif)

def notifier_admin_et_responsable(db: Session, r: Reclamation, message: str, type_notif: str, exclude_id: int = None):
    """Notifier tous les admins + le responsable assigné."""
    admins = db.query(User).filter(User.role.in_(['ADMIN', 'MANAGER'])).all()
    notified_ids = set()
    for admin in admins:
        if admin.id != exclude_id:
            notifier(db, r.id, admin.id, message, type_notif)
            notified_ids.add(admin.id)
    if r.responsable_id and r.responsable_id not in notified_ids and r.responsable_id != exclude_id:
        notifier(db, r.id, r.responsable_id, message, type_notif)

def reclamation_to_dict(r: Reclamation) -> dict:
    return {
        "id": r.id,
        "titre": r.titre,
        "description": r.description,
        "categorie": r.categorie,
        "priorite": r.priorite,
        "statut": r.statut,
        "soumetteur_id": r.soumetteur_id,
        "soumetteur_nom": r.soumetteur_nom,
        "responsable_id": r.responsable_id,
        "responsable_nom": r.responsable_nom,
        "numero_pdv": r.numero_pdv,
        "nom_pdv": r.nom_pdv,
        "reponse": r.reponse,
        "date_limite": r.date_limite.isoformat() if r.date_limite else None,
        "date_prise_en_charge": r.date_prise_en_charge.isoformat() if r.date_prise_en_charge else None,
        "date_resolution": r.date_resolution.isoformat() if r.date_resolution else None,
        "note_satisfaction": r.note_satisfaction,
        "escaladee": r.escaladee,
        "escalade_raison": r.escalade_raison,
        "nb_relances": r.nb_relances,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        # Calcul SLA
        "jours_depuis_creation": (datetime.utcnow() - r.created_at).days if r.created_at else 0,
        "en_retard": (datetime.utcnow() - r.created_at) > timedelta(hours=72) and r.statut not in ('RESOLUE', 'CLOTUREE'),
    }

# ─── ROUTES RÉCLAMATIONS ─────────────────────────────────────────────────────

@router.get("/reclamations")
def list_reclamations(
    statut: Optional[str] = None,
    categorie: Optional[str] = None,
    priorite: Optional[str] = None,
    mes_reclamations: bool = False,
    a_traiter: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste des réclamations selon le rôle."""
    q = db.query(Reclamation)

    if mes_reclamations:
        q = q.filter(Reclamation.soumetteur_id == current_user.id)
    elif a_traiter:
        q = q.filter(Reclamation.responsable_id == current_user.id)
    elif current_user.role not in ('ADMIN', 'MANAGER'):
        # Non-admin : voit ses réclamations + celles qu'il doit traiter
        q = q.filter(
            (Reclamation.soumetteur_id == current_user.id) |
            (Reclamation.responsable_id == current_user.id)
        )

    if statut:
        q = q.filter(Reclamation.statut == statut)
    if categorie:
        q = q.filter(Reclamation.categorie == categorie)
    if priorite:
        q = q.filter(Reclamation.priorite == priorite)

    total = q.count()
    reclamations = q.order_by(Reclamation.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [reclamation_to_dict(r) for r in reclamations]
    }


@router.post("/reclamations")
def create_reclamation(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soumettre une nouvelle réclamation."""
    nom_complet = f"{current_user.prenom or ''} {current_user.nom or ''}".strip() or current_user.email

    # Trouver le responsable
    responsable = None
    responsable_nom = None
    if data.get("responsable_id"):
        responsable = db.query(User).filter(User.id == data["responsable_id"]).first()
        if responsable:
            responsable_nom = f"{responsable.prenom or ''} {responsable.nom or ''}".strip()

    r = Reclamation(
        titre=data["titre"],
        description=data["description"],
        categorie=data.get("categorie", "AUTRE"),
        priorite=data.get("priorite", "NORMAL"),
        statut="OUVERTE",
        soumetteur_id=current_user.id,
        soumetteur_nom=nom_complet,
        responsable_id=data.get("responsable_id"),
        responsable_nom=responsable_nom,
        numero_pdv=data.get("numero_pdv"),
        nom_pdv=data.get("nom_pdv"),
        date_limite=datetime.fromisoformat(data["date_limite"]) if data.get("date_limite") else None,
    )
    db.add(r)
    db.flush()

    # Notifications
    msg_admin = f"📣 Nouvelle réclamation de {nom_complet} → {responsable_nom or 'Non assigné'} : \"{r.titre}\" [{r.priorite}]"
    msg_resp = f"📣 {nom_complet} vous a assigné une réclamation : \"{r.titre}\" [{r.priorite}]. Merci de traiter dans les 72h."

    # Notifier admins
    admins = db.query(User).filter(User.role.in_(['ADMIN', 'MANAGER'])).all()
    for admin in admins:
        if admin.id != current_user.id:
            notifier(db, r.id, admin.id, msg_admin, "NOUVELLE")

    # Notifier responsable
    if responsable and responsable.id not in [a.id for a in admins]:
        notifier(db, r.id, responsable.id, msg_resp, "NOUVELLE")

    db.commit()
    db.refresh(r)
    return reclamation_to_dict(r)


@router.get("/reclamations/{rec_id}")
def get_reclamation(
    rec_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Reclamation).filter(Reclamation.id == rec_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Réclamation non trouvée")

    # Récupérer les commentaires
    commentaires = db.query(ReclamationCommentaire).filter(
        ReclamationCommentaire.reclamation_id == rec_id
    ).order_by(ReclamationCommentaire.created_at.asc()).all()

    data = reclamation_to_dict(r)
    data["commentaires"] = [{
        "id": c.id,
        "auteur_nom": c.auteur_nom,
        "auteur_role": c.auteur_role,
        "contenu": c.contenu,
        "est_interne": c.est_interne,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    } for c in commentaires]

    return data


@router.patch("/reclamations/{rec_id}")
def update_reclamation(
    rec_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mettre à jour statut, réponse, assignation, satisfaction."""
    r = db.query(Reclamation).filter(Reclamation.id == rec_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Réclamation non trouvée")

    nom_complet = f"{current_user.prenom or ''} {current_user.nom or ''}".strip()
    ancien_statut = r.statut
    type_notif = "MISE_A_JOUR"
    msg = None

    # Changement de statut
    if "statut" in data:
        r.statut = data["statut"]
        r.updated_at = datetime.utcnow()

        if data["statut"] == "EN_COURS" and not r.date_prise_en_charge:
            r.date_prise_en_charge = datetime.utcnow()
            msg = f"✅ {nom_complet} a pris en charge votre réclamation : \"{r.titre}\""
            type_notif = "PRISE_EN_CHARGE"

        elif data["statut"] == "RESOLUE":
            r.date_resolution = datetime.utcnow()
            r.reponse = data.get("reponse", r.reponse)
            msg = f"✅ Votre réclamation \"{r.titre}\" a été résolue par {nom_complet}. Réponse : {r.reponse or '—'}"
            type_notif = "RESOLUTION"

        elif data["statut"] == "CLOTUREE":
            msg = f"🔒 Réclamation \"{r.titre}\" clôturée."
            type_notif = "CLOTURE"

        elif data["statut"] == "REOUVERTE":
            msg = f"🔄 {nom_complet} a réouvert la réclamation : \"{r.titre}\""
            type_notif = "REOUVERTURE"

        elif data["statut"] == "ESCALADEE":
            r.escaladee = True
            r.escalade_raison = data.get("escalade_raison")
            msg = f"⚠️ Réclamation escaladée par {nom_complet} : \"{r.titre}\". Raison : {r.escalade_raison}"
            type_notif = "ESCALADE"

    # Réponse sans changement de statut
    if "reponse" in data:
        r.reponse = data["reponse"]

    # Note de satisfaction (soumetteur uniquement)
    if "note_satisfaction" in data and current_user.id == r.soumetteur_id:
        r.note_satisfaction = data["note_satisfaction"]

    # Réassignation
    if "responsable_id" in data:
        new_resp = db.query(User).filter(User.id == data["responsable_id"]).first()
        if new_resp:
            r.responsable_id = new_resp.id
            r.responsable_nom = f"{new_resp.prenom or ''} {new_resp.nom or ''}".strip()
            msg = f"👤 Réclamation \"{r.titre}\" réassignée à {r.responsable_nom} par {nom_complet}"
            type_notif = "REASSIGNATION"

    # Envoyer notifications
    if msg:
        # Notifier soumetteur
        if r.soumetteur_id != current_user.id:
            notifier(db, r.id, r.soumetteur_id, msg, type_notif)
        # Notifier admins + responsable
        notifier_admin_et_responsable(db, r, msg, type_notif, exclude_id=current_user.id)

    db.commit()
    return reclamation_to_dict(r)


@router.post("/reclamations/{rec_id}/commentaires")
def add_commentaire(
    rec_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Reclamation).filter(Reclamation.id == rec_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Réclamation non trouvée")

    nom_complet = f"{current_user.prenom or ''} {current_user.nom or ''}".strip()
    c = ReclamationCommentaire(
        reclamation_id=rec_id,
        auteur_id=current_user.id,
        auteur_nom=nom_complet,
        auteur_role=current_user.role,
        contenu=data["contenu"],
        est_interne=data.get("est_interne", False),
    )
    db.add(c)

    # Notifier les parties prenantes
    msg = f"💬 {nom_complet} a commenté la réclamation \"{r.titre}\" : \"{data['contenu'][:80]}...\""
    parties = set()
    if r.soumetteur_id != current_user.id:
        parties.add(r.soumetteur_id)
    if r.responsable_id and r.responsable_id != current_user.id:
        parties.add(r.responsable_id)

    for uid in parties:
        notifier(db, rec_id, uid, msg, "COMMENTAIRE")

    # Admins
    admins = db.query(User).filter(User.role.in_(['ADMIN', 'MANAGER'])).all()
    for admin in admins:
        if admin.id != current_user.id and admin.id not in parties:
            notifier(db, rec_id, admin.id, msg, "COMMENTAIRE")

    db.commit()
    return {"success": True, "commentaire": {"auteur_nom": nom_complet, "contenu": data["contenu"]}}


@router.get("/reclamations-notifications")
def get_notifications(
    non_lues_seulement: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ReclamationNotification).filter(
        ReclamationNotification.destinataire_id == current_user.id
    )
    if non_lues_seulement:
        q = q.filter(ReclamationNotification.lue == False)
    notifs = q.order_by(ReclamationNotification.created_at.desc()).limit(50).all()
    total_non_lues = db.query(ReclamationNotification).filter(
        ReclamationNotification.destinataire_id == current_user.id,
        ReclamationNotification.lue == False
    ).count()

    return {
        "total_non_lues": total_non_lues,
        "notifications": [{
            "id": n.id,
            "reclamation_id": n.reclamation_id,
            "message": n.message,
            "type_notif": n.type_notif,
            "lue": n.lue,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        } for n in notifs]
    }


@router.post("/reclamations-notifications/marquer-lues")
def marquer_lues(
    data: dict = {},
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ReclamationNotification).filter(
        ReclamationNotification.destinataire_id == current_user.id,
        ReclamationNotification.lue == False,
    )
    if data.get("ids"):
        q = q.filter(ReclamationNotification.id.in_(data["ids"]))
    q.update({"lue": True}, synchronize_session=False)
    db.commit()
    return {"success": True}


@router.get("/reclamations/stats/dashboard")
def stats_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stats globales pour le dashboard admin."""
    all_rec = db.query(Reclamation).all()
    maintenant = datetime.utcnow()

    return {
        "total": len(all_rec),
        "ouvertes": sum(1 for r in all_rec if r.statut == "OUVERTE"),
        "en_cours": sum(1 for r in all_rec if r.statut == "EN_COURS"),
        "resolues": sum(1 for r in all_rec if r.statut == "RESOLUE"),
        "cloturees": sum(1 for r in all_rec if r.statut == "CLOTUREE"),
        "en_retard": sum(1 for r in all_rec if r.statut not in ('RESOLUE','CLOTUREE') and (maintenant - r.created_at).days > 3),
        "urgentes": sum(1 for r in all_rec if r.priorite == "URGENT" and r.statut not in ('RESOLUE','CLOTUREE')),
        "escaladees": sum(1 for r in all_rec if r.escaladee),
        "taux_resolution": round(sum(1 for r in all_rec if r.statut in ('RESOLUE','CLOTUREE')) / len(all_rec) * 100) if all_rec else 0,
        "par_categorie": {cat: sum(1 for r in all_rec if r.categorie == cat) for cat in ['PDV','PERSONNEL','LOGISTIQUE','FINANCE','TECHNIQUE','AUTRE']},
        "par_priorite": {p: sum(1 for r in all_rec if r.priorite == p) for p in ['URGENT','NORMAL','FAIBLE']},
    }
