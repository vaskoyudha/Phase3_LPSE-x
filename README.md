# LPSE-X Offline Procurement Risk Triage

LPSE-X adalah paket demo offline untuk membantu operator memprioritaskan review
tender pengadaan. Runtime membaca artefak model dan data lokal, menghasilkan
antrean risiko, penjelasan faktor, casebook, dan command center web tanpa cloud
call, live scraping, atau retraining saat aplikasi berjalan.

Output sistem harus dibaca sebagai triase risiko dan prioritas review, bukan
tuduhan pelanggaran, bukti korupsi, atau keputusan hukum final.

## Isi Repository

- `model_risk.ubj` dan `model_risk.onnx` untuk artefak model offline.
- `train_data/` untuk training, diagnostics, calibration, HPO, dan archive
  browsing.
- `test_data/` untuk bukti held-out dan klaim evaluasi.
- `src/` untuk pipeline data, fitur, model, inference, explainability,
  narrative guardrails, dan casebook.
- `backend/` untuk FastAPI API lokal yang membungkus adapter inference offline.
- `frontend/` untuk command center React/Vite.
- `tests/` untuk kontrak API, smoke test inference, guardrail narrative, dan
  kontrak frontend.
- `docs/` untuk catatan isi repo, rencana proyek, dan dokumentasi instalasi.

## Quickstart

```bash
cd BismillahFirstTry-Phase2_Tahap2_FindIT2026-ML-Inference

make install-python
make inference-smoke
make verify-python
```

Untuk menjalankan API lokal:

```bash
make run-api
```

API dari `make run-api` berjalan di `http://127.0.0.1:8000`.

Untuk menjalankan frontend Vite terhadap API tersebut:

```bash
cd frontend
LPSEX_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

Dokumentasi instalasi lengkap tersedia di
[`docs/INSTALLASI.md`](docs/INSTALLASI.md).

## Alur Operasional

1. Siapkan environment Python dan dependency frontend.
2. Jalankan `make inference-smoke` untuk memastikan artefak model dan data lokal
   bisa dibaca.
3. Jalankan `make verify-python` untuk validasi backend, inference contract, dan
   guardrail dasar.
4. Jalankan `make verify-frontend` jika mengubah command center web.
5. Jalankan `make verify` sebelum menyerahkan perubahan besar.

## Command Penting

```bash
make install-python      # buat .venv dan install requirements.txt
make install-frontend    # npm ci di frontend/
make inference-smoke     # smoke test inference offline
make run-api             # jalankan FastAPI di 127.0.0.1:8000
make build-frontend      # build static frontend
make verify-python       # compileall + pytest
make verify-frontend     # typecheck + lint + test + build frontend
make guardrail-audit     # scan copy yang melanggar framing LPSE-X
make verify              # seluruh verifikasi utama
```

## Batasan Produk

- Runtime tidak melakukan training, scraping, atau panggilan cloud.
- Klaim evaluasi held-out hanya memakai `test_data/`.
- `train_data/` tidak boleh dipakai untuk klaim performa held-out.
- Archive browsing boleh memakai `train_data + test_data` hanya jika metadata
  `source_split` dan `eval_claim_scope` tetap terbawa.
- Response user-facing harus menjaga framing: triase risiko, prioritas review,
  dan bukan tuduhan pelanggaran.
- Frontend tidak boleh menerima seluruh dataset mentah tanpa batas paginasi atau
  filter yang jelas.

## Struktur Dokumentasi

- [`docs/INSTALLASI.md`](docs/INSTALLASI.md) - langkah instalasi, menjalankan
  API/frontend, verifikasi, dan troubleshooting.
- [`docs/ML_REPO_CONTENTS.md`](docs/ML_REPO_CONTENTS.md) - ringkasan artefak ML
  dan konteks isi repository.
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) - alur demo produk.
- [`PROJECT_GUIDELINES.md`](PROJECT_GUIDELINES.md) - guideline teknis proyek.

## Lisensi dan Data

Repository ini membawa artefak model, data contoh, dan aset visual untuk demo
offline. Pastikan penggunaan data, peta, dan artefak mengikuti atribusi dan
batasan yang tercantum di file dokumentasi terkait.
