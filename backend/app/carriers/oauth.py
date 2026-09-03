"""Client-credentials OAuth token cache shared by the USPS and FedEx clients."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass


@dataclass
class Token:
    access_token: str
    expires_at: float  # epoch seconds


class TokenCache:
    def __init__(self, fetch: Callable[[], Awaitable[tuple[str, int]]], skew: int = 120):
        self._fetch = fetch
        self._skew = skew
        self._token: Token | None = None
        self._lock = asyncio.Lock()

    async def get(self, force: bool = False) -> str:
        async with self._lock:
            if not force and self._token and self._token.expires_at - self._skew > time.time():
                return self._token.access_token
            access, expires_in = await self._fetch()
            self._token = Token(access, time.time() + max(60, int(expires_in or 3600)))
            return access

    def invalidate(self) -> None:
        self._token = None
