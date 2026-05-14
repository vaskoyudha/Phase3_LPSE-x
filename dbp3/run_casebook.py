
"""Helper script to run casebook module on Windows from dbp3 folder."""

import sys
from pathlib import Path

# Karena kita di folder dbp3, PROJECT_ROOT adalah parent folder
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.casebook import main

if __name__ == "__main__":
    main()
