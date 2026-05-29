from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models.pdv import PDV, PDVStatut
from app.schemas.pdv import PDVCreate, PDVUpdate
from typing import List, Optional, Dict, Any
import pandas as pd
from io import BytesIO
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

def get_pdvs(db: Session, filters: Optional[Dict[str, Any]] = None, skip: int = 0, limit: int = 100) -> List[PDV]:
    """Get PDVs with optional filters."""
    query = db.query(PDV)
    
    if filters:
        if filters.get("zone"):
            query = query.filter(PDV.zone == filters["zone"])
        if filters.get("statut"):
            query = query.filter(PDV.statut == filters["statut"])
        if filters.get("type_pdv"):
            query = query.filter(PDV.type_pdv == filters["type_pdv"])
        if filters.get("superviseur"):
            query = query.filter(PDV.superviseur == filters["superviseur"])
        if filters.get("search"):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                or_(
                    PDV.numero_pdv.ilike(search_term),
                    PDV.nom.ilike(search_term),
                    PDV.telephone.ilike(search_term)
                )
            )
    
    return query.offset(skip).limit(limit).all()

def get_pdv(db: Session, pdv_id: int) -> Optional[PDV]:
    """Get PDV by ID."""
    return db.query(PDV).filter(PDV.id == pdv_id).first()

def create_pdv(db: Session, pdv_create: PDVCreate) -> PDV:
    """Create a new PDV."""
    db_pdv = PDV(**pdv_create.model_dump())
    db.add(db_pdv)
    db.commit()
    db.refresh(db_pdv)
    return db_pdv

def update_pdv(db: Session, pdv_id: int, pdv_update: PDVUpdate) -> Optional[PDV]:
    """Update an existing PDV."""
    db_pdv = get_pdv(db, pdv_id)
    if not db_pdv:
        return None
    
    update_data = pdv_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_pdv, field, value)
    
    db.add(db_pdv)
    db.commit()
    db.refresh(db_pdv)
    return db_pdv

def deactivate_pdv(db: Session, pdv_id: int) -> Optional[PDV]:
    """Deactivate a PDV."""
    db_pdv = get_pdv(db, pdv_id)
    if not db_pdv:
        return None
    
    db_pdv.statut = PDVStatut.DESACTIVE
    db.add(db_pdv)
    db.commit()
    db.refresh(db_pdv)
    return db_pdv

def _clean_nan(val, default=None):
    """Convertit les valeurs NaN/nan/None de pandas en None propre."""
    import math
    if val is None:
        return default
    if isinstance(val, float) and math.isnan(val):
        return default
    s = str(val).strip()
    if s.lower() in ('nan', 'none', '', 'nat'):
        return default
    return s if isinstance(val, str) else val

def import_pdvs_from_excel(db: Session, file_bytes: bytes) -> Dict[str, Any]:
    """Import PDVs from Excel file."""
    try:
        excel_file = BytesIO(file_bytes)
        df = pd.read_excel(excel_file)
        
        # Normalize column names to lowercase
        df.columns = df.columns.str.lower().str.strip()
        
        imported_count = 0
        failed_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                # Check if numero_pdv already exists
                existing_pdv = db.query(PDV).filter(PDV.numero_pdv == str(row.get("numero_pdv", "")).strip()).first()
                if existing_pdv:
                    failed_count += 1
                    errors.append(f"Row {index + 2}: PDV {row.get('numero_pdv')} already exists")
                    continue
                
                # Helper pour valeurs booléennes
                def clean_bool(v, default=False):
                    import math
                    if v is None: return default
                    if isinstance(v, float) and math.isnan(v): return default
                    if isinstance(v, bool): return v
                    return str(v).strip().lower() in ('1', 'true', 'oui', 'yes')

                # Nettoyer les valeurs numériques
                def clean_float(v, default=0.0):
                    import math
                    try:
                        f = float(v)
                        return default if math.isnan(f) else f
                    except (TypeError, ValueError):
                        return default

                # Create PDV from row data — toutes les valeurs texte nettoyées
                pdv_data = {
                    "numero_pdv": _clean_nan(row.get("numero_pdv")),
                    "nom": _clean_nan(row.get("nom")),
                    "numero_personnel": _clean_nan(row.get("numero_personnel")),
                    "type_pdv": _clean_nan(row.get("type_pdv"), "RS"),
                    "statut": _clean_nan(row.get("statut"), "ACTIF"),
                    "medaille": _clean_nan(row.get("medaille"), "AUCUNE"),
                    "zone": _clean_nan(row.get("zone")),
                    "sous_zone": _clean_nan(row.get("sous_zone")),
                    "quartier": _clean_nan(row.get("quartier")),
                    "commune": _clean_nan(row.get("commune")),
                    "latitude": clean_float(row.get("latitude"), None),
                    "longitude": clean_float(row.get("longitude"), None),
                    "superviseur": _clean_nan(row.get("superviseur")),
                    "gestionnaire": _clean_nan(row.get("gestionnaire")),
                    "teleconseillere": _clean_nan(row.get("teleconseillere")),
                    "telephone": _clean_nan(row.get("telephone")),
                    "email_contact": _clean_nan(row.get("email_contact")),
                    "nom_gerant": _clean_nan(row.get("nom_gerant")),
                    "numero_flotte": clean_bool(row.get("numero_flotte")),
                    "sim_au_bureau": clean_bool(row.get("sim_au_bureau")),
                    "sim_coupee": clean_bool(row.get("sim_coupee")),
                    "nouvelle_creation": clean_bool(row.get("nouvelle_creation")),
                    "health_score": clean_float(row.get("health_score"), 50.0),
                    "segment": _clean_nan(row.get("segment")),
                    "score_risque": clean_float(row.get("score_risque"), 0.0),
                    "notes": _clean_nan(row.get("notes")),
                }
                
                # Remove None values and create PDV
                pdv_data = {k: v for k, v in pdv_data.items() if v is not None}
                pdv_create = PDVCreate(**pdv_data)
                create_pdv(db, pdv_create)
                imported_count += 1
                
            except Exception as e:
                failed_count += 1
                errors.append(f"Row {index + 2}: {str(e)}")
        
        return {
            "imported": imported_count,
            "failed": failed_count,
            "errors": errors,
            "total": imported_count + failed_count
        }
        
    except Exception as e:
        return {
            "imported": 0,
            "failed": 0,
            "errors": [str(e)],
            "total": 0
        }

def export_pdvs_excel(db: Session, filters: Optional[Dict[str, Any]] = None) -> bytes:
    """Export PDVs to Excel file."""
    # Get all PDVs with filters
    pdvs = get_pdvs(db, filters, skip=0, limit=None)
    
    # Convert to list of dicts
    data = []
    for pdv in pdvs:
        data.append({
            "ID": pdv.id,
            "Numéro PDV": pdv.numero_pdv,
            "Nom": pdv.nom,
            "Numéro Personnel": pdv.numero_personnel,
            "Type PDV": pdv.type_pdv.value if pdv.type_pdv else "",
            "Statut": pdv.statut.value if pdv.statut else "",
            "Médaille": pdv.medaille.value if pdv.medaille else "",
            "Zone": pdv.zone,
            "Sous-Zone": pdv.sous_zone,
            "Quartier": pdv.quartier,
            "Commune": pdv.commune,
            "Latitude": pdv.latitude,
            "Longitude": pdv.longitude,
            "Superviseur": pdv.superviseur,
            "Gestionnaire": pdv.gestionnaire,
            "Téléconseillère": pdv.teleconseillere,
            "Téléphone": pdv.telephone,
            "Email Contact": pdv.email_contact,
            "Nom Gérant": pdv.nom_gerant,
            "Date Activation": pdv.date_activation,
            "Numéro Flotte": pdv.numero_flotte,
            "SIM au Bureau": pdv.sim_au_bureau,
            "SIM Coupée": pdv.sim_coupee,
            "Nouvelle Création": pdv.nouvelle_creation,
            "Health Score": pdv.health_score,
            "Segment": pdv.segment,
            "Score Risque": pdv.score_risque,
            "Notes": pdv.notes,
            "Créé": pdv.created_at,
            "Modifié": pdv.updated_at,
        })
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Create Excel file with styling
    excel_file = BytesIO()
    with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='PDVs')
        
        # Get workbook and worksheet
        workbook = writer.book
        worksheet = writer.sheets['PDVs']
        
        # Style header row
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF")
        
        for cell in worksheet[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # Adjust column widths
        for column in worksheet.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2) * 1.2
            worksheet.column_dimensions[column_letter].width = adjusted_width
    
    excel_file.seek(0)
    return excel_file.getvalue()
