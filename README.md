# Phase3_LPSE-x

Phase3_LPSE-x is the model-focused LPSE-X package for the Find IT! 2026 Phase 3 procurement-risk prototype.

It intentionally contains only the materials needed to reproduce and operate the **ML training / model artifact / offline inference** path:

- submitted model artifacts: `model_risk.ubj`, `model_risk.onnx`
- local split data: `train_data/`, `test_data/`
- training and inference notebooks: `training.ipynb`, `inference.ipynb`
- Python ML modules under `src/`
- smoke checks and model/inference tests under `scripts/` and `tests/`
- project implementation plans under `docs/project-plans/`

It **does not include** the FastAPI backend implementation, Streamlit app, React/Vite frontend implementation, frontend assets, node modules, or review database code. Those surfaces are described in the plan documents so separate project team members can rebuild them from scratch without copying backend/frontend source into this model-only repository.

## Runtime promise

LPSE-X model inference is designed to be:

- **offline-local**: no cloud call during inference
- **no live scraping**: all runtime data comes from committed local parquet splits
- **no retraining**: inference loads `model_risk.ubj` / `model_risk.onnx` and never mutates model artifacts
- **anti-leakage aware**: held-out inference proof uses `test_data/`; `train_data/` may only be used for training or archive browsing, not held-out evaluation claims
- **judge-safe**: output is framed as *triase risiko* and *prioritas review*, not an accusation or final legal conclusion

## Folder structure

```text
.
├── README.md
├── PROJECT_GUIDELINES.md
├── Makefile
├── requirements.txt
├── training.ipynb
├── inference.ipynb
├── model_risk.ubj
├── model_risk.onnx
├── demo_casebook.html
├── train_data/
│   ├── raw.parquet
│   ├── features.parquet
│   └── labels.parquet
├── test_data/
│   ├── raw.parquet
│   ├── features.parquet
│   └── labels.parquet
├── src/
│   ├── artifacts.py
│   ├── data.py
│   ├── split.py
│   ├── features.py
│   ├── labels.py
│   ├── model.py
│   ├── product_demo.py
│   ├── explain.py
│   ├── narrative.py
│   ├── casebook.py
│   ├── diagnostics.py
│   ├── evidence.py
│   ├── evidence_linking.py
│   └── evidence_sources/
├── scripts/
│   └── inference_smoke.py
├── tests/
└── docs/project-plans/
```

## Quick start

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
make inference-smoke
make verify
```

`make inference-smoke` scores the full held-out `test_data/features.parquet` split with `model_risk.ubj`, then prints a small JSON summary with:

- model artifact name
- number of scored rows
- number of displayed queue rows
- rank #1 case id
- local latency

## Key commands

```bash
# Compile source and run model/inference tests
make verify-python

# Run only the judge-facing inference smoke check
make inference-smoke

# Generate or refresh static casebook HTML from the selected case flow
make static-casebook

# Run all model-only checks
make verify
```

## Repo understanding chat

For a copy-paste context prompt that explains this repo end-to-end, see `docs/repo-understanding-chat.md`. It covers install commands, data/artifact contracts, source-code map, inference flow, tests, and guardrails for a fresh chat.

## Dataset contract

Each split contains the same three artifact layers:

- `raw.parquet`: display/source data before model feature preprocessing
- `features.parquet`: numeric feature matrix aligned with model feature names
- `labels.parquet`: heuristic risk labels for modeling/evaluation experiments

Rules:

1. Use `train_data/` for training, HPO, calibration, diagnostics, and archive browsing only.
2. Use `test_data/` for held-out inference proof and final evaluation claims.
3. Never tune thresholds, HPO parameters, or feature engineering decisions on `test_data/`.
4. If UI/backend team members expose `train_data + test_data` archive browsing, each row must include `source_split` and `eval_claim_scope` so training rows are never presented as held-out results.

## Important source files

- `src/artifacts.py`: accepted artifact resolver for `model_risk.ubj` and `model_risk.onnx`; never regenerates artifacts.
- `src/model.py`: model lifecycle utilities: training, HPO, evaluation, calibration, ONNX export/parity.
- `src/features.py`: feature engineering from flattened procurement data.
- `src/labels.py`: heuristic red-flag and risk-label construction.
- `src/product_demo.py`: offline inference adapter that loads data, loads model, predicts probabilities, ranks review queue, and records runtime metadata.
- `src/explain.py`: XGBoost contribution / SHAP-style explanation utilities.
- `src/narrative.py`: human-readable explanation copy with strict guardrails.
- `src/casebook.py`: selected-case explainability payload and static HTML casebook renderer.

## project rebuild plans

See `docs/project-plans/README.md`.

The backend plan is split across three people/team members:

1. Data, feature, label, training, and artifact owner
2. FastAPI inference/runtime/API owner
3. Explainability, review workflow, guardrails, and quality owner

The frontend plan describes how another team member can recreate the React/Vite command center from API contracts and UX behavior without including frontend implementation in this repo.

Backend team members should start with `docs/project-plans/backend/backend-file-implementation-guide.md` for the expanded file-by-file guide, endpoint behavior, test expectations, handoff rules, and mandatory Bahasa Indonesia commit-message rules.
