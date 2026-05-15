"""Pytest bootstrap.

Adds the product repo root to `sys.path` so `from backend.api import app` works.
The product `src/__init__.py` extends its package `__path__` to include the
ML-only sibling repo's `src/` directory, which lets tests import both
product-owned modules (`backend.api`, `backend.api_schemas`, `backend.reviews`) and ML
primitives (`src.product_demo`, `src.casebook`, ...) under one package name.

Override the ML repo location with `LPSEX_ML_REPO` if needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

import backend.api as api_module

PRODUCT_ROOT = Path(__file__).resolve().parents[1]
if str(PRODUCT_ROOT) not in sys.path:
    sys.path.insert(0, str(PRODUCT_ROOT))


@pytest.fixture(autouse=True)
def isolate_uploaded_package_db(tmp_path, monkeypatch):
    db_path = tmp_path / "uploaded_tenders.sqlite3"
    monkeypatch.setattr(api_module, "UPLOAD_DB_PATH", db_path, raising=False)
    if hasattr(api_module, "_uploaded_package_store"):
        api_module._uploaded_package_store.cache_clear()
    if hasattr(api_module, "_ARCHIVE_ANALYTICS_RESPONSE_CACHE"):
        api_module._ARCHIVE_ANALYTICS_RESPONSE_CACHE.clear()
    yield
    if hasattr(api_module, "_uploaded_package_store"):
        api_module._uploaded_package_store.cache_clear()
    if hasattr(api_module, "_ARCHIVE_ANALYTICS_RESPONSE_CACHE"):
        api_module._ARCHIVE_ANALYTICS_RESPONSE_CACHE.clear()
