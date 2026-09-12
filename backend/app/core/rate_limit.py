"""In-process sliding-window rate limiting for public/credential endpoints (§10).

This is deliberately simple and process-local — sufficient for a single-instance
deployment and for exercising the 429 path in tests. A multi-instance deployment
should swap this for a shared Redis-backed limiter (flagged for a later issue).

Every limiter registers itself in a module-level registry so callers (notably
the test suite) can reset *all* of them without maintaining a hand-written
import list that silently goes stale when a new limiter is added.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.config import settings

# Every SlidingWindowRateLimiter ever constructed. Limiters are module-level
# singletons created at import time, so this never grows unboundedly.
_REGISTRY: list[SlidingWindowRateLimiter] = []
_REGISTRY_LOCK = threading.Lock()


class SlidingWindowRateLimiter:
    def __init__(self, max_hits: int, window_seconds: float = 60.0) -> None:
        self.max_hits = max_hits
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        with _REGISTRY_LOCK:
            _REGISTRY.append(self)

    def check(self, key: str) -> bool:
        """Register a hit for ``key``; return ``True`` if still within the limit."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_hits:
                return False
            bucket.append(now)
            return True

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


def reset_all() -> None:
    """Clear every registered limiter's state.

    Used by the test suite's autouse fixture so limiter budgets never leak
    between tests. Because limiters self-register, a limiter added in a future
    issue is covered automatically — no fixture edit required.
    """
    with _REGISTRY_LOCK:
        limiters = tuple(_REGISTRY)
    for limiter in limiters:
        limiter.reset()


def client_ip(request: Request) -> str:
    """Best-effort client address to key rate limiting on.

    ``request.client.host`` is the address of whoever opened the TCP connection.
    Behind a reverse proxy (Railway/Render/nginx) that is the *proxy*, so every
    user collapses into a single bucket and one attacker can lock out the whole
    user base. ``X-Forwarded-For`` fixes that, but it is attacker-controlled
    unless the trusted hop count is known — a client can simply send a forged
    header and mint a fresh bucket per request, bypassing the limiter entirely.

    So the header is consulted ONLY when ``TRUSTED_PROXY_COUNT`` says how many
    proxies sit in front of the app. XFF is appended left-to-right as a request
    traverses proxies, so with N trusted proxies the real client is the Nth
    entry from the right; everything to its left is client-supplied and ignored.

    Defaults to 0 (header ignored entirely), which preserves the direct-connection
    behaviour and is always safe — a misconfiguration can only over-group
    requests, never let an attacker escape their bucket.
    """
    peer = request.client.host if request.client else "unknown"
    depth = settings.TRUSTED_PROXY_COUNT
    if depth <= 0:
        return peer

    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer
    hops = [part.strip() for part in forwarded.split(",") if part.strip()]

    index = len(hops) - depth
    if index < 0:
        # Fewer hops than configured proxies — the chain is shorter than we were
        # told to expect, so we cannot tell which entry is trustworthy. Fail
        # CLOSED to the unspoofable peer address rather than trusting hops[0],
        # which the client fully controls.
        return peer
    return hops[index]
