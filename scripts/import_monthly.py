#!/usr/bin/env python3
"""
Script d'import des données mensuelles depuis DONNEES MENSUELLES.xlsx
Colonnes: PDV, Mois, Année, Nbre dépôt, Montant Dépôt, Nbre Retrait, Montant Retrait
CA = Montant Dépôt + Montant Retrait
Nb Opérations = Nbre dépôt + Nbre Retrait
"""
import sys
import os

# Se placer dans le répertoire backend pour que la DB SQLite soit trouvée
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)

import openpyxl
from app.core.database import SessionLocal
from app.models.pdv import PDV
from app.models.performance import MonthlyPerformance

EXCEL_PATH = "/Users/nms/Downloads/DONNEES MENSUELLES.xlsx"

MOIS_MAP = {
    'Janvier': 1, 'Février': 2, 'Fevrier': 2, 'Mars': 3,
    'Avril': 4, 'Mai': 5, 'Juin': 6, 'Juillet': 7,
    'Août': 8, 'Aout': 8, 'Septembre': 9, 'Octobre': 10,
    'Novembre': 11, 'Décembre': 12, 'Decembre': 12
}

def main():
    print("📂 Chargement du fichier Excel...")
    wb = openpyxl.load_workbook(EXCEL_PATH)
    ws = wb['Feuil1']

    db = SessionLocal()

    try:
        # Charger tous les PDV en mémoire (numero_pdv → id)
        print("🔍 Chargement des PDV depuis la base...")
        pdvs = db.query(PDV).all()
        pdv_map = {str(p.numero_pdv).strip(): p.id for p in pdvs}
        print(f"✅ {len(pdv_map)} PDV chargés")

        # Supprimer les anciennes performances mensuelles
        deleted = db.query(MonthlyPerformance).delete()
        db.commit()
        print(f"🗑️  {deleted} anciennes performances mensuelles supprimées")

        imported = 0
        skipped_pdv = 0
        skipped_mois = 0
        not_found = set()

        print("🔄 Import des performances mensuelles...")

        for row in ws.iter_rows(min_row=2, values_only=True):
            pdv_num, mois_str, annee, nb_depot, mt_depot, nb_retrait, mt_retrait = row

            if pdv_num is None:
                continue

            pdv_str = str(int(pdv_num)).strip() if isinstance(pdv_num, float) else str(pdv_num).strip()

            # Vérifier que le PDV existe
            if pdv_str not in pdv_map:
                not_found.add(pdv_str)
                skipped_pdv += 1
                continue

            # Convertir le mois
            mois_num = MOIS_MAP.get(str(mois_str).strip())
            if mois_num is None:
                skipped_mois += 1
                continue

            # Valeurs par défaut si None
            nb_depot    = int(nb_depot or 0)
            mt_depot    = float(mt_depot or 0)
            nb_retrait  = int(nb_retrait or 0)
            mt_retrait  = float(mt_retrait or 0)

            # Calculs
            nb_operations = nb_depot + nb_retrait
            ca = mt_depot + mt_retrait
            est_actif = nb_operations > 0

            perf = MonthlyPerformance(
                pdv_id=pdv_map[pdv_str],
                annee=int(annee),
                mois=mois_num,
                nb_depots=nb_depot,
                montant_depots=mt_depot,
                nb_retraits=nb_retrait,
                montant_retraits=mt_retrait,
                nb_operations=nb_operations,
                ca=ca,
                est_actif=est_actif,
                ca_mois_precedent=0.0,
                taux_variation=0.0,
            )
            db.add(perf)
            imported += 1

            if imported % 200 == 0:
                db.commit()
                print(f"  ... {imported} performances importées")

        db.commit()

        # Calculer les variations mois/mois
        print("📊 Calcul des variations mensuelles...")
        perfs = db.query(MonthlyPerformance).order_by(
            MonthlyPerformance.pdv_id,
            MonthlyPerformance.annee,
            MonthlyPerformance.mois
        ).all()

        prev = {}
        for p in perfs:
            key = p.pdv_id
            if key in prev:
                p.ca_mois_precedent = prev[key]
                if prev[key] > 0:
                    p.taux_variation = ((p.ca - prev[key]) / prev[key]) * 100
            prev[key] = p.ca

        db.commit()
        print("✅ Variations calculées")

        print()
        print(f"✅ Import terminé !")
        print(f"   📊 Performances importées : {imported}")
        print(f"   ⚠️  PDV non trouvés        : {skipped_pdv} ({len(not_found)} uniques)")
        print(f"   ⏭️  Mois invalides          : {skipped_mois}")

        if not_found:
            print(f"\n   PDV non trouvés (premiers 10): {list(not_found)[:10]}")

        # Stats finales
        total = db.query(MonthlyPerformance).count()
        from sqlalchemy import func
        stats = db.query(
            MonthlyPerformance.annee,
            MonthlyPerformance.mois,
            func.count(MonthlyPerformance.id).label('nb'),
            func.sum(MonthlyPerformance.ca).label('ca_total'),
            func.sum(MonthlyPerformance.nb_operations).label('ops_total'),
        ).group_by(MonthlyPerformance.annee, MonthlyPerformance.mois)\
         .order_by(MonthlyPerformance.annee, MonthlyPerformance.mois).all()

        print()
        print("📈 Résumé par période:")
        mois_noms = {1:'Janvier',2:'Février',3:'Mars',4:'Avril',5:'Mai',6:'Juin',
                     7:'Juillet',8:'Août',9:'Septembre',10:'Octobre',11:'Novembre',12:'Décembre'}
        for s in stats:
            print(f"   {mois_noms[s.mois]} {s.annee}: {s.nb} PDV | CA: {s.ca_total:,.0f} FCFA | Opérations: {s.ops_total:,.0f}")

    except Exception as e:
        db.rollback()
        print(f"❌ Erreur : {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()
