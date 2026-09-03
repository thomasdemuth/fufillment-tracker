from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import GeocodePrecision
from app.geocode.base import AddressQuery, Geocoder, GeoResult
from app.models import GeocodeCache


class CachingGeocoder:
    """Wraps an online geocoder with the geocode_cache table so each address is sent at most once."""

    def __init__(self, inner: Geocoder, db: Session):
        self.inner = inner
        self.db = db
        self.source = inner.source

    async def geocode(self, q: AddressQuery) -> GeoResult | None:
        key = q.street_key()
        row = self.db.execute(
            select(GeocodeCache).where(GeocodeCache.query_key == key, GeocodeCache.source == self.source)
        ).scalar_one_or_none()
        if row is not None:
            if row.lat is None:
                return None
            return GeoResult(row.lat, row.lng, GeocodePrecision(row.precision), self.source)
        res = await self.inner.geocode(q)
        self.db.add(
            GeocodeCache(
                query_key=key,
                source=self.source,
                lat=res.lat if res else None,
                lng=res.lng if res else None,
                precision=res.precision if res else GeocodePrecision.NONE,
            )
        )
        self.db.commit()
        return res
