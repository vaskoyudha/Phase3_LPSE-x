
# COMMAND REFERENCE SEMUA TASK (LPSE-X) - Bahasa Indonesia

Dokumen ini berisi perintah-perintah untuk menjalankan dan memverifikasi setiap task dari LPSE-X.

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
## CARA UMUM SETUP DAN INSTALL DEPENDENCIES
================================================================================

1. Buat virtual environment (opsional tapi disarankan):
   ```bash
   # Windows (PowerShell):
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1

   # Linux/macOS:
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies dari requirements.txt:
   ```bash
   pip install -r requirements.txt
   ```

================================================================================
## TASK 1: Explainability Utilities (src/explain.py)
================================================================================

**File:** src/explain.py
**Status:** ✅ Sudah selesai

Perintah untuk cek Task 1:

1. Cek import cepat:
   ```bash
   python -c "from src.explain import explain_single; print('OK')"
   ```

2. Cek komprehensif (jika ada file test_task1_comprehensive.py):
   ```bash
   python test_task1_comprehensive.py
   ```

3. Jalankan test yang ada (jika model tersedia):
   ```bash
   python -m pytest tests/test_casebook.py -v
   ```

================================================================================
## TASK 2: Human-Readable Narrative Module (src/narrative.py)
================================================================================

**File:** src/narrative.py
**Status:** ✅ Sudah selesai

Perintah untuk cek Task 2:

1. Cek import cepat:
   ```bash
   python -c "from src.narrative import render_explanation_narrative; print('OK')"
   ```

2. Test sederhana (sudah disediakan):
   ```bash
   python test_narrative_simple.py
   ```

3. Lihat contoh output:
   - Buka test_narrative_result.txt untuk melihat contoh output narasi

================================================================================
## TASK 3: Casebook Payload Builder (src/casebook.py)
================================================================================

**File:** src/casebook.py
**Status:** ✅ Sudah selesai

Perintah untuk cek Task 3:

1. Cek import cepat:
   ```bash
   python -c "from src.casebook import build_casebook; print('OK')"
   ```

2. Generate casebook demo (butuh dependencies seperti pyarrow untuk baca parquet):
   ```bash
   PYTHONPATH=. python -m src.casebook
   ```

   Hasilnya akan membuat file demo_casebook.html di direktori utama!

================================================================================
## TASK 4: Static HTML Casebook Export (src/casebook.py)
================================================================================

**File:** src/casebook.py
**Status:** ✅ Sudah selesai

Perintah untuk cek Task 4:

1. Sama seperti Task 3:
   ```bash
   PYTHONPATH=. python -m src.casebook
   ```

2. Buka file demo_casebook.html di browser untuk melihat hasilnya!

================================================================================
## TASK 5: SQLite Review Store (src/reviews.py)
================================================================================

**File:** src/reviews.py
**Status:** ✅ Sudah selesai

Perintah untuk cek Task 5:

1. Cek import cepat:
   ```bash
   python -c "from src.reviews import ReviewStore; print('OK')"
   ```

2. Test sederhana review store (sudah disediakan):
   ```bash
   python test_task5_reviews.py
   ```

   Hasilnya akan membuat file reviews.db di direktori utama!

================================================================================
## TASK 6: Review API Behavior Support (src/reviews.py)
================================================================================

**File:** src/reviews.py
**Status:** ✅ Sudah selesai

Perintah untuk cek Task 6:

1. Cek import cepat fungsi API:
   ```bash
   python -c "from src.reviews import _draft_review, _review_snapshots, _review_record, _review_list_item_from_queue, _review_counts; print('OK')"
   ```

Semua fungsi untuk Task 6 sudah ada di src/reviews.py!

================================================================================
## TASK 7: Guardrail Audit (tests/test_narrative_guardrails.py & Makefile)
================================================================================

**File:**
- tests/test_narrative_guardrails.py
- Makefile (target guardrail-audit)
**Status:** ✅ Sudah selesai

Perintah untuk cek Task 7:

1. Jalankan test guardrails:
   ```bash
   python -m pytest tests/test_narrative_guardrails.py -v
   ```

2. Jalankan guardrail audit via Makefile (jika make tersedia):
   ```bash
   make guardrail-audit
   ```

3. Jalankan guardrail audit tanpa Makefile (untuk Windows atau jika make tidak tersedia):
   ```bash
   python -c "from pathlib import Path; blocked=['terbukti fraud','terbukti korupsi','fraud final','legal verdict','confirmed corruption','putusan hukum']; paths=[p for p in Path('.').rglob('*') if p.is_file() and p.suffix in {'.py','.md','.html','.ipynb'} and not any(x in p.parts for x in {'.git','.venv','__pycache__'})]; text='\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in paths).lower(); hits=[b for b in blocked if b in text]; raise SystemExit('Blocked guardrail copy: '+', '.join(hits) if hits else 0)"
   ```

================================================================================
## TASK 8: Quality Tests
================================================================================

**File Test:**
- tests/test_casebook.py
- tests/test_narrative_guardrails.py
- tests/test_reviews.py
- tests/test_no_retraining.py
**Status:** ✅ Sudah selesai

Perintah untuk menjalankan Task 8:

1. Jalankan semua test quality:
   ```bash
   python -m pytest tests/test_casebook.py tests/test_narrative_guardrails.py tests/test_reviews.py tests/test_no_retraining.py -v
   ```

2. Jalankan test per file:
   - Test casebook: `python -m pytest tests/test_casebook.py -v`
   - Test narrative guardrails: `python -m pytest tests/test_narrative_guardrails.py -v`
   - Test reviews: `python -m pytest tests/test_reviews.py -v`
   - Test no retraining: `python -m pytest tests/test_no_retraining.py -v`

================================================================================
## RINGKASAN STATUS SEMUA TASK
================================================================================

- Task 1 (Explainability)         ✅ Sudah selesai
- Task 2 (Narrative)               ✅ Sudah selesai
- Task 3 (Casebook Payload)        ✅ Sudah selesai
- Task 4 (Static HTML Export)      ✅ Sudah selesai
- Task 5 (SQLite Review Store)     ✅ Sudah selesai
- Task 6 (Review API Behavior)     ✅ Sudah selesai
- Task 7 (Guardrail Audit)         ✅ Sudah selesai
- Task 8 (Quality Tests)           ✅ Sudah selesai

================================================================================
## FINAL ACCEPTANCE PERSON 3
================================================================================

Untuk memverifikasi bahwa semua task Person 3 selesai dan berjalan dengan benar, jalankan perintah berikut:

### Langkah 1: Periksa Compile Semua File
```bash
# Karena kamu di folder dbp3, gunakan path ke parent folder
python -m compileall ..\src ..\tests
```
- Memastikan tidak ada error sintaks di file Python di folder src dan tests!

### Langkah 2: Jalankan Semua Test Quality
```bash
# Karena kamu di folder dbp3, gunakan path ke parent folder
python -m pytest ..\tests\test_casebook.py ..\tests\test_narrative_guardrails.py ..\tests\test_reviews.py ..\tests\test_no_retraining.py -v
```
- Menjalankan semua test yang dibutuhkan untuk Task 8!

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
- Membuat `demo_casebook.html` di direktori utama (parent folder)!

### Langkah 4: Jalankan Guardrail Audit
```bash
# Pindah ke parent folder terlebih dahulu
cd ..

# Jika make tersedia (Linux/macOS atau Windows dengan Make):
make guardrail-audit

# Jika make tidak tersedia (Windows tanpa Make):
python -c "from pathlib import Path; blocked=['terbukti fraud','terbukti korupsi','fraud final','legal verdict','confirmed corruption','putusan hukum']; paths=[p for p in Path('.').rglob('*') if p.is_file() and p.suffix in {'.py','.md','.html','.ipynb'} and not any(x in p.parts for x in {'.git','.venv','__pycache__'})]; text='\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in paths).lower(); hits=[b for b in blocked if b in text]; raise SystemExit('Blocked guardrail copy: '+', '.join(hits) if hits else 0)"
```

### Jawaban Pertanyaan Kamu:
1. Apakah langsung saja di terminal kamu?
   → Ya, kamu bisa jalankan langsung di terminal kamu!

2. Tanpa venv juga?
   → Bisa! Tapi direkomendasikan menggunakan venv agar dependency tidak bentrok dengan project lain di komputer kamu! Jika ingin pakai venv, lihat bagian "CARA UMUM SETUP DAN INSTALL DEPENDENCIES" di atas!

================================================================================

