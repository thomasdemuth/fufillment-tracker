"""FedEx Track API v1 client (developer.fedex.com). Batches up to 30 tracking numbers per call."""

from __future__ import annotations

import logging
from datetime import date, datetime

import httpx
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.carriers.base import CredentialStatus, NormalizedEvent, TrackError, TrackResult
from app.carriers.oauth import TokenCache
from app.enums import Carrier
from app.http import make_client
from app.services.status_map import FEDEX_CODE, by_keywords, map_fedex

log = logging.getLogger("carrier.fedex")

PROD = "https://apis.fedex.com"
SANDBOX = "https://apis-sandbox.fedex.com"


class Transient(Exception):
    pass


def _dt(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d.replace(tzinfo=None)
    except ValueError:
        return None


def _date(v: str | None) -> date | None:
    d = _dt(v)
    return d.date() if d else None


class FedExClient:
    name = Carrier.FEDEX
    max_batch = 30

    def __init__(self, api_key: str, secret_key: str, sandbox: bool = False, base_url: str | None = None):
        self.base = base_url or (SANDBOX if sandbox else PROD)
        self.api_key, self.secret_key = api_key, secret_key
        self.tokens = TokenCache(self._fetch_token)

    def _client(self) -> httpx.AsyncClient:
        return make_client("carrier_fedex", "tracking_number", base_url=self.base)

    async def _fetch_token(self) -> tuple[str, int]:
        async with self._client() as c:
            r = await c.post(
                "/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.api_key,
                    "client_secret": self.secret_key,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if r.status_code in (400, 401, 403):
            raise PermissionError(f"FedEx rejected the credentials ({r.status_code}): {r.text[:200]}")
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
            return CredentialStatus(False, f"Could not reach FedEx: {e}")

    async def fetch(self, numbers: list[str]) -> dict[str, TrackResult | TrackError]:
        out: dict[str, TrackResult | TrackError] = {}
        for i in range(0, len(numbers), self.max_batch):
            chunk = numbers[i : i + self.max_batch]
            try:
                async for attempt in AsyncRetrying(
                    stop=stop_after_attempt(3),
                    wait=wait_exponential(min=1, max=8),
                    retry=retry_if_exception_type(Transient),
                    reraise=True,
                ):
                    with attempt:
                        out.update(await self._track_chunk(chunk))
            except PermissionError as e:
                out.update({n: TrackError(n, "auth", str(e)) for n in chunk})
            except Transient as e:
                out.update({n: TrackError(n, "transient", str(e)) for n in chunk})
            except Exception as e:  # pragma: no cover
                out.update({n: TrackError(n, "transient", f"{type(e).__name__}: {e}") for n in chunk})
        return out

    async def _track_chunk(
        self, chunk: list[str], retried_auth: bool = False
    ) -> dict[str, TrackResult | TrackError]:
        token = await self.tokens.get()
        body = {
            "includeDetailedScans": True,
            "trackingInfo": [{"trackingNumberInfo": {"trackingNumber": n}} for n in chunk],
        }
        async with self._client() as c:
            try:
                r = await c.post(
                    "/track/v1/trackingnumbers",
                    json=body,
                    headers={"Authorization": f"Bearer {token}", "X-locale": "en_US"},
                )
            except httpx.HTTPError as e:
                raise Transient(str(e)) from e
        if r.status_code == 401 and not retried_auth:
            self.tokens.invalidate()
            return await self._track_chunk(chunk, retried_auth=True)
        if r.status_code in (401, 403):
            raise PermissionError(
                f"FedEx authorization failed ({r.status_code}). Check that the Track API is enabled."
            )
        if r.status_code == 429:
            return {
                n: TrackError(n, "rate_limited", "FedEx rate limit reached; try again later") for n in chunk
            }
        if r.status_code >= 500:
            raise Transient(f"FedEx server error {r.status_code}")
        if r.status_code >= 400:
            return {
                n: TrackError(n, "invalid", f"FedEx error {r.status_code}: {r.text[:150]}") for n in chunk
            }
        return parse_fedex(chunk, r.json())


def parse_fedex(requested: list[str], j: dict) -> dict[str, TrackResult | TrackError]:
    out: dict[str, TrackResult | TrackError] = {}
    for ctr in (j.get("output") or {}).get("completeTrackResults") or []:
        number = str(ctr.get("trackingNumber") or "")
        results = ctr.get("trackResults") or []
        if not results:
            out[number] = TrackError(number, "not_found", "No tracking results")
            continue
        tr = results[0]
        if tr.get("error"):
            err = tr["error"]
            code = str(err.get("code", ""))
            kind = "not_found" if "NOT.FOUND" in code or "NOTFOUND" in code.replace(".", "") else "invalid"
            out[number] = TrackError(number, kind, err.get("message") or code)
            continue
        out[number] = _one(number, tr)
    for n in requested:
        out.setdefault(n, TrackError(n, "not_found", "FedEx returned no result for this number"))
    return out


def _one(number: str, tr: dict) -> TrackResult:
    lsd = tr.get("latestStatusDetail") or {}
    events: list[NormalizedEvent] = []
    for e in tr.get("scanEvents") or []:
        code = str(e.get("derivedStatusCode") or e.get("eventType") or "")[:30] or None
        desc = str(e.get("eventDescription") or e.get("derivedStatus") or "Event").strip()
        if e.get("exceptionDescription"):
            desc = f"{desc}: {e['exceptionDescription']}"
        status = (
            FEDEX_CODE.get(code or "") or by_keywords(desc) or map_fedex(code, e.get("eventType"), desc)[0]
        )
        loc = e.get("scanLocation") or {}
        events.append(
            NormalizedEvent(
                at=_dt(e.get("date")),
                at_raw=str(e.get("date") or ""),
                code=code,
                description=desc,
                status=status,
                city=(loc.get("city") or None),
                state=(loc.get("stateOrProvinceCode") or None),
                postal_code=(str(loc.get("postalCode") or "")[:10] or None),
                country=(loc.get("countryCode") or "US")[:2],
                raw=e,
            )
        )
    events.sort(key=lambda ev: ev.at or datetime.min, reverse=True)
    latest = events[0] if events else None
    status, flag = map_fedex(
        lsd.get("derivedCode"), lsd.get("code"), lsd.get("description") or lsd.get("statusByLocale")
    )
    expected = None
    delivered_at = None
    for dt in tr.get("dateAndTimes") or []:
        t = dt.get("type")
        if t in ("ESTIMATED_DELIVERY",) and not expected:
            expected = _date(dt.get("dateTime"))
        if t == "ACTUAL_DELIVERY":
            delivered_at = _dt(dt.get("dateTime"))
    win = tr.get("estimatedDeliveryTimeWindow") or {}
    if not expected and isinstance(win.get("window"), dict):
        expected = _date(win["window"].get("ends") or win["window"].get("begins"))
    if status == "delivered" and not delivered_at and latest:
        delivered_at = latest.at
    origin = ((tr.get("shipperInformation") or {}).get("address") or {}).get("postalCode")
    dest = ((tr.get("recipientInformation") or {}).get("address") or {}).get("postalCode")
    return TrackResult(
        tracking_number=number,
        carrier=Carrier.FEDEX,
        status=status,
        status_raw=str(
            lsd.get("statusByLocale") or lsd.get("description") or (latest.description if latest else "")
        )[:255],
        status_code=lsd.get("derivedCode") or lsd.get("code"),
        attention_flag=flag,
        expected_delivery=expected,
        delivered_at=delivered_at,
        origin_postal_code=str(origin)[:10] if origin else None,
        dest_postal_code=str(dest)[:10] if dest else None,
        events=events,
        raw=tr,
    )
