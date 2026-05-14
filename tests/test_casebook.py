from pathlib import Path

import numpy as np
import pandas as pd

from src.casebook import build_casebook, render_static_casebook_html
from src.product_demo import DemoDataset, PredictionBackend, predict_risk_scores


class FakeBackend(PredictionBackend):
    def __init__(self, feature_names):
        super().__init__("fake", Path("model_risk.ubj"), object(), list(feature_names))

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        self.align_features(features)
        return np.array([[0.10, 0.20, 0.70], [0.70, 0.20, 0.10]], dtype=float)[: len(features)]


def _dataset(tmp_path: Path) -> DemoDataset:
    features = pd.DataFrame(
        {
            "f_tender_value_log": [12.0, 3.0],
            "f_price_deviation_ratio": [0.4, -0.1],
            "f_buyer_supplier_repeat_count": [5.0, 1.0],
        },
        index=[10, 20],
    )
    raw = pd.DataFrame(
        {
            "ocid": ["ocds-a", "ocds-b"],
            "tender_id": ["T-10", "T-20"],
            "tender_title": ["Paket Infrastruktur", "Paket Alat"],
            "buyer_name": ["Dinas A", "Dinas B"],
            "supplier_name": ["Penyedia A", "Penyedia B"],
            "tender_value_amount": [1_000_000, 2_000_000],
            "tender_value_currency": ["IDR", "IDR"],
        },
        index=[10, 20],
    )
    return DemoDataset(features, raw, tmp_path / "features.parquet", tmp_path / "raw.parquet")


def test_casebook_payload_contains_static_fallback_contract(tmp_path):
    dataset = _dataset(tmp_path)
    backend = FakeBackend(dataset.features.columns)
    predictions = predict_risk_scores(dataset.features, backend)

    payload = build_casebook("10:ocds-a", dataset, predictions, backend)

    assert payload["model_output"]["predicted_label"] == "Risiko Tinggi"
    assert payload["provenance"]["inference_mode"] == "offline_local"
    assert payload["provenance"]["split_usage"].endswith("bukan pelatihan atau tuning.")
    assert "prioritas review" in payload["narrative"]
    assert "bukan tuduhan pelanggaran" in payload["narrative"]
    assert "kontribusi SHAP sekitar" not in payload["narrative"]
    brief = payload["explanation_brief"]
    assert brief["summary"]
    assert brief["confidence_label"].startswith("Keyakinan model")
    assert "probabilitas" in brief["model_interpretation"].lower()
    assert "SHAP menunjukkan" in brief["shap_note"]
    assert "bukan bukti pelanggaran" in brief["shap_note"]
    assert "bukan tuduhan pelanggaran" in brief["safety_note"]
    assert brief["top_drivers"]
    assert brief["top_drivers"][0]["title"] == "Nilai tender relatif besar"
    assert brief["top_drivers"][0]["reviewer_check"]
    assert brief["reviewer_checklist"]
    assert payload["reviewer_questions"]
    assert payload["guardrail_badges"]


def test_static_casebook_html_is_generated_from_payload(tmp_path):
    dataset = _dataset(tmp_path)
    backend = FakeBackend(dataset.features.columns)
    predictions = predict_risk_scores(dataset.features, backend)
    payload = build_casebook("10:ocds-a", dataset, predictions, backend)
    output = render_static_casebook_html(payload, tmp_path / "casebook.html")

    html = output.read_text(encoding="utf-8")
    assert output.is_file()
    assert "LPSE-X Casebook Report" in html
    assert "Explainable Procurement Risk Triage" in html
    assert "Report Generated" in html
    assert "Data Source" in html
    assert "Assessment Risiko" in html
    assert "Review Priority" in html
    assert "Auditor Brief" in html
    assert "Faktor yang menaikkan prioritas" in html
    assert "Reviewer Checklist" in html
    assert "SHAP menunjukkan" in html
    assert "Checklist:" in html
    assert "zero-axis signed contribution" in html
    assert "Prioritas review, bukan tuduhan pelanggaran." in html
    assert "Label risiko bersifat heuristik" in html
    assert "triase risiko" in html
    assert "prioritas review" in html
    assert "bukan tuduhan pelanggaran" in html
    assert "No Model Retraining" in html
    assert "No Live Scraping" in html
    assert "Anti-Leakage Split Preserved" in html
