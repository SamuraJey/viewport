# Owner UI rendering audit

Audit date: 2026-11-15.

## Method and scope

Measured real React components in Orca's embedded browser using React's development
`Profiler` and temporary component invocation counters. An isolated local page
supplied deterministic service fixtures: 50 project galleries, 18 dashboard
projects, and a separate 100-photo owner grid. Images reused a bundled sample;
network/server latency was excluded. Both before/after input runs used the same
12 real keystrokes, `abcdefghijkl`, with no CPU throttling. StrictMode was off,
matching the current development entry point.

Temporary profiling pages and counters were removed after measurement. These are
local component-render measurements, not production INP/LCP scores or a device
performance guarantee. A component invocation is not necessarily a DOM mutation
or a repaint. Profiler timing includes its development/instrumentation overhead.

## Observed results

| Scenario | Before | After |
| --- | ---: | ---: |
| Rename: gallery-card renders over 12 keys, 50 galleries | 600 | 0 |
| Rename: project-page renders over those keys | 12 | 0 |
| Rename: appearance-editor / share-section renders | 12 / 12 | 0 / 0 |
| Rename: median React render time per key | 43.3ms | 0.1ms |
| Search: project-card renders, 18 cards, including debounced filtering | 252 | 36 |
| Search: dashboard-page renders | 15 | 2 |
| Search: median React render time per key, excluding filter application | 11.7ms | 1.7ms |
| Deferred scrolling: page mounts / project-detail reads | 2 / 2 | 1 / 1 |

The rename editor now renders itself once per key. Search renders its toolbar
during input; the remaining two dashboard renders publish the URL/filter request
and the returned results. Applying a filter should still update the grid.

The existing owner photo grid already behaved correctly: selecting one of 100
photos rendered one `PhotoCard` (3.6ms for the measured subtree update); an
unrelated parent-state update rendered zero `PhotoCard`s (2.2ms, including the
section's own reconciliation). No photo-grid optimization was added in this audit.

## Changes

- `GalleryNameEditor` owns the temporary name, counter and input state. ProjectPage
  only tracks the active gallery and saving state, and receives the name on save.
  This also avoids re-rendering sibling cards and hidden appearance content while
  typing. Existing fixed-slot geometry, IME handling, focus and confirmations stay
  intact; failed saves retain the draft for retry.
- `DashboardProjectToolbar` owns the uncommitted search text and 300ms debounce.
  The page owns the committed URL query. A clear-search generation also clears
  pending local input when the clear action comes from the empty state. History
  navigation, sort, view and pagination remain URL-driven.
- `DeferredLenis` imports the core scroll controller after mount and creates it
  with `autoRaf: true`. It always returns the same fragment tree. Replacing the
  fragment with a late ReactLenis wrapper previously unmounted and remounted the
  route, repeating effects/requests and risking lost input. Cleanup destroys the
  controller and ignores late imports after unmount. There are currently no
  `useLenis` context consumers in the application.

## Regression coverage

- ProjectPage: typing does not re-render project overview or gallery cards;
  existing rename save/cancel/error flows remain covered.
- DashboardPage: typing before debounce does not render project cards or issue
  requests; existing URL/debounce/clear/history-related flows remain covered.
- DeferredLenis: page effect runs once, input DOM/value survives initialization,
  controller is destroyed on cleanup, and unmounted content does not initialize it.

## Remaining limits

The project gallery list still mounts all galleries and their sortable controls.
The 50-gallery initial render was about 200ms in the instrumented development
run; the audit did not add virtualization or assert a production time for it.
Dashboard lists are bounded to 18 items per page, and owner photo pages to 100.
Upload queue virtualization, bounded thumbnail work and photo-card containment
are described in [gallery/upload performance](./gallery-upload-performance.md).

No real backend, storage service, slow mobile CPU, cold CDN, large video upload,
or production field Core Web Vitals was measured here. Auth-store subscribers and
other page-specific flows were not comprehensively profiled. Do not treat this
audit as proof that every route has zero avoidable renders.

References: [React Profiler](https://react.dev/reference/react/Profiler),
[Lenis initialization and cleanup](https://github.com/darkroomengineering/lenis).
