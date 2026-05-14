from pathlib import Path

from src.narrative import render_explanation_narrative
from src.product_demo import HEURISTIC_LABEL_NOTE_ID, SAFE_GUARDRAIL_ID


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROHIBITED_COPY = [
    "peringkat investigatif",
    "dinaikkan ke risiko kritis",
    "bukti resmi terhubung",
    "rating kritis didukung bukti resmi terhubung",
    "terbukti " + "fraud",
    "terbukti " + "korupsi",
    "fraud " + "final",
    "legal " + "verdict",
    "confirmed " + "corruption",
    "putusan " + "hukum",
]
REQUIRED_COPY = ["triase risiko", "prioritas review", "bukan tuduhan pelanggaran"]


def _owned_texts() -> str:
    paths = [
        PROJECT_ROOT / "README.md",
        PROJECT_ROOT / "DEMO_SCRIPT.md",
        PROJECT_ROOT / "demo_casebook.html",
    ]
    existing = [path.read_text(encoding="utf-8") for path in paths if path.exists()]
    return "\n".join(existing).lower()


def test_narrative_uses_review_triage_not_accusation_language():
    narrative = render_explanation_narrative(
        {
            "predicted_class": 2,
            "predicted_label": "Risiko Tinggi",
            "probability": 0.82,
            "factors": [
                {"feature": "f_price_deviation_ratio", "value": 0.31, "shap_value": 0.8},
            ],
        }
    ).lower()

    for required in REQUIRED_COPY:
        assert required in narrative
    for blocked in PROHIBITED_COPY:
        assert blocked not in narrative


def test_narrative_translates_model_features_and_avoids_repetitive_technical_copy():
    narrative = render_explanation_narrative(
        {
            "predicted_class": 2,
            "predicted_label": "Risiko Tinggi",
            "probability": 1.0,
            "factors": [
                {"feature": "f_tender_value_zscore_buyer", "value": 2.5706, "shap_value": 4.2327},
                {"feature": "f_supplier_recent_90d_award_count", "value": 1, "shap_value": -1.2605},
            ],
        }
    )

    assert "nilai tender dibanding pola historis buyer" in narrative.lower()
    assert "aktivitas award supplier dalam 90 hari terakhir" in narrative.lower()
    assert "Keyakinan model sangat tinggi (mendekati 100%)" in narrative
    assert "SHAP menunjukkan faktor mana" in narrative
    assert "Diturunkan dari triase model" not in narrative
    assert "Model mengklasifikasikan paket ini" not in narrative
    assert "kontribusi SHAP sekitar" not in narrative


def test_owned_docs_and_static_casebook_avoid_prohibited_claims():
    text = _owned_texts()
    for required in REQUIRED_COPY:
        assert required in text
    for blocked in PROHIBITED_COPY:
        assert blocked not in text
    assert SAFE_GUARDRAIL_ID.lower() in text
    assert HEURISTIC_LABEL_NOTE_ID.lower() in text
