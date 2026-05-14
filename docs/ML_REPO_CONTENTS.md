# ML-Only Repository Contents

This document records what was copied from the original LPSE-X submission bundle and what was deliberately excluded.

## Included

### Model artifacts

- `model_risk.ubj`: submitted XGBoost model artifact used by the primary offline runtime.
- `model_risk.onnx`: submitted ONNX artifact used for parity/portable inference checks.

### Data artifacts

- `train_data/raw.parquet`
- `train_data/features.parquet`
- `train_data/labels.parquet`
- `test_data/raw.parquet`
- `test_data/features.parquet`
- `test_data/labels.parquet`

The split exists to preserve anti-leakage discipline. Held-out proof uses `test_data`; training and diagnostics use `train_data`.

### Notebooks

- `training.ipynb`: model development and training notebook.
- `inference.ipynb`: judge-facing offline inference readiness notebook.

### Python modules

- `src/artifacts.py`: artifact resolver.
- `src/data.py`: source-data ingestion and flattening helpers.
- `src/split.py`: external train/test and internal dev split helpers.
- `src/features.py`: feature engineering.
- `src/labels.py`: heuristic label and red-flag logic.
- `src/model.py`: training, HPO, evaluation, calibration, save/load, ONNX export.
- `src/product_demo.py`: offline inference adapter and ranked queue builder.
- `src/explain.py`: contribution/SHAP-style explainability utilities.
- `src/narrative.py`: human-readable explanation copy.
- `src/casebook.py`: selected-case casebook payload and static HTML renderer.
- `src/diagnostics.py`: diagnostic and validation summaries.
- `src/evidence.py`, `src/evidence_linking.py`, `src/evidence_sources/`: evidence-normalization utilities.

### Tests

The retained tests protect model artifact resolution, inference-readiness boundaries, no-retraining runtime behavior, casebook payloads, and narrative guardrails.

## Excluded

These original implementation surfaces are intentionally excluded from the model-only repo:

- `frontend/`: React/Vite command-center implementation.
- `src/api.py`: FastAPI backend implementation.
- `src/api_schemas.py`: Pydantic API response models.
- `src/reviews.py`: SQLite review store.
- `app.py`: local Streamlit app.
- frontend node package files.
- build outputs, caches, virtual environments, local runtime state, and credentials.

## Where to rebuild excluded surfaces

Use the plan docs:

- backend rebuild: `docs/project-plans/backend/`
- frontend rebuild: `docs/project-plans/frontend/`
