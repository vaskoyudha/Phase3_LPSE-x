"""Offline product-demo adapters for LPSE-X Command Center.

This module turns the submitted model artifacts and prepared split data into a
stable payload for the FastAPI/React command center and static casebook fallback.
It performs local inference only: no scraping, cloud calls, training, HPO, or
artifact export.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import re
from time import perf_counter
from typing import Any, Iterable
import unicodedata

import numpy as np
import pandas as pd

from src.artifacts import resolve_model_artifact

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TRAIN_DATA_DIR = PROJECT_ROOT / "train_data"
TEST_DATA_DIR = PROJECT_ROOT / "test_data"
DEFAULT_FEATURES_PATH = TEST_DATA_DIR / "features.parquet"
DEFAULT_RAW_PATH = TEST_DATA_DIR / "raw.parquet"
ARCHIVE_SPLIT_PATHS = {
    "train_data": (TRAIN_DATA_DIR / "features.parquet", TRAIN_DATA_DIR / "raw.parquet"),
    "test_data": (TEST_DATA_DIR / "features.parquet", TEST_DATA_DIR / "raw.parquet"),
}
ARCHIVE_DISPLAY_NOTE_ID = (
    "Full Archive mencakup 465.184 paket tender lokal yang sudah disiapkan. "
    "Bukti inferensi held-out tetap 93.034 baris test split; baris train_data "
    "ditampilkan hanya untuk browsing arsip produk."
)

RISK_LABELS_ID = {
    0: "Risiko Rendah",
    1: "Risiko Sedang",
    2: "Risiko Tinggi",
}

RISK_LEVEL_ORDER = ["Risiko Tinggi", "Risiko Sedang", "Risiko Rendah"]
SAFE_GUARDRAIL_ID = (
    "Output LPSE-X adalah triase risiko dan prioritas review; "
    "bukan tuduhan pelanggaran, bukan putusan akhir, dan wajib ditinjau manusia."
)
HEURISTIC_LABEL_NOTE_ID = (
    "Label risiko bersifat heuristik dari data split lokal; bukan status pelanggaran yang terverifikasi."
)
BUYER_REGION_SOURCE_ID = "derived_from_buyer_name"


def normalize_region_key(region_type: Any, region_name: Any) -> str:
    """Return a stable map/filter key for derived Indonesian buyer regions."""
    normalized_type = "" if region_type is None or pd.isna(region_type) else str(region_type).strip().casefold()
    if normalized_type not in {"kabupaten", "kota", "provinsi"}:
        return ""

    text = "" if region_name is None or pd.isna(region_name) else " ".join(str(region_name).split())
    if not text:
        return ""
    folded = text.casefold()
    prefixes = (
        "kota administrasi ",
        "kabupaten administrasi ",
        "kabupaten ",
        "kota ",
        "provinsi ",
        "propinsi ",
    )
    for prefix in prefixes:
        if folded.startswith(prefix):
            text = text[len(prefix) :].strip(" -–—,.;:/")
            break
    else:
        if normalized_type == "kota" and folded.startswith("administrasi "):
            text = text[len("administrasi ") :].strip(" -–—,.;:/")

    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.casefold()).strip("-")
    return f"{normalized_type}-{slug}" if slug else ""


@dataclass(frozen=True)
class DemoDataset:
    """Prepared local demo data with aligned feature and display rows."""

    features: pd.DataFrame
    raw: pd.DataFrame
    feature_path: Path
    raw_path: Path
    max_rows: int | None = None


@dataclass(frozen=True)
class InferenceRunMetadata:
    """Judge-facing provenance for one cached offline inference run."""

    model_artifact: str
    model_backend: str
    feature_source: str
    raw_source: str
    source_split: str
    rows_scored: int
    rows_ranked: int
    rows_displayed: int
    queue_limit: int
    loaded_rows_cap: int | None
    data_load_latency_ms: float
    model_load_latency_ms: float
    prediction_latency_ms: float
    queue_build_latency_ms: float
    total_latency_ms: float
    generated_at: str
    inference_mode: str = "offline_local"
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True
    display_note: str = (
        "Seluruh test_data/features.parquet diberi skor secara lokal; UI hanya menampilkan "
        "antrean prioritas teratas agar reviewer fokus."
    )
    guardrail: str = SAFE_GUARDRAIL_ID


@dataclass(frozen=True)
class ArchiveInferenceMetadata:
    """Product-browsing provenance for the full local prepared tender archive."""

    model_artifact: str
    model_backend: str
    archive_scope: str
    rows_scored: int
    rows_ranked: int
    train_rows: int
    heldout_rows: int
    feature_sources: list[str]
    raw_sources: list[str]
    source_splits: list[str]
    data_load_latency_ms: float
    model_load_latency_ms: float
    prediction_latency_ms: float
    queue_build_latency_ms: float
    total_latency_ms: float
    generated_at: str
    inference_mode: str = "offline_local"
    no_cloud_call: bool = True
    no_live_scraping: bool = True
    no_retraining: bool = True
    display_note: str = ARCHIVE_DISPLAY_NOTE_ID
    guardrail: str = SAFE_GUARDRAIL_ID


@dataclass
class PredictionBackend:
    """Loaded local prediction backend for submitted model artifacts."""

    kind: str
    model_artifact: Path
    model: Any
    feature_names: list[str]
    class_count: int = 3

    def align_features(self, features: pd.DataFrame) -> pd.DataFrame:
        missing = [name for name in self.feature_names if name not in features.columns]
        if missing:
            raise ValueError(
                "Demo feature data is missing model feature(s): " + ", ".join(missing[:10])
            )
        return features.loc[:, self.feature_names]

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        aligned = self.align_features(features)
        if self.kind == "xgboost":
            import xgboost as xgb

            probs = np.asarray(self.model.predict(xgb.DMatrix(aligned)), dtype=float)
        elif self.kind == "onnx":
            import onnxruntime as ort  # noqa: F401 - imported for runtime availability

            input_name = self.model.get_inputs()[0].name
            raw_outputs = self.model.run(None, {input_name: aligned.to_numpy(dtype=np.float32)})
            probs = _coerce_onnx_probabilities(raw_outputs)
        else:
            raise ValueError(f"Unsupported prediction backend kind: {self.kind}")

        if probs.ndim == 1:
            probs = probs.reshape(-1, 1)
        return probs


def _coerce_onnx_probabilities(raw_outputs: Iterable[Any]) -> np.ndarray:
    outputs = list(raw_outputs)
    if not outputs:
        raise ValueError("ONNX model returned no outputs")
    candidate = outputs[-1]
    if isinstance(candidate, list) and candidate and isinstance(candidate[0], dict):
        rows = []
        keys = sorted(candidate[0])
        for item in candidate:
            rows.append([float(item.get(key, 0.0)) for key in keys])
        return np.asarray(rows, dtype=float)
    return np.asarray(candidate, dtype=float)


def load_prediction_backend(
    model_path: Path | str | None = None,
    *,
    kind: str = "ubj",
) -> PredictionBackend:
    """Load a submitted model artifact for local inference only."""
    artifact_kind = "onnx" if kind == "onnx" else "ubj"
    artifact = resolve_model_artifact(artifact_kind, explicit_path=model_path)
    if artifact.suffix.lower() == ".onnx" or artifact_kind == "onnx":
        import onnxruntime as ort

        session = ort.InferenceSession(str(artifact), providers=["CPUExecutionProvider"])
        # The submitted ONNX artifact stores tensor shape but not original
        # feature names. Reuse the submitted UBJ artifact's model feature order
        # so ONNX smoke/prediction calls receive the same aligned columns.
        ubj_backend = load_prediction_backend(kind="ubj")
        feature_names = ubj_backend.feature_names
        return PredictionBackend("onnx", artifact, session, feature_names)

    import xgboost as xgb

    booster = xgb.Booster()
    booster.load_model(str(artifact))
    feature_names = list(booster.feature_names or [])
    if not feature_names:
        raise ValueError(
            f"XGBoost artifact {artifact} does not include feature names; cannot safely align demo data."
        )
    class_count = int(booster.attr("num_class") or 3)
    return PredictionBackend("xgboost", artifact, booster, feature_names, class_count=class_count)


def load_demo_dataset(
    max_rows: int | None = 5000,
    *,
    features_path: Path | str = DEFAULT_FEATURES_PATH,
    raw_path: Path | str = DEFAULT_RAW_PATH,
) -> DemoDataset:
    """Load prepared local test split data for offline demo inference.

    ``test_data`` is used as held-out demo/evaluation data only. This function
    does not write files, tune hyperparameters, or call network resources.
    """
    feature_path = Path(features_path)
    raw_data_path = Path(raw_path)
    features = pd.read_parquet(feature_path)
    raw = pd.read_parquet(raw_data_path)
    if len(features) != len(raw):
        raise ValueError(
            f"Feature/raw row mismatch: {len(features)} feature rows vs {len(raw)} raw rows"
        )
    if max_rows is not None:
        features = features.head(max_rows).copy()
        raw = raw.head(max_rows).copy()
    return DemoDataset(features=features, raw=raw, feature_path=feature_path, raw_path=raw_data_path, max_rows=max_rows)




def load_split_dataset(
    split_name: str,
    features_path: Path | str,
    raw_path: Path | str,
    *,
    max_rows: int | None = None,
) -> DemoDataset:
    """Load one prepared archive split without mutating local data artifacts."""
    dataset = load_demo_dataset(max_rows=max_rows, features_path=features_path, raw_path=raw_path)
    if split_name not in {"train_data", "test_data"}:
        raise ValueError(f"Unsupported archive split: {split_name}")
    return dataset


def predict_risk_scores(features: pd.DataFrame, backend: PredictionBackend) -> pd.DataFrame:
    """Return model predictions sorted by highest review priority first."""
    probs = backend.predict_proba(features)
    if probs.shape[1] == 1:
        predicted_class = (probs[:, 0] >= 0.5).astype(int)
        predicted_probability = probs[:, 0]
        high_risk_score = probs[:, 0]
    else:
        predicted_class = np.argmax(probs, axis=1).astype(int)
        predicted_probability = probs[np.arange(len(probs)), predicted_class]
        high_risk_col = min(2, probs.shape[1] - 1)
        high_risk_score = probs[:, high_risk_col]

    result = pd.DataFrame(
        {
            "predicted_class": predicted_class,
            "predicted_label": [RISK_LABELS_ID.get(int(cls), f"Kelas {cls}") for cls in predicted_class],
            "probability": predicted_probability.astype(float),
            "risk_priority_score": high_risk_score.astype(float),
            "probability_low": probs[:, 0].astype(float) if probs.shape[1] >= 1 else np.nan,
            "probability_medium": probs[:, 1].astype(float) if probs.shape[1] >= 2 else np.nan,
            "probability_high": probs[:, 2].astype(float) if probs.shape[1] >= 3 else high_risk_score.astype(float),
        },
        index=features.index,
    )
    result["_row_id"] = result.index
    result = result.sort_values(
        ["risk_priority_score", "probability"], ascending=[False, False]
    ).copy()
    result["risk_rank"] = np.arange(1, len(result) + 1)
    return result


def _first_available(row: pd.Series, candidates: Iterable[str], default: Any = None) -> Any:
    for key in candidates:
        if key in row.index:
            value = row.get(key)
            if value is not None and not pd.isna(value):
                if str(value).strip() != "":
                    return value
    return default


def format_currency(value: Any, currency: str | None = "IDR") -> str:
    if value is None or pd.isna(value):
        return "Tidak tersedia"
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return str(value)
    if currency and currency.upper() == "IDR":
        return f"Rp{numeric:,.0f}".replace(",", ".")
    return f"{currency or ''} {numeric:,.0f}".strip()


def _first_available_series(
    frame: pd.DataFrame,
    candidates: Iterable[str],
    default: Any = None,
) -> pd.Series:
    """Vectorized sibling of ``_first_available`` for queue construction."""
    if isinstance(default, pd.Series):
        result = default.reindex(frame.index).astype(object)
    elif callable(default):
        result = pd.Series([default(idx) for idx in frame.index], index=frame.index, dtype=object)
    else:
        result = pd.Series(default, index=frame.index, dtype=object)

    filled = pd.Series(False, index=frame.index)
    for key in candidates:
        if key not in frame.columns:
            continue
        values = frame[key]
        valid = values.notna() & values.astype(str).str.strip().ne("")
        mask = valid & ~filled
        if mask.any():
            result.loc[mask] = values.loc[mask]
            filled.loc[mask] = True
    return result


def _case_id_series(indices: pd.Index, raw_rows: pd.DataFrame) -> pd.Series:
    row_ids = pd.Series(indices, index=indices, dtype=object).astype(str)
    ocids = _first_available_series(raw_rows, ["ocid", "tender_id"], "").fillna("").astype(str).str.slice(0, 80)
    return row_ids.where(ocids.eq(""), row_ids + ":" + ocids)


def _raw_series_or_default(frame: pd.DataFrame, column: str, default: Any) -> pd.Series:
    fallback = default.reindex(frame.index) if isinstance(default, pd.Series) else default
    if column not in frame:
        if isinstance(fallback, pd.Series):
            return fallback.astype(object)
        return pd.Series(fallback, index=frame.index, dtype=object)
    return frame[column].where(frame[column].notna(), fallback)


def _raw_text_or_default(frame: pd.DataFrame, column: str, default: Any) -> pd.Series:
    values = _raw_series_or_default(frame, column, default)
    text = values.astype(str)
    fallback = default.reindex(frame.index).astype(str) if isinstance(default, pd.Series) else str(default)
    return text.where(text.str.strip().ne(""), fallback)


def _fast_archive_case_ids(indices: pd.Index, raw_rows: pd.DataFrame) -> pd.Series:
    row_ids = pd.Series(indices, index=indices, dtype=object).astype(str)
    ocids = _raw_text_or_default(raw_rows, "ocid", "").str.slice(0, 80)
    return row_ids.where(ocids.eq(""), row_ids + ":" + ocids)


def derive_buyer_region_from_name(buyer_name: Any) -> dict[str, str]:
    """Derive a display region from buyer_name only; never use buyer_id fallback IDs."""
    text = "" if buyer_name is None or pd.isna(buyer_name) else " ".join(str(buyer_name).split())
    if not text:
        return {
            "buyer_region": "Tidak tersedia",
            "buyer_region_type": "unknown",
            "buyer_region_key": "",
            "buyer_region_source": BUYER_REGION_SOURCE_ID,
            "buyer_region_note": "buyer_name kosong; buyer_id/fallback ID tidak digunakan.",
        }

    normalized = text.casefold()
    region_patterns = [
        ("provinsi", "Provinsi", ["provinsi ", "propinsi "]),
        ("kabupaten", "Kabupaten", ["kabupaten ", "kab. "]),
        ("kota", "Kota", ["kota administrasi ", "kota "]),
    ]
    for region_type, display_prefix, markers in region_patterns:
        for marker in markers:
            position = normalized.find(marker)
            if position < 0:
                continue
            raw_region = text[position + len(marker) :].strip(" -–—,.;:/")
            if raw_region:
                buyer_region = f"{display_prefix} {raw_region}"
                return {
                    "buyer_region": buyer_region,
                    "buyer_region_type": region_type,
                    "buyer_region_key": normalize_region_key(region_type, buyer_region),
                    "buyer_region_source": BUYER_REGION_SOURCE_ID,
                    "buyer_region_note": "Diturunkan dari buyer_name; buyer_id/fallback ID tidak digunakan.",
                }

    return {
        "buyer_region": "Tidak tersedia",
        "buyer_region_type": "unknown",
        "buyer_region_key": "",
        "buyer_region_source": BUYER_REGION_SOURCE_ID,
        "buyer_region_note": "buyer_name tidak memuat pola provinsi/kabupaten/kota; buyer_id/fallback ID tidak digunakan.",
    }


def derive_buyer_region_columns_from_names(buyer_names: pd.Series) -> pd.DataFrame:
    """Batch region derivation for large archive queues without per-row dicts."""
    regions: list[str] = []
    region_types: list[str] = []
    region_keys: list[str] = []
    notes: list[str] = []
    region_patterns = [
        ("provinsi", "Provinsi", ["provinsi ", "propinsi "]),
        ("kabupaten", "Kabupaten", ["kabupaten ", "kab. "]),
        ("kota", "Kota", ["kota administrasi ", "kota "]),
    ]
    for value in buyer_names.tolist():
        text = "" if value is None or pd.isna(value) else " ".join(str(value).split())
        if not text:
            regions.append("Tidak tersedia")
            region_types.append("unknown")
            region_keys.append("")
            notes.append("buyer_name kosong; buyer_id/fallback ID tidak digunakan.")
            continue

        normalized = text.casefold()
        found_region = "Tidak tersedia"
        found_type = "unknown"
        found_note = "buyer_name tidak memuat pola provinsi/kabupaten/kota; buyer_id/fallback ID tidak digunakan."
        for region_type, display_prefix, markers in region_patterns:
            for marker in markers:
                position = normalized.find(marker)
                if position < 0:
                    continue
                raw_region = text[position + len(marker) :].strip(" -–—,.;:/")
                if raw_region:
                    found_region = f"{display_prefix} {raw_region}"
                    found_type = region_type
                    found_note = "Diturunkan dari buyer_name; buyer_id/fallback ID tidak digunakan."
                    break
            if found_type != "unknown":
                break
        regions.append(found_region)
        region_types.append(found_type)
        region_keys.append(normalize_region_key(found_type, found_region))
        notes.append(found_note)

    return pd.DataFrame(
        {
            "buyer_region": regions,
            "buyer_region_type": region_types,
            "buyer_region_key": region_keys,
            "buyer_region_source": BUYER_REGION_SOURCE_ID,
            "buyer_region_note": notes,
        },
        index=buyer_names.index,
    )


def make_case_id(index: Any, raw_row: pd.Series | None = None) -> str:
    suffix = ""
    if raw_row is not None:
        ocid = _first_available(raw_row, ["ocid", "tender_id"], "")
        suffix = str(ocid)[:80]
    return f"{index}:{suffix}" if suffix else str(index)


def parse_case_id(case_id: str | int) -> int | str:
    text = str(case_id)
    prefix = text.split(":", 1)[0]
    try:
        return int(prefix)
    except ValueError:
        return prefix


def extract_display_metadata(raw_row: pd.Series | None, *, fallback_case_id: str | int) -> dict[str, Any]:
    raw_row = raw_row if raw_row is not None else pd.Series(dtype=object)
    title = _first_available(
        raw_row,
        ["tender_title", "title", "name", "tender_description"],
        f"Paket Pengadaan {fallback_case_id}",
    )
    buyer = _first_available(raw_row, ["buyer_name", "buyer_id"], "Tidak tersedia")
    supplier = _first_available(raw_row, ["supplier_name", "supplier_id"], "Belum ada pemenang")
    tender_value = _first_available(raw_row, ["tender_value_amount", "award_value_amount", "contract_value_amount"])
    currency = _first_available(raw_row, ["tender_value_currency", "award_value_currency"], "IDR")
    return {
        "case_id": make_case_id(fallback_case_id, raw_row),
        "row_id": fallback_case_id,
        "ocid": _first_available(raw_row, ["ocid"], str(fallback_case_id)),
        "tender_id": _first_available(raw_row, ["tender_id"], str(fallback_case_id)),
        "package_title": str(title),
        "description": str(_first_available(raw_row, ["tender_description"], title)),
        "buyer": str(buyer),
        "supplier": str(supplier),
        "tender_value": tender_value,
        "tender_value_display": format_currency(tender_value, str(currency) if currency else "IDR"),
        "currency": str(currency) if currency else "IDR",
        "procurement_method": str(
            _first_available(
                raw_row,
                ["tender_procurementMethodDetails", "tender_procurementMethod"],
                "Tidak tersedia",
            )
        ),
        "category": str(_first_available(raw_row, ["tender_mainProcurementCategory"], "Tidak tersedia")),
        "status": str(_first_available(raw_row, ["tender_status", "award_status"], "Tidak tersedia")),
        "date_published": str(_first_available(raw_row, ["tender_datePublished", "award_date"], "Tidak tersedia")),
    }


def build_risk_queue(
    dataset: DemoDataset,
    predictions: pd.DataFrame,
    *,
    top_n: int | None = 100,
    format_tender_values: bool = True,
) -> pd.DataFrame:
    """Join predictions with display metadata for the dashboard queue."""
    pred_top = predictions if top_n is None else predictions.head(top_n)
    pred_top = pred_top.copy()
    if pred_top.empty:
        return pd.DataFrame()

    raw_rows = dataset.raw.reindex(pred_top.index)
    row_ids = pd.Series(pred_top.index, index=pred_top.index, dtype=object)
    fallback_titles = pd.Series("Paket Pengadaan ", index=pred_top.index, dtype=object) + row_ids.astype(str)
    if format_tender_values:
        case_ids = _case_id_series(pred_top.index, raw_rows)
        titles = _first_available_series(
            raw_rows,
            ["tender_title", "title", "name", "tender_description"],
            default=fallback_titles,
        )
        tender_values = _first_available_series(
            raw_rows,
            ["tender_value_amount", "award_value_amount", "contract_value_amount"],
        )
        currencies = _first_available_series(raw_rows, ["tender_value_currency", "award_value_currency"], "IDR")
        buyer_names_for_region = _first_available_series(raw_rows, ["buyer_name"], "")
        ocids = _first_available_series(raw_rows, ["ocid"], row_ids).astype(str)
        tender_ids = _first_available_series(raw_rows, ["tender_id"], row_ids).astype(str)
        descriptions = _first_available_series(raw_rows, ["tender_description"], titles).astype(str)
        buyers = _first_available_series(raw_rows, ["buyer_name", "buyer_id"], "Tidak tersedia").astype(str)
        suppliers = _first_available_series(raw_rows, ["supplier_name", "supplier_id"], "Belum ada pemenang").astype(str)
        procurement_methods = _first_available_series(
            raw_rows,
            ["tender_procurementMethodDetails", "tender_procurementMethod"],
            "Tidak tersedia",
        ).astype(str)
        categories = _first_available_series(raw_rows, ["tender_mainProcurementCategory"], "Tidak tersedia").astype(str)
        statuses = _first_available_series(raw_rows, ["tender_status", "award_status"], "Tidak tersedia").astype(str)
        date_published = _first_available_series(raw_rows, ["tender_datePublished", "award_date"], "Tidak tersedia").astype(str)
    else:
        case_ids = _fast_archive_case_ids(pred_top.index, raw_rows)
        titles = _raw_text_or_default(raw_rows, "tender_title", fallback_titles)
        tender_values = _raw_series_or_default(raw_rows, "tender_value_amount", np.nan)
        if "award_value_amount" in raw_rows:
            tender_values = tender_values.combine_first(raw_rows["award_value_amount"])
        if "contract_value_amount" in raw_rows:
            tender_values = tender_values.combine_first(pd.to_numeric(raw_rows["contract_value_amount"], errors="coerce"))
        currencies = _raw_text_or_default(raw_rows, "tender_value_currency", "IDR")
        if "award_value_currency" in raw_rows:
            currencies = currencies.where(currencies.str.strip().ne(""), raw_rows["award_value_currency"].fillna("IDR").astype(str))
        buyer_names_for_region = _raw_text_or_default(raw_rows, "buyer_name", "")
        ocids = _raw_text_or_default(raw_rows, "ocid", row_ids)
        tender_ids = _raw_text_or_default(raw_rows, "tender_id", row_ids)
        descriptions = _raw_text_or_default(raw_rows, "tender_description", titles)
        buyers = _raw_text_or_default(raw_rows, "buyer_name", "Tidak tersedia")
        buyers = buyers.where(buyers.str.strip().ne(""), _raw_text_or_default(raw_rows, "buyer_id", "Tidak tersedia"))
        suppliers = _raw_text_or_default(raw_rows, "supplier_name", "Belum ada pemenang")
        suppliers = suppliers.where(
            suppliers.str.strip().ne(""),
            _raw_text_or_default(raw_rows, "supplier_id", "Belum ada pemenang"),
        )
        procurement_methods = _raw_text_or_default(raw_rows, "tender_procurementMethodDetails", "Tidak tersedia")
        procurement_methods = procurement_methods.where(
            procurement_methods.str.strip().ne(""),
            _raw_text_or_default(raw_rows, "tender_procurementMethod", "Tidak tersedia"),
        )
        categories = _raw_text_or_default(raw_rows, "tender_mainProcurementCategory", "Tidak tersedia")
        statuses = _raw_text_or_default(raw_rows, "tender_status", "Tidak tersedia")
        statuses = statuses.where(statuses.str.strip().ne(""), _raw_text_or_default(raw_rows, "award_status", "Tidak tersedia"))
        date_published = _raw_series_or_default(raw_rows, "tender_datePublished", pd.NaT)
        if "award_date" in raw_rows:
            date_published = date_published.combine_first(raw_rows["award_date"])
    buyer_regions = derive_buyer_region_columns_from_names(buyer_names_for_region)
    predicted_class = pred_top["predicted_class"].astype(int)
    tender_value_display = (
        [
            format_currency(value, str(currency) if currency else "IDR")
            for value, currency in zip(tender_values.tolist(), currencies.tolist())
        ]
        if format_tender_values
        else pd.Series("", index=pred_top.index, dtype=object)
    )

    queue = pd.DataFrame(
        {
            "case_id": case_ids.astype(str),
            "row_id": row_ids,
            "ocid": ocids.astype(str),
            "tender_id": tender_ids.astype(str),
            "package_title": titles.astype(str),
            "description": descriptions.astype(str),
            "buyer": buyers.astype(str),
            "buyer_region": buyer_regions["buyer_region"].astype(str),
            "buyer_region_type": buyer_regions["buyer_region_type"].astype(str),
            "buyer_region_key": buyer_regions["buyer_region_key"].astype(str),
            "buyer_region_source": buyer_regions["buyer_region_source"].astype(str),
            "buyer_region_note": buyer_regions["buyer_region_note"].astype(str),
            "supplier": suppliers.astype(str),
            "tender_value": tender_values,
            "tender_value_display": tender_value_display,
            "currency": currencies.astype(str),
            "procurement_method": procurement_methods.astype(str),
            "category": categories.astype(str),
            "status": statuses.astype(str),
            "date_published": date_published,
            "risk_rank": pred_top["risk_rank"].astype(int),
            "predicted_class": predicted_class,
            "predicted_label": pred_top["predicted_label"].astype(str),
            "probability": pred_top["probability"].astype(float),
            "risk_priority_score": pred_top["risk_priority_score"].astype(float),
            "probability_low": pred_top.get("probability_low", pd.Series(np.nan, index=pred_top.index)).astype(float),
            "probability_medium": pred_top.get("probability_medium", pd.Series(np.nan, index=pred_top.index)).astype(float),
            "probability_high": pred_top.get("probability_high", pd.Series(np.nan, index=pred_top.index)).astype(float),
            "review_status": np.where(predicted_class.eq(2), "Prioritas Review", "Monitor"),
        }
    )
    return queue.reset_index(drop=True)


def build_inference_run(
    max_rows: int | None = None,
    top_n: int | None = 100,
) -> tuple[DemoDataset, PredictionBackend, pd.DataFrame, pd.DataFrame, InferenceRunMetadata]:
    """Run local offline inference and return judge-facing runtime metadata."""
    started = perf_counter()

    data_started = perf_counter()
    dataset = load_demo_dataset(max_rows=max_rows)
    data_load_latency_ms = (perf_counter() - data_started) * 1000

    model_started = perf_counter()
    backend = load_prediction_backend()
    model_load_latency_ms = (perf_counter() - model_started) * 1000

    prediction_started = perf_counter()
    predictions = predict_risk_scores(dataset.features, backend)
    prediction_latency_ms = (perf_counter() - prediction_started) * 1000

    queue_started = perf_counter()
    queue = build_risk_queue(dataset, predictions, top_n=top_n)
    queue_build_latency_ms = (perf_counter() - queue_started) * 1000

    queue_limit = len(predictions) if top_n is None else int(top_n)
    metadata = InferenceRunMetadata(
        model_artifact=Path(backend.model_artifact).name,
        model_backend=backend.kind,
        feature_source=str(dataset.feature_path.relative_to(PROJECT_ROOT)),
        raw_source=str(dataset.raw_path.relative_to(PROJECT_ROOT)),
        source_split=dataset.feature_path.parent.name,
        rows_scored=int(len(dataset.features)),
        rows_ranked=int(len(predictions)),
        rows_displayed=int(len(queue)),
        queue_limit=queue_limit,
        loaded_rows_cap=max_rows,
        data_load_latency_ms=round(data_load_latency_ms, 3),
        model_load_latency_ms=round(model_load_latency_ms, 3),
        prediction_latency_ms=round(prediction_latency_ms, 3),
        queue_build_latency_ms=round(queue_build_latency_ms, 3),
        total_latency_ms=round((perf_counter() - started) * 1000, 3),
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    return dataset, backend, predictions, queue, metadata


def _split_archive_queue(
    split_name: str,
    dataset: DemoDataset,
    predictions: pd.DataFrame,
) -> pd.DataFrame:
    queue = build_risk_queue(dataset, predictions, top_n=None, format_tender_values=False)
    if queue.empty:
        return queue
    ocids = queue.get("ocid", pd.Series("", index=queue.index)).fillna("").astype(str).str.slice(0, 80)
    original_case_ids = queue["case_id"].astype(str).copy()
    queue.insert(0, "archive_id", [f"{split_name}:{row_id}:{ocid}" if ocid else f"{split_name}:{row_id}" for row_id, ocid in zip(queue["row_id"].astype(str), ocids)])
    queue["case_id"] = original_case_ids if split_name == "test_data" else queue["archive_id"]
    queue["source_split"] = split_name
    queue["is_heldout"] = split_name == "test_data"
    queue["eval_claim_scope"] = "heldout_test_only" if split_name == "test_data" else "archive_browsing_only"
    queue["split_risk_rank"] = queue["risk_rank"].astype(int)
    return queue


def build_archive_inference_run(
    *,
    max_rows_per_split: int | None = None,
) -> tuple[PredictionBackend, pd.DataFrame, ArchiveInferenceMetadata]:
    """Score train_data + test_data for bounded archive browsing only.

    This archive path is separate from ``build_inference_run`` so the
    judge-facing held-out proof remains anchored to ``test_data`` only.
    """
    started = perf_counter()

    data_started = perf_counter()
    split_datasets = {
        split_name: load_split_dataset(
            split_name,
            features_path,
            raw_path,
            max_rows=max_rows_per_split,
        )
        for split_name, (features_path, raw_path) in ARCHIVE_SPLIT_PATHS.items()
    }
    data_load_latency_ms = (perf_counter() - data_started) * 1000

    model_started = perf_counter()
    backend = load_prediction_backend()
    model_load_latency_ms = (perf_counter() - model_started) * 1000

    prediction_started = perf_counter()
    split_predictions = {
        split_name: predict_risk_scores(dataset.features, backend)
        for split_name, dataset in split_datasets.items()
    }
    prediction_latency_ms = (perf_counter() - prediction_started) * 1000

    queue_started = perf_counter()
    split_queues = [
        _split_archive_queue(split_name, split_datasets[split_name], split_predictions[split_name])
        for split_name in ARCHIVE_SPLIT_PATHS
    ]
    archive_queue = pd.concat(split_queues, ignore_index=True)
    archive_queue = archive_queue.sort_values(
        ["risk_priority_score", "probability", "source_split", "row_id"],
        ascending=[False, False, True, True],
        kind="mergesort",
    ).reset_index(drop=True)
    archive_queue["archive_rank"] = np.arange(1, len(archive_queue) + 1)
    archive_queue["risk_rank"] = archive_queue["archive_rank"]
    front = [
        "archive_id",
        "archive_rank",
        "split_risk_rank",
        "source_split",
        "is_heldout",
        "eval_claim_scope",
    ]
    archive_queue = archive_queue.loc[:, front + [column for column in archive_queue.columns if column not in front]]
    queue_build_latency_ms = (perf_counter() - queue_started) * 1000

    metadata = ArchiveInferenceMetadata(
        model_artifact=Path(backend.model_artifact).name,
        model_backend=backend.kind,
        archive_scope="all_local_prepared_data",
        rows_scored=int(sum(len(dataset.features) for dataset in split_datasets.values())),
        rows_ranked=int(len(archive_queue)),
        train_rows=int(len(split_datasets["train_data"].features)),
        heldout_rows=int(len(split_datasets["test_data"].features)),
        feature_sources=[str(dataset.feature_path.relative_to(PROJECT_ROOT)) for dataset in split_datasets.values()],
        raw_sources=[str(dataset.raw_path.relative_to(PROJECT_ROOT)) for dataset in split_datasets.values()],
        source_splits=list(split_datasets),
        data_load_latency_ms=round(data_load_latency_ms, 3),
        model_load_latency_ms=round(model_load_latency_ms, 3),
        prediction_latency_ms=round(prediction_latency_ms, 3),
        queue_build_latency_ms=round(queue_build_latency_ms, 3),
        total_latency_ms=round((perf_counter() - started) * 1000, 3),
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    return backend, archive_queue, metadata


def build_demo_bundle(max_rows: int | None = 1000, top_n: int = 100) -> tuple[DemoDataset, PredictionBackend, pd.DataFrame, pd.DataFrame]:
    """Convenience loader used by the app and smoke tests."""
    dataset, backend, predictions, queue, _ = build_inference_run(max_rows=max_rows, top_n=top_n)
    return dataset, backend, predictions, queue
