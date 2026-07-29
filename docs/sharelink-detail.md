# Share-link detail workspace

The owner share-link detail route (`/share-links/:shareLinkId`) is an
analytics-first workspace with three tabs:

- **Overview** summarizes link engagement and selection activity.
- **Daily analytics** keeps the custom trend chart and daily aggregate table.
- **Photo selection** manages selection settings, client sessions, comments,
  gallery grouping, and exports.

## Next best action

The hero shows one contextual action. Priority is:

1. edit an expired link's expiration;
2. edit an inactive link;
3. review in-progress selection sessions;
4. review submitted sessions and exports;
5. open analytics when the link has views;
6. copy the public client URL when no activity exists.

The decision is client-side and does not change link state directly. Editing
always opens the existing share-link editor.

## Analytics period

The 7, 30, and 90 day controls are available on Overview and Daily analytics
only. The selected period survives tab changes. Changing it refreshes only the
analytics endpoint; selection data and the active selection session remain
untouched.

## Selection sessions

Selection data remains lazy: owner selection endpoints are first called only
after opening Photo selection, and revisiting the tab reuses the loaded state.

Search, status filtering, and sorting are applied to the complete session list
on the client, in that order. Supported sort modes are:

- recent activity (`updated_at` descending, then `created_at` descending);
- oldest activity (`updated_at` ascending, then `created_at` ascending);
- client name A–Z (case-insensitive, then recent activity);
- selected count (descending, then recent activity).

The current session stays selected while it remains visible. If search or
filtering removes it, the first visible session in the current order becomes
active. When no sessions match, the detail panel is cleared until a visible
session is available again.

Presentation components under
`frontend/src/components/share-link-detail/` receive data and event handlers
through props. API loading, mutations, exports, editor state, confirmations,
and tab/period state remain in `ShareLinkDetailPage`.
