"""Rend le paquet `app` importable quand on lance `pytest` depuis backend/."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
