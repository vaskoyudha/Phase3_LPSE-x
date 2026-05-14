# Frontend Rebuild Plan

> **Implementation note:** Use task-by-task implementation if implementing this plan in a separate full-product repository. This model-only repo does not include frontend source code; this document describes how to recreate it.

**Goal:** Recreate the LPSE-X React/Vite command center that consumes the FastAPI contracts, presents offline-local model inference, browses scored tender data, opens selected casebooks, and preserves judge-safe risk-triage language.

**Architecture:** A Vite React single-page app served by FastAPI static routes. The app fetches `/api/demo-state` and `/api/queue` on boot, stores selected case state in URL/query state, and uses typed API clients plus modular pages/components.

**Tech stack:** React, TypeScript, Vite, CSS tokens, Phosphor Icons, Vitest/Testing Library, ESLint.

**Commit rule:** Commit summaries must be in Bahasa Indonesia, for example `feat: tambah halaman arsip tender` or `test: validasi copy guardrail frontend`.

---

## Top-level frontend structure

```text
frontend/
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── eslint.config.js
├── index.html
├── public/favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── App.test.tsx
    ├── api/client.ts
    ├── types/api.ts
    ├── styles/tokens.css
    ├── pages/
    ├── components/
    └── assets/
```

## Visual design requirements

- Avoid generic dashboard aesthetics.
- Use a distinctive dark command-center style with warm cream text, amber/risk accents, green safe-state accents, and card/rail composition.
- Keep the UI serious and audit-friendly, not flashy.
- Bahasa Indonesia product copy should be clear and operator-oriented.
- Repeated safety copy must be visible: *triase risiko*, *prioritas review*, *bukan tuduhan pelanggaran*.

## Routing behavior

Implement route parsing in `App.tsx`:

- `/` or `/home` -> landing
- `/dashboard`, `/dashboard/overview`, `?demo=1` -> command center overview
- `/dashboard/archive` -> archive browser
- `/dashboard/analytics` -> archive analytics
- `/dashboard/locations` -> location/map view
- `/dashboard/activity` -> system activity/status
- `/casebook/{case_id}` -> selected casebook page
- `/model-transparency` -> transparency page
- `/reviews` or `/review-desk` -> review desk
- `/reports`, `/settings`, `/help` -> utility pages

Use `window.history.pushState` and `popstate` to navigate without React Router dependency if recreating the original lightweight approach.

## Boot sequence

1. Render fallback demo state with offline guardrail.
2. Fetch `api.demoState()` from `/api/demo-state`.
3. Fetch `api.queue({ demo: 1 })` from `/api/queue?demo=1`.
4. Select `demo_case_id` if present, otherwise first queue item.
5. When opening casebook, fetch `/api/casebook/{case_id}` and navigate to `/casebook/{case_id}?demo=1`.
6. On errors, show a safe local fallback card with retry.

## API client

Create `src/api/client.ts` with small typed helpers:

- `getJson<T>(url)`
- `putJson<T>(url, payload)`
- `api.demoState()`
- `api.inferenceStatus()`
- `api.queue(params)`
- `api.dataset(params)`
- `api.archive(params)`
- `api.archiveAnalytics(params)`
- `api.reviews(params)`
- `api.review(caseId)`
- `api.saveReview(caseId, payload)`
- `api.casebook(caseId)`
- `api.exportUrl(caseId)`

## Type contracts

Create `src/types/api.ts` matching backend contracts:

- `InferenceStatus`
- `ArchiveInferenceStatus`
- `DemoState`
- `QueueItem`
- `QueueResponse`
- `DatasetBrowserResponse`
- `ArchiveBrowserResponse`
- `ArchiveAnalyticsResponse`
- `CasebookPayload`
- `ReviewRecord`
- `ReviewUpdateRequest`
- `ReviewListResponse`

Do not use `any` for API payloads except temporary unknown JSON helpers.

## Pages

### `LandingPage.tsx`

Responsibilities:

- introduce LPSE-X as offline procurement risk triage
- show model artifact and offline status from demo state
- CTA to Command Center
- CTA to Casebook when `demo_case_id` exists
- safety copy and no-cloud/no-retraining badges

### `CommandCenterPage.tsx`

Responsibilities:

- render dashboard tabs: overview, archive, analytics, locations, activity
- hold filter state: search, risk, buyer, supplier, topN
- sync query params: page, split, sort, region_key
- render KPI cards, risk charts, queue table, selected case preview, inference status
- fetch paginated archive and archive analytics
- bound all browser payloads to API page limits
- make selected queue/archive row open casebook

### `CasebookPage.tsx`

Responsibilities:

- render selected case report from `CasebookPayload`
- show model output, probabilities, top factors, narrative, provenance, reviewer questions
- expose export HTML link
- optionally open review drawer when `?review=1`

### `ModelTransparencyPage.tsx`

Responsibilities:

- fetch demo state and selected demo casebook if not injected
- show XGBoost + SHAP/contribution explanation
- show probability triplet low/medium/high
- show top risk drivers and guardrails

### `ReviewDeskPage.tsx`

Responsibilities:

- list review records/drafts from `/api/reviews`
- filter by status/search
- open selected case/review drawer
- save review notes/status using PUT endpoint

### `UtilityPages.tsx`

Responsibilities:

- show reports/settings/help/not-found placeholders that are not generic
- direct users back to dashboard/casebook
- keep guardrail copy visible

## Components

### App shell

`components/app/AppShell.tsx`:

- shared topbar/sidebar
- route navigation
- panel actions for filter, inference, selected use case
- responsive layout

### Dashboard components

- `FilterRail.tsx`: search/risk/buyer/supplier/topN controls
- `KpiCards.tsx`: total, high risk, medium risk, low risk, review counts
- `RiskDistributionChart.tsx`: risk label distribution
- `RiskTrendChart.tsx`: compact trend line/buckets
- `RiskQueueTable.tsx`: bounded Top-N queue
- `SelectedCasePreview.tsx`: selected row detail + open casebook CTA
- `InferenceStatusCard.tsx`: model artifact, rows scored/displayed, latency, no-cloud flags
- `ScoredDatasetExplorer.tsx`: paginated archive/dataset table
- `ArchiveAnalyticsPanel.tsx`: risk mix, trend, concentration, priority map
- `LokasiMap.tsx`: offline Indonesia region map with `region_key` filtering
- `NusantaraAtlasCarousel.tsx`: region-focused carousel/overview

### Casebook components

- `ShapFactorBars.tsx`: signed contribution bars
- `RiskSummaryCard.tsx`: case risk summary
- `RiskStoryRail.tsx`: narrative/provenance rail
- `CasebookHubCard.tsx`: landing/dashboard link card
- `CasebookFlowLines.tsx`: visual flow lines if needed

### Shared components

- `StatusChip.tsx`
- `RiskChip.tsx`
- `ScoreRing.tsx`
- `GuardrailBanner.tsx`
- `ProvenanceDrawer.tsx`
- `OfflineReadinessPanel.tsx`
- `SafePresenterOverlay.tsx`
- `BrandMark.tsx`
- `AppTopbar.tsx`
- `ActionButton.tsx`

## Testing plan

### Unit/render tests

Use Vitest + Testing Library.

Test these behaviors:

- App fetches `/api/demo-state` and `/api/queue` on boot.
- Dashboard renders guardrail copy.
- Queue rows are visible and selectable.
- Opening casebook calls `/api/casebook/{case_id}`.
- Archive endpoint is called with page/split/sort filters.
- Reviews endpoint is called and save review uses PUT.
- Model Transparency displays XGBoost/SHAP/offline/no-cloud copy.

### Contract tests

Mock fetch responses that match `src/types/api.ts`. Tests should fail if required fields disappear.

### Build verification

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: `frontend/dist` created and can be served by FastAPI.

## Acceptance criteria

- UI is usable from `http://127.0.0.1:8000/?demo=1` after backend serves dist.
- No full dataset dump in frontend memory; archive/dataset browsing is paginated.
- All model claims are framed as triage/review priority.
- Selected casebook is specific to the selected row, not a static generic report.
- Build output works through FastAPI SPA fallback.
