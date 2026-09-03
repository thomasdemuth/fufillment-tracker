from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import shipment_filters, stuck_days
from app.api.shipments import shipment_rows
from app.db import get_db
from app.models import Shipment
from app.schemas.common import ShipmentRow
from app.services.attention import attention_reasons
from app.services.query import ShipmentFilters, apply_filters, apply_sort, attention_expr, base_select

router = APIRouter()


class AttentionRow(ShipmentRow):
    reasons: list[str] = []


@router.get("/attention", response_model=list[AttentionRow])
def attention(
    f: ShipmentFilters = Depends(shipment_filters),
    sd: int = Depends(stuck_days),
    sort: str | None = None,
    limit: int = Query(500, le=2000),
    db: Session = Depends(get_db),
):
    stmt = apply_filters(base_select(), f, sd).where(or_(attention_expr(sd), Shipment.dest_lat.is_(None)))
    rows = db.execute(apply_sort(stmt, sort or "-last_event_at").limit(limit)).scalars().all()
    out = []
    for r, s in zip(shipment_rows(db, rows), rows, strict=True):
        a = AttentionRow(**r.model_dump())
        a.reasons = attention_reasons(s, sd)
        if a.reasons:
            out.append(a)
    # exceptions first, then stuck, then everything else
    prio = {
        "exception": 0,
        "returned": 1,
        "delivery_failed": 1,
        "pickup": 2,
        "poll_errors": 3,
        "stuck_pre_transit": 4,
        "stuck_in_transit": 4,
        "not_geocoded": 9,
    }
    out.sort(key=lambda a: min(prio.get(x, 5) for x in a.reasons))
    return out
