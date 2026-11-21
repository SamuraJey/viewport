# Dashboard interaction and visual refinement

The project dashboard separates the page title and primary **New project** action
from a responsive search/sort toolbar. Search and sort stack on phones, with
44px control heights. Search uses a single focus indicator on its enclosing shell.

Search remains debounced by 300ms and synchronized with the URL. Its clear button
and Escape clear both the input and URL immediately, reset pagination, preserve
the selected sort, and retain focus in the input. The empty-results action also
clears the search immediately.

The toolbar owns uncommitted input and the debounce; DashboardPage owns only the
committed URL query. Typing must not re-render project cards before applying the
filter. The page's clear-search generation resets pending local input even when
the clear action comes from outside the toolbar.

Only initial loading replaces the grid with layout-matched skeletons. Search,
sort, pagination and refresh requests retain existing cards. User-initiated
requests show an accessible “Updating projects…” status and mark the grid busy.
Background activity polling remains quiet. Errors retain the previous results
and expose the existing retry banner. The result count describes the last
successful response, including its search term. Reordering is disabled while
loading or whenever retained results belong to a different URL query.

Request sequence checks discard stale responses and invalidate pending requests
on cleanup. Do not remove these guards when changing loading presentation.

The shared visual system uses PT Sans for body text, explicit Oswald display
styling for branding/headings, and natural casing for collection names. Standard
Tailwind elevation replaces global shadow overrides, keeping focus-ring
composition intact and avoiding white glows in dark mode. Collection cards use
restrained hover movement and respect reduced motion. Project covers fall back
to a neutral placeholder when unavailable.

These choices apply the principles of clear system status and minimal visual
noise described in [NN/g's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).

## Verification

- `DashboardPage.test.tsx`: retained card identity during a pending sort and
  failed response; busy state; reorder protection; immediate clear with focus,
  preserved sort and page reset; Escape; initial loading and quiet polling.
- `ProjectCard.test.tsx`: visual snapshot and failed-cover recovery with a new URL.
- Visual checks through Orca CLI at desktop and phone widths in both themes.
