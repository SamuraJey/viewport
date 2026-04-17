# Gallery descriptions

Viewport stores two gallery-level text fields for gallery copy:

- `private_notes` — owner-only notes shown on the private gallery page.
- `public_description` — public copy shown on the shared gallery page (`/s/{share_id}`).

## Boundaries

- Both fields are stored on `galleries`.
- `private_notes` is returned only by owner-facing gallery detail endpoints.
- `public_description` is returned by owner-facing gallery detail endpoints and public shared gallery endpoints.
- Gallery list responses stay lightweight and do not include either field.

## Rendering rules

- Both fields are treated as plain text.
- Empty strings are normalized to `null`.
- Public rendering preserves line breaks and does not allow HTML or markdown.

## UI flow

- Owners edit both fields from the private gallery page using an explicit save action.
- Public visitors see only `public_description`, typically in the public gallery hero area.
