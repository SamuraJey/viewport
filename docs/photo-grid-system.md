# Public photo grid system

The photo-grid system described here belongs only to public share pages and the public preview inside the gallery appearance editor. Owner gallery management keeps its existing `GalleryPage`, `GalleryPhotoSection`, `GalleryHeader`, and `PhotoCard` behavior.

## Public layouts

- **Masonry** preserves public photo order and uses each source aspect ratio to calculate responsive CSS-grid row spans.
- **Uniform** uses equal-height cells and `object-fit: contain`. The complete source frame remains visible; semantic surface colors fill any unused space.
- **Justified** groups photos into full-width rows. Completed rows fill the available width, while the final row stays at or below the target height. Display ratios are bounded to limit cropping.

Justified targets are intentionally photo-forward: 360px/260px for
Large/Compact on desktop and 240px/180px on mobile. Completed rows reserve a
0.5px rounding guard on their final item so browser flex quantization cannot
wrap that item and expose a card-sized gap on the right.

Public viewers can select `large` or `compact` density. On touch-sized viewports, pinch-in selects compact density and pinch-out selects large density without blocking ordinary one-finger vertical scrolling.

## Implementation

- `frontend/src/lib/publicPhotoGridLayout.ts` contains pure O(n) masonry and justified geometry helpers.
- `frontend/src/hooks/usePublicGalleryGrid.ts` owns public layout/density state, aspect-ratio fallback caching, measurement, and pinch handlers.
- `PublicGalleryPhotoSection` renders the geometry and keeps favorites, comments, video badges, keyboard access, lazy loading, and lightbox behavior intact.
- `PublicGalleryGridControls` exposes Masonry, Uniform, and Justified plus Large and Compact.
- `AppearanceEditor` uses the same hook and components as the real public page.

The hook returns both a stable `gridRef` object for lightbox queries and `setGridRef`, a callback ref for the rendered grid. The callback ref tracks conditional mount/remount so `ResizeObserver` and image-load listeners always attach to the current node and disconnect from the previous one.

API width/height values are authoritative. Photos without dimensions fall back to the session aspect-ratio cache and then 4:3. Image-load cache changes are coalesced into one `requestAnimationFrame` refresh; loads for already-sized photos do not invalidate React geometry.

## Uniform no-crop contract

Uniform is deliberately different from justified:

- the cell height is shared within the active breakpoint/density;
- the image uses `object-fit: contain`;
- no 4:5 card aspect ratio is forced;
- no part of the source frame is cropped;
- loading and error states occupy the same cell to avoid layout shift.

Changing uniform to `object-fit: cover` is a product regression.

## Verification

Pure helper tests cover empty, equal-ratio, mixed-ratio, incomplete-row, narrow-container, extreme-ratio, masonry, and 200-item cases. Hook tests cover natural/API/cached ratios, all three layouts, conditional remount observer lifecycle, and coalesced 200-image load bursts.

Browser QA must use a production demo build and verify:

- public Masonry, Uniform, and Justified at desktop and mobile widths;
- Uniform shows complete portrait and landscape frames;
- light and dark public color schemes;
- pinch density on mobile;
- favorites/comments/video badges and lightbox still work;
- no horizontal overflow or runtime console errors;
- a temporary 200-photo public fixture meets the render/layout budget and scroll frame target, then is restored.

The 2026-07-21 verification passed at 1440×1000 and 390×844. Both scoped public
schemes overrode the viewer theme correctly, every layout had zero horizontal
overflow, Uniform kept mixed portrait/landscape frames intact, mobile pinch
changed Large to Compact, and the lightbox/video path remained operational.
With 200 rendered cards, layout switches measured 30.1ms (Uniform), 53.9ms
(Justified), and 46.3ms (Masonry); a 120-frame scroll sample averaged 60.4fps
with a 17ms p95. A clean browser session reported no console messages or
runtime errors, and the temporary demo fixture was restored to 12 photos.

A follow-up 2048×1053 check used 100 portrait-heavy photos. The 1962px grid
rendered completed Large rows at 325–359px and Compact rows at 216–236px;
their measured right edge gap stayed between 0.50px and 0.61px. Mobile at
390px retained zero page/grid overflow. The temporary fixture was again
restored after verification.
