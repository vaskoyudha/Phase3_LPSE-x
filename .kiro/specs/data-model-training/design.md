# Design Document: Data, Features, Labels, Training, Artifacts

## Architecture Overview

The data-model-training module is a layered Python library that produces deterministic primitives for the LPSE-X procurement risk scoring system. It does NOT implement any web framework (FastAPI). Instead, it exposes importable functions and classes consumed by the API layer.

```
┌─────────────────────────────────────────────────────────┐
│                   API Layer (not owned)                  │
│              imports from src.product_demo               │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              src/product_demo.py                         │
│   PredictionBackend, build_inference_run,                │
│   build_archive_inference_run, build_risk_queue          │
└───┬──────────────┬──────────────────┬───────────────────┘
    │              │                  │
┌───▼───┐   ┌─────▼─────┐   ┌───────▼───────┐
│artifacts│   │ features  │   │    model      │
│  .py   │   │   .py     │   │     .py       │
└───┬────┘   └─────┬─────┘   └───────┬───────┘
    │              │                  │
    │         ┌────▼────┐        ┌───▼────┐
    │         │ split.py│        │labels.py│
    │         └────┬────┘        └────────┘
    │              │
    └──────────────┴──── train_data/ & test_data/ (parquet)
```

## Components

### 1. Artifact Resolver (`src/artifacts.py`)

**Responsibility:** Resolve accepted model artifact paths without retraining.

```python
from pathlib import Path
from typing import Literal

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ArtifactKind = Literal["ubj", "onnx"]

_ACCEPTED_ARTIFACTS: dict[ArtifactKind, tuple[Path, ...]] = {
    "ubj": (Path("model_risk.ubj"),),
    "onnx": (Path("model_risk.onnx"),),
}

def resolve_model_artifact(
    kind: ArtifactKind,
    explicit_path: Path | str | None = None,
    *,
    project_root: Path | None = None,
) -> Path:
    """Return existing accepted model artifact path.
    
    Search order: explicit_path → accepted root artifacts.
    Never creates, trains, or exports artifacts.
    Raises FileNotFoundError if no accepted artifact found.
    """
    ...
```

### 2. Split Manager (`src/split.py`)

**Responsibility:** Enforce temporal train/test boundaries and internal dev sub-splits.

```python
TRAIN_DIR = PROJECT_ROOT / "train_data"
TEST_DIR = PROJECT_ROOT / "test_data"

def external_raw_split(df, date_col, split_date, test_ratio) -> tuple[DataFrame, DataFrame]:
    """Temporal split guaranteeing max(train) < min(test)."""
    ...

def internal_dev_splits(train_df, date_col, val_hpo_ratio, val_cal_ratio) -> dict[str, DataFrame]:
    """Sub-split train_data only into train_fit, val_hpo, val_calibration."""
    ...

def load_raw_split(partition: str) -> DataFrame:
    """Load 'train' or 'test' raw partition. Raises ValueError for invalid names."""
    ...
```

### 3. Feature Engine (`src/features.py`)

**Responsibility:** Transform raw procurement data into stable numeric features.

```python
def _to_numeric(series: pd.Series | None) -> pd.Series: ...
def _safe_log1p(series: pd.Series | None) -> pd.Series: ...
def _safe_len(series: pd.Series) -> pd.Series: ...
def _safe_token_count(series: pd.Series | None) -> pd.Series: ...
def _parse_dates(series: pd.Series) -> pd.Series: ...

def tier1_features(df: pd.DataFrame) -> pd.DataFrame:
    """Tender value, log amount, price deviation, title/desc length, token counts."""
    ...

def tier2_features(df: pd.DataFrame) -> pd.DataFrame:
    """Procurement flags, timing, buyer/supplier interactions, activity, spikes."""
    ...

def compute_all_features(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Combine tier1 + tier2. All output columns are numeric."""
    ...

def save_features(features: pd.DataFrame, partition: str) -> Path:
    """Write to {partition}_data/features.parquet."""
    ...
```

### 4. Label Generator (`src/labels.py`)

**Responsibility:** Compute heuristic risk labels and red-flag indicators.

```python
def flag_single_bidder(df: pd.DataFrame) -> pd.Series: ...
def flag_short_title(df: pd.DataFrame, threshold: int = 20) -> pd.Series: ...
def flag_short_description(df: pd.DataFrame, threshold: int = 60) -> pd.Series: ...
def flag_q4_timing(df: pd.DataFrame) -> pd.Series: ...
def flag_price_deviation(df: pd.DataFrame) -> pd.Series: ...
def flag_high_value(df: pd.DataFrame, percentile: float = 0.9) -> pd.Series: ...
def flag_repeat_pair_history(df: pd.DataFrame, min_repeat: int = 2) -> pd.Series: ...
def flag_supplier_recent_surge(df: pd.DataFrame) -> pd.Series: ...
def flag_buyer_value_spike(df: pd.DataFrame, z_threshold: float = 2.0) -> pd.Series: ...
def flag_direct_procurement(df: pd.DataFrame) -> pd.Series: ...

def compute_red_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Return DataFrame with all individual flag columns."""
    ...

def compute_risk_labels(df: pd.DataFrame) -> pd.DataFrame:
    """Derive risk_label from combined red flags."""
    ...

def save_labels(labels: pd.DataFrame, partition: str) -> Path:
    """Write to {partition}_data/labels.parquet."""
    ...
```

### 5. Model Lifecycle (`src/model.py`)

**Responsibility:** Training, HPO, calibration, evaluation, export. Never called from product runtime.

```python
def load_train_artifacts() -> tuple[pd.DataFrame, pd.Series]: ...
def load_test_artifacts() -> tuple[pd.DataFrame, pd.Series]: ...
def train_xgboost(X, y, params, ...) -> xgb.Booster: ...
def run_hpo(X_train, y_train, X_val, y_val, ...) -> dict: ...
def compute_class_weights(y: pd.Series) -> dict[int, float]: ...
def compute_sample_weights(y: pd.Series) -> np.ndarray: ...
def fit_temperature(probs, y_true) -> float: ...
def evaluate(model, X_test, y_test) -> dict: ...
def save_model(model: xgb.Booster, params: dict) -> None: ...
def load_model() -> xgb.Booster: ...
def export_onnx(model, X_sample) -> Path: ...
def check_onnx_parity(model, X_sample) -> bool: ...
```

### 6. Prediction Backend (`src/product_demo.py`)

**Responsibility:** Runtime-safe model adapter for scoring and queue building.

```python
@dataclass
class DemoDataset:
    features: pd.DataFrame
    raw: pd.DataFrame
    feature_path: Path
    raw_path: Path
    max_rows: int | None

@dataclass
class InferenceRunMetadata:
    model_artifact: str
    model_backend: str
    inference_mode: str  # "offline_local"
    source_split: str    # "test_data"
    rows_scored: int
    rows_ranked: int
    rows_displayed: int
    queue_limit: int | None
    loaded_rows_cap: int | None
    total_latency_ms: float
    no_cloud_call: bool  # always True
    no_live_scraping: bool  # always True
    no_retraining: bool  # always True
    ...

@dataclass
class ArchiveInferenceMetadata:
    archive_scope: str  # "all_local_prepared_data"
    rows_scored: int
    train_rows: int
    heldout_rows: int
    source_splits: list[str]
    no_retraining: bool
    ...

class PredictionBackend:
    def align_features(self, features: pd.DataFrame) -> pd.DataFrame:
        """Reorder/select columns to match model. Raises ValueError if missing."""
        ...
    
    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        """Return (n_samples, n_classes) probability array."""
        ...

def build_inference_run(max_rows=None, top_n=None):
    """Score held-out test split. Returns (dataset, backend, predictions, queue, metadata)."""
    ...

def build_risk_queue(dataset, predictions, top_n=None) -> pd.DataFrame:
    """Sort by risk_priority_score descending, assign risk_rank."""
    ...

def build_archive_inference_run(max_rows_per_split=None):
    """Combine train+test with split labels for archive browsing."""
    ...
```

### 7. Inference Smoke Script (`scripts/inference_smoke.py`)

**Responsibility:** Single-command proof of offline inference.

```python
def main() -> None:
    """Load model_risk.ubj, score all test_data, build Top 50 queue, print JSON."""
    _, backend, predictions, queue, metadata = build_inference_run(max_rows=None, top_n=50)
    summary = {
        "model": backend.model_artifact.name,
        "rows_scored": metadata.rows_scored,
        "rows_displayed": len(queue),
        "rank_1": queue.iloc[0]["case_id"],
        "latency_ms": metadata.total_latency_ms,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    # Assert guardrail flags
    assert metadata.no_cloud_call
    assert metadata.no_retraining
    assert metadata.no_live_scraping
```

## Data Models

### Parquet Split Contract

```
train_data/
├── raw.parquet        # Flattened procurement records
├── features.parquet   # Numeric feature matrix (all columns numeric)
└── labels.parquet     # Heuristic risk labels + red flags

test_data/
├── raw.parquet        # Held-out procurement records
├── features.parquet   # Numeric feature matrix (same schema as train)
└── labels.parquet     # Heuristic risk labels (for evaluation only)
```

### Feature Schema

All feature columns follow the naming convention `f_{family}_{metric}`:
- `f_tender_value_log` — log1p of tender value
- `f_price_deviation_ratio` — ratio of awarded price to estimated value
- `f_title_token_count` — word count in tender title
- `f_desc_len` — character length of description
- `f_is_direct_procurement` — binary flag
- `f_buyer_repeat_count` — historical buyer interaction count
- etc.

### Risk Queue Row Schema

```python
{
    "case_id": str,           # Unique identifier for the case
    "risk_rank": int,         # 1-based rank position
    "risk_priority_score": float,  # Composite score (descending)
    "risk_label": str,        # "Risiko Tinggi" | "Risiko Sedang" | "Risiko Rendah"
    "probability_high": float,
    "probability_medium": float,
    "probability_low": float,
    # ... display metadata from raw
}
```

### Archive Row Schema (extends Risk Queue)

```python
{
    # ... all risk queue fields ...
    "source_split": str,       # "train_data" | "test_data"
    "is_heldout": bool,        # True only for test_data rows
    "eval_claim_scope": str,   # "archive_browsing_only" | "heldout_test_only"
    "archive_id": str,         # "{split}:{index}"
    "archive_rank": int,       # 1-based rank across full archive
}
```

## Error Handling

| Scenario | Module | Behavior |
|----------|--------|----------|
| Invalid artifact kind | artifacts.py | Raise `ValueError` with accepted kinds |
| No artifact file found | artifacts.py | Raise `FileNotFoundError` with checked paths |
| Invalid partition name | split.py | Raise `ValueError` with valid options |
| Missing parquet file | split.py | Raise `FileNotFoundError` with path |
| Temporal overlap in split | split.py | Raise `AssertionError` with dates |
| Missing model features | product_demo.py | Raise `ValueError` listing missing feature names |
| Non-numeric feature columns | features.py | Coerce via `_to_numeric`, fill NaN with 0 |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Artifact resolver returns existing absolute paths

*For any* valid artifact kind (ubj or onnx) and any project root containing the accepted artifact file, `resolve_model_artifact` SHALL return a path that is absolute and points to an existing file.

**Validates: Requirements 1.3**

### Property 2: Explicit path preference

*For any* explicit path pointing to an existing file of the correct kind, `resolve_model_artifact` SHALL return that explicit path rather than the default location.

**Validates: Requirements 1.4**

### Property 3: Empty project root raises FileNotFoundError with checked paths

*For any* project root directory that contains no accepted artifact files, `resolve_model_artifact` SHALL raise a FileNotFoundError whose message contains all candidate paths that were checked.

**Validates: Requirements 1.5, 1.6**

### Property 4: Temporal split ordering invariant

*For any* DataFrame with a valid date column, after `external_raw_split` is applied, the maximum date in the train partition SHALL be strictly less than the minimum date in the test partition.

**Validates: Requirements 2.2**

### Property 5: Internal dev splits stay within train boundaries

*For any* train DataFrame, `internal_dev_splits` SHALL produce sub-splits (`train_fit`, `val_hpo`, `val_calibration`) whose union is a subset of the original train DataFrame and whose temporal ordering is preserved (train_fit ≤ val_hpo ≤ val_calibration).

**Validates: Requirements 2.3**

### Property 6: Invalid partition raises ValueError

*For any* string that is not "train" or "test", `load_raw_split` SHALL raise a ValueError.

**Validates: Requirements 2.5**

### Property 7: Feature output is all-numeric

*For any* valid raw procurement DataFrame, `compute_all_features` SHALL produce a DataFrame where every column has a numeric dtype (int or float).

**Validates: Requirements 3.4**

### Property 8: Missing feature detection

*For any* feature DataFrame that is missing at least one column required by the model, `PredictionBackend.align_features` SHALL raise a ValueError whose message lists the missing feature names.

**Validates: Requirements 3.6, 6.2**

### Property 9: Red flags output contains all flag columns

*For any* valid procurement DataFrame, `compute_red_flags` SHALL return a DataFrame containing all expected flag columns (single_bidder, short_title, short_description, q4_timing, price_deviation, high_value, repeat_pair, supplier_surge, buyer_spike, direct_procurement).

**Validates: Requirements 4.2**

### Property 10: Risk labels are derived from red flags

*For any* DataFrame with computed red flag columns, `compute_risk_labels` SHALL produce a `risk_label` column where every value is one of the accepted label categories.

**Validates: Requirements 4.3**

### Property 11: Labels round-trip through parquet

*For any* labels DataFrame, saving via `save_labels` and reading back the parquet file SHALL produce a DataFrame with equivalent content.

**Validates: Requirements 4.4**

### Property 12: Risk queue is sorted by priority score descending

*For any* set of predictions and a dataset, `build_risk_queue` SHALL produce a queue where `risk_priority_score` is monotonically non-increasing.

**Validates: Requirements 6.6**

### Property 13: Archive split labeling correctness

*For any* archive inference run, all rows with `source_split == "train_data"` SHALL have `eval_claim_scope == "archive_browsing_only"`, and all rows with `source_split == "test_data"` SHALL have `eval_claim_scope == "heldout_test_only"`.

**Validates: Requirements 6.9, 6.10**

### Property 14: Inference metadata completeness

*For any* inference run, the returned `InferenceRunMetadata` SHALL have `no_cloud_call == True`, `no_live_scraping == True`, `no_retraining == True`, and `inference_mode == "offline_local"`.

**Validates: Requirements 6.8, 7.5**
