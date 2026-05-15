# LPSE-X Offline Procurement Risk Triage

LPSE-X adalah paket demo offline untuk membantu operator memprioritaskan review
tender pengadaan. Repository ini berisi artefak model, pipeline inference lokal,
FastAPI backend, dan command center React/Vite yang semuanya berjalan tanpa
cloud call, live scraping, atau retraining saat runtime.

Semua output sistem harus dibaca sebagai triase risiko dan prioritas review,
bukan tuduhan pelanggaran, bukti korupsi, atau keputusan hukum final.

## Ringkasan

- **Mode operasi:** offline-local.
- **Target pengguna:** operator review, evaluator, dan reviewer teknis.
- **Fokus utama:** scoring risiko, explainability, casebook, archive browsing,
  dan command center web.
- **Batasan keras:** tidak ada training, scraping, atau cloud call pada jalur
  runtime produk.

## Fitur Utama

- Inference offline dari artefak `model_risk.ubj` dan `model_risk.onnx`.
- Ranking antrean risiko untuk prioritas review.
- Penjelasan faktor, provenance, dan casebook untuk tiap kasus.
- Archive browsing atas data lokal dengan paginasi dan guardrail evaluasi.
- FastAPI backend lokal untuk serving API dan static bundle frontend.
- React/Vite command center untuk eksplorasi hasil inference.
- Test suite untuk kontrak API, frontend contract, smoke test, dan guardrail
  copy.

## Sponsor dan Penyelenggara

Logo berikut mengikuti sponsor yang tampil di sidebar website:

| Sponsor | Logo |
| --- | --- |
| Ai Connect | <img src="frontend/src/assets/brand/AiConnect.png" alt="Ai Connect" width="120" /> |
| FIND IT | <img src="frontend/src/assets/brand/FINDIT.png" alt="FIND IT" width="120" /> |
| DTETI | <img src="frontend/src/assets/brand/DTETI.png" alt="DTETI" width="120" /> |
| Universitas Gadjah Mada | <img src="frontend/src/assets/brand/ugm.png" alt="Universitas Gadjah Mada" width="120" /> |

## Arsitektur Tingkat Tinggi

```text
model/data lokal -> src/ pipeline inference -> backend.api -> frontend
```

Komponen utamanya:

- `src/` memuat pipeline data, feature engineering, model inference,
  explainability, narrative guardrails, dan casebook.
- `backend/` memaparkan API lokal, caching, archive analytics, review store,
  dan serving bundle frontend statis.
- `frontend/` memuat command center React/Vite untuk konsumsi API.
- `tests/` menjaga kontrak perilaku utama tetap stabil.

## Struktur Repository

| Path | Isi |
| --- | --- |
| `model_risk.ubj`, `model_risk.onnx` | Artefak model offline |
| `train_data/` | Data training, diagnostics, calibration, HPO, archive browsing |
| `test_data/` | Data held-out untuk klaim evaluasi |
| `src/` | Pipeline ML, inference, explainability, casebook, narrative |
| `backend/` | FastAPI backend lokal |
| `frontend/` | Command center React/Vite |
| `tests/` | Kontrak dan smoke test |
| `docs/` | Dokumentasi instalasi, isi repo, dan rencana proyek |
| `scripts/` | Utility script untuk smoke test dan data preparation |

## Prasyarat

- Python 3.10 atau lebih baru.
- `pip` dan `venv`.
- Node.js 20 LTS atau lebih baru.
- `npm` yang kompatibel dengan `frontend/package-lock.json`.
- Lingkungan lokal yang mendukung dependency Python scientific stack.

## Instalasi

Panduan instalasi lengkap ada di [docs/INSTALLASI.md](docs/INSTALLASI.md).

Ringkasnya:

```bash
cd BismillahFirstTry-Phase2_Tahap2_FindIT2026-ML-Inference
make install-python
make inference-smoke
make install-frontend
```

## Menjalankan Aplikasi

### 1. Jalankan API

```bash
make run-api
```

API lokal berjalan di:

```text
http://127.0.0.1:8000
```

Health endpoint:

```text
http://127.0.0.1:8000/api/health
```

### 2. Jalankan Frontend Development

```bash
cd frontend
LPSEX_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

Vite biasanya tersedia di:

```text
http://127.0.0.1:5173
```

Catatan: default proxy Vite mengarah ke `http://127.0.0.1:8888`, jadi set
`LPSEX_API_PROXY_TARGET` agar sesuai dengan port API yang sedang aktif.

### 3. Build Frontend Statis

```bash
make build-frontend
```

Setelah build selesai, FastAPI dapat menyajikan bundle statis dari
`frontend/dist`.

## Verifikasi

Gunakan command berikut sebelum submit perubahan:

```bash
make verify-python
make verify-frontend
make inference-smoke
make guardrail-audit
make verify
```

`make verify` menjalankan seluruh cek utama yang tersedia di repository.

## Environment Variables

| Variable | Default | Kegunaan |
| --- | --- | --- |
| `LPSEX_API_PROXY_TARGET` | `http://127.0.0.1:8888` | Target proxy API untuk frontend dev/preview |

## Aturan Produk

- Tidak ada training, scraping, atau cloud call pada runtime.
- `test_data/` hanya untuk held-out proof dan klaim evaluasi.
- `train_data/` dipakai untuk training, diagnostics, calibration, HPO, atau
  archive browsing sesuai metadata yang benar.
- Response user-facing harus menjaga framing: triase risiko, prioritas review,
  dan bukan tuduhan pelanggaran.
- Frontend tidak boleh menerima seluruh dataset mentah tanpa filter dan
  paginasi.

## Dokumentasi Terkait

- [docs/INSTALLASI.md](docs/INSTALLASI.md) - langkah instalasi dan menjalankan
  aplikasi.
- [docs/ML_REPO_CONTENTS.md](docs/ML_REPO_CONTENTS.md) - ringkasan artefak ML
  dan isi repository.
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) - alur demo produk.
- [PROJECT_GUIDELINES.md](PROJECT_GUIDELINES.md) - guideline teknis proyek.
- `docs/project-plans/` - rencana implementasi backend dan frontend.

## Troubleshooting Singkat

- Jika `uvicorn` tidak ditemukan, aktifkan `.venv` atau jalankan lewat Makefile.
- Jika frontend gagal memanggil API, pastikan proxy target sesuai port backend.
- Jika `npm ci` gagal, gunakan Node.js 20 LTS dan ulangi install di `frontend/`.
- Jika smoke test gagal, pastikan artefak model dan parquet data masih ada di
  root repository.

## Lisensi dan Data

Repository ini membawa artefak model, data contoh, dan aset visual untuk demo
offline. Pastikan penggunaan data, peta, dan artefak mengikuti atribusi dan
batasan yang tercantum di file dokumentasi terkait.
