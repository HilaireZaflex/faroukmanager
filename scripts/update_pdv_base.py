"""
Script de mise à jour des PDVs depuis BASE DES PDV.xlsx
- Upsert : met à jour les PDVs existants, insère les nouveaux
- Colonnes : LOCALITE, ADRESSE PDV, PRENOM ET NOM, N° PERSONNEL, PDV,
             TYPE, SINGLE WALET, DATE D'ACTIVATION, SUPERVISEUR,
             GESTIONNAIRES, ZONE, SOUS ZONE, TELECONSEILLIERE,
             DEVELOPPEUR, COMMENTAIRE, DATE DE LA MISE A JOUR
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import openpyxl
from datetime import datetime, date, timedelta
from app.core.database import SessionLocal, engine
from app.models.pdv import PDV, PDVType, PDVStatut, Base

Base.metadata.create_all(bind=engine)

FICHIER = '/Users/nms/Downloads/BASE DES PDV.xlsx'

def normaliser_type(t):
    if not t:
        return PDVType.RS
    t = str(t).strip().upper().replace('KIOSQUE ', 'KIOSQUE')
    mapping = {
        'KIOSQUE': PDVType.KIOSQUE,
        'KIOSQUE INDEPENDANT': PDVType.KIOSQUE_INDEPENDANT,
        'RNS': PDVType.RNS,
        'RS': PDVType.RS,
        'RSF': PDVType.RSF,
        'NEANT': PDVType.NEANT,
        'NÉANT': PDVType.NEANT,
        'X': PDVType.X,
    }
    return mapping.get(t, PDVType.RS)

def normaliser_date(d):
    if not d:
        return None
    if isinstance(d, (datetime,)):
        return d
    if isinstance(d, date):
        return datetime(d.year, d.month, d.day)
    if isinstance(d, str):
        for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y']:
            try:
                return datetime.strptime(d.strip(), fmt)
            except:
                pass
    return None

def nettoyer(val, exclure_au_bureau=True):
    """Retourne None si la valeur est vide ou 'AU BUREAU' (si exclure_au_bureau=True)"""
    if val is None:
        return None
    s = str(val).strip()
    if s == '' or s == 'None':
        return None
    if exclure_au_bureau and s.upper() == 'AU BUREAU':
        return None
    return s

def est_au_bureau(row):
    """Retourne True si le PDV est 'AU BUREAU' (zone OU localite OU superviseur)"""
    localite   = str(row[0]).strip().upper() if row[0] else ''
    zone       = str(row[10]).strip().upper() if row[10] else ''
    superviseur = str(row[8]).strip().upper() if row[8] else ''
    return 'AU BUREAU' in zone or 'AU BUREAU' in localite or 'AU BUREAU' in superviseur

# ── Chargement Excel ─────────────────────────────────────────────────────────
print(f"📂 Chargement de {FICHIER}...")
wb = openpyxl.load_workbook(FICHIER, read_only=True, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
headers = rows[0]
data_rows = rows[1:]
print(f"📋 {len(data_rows)} lignes trouvées (colonnes: {headers})")

# ── Import dans la base ──────────────────────────────────────────────────────
db = SessionLocal()
inseres  = 0
mis_a_jour = 0
ignores  = 0
erreurs  = 0
date_limite_activation = datetime.now() - timedelta(days=31)

for row in data_rows:
    try:
        # Ignorer les lignes de formule ou vides
        num_pdv = row[4]
        if not num_pdv:
            ignores += 1
            continue

        # Ignorer les lignes de formule SUBTOTAL
        num_pdv_str = str(num_pdv).strip()
        if '=' in num_pdv_str or 'SUBTOTAL' in num_pdv_str.upper():
            ignores += 1
            continue

        # Convertir en entier si float
        try:
            num_pdv_str = str(int(float(num_pdv_str)))
        except:
            num_pdv_str = num_pdv_str

        localite        = row[0]
        adresse         = row[1]
        nom             = row[2]
        num_personnel   = row[3]
        type_pdv        = row[5]
        single_wallet   = row[6]
        date_activ      = row[7]
        superviseur     = row[8]
        gestionnaire    = row[9]
        zone            = row[10]
        sous_zone       = row[11]
        teleconseillere = row[12]
        developpeur     = row[13]
        commentaire     = row[14]
        date_maj        = row[15]

        # Normaliser zone (enlever espaces trailing)
        zone_norm = nettoyer(zone, exclure_au_bureau=False)
        if zone_norm:
            zone_norm = zone_norm.strip().upper().replace('ZONE A ', 'ZONE A')

        # Date activation
        date_activation = normaliser_date(date_activ)

        # Déterminer sim_au_bureau
        sim_bureau = est_au_bureau(row)

        # Déterminer statut
        statut = PDVStatut.ACTIF
        sw_str = str(single_wallet).strip().upper() if single_wallet else ''
        commentaire_str = str(commentaire).strip().upper() if commentaire else ''
        adresse_str = str(adresse).strip().upper() if adresse else ''
        if 'SIM RECUPER' in commentaire_str or 'SIM RECUPER' in adresse_str:
            statut = PDVStatut.RECUPERATION
        elif sw_str in ['PROBLEME DE DROIT', 'INACTIF', 'DESACTIVE']:
            statut = PDVStatut.INACTIF

        # Nouvelle création : activation récente (< 1 mois)
        nouvelle_creation = False
        if date_activation and date_activation >= date_limite_activation:
            nouvelle_creation = True

        # Notes
        notes_parts = []
        if commentaire and str(commentaire).strip() not in ['', 'None']:
            notes_parts.append(str(commentaire).strip())

        # Nom PDV propre
        nom_pdv = nettoyer(nom, exclure_au_bureau=False)
        if not nom_pdv or nom_pdv.upper() == 'AU BUREAU':
            nom_pdv = num_pdv_str

        # ── UPSERT ──
        existing = db.query(PDV).filter(PDV.numero_pdv == num_pdv_str).first()

        if existing:
            # Mettre à jour
            existing.nom             = nom_pdv
            existing.numero_personnel= nettoyer(num_personnel)
            existing.type_pdv        = normaliser_type(type_pdv)
            existing.statut          = statut
            existing.zone            = zone_norm
            existing.sous_zone       = nettoyer(sous_zone)
            existing.quartier        = nettoyer(localite)
            existing.adresse         = nettoyer(adresse)
            existing.superviseur     = nettoyer(superviseur)
            existing.gestionnaire    = nettoyer(gestionnaire)
            existing.teleconseillere = nettoyer(teleconseillere)
            existing.developpeur     = nettoyer(developpeur)
            existing.date_activation = date_activation
            existing.sim_au_bureau   = sim_bureau
            existing.nouvelle_creation = nouvelle_creation
            existing.notes           = ' | '.join(notes_parts) if notes_parts else None
            existing.date_mise_a_jour = nettoyer(date_maj, exclure_au_bureau=False)
            existing.updated_at      = datetime.utcnow()
            mis_a_jour += 1
        else:
            # Insérer
            pdv = PDV(
                numero_pdv       = num_pdv_str,
                nom              = nom_pdv,
                numero_personnel = nettoyer(num_personnel),
                type_pdv         = normaliser_type(type_pdv),
                statut           = statut,
                zone             = zone_norm,
                sous_zone        = nettoyer(sous_zone),
                quartier         = nettoyer(localite),
                adresse          = nettoyer(adresse),
                superviseur      = nettoyer(superviseur),
                gestionnaire     = nettoyer(gestionnaire),
                teleconseillere  = nettoyer(teleconseillere),
                developpeur      = nettoyer(developpeur),
                date_activation  = date_activation,
                sim_au_bureau    = sim_bureau,
                nouvelle_creation = nouvelle_creation,
                notes            = ' | '.join(notes_parts) if notes_parts else None,
                date_mise_a_jour = nettoyer(date_maj, exclure_au_bureau=False),
            )
            db.add(pdv)
            inseres += 1

        if (inseres + mis_a_jour) % 100 == 0:
            db.commit()
            print(f"  ✅ {inseres} insérés, {mis_a_jour} mis à jour...")

    except Exception as e:
        erreurs += 1
        print(f"  ⚠️ Erreur ligne PDV={row[4]}: {e}")

db.commit()
db.close()

print(f"\n🎉 Import terminé !")
print(f"  ✅ Insérés    : {inseres}")
print(f"  🔄 Mis à jour : {mis_a_jour}")
print(f"  ⏭️  Ignorés   : {ignores}")
print(f"  ❌ Erreurs    : {erreurs}")
