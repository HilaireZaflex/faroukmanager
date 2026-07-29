from sqlalchemy import Column, Integer, String, Date, BigInteger, Index
from sqlalchemy.orm import relationship
from app.core.database import Base


class NafamaTransaction(Base):
    """
    Stocke les transactions NAFAMA brutes importées depuis le fichier Excel.
    Chaque ligne = 1 PDV + 1 date + 1 montant.
    """
    __tablename__ = "nafama_transactions"

    id = Column(Integer, primary_key=True, index=True)
    numero_pdv = Column(String, index=True, nullable=False)   # ex: "94508811"
    montant = Column(BigInteger, nullable=False, default=0)    # MONTANT SOMME
    date_transaction = Column(Date, nullable=False, index=True)  # Date
    annee = Column(Integer, nullable=False, index=True)
    mois = Column(Integer, nullable=False, index=True)         # 1-12
    semaine = Column(Integer, nullable=False, index=True)      # ISO week

    __table_args__ = (
        Index("ix_nafama_pdv_date", "numero_pdv", "date_transaction"),
        Index("ix_nafama_annee_mois", "annee", "mois"),
        Index("ix_nafama_annee_semaine", "annee", "semaine"),
    )
