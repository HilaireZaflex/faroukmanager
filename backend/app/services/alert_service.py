from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc
from app.models.pdv import PDV, PDVStatut
from app.models.performance import WeeklyPerformance, MonthlyPerformance
from app.models.recovery import Recovery, RecoveryStatut
from app.models.action import TerrainAction, ActionResultat
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

# ============ M5: Alertes PDVs Inactifs ============

def get_inactive_pdvs_with_history(
    db: Session,
    annee: int,
    semaine: int,
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    type_pdv: Optional[str] = None,
    gestionnaire: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Récupère les PDVs inactifs pour une semaine donnée.
    - Cherche les WeeklyPerformance(annee, semaine) avec est_actif=False
    - Si pas de données, utilise la dernière semaine disponible
    - Calcule le nombre de semaines CONSÉCUTIVES d'inactivité
    - Calcule la priorité (CRITIQUE si >= 3 sem, HAUTE si >= 2 sem, NORMALE sinon)
    - Retourne list triée par semaines_consecutives_inactif DESC
    """
    # Chercher les perfs de la semaine demandée
    perf_semaine = db.query(WeeklyPerformance).filter(
        and_(
            WeeklyPerformance.annee == annee,
            WeeklyPerformance.semaine == semaine
        )
    ).all()
    
    # Si pas de données, chercher la dernière semaine disponible
    if not perf_semaine:
        last_perf = db.query(WeeklyPerformance).order_by(
            WeeklyPerformance.annee.desc(),
            WeeklyPerformance.semaine.desc()
        ).first()
        
        if last_perf:
            annee = last_perf.annee
            semaine = last_perf.semaine
            perf_semaine = db.query(WeeklyPerformance).filter(
                and_(
                    WeeklyPerformance.annee == annee,
                    WeeklyPerformance.semaine == semaine
                )
            ).all()
    
    # Récupérer les PDVs inactifs
    inactive_perfs = [p for p in perf_semaine if not p.est_actif]
    
    inactive_pdvs = []
    for perf in inactive_perfs:
        pdv = db.query(PDV).filter(PDV.id == perf.pdv_id).first()
        if not pdv:
            continue
        
        # Vérifier les filtres
        if zone and pdv.zone != zone:
            continue
        if superviseur and pdv.superviseur != superviseur:
            continue
        if type_pdv and str(pdv.type_pdv) != type_pdv:
            continue
        if gestionnaire and pdv.gestionnaire != gestionnaire:
            continue
        
        # Calculer le nombre de semaines consécutives d'inactivité
        semaines_inactif = count_consecutive_inactive_weeks(db, pdv.id, annee, semaine)
        
        # Calculer la priorité
        if semaines_inactif >= 3:
            priorite = "CRITIQUE"
        elif semaines_inactif >= 2:
            priorite = "HAUTE"
        else:
            priorite = "NORMALE"
        
        # Récupérer la dernière activité
        derniere_activite = get_last_activity_date(db, pdv.id)
        
        # CA précédent (semaine N-1)
        if semaine > 1:
            prev_perf = db.query(WeeklyPerformance).filter(
                and_(
                    WeeklyPerformance.pdv_id == pdv.id,
                    WeeklyPerformance.annee == annee,
                    WeeklyPerformance.semaine == semaine - 1
                )
            ).first()
        else:
            prev_perf = db.query(WeeklyPerformance).filter(
                and_(
                    WeeklyPerformance.pdv_id == pdv.id,
                    WeeklyPerformance.annee == annee - 1,
                    WeeklyPerformance.semaine == 52
                )
            ).first()
        ca_precedent = prev_perf.ca if prev_perf else 0.0
        
        inactive_pdvs.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "sous_zone": pdv.sous_zone,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "teleconseillere": pdv.teleconseillere,
            "type_pdv": str(pdv.type_pdv).split(".")[-1] if pdv.type_pdv else "",
            "telephone": pdv.telephone,
            "semaines_consecutives_inactif": semaines_inactif,
            "derniere_activite": derniere_activite,
            "ca_precedent": ca_precedent,
            "priorite": priorite
        })
    
    # Trier par semaines_consecutives_inactif DESC
    inactive_pdvs.sort(key=lambda x: x["semaines_consecutives_inactif"], reverse=True)
    
    return inactive_pdvs

def count_consecutive_inactive_weeks(db: Session, pdv_id: int, annee: int, semaine: int) -> int:
    """Compte le nombre de semaines consécutives d'inactivité jusqu'à la semaine donnée."""
    count = 0
    current_semaine = semaine
    current_annee = annee
    
    # Aller en arrière jusqu'à trouver une semaine active
    for _ in range(52):  # max 52 semaines
        perf = db.query(WeeklyPerformance).filter(
            and_(
                WeeklyPerformance.pdv_id == pdv_id,
                WeeklyPerformance.annee == current_annee,
                WeeklyPerformance.semaine == current_semaine
            )
        ).first()
        
        if not perf or perf.est_actif:
            break
        
        count += 1
        current_semaine -= 1
        if current_semaine < 1:
            current_semaine = 52
            current_annee -= 1
    
    return count

def get_last_activity_date(db: Session, pdv_id: int) -> Optional[datetime]:
    """Récupère la date de la dernière activité enregistrée."""
    last_perf = db.query(WeeklyPerformance).filter(
        and_(
            WeeklyPerformance.pdv_id == pdv_id,
            WeeklyPerformance.est_actif == True
        )
    ).order_by(
        WeeklyPerformance.annee.desc(),
        WeeklyPerformance.semaine.desc()
    ).first()
    
    return last_perf.created_at if last_perf else None

# ============ M6: Alertes PDVs en Baisse ============

def get_declining_pdvs_with_risk(
    db: Session,
    annee: int,
    semaine: int,
    seuil: float = 15.0,
    zone: Optional[str] = None,
    superviseur: Optional[str] = None,
    type_pdv: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Récupère les PDVs avec baisse de CA significative.
    - Cherche WeeklyPerformance(annee, semaine) avec taux_variation < -seuil
    - Si taux_variation == 0, le calcule: (ca_semaine - ca_semaine_precedente) / ca_semaine_precedente * 100
    - Pour chaque PDV, récupère historique 4 semaines
    - Calcule score_risque (0-100) et type_baisse (ANORMALE si > 30% ou 3 sem consécutives)
    - Retourne list triée par taux_variation ASC (plus grandes baisses en premier)
    """
    # Récupérer les perfs de la semaine avec baisse
    declining_perfs = db.query(WeeklyPerformance).filter(
        and_(
            WeeklyPerformance.annee == annee,
            WeeklyPerformance.semaine == semaine
        )
    ).all()
    
    declining_pdvs = []
    for perf in declining_perfs:
        # Calculer taux_variation si nécessaire
        taux_var = perf.taux_variation
        if taux_var == 0 and perf.ca_semaine_precedente > 0:
            taux_var = ((perf.ca - perf.ca_semaine_precedente) / perf.ca_semaine_precedente) * 100
        
        # Vérifier le seuil
        if taux_var >= -seuil:
            continue
        
        pdv = db.query(PDV).filter(PDV.id == perf.pdv_id).first()
        if not pdv:
            continue
        
        # Vérifier les filtres
        if zone and pdv.zone != zone:
            continue
        if superviseur and pdv.superviseur != superviseur:
            continue
        if type_pdv and str(pdv.type_pdv) != type_pdv:
            continue
        
        # Récupérer historique 4 semaines
        historique = get_4week_history(db, pdv.id, annee, semaine)
        
        # Calculer score_risque (0-100)
        score_risque = calculate_risk_score(taux_var, len(historique), pdv.health_score)
        
        # Déterminer type_baisse
        type_baisse = "NORMALE"
        if abs(taux_var) > 30:
            type_baisse = "ANORMALE"
        else:
            # Vérifier 3 semaines consécutives en baisse
            consecutive_declining = count_consecutive_declining_weeks(historique)
            if consecutive_declining >= 3:
                type_baisse = "ANORMALE"
        
        declining_pdvs.append({
            "pdv_id": pdv.id,
            "numero_pdv": pdv.numero_pdv,
            "nom": pdv.nom,
            "zone": pdv.zone,
            "superviseur": pdv.superviseur,
            "gestionnaire": pdv.gestionnaire,
            "teleconseillere": pdv.teleconseillere,
            "type_pdv": str(pdv.type_pdv).split(".")[-1] if pdv.type_pdv else "",
            "ca": perf.ca,
            "ca_precedent": perf.ca_semaine_precedente,
            "taux_variation": taux_var,
            "historique_4sem": historique,
            "score_risque": score_risque,
            "type_baisse": type_baisse
        })
    
    # Trier par taux_variation ASC (plus grandes baisses en premier)
    declining_pdvs.sort(key=lambda x: x["taux_variation"])
    
    return declining_pdvs

def get_4week_history(db: Session, pdv_id: int, annee: int, semaine: int) -> List[Dict[str, Any]]:
    """Récupère l'historique des 4 dernières semaines."""
    history = []
    
    for i in range(4):
        sem = semaine - i
        an = annee
        
        if sem < 1:
            sem += 52
            an -= 1
        
        perf = db.query(WeeklyPerformance).filter(
            and_(
                WeeklyPerformance.pdv_id == pdv_id,
                WeeklyPerformance.annee == an,
                WeeklyPerformance.semaine == sem
            )
        ).first()
        
        if perf:
            taux = perf.taux_variation
            if taux == 0 and perf.ca_semaine_precedente > 0:
                taux = ((perf.ca - perf.ca_semaine_precedente) / perf.ca_semaine_precedente) * 100
            
            history.append({
                "semaine": sem,
                "ca": perf.ca,
                "est_actif": perf.est_actif,
                "taux_variation": taux
            })
    
    return history

def calculate_risk_score(taux_variation: float, weeks_count: int, health_score: float) -> float:
    """Calcule un score de risque entre 0-100."""
    # Score basé sur le taux de variation (max 50 points)
    variation_score = min(abs(taux_variation) / 100 * 50, 50)
    
    # Score basé sur la santé PDV (max 30 points)
    health_component = (100 - health_score) / 100 * 30
    
    # Score basé sur la profondeur de l'historique (max 20 points)
    history_score = min(weeks_count / 4 * 20, 20)
    
    return variation_score + health_component + history_score

def count_consecutive_declining_weeks(history: List[Dict[str, Any]]) -> int:
    """Compte le nombre de semaines consécutives en baisse."""
    count = 0
    for week in history:
        if week["taux_variation"] < 0:
            count += 1
        else:
            break
    return count

# ============ M7: Gestion des Récupérations ============

def check_auto_recovery_trigger(db: Session) -> List[int]:
    """
    Vérifie automatiquement les PDVs à passer en RECUPERATION.
    Critère: CA 3 mois cumulé < 5,000,000 FCFA
    Retourne la liste des PDV IDs déplacés en RECUPERATION
    """
    triggered_pdv_ids = []
    
    # Récupérer tous les PDVs actifs
    pdvs = db.query(PDV).filter(
        PDV.statut.in_([PDVStatut.ACTIF, PDVStatut.INACTIF])
    ).all()
    
    three_months_ago = datetime.utcnow() - timedelta(days=90)
    
    for pdv in pdvs:
        # Vérifier s'il est déjà en récupération
        existing_recovery = db.query(Recovery).filter(
            and_(
                Recovery.pdv_id == pdv.id,
                Recovery.statut != RecoveryStatut.ABANDONNE
            )
        ).first()
        
        if existing_recovery:
            continue
        
        # Calculer CA 3 mois
        monthly_perfs = db.query(MonthlyPerformance).filter(
            and_(
                MonthlyPerformance.pdv_id == pdv.id,
                MonthlyPerformance.created_at >= three_months_ago
            )
        ).all()
        
        ca_3mois = sum(p.ca for p in monthly_perfs)
        
        # Si CA < 5,000,000 FCFA, créer une récupération
        if ca_3mois < 5000000:
            recovery = Recovery(
                pdv_id=pdv.id,
                statut=RecoveryStatut.IDENTIFIE,
                ca_cumule_3mois=ca_3mois,
                date_identification=datetime.utcnow()
            )
            db.add(recovery)
            pdv.statut = PDVStatut.RECUPERATION
            triggered_pdv_ids.append(pdv.id)
    
    if triggered_pdv_ids:
        db.commit()
    
    return triggered_pdv_ids

# ============ M4: Innovation - Recommandations ============

def generate_weekly_recommendations(db: Session, annee: int, semaine: int) -> List[Dict[str, Any]]:
    """
    Génère les 10 actions prioritaires de la semaine basées sur les données réelles.
    Utilise toujours la dernière semaine disponible en base.
    """
    from sqlalchemy import func

    # Toujours utiliser la dernière semaine disponible (ignore les params si pas de data)
    last_week = db.query(
        WeeklyPerformance.annee, WeeklyPerformance.semaine
    ).order_by(
        WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()
    ).first()

    if last_week:
        annee = last_week[0]
        semaine = last_week[1]

    recommendations = []
    priority = 1
    used_pdv_ids = set()

    # === ACTION 1-2 : PDVs inactifs segment "Inactif" avec le plus de semaines sans activité ===
    inactifs = db.query(PDV).filter(PDV.segment == "Inactif").order_by(PDV.health_score.asc()).limit(5).all()
    for pdv in inactifs[:2]:
        if priority > 10: break
        if pdv.id in used_pdv_ids: continue
        # Compter semaines inactives consécutives
        consec = count_consecutive_inactive_weeks(db, pdv.id, annee, semaine)
        recommendations.append({
            "priorite": priority,
            "type": "APPEL_URGENT",
            "message": f"PDV INACTIF — {consec} semaines sans activité. Appel immédiat superviseur {pdv.superviseur or 'à assigner'}. Risque de perte définitive du point de vente.",
            "pdv_id": pdv.id,
            "pdv_nom": pdv.nom,
            "zone": pdv.zone or "",
            "telephone": pdv.telephone or "",
            "raison": f"Inactif depuis {consec} semaines — Health Score: {pdv.health_score:.0f}/100",
            "health_score": round(pdv.health_score, 1),
            "superviseur": pdv.superviseur or "",
            "action_type": "urgent"
        })
        used_pdv_ids.add(pdv.id)
        priority += 1

    # === ACTION 3-4 : PDVs déclinants avec forte baisse de CA ===
    declinants = db.query(PDV).filter(PDV.segment == "Déclinant").order_by(PDV.health_score.asc()).limit(10).all()
    for pdv in declinants:
        if priority > 10 or len([r for r in recommendations if r["type"] in ["VISITE_TERRAIN", "INTERVENTION"]]) >= 2: break
        if pdv.id in used_pdv_ids: continue
        # Calculer la baisse réelle sur les dernières semaines
        recent_perfs = db.query(WeeklyPerformance).filter(
            WeeklyPerformance.pdv_id == pdv.id
        ).order_by(WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()).limit(4).all()
        if recent_perfs and len(recent_perfs) >= 2:
            ca_recent = recent_perfs[0].ca if recent_perfs[0].ca else 0
            ca_precedent = recent_perfs[-1].ca if recent_perfs[-1].ca else 1
            variation = ((ca_recent - ca_precedent) / ca_precedent * 100) if ca_precedent > 0 else 0
        else:
            variation = -20
        recommendations.append({
            "priorite": priority,
            "type": "VISITE_TERRAIN",
            "message": f"CA en baisse de {abs(variation):.1f}% sur 4 semaines. Visite terrain superviseur requise sous 48h. Analyser causes: concurrence, stock, motivation.",
            "pdv_id": pdv.id,
            "pdv_nom": pdv.nom,
            "zone": pdv.zone or "",
            "telephone": pdv.telephone or "",
            "raison": f"Segment Déclinant — Variation CA: {variation:.1f}% — Health: {pdv.health_score:.0f}/100",
            "health_score": round(pdv.health_score, 1),
            "superviseur": pdv.superviseur or "",
            "action_type": "terrain"
        })
        used_pdv_ids.add(pdv.id)
        priority += 1

    # === ACTION 5-6 : PDVs "À surveiller" à risque de basculer en Déclinant ===
    surveiller = db.query(PDV).filter(PDV.segment == "À surveiller").order_by(PDV.health_score.asc()).limit(10).all()
    for pdv in surveiller:
        if priority > 10 or len([r for r in recommendations if r["type"] == "APPEL_PREVENTIF"]) >= 2: break
        if pdv.id in used_pdv_ids: continue
        recommendations.append({
            "priorite": priority,
            "type": "APPEL_PREVENTIF",
            "message": f"PDV À SURVEILLER — Health Score {pdv.health_score:.0f}/100 en zone orange. Appel préventif cette semaine pour éviter décrochage. Proposer accompagnement commercial.",
            "pdv_id": pdv.id,
            "pdv_nom": pdv.nom,
            "zone": pdv.zone or "",
            "telephone": pdv.telephone or "",
            "raison": f"Risque de décrochage — Health: {pdv.health_score:.0f}/100 — Zone: {pdv.zone}",
            "health_score": round(pdv.health_score, 1),
            "superviseur": pdv.superviseur or "",
            "action_type": "preventif"
        })
        used_pdv_ids.add(pdv.id)
        priority += 1

    # === ACTION 7 : Récupération — PDV avec CA 3 mois le plus faible ===
    recoveries = db.query(Recovery).filter(
        Recovery.statut == RecoveryStatut.IDENTIFIE
    ).order_by(Recovery.ca_cumule_3mois.asc()).limit(3).all()
    for recovery in recoveries:
        if priority > 10 or len([r for r in recommendations if r["type"] == "RECUPERATION"]) >= 1: break
        pdv = db.query(PDV).filter(PDV.id == recovery.pdv_id).first()
        if pdv and pdv.id not in used_pdv_ids:
            recommendations.append({
                "priorite": priority,
                "type": "RECUPERATION",
                "message": f"Plan de récupération à déclencher — CA cumulé 3 mois: {recovery.ca_cumule_3mois:,.0f} FCFA. Envoyer kit motivation + objectif mensuel personnalisé.",
                "pdv_id": pdv.id,
                "pdv_nom": pdv.nom,
                "zone": pdv.zone or "",
                "telephone": pdv.telephone or "",
                "raison": f"CA cumulé 3 mois très faible: {recovery.ca_cumule_3mois:,.0f} FCFA",
                "health_score": round(pdv.health_score, 1),
                "superviseur": pdv.superviseur or "",
                "action_type": "recovery"
            })
            used_pdv_ids.add(pdv.id)
            priority += 1

    # === ACTION 8 : Zone avec le plus de PDVs en difficulté ===
    if priority <= 10:
        zone_counts = db.query(
            PDV.zone, func.count(PDV.id).label('nb')
        ).filter(
            PDV.segment.in_(["Déclinant", "Inactif"])
        ).group_by(PDV.zone).order_by(func.count(PDV.id).desc()).first()
        if zone_counts:
            zone_name, nb_problemes = zone_counts
            # Trouver le superviseur principal de cette zone
            sup_zone = db.query(PDV.superviseur).filter(PDV.zone == zone_name, PDV.superviseur != None).first()
            superviseur = sup_zone[0] if sup_zone else "superviseur"
            recommendations.append({
                "priorite": priority,
                "type": "ALERTE_ZONE",
                "message": f"Zone {zone_name} — {nb_problemes} PDVs en difficulté (Déclinants + Inactifs). Réunion d'urgence superviseur {superviseur} + plan d'action zone sous 72h.",
                "pdv_id": None,
                "pdv_nom": f"Zone {zone_name}",
                "zone": zone_name,
                "telephone": None,
                "raison": f"{nb_problemes} PDVs en segment Déclinant/Inactif dans cette zone",
                "health_score": None,
                "superviseur": superviseur,
                "action_type": "zone"
            })
            priority += 1

    # === ACTION 9 : Féliciter et fidéliser les Champions ===
    if priority <= 10:
        champions = db.query(PDV).filter(
            PDV.segment == "Champion",
            PDV.medaille == "OR"
        ).order_by(PDV.health_score.desc()).limit(5).all()
        if champions:
            pdv = next((p for p in champions if p.id not in used_pdv_ids), None)
            if pdv:
                recommendations.append({
                    "priorite": priority,
                    "type": "FIDELISATION",
                    "message": f"🥇 PDV CHAMPION OR — Health Score {pdv.health_score:.0f}/100. Envoyer attestation de performance + bonus fidélité cette semaine. Valoriser pour motiver le réseau.",
                    "pdv_id": pdv.id,
                    "pdv_nom": pdv.nom,
                    "zone": pdv.zone or "",
                    "telephone": pdv.telephone or "",
                    "raison": f"Top performer réseau — Médaille OR — Health: {pdv.health_score:.0f}/100",
                    "health_score": round(pdv.health_score, 1),
                    "superviseur": pdv.superviseur or "",
                    "action_type": "fidelisation"
                })
                used_pdv_ids.add(pdv.id)
                priority += 1

    # === ACTION 10 : PDV stable à potentiel de croissance ===
    if priority <= 10:
        stables = db.query(PDV).filter(PDV.segment == "Stable").order_by(PDV.health_score.desc()).limit(10).all()
        for pdv in stables:
            if pdv.id in used_pdv_ids: continue
            # Vérifier tendance positive
            recent_perfs = db.query(WeeklyPerformance).filter(
                WeeklyPerformance.pdv_id == pdv.id
            ).order_by(WeeklyPerformance.annee.desc(), WeeklyPerformance.semaine.desc()).limit(4).all()
            if recent_perfs and len(recent_perfs) >= 2:
                ca_recent = recent_perfs[0].ca or 0
                ca_old = recent_perfs[-1].ca or 1
                variation = ((ca_recent - ca_old) / ca_old * 100) if ca_old > 0 else 0
                if variation > 5:
                    recommendations.append({
                        "priorite": priority,
                        "type": "CROISSANCE",
                        "message": f"PDV en progression +{variation:.1f}% — Potentiel de croissance identifié. Proposer objectif Top 20 du réseau + plan d'accompagnement personnalisé.",
                        "pdv_id": pdv.id,
                        "pdv_nom": pdv.nom,
                        "zone": pdv.zone or "",
                        "telephone": pdv.telephone or "",
                        "raison": f"Croissance +{variation:.1f}% — Health: {pdv.health_score:.0f}/100 — Potentiel Champion",
                        "health_score": round(pdv.health_score, 1),
                        "superviseur": pdv.superviseur or "",
                        "action_type": "croissance"
                    })
                    used_pdv_ids.add(pdv.id)
                    priority += 1
                    break

    # Si encore moins de 10 actions, compléter avec PDVs déclinants restants
    if len(recommendations) < 10:
        remaining_declinants = db.query(PDV).filter(
            PDV.segment.in_(["Déclinant", "Inactif"]),
            PDV.id.notin_(list(used_pdv_ids))
        ).order_by(PDV.health_score.asc()).limit(10 - len(recommendations)).all()
        for pdv in remaining_declinants:
            if priority > 10: break
            recommendations.append({
                "priorite": priority,
                "type": "SUIVI_REQUIS",
                "message": f"Suivi hebdomadaire requis — PDV en zone de risque. Vérifier activité et contacter si pas de signal positif cette semaine.",
                "pdv_id": pdv.id,
                "pdv_nom": pdv.nom,
                "zone": pdv.zone or "",
                "telephone": pdv.telephone or "",
                "raison": f"Segment {pdv.segment} — Health: {pdv.health_score:.0f}/100",
                "health_score": round(pdv.health_score, 1),
                "superviseur": pdv.superviseur or "",
                "action_type": "suivi"
            })
            priority += 1

    return recommendations[:10]

def find_zone_problems(
    db: Session,
    inactive_pdvs: List[Dict[str, Any]],
    declining_pdvs: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Identifie les zones avec le plus de problèmes."""
    zone_counts = {}
    
    for pdv in inactive_pdvs:
        zone = pdv.get("zone")
        if zone:
            zone_counts[zone] = zone_counts.get(zone, 0) + 1
    
    for pdv in declining_pdvs:
        zone = pdv.get("zone")
        if zone:
            zone_counts[zone] = zone_counts.get(zone, 0) + 1
    
    # Trier par nombre de problèmes
    zones_sorted = sorted(
        [{"zone": z, "nb_problems": c} for z, c in zone_counts.items()],
        key=lambda x: x["nb_problems"],
        reverse=True
    )
    
    return zones_sorted
