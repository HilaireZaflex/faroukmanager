"""
Service Pièces Jointes (CNI, photos local).
============================================
- list_attachments
- upload                 : sauvegarde fichier (uploads/prospects/{id}/...)
- delete
- check_required         : vérifie qu'au moins une CNI + une photo sont présentes
"""
import os, uuid, shutil
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import UploadFile, HTTPException

from sqlalchemy.orm import Session
from app.models.prospect import ProspectAttachment, Prospect

UPLOAD_DIR = os.environ.get("PROSPECT_UPLOADS", "uploads/prospects")

# Garantit l'existence du dossier
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = {
    "PIECE_IDENTITE": {"image/jpeg", "image/png", "application/pdf"},
    "PHOTO_LOCAL_FACADE": {"image/jpeg", "image/png"},
    "PHOTO_LOCAL_INTERIEUR": {"image/jpeg", "image/png"},
    "AUTRE": {"image/jpeg", "image/png", "application/pdf"},
}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB


def list_attachments(db: Session, prospect_id: int) -> List[Dict[str, Any]]:
    items = db.query(ProspectAttachment).filter(
        ProspectAttachment.prospect_id == prospect_id
    ).order_by(ProspectAttachment.uploaded_at.desc()).all()
    return [{
        "id": a.id,
        "prospect_id": a.prospect_id,
        "kind": a.kind.value if hasattr(a.kind, "value") else str(a.kind),
        "filename": a.file_name,
        "url": f"/static/{a.file_path}" if a.file_path else None,
        "uploaded_at": a.uploaded_at.isoformat() if a.uploaded_at else None,
        "uploaded_by_id": a.uploaded_by_id,
        "size_bytes": a.size_bytes,
        "mime_type": a.mime_type,
    } for a in items]


def upload(db: Session, prospect_id: int, kind: str, file: UploadFile, user_id: int) -> ProspectAttachment:
    if kind not in ALLOWED_TYPES:
        raise HTTPException(400, f"Type invalide. Attendus: {list(ALLOWED_TYPES.keys())}")
    if file.content_type not in ALLOWED_TYPES[kind]:
        raise HTTPException(400, f"Format non autorisé pour {kind} : {file.content_type}")

    p = db.query(Prospect).get(prospect_id)
    if not p: raise HTTPException(404, "Prospect introuvable")

    folder = os.path.join(UPLOAD_DIR, str(prospect_id))
    os.makedirs(folder, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    safe_name = f"{kind.lower()}_{uuid.uuid4().hex[:8]}{ext}"
    full_path = os.path.join(folder, safe_name)

    with open(full_path, "wb") as out:
        content = file.file.read()
        if len(content) > MAX_SIZE:
            raise HTTPException(400, f"Fichier trop volumineux (max {MAX_SIZE//1024//1024} Mo)")
        out.write(content)

    # Enum kind
    from app.models.prospect import AttachmentKind
    try:
        kind_enum = AttachmentKind(kind)
    except Exception:
        kind_enum = AttachmentKind.AUTRE

    a = ProspectAttachment(
        prospect_id=prospect_id, kind=kind_enum,
        file_name=file.filename or safe_name,
        file_path=os.path.relpath(full_path).replace("\\", "/"),
        mime_type=file.content_type, size_bytes=len(content),
        uploaded_by_id=user_id, uploaded_at=datetime.utcnow(),
    )
    db.add(a); db.commit(); db.refresh(a)
    return a


def delete(db: Session, attachment_id: int) -> bool:
    a = db.query(ProspectAttachment).get(attachment_id)
    if not a: return False
    try:
        if a.file_path and os.path.exists(a.file_path):
            os.remove(a.file_path)
    except OSError:
        pass
    db.delete(a); db.commit(); return True


def check_required(db: Session, prospect_id: int) -> Dict[str, Any]:
    items = db.query(ProspectAttachment).filter(
        ProspectAttachment.prospect_id == prospect_id
    ).all()
    kinds = {(a.kind.value if hasattr(a.kind, "value") else str(a.kind)) for a in items}
    has_cni = "PIECE_IDENTITE" in kinds
    has_photo = "PHOTO_LOCAL_FACADE" in kinds or "PHOTO_LOCAL_INTERIEUR" in kinds
    return {
        "has_cni": has_cni,
        "has_photo_local": has_photo,
        "all_required_ok": has_cni and has_photo,
        "uploaded_kinds": list(kinds),
    }
