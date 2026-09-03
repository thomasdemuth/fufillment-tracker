"""USPS APIs (developers.usps.com) Tracking v3 client.

Only the tracking number is ever sent. Responses are normalized into TrackResult."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import date, datetime

import httpx
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.carriers.base import CredentialStatus, NormalizedEvent, TrackError, TrackResult
from app.carriers.oauth import TokenCache
from app.enums import Carrier
from app.http import make_client
from app.services.status_map import USPS_EVENT_CODE, by_keywords, map_usps

log = logging.getLogger("carrier.usps")

PROD = "https://apis.usps.com"
TEST = "https://apis-tem.usps.com"


class Transient(Exception):
    pass


def _parse_dt(v: str | None) -> datetime | None:
    if not v:
        return None
    v = v.strip()
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            d = datetime.strptime(v, fmt)
            if d.tzinfo:
                d = d.astimezone(tz=None).replace(tzinfo=None) if False else d.replace(tzinfo=None)
            return d
        except ValueError:
            continue
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00"))
        return d.replace(tzinfo=None)
    except ValueError:
        return None


def _parse_date(v: str | None) -> date | None:
    d = _parse_dt(v)
    return d.date() if d else None


class USPSClient:
    name = Carrier.USPS
    max_batch = 1
    concurrency = 4

    def __init__(
        self, client_id: str, client_secret: str, sandbox: bool = False, base_url: str | None = None
    ):
        self.base = base_url or (TEST if sandbox else PROD)
        self.client_id, self.client_secret = client_id, client_secret
        self.tokens = TokenCache(self._fetch_token)
        self._sem = asyncio.Semaphore(self.concurrency)

    def _client(self) -> httpx.AsyncClient:
        return make_client("carrier_usps", "tracking_number", base_url=self.base)

    async def _fetch_token(self) -> tuple[str, int]:
        async with self._client() as c:
            r = await c.post(
                "/oauth2/v3/token",
                json={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )
        if r.status_code in (400, 401, 403):
            raise PermissionError(f"USPS rejected the credentials ({r.status_code}): {r.text[:200]}")
        r.raise_for_status()
        j = r.json()
        return j["access_token"], int(j.get("expires_in", 3600))

    async def check_credentials(self) -> CredentialStatus:
        try:
            await self.tokens.get(force=True)
            return CredentialStatus(True, f"Token OK from {self.base}")
        except PermissionError as e:
            return CredentialStatus(False, str(e))
        except Exception as e:
            return CredentialStatus(False, f"Could not reach USPS: {e}")

    async def fetch(self, numbers: list[str]) -> dict[str, TrackResult | TrackError]:
        async def one(n: str) -> tuple[str, TrackResult | TrackError]:
            async with self._sem:
                return n, await self._track(n)

        return dict(await asyncio.gather(*(one(n) for n in numbers)))

    async def _track(self, number: str) -> TrackResult | TrackError:
        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(min=1, max=8),
                retry=retry_if_exception_type(Transient),
                reraise=True,
            ):
                with attempt:
                    return await self._track_once(number)
        except PermissionError as e:
            return TrackError(number, "auth", str(e))
        except Transient as e:
            return TrackError(number, "transient", str(e))
        except Exception as e:  # pragma: no cover
            return TrackError(number, "transient", f"{type(e).__name__}: {e}")
        return TrackError(number, "transient", "no response")

    async def _track_once(self, number: str, retried_auth: bool = False) -> TrackResult | TrackError:
        token = await self.tokens.get()
        async with self._client() as c:
            try:
                r = await c.get(
                    f"/tracking/v3/tracking/{number}",
                    params={"expand": "DETAIL"},
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as e:
                raise Transient(str(e)) from e
        if r.status_code == 401 and not retried_auth:
            self.tokens.invalidate()
            return await self._track_once(number, retried_auth=True)
        if r.status_code in (401, 403):
            raise PermissionError(
                f"USPS authorization failed ({r.status_code}). Check that Tracking is enabled for your app."
            )
        if r.status_code == 404:
            return TrackError(number, "not_found", "USPS has no record of this tracking number yet")
        if r.status_code == 429:
            return TrackError(number, "rate_limited", "USPS rate limit reached; try again later")
        if r.status_code >= 500:
            raise Transient(f"USPS server error {r.status_code}")
        if r.status_code == 400:
            return TrackError(number, "invalid", f"USPS rejected the tracking number: {r.text[:120]}")
        r.raise_for_status()
        return parse_usps(number, r.json())


def parse_usps(number: str, j: dict) -> TrackResult | TrackError:
    if isinstance(j, dict) and j.get("error") and not j.get("trackingEvents"):
        msg = j["error"].get("message") if isinstance(j["error"], dict) else str(j["error"])
        return TrackError(number, "not_found", msg or "USPS returned an error")
    events_raw = j.get("trackingEvents") or []
    events: list[NormalizedEvent] = []
    for e in events_raw:
        code = str(e.get("eventCode") or e.get("eventType") or "")[:30] or None
        desc = (
            str(e.get("eventType") or e.get("eventDescription") or e.get("eventCode") or "").strip()
            or "Event"
        )
        status = USPS_EVENT_CODE.get(code or "") or by_keywords(desc) or map_usps(None, code, desc)[0]
        ts = e.get("eventTimestamp") or ""
        zip_ = str(e.get("eventZIP") or "").strip() or None
        events.append(
            NormalizedEvent(
                at=_parse_dt(ts),
                at_raw=str(ts),
                code=code,
                description=desc,
                status=status,
                city=(e.get("eventCity") or None),
                state=(e.get("eventState") or None),
                postal_code=zip_[:10] if zip_ else None,
                country=(e.get("eventCountry") or "US")[:2],
                raw=e,
            )
        )
    events.sort(key=lambda ev: ev.at or datetime.min, reverse=True)
    latest = events[0] if events else None
    status, flag = map_usps(
        j.get("statusCategory"), latest.code if latest else None, j.get("status") or j.get("statusSummary")
    )
    delivered_at = None
    if status == "delivered":
        delivered_at = (
            latest.at
            if latest and latest.status == "delivered"
            else next((e.at for e in events if e.status == "delivered"), None)
        )
    dest_zip = str(j.get("destinationZIP") or "")[:10] or None
    origin_zip = str(j.get("originZIP") or "")[:10] or None
    m = re.match(r"\d{5}", dest_zip or "")
    return TrackResult(
        tracking_number=number,
        carrier=Carrier.USPS,
        status=status,
        status_raw=str(j.get("status") or j.get("statusSummary") or (latest.description if latest else ""))[
            :255
        ],
        status_code=latest.code if latest else None,
        attention_flag=flag,
        expected_delivery=_parse_date(j.get("expectedDeliveryTimeStamp") or j.get("expectedDeliveryDate")),
        delivered_at=delivered_at,
        origin_postal_code=origin_zip,
        dest_postal_code=m.group(0) if m else None,
        events=events,
        raw=j,
    )
