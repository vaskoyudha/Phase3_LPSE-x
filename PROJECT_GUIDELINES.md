# Repository Guidelines for Project Contributors

This is the LPSE-X **ML-only** repository. Treat it as the canonical package for training artifacts, submitted models, offline inference code, and implementation plans.

## Hard boundaries

Do not add these implementation surfaces to this repo:

- `frontend/` or React/Vite implementation files
- FastAPI backend implementation files such as `src/api.py` or `src/api_schemas.py`
- Streamlit `app.py`
- review database runtime code (`src/reviews.py`, `review_data/`)
- node package files (`package.json`, `package-lock.json`, `node_modules/`)
- credentials, tokens, generated caches, virtualenvs, or `local runtime folders/`

Backend/frontend behavior belongs in `docs/project-plans/` as implementation guidance only.

## Model and inference rules

1. Inference must load `model_risk.ubj` or `model_risk.onnx` through `src.artifacts.resolve_model_artifact`.
2. Runtime inference code must not call `.fit(`, Optuna HPO, scraping/network fetches, `to_parquet`, or artifact export functions.
3. `test_data/` is the held-out proof path. Do not use `train_data/` for held-out evaluation claims.
4. `train_data/ + test_data/` archive browsing is allowed only when each row clearly exposes `source_split` and `eval_claim_scope`.
5. Guardrail copy must preserve this meaning: output is *triase risiko* and *prioritas review*, **bukan tuduhan pelanggaran**.

## Development commands

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
make inference-smoke
make verify
```

## File organization

- ML lifecycle: `src/model.py`
- Data ingestion/split: `src/data.py`, `src/split.py`
- Feature and label generation: `src/features.py`, `src/labels.py`
- Runtime artifact loading: `src/artifacts.py`
- Offline inference bundle: `src/product_demo.py`
- Explainability and narrative: `src/explain.py`, `src/narrative.py`, `src/casebook.py`
- Smoke script: `scripts/inference_smoke.py`
- Model-only tests: `tests/`
- Project plans: `docs/project-plans/`

## Before committing

Run:

```bash
make verify
```

Then inspect:

```bash
git status --short
git diff --stat
```

Use concise imperative commit messages **in Bahasa Indonesia**. Prefixes such as `docs:`, `feat:`, `fix:`, `test:`, and `chore:` are allowed, but the summary after the prefix must be Indonesian and must explain the user-facing reason. Do not mention the executor/tool in the commit summary; avoid mentioning internal tooling or executors.

Good examples:

```bash
git commit -m "docs: perluas panduan implementasi backend untuk tim"
git commit -m "feat: tambah endpoint status inferensi lokal"
git commit -m "test: pastikan payload arsip tetap terbatas"
```

Avoid generic or English summaries like `update files`, `fix bug`, or `add backend stuff`.
