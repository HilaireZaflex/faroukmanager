from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.core.database import get_db
from app.models.pdv import PDV, PDVStatut, PDVType
from app.models.performance import MonthlyPerformance
from app.models.user import User, UserRole
from app.schemas.pdv import PDVCreate, PDVUpdate, PDVOut, PDVStatsResponse
from app.api.routes.auth import get_current_user, require_admin
import io

router = APIRouter()


# ─── STATS (doit être avant /{pdv_id}) ───────────────────────────────────────
@router.get("/pdvs/stats")
def get_stats(db: Session = Depends(get_db)):
    """Statistiques globales du réseau PDV — M1"""
    from sqlalchemy import and_
    pdvs = db.query(PDV).all()

    total = len([p for p in pdvs if p.statut != PDVStatut.DESACTIVE])
    actifs = len([p for p in pdvs if p.statut == PDVStatut.ACTIF])
    inactifs = len([p for p in pdvs if p.statut == PDVStatut.INACTIF])
    en_recuperation = len([p for p in pdvs if p.statut == PDVStatut.RECUPERATION])

    # Dernière période disponible
    latest = db.query(MonthlyPerformance.annee, MonthlyPerformance.mois).distinct().order_by(
        MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()
    ).first()

    ca_total = 0
    ca_moyen = 0
    if latest:
        perfs = db.query(MonthlyPerformance).filter(
            and_(MonthlyPerformance.annee == latest[0], MonthlyPerformance.mois == latest[1])
        ).all()
        ca_total = sum(p.ca for p in perfs)
        ca_moyen = ca_total / len(perfs) if perfs else 0

    pdvs_par_type = {}
    pdvs_par_zone = {}
    pdvs_par_superviseur = {}
    for pdv in pdvs:
        if pdv.statut != PDVStatut.DESACTIVE:
            type_key = pdv.type_pdv.value if pdv.type_pdv else 'NEANT'
            pdvs_par_type[type_key] = pdvs_par_type.get(type_key, 0) + 1
            if pdv.zone:
                pdvs_par_zone[pdv.zone] = pdvs_par_zone.get(pdv.zone, 0) + 1
            if pdv.superviseur:
                pdvs_par_superviseur[pdv.superviseur] = pdvs_par_superviseur.get(pdv.superviseur, 0) + 1

    return {
        "total_pdvs": total,
        "actifs": actifs,
        "inactifs": inactifs,
        "en_recuperation": en_recuperation,
        "ca_total": ca_total,
        "ca_moyen": ca_moyen,
        "pdvs_par_type": pdvs_par_type,
        "pdvs_par_zone": pdvs_par_zone,
        "pdvs_par_superviseur": pdvs_par_superviseur,
        "taux_activite": round(actifs / total * 100, 1) if total else 0,
    }


# ─── EXPORT Excel (doit être avant /{pdv_id}) ────────────────────────────────
@router.get("/pdvs/export")
def export_pdvs(
    db: Session = Depends(get_db),
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    statut: Optional[str] = None,
    type_pdv: Optional[str] = None,
):
    """Export PDVs en Excel — M1 / M12 du CDC"""
    import pandas as pd

    query = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)
    if zone:
        query = query.filter(PDV.zone == zone)
    if superviseur:
        query = query.filter(PDV.superviseur.ilike(f"%{superviseur}%"))
    if statut:
        query = query.filter(PDV.statut == statut)
    if type_pdv:
        query = query.filter(PDV.type_pdv == type_pdv)

    pdvs = query.all()

    data = [{
        "Numéro PDV": p.numero_pdv,
        "Nom": p.nom,
        "Type": p.type_pdv.value,
        "Statut": p.statut.value,
        "Zone": p.zone or "",
        "Sous-zone": p.sous_zone or "",
        "Quartier": p.quartier or "",
        "Commune": p.commune or "",
        "Superviseur": p.superviseur or "",
        "Gestionnaire": p.gestionnaire or "",
        "Téléconseillère": p.teleconseillere or "",
        "Téléphone": p.telephone or "",
        "Nom Gérant": p.nom_gerant or "",
        "Numéro Personnel": p.numero_personnel or "",
        "Health Score": round(p.health_score or 0, 1),
        "Segment": p.segment or "",
        "Médaille": p.medaille.value if p.medaille else "",
        "SIM Coupée": "Oui" if p.sim_coupee else "Non",
        "Numéro Flotte": "Oui" if p.numero_flotte else "Non",
        "Nouvelle Création": "Oui" if p.nouvelle_creation else "Non",
        "Latitude": p.latitude or "",
        "Longitude": p.longitude or "",
        "Notes": p.notes or "",
    } for p in pdvs]

    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='PDVs')
        # Mise en forme basique
        ws = writer.sheets['PDVs']
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=pdvs_export_{zone or 'reseau'}.xlsx"}
    )


# ─── IMPORT Excel/CSV ────────────────────────────────────────────────────────
@router.post("/pdvs/import")
def import_pdvs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(None),
):
    """Import PDVs depuis un fichier Excel ou CSV — M12 du CDC"""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    if not file:
        raise HTTPException(status_code=422, detail="Fichier requis")

    import pandas as pd
    contents = file.file.read()
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents), encoding='utf-8-sig')
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Fichier invalide: {str(e)}")

    # Normalise les colonnes
    df.columns = [c.strip().lower().replace(' ', '_').replace('é', 'e').replace('è', 'e')
                  .replace('ê', 'e').replace('à', 'a').replace('ô', 'o') for c in df.columns]

    col_map = {
        'numero_pdv': ['numero_pdv', 'num_pdv', 'numero', 'id_pdv', 'pdv'],
        'nom': ['nom', 'name', 'nom_pdv'],
        'zone': ['zone'],
        'sous_zone': ['sous_zone', 'sous-zone'],
        'quartier': ['quartier'],
        'commune': ['commune'],
        'superviseur': ['superviseur', 'sup'],
        'gestionnaire': ['gestionnaire', 'gest'],
        'teleconseillere': ['teleconseillere', 'tc', 'tele'],
        'type_pdv': ['type_pdv', 'type'],
        'telephone': ['telephone', 'tel', 'phone'],
        'nom_gerant': ['nom_gerant', 'gerant'],
        'numero_personnel': ['numero_personnel', 'num_pers'],
        'latitude': ['latitude', 'lat'],
        'longitude': ['longitude', 'lon', 'lng'],
    }

    def get_col(df, aliases):
        for alias in aliases:
            if alias in df.columns:
                return alias
        return None

    created, updated, errors = 0, 0, []
    valid_types = {t.value: t for t in PDVType}

    for idx, row in df.iterrows():
        try:
            num_pdv_col = get_col(df, col_map['numero_pdv'])
            nom_col = get_col(df, col_map['nom'])
            if not num_pdv_col or not nom_col:
                errors.append(f"Ligne {idx+2}: colonnes obligatoires manquantes (numero_pdv, nom)")
                continue

            numero_pdv = str(row.get(num_pdv_col, '')).strip()
            nom = str(row.get(nom_col, '')).strip()
            if not numero_pdv or not nom or numero_pdv == 'nan' or nom == 'nan':
                continue

            type_raw = str(row.get(get_col(df, col_map['type_pdv']) or '', 'RS')).strip().upper()
            type_pdv = valid_types.get(type_raw, PDVType.RS)

            existing = db.query(PDV).filter(PDV.numero_pdv == numero_pdv).first()
            if existing:
                existing.nom = nom
                if get_col(df, col_map['zone']): existing.zone = str(row.get(get_col(df, col_map['zone']), '') or '').strip() or existing.zone
                if get_col(df, col_map['superviseur']): existing.superviseur = str(row.get(get_col(df, col_map['superviseur']), '') or '').strip() or existing.superviseur
                updated += 1
            else:
                pdv = PDV(
                    numero_pdv=numero_pdv, nom=nom, type_pdv=type_pdv,
                    zone=str(row.get(get_col(df, col_map['zone']) or '', '') or '').strip() or None,
                    sous_zone=str(row.get(get_col(df, col_map['sous_zone']) or '', '') or '').strip() or None,
                    quartier=str(row.get(get_col(df, col_map['quartier']) or '', '') or '').strip() or None,
                    commune=str(row.get(get_col(df, col_map['commune']) or '', '') or '').strip() or None,
                    superviseur=str(row.get(get_col(df, col_map['superviseur']) or '', '') or '').strip() or None,
                    gestionnaire=str(row.get(get_col(df, col_map['gestionnaire']) or '', '') or '').strip() or None,
                    teleconseillere=str(row.get(get_col(df, col_map['teleconseillere']) or '', '') or '').strip() or None,
                    telephone=str(row.get(get_col(df, col_map['telephone']) or '', '') or '').strip() or None,
                    nom_gerant=str(row.get(get_col(df, col_map['nom_gerant']) or '', '') or '').strip() or None,
                    numero_personnel=str(row.get(get_col(df, col_map['numero_personnel']) or '', '') or '').strip() or None,
                    statut=PDVStatut.ACTIF,
                    health_score=50.0,
                )
                db.add(pdv)
                created += 1
        except Exception as e:
            errors.append(f"Ligne {idx+2}: {str(e)}")

    db.commit()
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "errors": errors[:10],
        "total_processed": created + updated,
        "message": f"✅ {created} PDVs créés, {updated} mis à jour, {len(errors)} erreurs"
    }


# ─── LISTE PDVs avec filtres ──────────────────────────────────────────────────
@router.get("/pdvs", response_model=List[PDVOut])
def list_pdvs(
    db: Session = Depends(get_db),
    zone: Optional[str] = Query(None),
    superviseur: Optional[str] = Query(None),
    gestionnaire: Optional[str] = Query(None),
    type_pdv: Optional[str] = Query(None),
    statut: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user)
):
    """Liste des PDVs avec filtres complets — M1 du CDC"""
    from app.api.routes.auth import get_pdv_filters
    user_filters = get_pdv_filters(current_user)

    query = db.query(PDV).filter(PDV.statut != PDVStatut.DESACTIVE)

    # ── Filtre automatique selon le rôle de l'utilisateur ──
    if 'superviseur' in user_filters:
        query = query.filter(PDV.superviseur.ilike(f"%{user_filters['superviseur']}%"))
    if 'gestionnaire' in user_filters:
        query = query.filter(PDV.gestionnaire.ilike(f"%{user_filters['gestionnaire']}%"))
    if 'zone' in user_filters:
        query = query.filter(PDV.zone == user_filters['zone'])

    # ── Filtres manuels (si pas déjà fixés par le rôle) ──
    if zone and 'zone' not in user_filters:
        query = query.filter(PDV.zone == zone)
    if superviseur and 'superviseur' not in user_filters:
        query = query.filter(PDV.superviseur.ilike(f"%{superviseur}%"))
    if gestionnaire and 'gestionnaire' not in user_filters:
        query = query.filter(PDV.gestionnaire.ilike(f"%{gestionnaire}%"))
    if type_pdv:
        query = query.filter(PDV.type_pdv == type_pdv)
    if statut:
        query = query.filter(PDV.statut == statut)
    if search:
        query = query.filter(
            or_(
                PDV.nom.ilike(f"%{search}%"),
                PDV.numero_pdv.ilike(f"%{search}%"),
                PDV.numero_personnel.ilike(f"%{search}%"),
                PDV.superviseur.ilike(f"%{search}%"),
                PDV.quartier.ilike(f"%{search}%"),
            )
        )

    from sqlalchemy import case
    pdvs = query.order_by(
        case(
            (PDV.statut == 'ACTIF', 0),
            (PDV.statut == 'RECUPERATION', 1),
            (PDV.statut == 'INACTIF', 2),
            else_=3
        ),
        PDV.nom
    ).offset(skip).limit(limit).all()
    return [PDVOut.from_orm(pdv) for pdv in pdvs]


# ─── CRUD PDV ────────────────────────────────────────────────────────────────
@router.post("/pdvs", response_model=PDVOut, status_code=status.HTTP_201_CREATED)
def create_new_pdv(
    pdv_data: PDVCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau PDV — M1"""
    existing = db.query(PDV).filter(PDV.numero_pdv == pdv_data.numero_pdv).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"PDV {pdv_data.numero_pdv} existe déjà")
    from app.services.pdv_service import create_pdv
    pdv = create_pdv(db, pdv_data)
    return PDVOut.from_orm(pdv)


@router.get("/pdvs/{pdv_id}")
def get_pdv_detail(pdv_id: int, db: Session = Depends(get_db)):
    """Fiche complète d'un PDV avec historique — M9"""
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(status_code=404, detail="PDV non trouvé")

    # Historique mensuel (12 derniers mois)
    monthly = db.query(MonthlyPerformance).filter(
        MonthlyPerformance.pdv_id == pdv_id
    ).order_by(MonthlyPerformance.annee.desc(), MonthlyPerformance.mois.desc()).limit(12).all()

    from app.models.performance import WeeklyPerformance
    # Historique hebdomadaire (8 dernières semaines)
    weekly = db.query(WeeklyPerformance).filter(
        WeeklyPerformance.pdv_id == pdv_id
    ).order_by(WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()).limit(8).all()

    from app.models.action import TerrainAction
    actions = db.query(TerrainAction).filter(
        TerrainAction.pdv_id == pdv_id
    ).order_by(TerrainAction.date_action.desc()).limit(20).all()

    pdv_dict = PDVOut.from_orm(pdv).dict()
    pdv_dict["historique_mensuel"] = [{
        "annee": p.annee, "mois": p.mois, "ca": p.ca,
        "nb_operations": p.nb_operations, "est_actif": p.est_actif,
        "taux_variation": p.taux_variation,
        "nb_depots": p.nb_depots, "montant_depots": p.montant_depots,
        "nb_retraits": p.nb_retraits, "montant_retraits": p.montant_retraits,
    } for p in monthly]
    pdv_dict["historique_hebdo"] = [{
        "annee": p.annee, "semaine": p.semaine, "ca": p.ca,
        "nb_operations": p.nb_operations, "est_actif": p.est_actif,
        "taux_variation": p.taux_variation,
    } for p in weekly]
    pdv_dict["actions_terrain"] = [{
        "id": a.id, "type_action": a.type_action.value,
        "resultat": a.resultat.value, "notes": a.notes,
        "date_action": a.date_action.isoformat() if a.date_action else None,
    } for a in actions]

    return pdv_dict


@router.put("/pdvs/{pdv_id}", response_model=PDVOut)
def update_pdv(
    pdv_id: int,
    pdv_data: PDVUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Modifier un PDV — M1"""
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(status_code=404, detail="PDV non trouvé")
    update_data = pdv_data.dict(exclude_unset=True)
    for k, v in update_data.items():
        setattr(pdv, k, v)
    db.commit()
    db.refresh(pdv)
    return PDVOut.from_orm(pdv)


@router.delete("/pdvs/{pdv_id}", status_code=204)
def deactivate_pdv(
    pdv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Désactiver un PDV sans supprimer l'historique — M1"""
    if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Accès insuffisant")
    pdv = db.query(PDV).filter(PDV.id == pdv_id).first()
    if not pdv:
        raise HTTPException(status_code=404, detail="PDV non trouvé")
    pdv.statut = PDVStatut.DESACTIVE
    db.commit()
    return None
