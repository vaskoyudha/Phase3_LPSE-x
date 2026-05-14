# Backend Person 3 Plan: Explainability, Review Workflow, Guardrails, Quality

> **Implementation note:** Use task-by-task implementation. Dispatch this file as the full context for Backend Person 3 / Team Member 3.

**Goal:** Own the human-facing trust layer: casebook payloads, SHAP/contribution explanations, narrative generation, static HTML export, review workflow, guardrail copy, and quality tests.

**Architecture:** Person 3 consumes Person 1 prediction outputs and provides explanation/review primitives to Person 2 API routes. They ensure every output is understandable, reviewer-actionable, and safe from overclaiming.

**Tech stack:** pandas, numpy, XGBoost contribution values, HTML rendering, SQLite, pytest.

**Shared guide:** Read `backend-file-implementation-guide.md` before implementing; it explains the selected-case casebook flow, review store contract, guardrail copy, and tests expected by API integration.

**Commit rule:** Commit summaries must be in Bahasa Indonesia, for example `feat: tambah workflow review manusia` or `test: pastikan narasi tidak menjadi tuduhan`.

---

## Owned files

```text
src/explain.py
src/narrative.py
src/casebook.py
src/reviews.py
tests/test_casebook.py
tests/test_narrative_guardrails.py
tests/test_reviews.py
tests/test_no_retraining.py
DEMO_SCRIPT.md
demo_casebook.html
```

## Task 1: Contribution/explainability utilities

**Objective:** Turn model predictions into top factor explanations.

**File:** `src/explain.py`

**Core functions/classes:**

- `load_model`
- `XGBoostContributionExplainer`
- `get_explainer`
- `explain_single`
- `explain_batch`
- `compute_shap_values`
- `generate_shap_summary`
- counterfactual helpers where available

**Implementation rules:**

- Use model contribution values or SHAP-compatible approach.
- Align feature names before explanation.
- Include positive and negative factors.
- Explanations are model reasons, not legal evidence.

## Task 2: Human-readable narrative module

**Objective:** Convert raw feature factors into Bahasa Indonesia reviewer copy.

**File:** `src/narrative.py`

**Core functions:**

- `_feature_label`
- `_factor_title`
- `_factor_reason`
- `_factor_review_check`
- `_impact_label`
- `_confidence_label`
- `derive_business_rating`
- `render_factor_sentence`
- `build_explanation_brief`
- `render_explanation_narrative`

**Required copy behavior:**

- Must contain: `triase risiko`, `prioritas review`, `bukan tuduhan pelanggaran`.
- Must not say: confirmed wrongdoing/corruption, final legal conclusion, final proof, or equivalent.
- Avoid repetitive technical copy such as raw `kontribusi SHAP sekitar` in the main narrative.
- Translate feature names into reviewer language:
  - `f_tender_value_log` -> nilai tender relatif besar
  - `f_price_deviation_ratio` -> deviasi harga terhadap estimasi
  - `f_buyer_supplier_repeat_count` -> riwayat buyer-supplier berulang
  - `f_supplier_recent_90d_award_count` -> aktivitas award supplier dalam 90 hari terakhir

## Task 3: Casebook payload builder

**Objective:** Build a selected-case payload consumed by API, frontend, and static export.

**File:** `src/casebook.py`

**Core functions:**

- `_extract_class_contrib`
- `_fallback_factors`
- `explain_case`
- `_safe_narrative`
- `build_casebook`
- `render_static_casebook_html`
- `generate_demo_casebook`

**Payload sections:**

- `case_id`
- package/tender display metadata
- `model_output` with predicted label, probability, class probabilities
- `factors` with feature, label, value, SHAP/contribution value, direction
- `explanation_brief`
- narrative
- reviewer questions
- provenance: model artifact, feature source, raw source, inference mode, split usage
- guardrail badges

**Rules:**

- If native contribution extraction fails, use a deterministic fallback over feature values.
- Casebook must be selected-case specific.
- Split usage must say test split is for inference/review, not training or tuning.

## Task 4: Static HTML casebook export

**Objective:** Provide a no-frontend fallback report.

**File:** `src/casebook.py`

**Implement:**

- `render_static_casebook_html(payload, output_path)`
- styled HTML with sections:
  - report header
  - model output summary
  - data source/provenance
  - top factors
  - narrative and reviewer checklist
  - guardrail/safety statement

**Verification:**

```bash
PYTHONPATH=. python -m src.casebook
```

Expected: writes or refreshes `demo_casebook.html`.

## Task 5: SQLite review store

**Objective:** Let reviewers save status, notes, decisions, and signoff without changing model output.

**File:** `src/reviews.py`

**Core concepts:**

- `REVIEW_STATUSES`, for example:
  - `Perlu Review`
  - `Ditandai Risiko`
  - `Butuh Dokumen`
  - `Selesai`
- `ReviewStore` using SQLite
- one row per `case_id`
- event history appended on each upsert
- `signed_off_at` set when signed off or completed

**Methods:**

- `get_review(case_id)`
- `list_reviews()`
- `upsert_review(case_id, status, reviewer_name, notes, decision_summary, signed_off, package_snapshot, model_snapshot, prefill)`

**Rules:**

- Store human decisions separately from model predictions.
- Do not mutate model/data artifacts.
- Default unsaved state is a draft generated from casebook payload.

## Task 6: Review API behavior support

Person 2 exposes endpoints, but Person 3 defines logic for:

- `_draft_review(case_id)`
- `_review_snapshots(casebook_payload)`
- `_review_record(payload)`
- `_review_list_item_from_queue(row)`
- `_review_counts(items)`

Expected behavior:

- `GET /api/reviews/{case_id}` returns prefilled draft if no saved record exists.
- `PUT /api/reviews/{case_id}` stores human notes and appends history.
- Status validation rejects unknown statuses.

## Task 7: Guardrail audit

**Objective:** Make unsafe claims impossible to miss.

**Files:**

- `tests/test_narrative_guardrails.py`
- `Makefile` target `guardrail-audit`

**Blocked phrase semantics:**

Do not write phrases that claim the model has already proven fraud/corruption, issued a final court-style conclusion, or produced final proof. Keep exact blocked-word lists inside automated tests/audit scripts only so documentation does not accidentally trip the guardrail audit.

**Required phrases:**

- `triase risiko`
- `prioritas review`
- `bukan tuduhan pelanggaran`

## Task 8: Quality tests

**Tests to implement:**

- `tests/test_casebook.py`
  - casebook contains static fallback contract
  - static HTML generated from payload
  - payload includes guardrail and reviewer checklist
- `tests/test_narrative_guardrails.py`
  - narratives include required safe copy
  - narratives avoid prohibited copy
  - docs/static casebook avoid prohibited claims
- `tests/test_reviews.py`
  - draft review returned for unsaved selected case
  - upsert saves human signoff and appends history
  - unknown status rejected
- `tests/test_no_retraining.py`
  - runtime explanation/review surfaces do not train, scrape, or export artifacts

## Final acceptance for Person 3

Run:

```bash
python -m compileall src tests
pytest tests/test_casebook.py tests/test_narrative_guardrails.py tests/test_reviews.py tests/test_no_retraining.py
PYTHONPATH=. python -m src.casebook
make guardrail-audit
```

Pass criteria:

- casebook payload is selected-case specific
- static casebook HTML renders and includes guardrails
- review workflow persists human notes without mutating model output
- no unsafe accusation/final-judgment copy appears
