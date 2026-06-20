"""API pour la gestion des permissions par rôle et par utilisateur"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, JSON
from app.core.database import Base, get_db
from app.models.user import User, UserRole
from app.api.routes.auth import get_current_user, require_admin

router = APIRouter()

# ── Modèle stockant les permissions par rôle ─────────────────────────────────
class RolePermission(Base):
    __tablename__ = "role_permissions"
    id = Column(Integer, primary_key=True)
    role_id = Column(String, unique=True, nullable=False)
    permissions = Column(JSON, nullable=False, default=dict)
    sidebar_config = Column(JSON, nullable=False, default=dict)

# ── Menus par défaut tous rôles non-admin ─────────────────────────────────────
DEFAULT_MENUS_NON_ADMIN = ["pdvs", "prospection", "evaluations", "alerts"]
DEFAULT_DASHBOARDS_NON_ADMIN = ["omy", "nafama", "kaabu"]

# ── Permissions sidebar par défaut ──────────────────────────────────────────
DEFAULT_SIDEBAR = {
    "admin": {
        "dashboards": ["omy","nafama","kaabu"],
        "menus": ["pdvs","prospection","indicateurs","commissions","evaluations","alerts","reseau","ia","carte","recovery","import","reports","settings"],
    },
    # Tous les autres rôles : menus de base uniquement (+ extras attribués par admin)
    "manager":         {"dashboards": DEFAULT_DASHBOARDS_NON_ADMIN, "menus": DEFAULT_MENUS_NON_ADMIN},
    "superviseur":     {"dashboards": DEFAULT_DASHBOARDS_NON_ADMIN, "menus": DEFAULT_MENUS_NON_ADMIN},
    "rc":              {"dashboards": DEFAULT_DASHBOARDS_NON_ADMIN, "menus": DEFAULT_MENUS_NON_ADMIN},
    "developpeur":     {"dashboards": DEFAULT_DASHBOARDS_NON_ADMIN, "menus": DEFAULT_MENUS_NON_ADMIN},
    "teleconseillere": {"dashboards": DEFAULT_DASHBOARDS_NON_ADMIN, "menus": DEFAULT_MENUS_NON_ADMIN},
}

# ── Menus additionnels disponibles (que l'admin peut attribuer) ───────────────
EXTRA_MENUS_AVAILABLE = [
    {"id": "indicateurs",  "label": "Indicateurs"},
    {"id": "commissions",  "label": "Commissions"},
    {"id": "reseau",       "label": "Gestion Réseau"},
    {"id": "ia",           "label": "Intelligence IA"},
    {"id": "carte",        "label": "Carte"},
    {"id": "recovery",     "label": "Recovery"},
    {"id": "reports",      "label": "Rapports"},
    {"id": "settings",     "label": "Paramètres"},
    {"id": "import",       "label": "Import (admin only)"},
]


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
def reset_permissions(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Réinitialise toutes les permissions aux valeurs par défaut (admin only)"""
    db.query(RolePermission).delete()
    db.commit()
    return {"success": True, "message": "Permissions réinitialisées aux valeurs par défaut"}


# ─────────────────────────────────────────────────────────────────────────────
# Permissions par UTILISATEUR (extra menus attribués par l'admin)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/my-permissions")
def get_my_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retourne les permissions complètes de l'utilisateur connecté."""
    role = (current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)).lower()

    # Admin : tout
    if role == "admin":
        return {
            "role": role,
            "menus": DEFAULT_SIDEBAR["admin"]["menus"],
            "dashboards": DEFAULT_SIDEBAR["admin"]["dashboards"],
            "is_admin": True,
        }

    # Menus de base
    base_menus = list(DEFAULT_MENUS_NON_ADMIN)
    base_dashboards = list(DEFAULT_DASHBOARDS_NON_ADMIN)

    # Extras attribués par l'admin (stockés dans role_permissions avec role_id = "user_{id}")
    user_key = f"user_{current_user.id}"
    row = db.query(RolePermission).filter(RolePermission.role_id == user_key).first()
    extra_menus = []
    if row and row.sidebar_config:
        extra_menus = row.sidebar_config.get("extra_menus", [])

    all_menus = list(set(base_menus + extra_menus))

    return {
        "role": role,
        "menus": all_menus,
        "dashboards": base_dashboards,
        "extra_menus": extra_menus,
        "is_admin": False,
    }


@router.get("/user-permissions/{user_id}")
def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Retourne les extras attribués à un utilisateur spécifique (admin only)."""
    user_key = f"user_{user_id}"
    row = db.query(RolePermission).filter(RolePermission.role_id == user_key).first()
    extra_menus = row.sidebar_config.get("extra_menus", []) if row else []
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    return {
        "user_id": user_id,
        "email": user.email,
        "nom": user.nom,
        "role": user.role,
        "extra_menus": extra_menus,
        "available_extra_menus": EXTRA_MENUS_AVAILABLE,
    }


@router.put("/user-permissions/{user_id}")
def set_user_permissions(
    user_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Attribue des menus extras à un utilisateur (admin only)."""
    extra_menus = body.get("extra_menus", [])
    user_key = f"user_{user_id}"
    row = db.query(RolePermission).filter(RolePermission.role_id == user_key).first()
    if row:
        row.sidebar_config = {"extra_menus": extra_menus}
    else:
        row = RolePermission(
            role_id=user_key,
            sidebar_config={"extra_menus": extra_menus},
            permissions={},
        )
        db.add(row)
    db.commit()
    return {"success": True, "user_id": user_id, "extra_menus": extra_menus}


@router.get("/all-users-permissions")
def get_all_users_permissions(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Liste tous les utilisateurs avec leurs permissions (admin only)."""
    users = db.query(User).filter(User.is_active == True).all()
    result = []
    for u in users:
        user_key = f"user_{u.id}"
        row = db.query(RolePermission).filter(RolePermission.role_id == user_key).first()
        extra_menus = row.sidebar_config.get("extra_menus", []) if row else []
        result.append({
            "id": u.id,
            "email": u.email,
            "nom": u.nom,
            "prenom": u.prenom,
            "role": u.role,
            "extra_menus": extra_menus,
        })
    return {"users": result, "available_extra_menus": EXTRA_MENUS_AVAILABLE}
