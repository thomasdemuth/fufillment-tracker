from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.enums import GeocodePrecision


@dataclass(frozen=True)
class AddressQuery:
    address1: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str = "US"

    @property
    def zip5(self) -> str | None:
        if self.postal_code and len(self.postal_code) >= 5 and self.postal_code[:5].isdigit():
            return self.postal_code[:5]
        return None

    def street_key(self) -> str:
        return "|".join(
            (self.address1 or "", self.city or "", self.state or "", self.postal_code or "")
        ).lower()


@dataclass(frozen=True)
class GeoResult:
    lat: float
    lng: float
    precision: GeocodePrecision
    source: str


class Geocoder(Protocol):
    source: str

    async def geocode(self, q: AddressQuery) -> GeoResult | None: ...
