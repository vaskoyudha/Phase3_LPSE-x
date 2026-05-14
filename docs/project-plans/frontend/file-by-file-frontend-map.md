# Frontend File-by-File Map

This map describes the original React/Vite frontend surfaces so project team members can rebuild equivalent behavior without copying frontend implementation into this ML-only repository.

All frontend rebuild commits must use Bahasa Indonesia summaries, for example `feat: tambah panel analytics arsip` or `fix: perbaiki navigasi casebook terpilih`.

## Root frontend files

### `frontend/package.json`

Purpose: define scripts and exact dependency versions.

Expected scripts:

- `dev`
- `build`
- `preview`
- `typecheck`
- `lint`
- `test`

Dependencies should be exact pinned versions, not `latest` or broad `^` ranges.

### `frontend/vite.config.ts`

Purpose: Vite React build/test configuration.

Needs:

- React plugin
- build output to `dist`
- Vitest config with jsdom

### `frontend/tsconfig.json`

Purpose: strict TypeScript checks.

### `frontend/index.html`

Purpose: root document and Vite mount node.

## Source entry

### `src/main.tsx`

Purpose: create React root and render `<App />`.

### `src/App.tsx`

Purpose: top-level route state, boot data loading, navigation, and page selection.

Responsibilities:

- define fallback demo state
- parse location into page route
- handle pushState navigation
- fetch `/api/demo-state`
- fetch `/api/queue?demo=1`
- load selected casebook
- render loading/error safe fallback cards
- render pages through shared `AppShell`

Routes:

- landing
- dashboard tabs
- casebook
- model transparency
- review desk
- utility/not-found

### `src/App.test.tsx`

Purpose: frontend contract and render tests.

Should mock fetch calls for:

- `/api/demo-state`
- `/api/queue`
- `/api/archive`
- `/api/archive/analytics`
- `/api/reviews`
- `/api/casebook`

## API and types

### `src/api/client.ts`

Purpose: typed fetch wrapper.

Functions:

- `demoState`
- `inferenceStatus`
- `queue`
- `dataset`
- `archive`
- `archiveAnalytics`
- `reviews`
- `review`
- `saveReview`
- `casebook`
- `exportUrl`

### `src/types/api.ts`

Purpose: TypeScript mirror of backend Pydantic schemas.

Must include:

- production build status
- inference status
- archive inference status
- demo state
- queue item/response
- dataset/archive browser response
- archive analytics response
- casebook payload
- review records

## Pages

### `src/pages/LandingPage.tsx`

Purpose: first impression and demo entry.

Must show:

- LPSE-X positioning
- offline/single-model status
- model artifact if ready
- guardrail copy
- buttons to command center and casebook

### `src/pages/CommandCenterPage.tsx`

Purpose: main dashboard with tabs and data browsing.

Subsystems:

- dashboard tab matrix with overview/archive/analytics/locations/activity
- filter state and query state
- queue filtering
- archive loading
- archive analytics loading
- selected case state
- sticky right rail behavior
- active region key behavior

### `src/pages/CasebookPage.tsx`

Purpose: detailed selected-case explanation view.

Sections:

- risk/model summary
- SHAP factors
- narrative
- reviewer checklist/questions
- provenance
- export/review actions

### `src/pages/ModelTransparencyPage.tsx`

Purpose: explain model method and selected-case prediction.

Must display:

- XGBoost single-model artifact
- SHAP/contribution method
- low/medium/high probabilities
- top drivers
- offline/no-cloud badges
- human-review guardrail

### `src/pages/ReviewDeskPage.tsx`

Purpose: operator review queue and saved review management.

Must support:

- status/search filters
- review list/drafts
- review drawer
- save status/notes/signoff

### `src/pages/UtilityPages.tsx`

Purpose: reports/settings/help/not-found utility views.

Should not be placeholder slop; show useful next actions and safe copy.

## App shell components

### `src/components/app/AppShell.tsx`

Purpose: shared layout.

Responsibilities:

- topbar/navigation
- active route highlighting
- filter/panel action buttons
- consistent app frame

## Dashboard components

### `FilterRail.tsx`

Filter controls for search, risk, buyer, supplier, topN, archive split/sort/region when needed.

### `KpiCards.tsx`

Shows counts/KPIs from queue/archive response.

### `RiskDistributionChart.tsx`

Displays risk label distribution.

### `RiskTrendChart.tsx`

Displays small trend buckets or monthly trend.

### `RiskQueueTable.tsx`

Bounded Top-N review queue. Must clearly show rank, label, probability, buyer, supplier, and selected state.

### `SelectedCasePreview.tsx`

Selected row preview with CTA to casebook.

### `InferenceStatusCard.tsx`

Shows model artifact, backend, rows scored/displayed, latency, no-cloud/no-scraping/no-retraining.

### `ScoredDatasetExplorer.tsx`

Paginated table for archive/dataset. Must never assume all rows are client-side.

### `ArchiveAnalyticsPanel.tsx`

Risk mix, trend, concentration, priority point/map analytics.

### `LokasiMap.tsx`

Offline region map with clickable region key filters.

### `NusantaraAtlasCarousel.tsx` and `OverviewAtlasCarousel.tsx`

Visual geographic summaries/carousels.

## Casebook components

### `ShapFactorBars.tsx`

Signed bar visualization for top factors.

### `RiskSummaryCard.tsx`

Model output summary with safe copy.

### `RiskStoryRail.tsx`

Narrative/provenance/reviewer guidance.

### `CasebookHubCard.tsx`

Reusable callout to open casebook.

### `CasebookFlowLines.tsx`

Decorative flow visual, should not distract from audit content.

## Review components

### `ReviewDrawer.tsx`

Drawer for viewing/saving review details. Uses review API and must distinguish model recommendation from human decision.

## Shared components

### `StatusChip.tsx`, `RiskChip.tsx`, `ScoreRing.tsx`

Small status/risk/probability visual primitives.

### `GuardrailBanner.tsx`

Central safety copy banner.

### `ProvenanceDrawer.tsx`

Shows model/data/split provenance.

### `OfflineReadinessPanel.tsx`

Shows no-cloud/no-scraping/no-retraining readiness.

### `SafePresenterOverlay.tsx`

Presenter-safe overlay for demo mode.

### `BrandMark.tsx`, `AppTopbar.tsx`, `ActionButton.tsx`

Brand/navigation/action primitives.

## Styles and assets

### `src/styles/tokens.css`

Design tokens:

- dark background
- cream text
- muted text
- amber, red, green risk accents
- line/card surfaces
- radius/shadow tokens

### `src/assets/brand/lpse-x-owl-logo.png`

Brand mark asset.

### `src/assets/maps/indonesia-kabupaten-kota.geojson`

Offline kabupaten/kota map used by location analytics.

### `src/assets/maps/ATTRIBUTION.md`

Map data attribution.

## Verification

Run:

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Then run backend static serving tests to prove `frontend/dist` is served.
