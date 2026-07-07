# Item9 — demoService.ts hot-path — Deferred (rule conflict)

Status: **Deferred** (2026-07-07). The plan (Item9) called for moving
`frontend/src/services/demoService.ts` (3056 lines) out of the production
bundle graph via a lazy `getDemoService` wrapper. Two project rules block the
only mechanism that would actually achieve the goal.

## Goal recap

`demoService.ts` is imported (statically) by 5 services + 3 pages via
`getDemoService` (`authService`, `galleryService`, `photoService`,
`projectService`, `shareLinkService`, `LandingPage`, `LoginPage`,
`PublicGalleryPage`). Because those services are statically imported by pages
that always run in production, the entire `DemoServiceStore` class
(lines ~590-3046) is pulled into the main bundle even when
`isDemoModeEnabled()` is always `false` for real users.

The plan's fix (Item9(a)):

```ts
// getDemoService becomes:
async () => import('./demoService').then((m) => m.getDemoService())
```

and the 5 services call it only inside their `if (isDemoModeEnabled())`
branches, so the chunk is never loaded unless demo mode is on.

## Why deferred — project rule conflict

Two workspace rules forbid both halves of that change:

1. **`ts-no-dynamic-import`**: "Use static imports for modules known at author
   time. Reach for `await import()` only when the module specifier is
   genuinely runtime-selected." The demo module path is a literal, so
   `await import('./demoService')` is prohibited. Plugin loading / optional
   platform modules are the named exceptions; a demo-mode gate is neither.

2. **`ts-import-type`**: "Use top-level `import type` declarations for type-only
   dependencies. NEVER write `import('pkg').Type` inside source annotations."
   A lazy `getDemoService` would return `Promise<DemoServiceStore>` whose type
   lives in the lazily-imported module; the only way to annotate that without
   statically importing the type (which re-pulls the module into the graph)
   is an inline `import('./demoService').DemoServiceStore`, which the rule
   forbids.

## Why the split-only fallback (Item9(b)) is marginal

The plan's fallback (Item9(b)) was to split the single file into
`demoServices/{gallery,project,sharelink,selection,auth}.ts` re-exported by a
thin index, keeping static imports. Considered and **not** pursued because:

- `DemoServiceStore` is one class with heavy internal state coupling
  (`DemoGalleryState`, `DemoProjectState`, `DemoPersistedState`, shared
  `viewport-demo-state-v1` localStorage persistence, cross-feature references
  like `setCoverPhoto` touching both `Gallery` and `Project` cover state).
  A clean feature split would require flattening the class into per-feature
  modules that still reach shared state — a real decoupling refactor, not a
  mechanical move.
- The split alone changes nothing about bundle inclusion: `getDemoService()`
  returns the whole store, every service module holds a static reference to
  it, so static bundlers keep all split modules in the main chunk. The
  stated goal — "dead weight in non-demo production builds" — is **not**
  achieved by a static split.
- Carrying real regression risk on a 3056-line file for a maintainability-only
  (not bundle-size) win was not worthwhile in this pass.

## Approaches available if the rules change

### A. Allow the dynamic import (preferred if rules permit)

1. `getDemoService` → `async () => import('./demoService').then((m) => m.getDemoService())`
   with a `// static import cannot work: demoService is demo-only and must
   stay out of the production bundle graph` rule-exception comment (the
   `ts-no-dynamic-import` rule allows a short comment naming why static import
   cannot work).
2. Annotate the return type via a top-level `import type { DemoServiceStore }`
   and a small hand-written ambient declaration, OR accept the inline import
   under the `ts-import-type` exception for ambient declarations — the latter
   needs team sign-off.
3. Convert the 5 service `if (isDemoModeEnabled())` branches to `await
   getDemoService()`; update the ~10 test mocks that `vi.mock` the module to
   return async wrappers.
4. Verify with `VITE_API_URL=https://example.com npm run build` and diff the
   chunk graph — `demoService-*` must land in a standalone chunk not in the
   main vendor bundle.

### B. Route-level code split (rule-compliant, partial)

Keep `getDemoService` static, but move the demo branches out of the shared
services and into a **demo-only route** loaded via `React.lazy`:

- Introduce `frontend/src/pages/DemoPage.tsx` (already lazy-loaded) that
  imports `demoService` directly and owns all demo flows.
- Service modules drop their `if (isDemoModeEnabled())` branches; routing
  dispatches demo mode to `DemoPage` instead.

Since `React.lazy` already uses dynamic import internally (the named exception
for runtime-selected modules in Vite's bundler), this keeps `demoService` out
of the main bundle **without** a forbidden `import()` in source — Vite handles
the split at the route boundary. Larger architectural change; the demo branch
removal from 5 services is the bulk of the work.

### C. Pure-helper extraction (low-risk, low-value)

Extract only the seed data + pure helpers (`makeDemoId`, `nowIso`,
`DEFAULT_GALLERY_APPEARANCE`, the ~2900 lines of seeded galleries/projects)
into `demoServices/seed.ts` and keep `DemoServiceStore` in `demoService.ts`.
The class still imports the seed module, so the bundle benefit is negligible;
this is purely a readability split.

## Recommendation

Revisit when either (a) the `ts-no-dynamic-import` rule gains a
demo/route-split exception, or (b) the team accepts approach B (route-level
demo split). Until then, `demoService.ts` stays as-is; the static import the
rules require guarantees it remains in the main bundle by design.

## Anchors

- `frontend/src/services/demoService.ts:3050` — `getDemoService` export.
- `frontend/src/services/demoService.ts:590` — `class DemoServiceStore` start.
- `frontend/src/services/{auth,gallery,photo,project,shareLink}Service.ts` —
  the `if (isDemoModeEnabled()) { return getDemoService()... }` branches.
- `frontend/src/pages/{Landing,Login,PublicGallery}Page.tsx` — direct
  `getDemoService()` calls inside demo-mode handlers.
- `frontend/src/__tests__/` — the ~10
  `vi.mock('../../services/demoService', () => ({ getDemoService: vi.fn() }))`
  sites.
