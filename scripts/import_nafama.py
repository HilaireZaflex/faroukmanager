#!/usr/bin/env python3
"""
Script d'import des données NAFAMA depuis un fichier Excel.
Usage: python import_nafama.py [chemin_fichier.xlsx]
Par défaut, cherche 'BASE DE NAFAMA FAROUK.xlsx' dans le répertoire courant.
"""

import sys
import os
import pandas as pd
from datetime import datetime

# Ajouter le backend au path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.database import SessionLocal, engine, Base
from app.models.nafama import NafamaTransaction

# Créer les tables si elles n'existent pas
Base.metadata.create_all(bind=engine)


def import_nafama(filepath: str):
    print(f"📂 Lecture du fichier: {filepath}")
    
    try:
        df = pd.read_excel(filepath)
    except Exception as e:
        print(f"❌ Erreur lecture: {e}")
        sys.exit(1)

    print(f"✅ {len(df)} lignes lues")
    print(f"   Colonnes: {list(df.columns)}")

    # Normaliser colonnes
    df.columns = [c.strip().upper() for c in df.columns]
    
    # Renommer si nécessaire
    col_map = {}
    for c in df.columns:
        if "MONTANT" in c:
            col_map[c] = "MONTANT"
        elif "DATE" in c:
            col_map[c] = "DATE"
        elif "PDV" in c:
            col_map[c] = "PDV"
    df = df.rename(columns=col_map)

    required = {"PDV", "MONTANT", "DATE"}
    missing = required - set(df.columns)
    if missing:
        print(f"❌ Colonnes manquantes: {missing}")
        sys.exit(1)

    # Nettoyage
    df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")
    df = df.dropna(subset=["DATE", "PDV", "MONTANT"])
    df["PDV"] = df["PDV"].astype(str).str.strip()
    df["MONTANT"] = pd.to_numeric(df["MONTANT"], errors="coerce").fillna(0).astype(int)
    df["ANNEE"] = df["DATE"].dt.year
    df["MOIS"] = df["DATE"].dt.month
    df["SEMAINE"] = df["DATE"].dt.isocalendar().week.astype(int)

    print(f"📊 Données nettoyées: {len(df)} lignes valides")
    print(f"   Période: {df['DATE'].min().date()} → {df['DATE'].max().date()}")
    print(f"   PDVs uniques: {df['PDV'].nunique()}")
    print(f"   CA Total: {df['MONTANT'].sum():,} FCFA")
    print(f"   Mois: {sorted(df['MOIS'].unique())}")
    print(f"   Semaines: {sorted(df['SEMAINE'].unique())}")

    db = SessionLocal()
    try:
        # Vider la table existante
        count_before = db.query(NafamaTransaction).count()
        if count_before > 0:
            print(f"\n⚠️  {count_before} lignes existantes seront supprimées...")
            db.query(NafamaTransaction).delete()
            db.commit()

        # Insérer par lots
        batch_size = 5000
        total = len(df)
        inserted = 0

        for i in range(0, total, batch_size):
            batch = df.iloc[i:i+batch_size]
            objects = [
                NafamaTransaction(
                    numero_pdv=str(row["PDV"]),
                    montant=int(row["MONTANT"]),
                    date_transaction=row["DATE"].date(),
                    annee=int(row["ANNEE"]),
                    mois=int(row["MOIS"]),
                    semaine=int(row["SEMAINE"]),
                )
                for _, row in batch.iterrows()
            ]
            db.bulk_save_objects(objects)
            db.commit()
            inserted += len(objects)
            print(f"   Inséré: {inserted}/{total} ({round(inserted/total*100)}%)")

        print(f"\n✅ Import terminé! {inserted} lignes insérées.")

        # Résumé par mois
        print("\n📅 Résumé par mois:")
        summary = df.groupby(["ANNEE", "MOIS"])["MONTANT"].agg(["count", "sum"])
        mois_noms = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
        for (annee, mois), row in summary.iterrows():
            print(f"   {mois_noms[mois]} {annee}: {int(row['count'])} transactions, CA={int(row['sum']):,} FCFA")

    except Exception as e:
        db.rollback()
        print(f"❌ Erreur insertion: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    else:
        # Chercher le fichier par défaut
        candidates = [
            os.path.expanduser("~/Downloads/BASE DE NAFAMA FAROUK.xlsx"),
            "BASE DE NAFAMA FAROUK.xlsx",
            "../BASE DE NAFAMA FAROUK.xlsx",
        ]
        filepath = next((p for p in candidates if os.path.exists(p)), None)
        if not filepath:
            print("❌ Fichier non trouvé. Spécifiez le chemin: python import_nafama.py <fichier.xlsx>")
            sys.exit(1)

    import_nafama(filepath)
