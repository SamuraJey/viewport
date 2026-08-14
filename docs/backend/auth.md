# Authentication and authorization

Viewport uses short-lived JWT access tokens plus rotating, durable refresh-token sessions. Passwords are hashed with bcrypt, and both token types carry an HMAC fingerprint of the user's current password hash.

## Token lifecycle

- Access tokens default to 30 minutes and are sent as `Authorization: Bearer <access_token>`.
- Refresh tokens default to 7,200 minutes (five days) and are submitted in the JSON body of `POST /auth/refresh` as `refresh_token`.
- Login creates a refresh family and persists only the SHA-256 hash of the refresh token's high-entropy `jti`. Raw refresh tokens are never stored.
- Refresh is single-use rotation: consuming a parent and creating its child are committed atomically while the user row is locked.
- Reusing a known used or revoked refresh token is treated as replay. The request returns `401` and every still-active session in that token family is revoked. JWTs already past `exp` are rejected as expired before a database rotation is attempted.
- A refresh JWT is accepted only when its hashed `jti` has a matching durable session. The refresh-session migration is therefore a hard cutover: refresh JWTs issued before the migration require the user to log in again.

Access tokens remain otherwise stateless, but their password fingerprint is checked against the current user row on every authenticated request. Refresh tokens receive the same fingerprint check during rotation.

## Password changes

`PUT /me/password` locks the user row, revokes all of that user's refresh sessions, and updates the bcrypt password hash in one database transaction. The changed hash also makes all previously issued access and refresh JWT fingerprints fail immediately. A failed transaction leaves both the password and session state unchanged.

## Refresh-session retention

Celery Beat runs `cleanup_refresh_token_sessions` hourly at minute 30. The task deletes in batches of 1,000 and keeps refresh-session audit state for seven days after expiry or revocation. It stores hashes and lifecycle timestamps only, never raw tokens.

The API process exposes rate-limit decisions, successful refresh rotations, refresh rejects, and replay-family revocations through `/metrics`. Cleanup rows and duration are included in the Celery task result and worker log; the task also records worker-local Prometheus samples for deployments that collect Celery worker registries. See `src/viewport/auth_metrics.py` for metric names and labels.

## Password handling

- User passwords must be at least eight characters and at most 72 UTF-8 bytes, matching bcrypt's safe input limit.
- Password hashing and verification run outside the async event loop.
- Login responses intentionally do not distinguish an unknown email from an incorrect password.

## Endpoints

- `POST /auth/register` creates a user after validating the configured invite code.
- `POST /auth/login` returns the user summary, an access token, and the root refresh token.
- `POST /auth/refresh` atomically rotates the supplied refresh token and returns a new access/refresh pair.
- `GET /me` resolves the bearer access token and its current password fingerprint.
- `PUT /me/password` changes the password and revokes all existing authentication sessions.

Expirations and signing are configured by `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, and `REFRESH_TOKEN_EXPIRE_MINUTES`. Use a strong, unique production secret and rotate it only with an intentional global re-login event.

## Authorization boundaries

Protected routes resolve the bearer token through `get_current_user()` and use a function-scoped `AsyncSession`. Resource repositories must still enforce owner IDs; a valid JWT does not authorize access to another user's projects, galleries, photos, or share-link management.

Public `/s/{share_id}` routes do not require an owner bearer token. They authorize against share-link lifecycle, scope, and the shared password gate, preserving non-disclosing `404`, expired `410`, and password-challenge `401` responses. Production traffic must use HTTPS, and credentialed CORS origins must remain explicit.

## Abuse protection and proxy trust

User login, SQLAdmin login, and share-password verification are protected before bcrypt work begins. The complete budget, Redis fallback, trusted-proxy, and deployment contract is documented in [Authentication abuse protection](../auth-abuse-protection.md).
