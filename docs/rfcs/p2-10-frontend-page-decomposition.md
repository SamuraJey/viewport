# RFC: Frontend Page Decomposition — P2-10

**Status**: Draft — ready for team review
**Date**: 2026-07-07
**Author**: Improvement pass

## Problem

Seven components exceed 1000 lines, violating AGENTS.md's rule: "Keep pages as
orchestration layers and prefer route-level lazy loading in `App.tsx`." Each
blends data-fetching, state management, and dense JSX into one file — harder to
test, harder to review, harder to tree-shake.

| File | Lines | Decomposed? |
|---|---|---|
| `pages/ShareLinkDetailPage.tsx` | 1876 | No |
| `pages/ShareLinksDashboardPage.tsx` | 1802 | No |
| `pages/GalleryPage.tsx` | 1293 | Partial (9 sub-components already in `gallery/`) |
| `pages/ProjectPage.tsx` | 1273 | No |
| `pages/PublicGalleryPage.tsx` | 1268 | Partial (uses `public-gallery/` components) |
| `components/share-links/ShareLinkSettingsModal.tsx` | 1021 | No |
| `components/gallery-appearance/GalleryAppearanceSection.tsx` | 1000 | No |

Total: ~9533 lines across 7 files. All of them carry real test coverage
(frontend test suite: 63 files, 418 tests, all passing), so decomposition
**must** preserve snapshot + behavior tests or update them only when the
visible output is unchanged.

## Strategy

**One file per PR.** Each page decomposes independently; they share no
internal state. Each PR follows the same recipe:

1. Extract pure helpers/functions/constants into a `components/<feature>/`
   sibling folder (pure refactor, no behavior change).
2. Extract JSX sections (tab panels, panels, widgets) into presentation
   components under the same folder.
3. Keep the page file as an orchestration shell: data-fetching (`useEffect`),
   state (`useState`/`useReducer`), routing (`useParams`/`useNavigate`), and
   wire-up — passes props down to the new sub-components.
4. **Target**: each page ≤ 400 lines; each sub-component ≤ 250 lines.
5. After each extract: `npm run lint && npm run test:run`. Update snapshots
   only when the visual output is confirmed unchanged via screenshot diff.

## Order (highest value / lowest risk first)

1. **ShareLinkSettingsModal** — modal with 3 tab panels; no page routing;
   easiest to decompose and highest reuse (used by both GalleryPage and
   ProjectPage).
2. **ShareLinkDetailPage** — 3 tab panels (Overview, Analytics, Selection);
   each panel is a self-contained vertical slice with its own data.
3. **ShareLinksDashboardPage** — summary header, filters bar, table, bulk
   actions; already has internal sub-components (`DashboardMetricCard`,
   `MiniSparkline`, `ShareLinkPreview`) — extract the remaining JSX sections.
4. **GalleryAppearanceSection** — cover picker, color scheme, spacing,
   preview; self-contained form with autosave.
5. **ProjectPage** — project metadata, gallery list, share links panel;
   galleries already have their own `GalleryPage`.
6. **GalleryPage** — already has 9 sub-components; remaining work is
   extracting search/filter controls and upload orchestration into dedicated
   sub-components.
7. **PublicGalleryPage** — already uses `public-gallery/` components; remaining
   work is extracting selection-flow panels.

## Per-file decomposition maps

### 1. ShareLinkSettingsModal.tsx (1021 lines → target ~200)

**Existing symbols (20):** `ShareLinkSettingsMode`, `TtlPreset`,
`SettingsTabId`, `PasswordMode`, `EditableShareLink`,
`SelectionSettingsDraft`, `ShareLinkSettingsModalProps`, `TTL_OPTIONS`,
`SETTINGS_TABS`, `DEFAULT_SELECTION_DRAFT`, `parseSelectionLimit`,
`addHoursIso`, `resolvePresetExpiry`, `formatExpirySummary`,
`isDefaultSelectionDraft`, `ShareLinkSettingsModal`.

**Extract to `components/share-links/ShareLinkSettingsModal/`:**

| New file | Content | ~Lines |
|---|---|---|
| `constants.ts` | `TTL_OPTIONS`, `SETTINGS_TABS`, `DEFAULT_SELECTION_DRAFT`, `SETTINGS_SWITCH_CLASS`, `SHARE_LINK_PASSWORD_MAX_BYTES` | 30 |
| `utils.ts` | `parseSelectionLimit`, `addHoursIso`, `resolvePresetExpiry`, `formatExpirySummary`, `isDefaultSelectionDraft` | 60 |
| `types.ts` | `ShareLinkSettingsMode`, `TtlPreset`, `SettingsTabId`, `PasswordMode`, `EditableShareLink`, `SelectionSettingsDraft`, `ShareLinkSettingsModalProps` | 50 |
| `LinkTab.tsx` | Label, scope type, password, expiry — the "Link" tab panel JSX | 150 |
| `AccessTab.tsx` | Password section, expiry presets — the "Access" tab panel JSX | 150 |
| `SelectionTab.tsx` | Enable toggle, limit, required fields — the "Selection" tab panel JSX | 200 |
| `index.tsx` | `ShareLinkSettingsModal` — orchestration: tab state, form state, onSubmit, renders `AppTabs` + the three tab panels | 200 |

**Test impact**: `ShareLinkSettingsModal.test.tsx` — the modal itself stays the
tested unit; internal tab extracts are tested indirectly. If tab-panel props
change shape, update the test's `await screen.findByRole(...)` queries. No new
test files needed.

### 2. ShareLinkDetailPage.tsx (1876 lines → target ~350)

**Existing symbols (22):** `numberFormatter`, `DAY_PRESETS`,
`LinkHealthCard`, `LinkMetaItem`, `SelectionMetricCard`,
`SessionStatusBadge`, `selectionStatusLabel`, `selectionStatusClasses`,
`parseIsoDayAsLocalDate`, `formatDay`, `formatDateTime`,
`formatRelativeDateLabel`, `HealthTone`, `LinkHealthCardProps`,
`LinkMetaItemProps`, `SelectionMetricCardProps`, `resetScrollForBreadcrumbNavigation`,
`ShareLinkDetailPage`.

**Extract to `components/share-link-detail/`:**

| New file | Content | ~Lines |
|---|---|---|
| `utils.ts` | `parseIsoDayAsLocalDate`, `formatDay`, `formatDateTime`, `formatRelativeDateLabel`, `numberFormatter`, `selectionStatusLabel`, `selectionStatusClasses`, `resetScrollForBreadcrumbNavigation` | 80 |
| `constants.ts` | `DAY_PRESETS` | 10 |
| `LinkHealthCard.tsx` | Already a sub-component — move out (stays same) | 40 |
| `LinkMetaItem.tsx` | Already a sub-component — move out | 25 |
| `SelectionMetricCard.tsx` | Already a sub-component — move out | 55 |
| `SessionStatusBadge.tsx` | Already a sub-component — move out | 30 |
| `OverviewTab.tsx` | Link health cards, metadata grid, quick actions | 250 |
| `AnalyticsTab.tsx` | Time-range selector, trend chart, daily-stats table, download metrics | 400 |
| `SelectionTab.tsx` | Session list, bulk actions, selection summary cards | 350 |
| `index.tsx` | `ShareLinkDetailPage` — fetch data, tab state, renders `AppTabs` + three tab panels | 350 |

**Test impact**: `ShareLinkDetailPage.test.tsx` — tests drive through the page
via `render(<ShareLinkDetailPage />)`. Extracts don't change the rendered DOM
structure, so `getByRole`/`getByText` queries keep working. If a test asserts
on a moved utility function directly, move the test with it.

### 3. ShareLinksDashboardPage.tsx (1802 lines → target ~300)

**Existing symbols (43):** `numberFormatter`, `SEARCH_DEBOUNCE_MS`,
`EMPTY_SUMMARY`, `parseDateLabelValue`, `formatDateLabel`,
`formatRelativeDateLabel`, `formatSelectionStatusLabel`, `StatusFilter`,
`STATUS_FILTERS`, `compactFormatter`, `PREVIEW_STYLES`, `getShareLinkSource`,
`getShareLinkTitle`, `getLatestActivityDate`, `getPublicLinkLabel`,
`getTotalDownloads`, `getCurrentPageGalleryIds`, `getClosableSessionCount`,
`getClosableSelectionLinks`, `getReopenableSessionCount`,
`getReopenableSelectionLinks`, `getClosableSessionTotal`,
`getReopenableSessionTotal`, `getInsightLinkLabel`,
`resetScrollForBreadcrumbNavigation`, `buildFallbackTrendValues`,
`DashboardMetricCard`, `MiniSparkline`, `ShareLinkPreview`, `QuickInsightRow`,
`ShareLinksDashboardPage`.

**Extract to `components/share-links-dashboard/`:**

| New file | Content | ~Lines |
|---|---|---|
| `constants.ts` | `SEARCH_DEBOUNCE_MS`, `EMPTY_SUMMARY`, `STATUS_FILTERS`, `PREVIEW_STYLES` | 30 |
| `utils.ts` | `parseDateLabelValue`, `formatDateLabel`, `formatRelativeDateLabel`, `formatSelectionStatusLabel`, `compactFormatter`, `numberFormatter`, `getShareLinkSource`, `getShareLinkTitle`, `getLatestActivityDate`, `getPublicLinkLabel`, `getTotalDownloads`, `getCurrentPageGalleryIds`, getClosable/reopenable helpers, `buildFallbackTrendValues`, `resetScrollForBreadcrumbNavigation` | 180 |
| `types.ts` | `StatusFilter`, `MetricTone`, `SummaryMetric`, `DashboardMetricCardProps`, `ShareLinkPreviewProps` | 50 |
| `DashboardMetricCard.tsx` | Already defined in-file — move out + `MiniSparkline` | 90 |
| `ShareLinkPreview.tsx` | Already defined in-file — move out | 60 |
| `QuickInsightRow.tsx` | Already defined in-file — move out | 40 |
| `DashboardSummaryHeader.tsx` | The 4 metric cards at the top | 80 |
| `DashboardFilters.tsx` | Search input + status filter chips | 70 |
| `DashboardTable.tsx` | The main links table (pagination, rows, expandable selection info) | 400 |
| `DashboardBulkActions.tsx` | Close-all / reopen-all selection bulk-action bar | 100 |
| `index.tsx` | `ShareLinksDashboardPage` — fetch, state, pagination, wire-up | 300 |

**Test impact**: `ShareLinksDashboardPage.test.tsx` — same pattern; extracts
don't change DOM structure. The bulk-action tests may need to update selectors
if `DashboardBulkActions` changes its DOM shape.

### 4. GalleryAppearanceSection.tsx (1000 lines → target ~200)

**Existing symbols (11):** `SaveStatus`, `SAVE_STATUS_LABELS`,
`AUTOSAVE_DEBOUNCE_MS`, `MAX_PREVIEW_PHOTOS`,
`COVER_PICKER_PAGE_SIZE`, `formatPublicGalleryDate`, `AppearanceDraft`,
`GalleryAppearanceSectionProps`, `clampFocal`, `DISPLAY_OPTION_CONFIG`,
`GalleryAppearanceSection`.

**Extract to `components/gallery-appearance/GalleryAppearanceSection/`:**

| New file | Content | ~Lines |
|---|---|---|
| `constants.ts` | `SAVE_STATUS_LABELS`, `AUTOSAVE_DEBOUNCE_MS`, `MAX_PREVIEW_PHOTOS`, `COVER_PICKER_PAGE_SIZE`, `DISPLAY_OPTION_CONFIG`, `SaveStatus`, `AppearanceDraft`, `GalleryAppearanceSectionProps` | 80 |
| `utils.ts` | `formatPublicGalleryDate`, `clampFocal` | 25 |
| `CoverPicker.tsx` | Cover photo selector grid + pagination + "no cover" option | 250 |
| `ColorSchemePicker.tsx` | Light/dark toggle with live preview thumbnail | 120 |
| `SpacingPicker.tsx` | Photo-spacing selector (compact/medium/loose) | 80 |
| `PreviewPanel.tsx` | Desktop + mobile preview thumbnails using shared public-gallery preview rendering | 150 |
| `index.tsx` | `GalleryAppearanceSection` — draft state, autosave debounce, renders the four pickers + preview | 200 |

**Test impact**: `GalleryAppearanceSection.test.tsx` — the component stays the
test target; internal extracts tested through it.

### 5. ProjectPage.tsx (1273 lines → target ~250)

**Existing symbols (13):** `GalleryDraft`, `toDateInputValue`,
`buildGalleryDraft`, `containerVariants`, `cardVariants`,
`toProjectGalleryCard`, `VISIBILITY_ACTION_BUTTON_CLASS`,
`ProjectGuidanceItem`, `ProjectGuidanceItemProps`, `ProjectPage`.

**Extract to `components/project-page/`:**

| New file | Content | ~Lines |
|---|---|---|
| `constants.ts` | `VISIBILITY_ACTION_BUTTON_CLASS`, `containerVariants`, `cardVariants` | 30 |
| `utils.ts` | `toDateInputValue`, `buildGalleryDraft`, `toProjectGalleryCard` | 40 |
| `types.ts` | `GalleryDraft` | 15 |
| `ProjectGuidanceItem.tsx` | Already defined in-file — move out | 30 |
| `ProjectMetadataPanel.tsx` | Name, shooting date, description form | 150 |
| `GalleryListPanel.tsx` | Draggable gallery cards with visibility toggles, cover previews | 350 |
| `ProjectShareLinksPanel.tsx` | Share-link list + create/edit modal triggers | 200 |
| `index.tsx` | `ProjectPage` — data fetch, state, renders panels | 250 |

**Test impact**: `ProjectPage` currently has no dedicated test file (symbol
map shows no dependents). The route-level `App.tsx` integration tests
(`GalleryPage.test.tsx`, `PublicGalleryPage.test.tsx`) exercise project flows
indirectly. Add a basic smoke test for `ProjectPage` after decomposition.

### 6. GalleryPage.tsx (1293 lines → target ~250)

**Current sub-components** (already in `components/gallery/`):
`GalleryPageStates`, `GalleryHeader`, `GalleryPhotoSection`, `PhotoCard`,
`EmptyGalleryState`, `PhotoSelectionBar`, `ShareLinksSection`,
`GallerySelectionSessionsPanel`, `GalleryDragOverlay`.

**Remaining in page**: data-fetching (`useGalleryActions`), URL-synced search
+ sort state, photo-upload lifecycle callbacks, cover photo actions, download
actions, delete actions, selection mode coordination, `usePagination` +
`useSelection` hooks.

**Extract to `components/gallery/GalleryPage/`:**

| New file | Content | ~Lines |
|---|---|---|
| `SearchControls.tsx` | Search input, sort dropdown, order toggle — tied to URL query params | 100 |
| `GalleryPageContainer.tsx` | Shell that composes `GalleryHeader` + `SearchControls` + `GalleryPhotoSection` + `ShareLinksSection` + `GallerySelectionSessionsPanel` | 150 |
| `index.tsx` | `GalleryPage` — data fetch + all hook state, renders `GalleryPageStates` (loading) or `GalleryPageContainer` | 250 |

**Note**: GalleryPage is already the best-decomposed page. Further extraction
is primarily about SearchControls and the container shell. This is the lowest
ROI item — consider skipping if the first 6 items deliver the plan target.

### 7. PublicGalleryPage.tsx (1268 lines → target ~300)

**Existing components** (already in `components/public-gallery/`):
`PublicGalleryHero`, `PublicGalleryPhotoSection`, `PublicGalleryGridControls`,
`PublicGalleryStates`, `galleryAppearance`.

**Extract to `components/public-gallery-page/`:**

| New file | Content | ~Lines |
|---|---|---|
| `SelectionStartModal.tsx` | Name/email/phone form when starting a selection session | 200 |
| `SelectionPanel.tsx` | Selection sidebar: session info, selected photos list, submit/resume | 300 |
| `ProjectGalleryTabs.tsx` | Horizontal list of gallery names for multi-gallery project shares | 150 |
| `index.tsx` | `PublicGalleryPage` — data fetch, project/gallery routing, compose hero + tabs + grid + selection | 300 |

**Test impact**: `PublicGalleryPage.test.tsx` — the test already mounts
`PublicGalleryPage` and drives through `queryByRole`/`queryByText`. Extracts
don't change the visible DOM; snapshot diffs are cosmetic (component
boundaries). If a test asserts on a nested element now wrapped in a new
sub-component, the test query still resolves.

## Verification per PR

1. **Before**: pull the baseline `npm run test:run` and confirm 63 files / 418 tests pass.
2. **During**: extract one feature at a time; `npm run lint && npm run test:run` after each extract.
3. **After**: screenshot-diff the rendered output (Storybook or browser shot of the page at desktop + mobile). Only update snapshots if the visual output is pixel-identical.
4. **Type-check**: `npx tsc --noEmit` (Vite already type-checks on build).
5. **Bundle**: `VITE_API_URL=https://example.com npm run build` — verify no chunk-size regressions (tree-shaking may improve marginally since smaller modules have finer dead-code granularity).

## Risk mitigations

- **Do not change behavior.** Every extraction is a pure move — rename imports, not logic.
- **Keep existing test coverage.** Each page already has tests; extracted sub-components are exercised through the page test. Don't add new per-component tests unless the extract surfaces a new contract (e.g., a sub-component exported for reuse).
- **One PR at a time.** The 7 files are independent; a regression in one doesn't block the others.
- **Props are the contract.** Each sub-component receives only what it renders — no data-fetching, no routing, no global store access. This guarantees the extract is a pure presentation split.
- **Update AGENTS.md** after all 7 are done to reflect the new `components/<feature>/` folder conventions.

## Order of execution

| PR | File | Risk | Value | Order |
|---|---|---|---|---|
| 1 | `ShareLinkSettingsModal` | Low | High (reused by 2 pages) | 1 |
| 2 | `ShareLinkDetailPage` | Medium | High (largest file) | 2 |
| 3 | `ShareLinksDashboardPage` | Medium | High (second largest) | 3 |
| 4 | `GalleryAppearanceSection` | Low | Medium (standalone form) | 4 |
| 5 | `ProjectPage` | Low | Medium (no dedicated tests) | 5 |
| 6 | `GalleryPage` | Low | Low (already decomposed) | 6 |
| 7 | `PublicGalleryPage` | Medium | Medium | 7 |
