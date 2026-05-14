# LPSE-X Offline Demo Script

Tujuan demo: menunjukkan alur **triase risiko** dan **prioritas review** pengadaan secara lokal. Output demo adalah bantuan antrian pemeriksaan, **bukan tuduhan pelanggaran** dan bukan keputusan otomatis.

## Batasan operasional

- Jalankan hanya dengan artefak yang sudah disertakan: `model_risk.ubj`, `model_risk.onnx`, dan `test_data/`.
- Tanpa scraping, tanpa retraining, tanpa tuning, tanpa export model baru, dan tanpa cloud call.
- Data `test_data/` dipakai untuk demo/evaluasi lokal; `train_data/` hanya dibaca oleh full archive browser dan tidak dipakai untuk klaim evaluasi held-out.

## Langkah demo lokal utama: React/Vite + FastAPI

```bash
. .venv/bin/activate
cd frontend
npm ci
npm run build
cd ..
uvicorn src.api:app --host 127.0.0.1 --port 8000
# buka http://127.0.0.1:8000/?demo=1
```

Jalur ini adalah jalur presentasi utama. FastAPI menyajikan landing, Command Center, Casebook, Model Transparency, dan export HTML dari payload lokal yang sama.

Jika ingin command reproducible untuk juri/dev:

```bash
make install-python
make install-frontend
make build-frontend
make inference-smoke
make run-api
```

Sebelum membuka UI, tunjukkan `make inference-smoke` atau endpoint `/api/inference-status` untuk membuktikan:

- Model: `model_risk.ubj`
- Mode: offline local
- Source: `test_data/features.parquet`
- Rows scored: seluruh held-out test split
- Displayed: bounded Top 50 review queue
- Tanpa cloud call, tanpa live scraping, tanpa retraining

## Static casebook fallback

Gunakan fallback statis hanya saat perlu menunjukkan laporan HTML mandiri tanpa menjalankan server:

```bash
python -m src.casebook
```

Jika modul dijalankan dari Python, gunakan:

```bash
python - <<'PY'
from src.casebook import generate_demo_casebook
payload, output = generate_demo_casebook("demo_casebook.html", max_rows=1000, top_n=100)
print(output)
print(payload["guardrail"])
PY
```

Buka `demo_casebook.html` di browser. Jelaskan tiga bagian utama:

1. Paket pengadaan dan metadata lokal dari `test_data/raw.parquet`.
2. Skor model sebagai prioritas review, bukan keputusan final.
3. Faktor explainability dan checklist reviewer untuk validasi manusia.

## Kalimat presenter yang aman

> LPSE-X membantu triase risiko dan prioritas review. Hasil ini bukan tuduhan pelanggaran; reviewer tetap perlu memeriksa dokumen dan konteks sebelum tindak lanjut.

## 90-second modern web path

1. Build the React command center: `cd frontend && npm ci && npm run build`.
2. Start FastAPI locally: `.venv/bin/uvicorn src.api:app --host 127.0.0.1 --port 8000`.
3. Open `http://127.0.0.1:8000/?demo=1` and show Offline / Single Model / Human Review guardrails.
4. Click `Open Command Center`; point to the **Inference Status** card: full split scored locally, Top 50 shown for reviewer focus.
5. Scroll to **Scored Dataset Explorer** and explain that the website is connected to the full scored local dataset through paginated API pages, not a static sample.
6. Select rank #1, then open Casebook.
7. Inspect provenance, top factors, reviewer checklist, Model Transparency, and selected-case HTML export.
8. Keep the narration explicit: offline, tanpa scraping, tanpa retraining, tanpa cloud, triase risiko, prioritas review, bukan tuduhan pelanggaran.

## Software-engineering proof points to mention

1. **Kesiapan inferensi:** `inference.ipynb`, `/api/inference-status`, and the UI all use the submitted root artifacts, not a training-only path.
2. **Manajemen dependensi:** Python pins live in `requirements.txt`; frontend exact pins plus lockfile live in `frontend/package.json` and `frontend/package-lock.json`.
3. **Integrasi spesifikasi teknis:** API schema → React types → Inference Status UI → Scored Dataset Explorer → tests are aligned.
4. **Skalabilitas & efisiensi:** full scored queue is cached server-side; frontend payload is bounded to Top 50 / max 500 for queue and paginated max 100 rows for dataset browsing; casebook factors are loaded only for the selected case.

## Full Archive Segment

When showing the archive panel, say:

1. “The model scores the held-out split for inference proof: 93,034 `test_data` rows.”
2. “The archive also scores all local prepared tender records for product browsing: 465,184 rows across `train_data + test_data`.”
3. “Every archive row shows its split, AI risk badge, score, and probability breakdown; training/archive rows are not used for held-out evaluation claims.”

Keep the narration explicit: offline, tanpa scraping, tanpa retraining, tanpa cloud, triase risiko, prioritas review, bukan tuduhan pelanggaran.
