"""LPSE-X product backend package.

This package wraps the ML primitives shipped in the sibling `lpseN` ML repo
(`src.product_demo`, `src.casebook`, `src.artifacts`, ...) with FastAPI,
review storage, and static frontend serving. It does not train, tune, or
export model artifacts.

Both this product repo and the ML repo expose a top-level `src` package. To
keep the API surface stable (`src.api`, `src.api_schemas`, `src.reviews`)
and still be able to import ML primitives (`src.product_demo`,
`src.casebook`, `src.artifacts`, `src.narrative`, ...), we extend the
package `__path__` to include the ML repo's `src/` directory.

The ML repo location can be overridden with the `LPSEX_ML_REPO` env var.
"""

from __future__ import annotations

import os as _os
from pathlib import Path as _Path

_THIS_DIR = _Path(__file__).resolve().parent
_PRODUCT_ROOT = _THIS_DIR.parent
_ML_REPO = _Path(_os.environ.get("LPSEX_ML_REPO") or _PRODUCT_ROOT.parent / "lpseN").resolve()
_ML_SRC = _ML_REPO / "src"

if _ML_SRC.exists():
    _ml_src_str = str(_ML_SRC)
    if _ml_src_str not in __path__:  # type: ignore[name-defined]
        __path__.append(_ml_src_str)  # type: ignore[name-defined]
