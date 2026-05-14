# Frontend API Contracts Consumed

This file is the frontend-facing version of `backend/integration-contracts.md`.

All commits that modify consumed API contracts must use Bahasa Indonesia summaries, for example `docs: jelaskan kontrak API yang dipakai frontend`.

## Client functions

Implement `src/api/client.ts` like this conceptually:

```ts
export const api = {
  demoState: () => getJson<DemoState>('/api/demo-state'),
  inferenceStatus: () => getJson<InferenceStatus>('/api/inference-status'),
  queue: (params = new URLSearchParams()) => getJson<QueueResponse>(`/api/queue${query(params)}`),
  dataset: (params = new URLSearchParams()) => getJson<DatasetBrowserResponse>(`/api/dataset${query(params)}`),
  archive: (params = new URLSearchParams()) => getJson<ArchiveBrowserResponse>(`/api/archive${query(params)}`),
  archiveAnalytics: (params = new URLSearchParams()) => getJson<ArchiveAnalyticsResponse>(`/api/archive/analytics${query(params)}`),
  reviews: (params = new URLSearchParams()) => getJson<ReviewListResponse>(`/api/reviews${query(params)}`),
  review: (caseId: string) => getJson<ReviewRecord>(`/api/reviews/${encodeURIComponent(caseId)}`),
  saveReview: (caseId: string, payload: ReviewUpdateRequest) => putJson<ReviewRecord>(`/api/reviews/${encodeURIComponent(caseId)}`, payload),
  casebook: (caseId: string) => getJson<CasebookPayload>(`/api/casebook/${encodeURIComponent(caseId)}`),
  exportUrl: (caseId: string) => `/api/casebook/${encodeURIComponent(caseId)}/export.html`,
}
```

## Boot calls

On app mount:

1. `GET /api/demo-state`
2. `GET /api/queue?demo=1`

If either fails, render safe fallback copy.

## Dashboard calls

### Overview tab

Uses initial queue response:

- `summary`
- `distribution`
- `trend`
- `items`
- `inference_status`
- `demo_case_id`

### Archive tab

Call:

```text
GET /api/archive?page={page}&page_size=100&risk={risk}&split={split}&search={search}&buyer={buyer}&supplier={supplier}&region_key={region_key}&sort={sort}
```

Use:

- `total_rows`
- `matched_count`
- `page`
- `page_size`
- `total_pages`
- `heldout_rows`
- `train_rows`
- `risk_distribution`
- `split_distribution`
- `items`
- `inference_status`
- `display_note`
- `guardrail`

### Analytics tab

Call:

```text
GET /api/archive/analytics?risk={risk}&split={split}&search={search}&buyer={buyer}&supplier={supplier}&region_key={region_key}&sort={sort}
```

Use bounded aggregates for charts/maps. Do not expect raw full archive rows.

### Locations tab

Uses archive analytics `region_map` and `region_key` query state. Selecting a region should update URL and trigger archive/analytics reloads.

### Activity tab

Uses existing demo state, inference status, archive status, filter state, and safe copy.

## Casebook calls

When user selects a row and opens casebook:

```text
GET /api/casebook/{case_id}
```

Use payload sections:

- `package`
- `model_output`
- `factors`
- `explanation_brief`
- `narrative`
- `reviewer_questions`
- `provenance`
- `guardrail`

Export link:

```text
/api/casebook/{case_id}/export.html
```

## Review calls

Review desk list:

```text
GET /api/reviews?status={status}&search={search}&top_n=50
```

Review detail/draft:

```text
GET /api/reviews/{case_id}
```

Save review:

```text
PUT /api/reviews/{case_id}
Content-Type: application/json
```

Payload:

```json
{
  "status": "Ditandai Risiko",
  "reviewer_name": "Vasco Yudha",
  "notes": "Perlu verifikasi dokumen pendukung.",
  "decision_summary": "Eskalasi untuk review manual.",
  "signed_off": true
}
```

## Frontend state rules

- `selectedId` is a case id from queue/archive/casebook route.
- Query filters must be URL-shareable: risk, buyer, supplier, search, split, sort, page, region_key.
- Loading states must never imply cloud processing; use local/offline wording.
- Error states must show guardrail copy.

## Field safety rules

Display `eval_claim_scope` when rendering archive rows:

- `heldout_test_only`: can be described as held-out inference proof.
- `archive_browsing_only`: can be described as local archive browsing, not evaluation proof.

Do not render high-risk label as guilt, fraud, corruption, or final legal decision.
