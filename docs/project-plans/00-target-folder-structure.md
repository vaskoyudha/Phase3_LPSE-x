# Target Folder Structure for Full Product Rebuild

This model-only repository excludes backend/frontend source code, but project team members can recreate the full product using the structure below.

All implementation commits in the rebuild workflow must use Bahasa Indonesia summaries without mentioning the executor, for example `feat: tambah struktur backend FastAPI` or `docs: jelaskan struktur folder target`.

## Model-only repo structure already present

```text
lpse-x-ml-inference/
├── README.md
├── PROJECT_GUIDELINES.md
├── Makefile
├── requirements.txt
├── training.ipynb
├── inference.ipynb
├── model_risk.ubj
├── model_risk.onnx
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

## Full backend structure to recreate in a separate product repo

```text
product-rebuild/
├── src/
│   ├── api.py                  # FastAPI app, endpoints, filtering, pagination, static serving
│   ├── api_schemas.py          # Pydantic response/request models
│   ├── reviews.py              # SQLite-backed human review workflow
│   ├── artifacts.py            # copied/shared from ML repo
│   ├── product_demo.py         # copied/shared from ML repo
│   ├── casebook.py             # copied/shared from ML repo
│   ├── narrative.py            # copied/shared from ML repo
│   └── ...                     # remaining ML modules as package dependency or copy
├── scripts/
│   └── inference_smoke.py
├── tests/
│   ├── test_api.py
│   ├── test_product_demo.py
│   ├── test_no_retraining.py
│   ├── test_casebook.py
│   ├── test_reviews.py
│   ├── test_fastapi_static_bundle.py
│   └── test_narrative_guardrails.py
├── frontend/dist/              # built static assets served by FastAPI
├── review_data/                # local SQLite runtime output, ignored by git
└── Makefile
```

## Full frontend structure to recreate in a separate product repo

```text
frontend/
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── App.test.tsx
    ├── api/
    │   └── client.ts
    ├── types/
    │   └── api.ts
    ├── pages/
    │   ├── LandingPage.tsx
    │   ├── CommandCenterPage.tsx
    │   ├── CasebookPage.tsx
    │   ├── ModelTransparencyPage.tsx
    │   ├── ReviewDeskPage.tsx
    │   └── UtilityPages.tsx
    ├── components/
    │   ├── app/
    │   │   └── AppShell.tsx
    │   ├── dashboard/
    │   ├── casebook/
    │   ├── reviews/
    │   └── shared/
    ├── styles/
    │   └── tokens.css
    └── assets/
        ├── brand/
        └── maps/
```

## Integration structure

Recommended full-stack build flow:

1. Backend owns `/api/*` and serves `frontend/dist`.
2. Frontend is developed with Vite and built into static files.
3. FastAPI mounts `/assets` and serves SPA fallback routes.
4. Tests cover backend JSON contracts and frontend fetch/render contracts.

## Git split rule

Keep this repo as ML-only. If the full product is rebuilt, do it in a separate repository or branch so backend/frontend code does not pollute the model package.
