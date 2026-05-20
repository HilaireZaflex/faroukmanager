"""
Script de seed pour le module Prospection.
==========================================
Crée des prospects fictifs dans CHACUN des 10 états du workflow,
afin de visualiser le rendu UI complet.

Usage :
  cd FaroukManager/backend && venv/bin/python3 ../scripts/seed_prospects.py

Pour purger avant ré-injection :
  cd FaroukManager/backend && venv/bin/python3 ../scripts/seed_prospects.py --reset
"""
import sys, os, random, argparse
from datetime import datetime, timedelta

# Ajouter backend/ au path
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.normpath(os.path.join(HERE, "..", "backend"))
sys.path.insert(0, BACKEND)

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
import app.models  # registre tous les modèles
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.prospect import (
    Prospect, ProspectHistory, ProspectStatus, DecisionType,
    LocalType, FrequentationLevel, IDType,
)
from app.models.pdv import PDV, PDVStatut


# ─────────────────────────────────────────────────────────────────────────────
# Données fictives maliennes
# ─────────────────────────────────────────────────────────────────────────────
PRENOMS = ["Aliou","Fatoumata","Moussa","Aminata","Ibrahim","Mariam","Bakary",
           "Awa","Modibo","Kadidia","Souleymane","Djeneba","Abdoulaye","Hawa",
           "Yacouba","Rokia","Oumar","Sira","Amadou","Nana"]
NOMS = ["Touré","Diarra","Traoré","Coulibaly","Keita","Sangaré","Cissé","Diallo",
        "Konaté","Sidibé","Maïga","Doumbia","Ballo","Camara","Dembélé","Sissoko"]
QUARTIERS = ["Hamdallaye","Badalabougou","Sotuba","Magnambougou","Faladiè",
             "Lafiabougou","Niamakoro","Banconi","Djélibougou","Kalaban Coura",
             "Sogoniko","ACI 2000","Korofina","Sébénikoro","Bagadadji"]
SOURCES = ["Épargne personnelle","Tontine familiale","Microcrédit Kafo Jiginew",
           "Aide d'un proche","Vente de marchandises","Prêt familial"]
RAISONS_CHANGE = ["Service client défaillant","Commissions trop faibles",
                  "Souhaite plus de proximité Orange","Recommandation d'un ami",
                  "Recherche de meilleures conditions"]
CONCURRENTS_POOLS = [["Moov"],["Wave"],["Sama Money"],["Moov","Wave"],
                     ["Wave","Sama Money"],["Moov","Wave","Sama Money"],[]]
# Centre Bamako approximatif : 12.6392°N, 8.0029°W
def random_gps():
    return (round(12.55 + random.random() * 0.25, 6),
            round(-8.10 + random.random() * 0.25, 6))


# ─────────────────────────────────────────────────────────────────────────────
# Helpers utilisateurs
# ─────────────────────────────────────────────────────────────────────────────
def get_or_create_user(db: Session, email: str, role: UserRole, nom: str, prenom: str = "") -> User:
    u = db.query(User).filter(User.email == email).first()
    if u:
        if u.role != role:
            u.role = role
        return u
    u = User(
        email=email, nom=nom, prenom=prenom,
        hashed_password=get_password_hash("Demo2026!"),
        role=role, is_active=True,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def ensure_workflow_users(db: Session):
    """Crée si besoin les utilisateurs de chaque rôle pour la démo."""
    sup1 = get_or_create_user(db, "sup1@faroukmanager.com", UserRole.SUPERVISEUR, "Sangaré", "Mariam")
    sup2 = get_or_create_user(db, "sup2@faroukmanager.com", UserRole.SUPERVISEUR, "Diarra", "Bakary")
    dev1 = get_or_create_user(db, "dev1@faroukmanager.com", UserRole.DEVELOPPEUR, "Coulibaly", "Modibo")
    dev2 = get_or_create_user(db, "dev2@faroukmanager.com", UserRole.DEVELOPPEUR, "Keita", "Aminata")
    dev3 = get_or_create_user(db, "dev3@faroukmanager.com", UserRole.DEVELOPPEUR, "Touré", "Souleymane")
    rc   = get_or_create_user(db, "rc@faroukmanager.com",   UserRole.RC,          "Cissé",     "Awa")
    return {"sups":[sup1, sup2], "devs":[dev1, dev2, dev3], "rc": rc}


# ─────────────────────────────────────────────────────────────────────────────
# Création d'un prospect avec sa fiche complète + historique
# ─────────────────────────────────────────────────────────────────────────────
def _ref(idx: int) -> str:
    year = datetime.utcnow().year
    return f"PROS-{year}-{idx:06d}"


def _log(db, prospect, user, decision_type, from_status, to_status, comment, when=None, extra=None):
    h = ProspectHistory(
        prospect_id=prospect.id,
        user_id=user.id if user else None,
        decision_type=decision_type,
        from_status=from_status,
        to_status=to_status,
        comment=comment,
        extra=extra,
        created_at=when or datetime.utcnow(),
    )
    db.add(h)


def make_base_prospect(db, idx, users, days_ago, with_gps=True):
    """Crée la fiche de base d'un prospect (état NOUVELLE)."""
    sup = random.choice(users["sups"])
    fait_om = random.random() < 0.55
    lat, lng = random_gps() if with_gps else (None, None)
    submitted = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 12))

    p = Prospect(
        reference=_ref(idx),
        status=ProspectStatus.NOUVELLE,
        nom=random.choice(NOMS),
        prenom=random.choice(PRENOMS),
        telephone_principal=f"7{random.randint(0,9)}{random.randint(100000, 999999)}",
        telephone_secondaire=(f"6{random.randint(0,9)}{random.randint(100000, 999999)}" if random.random() < 0.4 else None),
        quartier=random.choice(QUARTIERS),
        adresse=f"Rue {random.randint(1, 999)}, Porte {random.randint(1, 500)}",
        piece_identite_type=random.choice(list(IDType)),
        piece_identite_numero=f"{random.randint(100000, 9999999)}",
        fait_om=fait_om,
        om_commission_mensuelle=(random.randint(15000, 80000) if fait_om else None),
        om_ca_mensuel=(random.randint(200000, 2500000) if fait_om else None),
        om_ancienne_puce=(f"7{random.randint(10000000, 99999999)}" if fait_om and random.random() < 0.7 else None),
        om_raison_changement=(random.choice(RAISONS_CHANGE) if fait_om else None),
        capital_demarrage=(random.choice([60000, 80000, 100000, 150000, 200000, 300000]) if not fait_om else None),
        source_financement=(random.choice(SOURCES) if not fait_om else None),
        latitude=lat, longitude=lng,
        pdv_adresse=f"Marché de {random.choice(QUARTIERS)}",
        pdv_nom_lieu=f"Boutique {random.choice(NOMS)}",
        type_local=random.choice(list(LocalType)),
        frequentation=random.choice(list(FrequentationLevel)),
        concurrents=random.choice(CONCURRENTS_POOLS) or None,
        submitted_by_id=sup.id,
        submitted_at=submitted,
        created_at=submitted,
        sla_visit_due_at=submitted + timedelta(hours=48),
        notes="Prospect généré pour démonstration",
    )
    db.add(p)
    db.flush()
    _log(db, p, sup, DecisionType.SUBMIT, None, ProspectStatus.NOUVELLE,
         f"Fiche créée par {sup.role.value}", when=submitted)
    return p, sup


# ─────────────────────────────────────────────────────────────────────────────
# Constructeurs spécifiques par état
# ─────────────────────────────────────────────────────────────────────────────
def to_en_visite(db, p, sup, users, hours_after=4):
    dev = random.choice(users["devs"])
    when = p.submitted_at + timedelta(hours=hours_after)
    p.status = ProspectStatus.EN_VISITE
    p.visit_assigned_to_id = dev.id
    p.visit_assigned_at = when
    p.visit_attempts = 1
    p.sla_visit_due_at = when + timedelta(hours=48)
    _log(db, p, sup, DecisionType.ASSIGN_VISIT, ProspectStatus.NOUVELLE,
         ProspectStatus.EN_VISITE, f"Visite affectée à {dev.nom}", when=when)
    return dev, when


def to_validee_dev(db, p, dev, when_visit, hours=24):
    when = when_visit + timedelta(hours=hours)
    p.status = ProspectStatus.VALIDEE_DEV
    p.dev_decision_at = when
    p.dev_decision_comment = "Bon emplacement, fréquentation correcte, prospect motivé."
    p.sla_rc_due_at = when + timedelta(hours=72)
    _log(db, p, dev, DecisionType.DEV_VALIDATE, ProspectStatus.EN_VISITE,
         ProspectStatus.VALIDEE_DEV, p.dev_decision_comment, when=when)
    return when


def to_refusee_dev(db, p, dev, when_visit, hours=20):
    when = when_visit + timedelta(hours=hours)
    p.status = ProspectStatus.REFUSEE_DEV
    p.dev_decision_at = when
    p.dev_decision_comment = "Local trop petit, fréquentation insuffisante après vérification."
    _log(db, p, dev, DecisionType.DEV_REJECT, ProspectStatus.EN_VISITE,
         ProspectStatus.REFUSEE_DEV, p.dev_decision_comment, when=when)
    return when


def to_en_attente_rc(db, p, rc, when_validee, hours=12):
    when = when_validee + timedelta(hours=hours)
    p.status = ProspectStatus.EN_ATTENTE_RC
    p.rc_decision_at = when
    p.rc_decision_by_id = rc.id
    p.rc_decision_comment = "Mis en attente : stock de puces épuisé, prochaine livraison prévue."
    _log(db, p, rc, DecisionType.RC_HOLD, ProspectStatus.VALIDEE_DEV,
         ProspectStatus.EN_ATTENTE_RC, p.rc_decision_comment, when=when)
    return when


def to_approuvee_rc(db, p, rc, when_validee, hours=10):
    when = when_validee + timedelta(hours=hours)
    p.status = ProspectStatus.APPROUVEE_RC
    p.rc_decision_at = when
    p.rc_decision_by_id = rc.id
    p.rc_decision_comment = "Dossier solide, approuvé pour attribution."
    _log(db, p, rc, DecisionType.RC_APPROVE, ProspectStatus.VALIDEE_DEV,
         ProspectStatus.APPROUVEE_RC, p.rc_decision_comment, when=when)
    return when


def to_refusee_rc(db, p, rc, when_validee, hours=8):
    when = when_validee + timedelta(hours=hours)
    p.status = ProspectStatus.REFUSEE_RC
    p.rc_decision_at = when
    p.rc_decision_by_id = rc.id
    p.rc_decision_comment = "Refusé : zone déjà saturée par d'autres PDV Orange."
    _log(db, p, rc, DecisionType.RC_REJECT, ProspectStatus.VALIDEE_DEV,
         ProspectStatus.REFUSEE_RC, p.rc_decision_comment, when=when)
    return when


def to_puce_attribuee(db, p, rc, users, when_approuvee, hours=6, puce_seq=1000):
    activator = random.choice(users["devs"])
    when = when_approuvee + timedelta(hours=hours)
    puce = f"7{puce_seq:08d}"
    p.status = ProspectStatus.PUCE_ATTRIBUEE
    p.puce_assigned_to_id = activator.id
    p.puce_assigned_at = when
    p.puce_numero = puce
    p.sla_activation_due_at = when + timedelta(hours=48)
    _log(db, p, rc, DecisionType.PUCE_ASSIGN, ProspectStatus.APPROUVEE_RC,
         ProspectStatus.PUCE_ATTRIBUEE,
         f"Puce {puce} attribuée à {activator.nom}",
         when=when, extra={"puce_numero": puce, "activator_id": activator.id})
    return activator, when, puce


def to_puce_activee(db, p, activator, when_attrib, hours=12, create_pdv=True):
    when = when_attrib + timedelta(hours=hours)
    p.status = ProspectStatus.PUCE_ACTIVEE
    p.activated_at = when

    pdv_id = None
    if create_pdv:
        pdv = PDV(
            numero_pdv=p.puce_numero,
            nom=f"{p.nom} {p.prenom}".strip(),
            telephone=p.telephone_principal,
            quartier=p.quartier,
            adresse=p.pdv_adresse or p.adresse,
            latitude=p.latitude, longitude=p.longitude,
            statut=PDVStatut.ACTIF,
            date_activation=when,
            nom_gerant=f"{p.prenom} {p.nom}".strip(),
            nouvelle_creation=True,
            notes=f"Créé via prospection {p.reference}",
        )
        db.add(pdv); db.flush()
        p.activated_pdv_id = pdv.id
        pdv_id = pdv.id

    _log(db, p, activator, DecisionType.PUCE_ACTIVATE,
         ProspectStatus.PUCE_ATTRIBUEE, ProspectStatus.PUCE_ACTIVEE,
         "Puce activée sur le terrain",
         when=when, extra={"pdv_id": pdv_id, "puce_numero": p.puce_numero})
    return when


def to_annulee(db, p, user, hours_after_submit=20):
    when = p.submitted_at + timedelta(hours=hours_after_submit)
    from_status = p.status
    p.status = ProspectStatus.ANNULEE
    _log(db, p, user, DecisionType.CANCEL, from_status, ProspectStatus.ANNULEE,
         "Annulé : prospect injoignable malgré plusieurs relances.", when=when)


# ─────────────────────────────────────────────────────────────────────────────
# Génération principale
# ─────────────────────────────────────────────────────────────────────────────
def reset(db: Session):
    print("🗑  Suppression des prospects et historique existants...")
    db.query(ProspectHistory).delete()
    db.query(Prospect).delete()
    db.commit()


def generate(db: Session):
    users = ensure_workflow_users(db)
    print(f"👥 Utilisateurs prêts: {len(users['sups'])} sup, {len(users['devs'])} dev, 1 RC")

    # Repartir d'un index continu (au cas où il y a déjà des prospects)
    next_idx = (db.query(Prospect).count() or 0) + 1
    puce_seq = 10000 + next_idx
    created = []

    # ── ÉTAT 1 : NOUVELLE — 4 fiches récentes ────────────────────────────
    for _ in range(4):
        p, _ = make_base_prospect(db, next_idx, users, days_ago=random.randint(0, 1))
        created.append(("NOUVELLE", p)); next_idx += 1

    # ── ÉTAT 2 : EN_VISITE — 5 fiches (dont une SLA dépassé) ─────────────
    for i in range(5):
        days_ago = 4 if i == 0 else random.randint(1, 2)  # 1ère = SLA dépassé
        p, sup = make_base_prospect(db, next_idx, users, days_ago=days_ago)
        to_en_visite(db, p, sup, users, hours_after=random.randint(2, 6))
        created.append(("EN_VISITE", p)); next_idx += 1

    # ── ÉTAT 3 : VALIDEE_DEV — 4 fiches ──────────────────────────────────
    for _ in range(4):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(2, 4))
        dev, when_v = to_en_visite(db, p, sup, users, hours_after=4)
        to_validee_dev(db, p, dev, when_v, hours=random.randint(12, 30))
        created.append(("VALIDEE_DEV", p)); next_idx += 1

    # ── ÉTAT 4 : REFUSEE_DEV — 3 fiches ─────────────────────────────────
    for _ in range(3):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(2, 4))
        dev, when_v = to_en_visite(db, p, sup, users, hours_after=4)
        to_refusee_dev(db, p, dev, when_v, hours=random.randint(8, 24))
        created.append(("REFUSEE_DEV", p)); next_idx += 1

    # ── ÉTAT 5 : EN_ATTENTE_RC — 3 fiches ────────────────────────────────
    for _ in range(3):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(3, 6))
        dev, when_v = to_en_visite(db, p, sup, users)
        when_val = to_validee_dev(db, p, dev, when_v, hours=20)
        to_en_attente_rc(db, p, users["rc"], when_val, hours=random.randint(6, 18))
        created.append(("EN_ATTENTE_RC", p)); next_idx += 1

    # ── ÉTAT 6 : APPROUVEE_RC — 3 fiches ────────────────────────────────
    for _ in range(3):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(3, 5))
        dev, when_v = to_en_visite(db, p, sup, users)
        when_val = to_validee_dev(db, p, dev, when_v, hours=18)
        to_approuvee_rc(db, p, users["rc"], when_val, hours=random.randint(4, 12))
        created.append(("APPROUVEE_RC", p)); next_idx += 1

    # ── ÉTAT 7 : REFUSEE_RC — 2 fiches (terminal) ───────────────────────
    for _ in range(2):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(5, 9))
        dev, when_v = to_en_visite(db, p, sup, users)
        when_val = to_validee_dev(db, p, dev, when_v, hours=20)
        to_refusee_rc(db, p, users["rc"], when_val, hours=random.randint(6, 14))
        created.append(("REFUSEE_RC", p)); next_idx += 1

    # ── ÉTAT 8 : PUCE_ATTRIBUEE — 3 fiches ──────────────────────────────
    for _ in range(3):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(4, 6))
        dev, when_v = to_en_visite(db, p, sup, users)
        when_val = to_validee_dev(db, p, dev, when_v, hours=18)
        when_app = to_approuvee_rc(db, p, users["rc"], when_val, hours=8)
        to_puce_attribuee(db, p, users["rc"], users, when_app, hours=6, puce_seq=puce_seq)
        puce_seq += 1
        created.append(("PUCE_ATTRIBUEE", p)); next_idx += 1

    # ── ÉTAT 9 : PUCE_ACTIVEE — 5 fiches (terminal, succès) ─────────────
    for _ in range(5):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(6, 14))
        dev, when_v = to_en_visite(db, p, sup, users)
        when_val = to_validee_dev(db, p, dev, when_v, hours=20)
        when_app = to_approuvee_rc(db, p, users["rc"], when_val, hours=8)
        activator, when_attrib, puce = to_puce_attribuee(
            db, p, users["rc"], users, when_app, hours=6, puce_seq=puce_seq
        )
        puce_seq += 1
        to_puce_activee(db, p, activator, when_attrib, hours=random.randint(6, 30))
        created.append(("PUCE_ACTIVEE", p)); next_idx += 1

    # ── ÉTAT 10 : ANNULEE — 2 fiches (à différents moments) ──────────────
    for _ in range(2):
        p, sup = make_base_prospect(db, next_idx, users, days_ago=random.randint(2, 5))
        # On laisse en NOUVELLE puis on annule
        to_annulee(db, p, sup, hours_after_submit=24)
        created.append(("ANNULEE", p)); next_idx += 1

    db.commit()
    return created


def print_summary(db: Session, created):
    from collections import Counter
    c = Counter([s for s, _ in created])
    print("\n" + "═" * 60)
    print("  📊 RÉSUMÉ — Prospects générés")
    print("═" * 60)
    for status in ProspectStatus:
        n = c.get(status.value, 0)
        if n > 0:
            print(f"  • {status.value:<18s} : {n:>3d}")
    print("─" * 60)
    print(f"  TOTAL : {len(created)} prospects, {db.query(ProspectHistory).count()} entrées d'historique")
    print("═" * 60)
    print("\n👥 Utilisateurs créés (mot de passe : Demo2026!) :")
    for email in ["sup1@faroukmanager.com","sup2@faroukmanager.com",
                  "dev1@faroukmanager.com","dev2@faroukmanager.com",
                  "dev3@faroukmanager.com","rc@faroukmanager.com"]:
        u = db.query(User).filter(User.email == email).first()
        if u:
            print(f"  • {email:<32s} {u.role.value:<14s} {u.nom} {u.prenom or ''}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true",
                        help="Supprime tous les prospects existants avant injection")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if args.reset:
            reset(db)
        created = generate(db)
        print_summary(db, created)
        print("\n✅ Seed terminé.\n")
    finally:
        db.close()


if __name__ == "__main__":
    main()
