# Dokumentasi Instalasi LPSE-X

Panduan ini menjelaskan cara menyiapkan LPSE-X untuk inference offline, API
lokal, dan command center frontend.

## Prasyarat

- Python 3.10 atau lebih baru.
- `pip` dan `venv`.
- Node.js 20 LTS atau lebih baru untuk frontend.
- `npm` yang kompatibel dengan lockfile `frontend/package-lock.json`.
- Sistem operasi Linux/macOS, atau Windows dengan WSL yang mendukung dependency
  Python scientific stack.

## 1. Masuk ke Root Project

```bash
cd BismillahFirstTry-Phase2_Tahap2_FindIT2026-ML-Inference
```

Semua command di bawah dijalankan dari folder ini kecuali disebutkan lain.

## 2. Instalasi Python

Cara yang direkomendasikan:

```bash
make install-python
```

Command tersebut membuat `.venv` dan menginstal dependency dari
`requirements.txt`.

Jika ingin menjalankan manual:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## 3. Validasi Artefak Offline

Jalankan smoke test setelah dependency Python selesai diinstal:

```bash
make inference-smoke
```

Smoke test ini memastikan artefak model, parquet data, dan adapter inference
lokal bisa dibaca tanpa retraining atau network call.

## 4. Instalasi Frontend

```bash
make install-frontend
```

Atau manual:

```bash
cd frontend
npm ci
```

Gunakan `npm ci`, bukan `npm install`, supaya versi dependency mengikuti
`package-lock.json`.

## 5. Menjalankan API Lokal

```bash
make run-api
```

API berjalan di:

```text
http://127.0.0.1:8000
```

Endpoint health dapat dicek di:

```text
http://127.0.0.1:8000/api/health
```

## 6. Menjalankan Frontend Development

Jalankan API terlebih dahulu dengan `make run-api`, lalu buka terminal kedua:

```bash
cd frontend
LPSEX_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

Vite akan menampilkan URL lokal, biasanya:

```text
http://127.0.0.1:5173
```

Catatan: konfigurasi Vite default mengarah ke API `http://127.0.0.1:8888`.
Karena `make run-api` memakai port `8000`, set
`LPSEX_API_PROXY_TARGET=http://127.0.0.1:8000` saat menjalankan frontend dev.

## 7. Build Frontend untuk Disajikan dari FastAPI

```bash
make build-frontend
make run-api
```

Setelah `frontend/dist` tersedia, FastAPI dapat menyajikan bundle static dari
runtime lokal.

## 8. Verifikasi Sebelum Submit

Untuk validasi Python:

```bash
make verify-python
```

Untuk validasi frontend:

```bash
make verify-frontend
```

Untuk seluruh validasi utama:

```bash
make verify
```

`make verify` menjalankan compile/test Python, typecheck/lint/test/build
frontend, smoke test inference, dan guardrail audit.

## Troubleshooting

### `uvicorn: not found`

Aktifkan virtual environment atau jalankan lewat Makefile:

```bash
. .venv/bin/activate
make run-api
```

### Frontend gagal memanggil `/api`

Pastikan API berjalan dan proxy target sesuai port API:

```bash
LPSEX_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

### `npm ci` gagal

Gunakan Node.js 20 LTS atau lebih baru, lalu hapus install parsial jika ada:

```bash
cd frontend
rm -rf node_modules
npm ci
```

### Smoke test gagal membaca artefak

Pastikan file berikut masih ada di root project:

- `model_risk.ubj`
- `model_risk.onnx`
- `test_data/features.parquet`
- `test_data/raw.parquet`
- `test_data/labels.parquet`
- `train_data/features.parquet`
- `train_data/raw.parquet`
- `train_data/labels.parquet`

## Catatan Keamanan dan Scope

- Jangan menambahkan credential ke repository.
- Jangan menjalankan scraping, retraining, atau cloud call dari runtime produk.
- Gunakan `test_data/` hanya untuk klaim held-out.
- Perlakukan output sebagai triase risiko dan prioritas review, bukan bukti
  pelanggaran atau keputusan hukum.
