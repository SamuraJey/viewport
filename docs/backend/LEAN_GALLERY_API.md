# Lean Gallery API

## Summary

The authenticated gallery detail endpoint now returns only gallery metadata, paginated photos, and `total_photos`.

`GET /galleries/{gallery_id}` no longer embeds `share_links` and gallery-scoped nested photo objects no longer repeat `gallery_id`.

## Share links

Share links are loaded separately through:

- `GET /galleries/{gallery_id}/share-links`
- `POST /galleries/{gallery_id}/share-links`
- `DELETE /galleries/{gallery_id}/share-links/{sharelink_id}`

These gallery-scoped share-link responses do not include `gallery_id`, because the route already establishes that context.

## Frontend loading pattern

The gallery page should treat gallery metadata and photos as the critical path, then fetch share links in a separate non-blocking request. This keeps large galleries responsive while still allowing share-link management and metrics to load shortly after the page is visible.
