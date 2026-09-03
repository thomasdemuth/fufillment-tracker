from __future__ import annotations

from datetime import date

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.query import ShipmentFilters
from app.services.settings_store import get_setting


def _split(values: list[str] | None) -> list[str]:
    out: list[str] = []
    for v in values or []:
        out.extend(x for x in v.split(",") if x)
    return out


def shipment_filters(
    status: list[str] | None = Query(None),
    carrier: list[str] | None = Query(None),
    upload_id: list[str] | None = Query(None),
    state: list[str] | None = Query(None),
    tag: list[str] | None = Query(None),
    city: str | None = None,
    q: str | None = None,
    ship_date_from: date | None = None,
    ship_date_to: date | None = None,
    last_event_from: date | None = None,
    last_event_to: date | None = None,
    days_min: float | None = None,
    days_max: float | None = None,
    attention: bool | None = None,
    geocoded: bool | None = None,
    ids: list[str] | None = Query(None),
) -> ShipmentFilters:
    return ShipmentFilters(
        status=_split(status),
        carrier=_split(carrier),
        upload_id=[int(x) for x in _split(upload_id) if x.isdigit()],
        state=_split(state),
        tag=_split(tag),
        city=city,
        q=q,
        ship_date_from=ship_date_from,
        ship_date_to=ship_date_to,
        last_event_from=last_event_from,
        last_event_to=last_event_to,
        days_min=days_min,
        days_max=days_max,
        attention=attention,
        geocoded=geocoded,
        ids=[int(x) for x in _split(ids) if x.isdigit()],
    )


def stuck_days(db: Session = Depends(get_db)) -> int:
    try:
        return int(get_setting(db, "stuck_days", 7) or 7)
    except (TypeError, ValueError):
        return 7
