# Studio workspace

## Navigation

The owner shell has a persistent 240px sidebar on desktop (`lg`, 1024px and up).
It starts below the 64px sticky header, so gallery toolbars retain their existing
header offsets. The sidebar highlights Projects for all project/gallery routes
and Share links for analytics routes. Storage uses the authenticated account's
usage/quota snapshot and opens account settings. The visual fill is clamped to
0–100%; an unknown or zero quota hides the storage card.

Tablets retain header navigation. Phones retain the two-item safe-area-aware
dock. The sidebar does not take space on either smaller layout.

The sidebar scrolls independently on short desktop windows. Text accents use
`text-accent-text`, a semantic primary-700 token that follows both theme palettes
and the readability contrast overrides. Filled actions keep the existing accent
background/foreground pair.

## Project overview

`ProjectOverview` replaces the previous metadata/action/metric-card cluster with
a photo-led cover using the project's existing thumbnail URL and focal point.
A failed or absent cover uses a themed illustration; private projects never
receive stock imagery. Titles wrap naturally, including unbroken names.

**Add gallery** and **Share project** remain visible primary actions. The
**Project options** popover contains Rename project, Upload folder (when
supported and applicable), Prepare publication files, and Delete project.
Existing publication/deletion/proofing confirmations are unchanged.

**Edit presentation** selects the existing Appearance tab, scrolls to its section,
and focuses the selected tab. Reduced motion uses an immediate scroll.

The footer counts only active, unexpired project share links and offers
**Open client view** for the first eligible link. Expiry is reevaluated every
30 seconds. Opening client view uses the normal public password/access gate;
it does not bypass permissions or create a share link.

## Project library views

`/dashboard?view=list` shows a compact responsive table; the default is the photo
grid. Switching views preserves the current search, sort and page, does not
request new data, and participates in browser history. Copying, renaming,
settings, sharing and deletion use the same handlers in both views.

At phone widths, table rows show a cover, name, gallery/photo counts and actions.
Additional date, storage and link columns appear as space permits. Drag reorder
and its instructions appear only in grid view. List mode preserves the server
order and can return to the grid to reorder. Initial skeletons match each view;
revalidation keeps the selected presentation mounted.

Gallery inline rename returns focus to the rename button after Enter or Escape
closes the editor and any pending save finishes. Blur and Tab keep normal focus
navigation. Date-only shoot dates retain their calendar date in every timezone;
storage values include a TB unit for terabyte-scale quotas.

If a list cover fails to load, its fallback remains visible. A replacement cover
becomes visible after loading successfully without requiring a list remount.

## Demo placeholders

Demo images use locally authored SVG placeholders under `frontend/public/demo/`.
Seeded demo image filenames use `.svg` so owner and public single-photo downloads
match the served asset format.
Restored demo image URLs migrate to bundled placeholders; video URLs and other
stored fields are preserved. Demo uploads also use placeholder images, so their
single-photo downloads use `.svg` filenames while retaining the uploaded names
in the gallery. Downloads with actual PNG/JPEG content retain matching filenames.
Demo videos still use the existing sample video source.

## Verification

Regression coverage includes project menu actions and confirmations, folder
intake, appearance scroll/focus, active/expired client preview, view switching
without refetch or filter loss, nested sidebar navigation, storage settings and
demo cover updates. Orca visual checks cover desktop and phone layouts in both
themes.
