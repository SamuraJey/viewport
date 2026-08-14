"""Focused tests for authentication rate limiting and proxy trust."""

import asyncio
from dataclasses import dataclass
from uuid import uuid4

import pytest
from fastapi import HTTPException, Request

from viewport.services.auth_rate_limiter import AuthRateLimiter, AuthRateLimitRoute, AuthRateLimitSettings, InvalidClientAddressError, hash_rate_limit_identity, resolve_client_ip
from viewport.services.redis_service import RedisService, RedisSettings


def make_request(peer: str, headers: dict[str, str] | None = None) -> Request:
    encoded_headers = [(name.lower().encode("ascii"), value.encode("ascii")) for name, value in (headers or {}).items()]
    return Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "https",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": encoded_headers,
            "client": (peer, 12345),
            "server": ("testserver", 443),
        }
    )


def limiter_settings(**overrides: object) -> AuthRateLimitSettings:
    values: dict[str, object] = {
        "user_login_ip_limit": 20,
        "user_login_ip_window_seconds": 60,
        "user_login_scope_limit": 20,
        "user_login_scope_window_seconds": 60,
        "admin_login_ip_limit": 20,
        "admin_login_ip_window_seconds": 60,
        "admin_login_scope_limit": 20,
        "admin_login_scope_window_seconds": 60,
        "share_unlock_ip_limit": 20,
        "share_unlock_ip_window_seconds": 60,
        "share_unlock_scope_limit": 20,
        "share_unlock_scope_window_seconds": 60,
        "fallback_max_entries": 100,
        "trusted_proxy_cidrs": "",
    }
    values.update(overrides)
    return AuthRateLimitSettings(**values)


@dataclass
class FakeClock:
    value: float = 100.0

    def __call__(self) -> float:
        return self.value


def unavailable_redis() -> RedisService:
    return RedisService(None, None, available=False)


class TestClientIpResolution:
    def test_untrusted_peer_cannot_spoof_forwarded_headers(self):
        request = make_request(
            "203.0.113.9",
            {
                "Forwarded": 'for="not-an-ip"',
                "X-Forwarded-For": "198.51.100.2",
            },
        )

        assert resolve_client_ip(request, "10.0.0.0/8") == "203.0.113.9"

    def test_trusted_proxy_chain_uses_first_untrusted_hop(self):
        request = make_request("10.0.0.8", {"X-Forwarded-For": "192.0.2.44, 10.1.0.2"})

        assert resolve_client_ip(request, "10.0.0.0/8") == "192.0.2.44"

    def test_forwarded_ipv6_is_canonicalized(self):
        request = make_request("10.0.0.8", {"Forwarded": 'for="[2001:0db8:0:0::1]:443";proto=https'})

        assert resolve_client_ip(request, "10.0.0.0/8") == "2001:db8::1"

    @pytest.mark.parametrize(
        "headers",
        [
            {"X-Forwarded-For": "192.0.2.1, definitely-invalid"},
            {"Forwarded": "for=unknown"},
            {"Forwarded": 'for="[2001:db8::1"'},
            {"Forwarded": "for=192.0.2.1", "X-Forwarded-For": "192.0.2.2"},
        ],
    )
    def test_trusted_proxy_rejects_malformed_or_disagreeing_chains(self, headers: dict[str, str]):
        with pytest.raises(InvalidClientAddressError):
            resolve_client_ip(make_request("10.0.0.8", headers), "10.0.0.0/8")

    def test_socket_ipv6_is_canonicalized(self):
        assert resolve_client_ip(make_request("2001:0db8:0:0::9")) == "2001:db8::9"


class TestAuthRateLimiterBudgets:
    @pytest.mark.asyncio
    async def test_per_ip_budget_survives_rotating_account_identity(self):
        limiter = AuthRateLimiter(
            limiter_settings(user_login_ip_limit=2, user_login_scope_limit=10),
            unavailable_redis(),
        )
        request = make_request("192.0.2.10")

        assert (await limiter.decide(request, AuthRateLimitRoute.USER_LOGIN, "one@example.com")).allowed
        assert (await limiter.decide(request, AuthRateLimitRoute.USER_LOGIN, "two@example.com")).allowed
        decision = await limiter.decide(request, AuthRateLimitRoute.USER_LOGIN, "three@example.com")

        assert decision.allowed is False
        assert decision.limited_scopes == ("ip",)

    @pytest.mark.asyncio
    async def test_per_scope_budget_survives_rotating_ip_identity(self):
        limiter = AuthRateLimiter(
            limiter_settings(user_login_ip_limit=10, user_login_scope_limit=2),
            unavailable_redis(),
        )

        assert (await limiter.decide(make_request("192.0.2.1"), "user_login", "same@example.com")).allowed
        assert (await limiter.decide(make_request("192.0.2.2"), "user_login", "SAME@example.com ")).allowed
        decision = await limiter.decide(make_request("192.0.2.3"), "user_login", "same@example.com")

        assert decision.allowed is False
        assert decision.limited_scopes == ("scope",)

    @pytest.mark.asyncio
    async def test_route_budgets_are_independent(self):
        limiter = AuthRateLimiter(
            limiter_settings(
                user_login_ip_limit=1,
                user_login_scope_limit=1,
                admin_login_ip_limit=1,
                admin_login_scope_limit=1,
            ),
            unavailable_redis(),
        )
        request = make_request("192.0.2.1")

        assert (await limiter.decide(request, "user_login", "owner@example.com")).allowed
        assert not (await limiter.decide(request, "user_login", "owner@example.com")).allowed
        assert (await limiter.decide(request, "admin_login", "owner@example.com")).allowed

    @pytest.mark.asyncio
    async def test_fallback_window_resets_and_reports_retry_after(self):
        clock = FakeClock()
        limiter = AuthRateLimiter(
            limiter_settings(user_login_ip_limit=1, user_login_scope_limit=1),
            unavailable_redis(),
            clock=clock,
        )
        request = make_request("192.0.2.1")

        assert (await limiter.decide(request, "user_login", "owner@example.com")).allowed
        limited = await limiter.decide(request, "user_login", "owner@example.com")
        assert limited.allowed is False
        assert limited.retry_after == 60

        clock.value += 60
        assert (await limiter.decide(request, "user_login", "owner@example.com")).allowed

    @pytest.mark.asyncio
    async def test_enforce_raises_429_with_retry_after(self):
        limiter = AuthRateLimiter(
            limiter_settings(share_unlock_ip_limit=1, share_unlock_scope_limit=1),
            unavailable_redis(),
        )
        request = make_request("192.0.2.1")
        await limiter.enforce(request, "share_unlock", "share-id")

        with pytest.raises(HTTPException) as caught:
            await limiter.enforce(request, "share_unlock", "share-id")

        assert caught.value.status_code == 429
        assert caught.value.headers == {"Retry-After": "60"}

    @pytest.mark.asyncio
    async def test_enforce_rejects_malformed_trusted_chain(self):
        limiter = AuthRateLimiter(
            limiter_settings(trusted_proxy_cidrs="10.0.0.0/8"),
            unavailable_redis(),
        )

        with pytest.raises(HTTPException) as caught:
            await limiter.enforce(
                make_request("10.0.0.1", {"X-Forwarded-For": "bad-address"}),
                "user_login",
                "owner@example.com",
            )

        assert caught.value.status_code == 400


class TestAuthRateLimiterOutagePolicy:
    @pytest.mark.asyncio
    async def test_redis_outage_uses_bounded_fallback(self):
        limiter = AuthRateLimiter(
            limiter_settings(user_login_ip_limit=1, user_login_scope_limit=1),
            unavailable_redis(),
        )
        request = make_request("192.0.2.1")

        first = await limiter.decide(request, "user_login", "owner@example.com")
        second = await limiter.decide(request, "user_login", "owner@example.com")

        assert first.backend == "fallback"
        assert first.allowed is True
        assert second.allowed is False

    @pytest.mark.asyncio
    async def test_full_fallback_fails_open_only_for_ordinary_login(self):
        limiter = AuthRateLimiter(limiter_settings(fallback_max_entries=1), unavailable_redis())
        request = make_request("192.0.2.1")

        user = await limiter.decide(request, "user_login", "owner@example.com")
        admin = await limiter.decide(request, "admin_login", "owner@example.com")
        share = await limiter.decide(request, "share_unlock", "share-id")

        assert user.allowed is True
        assert user.backend == "fallback_full"
        assert admin.allowed is False
        assert admin.retry_after == 60
        assert share.allowed is False
        assert share.retry_after == 60


@pytest.mark.asyncio
async def test_redis_budget_is_shared_across_limiter_instances(valkey_container: str):
    redis_settings = RedisSettings(redis_url=valkey_container)
    first_service = RedisService(None, None, available=False)
    for _ in range(30):
        first_service = await RedisService.create(redis_settings)
        if first_service.is_available:
            break
        await asyncio.sleep(0.1)
    second_service = await RedisService.create(redis_settings)
    settings = limiter_settings(user_login_ip_limit=1, user_login_scope_limit=1)
    first_limiter = AuthRateLimiter(settings, first_service)
    second_limiter = AuthRateLimiter(settings, second_service)
    identity = f"shared-{uuid4()}@example.com"
    request = make_request("2001:db8::1234")

    try:
        assert first_service.is_available
        assert second_service.is_available
        assert (await first_limiter.decide(request, "user_login", identity)).allowed
        denied = await second_limiter.decide(request, "user_login", identity)
        assert denied.allowed is False
        assert denied.backend == "redis"
        assert denied.retry_after is not None
    finally:
        await first_service.close()
        await second_service.close()


def test_hashed_identity_is_fixed_length_and_contains_no_raw_identity():
    raw = "A" * 20_000 + "@Example.com"

    digest = hash_rate_limit_identity("user_login:scope", raw, max_bytes=64)

    assert len(digest) == 64
    assert raw.casefold() not in digest
