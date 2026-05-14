"""Pytest bootstrap.

Adds the product repo root to `sys.path` so `from src.api import app` works.
The product `src/__init__.py` extends its package `__path__` to include the
ML-only sibling repo's `src/` directory, which lets tests import both
product-owned modules (`src.api`, `src.api_schemas`, `src.reviews`) and ML
primitives (`src.product_demo`, `src.casebook`, ...) under one package name.

Override the ML repo location with `LPSEX_ML_REPO` if needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

PRODUCT_ROOT = Path(__file__).resolve().parents[1]
if str(PRODUCT_ROOT) not in sys.path:
    sys.path.insert(0, str(PRODUCT_ROOT))
