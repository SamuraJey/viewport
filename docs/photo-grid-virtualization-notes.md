# Photo Grid Virtualization — Notes & Approaches

Status: **Deferred** (2026-07-07). The original improvement plan (Item5) called
for virtualizing `frontend/src/components/gallery/GalleryPhotoSection.tsx`.
After investigation the plan's evidence was found to be inaccurate, so this
change was parked. This file captures the findings and the concrete approaches
to revisit when the time is right.

## Why deferred — the evidence was wrong

The plan claimed "a 500-photo page renders 500 card subtrees." In reality:

- `frontend/src/pages/GalleryPage.tsx:150` constructs pagination with
  `usePagination({ pageSize: 100, syncWithUrl: true })`.
- `frontend/src/hooks/useGalleryActions.ts` sends `limit: pageSize, offset` to
  the backend (`galleryService.getGallery`), so each page fetches at most
  **100** photos.
- The public gallery also paginates (`frontend/src/services/shareLinkService`
  passes `limit`/`offset` to `GET /s/{share_id}`).

So both private and public grids render **at most ~100** `PhotoCard` subtrees
per page, not hundreds–thousands. 100 `<img>`-backed cards is a bounded,
modest DOM payload. The cost/benefit of virtualizing an already-bounded 100
items did not justify the new direct dependency and refactor risk at this time.

## Why it's still worth doing (eventually)

- 100 `<img>` elements each with a wrapper, action buttons, and a context menu
  is still non-trivial DOM, especially on low-end devices / large viewports
  where 100 cards may all be near the fold.
- The backend cap is a soft config; if `pageSize` is ever raised (or pagination
  replaced with infinite scroll), the unvirtualized grid becomes a real
  problem immediately.
- `@tanstack/react-virtual` is already resolvable transitively today, so
  promotion to a direct dep is a `package.json`-only change.

## Approaches (in order of increasing effort / fidelity)

### Approach A — `useVirtualizer` with a fixed number of lanes

For grids where the column count is fixed per breakpoint (e.g. always 4
columns on desktop, 2 on mobile), virtualization is straightforward:

1. Determine `lanes` from a `useMediaQuery` / Tailwind breakpoint map.
2. Create a single scroll parent `<div ref={scrollRef} style={{height}}>` and
   move the existing `gridRef` semantics onto it.
3. `const rowVirtualizer = useVirtualizer({ count: Math.ceil(photos.length / lanes), estimateSize: () => ROW_HEIGHT, overscan: 4 })`
4. Render only the virtual rows; within each row map `lanes` photos.
5. Map the visible flat indices back to the full `photoUrls` array for
   `onOpenPhoto(index)` and `useSelection`'s Shift+click range.

Pros: simple, predictable. Cons: loses the fluid `auto-fill` resizing that
lets the grid reflow as the viewport width changes.

### Approach B — `useVirtualizer` with `lanes` derived from measured column count

Keeps `grid-template-columns: repeat(auto-fill, minmax(220px,1fr))` visual
behavior:

1. Render a *measurement-only* 1-row grid off-screen (or use a
   `ResizeObserver` on the scroll parent) to count how many 220px columns fit
   the current width → `columnCount`.
2. Feed `columnCount` as `lanes` to `useVirtualizer`.
3. Recompute on resize (debounced).

Pros: preserves the responsive auto-fill look. Cons: extra measurement pass
and resize handler; more moving parts.

### Approach C — `@tanstack/react-virtual` `Virtualizer` with dynamic row heights

If cards have variable heights (e.g. masonry-like layouts), use the
`measureElement` path so each row reports its real height. More complex and
only worth it if the grid intentionally has uneven row heights. Today the grid
uses uniform card heights, so this is overkill.

## Shared concerns for any approach

- **Scroll parent**: virtualization requires a scroll container with a
  bounded height. The current page lets the window scroll; introducing a
  scroll parent changes layout. Option: make the gallery section itself the
  scroll parent with `max-h-[calc(100vh-Xrem)]`, or use window-scroll
  virtualization (`useVirtualizer` supports a window scroll root via
  `observeElementRect`/`getScrollElement` returning `window`).
- **Shift+click range selection** (`useSelection`): operates on indices into
  `photoUrls`. With virtualization only a window of cards is mounted, but
  selection state must still address the *full* `photoUrls` array. Keep the
  `index` props on `PhotoCard` pointing at the full-array index, not the
  virtual window index.
- **`gridRef` consumers**: `GalleryPage` passes `gridRef` for
  scroll-into-view / drag-and-drop. Audit all `gridRef.current` users before
  repurposing it as the virtualizer scroll root.
- **Tests**: `frontend/src/__tests__/pages/GalleryPage.test.tsx` uses
  `getByRole('img')` queries that assume all photos are rendered. After
  virtualization only the overscan window is in the DOM; either (a) assert
  `getAllByRole('img').length <= overscanRows * columns`, or (b) drive the
  test with a small fixed viewport so the virtualizer renders all items.
- **Photos lightbox / `onOpenPhoto(index)`**: index must remain the full-array
  index, not the virtualized slice index, so the lightbox still navigates the
  whole page.

## Recommended path when revisiting

1. Decide if `pageSize: 100` should stay (it probably should for quota/UX).
2. Start with **Approach B** (measured column count + `lanes`) to preserve the
   auto-fill reflow users see today.
3. Use a window-scroll root rather than a nested scroll parent to avoid
   layout regressions, if feasible.
4. Add a test that renders 100 photos in a small viewport and asserts only the
   overscan window is mounted.
5. Promote `@tanstack/react-virtual` from transitive to a direct
   `package.json` dependency at that point.

## Anchors

- `frontend/src/components/gallery/GalleryPhotoSection.tsx:188-209` — the grid
  `.map()` to virtualize.
- `frontend/src/pages/GalleryPage.tsx:150` — `pageSize: 100`.
- `frontend/src/hooks/useGalleryActions.ts:120-123` — `limit: pageSize,
  offset` sent to backend.
- `frontend/src/components/public-gallery/PublicGalleryPhotoSection.tsx:333-335`
  — the public-grid `.map()` (same pattern; virtualize together if pursued).
- `frontend/src/__tests__/pages/GalleryPage.test.tsx:517-540` — the test to
  update for windowed rendering.