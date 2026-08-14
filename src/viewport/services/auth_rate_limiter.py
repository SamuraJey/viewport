"""Shared authentication rate limiting with a bounded local fallback."""

import asyncio
import hashlib
import ipaddress
import math
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache

from fastapi import HTTPException, Request
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from viewport.auth_metrics import AUTH_RATE_LIMIT_DECISIONS
from viewport.services.redis_service import FixedWindowIncrement, RedisService, get_redis_service

type IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
type IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


class InvalidClientAddressError(ValueError):
    """The socket peer or a trusted forwarded chain was malformed."""


class AuthRateLimitRoute(StrEnum):
    USER_LOGIN = "user_login"
    ADMIN_LOGIN = "admin_login"
    SHARE_UNLOCK = "share_unlock"


@dataclass(frozen=True)
class RateLimitBudget:
    limit: int
    window_seconds: int


@dataclass(frozen=True)
class RouteRateLimit:
    ip: RateLimitBudget
    scope: RateLimitBudget
    fail_closed_when_fallback_full: bool


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after: int | None
    backend: str
    limited_scopes: tuple[str, ...] = ()


class AuthRateLimitSettings(BaseSettings):
    """Budgets and proxy/fallback policy for expensive auth routes."""

    user_login_ip_limit: int = Field(default=30, gt=0)
    user_login_ip_window_seconds: int = Field(default=60, gt=0)
    user_login_scope_limit: int = Field(default=10, gt=0)
    user_login_scope_window_seconds: int = Field(default=60, gt=0)

    admin_login_ip_limit: int = Field(default=10, gt=0)
    admin_login_ip_window_seconds: int = Field(default=60, gt=0)
    admin_login_scope_limit: int = Field(default=5, gt=0)
    admin_login_scope_window_seconds: int = Field(default=60, gt=0)

    share_unlock_ip_limit: int = Field(default=30, gt=0)
    share_unlock_ip_window_seconds: int = Field(default=60, gt=0)
    share_unlock_scope_limit: int = Field(default=10, gt=0)
    share_unlock_scope_window_seconds: int = Field(default=60, gt=0)

    trusted_proxy_cidrs: str = ""
    fallback_max_entries: int = Field(default=10_000, ge=0)
    identity_max_bytes: int = Field(default=256, gt=0, le=4096)

    model_config = SettingsConfigDict(
        env_prefix="AUTH_RATE_LIMIT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def policy_for(self, route: AuthRateLimitRoute) -> RouteRateLimit:
        if route is AuthRateLimitRoute.USER_LOGIN:
            return RouteRateLimit(
                ip=RateLimitBudget(self.user_login_ip_limit, self.user_login_ip_window_seconds),
                scope=RateLimitBudget(self.user_login_scope_limit, self.user_login_scope_window_seconds),
                fail_closed_when_fallback_full=False,
            )
        if route is AuthRateLimitRoute.ADMIN_LOGIN:
            return RouteRateLimit(
                ip=RateLimitBudget(self.admin_login_ip_limit, self.admin_login_ip_window_seconds),
                scope=RateLimitBudget(self.admin_login_scope_limit, self.admin_login_scope_window_seconds),
                fail_closed_when_fallback_full=True,
            )
        return RouteRateLimit(
            ip=RateLimitBudget(self.share_unlock_ip_limit, self.share_unlock_ip_window_seconds),
            scope=RateLimitBudget(self.share_unlock_scope_limit, self.share_unlock_scope_window_seconds),
            fail_closed_when_fallback_full=True,
        )


@lru_cache(maxsize=1)
def get_auth_rate_limit_settings() -> AuthRateLimitSettings:
    return AuthRateLimitSettings()


def parse_trusted_proxy_cidrs(value: str | Iterable[str | IPNetwork]) -> tuple[IPNetwork, ...]:
    """Parse configured proxy networks once and reject invalid entries."""
    entries: Iterable[str | IPNetwork]
    if isinstance(value, str):
        entries = (entry.strip() for entry in value.split(",") if entry.strip())
    else:
        entries = value

    networks: list[IPNetwork] = []
    for entry in entries:
        if isinstance(entry, (ipaddress.IPv4Network, ipaddress.IPv6Network)):
            networks.append(entry)
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError as exc:
            raise ValueError(f"Invalid trusted proxy CIDR: {entry}") from exc
    return tuple(networks)


def _canonical_ip(value: str) -> IPAddress:
    raw = value.strip()
    if not raw or "%" in raw:
        raise InvalidClientAddressError("Invalid IP address")

    if raw.startswith("["):
        closing = raw.find("]")
        if closing < 0:
            raise InvalidClientAddressError("Invalid bracketed IP address")
        host = raw[1:closing]
        suffix = raw[closing + 1 :]
        if suffix and (not suffix.startswith(":") or not _valid_port(suffix[1:])):
            raise InvalidClientAddressError("Invalid forwarded port")
        raw = host
    else:
        try:
            return ipaddress.ip_address(raw)
        except ValueError:
            host, separator, port = raw.rpartition(":")
            if not separator or not _valid_port(port):
                raise InvalidClientAddressError("Invalid IP address") from None
            try:
                parsed = ipaddress.ip_address(host)
            except ValueError:
                raise InvalidClientAddressError("Invalid IP address") from None
            if not isinstance(parsed, ipaddress.IPv4Address):
                raise InvalidClientAddressError("IPv6 addresses with ports must be bracketed") from None
            return parsed

    try:
        return ipaddress.ip_address(raw)
    except ValueError:
        raise InvalidClientAddressError("Invalid IP address") from None


def _valid_port(value: str) -> bool:
    return value.isascii() and value.isdigit() and 0 <= int(value) <= 65535


def is_trusted_proxy_peer(peer_host: str, trusted_proxy_cidrs: str | Iterable[str | IPNetwork]) -> bool:
    """Return whether a canonical socket peer belongs to an explicit proxy CIDR."""
    try:
        peer = _canonical_ip(peer_host)
    except InvalidClientAddressError:
        return False
    networks = parse_trusted_proxy_cidrs(trusted_proxy_cidrs)
    return any(peer.version == network.version and peer in network for network in networks)


def _split_quoted(value: str, delimiter: str) -> list[str]:
    parts: list[str] = []
    start = 0
    quoted = False
    escaped = False
    for index, character in enumerate(value):
        if escaped:
            escaped = False
        elif character == "\\" and quoted:
            escaped = True
        elif character == '"':
            quoted = not quoted
        elif character == delimiter and not quoted:
            parts.append(value[start:index])
            start = index + 1
    if quoted or escaped:
        raise InvalidClientAddressError("Malformed quoted Forwarded header")
    parts.append(value[start:])
    return parts


def _unquote_forwarded_value(value: str) -> str:
    if '"' not in value:
        return value
    if len(value) < 2 or not value.startswith('"') or not value.endswith('"'):
        raise InvalidClientAddressError("Malformed Forwarded value")
    result: list[str] = []
    escaped = False
    for character in value[1:-1]:
        if escaped:
            result.append(character)
            escaped = False
        elif character == "\\":
            escaped = True
        elif character == '"':
            raise InvalidClientAddressError("Malformed Forwarded value")
        else:
            result.append(character)
    if escaped:
        raise InvalidClientAddressError("Malformed Forwarded value")
    return "".join(result)


def _parse_forwarded_header(value: str) -> tuple[IPAddress, ...]:
    hops: list[IPAddress] = []
    for element in _split_quoted(value, ","):
        if not element.strip():
            raise InvalidClientAddressError("Empty Forwarded element")
        forwarded_for: str | None = None
        for parameter in _split_quoted(element, ";"):
            name, separator, parameter_value = parameter.strip().partition("=")
            if not separator or not name or not parameter_value:
                raise InvalidClientAddressError("Malformed Forwarded parameter")
            if name.strip().lower() != "for":
                continue
            if forwarded_for is not None:
                raise InvalidClientAddressError("Duplicate Forwarded for parameter")
            forwarded_for = _unquote_forwarded_value(parameter_value.strip())
        if forwarded_for is None:
            raise InvalidClientAddressError("Forwarded element has no for parameter")
        if forwarded_for.lower() == "unknown" or forwarded_for.startswith("_"):
            raise InvalidClientAddressError("Forwarded chain contains a non-IP node")
        hops.append(_canonical_ip(forwarded_for))
    return tuple(hops)


def _parse_x_forwarded_for(value: str) -> tuple[IPAddress, ...]:
    hops: list[IPAddress] = []
    for element in value.split(","):
        if not element.strip() or '"' in element:
            raise InvalidClientAddressError("Malformed X-Forwarded-For header")
        hops.append(_canonical_ip(element))
    return tuple(hops)


def _header_chain(request: Request) -> tuple[IPAddress, ...]:
    forwarded_values = request.headers.getlist("forwarded")
    xff_values = request.headers.getlist("x-forwarded-for")
    forwarded = _parse_forwarded_header(",".join(forwarded_values)) if forwarded_values else None
    xff = _parse_x_forwarded_for(",".join(xff_values)) if xff_values else None
    if forwarded is not None and xff is not None and forwarded != xff:
        raise InvalidClientAddressError("Forwarded headers disagree")
    return forwarded or xff or ()


def resolve_client_ip(request: Request, trusted_proxy_cidrs: str | Iterable[str | IPNetwork] = ()) -> str:
    """Resolve a client IP without trusting headers from direct clients.

    For a trusted immediate peer, the first address left of the trusted proxy
    suffix is used. Every forwarded hop must be a valid IP address.
    """
    if request.client is None:
        raise InvalidClientAddressError("Request has no socket peer")
    peer = _canonical_ip(request.client.host)
    networks = parse_trusted_proxy_cidrs(trusted_proxy_cidrs)
    if not any(peer.version == network.version and peer in network for network in networks):
        return str(peer)

    forwarded_hops = _header_chain(request)
    if not forwarded_hops:
        return str(peer)

    current = peer
    for hop in reversed(forwarded_hops):
        if not any(current.version == network.version and current in network for network in networks):
            break
        current = hop
    return str(current)


def hash_rate_limit_identity(kind: str, value: str, *, max_bytes: int = 256) -> str:
    """Hash a normalized, bounded identity for use in a Redis key."""
    normalized = value.strip().casefold().encode("utf-8")
    bounded = normalized[:max_bytes]
    digest_input = kind.encode("ascii") + b"\0" + str(len(normalized)).encode("ascii") + b"\0" + bounded
    return hashlib.sha256(digest_input).hexdigest()


@dataclass
class _FallbackEntry:
    count: int
    expires_at: float


class _FallbackWindowStore:
    def __init__(self, max_entries: int, *, clock: Callable[[], float] = time.monotonic):
        self._max_entries = max_entries
        self._clock = clock
        self._entries: dict[str, _FallbackEntry] = {}
        self._lock = asyncio.Lock()

    async def increment(self, key: str, window_seconds: int) -> FixedWindowIncrement | None:
        now = self._clock()
        async with self._lock:
            entry = self._entries.get(key)
            if entry is not None and entry.expires_at <= now:
                del self._entries[key]
                entry = None
            if entry is None:
                if len(self._entries) >= self._max_entries:
                    self._entries = {stored_key: item for stored_key, item in self._entries.items() if item.expires_at > now}
                if len(self._entries) >= self._max_entries:
                    return None
                entry = _FallbackEntry(count=0, expires_at=now + window_seconds)
                self._entries[key] = entry
            entry.count += 1
            return FixedWindowIncrement(entry.count, max(1, math.ceil(entry.expires_at - now)))


class AuthRateLimiter:
    """Apply independent IP and account/share budgets before password hashing."""

    def __init__(
        self,
        settings: AuthRateLimitSettings | None = None,
        redis_service: RedisService | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.settings = settings or get_auth_rate_limit_settings()
        self._redis_service_override = redis_service
        self._trusted_proxy_networks = parse_trusted_proxy_cidrs(self.settings.trusted_proxy_cidrs)
        self._fallback = _FallbackWindowStore(self.settings.fallback_max_entries, clock=clock)

    async def decide(
        self,
        request: Request,
        route: AuthRateLimitRoute | str,
        scope_identity: str,
    ) -> RateLimitDecision:
        resolved_route = AuthRateLimitRoute(route)
        policy = self.settings.policy_for(resolved_route)
        client_ip = resolve_client_ip(request, self._trusted_proxy_networks)
        keys_and_budgets = (
            ("ip", self._key(resolved_route, "ip", client_ip), policy.ip),
            ("scope", self._key(resolved_route, "scope", scope_identity), policy.scope),
        )

        results: list[tuple[str, RateLimitBudget, FixedWindowIncrement | None, str]] = []
        for scope, key, budget in keys_and_budgets:
            increment, backend = await self._increment(key, budget.window_seconds)
            results.append((scope, budget, increment, backend))

        full = any(increment is None for _, _, increment, _ in results)
        limited = tuple(scope for scope, budget, increment, _ in results if increment is not None and increment.count > budget.limit)
        retry_values = [increment.retry_after for _, budget, increment, _ in results if increment is not None and increment.count > budget.limit]
        backends = {backend for _, _, _, backend in results}
        backend = next(iter(backends)) if len(backends) == 1 else "mixed"

        if limited:
            decision = RateLimitDecision(False, max(retry_values), backend, limited)
            self._record(resolved_route, backend, "deny")
            return decision
        if full and policy.fail_closed_when_fallback_full:
            retry_after = max(budget.window_seconds for _, budget, increment, _ in results if increment is None)
            decision = RateLimitDecision(False, retry_after, "fallback_full", ("capacity",))
            self._record(resolved_route, "fallback_full", "fail_closed")
            return decision
        if full:
            decision = RateLimitDecision(True, None, "fallback_full")
            self._record(resolved_route, "fallback_full", "fail_open")
            return decision

        decision = RateLimitDecision(True, None, backend)
        self._record(resolved_route, backend, "allow")
        return decision

    async def enforce(
        self,
        request: Request,
        route: AuthRateLimitRoute | str,
        scope_identity: str,
    ) -> RateLimitDecision:
        """Return the decision or raise an HTTP error suitable for a route."""
        try:
            decision = await self.decide(request, route, scope_identity)
        except InvalidClientAddressError as exc:
            raise HTTPException(status_code=400, detail="Invalid forwarded client address") from exc
        if not decision.allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many authentication attempts",
                headers={"Retry-After": str(decision.retry_after or 1)},
            )
        return decision

    def _key(self, route: AuthRateLimitRoute, scope: str, identity: str) -> str:
        digest = hash_rate_limit_identity(f"{route.value}:{scope}", identity, max_bytes=self.settings.identity_max_bytes)
        return f"auth-limit:{route.value}:{scope}:{digest}"

    async def _increment(self, key: str, window_seconds: int) -> tuple[FixedWindowIncrement | None, str]:
        redis_service = self._redis_service_override or get_redis_service()
        if redis_service is not None:
            result = await redis_service.fixed_window_increment(key, window_seconds)
            if result is not None:
                return result, "redis"
        return await self._fallback.increment(key, window_seconds), "fallback"

    @staticmethod
    def _record(route: AuthRateLimitRoute, backend: str, decision: str) -> None:
        AUTH_RATE_LIMIT_DECISIONS.labels(route=route.value, backend=backend, decision=decision).inc()


_auth_rate_limiter: AuthRateLimiter | None = None


def get_auth_rate_limiter() -> AuthRateLimiter:
    """Return the process-wide limiter so fallback capacity is shared and bounded."""
    global _auth_rate_limiter
    if _auth_rate_limiter is None:
        _auth_rate_limiter = AuthRateLimiter()
    return _auth_rate_limiter
