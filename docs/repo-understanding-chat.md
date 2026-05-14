# Full Repo Understanding Chat — LPSE-X ML-Only

Gunakan dokumen ini sebagai konteks awal ketika membuka chat baru untuk memahami dan mengerjakan repo ini. Tujuannya: chat langsung paham batas repo, alur inferensi, kontrak data/model, cara install, cara verifikasi, dan risiko yang tidak boleh dilanggar.

## 1. Identitas repo

- Nama repo GitHub: `vaskoyudha/Phase3_LPSE-x`
- Path lokal saat audit: `/home/simiko/project/Phase3_LPSE-x`
- Remote: `https://github.com/vaskoyudha/Phase3_LPSE-x.git`
- Branch utama: `main`
- Produk: LPSE-X, prototipe triase risiko pengadaan Find IT! 2026 Phase 2.
- Sifat repo: **ML-only extraction**, bukan repo full-product.

Repo ini menyimpan paket training, artifact model, data split lokal, inferensi offline, explainability, static casebook, test, dan dokumen rencana rebuild backend/frontend. Repo ini sengaja tidak membawa implementasi backend FastAPI, frontend React/Vite, Streamlit app, runtime review database, node package files, credential, cache, atau virtualenv.

## 2. Aturan batas yang tidak boleh dilanggar

Jangan menambahkan permukaan implementasi berikut ke repo ini:

- `frontend/` atau file React/Vite implementation.
- `src/api.py` dan `src/api_schemas.py`.
- `src/reviews.py` dan folder runtime `review_data/`.
- `app.py` Streamlit.
- `package.json`, `package-lock.json`, `node_modules/`.
- Credential, token, cache, build output, atau virtualenv.

Backend/frontend hanya boleh dijelaskan sebagai Markdown plan di `docs/project-plans/`. Jika perlu membangun full product, gunakan repo full-product terpisah, lalu jadikan repo ini sebagai sumber model/data/inference contract.

## 3. Runtime promise yang harus selalu dijaga

LPSE-X inference di repo ini harus tetap:

- **Offline-local:** tidak ada cloud call saat inferensi.
- **No live scraping:** runtime membaca parquet lokal yang sudah committed.
- **No retraining:** runtime hanya load `model_risk.ubj` atau `model_risk.onnx`; tidak boleh `.fit(`, HPO, scraping, export artifact, atau menulis parquet baru di jalur inferensi.
- **Anti-leakage aware:** bukti inferensi held-out memakai `test_data/`; `train_data/` boleh untuk training, diagnostics, dan archive browsing saja.
- **Judge-safe:** output adalah *triase risiko* dan *prioritas review*, **bukan tuduhan pelanggaran**, bukan putusan akhir, dan wajib ditinjau manusia.

## 4. Cara install dan verifikasi

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
make inference-smoke
make verify
```

Target Makefile penting:

```bash
make inference-smoke   # skor seluruh held-out test_data/features.parquet dan cetak summary JSON
make static-casebook   # render demo_casebook.html dari payload casebook
make verify-python     # compile src/tests/scripts + pytest
make guardrail-audit   # scan copy terlarang seperti klaim putusan final
make verify            # verify-python + inference-smoke + guardrail-audit
```

Hasil verifikasi terbaru saat dokumen ini dibuat:

- Python: `3.12.3`
- `make inference-smoke`: `model_risk.ubj`, `rows_scored=93034`, `rows_displayed=50`, `rank_1=745:ocds-20h3g7-20651044`
- `make verify`: `20 passed`
- Guardrail audit: lolos.

## 5. Dependency utama

`requirements.txt` mengunci dependency berikut:

- ML/runtime: `xgboost==2.1.4`, `onnxruntime==1.17.0`, `scikit-learn==1.4.0`, `numpy==1.26.0`, `pandas==2.2.0`, `pyarrow==15.0.0`
- Explainability/diagnostics: `shap==0.45.0`, `dice-ml==0.12`, `matplotlib==3.8.0`, `seaborn==0.13.0`, `optuna==3.6.0`, `onnxmltools==1.16.0`
- Notebook/test tooling: `jupyter==1.0.0`, `nbconvert==7.16.4`, `pytest==8.3.5`, `pytest-timeout==2.3.1`

Tidak ada dependency backend/frontend runtime di requirements repo ini.

## 6. Inventaris ukuran dan artifact

Artifact utama:

- `model_risk.ubj`: XGBoost model submitted, sekitar `1.04 MB`.
- `model_risk.onnx`: ONNX submitted artifact, sekitar `0.41 MB`.
- `demo_casebook.html`: static fallback report, sekitar `0.02 MB`.
- `training.ipynb` dan `inference.ipynb`: notebook training/inference.

Komposisi file non-cache saat audit:

- Total non-cache: `70` file.
- Python: `26` file.
- Markdown: `15` file.
- PNG figures: `11` file.
- Parquet: `6` file.
- Mermaid: `4` file.
- Notebook: `2` file.

Kode Python utama:

- `src/`: `18` file, sekitar `7.879` baris total.
- `tests/`: `7` file, sekitar `445` baris total.
- `scripts/`: `1` file.

## 7. Kontrak data split

Setiap split punya tiga lapisan artifact:

- `raw.parquet`: display/source data sebelum feature preprocessing.
- `features.parquet`: numeric feature matrix yang harus align dengan feature name model.
- `labels.parquet`: label heuristik untuk modeling/evaluation experiments.

Ukuran split saat audit:

- `train_data/raw.parquet`: `372150` baris, `29` kolom.
- `train_data/features.parquet`: `372150` baris, `34` kolom.
- `train_data/labels.parquet`: `372150` baris, `10` kolom.
- `test_data/raw.parquet`: `93034` baris, `29` kolom.
- `test_data/features.parquet`: `93034` baris, `34` kolom.
- `test_data/labels.parquet`: `93034` baris, `10` kolom.

Kolom raw awal mencakup antara lain:

- `ocid`, `tender_id`, `tender_title`, `tender_description`, `tender_status`, `tender_statusDetail`
- `tender_procurementMethod`, `tender_procurementMethodDetails`
- `tender_value_amount`, `tender_value_currency`, `tender_mainProcurementCategory`, `tender_items_count`

Kolom feature awal mencakup antara lain:

- `f_tender_value_log`, `f_award_value_log`, `f_price_deviation_ratio`, `f_main_procurement_category_enc`
- `f_award_duration_days`, `f_tender_items_count`, `f_award_items_count`
- `f_title_length`, `f_description_length`, `f_tender_value_missing`, `f_is_q4`, `f_is_december`

Kolom label awal mencakup antara lain:

- `flag_short_title`, `flag_short_description`, `flag_q4_timing`, `flag_price_deviation`
- `flag_high_value`, `flag_repeat_pair_history`, `flag_supplier_recent_surge`, `flag_buyer_value_spike`
- `flag_count`, `risk_label`

Aturan anti-leakage:

1. `train_data/` untuk training, HPO, calibration, diagnostics, dan archive browsing.
2. `test_data/` untuk proof held-out dan klaim evaluasi final.
3. Jangan tuning threshold, HPO, atau feature engineering berdasarkan `test_data/`.
4. Jika archive browsing menggabungkan `train_data + test_data`, setiap baris wajib punya `source_split` dan `eval_claim_scope`.

## 8. Model backend dan feature alignment

Model default menggunakan `model_risk.ubj` via XGBoost.

Hasil inspeksi backend:

- `kind`: `xgboost`
- Artifact: `model_risk.ubj`
- Jumlah kelas: `3`
- Jumlah feature model: `30`
- Feature awal model: `f_tender_value_log`, `f_award_value_log`, `f_price_deviation_ratio`, `f_main_procurement_category_enc`, `f_award_duration_days`, `f_tender_items_count`, `f_award_items_count`, `f_title_length`, `f_description_length`, `f_tender_value_missing`, `f_is_q4`, `f_is_december`, `f_award_value_missing`, `f_title_token_count`, `f_description_token_count`, `f_buyer_hist_avg_value`, `f_buyer_hist_value_std`, `f_supplier_hist_win_count`, `f_buyer_supplier_repeat_count`, `f_buyer_hist_tender_count`.

Feature matrix punya 34 kolom, tetapi runtime harus align ke feature name yang tersimpan di model. Jangan mengirim kolom extra tanpa alignment dan jangan mengubah urutan feature.

## 9. Peta source code utama

### `src/artifacts.py`

- Menyediakan `resolve_model_artifact(kind, explicit_path=None, project_root=None)`.
- Artifact yang diterima hanya:
  - `model_risk.ubj` untuk `kind="ubj"`
  - `model_risk.onnx` untuk `kind="onnx"`
- Helper ini hanya membaca filesystem; tidak membuat, memindah, mengganti, melatih, tuning, atau export model.
- Runtime inference wajib lewat helper ini agar tidak jatuh ke legacy fallback model.

### `src/product_demo.py`

Ini adalah adapter runtime offline untuk Command Center dan static casebook.

Komponen penting:

- Dataclass `DemoDataset`: menyatukan `features`, `raw`, path sumber, dan `max_rows`.
- Dataclass `InferenceRunMetadata`: metadata proof held-out, termasuk `no_cloud_call`, `no_live_scraping`, `no_retraining`, latency, source split, rows scored/ranked/displayed, dan guardrail.
- Dataclass `ArchiveInferenceMetadata`: metadata archive browsing untuk `train_data + test_data`.
- Dataclass `PredictionBackend`: wrapper model XGBoost/ONNX dengan `align_features()` dan `predict_proba()`.

Fungsi penting:

- `load_prediction_backend(kind="ubj")`: load `model_risk.ubj` atau `model_risk.onnx`; ONNX memakai feature order dari UBJ.
- `load_demo_dataset(max_rows=5000)`: load default `test_data/features.parquet` dan `test_data/raw.parquet`.
- `predict_risk_scores(features, backend)`: predict probabilities, ambil predicted class, probability, `risk_priority_score`, lalu sort descending.
- `extract_display_metadata(...)`: ambil metadata display dari raw row.
- `build_risk_queue(dataset, predictions, top_n=100)`: gabungkan prediksi dan raw metadata menjadi queue UI.
- `build_inference_run(max_rows=None, top_n=100)`: jalur proof held-out utama.
- `build_archive_inference_run(max_rows_per_split=None)`: skor `train_data + test_data` untuk archive browsing, bukan klaim held-out.
- `build_demo_bundle(...)`: convenience loader untuk app/tests.

Jalur proof held-out:

1. Load `test_data/features.parquet` dan `test_data/raw.parquet`.
2. Load `model_risk.ubj` via resolver.
3. Align feature sesuai `backend.feature_names`.
4. Predict probability per kelas.
5. Sort queue berdasarkan `risk_priority_score` dan `probability`.
6. Return `dataset`, `backend`, `predictions`, `queue`, `metadata`.

Contoh hasil top-5 held-out saat audit:

- `745:ocds-20h3g7-20651044` — rank 1, `Risiko Tinggi`, probability `1.0`, status `Prioritas Review`.
- `755:ocds-20h3g7-13708043` — rank 2, `Risiko Tinggi`, probability `1.0`.
- `832:ocds-20h3g7-13716308` — rank 3, `Risiko Tinggi`, probability `1.0`.
- `1263:ocds-20h3g7-2359605` — rank 4, `Risiko Tinggi`, probability `1.0`.
- `1267:ocds-20h3g7-2435579` — rank 5, `Risiko Tinggi`, probability `1.0`.

Archive browsing wajib memberi field:

- `archive_id`
- `archive_rank`
- `split_risk_rank`
- `source_split`
- `is_heldout`
- `eval_claim_scope`

Untuk `test_data`, `eval_claim_scope=heldout_test_only`. Untuk `train_data`, `eval_claim_scope=archive_browsing_only`.

### `src/casebook.py`

Membangun payload explainability per case dan static HTML fallback.

Fungsi penting:

- `explain_case(...)`: jelaskan satu baris dengan native XGBoost feature contributions. Jika gagal, fallback ke magnitude feature yang ditandai jelas.
- `build_casebook(case_id, dataset, predictions, backend)`: payload casebook lengkap untuk app/static.
- `render_static_casebook_html(payload, output_path=demo_casebook.html)`: render HTML report.
- `generate_demo_casebook()` dan `main()`: jalur CLI untuk `make static-casebook`.

Payload casebook berisi:

- `metadata` paket pengadaan.
- `model_output`: class, label, probability, risk rank, score.
- `factors`: top feature contributions.
- `explanation_brief`: ringkasan human-readable.
- `reviewer_questions`: checklist review manusia.
- `guardrail` dan `heuristic_label_note`.
- `provenance`: model artifact, raw/feature source, split usage, inference mode.

### `src/narrative.py`

Menerjemahkan faktor model menjadi narasi manusiawi berbahasa Indonesia.

Tugas utama:

- Label feature ke istilah manusia.
- Jelaskan kenapa faktor perlu ditinjau.
- Buat checklist reviewer.
- Menjaga copy agar tidak mengklaim putusan final.

Narasi harus selalu memosisikan output sebagai prioritas review manusia.

### `src/explain.py`

Berisi utility explainability model:

- `XGBoostContributionExplainer`
- `load_model`, `get_explainer`
- `explain_single`, `explain_batch`
- SHAP summary/counterfactual helpers
- DICE counterfactual helper

Di runtime product path, casebook lebih mengandalkan native XGBoost contribution dari `src/casebook.py` agar tidak berat dan tetap offline.

### `src/features.py`

Membangun feature dari raw procurement data.

Kelompok feature:

- Nilai tender/award dan deviasi harga.
- Durasi award.
- Jumlah item tender/award.
- Panjang judul/deskripsi dan token count.
- Missingness indicator.
- Q4/Desember timing.
- Histori buyer/supplier dan repeat relationship.
- Capacity/growth/spike features.

Fungsi inti:

- `tier1_features(df)`
- `tier2_features(df)`
- `compute_all_features(df)`
- `save_features(df, path)`

### `src/labels.py`

Membuat label heuristik dan red flags.

Fungsi inti:

- `assign_heuristic_label(...)`
- `label_dataframe(...)`
- `compute_red_flags(...)`
- `compute_risk_labels(...)`
- `save_labels(...)`
- calibration sample helpers.

Penting: label adalah heuristik risiko, bukan bukti pelanggaran terverifikasi.

### `src/model.py`

Modul lifecycle model paling besar. Berisi training, HPO, evaluasi, calibration, threshold, export ONNX, parity check, dan save/load.

Fungsi penting:

- `load_train_artifacts()`, `load_test_artifacts()`, `load_dev_split_indices()`
- `train_xgboost()`, `run_hpo()`, `train_final_model()`
- `evaluate_model()`, `evaluate()`, `_build_metrics()`
- `fit_temperature()`, `save_calibration()`
- `search_decision_thresholds()`, `predict_with_thresholds()`
- `save_model()`, `load_model()`
- `export_to_onnx()`, `check_onnx_parity()`

Jangan panggil jalur training/HPO/export dari runtime inference.

### `src/data.py` dan `src/split.py`

`src/data.py` menangani ingestion/flattening source procurement:

- Download helper, gzip readability check, extraction rows, flatten JSONL, clean dates, quality report, run pipeline.

`src/split.py` menangani split:

- `external_raw_split()`
- `save_raw_splits()`
- `load_raw_split()`
- `internal_dev_splits()`
- `save_dev_split_manifest()`

Runtime demo tidak boleh menjalankan download/scraping path.

### `src/diagnostics.py`

Menyediakan ringkasan audit/diagnostics:

- Data provenance.
- Feature health.
- Proxy feature set checks.
- Circularity ablation.
- Reviewed-label benchmarks.
- Operational review metrics.
- Explanation validation.

Biasanya dipakai untuk laporan/figure, bukan request-time inference.

### `src/evidence.py`, `src/evidence_linking.py`, `src/evidence_sources/`

Menyediakan normalisasi dan linking evidence eksternal:

- Normalize evidence records.
- Match procurement rows dengan evidence candidates.
- Handle ambiguous/unmatched/reviewer-needed states.
- Transform source khusus:
  - `kpk_ppid_report.py`
  - `kpk_procurement_case.py`
  - `lkpp_inaproc_blacklist.py`

Ini bagian riset/labeling/evidence support, bukan bukti final otomatis.

### `scripts/inference_smoke.py`

Smoke check judge-facing:

- Memanggil `build_inference_run(max_rows=None, top_n=50)`.
- Assert artifact `model_risk.ubj`.
- Assert `rows_scored == len(predictions)`.
- Assert queue length `50`.
- Assert `no_cloud_call`, `no_retraining`, `no_live_scraping`.
- Cetak JSON summary.

## 10. Test suite dan apa yang dijaga

Tests saat audit: `20 passed`.

File test utama:

- `tests/test_artifacts.py`
  - Artifact submitted harus resolve tanpa regenerasi.
  - UBJ backend memuat feature names untuk safe alignment.
  - Resolver menolak legacy fallback.
  - ONNX memakai feature order dari UBJ.

- `tests/test_product_demo.py`
  - Demo dataset default hanya test split.
  - Prediction backend wajib exact feature alignment.
  - Queue preserve guardrails dan priority order.
  - Metadata offline/no cloud/no retraining/no scraping.
  - Full inference skor expected split.
  - Archive run memberi label split dan scope.

- `tests/test_casebook.py`
  - Payload casebook punya static fallback contract.
  - Static HTML bisa generated dari payload.

- `tests/test_narrative_guardrails.py`
  - Narasi memakai bahasa review triage, bukan accusation.
  - Feature diterjemahkan dan copy tidak teknis berulang.
  - Docs/static casebook menghindari klaim terlarang.

- `tests/test_no_retraining.py`
  - Runtime surfaces tidak memulai training/scraping.
  - Docs menjelaskan demo local/offline boundaries.

- `tests/test_inference_readiness_contract.py`
  - Notebook inference memakai submitted artifacts dan full test split.
  - Repo ML-only exclude backend/frontend implementation.
  - Requirements tetap model-only.

## 11. Dokumen rebuild backend/frontend

`docs/project-plans/` menyimpan rencana rebuild untuk repo full-product terpisah. Ini bukan implementasi backend/frontend.

File penting:

- `docs/project-plans/README.md`: overview rencana rebuild.
- `docs/project-plans/00-target-folder-structure.md`: struktur folder target full product.
- `docs/project-plans/backend/backend-file-implementation-guide.md`: panduan backend paling lengkap, file-by-file.
- `docs/project-plans/backend/integration-contracts.md`: kontrak API backend/frontend.
- `docs/project-plans/backend/person-1-data-model-training.md`: data/model owner.
- `docs/project-plans/backend/person-2-api-runtime.md`: FastAPI runtime owner.
- `docs/project-plans/backend/person-3-explainability-review-quality.md`: explainability/review/quality owner.
- `docs/project-plans/frontend/00-frontend-rebuild-plan.md`: rencana frontend.
- `docs/project-plans/frontend/api-contracts-consumed.md`: kontrak API dari sisi frontend.
- `docs/project-plans/frontend/file-by-file-frontend-map.md`: peta file frontend.

Jika chat mengerjakan backend/frontend, jangan menulis file implementation di repo ini. Tulis/update plan docs saja, atau pindah ke repo full-product.

## 12. Kontrak output yang aman untuk UI/API

Semua API/UI yang memanfaatkan repo ini harus menjaga wording:

- Gunakan: `triase risiko`, `prioritas review`, `perlu ditinjau manusia`, `label heuristik`, `bukan tuduhan pelanggaran`.
- Hindari: klaim bahwa model membuktikan fraud, korupsi, pelanggaran, atau konklusi legal final.
- Jelaskan provenance: model artifact, feature source, raw source, split, no cloud, no scraping, no retraining.
- Untuk archive browsing gabungan, expose `source_split`, `is_heldout`, dan `eval_claim_scope`.

## 13. Pola kerja saat chat diminta mengubah repo

1. Cek status repo dulu:

```bash
git status --short --branch
git remote -v
git --no-pager log --oneline -5 --decorate
```

2. Baca file terkait memakai `read_file`; cari referensi memakai search, bukan menebak.
3. Jika mengubah code runtime, jalankan test paling relevan lalu `make verify`.
4. Jika hanya mengubah docs, tetap jalankan minimal guardrail audit; idealnya `make verify` jika dependency tersedia.
5. Jangan masukkan file forbidden.
6. Commit message harus ringkas, imperative, dan Bahasa Indonesia.
7. Hindari menyebut pelaksana internal pada ringkasan commit agar commit terlihat seperti pekerjaan tim biasa.

Contoh commit yang aman:

```bash
git commit -m "docs: tambah panduan pemahaman repo"
git commit -m "fix: perbaiki validasi status review manusia"
git commit -m "test: pastikan payload arsip tetap terbatas"
git commit -m "feat: tambah endpoint status inferensi lokal"
```

Contoh buruk:

```bash
git commit -m "update files"
git commit -m "team member: update docs"
git commit -m "docs: perubahan dari project team member"
git commit -m "fix bug"
```

## 14. Prompt siap pakai untuk chat baru

Salin blok berikut sebagai pesan awal chat baru:

```text
Kamu membantu mengerjakan repo LPSE-X ML-only di path /home/simiko/project/Phase3_LPSE-x.

Repo ini adalah model-focused extraction untuk LPSE-X procurement-risk prototype, bukan repo full-product. Jangan menambahkan frontend React/Vite, FastAPI backend implementation, Streamlit app, review DB runtime, node package files, credential, cache, atau virtualenv. Backend/frontend hanya boleh dijelaskan di docs/project-plans/ atau dikerjakan di repo full-product terpisah.

Runtime promise wajib dijaga: offline-local, no cloud call, no live scraping, no retraining, anti-leakage split, output sebagai triase risiko/prioritas review, bukan tuduhan pelanggaran atau putusan akhir.

Setup:
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
make inference-smoke
make verify

Artifact utama: model_risk.ubj dan model_risk.onnx. Data split: train_data dan test_data, masing-masing punya raw.parquet, features.parquet, labels.parquet. Held-out proof wajib memakai test_data. Archive browsing boleh memakai train_data + test_data hanya jika setiap row punya source_split dan eval_claim_scope.

Source penting:
- src/artifacts.py: resolver model artifact, tidak regenerate model.
- src/product_demo.py: adapter inference offline, PredictionBackend, build_inference_run, build_archive_inference_run, build_risk_queue.
- src/casebook.py: explain selected case dan render demo_casebook.html.
- src/narrative.py: narasi Bahasa Indonesia dengan guardrail.
- src/features.py dan src/labels.py: feature engineering dan label heuristik.
- src/model.py: training/HPO/evaluation/export; jangan dipanggil runtime inference.
- scripts/inference_smoke.py: smoke judge-facing.
- tests/: guard artifact, no retraining, product_demo, casebook, narrative, inference readiness.

Sebelum membuat perubahan, jalankan git status dan baca file terkait. Setelah perubahan, jalankan test relevan dan idealnya make verify. Commit message harus Bahasa Indonesia dan jangan menyebut pelaksana internal pada ringkasan commit.
```

## 15. Checklist cepat sebelum menyelesaikan task

- [ ] Tidak ada file forbidden masuk repo.
- [ ] Inference runtime tetap load `model_risk.ubj`/`model_risk.onnx` lewat `resolve_model_artifact`.
- [ ] Tidak ada `.fit(`, HPO, scraping, `to_parquet`, atau export artifact di runtime path.
- [ ] Held-out proof tetap `test_data/`.
- [ ] Archive browsing tetap berlabel split dan scope.
- [ ] Copy tetap menyebut triase/prioritas review, bukan tuduhan.
- [ ] `make verify` atau test relevan sudah dijalankan.
- [ ] Commit message Bahasa Indonesia, user-facing, dan tanpa menyebut pelaksana internal di summary.
