"""API pour la gestion des permissions par rôle — stockées en base de données"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, JSON
from app.core.database import Base, get_db, engine
from datetime import datetime

router = APIRouter()

# ── Modèle simple stockant les permissions par rôle ──────────────────────────
class RolePermission(Base):
    __tablename__ = "role_permissions"
    id = Column(Integer, primary_key=True)
    role_id = Column(String, unique=True, nullable=False)
    permissions = Column(JSON, nullable=False, default=dict)
    sidebar_config = Column(JSON, nullable=False, default=dict)

# Créer la table si elle n'existe pas
Base.metadata.create_all(bind=engine)

# ── Permissions sidebar par défaut ──────────────────────────────────────────
DEFAULT_SIDEBAR = {
    "admin":          {"dashboards": ["omy","nafama","kaabu"], "menus": ["pdvs","prospection","indicateurs","commissions","evaluations","alerts","reseau","ia","carte","recovery","import","reports","settings"]},
    "manager":        {"dashboards": ["omy","nafama","kaabu"], "menus": ["pdvs","prospection","indicateurs","commissions","evaluations","alerts","reseau","ia","carte","recovery","reports","settings"]},
    "superviseur":    {"dashboards": ["omy"],                  "menus": ["pdvs","prospection","indicateurs","alerts","reseau","carte","recovery"]},
    "rc":             {"dashboards": ["omy"],                  "menus": ["pdvs","commissions","alerts","recovery"]},
    "developpeur":    {"dashboards": [],                       "menus": ["prospection","alerts","reseau"]},
    "teleconseillere":{"dashboards": [],                       "menus": ["prospection","indicateurs","alerts"]},
}


@router.get("/role-permissions")
def get_all_permissions(db: Session = Depends(get_db)):
    """Retourne les permissions sidebar pour tous les rôles"""
    rows = db.query(RolePermission).all()
    result = dict(DEFAULT_SIDEBAR)  # partir des défauts
    for row in rows:
        result[row.role_id] = row.sidebar_config
    return result


@router.get("/role-permissions/{role_id}")
def get_role_permissions(role_id: str, db: Session = Depends(get_db)):
    """Retourne les permissions sidebar pour un rôle spécifique"""
    row = db.query(RolePermission).filter(RolePermission.role_id == role_id).first()
    if row:
        return row.sidebar_config
    return DEFAULT_SIDEBAR.get(role_id, {"dashboards": [], "menus": []})


@router.post("/role-permissions")
def save_all_permissions(body: dict, db: Session = Depends(get_db)):
    """Sauvegarde les permissions sidebar pour tous les rôles"""
    sidebar_config = body.get("sidebar_config", {})
    permissions = body.get("permissions", {})

    for role_id, config in sidebar_config.items():
        row = db.query(RolePermission).filter(RolePermission.role_id == role_id).first()
        if row:
            row.sidebar_config = config
            row.permissions = permissions.get(role_id, {})
        else:
            row = RolePermission(
                role_id=role_id,
                sidebar_config=config,
                permissions=permissions.get(role_id, {}),
            )
            db.add(row)

    db.commit()
    return {"success": True, "message": "Permissions sauvegardées avec succès"}


@router.put("/role-permissions/{role_id}")
def update_role_permissions(role_id: str, body: dict, db: Session = Depends(get_db)):
    """Met à jour les permissions d'un rôle spécifique"""
    row = db.query(RolePermission).filter(RolePermission.role_id == role_id).first()
    if row:
        row.sidebar_config = body.get("sidebar_config", row.sidebar_config)
        row.permissions = body.get("permissions", row.permissions)
    else:
        row = RolePermission(
            role_id=role_id,
            sidebar_config=body.get("sidebar_config", {}),
            permissions=body.get("permissions", {}),
        )
        db.add(row)
    db.commit()
    return {"success": True}


@router.post("/role-permissions/reset")
def reset_permissions(db: Session = Depends(get_db)):
    """Réinitialise toutes les permissions aux valeurs par défaut"""
    db.query(RolePermission).delete()
    db.commit()
    return {"success": True, "message": "Permissions réinitialisées aux valeurs par défaut"}
