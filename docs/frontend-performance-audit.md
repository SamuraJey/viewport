# Frontend loading audit

## Scope and baseline

This audit improves page loading and interactions in `frontend/`. The baseline is the staged esbuild migration at the start of this audit, not the earlier Vite build. Before/after builds are preserved separately in `/tmp/viewport-client-before` and `/tmp/viewport-client-after`. No backend API, upload protocol, gallery layout, or authentication contract was changed.

## Findings and changes

- **Public entry:** `App` synchronously pulled in the owner shell, profile drawer and command palette. Move the protected shell, accessibility/error routes, profile, keyboard help and command palette behind module-level `React.lazy` boundaries. Closed command dialogs are not rendered until requested; after first use they remain mounted for their normal close/state behavior.
- **Demo engine:** five API services and three public/auth pages imported the entire dataset synchronously. `loadDemoService()` imports it only inside a demo branch or explicit demo-entry action. Normal API consumers have no static dependency on it. Demo-entry buttons show pending/disabled states, preserve error handling, and enable demo mode only after the module loads successfully.
- **Gallery:** photo intake remains mounted across tabs. Upload review loads after files are staged; the compression library loads only for a supported image above the size limit. Appearance, Favorites and share creation settings load when opened. Existing queue order, cancellation confirmation and file intake remain intact.
- **Photo viewer:** defer the viewer engine, video/download/fullscreen/zoom/thumbnails plugins and progressive slide renderer until the first open. Preserve existing hook callbacks, rotation, loading-more behavior and full collection position indicator. Keep the engine mounted after first use so its exit callback still scrolls back to the grid.
- **Viewer CSS:** import the two stylesheets as `?url` assets. The CSS loader deduplicates links and waits for both stylesheets before showing the viewer. The build now links only the main entry's `cssBundle`; it does not link every emitted stylesheet globally. Failed stylesheet requests clean up and can be retried by the loader.
- **Smooth scroll:** the old deferred Lenis wrapper changed the React parent after loading, remounting its descendants. Replace it with an imperative, idle-time enhancement mounted only on the landing page. It does not replace the React tree, destroys its instance on navigation, and keeps native scrolling for coarse pointers, reduced motion and Save-Data. React tests verify one mount and preserved child state.
- **Font discovery:** move the existing Google Fonts URL from CSS `@import` to the HTML head with preconnects. Font families/weights and `display=swap` are preserved; the browser can discover the font stylesheet before parsing the main CSS.
- **Dependency discovery:** preload static entry dependencies in HTML. A compact 4,246-byte JSON manifest lets a selected lazy route/dialog preload its own static JS dependencies in parallel; it never follows dynamic imports. This addresses the network discovery waterfall caused by smaller shared chunks. Missing or malformed hints do not prevent imports or Vite development.
- **Pending actions:** use a small live status with Cancel while a dialog module loads. Avoid an intermediate focus trap that could interfere with the actual dialog. Actual dialogs continue using the shared accessible primitives.

## Static module graph measurements

The table includes the main entry plus the selected route and, for owner routes, the protected shell. It deduplicates shared chunks and follows only static imports. It measures initial JavaScript for normal consumers, before optional actions or demo data are loaded. gzip uses the same level 6 for both builds.

| Route | Before JS gzip | After JS gzip | Change |
| --- | ---: | ---: | ---: |
| LandingPage | 291,268 B | 215,523 B | -26.0% |
| LoginPage | 288,503 B | 233,825 B | -19.0% |
| DashboardPage | 317,774 B | 296,923 B | -6.6% |
| GalleryPage | 424,282 B | 321,711 B | -24.2% |
| PublicGalleryPage | 339,499 B | 292,260 B | -13.9% |

`node scripts/analyze-build.mjs /tmp/viewport-client-after --check` passed: none of the measured initial route graphs contains the demo dataset, profile, command palette, upload review, appearance editor, viewer runtime or image compression library. The script reports request counts too: smaller chunks increase the count, so preload hints accompany the splitting changes.

## Browser evidence

Chromium loaded separately served before/after builds with gzip and no-store headers. Dashboard and gallery use the same built-in demo project, so their browser totals include the demo module that they actually need. Only `/assets/` requests are counted; external images/fonts, HTML and API latency are excluded.

| Page | Before JS/CSS transfer | After JS/CSS transfer | Change |
| --- | ---: | ---: | ---: |
| landing | 331,120 B | 252,814 B | -23.6% |
| dashboard | 357,626 B | 343,565 B | -3.9% |
| gallery | 464,134 B | 367,293 B | -20.9% |

Landing CSS transfer fell from 33,665 to 31,860 bytes. Before opening a photo, the gallery made no requests for the viewer, its styles, upload review, Appearance, profile, command palette or Lenis. Opening a photo then fetched the viewer JS (21,186 bytes gzip) and its CSS (1,438 + 940 bytes); zoom, download, fullscreen, navigation and thumbnails were available.

Functional browser checks covered landing → demo dashboard, project/public gallery, first photo-viewer open, command palette/Escape, profile, Appearance, and upload review on a 390×844 viewport. File selection opened the review queue; closing still required the existing discard confirmation. No upload was sent. Small-file review did not fetch the compression library. Browser JS errors were absent in these checks.

These are local transfer and module-graph measurements, not production LCP/INP guarantees. Request count is higher (landing 19→25, demo dashboard 25→48, demo gallery 28→54); selective preloads reduce dependency discovery, but HTTP protocol, RTT, bandwidth and cold server cache still affect real loading time. A production Web Vitals comparison remains useful.

The complete asset collection grows from 548,127 to 565,853 gzip bytes (+17,726 B, 3.2%) because of finer splitting, per-chunk compression overhead and the loading helpers. Each measured initial page graph is smaller. No additional minifier/bundler migration was introduced in this audit.

## Validation and reproduction

Passed: TS7 typecheck, Oxlint, Stylelint, Oxfmt, 100 Vitest files / 724 tests, static graph checks and production build. esbuild initial bundle was 599 ms and unchanged context rebuild 271 ms locally (both include output generation; exclude typecheck). Raw aggregate measurements are saved in `docs/frontend-performance-evidence.json`.

From `frontend/`:

```sh
npm run format:check
npm run lint
npm run lint:css
npm run typecheck
npm run test:run
VITE_API_URL=https://backend.example.test VITE_BUILD_OUT_DIR=/tmp/viewport-client-review node scripts/build.mjs --analyze --benchmark
node scripts/analyze-build.mjs /tmp/viewport-client-review --check
```

Build outputs with `--analyze` include the development-only metafile. Normal production builds omit it. To repeat browser measurements, serve each output as an SPA with gzip/no-store, use identical demo state for owner pages, and sum `PerformanceResourceTiming.encodedBodySize` for `/assets/` resources after the page settles.

References consulted through Context7: [React lazy](https://react.dev/reference/react/lazy), [esbuild CSS from JavaScript and cssBundle](https://esbuild.github.io/content-types/#css).
