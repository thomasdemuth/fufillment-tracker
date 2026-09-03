from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import GeocodePrecision
from app.geocode.base import AddressQuery
from app.geocode.offline_zip import geocode_offline
from app.models import Shipment


def geocode_shipments_offline(db: Session, ids: list[int] | None = None, force: bool = False) -> int:
    """Assign ZIP/city/state centroid coordinates to shipments. Returns the number updated."""
    stmt = select(Shipment)
    if ids is not None:
        if not ids:
            return 0
        stmt = stmt.where(Shipment.id.in_(ids))
    if not force:
        stmt = stmt.where(Shipment.dest_lat.is_(None))
    n = 0
    for s in db.execute(stmt).scalars():
        res = geocode_offline(AddressQuery(s.address1, s.city, s.state, s.postal_code, s.country or "US"))
        if res:
            s.dest_lat, s.dest_lng, s.geocode_precision, s.geocode_source = (
                res.lat,
                res.lng,
                res.precision,
                res.source,
            )
            n += 1
        else:
            s.geocode_precision = GeocodePrecision.NONE
    db.flush()
    return n
