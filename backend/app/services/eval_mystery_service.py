"""Service Appels Mystères."""
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import random
from fastapi import HTTPException

from app.models.evaluation import (
    EvalCampaign, MysteryCallTask, MysteryCallLog,
    MysteryCallStatus, MysteryCallType, EvalRoleType,
)
from app.models.pdv import PDV
from app.models.user import User, UserRole
from app.services import eval_config_service as cfg_svc

QUESTIONS = {
    MysteryCallType.LAST_VISIT: "Bonjour, pouvez-vous me dire quand votre {role} est passé vous voir pour la dernière fois ?",
    MysteryCallType.GEO_KNOWLEDGE: "[Test terrain] Donnez-moi la localisation précise de ce PDV : {pdv_numero} — {pdv_nom}",
    MysteryCallType.QUALITY_CHECK: "Bonjour, avez-vous été contacté récemment par {agent_nom} ? Comment s'est passée l'interaction ?",
}

ROLE_LABELS = {
    EvalRoleType.SUPERVISEUR: "superviseur",
    EvalRoleType.GESTIONNAIRE: "gestionnaire",
    EvalRoleType.DEVELOPPEUR: "développeur",
    EvalRoleType.TELECONSEILLERE: "téléconseillère",
}


def generate_mystery_tasks(db: Session, campaign_id: int) -> Dict[str, Any]:
    c = db.query(EvalCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")

    cfg = c.config_snapshot or cfg_svc.get_config(db, c.role_type)
    role_map = {
        EvalRoleType.SUPERVISEUR: UserRole.SUPERVISEUR,
        EvalRoleType.GESTIONNAIRE: UserRole.MANAGER,
        EvalRoleType.DEVELOPPEUR: UserRole.DEVELOPPEUR,
        EvalRoleType.TELECONSEILLERE: UserRole.TELECONSEILLERE,
    }
    user_role = role_map.get(c.role_type)

    if c.target_user_ids:
        agents = db.query(User).filter(User.id.in_(c.target_user_ids)).all()
    elif user_role:
        agents = db.query(User).filter(User.role == user_role, User.is_active == True).all()
    else:
        agents = []

    # TC assignées
    if c.mystery_call_user_ids:
        tcs = db.query(User).filter(User.id.in_(c.mystery_call_user_ids)).all()
    else:
        tcs = db.query(User).filter(User.role == UserRole.TELECONSEILLERE, User.is_active == True).all()

    if not tcs:
        raise HTTPException(400, "Aucune téléconseillère disponible pour les appels mystères")

    all_pdvs = db.query(PDV).filter(PDV.telephone.isnot(None)).all()
    if not all_pdvs:
        raise HTTPException(400, "Aucun PDV avec téléphone dans la base")

    n_calls = c.n_mystery_calls or 5
    # Déterminer les types d'appels selon le rôle
    call_types = [MysteryCallType.LAST_VISIT]
    if c.role_type == EvalRoleType.SUPERVISEUR:
        call_types = [MysteryCallType.LAST_VISIT, MysteryCallType.GEO_KNOWLEDGE]
    elif c.role_type in (EvalRoleType.DEVELOPPEUR, EvalRoleType.TELECONSEILLERE):
        call_types = [MysteryCallType.QUALITY_CHECK]

    created = 0
    for i, agent in enumerate(agents):
        agent_nom = f"{agent.prenom or ''} {agent.nom}".strip()
        role_label = ROLE_LABELS.get(c.role_type, "agent")
        pdvs_sample = random.sample(all_pdvs, min(n_calls, len(all_pdvs)))

        for j, pdv in enumerate(pdvs_sample):
            tc = tcs[created % len(tcs)]
            call_type = call_types[j % len(call_types)]
            question = QUESTIONS[call_type].format(
                role=role_label, agent_nom=agent_nom,
                pdv_numero=pdv.numero_pdv or str(pdv.id),
                pdv_nom=getattr(pdv, "nom", None) or "—",
            )
            db.add(MysteryCallTask(
                campaign_id=campaign_id, target_user_id=agent.id,
                pdv_id=pdv.id, tc_user_id=tc.id, call_type=call_type,
                status=MysteryCallStatus.PENDING, question=question,
            ))
            created += 1
    db.commit()
    return {"created": created, "agents": len(agents), "tcs": len(tcs)}


def my_mystery_queue(db: Session, tc_user_id: int) -> List[Dict[str, Any]]:
    user = db.query(User).get(tc_user_id)
    is_admin_rc = user and user.role in (UserRole.ADMIN, UserRole.RC)

    if is_admin_rc:
        # Admin et RC voient toutes les tâches pending de toutes les campagnes
        tasks = db.query(MysteryCallTask).filter(
            MysteryCallTask.status == MysteryCallStatus.PENDING,
        ).all()
    else:
        tasks = db.query(MysteryCallTask).filter(
            MysteryCallTask.tc_user_id == tc_user_id,
            MysteryCallTask.status == MysteryCallStatus.PENDING,
        ).all()
    out = []
    for t in tasks:
        out.append({
            "id": t.id, "campaign_id": t.campaign_id,
            "call_type": t.call_type.value,
            "question": t.question,
            "pdv_id": t.pdv_id,
            "pdv_numero": t.pdv.numero_pdv if t.pdv else None,
            "pdv_nom": getattr(t.pdv, "nom", None) if t.pdv else None,
            "pdv_telephone": t.pdv.telephone if t.pdv else None,
            "target_user_name": f"{t.target_user.prenom or ''} {t.target_user.nom}".strip() if t.target_user else "—",
            "target_role": t.target_user.role.value if t.target_user else None,
            "tc_user_name": f"{t.tc_user.prenom or ''} {t.tc_user.nom}".strip() if t.tc_user else "—",
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return out


def log_mystery_call(db: Session, task_id: int, tc_user_id: int, payload: dict) -> MysteryCallLog:
    t = db.query(MysteryCallTask).get(task_id)
    if not t: raise HTTPException(404, "Tâche introuvable")
    if t.tc_user_id != tc_user_id:
        u = db.query(User).get(tc_user_id)
        if not u or u.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.RC):
            raise HTTPException(403, "Cette tâche ne vous est pas assignée")

    note = payload.get("note")
    if note is not None and not (0 <= float(note) <= 10):
        raise HTTPException(400, "La note doit être entre 0 et 10")

    log = MysteryCallLog(
        task_id=task_id, tc_user_id=tc_user_id,
        outcome=payload.get("outcome", "REACHED"),
        answer=payload.get("answer"),
        note=float(note) if note is not None else None,
        comment=payload.get("comment"),
        duration_sec=payload.get("duration_sec"),
    )
    db.add(log)
    t.status = MysteryCallStatus.DONE
    t.completed_at = datetime.utcnow()
    db.commit(); db.refresh(log)
    return log


def generate_mystery_for_agent(db: Session, campaign_id: int, agent_id: int, tc_id: int) -> Dict[str, Any]:
    """Génère 10 appels mystères pour un agent spécifique : 5 LAST_VISIT + 5 GEO_KNOWLEDGE."""
    c = db.query(EvalCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    agent = db.query(User).get(agent_id)
    if not agent: raise HTTPException(404, "Agent introuvable")
    tc = db.query(User).get(tc_id)
    if not tc: raise HTTPException(404, "TC introuvable")

    all_pdvs = db.query(PDV).filter(PDV.telephone.isnot(None)).all()
    if not all_pdvs:
        raise HTTPException(400, "Aucun PDV avec téléphone dans la base")

    # Supprimer les anciennes tâches PENDING pour cet agent dans cette campagne
    db.query(MysteryCallTask).filter(
        MysteryCallTask.campaign_id == campaign_id,
        MysteryCallTask.target_user_id == agent_id,
        MysteryCallTask.status == MysteryCallStatus.PENDING,
    ).delete(synchronize_session=False)

    agent_nom = f"{agent.prenom or ''} {agent.nom}".strip()
    role_label = ROLE_LABELS.get(c.role_type, "agent")

    # 5 PDV pour LAST_VISIT + 5 PDV pour GEO_KNOWLEDGE = 10 PDV
    pdvs_sample = random.sample(all_pdvs, min(10, len(all_pdvs)))
    last_visit_pdvs = pdvs_sample[:5]
    geo_pdvs = pdvs_sample[5:] if len(pdvs_sample) > 5 else pdvs_sample

    created_tasks = []
    for pdv in last_visit_pdvs:
        question = QUESTIONS[MysteryCallType.LAST_VISIT].format(
            role=role_label, agent_nom=agent_nom,
            pdv_numero=pdv.numero_pdv or str(pdv.id),
            pdv_nom=getattr(pdv, "nom", None) or "—",
        )
        t = MysteryCallTask(
            campaign_id=campaign_id, target_user_id=agent_id,
            pdv_id=pdv.id, tc_user_id=tc_id,
            call_type=MysteryCallType.LAST_VISIT,
            status=MysteryCallStatus.PENDING, question=question,
        )
        db.add(t)
        created_tasks.append(t)

    for pdv in geo_pdvs:
        question = QUESTIONS[MysteryCallType.GEO_KNOWLEDGE].format(
            role=role_label, agent_nom=agent_nom,
            pdv_numero=pdv.numero_pdv or str(pdv.id),
            pdv_nom=getattr(pdv, "nom", None) or "—",
        )
        t = MysteryCallTask(
            campaign_id=campaign_id, target_user_id=agent_id,
            pdv_id=pdv.id, tc_user_id=tc_id,
            call_type=MysteryCallType.GEO_KNOWLEDGE,
            status=MysteryCallStatus.PENDING, question=question,
        )
        db.add(t)
        created_tasks.append(t)

    db.commit()
    for t in created_tasks:
        db.refresh(t)

    return {
        "created": len(created_tasks),
        "agent_id": agent_id,
        "agent_name": agent_nom,
        "tc_id": tc_id,
        "tc_name": f"{tc.prenom or ''} {tc.nom}".strip(),
        "tasks": [{
            "id": t.id,
            "call_type": t.call_type.value,
            "pdv_id": t.pdv_id,
            "pdv_nom": getattr(t.pdv, "nom", None) if t.pdv else None,
            "pdv_numero": t.pdv.numero_pdv if t.pdv else None,
            "pdv_telephone": t.pdv.telephone if t.pdv else None,
            "question": t.question,
        } for t in created_tasks]
    }


def mystery_stats(db: Session, campaign_id: int) -> Dict[str, Any]:
    tasks = db.query(MysteryCallTask).filter(MysteryCallTask.campaign_id == campaign_id).all()
    done = [t for t in tasks if t.status == MysteryCallStatus.DONE]
    notes = [l.note for t in done for l in t.logs if l.note is not None]
    by_agent = {}
    for t in tasks:
        uid = t.target_user_id
        if uid not in by_agent:
            name = f"{t.target_user.prenom or ''} {t.target_user.nom}".strip() if t.target_user else "—"
            by_agent[uid] = {"user_id": uid, "name": name, "total": 0, "done": 0, "avg_note": None, "notes": []}
        by_agent[uid]["total"] += 1
        if t.status == MysteryCallStatus.DONE:
            by_agent[uid]["done"] += 1
            for l in t.logs:
                if l.note is not None:
                    by_agent[uid]["notes"].append(l.note)
    for d in by_agent.values():
        d["avg_note"] = round(sum(d["notes"]) / len(d["notes"]), 1) if d["notes"] else None
        del d["notes"]
    return {
        "total": len(tasks), "done": len(done), "pending": len(tasks) - len(done),
        "avg_note": round(sum(notes) / len(notes), 1) if notes else None,
        "by_agent": list(by_agent.values()),
    }


def geo_knowledge_test(db: Session, campaign_id: int, agent_user_id: int) -> List[Dict]:
    """Retourne 5 PDV aléatoires pour tester la connaissance terrain."""
    pdvs = db.query(PDV).filter(PDV.telephone.isnot(None)).all()
    sample = random.sample(pdvs, min(5, len(pdvs)))
    return [{
        "pdv_id": p.id,
        "pdv_numero": p.numero_pdv,
        "pdv_nom": getattr(p, "nom", None),
        "quartier_hidden": True,  # L'agent doit deviner
        "telephone": p.telephone,
    } for p in sample]
