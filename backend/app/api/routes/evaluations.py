"""Routes API Évaluations 360°."""
from typing import Optional, List
from fastapi import APIRouter, Depends, Body, Query
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.models.evaluation import EvalRoleType, EvalStatus, EvalManualNote, EvalObjective
from app.services import (
    eval_service as svc,
    eval_mystery_service as mystery_svc,
    eval_config_service as cfg_svc,
    eval_report_service as report_svc,
)

router = APIRouter(prefix="/evaluations", tags=["Évaluations"])


# ── CONFIG ────────────────────────────────────────────────────────────────
@router.get("/configs")
def all_configs(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return cfg_svc.all_configs(db)

@router.get("/configs/{role_type}")
def get_config(role_type: EvalRoleType, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return cfg_svc.get_config(db, role_type)

@router.put("/configs/{role_type}")
def update_config(role_type: EvalRoleType, payload: dict = Body(...),
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"id": cfg_svc.update_config(db, role_type, payload, current_user.id).id, "updated": True}

@router.post("/configs/{role_type}/reset")
def reset_config(role_type: EvalRoleType, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cfg_svc.reset_config(db, role_type, current_user.id)


# ── CAMPAGNES ─────────────────────────────────────────────────────────────
@router.get("/campaigns")
def list_campaigns(role_type: Optional[EvalRoleType] = None, status: Optional[EvalStatus] = None,
                   db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.list_campaigns(db, role_type, status)

@router.post("/campaigns")
def create_campaign(payload: dict = Body(...), db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    c = svc.create_campaign(db, payload, current_user.id)
    return {"id": c.id, "name": c.name, "status": c.status.value}

@router.get("/campaigns/{campaign_id}")
def get_campaign(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.get_campaign(db, campaign_id)

@router.post("/campaigns/{campaign_id}/generate-mystery")
def generate_mystery(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return mystery_svc.generate_mystery_tasks(db, campaign_id)

@router.post("/campaigns/{campaign_id}/compute")
def compute_all(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.compute_all_scores(db, campaign_id)

@router.post("/campaigns/{campaign_id}/close")
def close_campaign(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    c = svc.close_campaign(db, campaign_id)
    return {"id": c.id, "status": c.status.value, "closed_at": c.closed_at.isoformat()}

@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Supprimer une campagne et toutes ses données associées."""
    from app.models.evaluation import EvalCampaign, EvalScore, EvalManualNote, EvalObjective, MysteryCallTask, MysteryCallLog
    camp = db.query(EvalCampaign).get(campaign_id)
    if not camp:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    # Supprimer les logs d'appels mystères
    task_ids = [t.id for t in db.query(MysteryCallTask).filter(MysteryCallTask.campaign_id == campaign_id).all()]
    if task_ids:
        db.query(MysteryCallLog).filter(MysteryCallLog.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(MysteryCallTask).filter(MysteryCallTask.campaign_id == campaign_id).delete(synchronize_session=False)
    db.query(EvalManualNote).filter(EvalManualNote.campaign_id == campaign_id).delete(synchronize_session=False)
    db.query(EvalObjective).filter(EvalObjective.campaign_id == campaign_id).delete(synchronize_session=False)
    db.query(EvalScore).filter(EvalScore.campaign_id == campaign_id).delete(synchronize_session=False)
    db.delete(camp)
    db.commit()
    return {"deleted": True, "campaign_id": campaign_id}

@router.post("/campaigns/{campaign_id}/generate-mystery-for-agent")
def generate_mystery_for_agent(campaign_id: int, payload: dict = Body(...),
                                db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Générer 10 appels mystères pour un agent spécifique avec une TC spécifique."""
    agent_id = payload.get("agent_id")
    tc_id = payload.get("tc_id")
    if not agent_id or not tc_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="agent_id et tc_id sont requis")
    return mystery_svc.generate_mystery_for_agent(db, campaign_id, agent_id, tc_id)

@router.get("/campaigns/{campaign_id}/scores")
def list_scores(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.get_campaign(db, campaign_id)

@router.get("/campaigns/{campaign_id}/scores/{user_id}")
def get_score(campaign_id: int, user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.evaluation import EvalScore
    s = db.query(EvalScore).filter(EvalScore.campaign_id == campaign_id, EvalScore.user_id == user_id).first()
    if not s:
        return {"message": "Score non calculé"}
    u = s.user
    return {
        "user_id": user_id,
        "user_name": f"{u.prenom or ''} {u.nom}".strip() if u else "—",
        "role": u.role.value if u else "—",
        "score_final": s.score_final, "score_label": s.score_label,
        "score_kpi": s.score_kpi, "score_mystery": s.score_mystery,
        "score_manual": s.score_manual, "rank": s.rank,
        "kpi_data": s.kpi_data, "manual_notes": s.manual_notes,
        "ai_improvement_plan": s.ai_improvement_plan,
        "bonus_amount": s.bonus_amount, "is_final": s.is_final,
        "computed_at": s.computed_at.isoformat() if s.computed_at else None,
    }

@router.post("/campaigns/{campaign_id}/scores/{user_id}/compute")
def compute_one(campaign_id: int, user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = svc.compute_score(db, campaign_id, user_id)
    return {"score_final": s.score_final, "score_label": s.score_label, "bonus": s.bonus_amount}

@router.post("/campaigns/{campaign_id}/scores/{user_id}/manual-note")
def add_manual_note(campaign_id: int, user_id: int, payload: dict = Body(...),
                    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = EvalManualNote(
        campaign_id=campaign_id, user_id=user_id,
        criterion=payload["criterion"],
        note=float(payload["note"]),
        max_note=float(payload.get("max_note", 10)),
        comment=payload.get("comment"),
        added_by_id=current_user.id,
    )
    db.add(note); db.commit()
    return {"id": note.id, "criterion": note.criterion, "note": note.note}

@router.get("/campaigns/{campaign_id}/scores/{user_id}/pdf")
def download_pdf(campaign_id: int, user_id: int,
                 db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    content = report_svc.generate_pdf(db, campaign_id, user_id)
    from app.models.evaluation import EvalScore
    s = db.query(EvalScore).filter(EvalScore.campaign_id == campaign_id, EvalScore.user_id == user_id).first()
    u = s.user if s else None
    fname = f"eval_{u.nom if u else user_id}_{campaign_id}.pdf"
    ct = "application/pdf" if content[:4] == b"%PDF" else "text/plain"
    return StreamingResponse(BytesIO(content), media_type=ct,
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})

# ── APPELS MYSTÈRES ───────────────────────────────────────────────────────
@router.get("/mystery/tasks")
def list_mystery_tasks(campaign_id: Optional[int] = None,
                       db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Liste toutes les tâches d'appels mystères d'une campagne (pour affichage après génération)."""
    from app.models.evaluation import MysteryCallTask
    q = db.query(MysteryCallTask)
    if campaign_id:
        q = q.filter(MysteryCallTask.campaign_id == campaign_id)
    tasks = q.all()
    return [{
        "id": t.id, "campaign_id": t.campaign_id,
        "call_type": t.call_type.value, "status": t.status.value,
        "question": t.question,
        "pdv_id": t.pdv_id,
        "pdv_numero": t.pdv.numero_pdv if t.pdv else None,
        "pdv_nom": getattr(t.pdv, "nom", None) if t.pdv else None,
        "pdv_telephone": t.pdv.telephone if t.pdv else None,
        "target_user_name": f"{t.target_user.prenom or ''} {t.target_user.nom}".strip() if t.target_user else "—",
        "tc_user_name": f"{t.tc_user.prenom or ''} {t.tc_user.nom}".strip() if t.tc_user else "—",
    } for t in tasks]

@router.get("/mystery/my-queue")
def my_mystery_queue(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return mystery_svc.my_mystery_queue(db, current_user.id)

@router.post("/mystery/{task_id}/log")
def log_mystery(task_id: int, payload: dict = Body(...),
                db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    log = mystery_svc.log_mystery_call(db, task_id, current_user.id, payload)
    return {"id": log.id, "note": log.note, "outcome": log.outcome}

@router.get("/mystery/stats/{campaign_id}")
def mystery_stats(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return mystery_svc.mystery_stats(db, campaign_id)

@router.get("/mystery/geo-test/{campaign_id}/{agent_id}")
def geo_test(campaign_id: int, agent_id: int,
             db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return mystery_svc.geo_knowledge_test(db, campaign_id, agent_id)

# ── DASHBOARD ─────────────────────────────────────────────────────────────
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.dashboard(db)

# ── OBJECTIFS ─────────────────────────────────────────────────────────────
@router.post("/objectives")
def create_objective(payload: dict = Body(...), db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    from sqlalchemy import and_
    existing = db.query(EvalObjective).filter(
        EvalObjective.campaign_id == payload["campaign_id"],
        EvalObjective.user_id == payload["user_id"],
        EvalObjective.criterion == payload["criterion"],
    ).first()
    if existing:
        existing.target_value = payload["target_value"]
        existing.unit = payload.get("unit")
        existing.bonus_if_reached = payload.get("bonus_if_reached", 0)
    else:
        existing = EvalObjective(
            campaign_id=payload["campaign_id"],
            user_id=payload["user_id"],
            criterion=payload["criterion"],
            target_value=payload["target_value"],
            unit=payload.get("unit"),
            bonus_if_reached=payload.get("bonus_if_reached", 0),
            proposed_by_id=current_user.id,
        )
        db.add(existing)
    db.commit()
    return {"id": existing.id, "criterion": existing.criterion, "target": existing.target_value}

@router.get("/objectives")
def list_objectives(campaign_id: Optional[int] = None, user_id: Optional[int] = None,
                    db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    q = db.query(EvalObjective)
    if campaign_id: q = q.filter(EvalObjective.campaign_id == campaign_id)
    if user_id: q = q.filter(EvalObjective.user_id == user_id)
    return [{"id": o.id, "campaign_id": o.campaign_id, "user_id": o.user_id,
             "criterion": o.criterion, "target_value": o.target_value,
             "actual_value": o.actual_value, "unit": o.unit,
             "bonus_if_reached": o.bonus_if_reached, "status": o.status}
            for o in q.all()]

@router.patch("/objectives/{obj_id}/validate")
def validate_objective(obj_id: int, status: str = Query("VALIDATED"),
                       db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    o = db.query(EvalObjective).get(obj_id)
    if not o: return {"error": "Not found"}
    o.status = status; o.validated_by_id = current_user.id
    db.commit()
    return {"id": o.id, "status": o.status}
