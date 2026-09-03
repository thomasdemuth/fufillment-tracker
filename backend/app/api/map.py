from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import shipment_filters, stuck_days
from app.db import get_db
from app.enums import STATUS_ORDER
from app.models import Shipment
from app.services.query import ShipmentFilters, apply_filters, base_select

router = APIRouter(prefix="/map")

JITTER_DEG = 0.004  # ~400 m: spreads points that share a ZIP centroid so clusters/heatmaps read correctly


def _jitter(shipment_id: int) -> tuple[float, float]:
    h = hashlib.sha1(str(shipment_id).encode()).digest()
    dx = (h[0] / 255.0 - 0.5) * 2 * JITTER_DEG
    dy = (h[1] / 255.0 - 0.5) * 2 * JITTER_DEG
    return dx, dy


@router.get("/points.geojson")
def points(
    f: ShipmentFilters = Depends(shipment_filters),
    sd: int = Depends(stuck_days),
    db: Session = Depends(get_db),
):
    stmt = apply_filters(
        select(
            Shipment.id,
            Shipment.dest_lat,
            Shipment.dest_lng,
            Shipment.status,
            Shipment.carrier,
            Shipment.geocode_precision,
            Shipment.recipient_name,
            Shipment.city,
            Shipment.state,
            Shipment.tracking_number,
        ).where(Shipment.dest_lat.is_not(None)),
        f,
        sd,
    )
    features = []
    for sid, lat, lng, status, carrier, precision, name, city, state, tracking in db.execute(stmt):
        dx, dy = (0.0, 0.0) if precision == "street" else _jitter(sid)
        features.append(
            {
                "type": "Feature",
                "id": sid,
                "geometry": {"type": "Point", "coordinates": [round(lng + dx, 6), round(lat + dy, 6)]},
                "properties": {
                    "id": sid,
                    "s": status,
                    "c": carrier,
                    "p": precision,
                    "n": name,
                    "pl": ", ".join(x for x in (city, state) if x),
                    "t": tracking,
                    # weight for the heatmap: exceptions and out-for-delivery are "hotter"
                    "w": 2 if status in ("exception", "returned") else 1,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


@router.get("/states")
def states(
    f: ShipmentFilters = Depends(shipment_filters),
    sd: int = Depends(stuck_days),
    db: Session = Depends(get_db),
):
    base = apply_filters(base_select(), f, sd).subquery()
    out: dict[str, dict] = {}
    for st, status, n in db.execute(
        select(base.c.state, base.c.status, func.count())
        .where(base.c.state.is_not(None))
        .group_by(base.c.state, base.c.status)
    ):
        entry = out.setdefault(st, {"total": 0, "by_status": {s.value: 0 for s in STATUS_ORDER}})
        entry["total"] += n
        entry["by_status"][status] = entry["by_status"].get(status, 0) + n
    return out
