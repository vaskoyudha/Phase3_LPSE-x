# Ringkasan Output Task 1 & Task 2 (LPSE-X)

Dokumen ini merangkum apa saja output yang dihasilkan oleh Task 1 dan Task 2, plus cara menjalankan project-nya.

================================================================================
LANGKAH PERTAMA: MASUK KE FOLDER DBP3
================================================================================

Pertama-tama, kamu harus masuk ke folder `dbp3` di terminal kamu!

Untuk Command Prompt/PowerShell:
```cmd
cd d:\Project\Phase3_LPSE-x\dbp3
```

Pastikan kamu sudah di folder `dbp3` sebelum menjalankan semua perintah selanjutnya!

================================================================================
## CARA MENJALANKAN KODE (Setup & Verifikasi)
================================================================================

1) Buat virtualenv dan install dependency (opsional tapi disarankan)

Linux/macOS (bash):
```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Windows (PowerShell):
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2) Jalankan cek cepat Task 1 dan Task 2 (tanpa make):

Cek Task 1 (explain.py):
```bash
python -c "from src.explain import explain_single; print('Task 1 OK')"
```

Cek Task 2 (narrative.py):
```bash
python -c "from src.narrative import render_explanation_narrative; print('Task 2 OK')"
```

================================================================================
## TASK 1: Explainability Utilities (src/explain.py)
================================================================================

**Tujuan:** Ubah prediksi model jadi daftar faktor (top features) dengan kontribusi SHAP.

**File:** src/explain.py

**Fungsi Utama:**
- explain_single(row, feature_names): return dict dengan predicted_class, probability, dan factors
- explain_batch(X, feature_names): return SHAP values batch
- get_counterfactual_shap(result): saran what-if
- plot_shap_summary(X, feature_names): plot feature importance global

**Contoh Output explain_single():**
```json
{
  "predicted_class": 2,
  "probability": 0.87,
  "factors": [
    {
      "feature": "f_tender_value_log",
      "shap_value": 0.35,
      "feature_value": 19.2
    },
    {
      "feature": "f_price_deviation_ratio",
      "shap_value": 0.28,
      "feature_value": 1.3
    }
  ]
}
```

**Cara Baca:**
- predicted_class: 0=Risiko Rendah, 1=Risiko Sedang, 2=Risiko Tinggi
- probability: keyakinan model (0.0-1.0)
- factors: daftar fitur terurut dari paling besar |SHAP| ke kecil

================================================================================
## TASK 2: Human-Readable Narrative Module (src/narrative.py)
================================================================================

**Tujuan:** Ubah faktor mentah jadi narasi Bahasa Indonesia yang aman untuk reviewer (tidak overclaim).

**File:** src/narrative.py

**Fungsi Utama:**
- _feature_label: terjemahkan nama fitur ke bahasa reviewer
- _factor_title: judul singkat faktor
- _factor_reason: alasan mengapa fitur penting
- _factor_review_check: tindakan yang harus dicek reviewer
- _impact_label: "dampak kuat", "dampak sedang", dll.
- _confidence_label: "sangat yakin", "yakin", dll.
- derive_business_rating: rating bisnis keseluruhan
- render_factor_sentence: kalimat per faktor
- build_explanation_brief: ringkasan terstruktur
- render_explanation_narrative: narasi lengkap

**Aturan Copy Wajib:**
- ✅ Harus ada: "triase risiko", "prioritas review", "bukan tuduhan pelanggaran"
- ❌ Jangan ada: bukti, fraud, korupsi, putusan akhir, pasti

**Terjemahan Fitur:**
- f_tender_value_log → nilai tender relatif besar
- f_price_deviation_ratio → deviasi harga terhadap estimasi
- f_buyer_supplier_repeat_count → riwayat buyer-supplier berulang
- f_supplier_recent_90d_award_count → aktivitas award supplier dalam 90 hari terakhir

**Contoh Input (dari Task 1):**
```python
test_explanation = {
    "predicted_class": 2,
    "predicted_label": "Risiko Tinggi",
    "probability": 0.87,
    "factors": [
        {"feature": "f_tender_value_log", "shap_value": 0.35, "feature_value": 19.2},
        {"feature": "f_price_deviation_ratio", "shap_value": 0.28, "feature_value": 1.3},
        {"feature": "f_buyer_supplier_repeat_count", "shap_value": 0.15, "feature_value": 5},
        {"feature": "f_supplier_recent_90d_award_count", "shap_value": -0.10, "feature_value": 2},
    ],
}
```

**Contoh Output render_explanation_narrative():**
```text
Peringkat prioritas review paket ini adalah **Risiko Tinggi**.
Paket ini masuk prioritas Risiko Tinggi karena model melihat sinyal utama: nilai tender relatif besar, deviasi harga perlu konteks, hubungan buyer-supplier berulang. Gunakan ringkasan ini sebagai arahan review awal, bukan kesimpulan pelanggaran.
Keyakinan model sangat tinggi untuk kelas **Risiko Tinggi**; probabilitas digunakan sebagai skor triase, bukan kepastian hukum.
Catatan penting: ini adalah triase risiko untuk prioritas review, bukan tuduhan pelanggaran atau putusan akhir. Probabilitas model bukan kepastian hukum dan wajib diverifikasi manusia.
Faktor utama yang perlu dipahami reviewer:
- Nilai tender relatif besar bernilai 19.2 dan meningkatkan skor risiko dengan dampak sedang.
- Deviasi harga terhadap estimasi bernilai 1.3 dan meningkatkan skor risiko dengan dampak sedang.
- Riwayat buyer-supplier berulang bernilai 5 dan meningkatkan skor risiko dengan dampak kecil.
- Aktivitas award supplier dalam 90 hari terakhir bernilai 2 dan menurunkan skor risiko dengan dampak kecil.
SHAP menunjukkan faktor mana yang menggeser skor model naik atau turun dari baseline. Nilai SHAP besar berarti pengaruh model lebih kuat, bukan bukti pelanggaran.
```

**Cara Menjalankan Test Task 2:**
```bash
# Buat file test_narrative_simple.py (sudah disediakan) lalu jalankan:
python test_narrative_simple.py
# Atau lihat output di test_narrative_result.txt
```

================================================================================
## TASK 3: Casebook Payload Builder (src/casebook.py)
================================================================================

**Tujuan:** Bangun payload casebook untuk satu paket tertentu, yang dipakai oleh API, frontend, dan export HTML static.

**File:** src/casebook.py

**Fsafe_narrative: pastikan narasi aman (tidak overclaim)
- build_casebook: buat payload casebook lengkap
- render_static_casebook_html: generate HTML casebook static
- generate_demo_casebook: buat casebook demo secara otomatis

**Section Payload:**
- case_id: ID kasus
- metadata: metadata paket tender (judul, nilai, buyer, supplier, dll.)
- model_output: hasil prediksi model (predicted_class, probability, probabilities, dll.)
- factors: daftar faktor (fitur, label, nilai, SHAP, direction)
- explanation_brief: ringkasan dari narrative.py
- narrative: narasi lengkap
- reviewer_questions: daftar pertanyaan untuk reviewer
- provenance: asal data dan model (model artifact, feature source, raw source, inference mode, split usage)
- guardrail badges: badge keamanan

**Aturan Penting:**
- Jika ekstraksi native gagal, gunakan fallback deterministic berdasarkan nilai fitur
- Casebook harus spesifik untuk satu paket yang dipilih
- Split usage harus mengatakan bahwa test split untuk inference/review, bukan training atau tuning

**Cara Menjalankan Task 3:**
```bash
# Generate casebook demo (butuh dependencies pyarrow dll.):
python -m src.casebook

# Hasilnya akan membuat demo_casebook.html!
```

================================================================================
## TASK 4: Static HTML Casebook Export (src/casebook.py)
================================================================================

**Tujuan:** Menyediakan laporan fallback tanpa frontend (HTML static).

**File:** src/casebook.py

**Fungsi Utama:**
- render_static_casebook_html(payload, output_path): generate HTML casebook static dari payload


**File yang Berubah/Dibuat:**
- ✅ Tidak ada file yang berubah (sudah ada dan lengkap di src/casebook.py)
- 📂 Di folder dbp3: run_casebook.py (file helper untuk Windows)
**Section HTML:**
- Report header (judul LPSE-X, logo, dll.)
- Model output summary (assessment risiko, probabilitas, prioritas review)
- Data source/provenance (sumber data dan model)
- Top factors (tabel faktor top dengan SHAP)
- Narrative and reviewer checklist (narasi dan daftar pertanyaan reviewer)
- Guardrail/safety statement (catatan keamanan)

**Verification:**
```bash
PYTHONPATH=. python -m src.casebook
```

**Expected:** Membuat atau memperbarui file `demo_casebook.html`.

**Implementation Status:** ✅ COMPLETE
- Fungsi `render_static_casebook_html` sudah terimplementasi di src/casebook.py
- Semua section HTML sudah ada sesuai requirement

================================================================================
## TASK 5: SQLite Review Store (src/reviews.py)
================================================================================

**Tujuan:** Memungkinkan reviewer menyimpan status, catatan, keputusan, dan signoff tanpa mengubah output model.

**File:** src/reviews.py

**File yang Berubah/Dibuat:**
- 🆕 Di luar folder dbp3: **Membuat file baru `src/reviews.py`** (karena tidak ada sebelumnya)
- 🔧 Di luar folder dbp3: Memperbaiki `src/reviews.py` (menutup koneksi SQLite dengan benar untuk Windows)
- 📂 Di folder dbp3: test_task5_reviews.py (file test sementara)

**Konsep Utama:**
- REVIEW_STATUSES: daftar status yang tersedia (Perlu Review, Ditandai Risiko, Butuh Dokumen, Selesai)
- ReviewStore: menggunakan SQLite untuk menyimpan review
- Satu baris per case_id
- Event history ditambahkan setiap upsert
- signed_off_at diset ketika review di-signoff atau selesai

**Metode Utama:**
- get_review(case_id): mendapatkan review berdasarkan case_id
- list_reviews(): daftar semua review
- upsert_review(): menyimpan atau memperbarui review

**Aturan Penting:**
- Simpan keputusan manusia secara terpisah dari prediksi model
- Jangan mengubah model/data artifacts
- Default state untuk review yang belum disimpan adalah draft yang di-generate dari casebook payload

**Cara Menjalankan Task 5:**
```bash
# Test sederhana review store (sudah disediakan di test_task5_reviews.py):
python test_task5_reviews.py
```

**Implementation Status:** ✅ COMPLETE
- File src/reviews.py sudah dibuat dengan semua fungsi yang dibutuhkan
- REVIEW_STATUSES sesuai requirement
- ReviewStore menggunakan SQLite
- Event history dan signed_off_at sudah diimplementasi

================================================================================
## TASK 6: Review API Behavior Support (src/reviews.py)
================================================================================

**Tujuan:** Menyediakan logika untuk API review (Person 2 expose endpoint, tapi Person 3 define logikanya).

**File:** src/reviews.py

**Fungsi Utama untuk API:**
- _draft_review(case_id): buat draft review jika belum ada review yang disimpan
- _review_snapshots(casebook_payload): ekstrak snapshot paket dan model dari casebook payload
- _review_record(payload): konversi ReviewRecord ke dict yang bisa diserialkan JSON
- _review_list_item_from_queue(row): format baris antrian untuk daftar review
- _review_counts(items): hitung jumlah review per status

**Perilaku yang Diharapkan:**
- GET /api/reviews/{case_id}: mengembalikan draft yang sudah diisi jika belum ada review yang disimpan
- PUT /api/reviews/{case_id}: menyimpan catatan manusia dan menambah history
- Validasi status menolak status yang tidak dikenal

**Implementation Status:** ✅ COMPLETE
- Semua fungsi untuk Task 6 sudah diimplementasi di src/reviews.py
- Sudah sesuai dengan semua requirement behavior

================================================================================
## TASK 7: Guardrail Audit (tests/test_narrative_guardrails.py & Makefile)
================================================================================

**Tujuan:** Membuat klaim tidak aman tidak mungkin terlewatkan!

**File:**
- tests/test_narrative_guardrails.py
- Makefile (target guardrail-audit)

**File yang Berubah/Dibuat:**
- ✅ Tidak ada file yang berubah (sudah ada dan lengkap)

**Semantik Frasa yang Diblokir:**
Jangan menulis frasa yang mengklaim model sudah membuktikan fraud/korupsi, mengeluarkan putusan akhir gaya pengadilan, atau menghasilkan bukti akhir. Simpan daftar kata yang diblokir hanya di dalam test otomatis/script audit saja agar dokumentasi tidak secara tidak sengaja memicu guardrail audit.

**Frasa yang Wajib Ada:**
- triase risiko
- prioritas review
- bukan tuduhan pelanggaran

**Implementation Status:** ✅ COMPLETE
- tests/test_narrative_guardrails.py sudah ada dan lengkap
- Makefile punya target guardrail-audit
- Semua frasa wajib dan blokir sudah diimplementasi

================================================================================
## TASK 8: Quality Tests
================================================================================

**Tujuan:** Menjalankan test kualitas untuk semua komponen.

**File Test yang Dibutuhkan:**
- tests/test_casebook.py
  - casebook contains static fallback contract
  - static HTML generated from payload
  - payload includes guardrail and reviewer checklist
- tests/test_narrative_guardrails.py
  - narratives include required safe copy
  - narratives avoid prohibited copy
  - docs/static casebook avoid prohibited claims
- tests/test_reviews.py
  - draft review returned for unsaved selected case
  - upsert saves human signoff and appends history
  - unknown status rejected
- tests/test_no_retraining.py
  - runtime explanation/review surfaces do not train, scrape, or export artifacts

**Implementation Status:** ✅ COMPLETE
- tests/test_casebook.py: sudah ada dan lengkap!
- tests/test_narrative_guardrails.py: sudah ada dan lengkap!
- tests/test_reviews.py: baru dibuat dan lengkap!
- tests/test_no_retraining.py: sudah ada dan lengkap!

================================================================================
## FINAL ACCEPTANCE PERSON 3
================================================================================

Untuk memverifikasi bahwa semua task Person 3 selesai dan berjalan dengan benar, jalankan perintah berikut:

### Langkah 1: Periksa Compile Semua File
```bash
# Karena kamu di folder dbp3, gunakan path ke parent folder
python -m compileall ..\src ..\tests
```
- Ini memastikan tidak ada error sintaks di file Python di folder src dan tests!

### Langkah 2: Jalankan Semua Test Quality
```bash
# Karena kamu di folder dbp3, gunakan path ke parent folder
python -m pytest ..\tests\test_casebook.py ..\tests\test_narrative_guardrails.py ..\tests\test_reviews.py ..\tests\test_no_retraining.py -v
```
- Ini menjalankan semua test yang dibutuhkan!

### Langkah 3: Generate Casebook Demo
Untuk Windows (Command Prompt/PowerShell):
```cmd
# Cara TERMUDAH: langsung jalankan run_casebook.py dari folder dbp3!
python run_casebook.py

# Atau cara lama: pindah ke parent folder terlebih dahulu
cd ..
set PYTHONPATH=.
python -m src.casebook
```

Untuk Linux/macOS:
```bash
cd ..
PYTHONPATH=. python -m src.casebook
```
- Ini membuat `demo_casebook.html` di direktori utama (parent folder)!

### Langkah 4: Jalankan Guardrail Audit
```bash
# Pindah ke parent folder terlebih dahulu
cd ..

# Jika make tersedia (Linux/macOS atau Windows dengan Make):
make guardrail-audit

# Jika make tidak tersedia (Windows tanpa Make):
python -c "from pathlib import Path; blocked=['terbukti fraud','terbukti korupsi','fraud final','legal verdict','confirmed corruption','putusan hukum']; paths=[p for p in Path('.').rglob('*') if p.is_file() and p.suffix in {'.py','.md','.html','.ipynb'} and not any(x in p.parts for x in {'.git','.venv','__pycache__'})]; text='\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in paths).lower(); hits=[b for b in blocked if b in text]; raise SystemExit('Blocked guardrail copy: '+', '.join(hits) if hits else 0)"
```

### Kriteria Kelulusan (Pass Criteria):
- ✅ casebook payload spesifik untuk satu kasus yang dipilih
- ✅ static casebook HTML berhasil di-render dan termasuk guardrails
- ✅ review workflow menyimpan catatan manusia tanpa mengubah output model
- ✅ tidak ada salinan tuduhan tidak aman/putusan akhir yang muncul

### Catatan Penting:
- Kamu bisa menjalankan tanpa venv, tapi direkomendasikan untuk menggunakan venv agar dependency tidak bentrok!
- Jika kamu ingin buat venv, lihat bagian "CARA UMUM SETUP DAN INSTALL DEPENDENCIES" di COMMAND_REFERENCE_SEMUA_TASK.md!








**Implementation Status:** ✅ COMPLETE

- File `src/narrative.py` has all core functions implemented
- Feature name mapping dictionary (`FEATURE_LABELS`) covers all required features
- Safety note (`SAFETY_NOTE`) includes all required phrases: triase risiko, prioritas review, bukan tuduhan pelanggaran
- All guardrail rules are enforced
- Example output available in `test_narrative_result.txt`

================================================================================
**Contoh Output Task 2:**
================================================================================
```text
Peringkat prioritas review paket ini adalah **Risiko Tinggi**.
Paket ini masuk prioritas Risiko Tinggi karena model melihat sinyal utama: nilai tender relatif besar, deviasi harga perlu konteks, hubungan buyer-supplier berulang. Gunakan ringkasan ini sebagai arahan review awal, bukan kesimpulan pelanggaran.
Keyakinan model sangat tinggi untuk kelas **Risiko Tinggi**; probabilitas digunakan sebagai skor triase, bukan kepastian hukum.
Catatan penting: ini adalah triase risiko untuk prioritas review, bukan tuduhan pelanggaran atau putusan akhir. Probabilitas model bukan kepastian hukum dan wajib diverifikasi manusia.
Faktor utama yang perlu dipahami reviewer:
- Nilai tender relatif besar bernilai 19.2 dan meningkatkan skor risiko dengan dampak sedang.
- Deviasi harga terhadap estimasi bernilai 1.3 dan meningkatkan skor risiko dengan dampak sedang.
- Riwayat buyer-supplier berulang bernilai 5 dan meningkatkan skor risiko dengan dampak kecil.
- Aktivitas award supplier dalam 90 hari terakhir bernilai 2 dan menurunkan skor risiko dengan dampak kecil.
SHAP menunjukkan faktor mana yang menggeser skor model naik atau turun dari baseline. Nilai SHAP besar berarti pengaruh model lebih kuat, bukan bukti pelanggaran.
```
================================================================================