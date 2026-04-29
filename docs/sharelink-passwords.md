# Share link passwords

Viewport share links can be optionally password-protected for both gallery and project shares. The photographer shares the normal public URL and sends the password through a separate channel.

## Owner behavior

- Share-link create/update APIs accept a write-only `password` field.
- Existing passwords are replaced by sending a new `password`.
- Passwords are removed only with explicit `password_clear: true`.
- Omitted `password` fields leave an existing password unchanged; `password: null` is rejected to prevent accidental clears.
- Passwords must be at least 8 non-blank characters and at most 72 UTF-8 bytes, matching bcrypt input limits.
- API responses expose only `has_password`; plaintext passwords and `password_hash` are never returned.
- Stored passwords are bcrypt hashes in `share_links.password_hash`. There is no password recovery flow; owners can only replace or clear the password.

## Public HTTP semantics

Public share routes preserve existing privacy semantics:

- Missing or inactive share links return `404`.
- Expired share links return `410`.
- Valid active non-expired protected share links return `401` until the visitor unlocks the share with the correct password.
- Missing and incorrect passwords intentionally return the same generic `401` challenge.

Browser unlock requests send the password only to:

```http
POST /s/{share_id}/unlock
```

On success, the backend issues a signed, share-scoped `HttpOnly` cookie (`viewport-share-access-{share_id}`) with a 24-hour max age. The cookie token contains only the share ID, expiry, token type, and an HMAC fingerprint of the current bcrypt hash; it does not contain the plaintext password or password hash. Changing a share password invalidates existing unlock cookies because the fingerprint changes. Non-browser API callers may still provide `X-Viewport-Share-Password` directly, but the frontend must not use or persist that header value.

Cookie attributes are environment-sensitive:

- Same-site responses use `SameSite=Lax`.
- Cross-origin HTTPS unlock responses use `SameSite=None; Secure`, which is required for browsers to accept cookies from XHR/fetch responses.
- Cross-site cookies cannot be made reliable over plain HTTP because browsers require `Secure` with `SameSite=None`. For local development, keep the frontend on the Vite proxy/default `/api` path (do not set `VITE_API_URL` to a different host) or run both sides through HTTPS.

The gate applies to all public `/s/{share_id}` content, ZIP download, photo lookup, and selection endpoints. Analytics counters, ZIP generation, S3 presigned URL generation, and selection mutations happen only after successful password verification.

## Frontend behavior

- Public share calls use `publicApi`, not the authenticated owner `api` client. A public `401` must not refresh owner auth, clear `authStore`, or redirect to login.
- The entered share password is submitted once to `/s/{share_id}/unlock` and is never stored in `sessionStorage`, `localStorage`, IndexedDB, URLs, analytics payloads, or React/Zustand state beyond the form submission. Refreshing the page remains convenient because subsequent public requests rely on the backend-issued `HttpOnly` unlock cookie.
- Protected ZIP downloads use public blob requests with credentials so the browser sends the unlock cookie. The browser reads `Content-Disposition` when CORS exposes it, with a deterministic fallback filename when unavailable.

## CORS and operations

`publicApi` must keep `withCredentials: true` so cross-origin deployments can send the unlock cookie. CORS must keep `allow_credentials=True`, and production origins must remain explicit. In local development, prefer the Vite proxy (`VITE_DEV_PROXY` enabled, default `VITE_API_URL` empty so API base is `/api`) to avoid browser cross-site cookie restrictions on plain HTTP. `Content-Disposition` is exposed so blob download helpers can preserve server-provided ZIP filenames.

Denied password attempts are logged with safe metadata only: share ID, scope type, reason category, method/path, and coarse client fields. Password values, password hashes, cookies, and request headers containing the password must never be logged.

Dedicated rate limiting is intentionally deferred for the first release. If denied-attempt logs show brute-force patterns or bcrypt CPU pressure, add a Redis-backed per-share/client throttle.

## Revocation and rollback caveats

Changing, clearing, deactivating, or expiring a share link affects future backend `/s/` requests immediately. Already-issued S3 presigned URLs can remain usable until their own expiry and any presigned-cache TTL, so do not promise instant object-level revocation after a password change.

Rollback is safe only before protected share links exist in production. After users create protected links, deploying code that ignores `password_hash` would expose previously protected content. Production rollback must either preserve the gate, deactivate protected links, or perform an explicit destructive downgrade.
