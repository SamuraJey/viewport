# Share link passwords

Viewport share links can be optionally password-protected for both gallery and project shares. The photographer shares the normal public URL and sends the password through a separate channel.

## Owner behavior

- Share-link create/update APIs accept a write-only `password` field.
- Existing passwords are replaced by sending a new `password`.
- Passwords are removed only with explicit `password_clear: true`.
- `password: null` or an omitted `password` does not clear an existing password.
- Passwords must be 8-128 non-blank characters.
- API responses expose only `has_password`; plaintext passwords and `password_hash` are never returned.
- Stored passwords are bcrypt hashes in `share_links.password_hash`. There is no password recovery flow; owners can only replace or clear the password.

## Public HTTP semantics

Public share routes preserve existing privacy semantics:

- Missing or inactive share links return `404`.
- Expired share links return `410`.
- Valid active non-expired protected share links return `401` until the request includes the correct password.
- Missing and incorrect passwords intentionally return the same generic `401` challenge.

Protected public requests must send:

```http
X-Viewport-Share-Password: <password>
```

The gate applies to all public `/s/{share_id}` content, ZIP download, photo lookup, and selection endpoints. Analytics counters, ZIP generation, S3 presigned URL generation, and selection mutations happen only after successful password verification.

## Frontend behavior

- Public share calls use `publicApi`, not the authenticated owner `api` client. A public `401` must not refresh owner auth, clear `authStore`, or redirect to login.
- The entered share password is stored per share ID in `sessionStorage` so page navigation and project gallery switches can reuse it for the browser session. It is not stored in localStorage and is not sent in URLs.
- Protected ZIP downloads use fetch/blob requests so the password can be sent as a header. The browser reads `Content-Disposition` when CORS exposes it, with a deterministic fallback filename when unavailable.

## CORS and operations

`X-Viewport-Share-Password` is a custom header, so browser requests are preflighted. Current development settings allow all headers; production CORS settings must continue to allow this header if tightened later. `Content-Disposition` is exposed so blob download helpers can preserve server-provided ZIP filenames.

Denied password attempts are logged with safe metadata only: share ID, scope type, reason category, method/path, and coarse client fields. Password values, password hashes, and request headers containing the password must never be logged.

Dedicated rate limiting is intentionally deferred for the first release. If denied-attempt logs show brute-force patterns or bcrypt CPU pressure, add a Redis-backed per-share/client throttle or move to a short-lived unlock-token design.

## Revocation and rollback caveats

Changing, clearing, deactivating, or expiring a share link affects future backend `/s/` requests immediately. Already-issued S3 presigned URLs can remain usable until their own expiry and any presigned-cache TTL, so do not promise instant object-level revocation after a password change.

Rollback is safe only before protected share links exist in production. After users create protected links, deploying code that ignores `password_hash` would expose previously protected content. Production rollback must either preserve the gate, deactivate protected links, or perform an explicit destructive downgrade.
