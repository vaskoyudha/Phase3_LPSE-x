# Phase3_LPSE-x

These plans are written for project team members that need to recreate the original LPSE-X product behavior from the existing model/inference package.

The goal is **structured product reconstruction**: start from the working repository behavior, describe the intended architecture and file contracts clearly, then let separate team members rebuild equivalent backend and frontend implementations.

## Read order

1. `00-target-folder-structure.md`
2. `backend/00-backend-rebuild-overview.md`
3. `backend/backend-file-implementation-guide.md`
4. `backend/person-1-data-model-training.md`
5. `backend/person-2-api-runtime.md`
6. `backend/person-3-explainability-review-quality.md`
7. `backend/integration-contracts.md`
8. `backend/file-by-file-backend-map.md`
9. `frontend/00-frontend-rebuild-plan.md`
10. `frontend/api-contracts-consumed.md`
11. `frontend/file-by-file-frontend-map.md`

## Team split

Backend is intentionally split across three people/team members:

- **Backend Person 1: Data, model, features, labels, artifacts**
- **Backend Person 2: API, caching, pagination, archive analytics**
- **Backend Person 3: explainability, review workflow, guardrails, quality/tests**

Frontend is one coordinated rebuild plan because the UI depends heavily on shared routes, API response types, and visual language.

## Shared non-negotiables

- Runtime demo must stay offline-local.
- No scraping, no retraining, no cloud call in product inference.
- Held-out inference proof must use `test_data` only.
- Archive browsing may include `train_data + test_data`, but must label every row by split and scope.
- Copy must say *triase risiko*, *prioritas review*, and *bukan tuduhan pelanggaran*.
- Backend and frontend team members must agree on the API contracts in `backend/integration-contracts.md` and `frontend/api-contracts-consumed.md`.
- All implementation commits must use Bahasa Indonesia commit summaries without mentioning the executor, for example `feat: tambah endpoint status inferensi lokal` or `docs: perluas panduan backend untuk tim`.
