"""Offline geocoder: ZIP centroid, then city+state centroid, then state centroid. No network."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import zipcodes

from app.enums import GeocodePrecision
from app.geocode.base import AddressQuery, GeoResult

_DATA = Path(__file__).parent / "data" / "us_state_centroids.json"


@lru_cache
def _state_centroids() -> dict[str, tuple[float, float]]:
    return {k: (v[0], v[1]) for k, v in json.loads(_DATA.read_text()).items()}


@lru_cache
def _city_index() -> dict[tuple[str, str], tuple[float, float]]:
    acc: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for z in zipcodes.list_all():
        try:
            lat, lng = float(z["lat"]), float(z["long"])
        except (KeyError, TypeError, ValueError):
            continue
        key = (z["city"].strip().lower(), z["state"])
        acc.setdefault(key, []).append((lat, lng))
        for alt in z.get("acceptable_cities") or []:
            acc.setdefault((alt.strip().lower(), z["state"]), []).append((lat, lng))
    return {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in acc.items()}


def zip_lookup(zip5: str) -> tuple[float, float, str, str] | None:
    """Returns (lat, lng, city, state) for a 5-digit ZIP."""
    try:
        rows = zipcodes.matching(zip5)
    except Exception:
        return None
    for r in rows:
        try:
            return float(r["lat"]), float(r["long"]), r["city"], r["state"]
        except (KeyError, TypeError, ValueError):
            continue
    return None


def geocode_offline(q: AddressQuery) -> GeoResult | None:
    if q.zip5:
        hit = zip_lookup(q.zip5)
        if hit:
            return GeoResult(hit[0], hit[1], GeocodePrecision.ZIP, "zip")
    if q.city and q.state:
        c = _city_index().get((q.city.strip().lower(), q.state.upper()))
        if c:
            return GeoResult(c[0], c[1], GeocodePrecision.CITY, "city_state")
    if q.state and q.state.upper() in _state_centroids():
        lat, lng = _state_centroids()[q.state.upper()]
        return GeoResult(lat, lng, GeocodePrecision.STATE, "state")
    return None


class OfflineZipGeocoder:
    source = "offline"

    async def geocode(self, q: AddressQuery) -> GeoResult | None:
        return geocode_offline(q)
