"""Smoke checks for the local Streamlit app without launching a browser."""

from __future__ import annotations

import ast
import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_PATH = PROJECT_ROOT / "app.py"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _source() -> str:
    return APP_PATH.read_text(encoding="utf-8")


def test_app_source_parses_and_imports_without_running_streamlit() -> None:
    source = _source()
    ast.parse(source)
    spec = importlib.util.spec_from_file_location("lpsex_app_smoke", APP_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    assert module.APP_TITLE == "LPSE-X Command Center"
    assert callable(module.main)


def test_required_guardrail_phrases_are_present() -> None:
    source = _source().lower()
    for phrase in ("triase risiko", "prioritas review", "bukan tuduhan pelanggaran"):
        assert phrase in source


def test_prohibited_guardrail_phrases_are_absent() -> None:
    source = _source().lower()
    prohibited = (
        "terbukti " + "fraud",
        "terbukti " + "korupsi",
        "fraud " + "final",
        "legal " + "verdict",
        "confirmed " + "corruption",
        "putusan " + "hukum",
    )
    for phrase in prohibited:
        assert phrase not in source
