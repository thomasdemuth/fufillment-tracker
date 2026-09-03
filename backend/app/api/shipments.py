from __future__ import annotations

import statistics
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import shipment_filters, stuck_days
from app.carriers.detect import carrier_link
from app.db import get_db
from app.enums import STATUS_ORDER, NormalizedStatus
from app.models import Shipment, ShipmentTag, ShipmentUpload, Tag, Upload
from app.schemas.common import Facets, Page, ShipmentRow, Stats, TagOut
from app.services.query import (
    ShipmentFilters,
    apply_filters,
    apply_sort,
    attention_expr,
    base_select,
    count,
    days_in_transit_expr,
    now_naive,
)

router = APIRouter(prefix="/shipments")


def shipment_rows(db: Session, shipments: list[Shipment]) -> list[ShipmentRow]:
    if not shipments:
        return []
    ids = [s.id for s in shipments]
    days = {
        r[0]: r[1]
        for r in db.execute(select(Shipment.id, days_in_transit_expr()).where(Shipment.id.in_(ids)))
    }
    tags: dict[int, list[TagOut]] = {}
    for sid, tag in db.execute(
        select(ShipmentTag.shipment_id, Tag).join(Tag).where(ShipmentTag.shipment_id.in_(ids))
    ):
        tags.setdefault(sid, []).append(TagOut.model_validate(tag))
    uploads: dict[int, list[int]] = {}
    for sid, uid in db.execute(
        select(ShipmentUpload.shipment_id, ShipmentUpload.upload_id).where(
            ShipmentUpload.shipment_id.in_(ids)
        )
    ):
        uploads.setdefault(sid, []).append(uid)
    out = []
    for s in shipments:
        row = ShipmentRow.model_validate(s)
        row.days_in_transit = days.get(s.id)
        row.tags = tags.get(s.id, [])
        row.upload_ids = uploads.get(s.id, [])
        row.carrier_url = carrier_link(s.carrier, s.tracking_number)
        out.append(row)
    return out


@router.get("", response_model=Page[ShipmentRow])
def list_shipments(
    f: ShipmentFilters = Depends(shipment_filters),
    sort: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sd: int = Depends(stuck_days),
    db: Session = Depends(get_db),
):
    stmt = apply_filters(base_select(), f, sd)
    total = count(db, stmt)
    stmt = apply_sort(stmt, sort).offset((page - 1) * page_size).limit(page_size)
    rows = db.execute(stmt).scalars().all()
    return Page(items=shipment_rows(db, rows), total=total, page=page, page_size=page_size)


@router.get("/stats", response_model=Stats)
def stats(
    f: ShipmentFilters = Depends(shipment_filters),
    sd: int = Depends(stuck_days),
    db: Session = Depends(get_db),
):
    base = apply_filters(base_select(), f, sd).subquery()
    total = db.execute(select(func.count()).select_from(base)).scalar_one()
    by_status = {s.value: 0 for s in STATUS_ORDER}
    for st, n in db.execute(select(base.c.status, func.count()).group_by(base.c.status)):
        by_status[st] = n
    by_carrier = {c: n for c, n in db.execute(select(base.c.carrier, func.count()).group_by(base.c.carrier))}
    week_ago = now_naive() - timedelta(days=7)
    delivered_7d = db.execute(
        select(func.count())
        .select_from(base)
        .where(base.c.status == NormalizedStatus.DELIVERED, base.c.delivered_at >= week_ago)
    ).scalar_one()
    attention = count(db, apply_filters(base_select(), f, sd).where(attention_expr(sd)))
    not_geocoded = db.execute(
        select(func.count()).select_from(base).where(base.c.dest_lat.is_(None))
    ).scalar_one()
    days = [
        r[0]
        for r in db.execute(
            apply_filters(select(days_in_transit_expr()), f, sd).where(
                Shipment.status == NormalizedStatus.DELIVERED
            )
        )
        if r[0] is not None
    ]
    last_polled = db.execute(select(func.max(base.c.last_polled_at))).scalar_one()
    return Stats(
        total=total,
        by_status=by_status,
        by_carrier=by_carrier,
        delivered_last_7d=delivered_7d,
        attention=attention,
        avg_days_in_transit=round(sum(days) / len(days), 1) if days else None,
        median_days_in_transit=round(statistics.median(days), 1) if days else None,
        not_geocoded=not_geocoded,
        last_polled_at=last_polled,
    )


@router.get("/facets", response_model=Facets)
def facets(db: Session = Depends(get_db)):
    states = [
        r[0]
        for r in db.execute(
            select(Shipment.state).where(Shipment.state.is_not(None)).distinct().order_by(Shipment.state)
        )
    ]
    cities = [
        r[0]
        for r in db.execute(
            select(Shipment.city).where(Shipment.city.is_not(None)).distinct().order_by(Shipment.city)
        )
    ]
    carriers = [r[0] for r in db.execute(select(Shipment.carrier).distinct().order_by(Shipment.carrier))]
    uploads = [
        {
            "id": u.id,
            "filename": u.filename,
            "created_at": u.created_at.isoformat(),
            "count": u.imported_count + u.duplicate_count,
        }
        for u in db.execute(
            select(Upload).where(Upload.status == "committed").order_by(Upload.created_at.desc())
        ).scalars()
    ]
    tags = [TagOut.model_validate(t) for t in db.execute(select(Tag).order_by(Tag.name)).scalars()]
    return Facets(
        states=states,
        cities=cities[:500],
        carriers=carriers,
        uploads=uploads,
        tags=tags,
        statuses=[s.value for s in STATUS_ORDER],
    )


def load_shipment(db: Session, shipment_id: int) -> Shipment:
    s = db.execute(
        select(Shipment)
        .where(Shipment.id == shipment_id)
        .options(selectinload(Shipment.events), selectinload(Shipment.notes))
    ).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Shipment not found")
    return s


# ---------------------------------------------------------------- detail / path / patch / refresh-one
from app.carriers.base import TrackError  # noqa: E402
from app.enums import Carrier  # noqa: E402
from app.geocode.service import geocode_shipments_offline  # noqa: E402
from app.schemas.tracking import EventOut, NoteOut, ShipmentDetail, ShipmentPatch, UploadRef  # noqa: E402
from app.services.refresh import refresh_one  # noqa: E402


def shipment_detail(db: Session, s: Shipment) -> ShipmentDetail:
    row = shipment_rows(db, [s])[0]
    d = ShipmentDetail(
        **row.model_dump(),
        **{
            k: getattr(s, k)
            for k in (
                "email",
                "phone",
                "origin_postal_code",
                "status_code",
                "first_event_at",
                "carrier_locked",
                "geocode_source",
                "created_at",
                "updated_at",
            )
        },
    )
    d.events = [
        EventOut.model_validate(e)
        for e in sorted(s.events, key=lambda e: e.event_at or datetime.min, reverse=True)
    ]
    d.notes = [NoteOut.model_validate(n) for n in sorted(s.notes, key=lambda n: n.created_at, reverse=True)]
    d.uploads = [
        UploadRef(id=u.id, filename=u.filename, row_number=rn)
        for u, rn in db.execute(
            select(Upload, ShipmentUpload.row_number)
            .join(ShipmentUpload, ShipmentUpload.upload_id == Upload.id)
            .where(ShipmentUpload.shipment_id == s.id)
        )
    ]
    return d


@router.get("/{shipment_id}", response_model=ShipmentDetail)
def get_shipment(shipment_id: int, db: Session = Depends(get_db)):
    return shipment_detail(db, load_shipment(db, shipment_id))


@router.get("/{shipment_id}/path.geojson")
def shipment_path(shipment_id: int, db: Session = Depends(get_db)):
    """Origin -> scan locations (chronological, deduped by place) -> destination, as a FeatureCollection."""
    s = load_shipment(db, shipment_id)
    features: list[dict] = []
    coords: list[list[float]] = []
    events = sorted(
        [e for e in s.events if e.lat is not None and e.lng is not None],
        key=lambda e: e.event_at or datetime.min,
    )
    last_place = None
    n = 0
    for e in events:
        place = (round(e.lat, 3), round(e.lng, 3))
        if place == last_place:
            continue
        last_place = place
        n += 1
        label = ", ".join(x for x in (e.city, e.state) if x)
        kind = "origin" if n == 1 else "scan"
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [e.lng, e.lat]},
                "properties": {
                    "kind": kind,
                    "n": n,
                    "label": f"{n}. {label}" if label else str(n),
                    "description": e.description,
                    "at": e.event_at.isoformat() if e.event_at else None,
                    "s": e.normalized_status,
                },
            }
        )
        coords.append([e.lng, e.lat])
    if s.dest_lat is not None and s.dest_lng is not None:
        dest = [s.dest_lng, s.dest_lat]
        delivered = s.status == "delivered"
        at_dest = coords and abs(coords[-1][0] - dest[0]) < 0.01 and abs(coords[-1][1] - dest[1]) < 0.01
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": dest},
                "properties": {
                    "kind": "destination",
                    "label": "Destination" + (" (delivered)" if delivered else ""),
                    "s": s.status,
                    "description": ", ".join(x for x in (s.city, s.state, s.postal_code) if x),
                },
            }
        )
        if coords and not at_dest:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [coords[-1], dest]},
                    "properties": {"future": not delivered},
                }
            )
    if len(coords) >= 2:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {"future": False},
            }
        )
    return {"type": "FeatureCollection", "features": features}


@router.patch("/{shipment_id}", response_model=ShipmentDetail)
def patch_shipment(shipment_id: int, body: ShipmentPatch, db: Session = Depends(get_db)):
    s = load_shipment(db, shipment_id)
    data = body.model_dump(exclude_unset=True)
    address_changed = False
    for k, v in data.items():
        if k == "carrier":
            if v not in (Carrier.USPS, Carrier.FEDEX, Carrier.UNKNOWN):
                raise HTTPException(422, "carrier must be usps, fedex or unknown")
            s.carrier, s.carrier_confidence, s.carrier_locked = v, 1.0, v != Carrier.UNKNOWN
            continue
        if k == "state" and v:
            v = v.upper()[:2]
        if k in ("address1", "address2", "city", "state", "postal_code"):
            address_changed = True
        setattr(s, k, v)
    if address_changed:
        s.dest_lat = s.dest_lng = None
        db.flush()
        geocode_shipments_offline(db, [s.id], force=True)
    db.commit()
    return shipment_detail(db, load_shipment(db, shipment_id))


@router.post("/{shipment_id}/refresh", response_model=ShipmentDetail)
async def refresh_shipment(shipment_id: int, db: Session = Depends(get_db)):
    s = load_shipment(db, shipment_id)
    res = await refresh_one(db, s)
    if isinstance(res, TrackError) and res.kind in ("disabled", "auth", "invalid"):
        raise HTTPException(400, res.message)
    return shipment_detail(db, load_shipment(db, shipment_id))


@router.delete("/{shipment_id}", status_code=204)
def delete_shipment(shipment_id: int, db: Session = Depends(get_db)):
    s = load_shipment(db, shipment_id)
    db.delete(s)
    db.commit()
