# Authentication abuse protection

Viewport rate-limits expensive password verification with independent fixed-window budgets for the client IP and the credential scope:

- user login: IP plus normalized email;
- SQLAdmin login: IP plus normalized email;
- protected share access: IP plus share-link ID.

Both counters must allow the request. A denial returns `429 Too Many Requests` with `Retry-After`, and enforcement occurs before bcrypt. Protected shares apply the same budgets to `POST /s/{share_id}/unlock` and to direct `X-Viewport-Share-Password` verification on public routes.

## Backends and failure policy

Redis is the cross-process source of truth. Each fixed-window increment and first-use expiry is one atomic Redis script operation. If Redis is unavailable, the application uses a bounded, process-local fallback map; this keeps memory bounded but means counters are no longer shared between application processes.

An unavailable Redis connection is retried lazily on limiter traffic with a five-second backoff, so a startup-order race does not leave the process permanently on local fallback. A successful reconnect restores shared counters without restarting the application.

When that fallback map reaches capacity:

- user login fails open;
- SQLAdmin login and share-password verification fail closed.

Normal over-budget attempts fail closed for every route regardless of backend. The user-login exception applies only to fallback capacity exhaustion, not to a reached rate limit.

## Configuration

All settings come from `src/viewport/services/auth_rate_limiter.py`. Defaults shown below are per fixed window.

| Environment variable | Default | Purpose |
| --- | ---: | --- |
| `AUTH_RATE_LIMIT_USER_LOGIN_IP_LIMIT` | `30` | User-login attempts per client IP |
| `AUTH_RATE_LIMIT_USER_LOGIN_IP_WINDOW_SECONDS` | `60` | User-login IP window |
| `AUTH_RATE_LIMIT_USER_LOGIN_SCOPE_LIMIT` | `10` | User-login attempts per email |
| `AUTH_RATE_LIMIT_USER_LOGIN_SCOPE_WINDOW_SECONDS` | `60` | User-login email window |
| `AUTH_RATE_LIMIT_ADMIN_LOGIN_IP_LIMIT` | `10` | Admin-login attempts per client IP |
| `AUTH_RATE_LIMIT_ADMIN_LOGIN_IP_WINDOW_SECONDS` | `60` | Admin-login IP window |
| `AUTH_RATE_LIMIT_ADMIN_LOGIN_SCOPE_LIMIT` | `5` | Admin-login attempts per email |
| `AUTH_RATE_LIMIT_ADMIN_LOGIN_SCOPE_WINDOW_SECONDS` | `60` | Admin-login email window |
| `AUTH_RATE_LIMIT_SHARE_UNLOCK_IP_LIMIT` | `30` | Share-password attempts per client IP |
| `AUTH_RATE_LIMIT_SHARE_UNLOCK_IP_WINDOW_SECONDS` | `60` | Share-password IP window |
| `AUTH_RATE_LIMIT_SHARE_UNLOCK_SCOPE_LIMIT` | `10` | Share-password attempts per share link |
| `AUTH_RATE_LIMIT_SHARE_UNLOCK_SCOPE_WINDOW_SECONDS` | `60` | Share-link window |
| `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS` | empty | Comma-separated networks allowed to supply forwarded metadata |
| `AUTH_RATE_LIMIT_FALLBACK_MAX_ENTRIES` | `10000` | Maximum counters in each process-local fallback map |
| `AUTH_RATE_LIMIT_IDENTITY_MAX_BYTES` | `256` | Maximum normalized identity bytes included before key hashing |

Identities are normalized, length-bounded, and HMAC-SHA-256 hashed with the process JWT secret before entering Redis keys or denial logs. Passwords and raw email/IP identity values are not used as Redis key material.

## Trusted proxy policy

The raw socket peer is authoritative unless it belongs to `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS`. Forwarded headers from untrusted peers are ignored. For a trusted immediate peer, the application validates the complete `Forwarded` or `X-Forwarded-For` chain and selects the first address to the left of the trusted proxy suffix. Malformed chains, or disagreeing `Forwarded` and `X-Forwarded-For` chains, are rejected with `400` rather than used for rate-limit identity.

The Docker image starts Uvicorn with `--no-proxy-headers`, so `request.client.host` remains the raw TCP peer (the proxy address when one is present) and `request.url.scheme` remains the backend connection scheme. Application code resolves the rate-limit client separately and reads forwarded scheme/host metadata for public URLs and share-cookie policy only when that raw peer is in the configured CIDRs. Deployments behind a reverse proxy must therefore:

1. set `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS` to the narrowest actual proxy networks;
2. overwrite or sanitize inbound forwarded headers and append a canonical client chain;
3. leave the setting empty when the application is directly internet-facing.

Do not use a broad trust value merely to make HTTPS cookies work. Incorrect proxy trust permits clients to choose their rate-limit identity and public-origin metadata.

The base `docker-compose.yml` publishes the backend directly on port `8000` and defines no Nginx API proxy, so it intentionally has no proxy CIDR to trust. The Nginx image in `Dockerfile.frontend` only serves static frontend assets and is not an API reverse proxy in that Compose topology. If an operator adds an Nginx proxy, it must be placed on an explicitly addressed narrow network and that actual address or CIDR must be supplied through `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS`.

The checked-in TrueNAS/Traefik deployment requires `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS` at Compose-render time and refuses to start without it. Set it to the exact subnet assigned to the external Traefik proxy network; do not use a generic private-address range.
