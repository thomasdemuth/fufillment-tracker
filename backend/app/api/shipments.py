from __future__ import annotations

import statistics
from datetime import timedelta

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
