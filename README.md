# LPSE-X Product Backend

FastAPI runtime untuk command center LPSE-X. Repo ini menempel pada repo ML
(`../lpseN`) sebagai dependensi runtime. Repo ini menyediakan:

- `src/api.py` orkestrasi FastAPI, caching, filter, paginasi, archive
  analytics, dan static SPA serving.
- `src/api_schemas.py` kontrak Pydantic untuk frontend.
- `src/reviews.py` SQLite review store (placeholder Person 2; Person 3 yang
  akan menyempurnakan).
- `tests/` kontrak API + bundle SPA + frontend contract.

## Hubungan dengan repo ML

Modul ML (`src.product_demo`, `src.casebook`, `src.artifacts`,
`src.narrative`) tinggal di `../lpseN/src/`. Paket `src` di repo ini
mem-`extend` `__path__`-nya ke direktori tersebut, jadi import seperti
`from src.product_demo import build_inference_run` berfungsi tanpa salin
file. Override lokasi via env var `LPSEX_ML_REPO`.

## Quickstart

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pip install -r ../lpseN/requirements.txt   # xgboost, pandas, onnxruntime, dst.

make inference-smoke
make verify-python
make run-api
```

Service mendengarkan `http://127.0.0.1:8888` ketika dijalankan via
`make run-api`. Set `LPSEX_PREWARM_ARCHIVE=1` untuk memuat archive runtime
di background saat startup.

## Aturan keras

1. Tidak ada training, scraping, atau cloud call saat runtime.
2. `test_data/` adalah surface bukti held-out.
3. Archive browsing menyertakan label `source_split`, `is_heldout`,
   `eval_claim_scope`.
4. Setiap response user-facing membawa guardrail LPSE-X.
5. Tidak ada endpoint mengirim seluruh dataset ke browser.

## Commit message

Bahasa Indonesia, prefix teknis singkat. Contoh:

```bash
git commit -m "feat: tambah kerangka FastAPI dan kontrak Pydantic"
git commit -m "test: kunci validasi top_n dan paginasi dataset"
```
