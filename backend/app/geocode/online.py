"""Optional online street-level geocoders. Only used when the user opts in for an upload."""

from __future__ import annotations

import asyncio
import time

from sqlalchemy.orm import Session

from app.enums import GeocodePrecision
from app.geocode.base import AddressQuery, GeoResult
from app.http import make_client
from app.security import decrypt
from app.services.settings_store import get_setting


def _line(q: AddressQuery) -> str:
    return ", ".join(x for x in (q.address1, q.city, q.state, q.postal_code) if x)


class NominatimGeocoder:
    """OpenStreetMap Nominatim. Policy: max 1 request/second and a contact email in the User-Agent."""

    source = "nominatim"

    def __init__(self, email: str):
        self.email = email
        self._last = 0.0
        self._lock = asyncio.Lock()

    async def geocode(self, q: AddressQuery) -> GeoResult | None:
        async with self._lock:
            wait = 1.05 - (time.monotonic() - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last = time.monotonic()
        async with make_client(
            "geocoder", "address", headers={"User-Agent": f"fulfillment-tracker/0.1 ({self.email})"}
        ) as c:
            r = await c.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "format": "jsonv2",
                    "limit": 1,
                    "countrycodes": "us",
                    "street": q.address1 or "",
                    "city": q.city or "",
                    "state": q.state or "",
                    "postalcode": q.postal_code or "",
                },
            )
        r.raise_for_status()
        rows = r.json()
        if not rows:
            return None
        prec = (
            GeocodePrecision.STREET
            if rows[0].get("addresstype")
            in ("building", "house", "residential", "place", "amenity", "shop", "office")
            or "house_number" in (rows[0].get("display_name") or "")
            else GeocodePrecision.STREET
        )
        return GeoResult(float(rows[0]["lat"]), float(rows[0]["lon"]), prec, self.source)


class GeocodioGeocoder:
    source = "geocodio"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def geocode(self, q: AddressQuery) -> GeoResult | None:
        async with make_client("geocoder", "address") as c:
            r = await c.get(
                "https://api.geocod.io/v1.7/geocode",
                params={"q": _line(q), "api_key": self.api_key, "limit": 1},
            )
        r.raise_for_status()
        results = r.json().get("results") or []
        if not results:
            return None
        loc = results[0]["location"]
        acc = results[0].get("accuracy_type", "")
        prec = (
            GeocodePrecision.STREET
            if acc in ("rooftop", "point", "range_interpolation", "nearest_rooftop_match")
            else GeocodePrecision.ZIP
        )
        return GeoResult(float(loc["lat"]), float(loc["lng"]), prec, self.source)


class MapboxGeocoder:
    source = "mapbox"

    def __init__(self, token: str):
        self.token = token

    async def geocode(self, q: AddressQuery) -> GeoResult | None:
        async with make_client("geocoder", "address") as c:
            r = await c.get(
                "https://api.mapbox.com/search/geocode/v6/forward",
                params={
                    "q": _line(q),
                    "access_token": self.token,
                    "limit": 1,
                    "country": "US",
                    "types": "address",
                },
            )
        r.raise_for_status()
        feats = r.json().get("features") or []
        if not feats:
            return None
        lng, lat = feats[0]["geometry"]["coordinates"]
        return GeoResult(float(lat), float(lng), GeocodePrecision.STREET, self.source)


def build_online_geocoder(db: Session):
    provider = get_setting(db, "geocoder_provider") or "nominatim"
    key = decrypt(get_setting(db, "geocoder_api_key_enc"))
    if provider == "nominatim":
        email = get_setting(db, "nominatim_email")
        return NominatimGeocoder(email) if email else None
    if provider == "geocodio":
        return GeocodioGeocoder(key) if key else None
    if provider == "mapbox":
        return MapboxGeocoder(key) if key else None
    return None
