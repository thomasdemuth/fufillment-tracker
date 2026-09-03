"""Shared filter/sort builder used by list, stats, map, export and attention endpoints."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from sqlalchemy import Select, and_, case, func, literal, or_, select
from sqlalchemy.orm import Session

from app.enums import NormalizedStatus
from app.models import Shipment, ShipmentTag, ShipmentUpload, Tag


@dataclass
class ShipmentFilters:
    status: list[str] = field(default_factory=list)
    carrier: list[str] = field(default_factory=list)
    upload_id: list[int] = field(default_factory=list)
    state: list[str] = field(default_factory=list)
    city: str | None = None
    ship_date_from: date | None = None
    ship_date_to: date | None = None
    last_event_from: date | None = None
    last_event_to: date | None = None
    days_min: float | None = None
    days_max: float | None = None
    q: str | None = None
    tag: list[str] = field(default_factory=list)
    attention: bool | None = None
    geocoded: bool | None = None
    ids: list[int] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not any(
            [
                self.status,
                self.carrier,
                self.upload_id,
                self.state,
                self.city,
                self.ship_date_from,
                self.ship_date_to,
                self.last_event_from,
                self.last_event_to,
                self.days_min is not None,
                self.days_max is not None,
                self.q,
                self.tag,
                self.attention,
                self.geocoded is not None,
                self.ids,
            ]
        )


def now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def days_in_transit_expr(now: datetime | None = None):
    """SQL expression for days between ship start and delivery (or now)."""
    now = now or now_naive()
    start = func.coalesce(Shipment.ship_date, func.date(Shipment.first_event_at))
    end = func.coalesce(Shipment.delivered_at, literal(now.isoformat(sep=" ")))
    return case(
        (start.is_(None), None),
        else_=func.round(func.julianday(end) - func.julianday(start), 1),
    )


def attention_expr(stuck_days: int = 7):
    """Boolean expression marking shipments that need a look."""
    now = now_naive()
    days = days_in_transit_expr(now)
    stale_days = func.julianday(literal(now.isoformat(sep=" "))) - func.julianday(
        func.coalesce(Shipment.last_event_at, Shipment.ship_date, Shipment.created_at)
    )
    # Shipments that have never been refreshed are not "stuck" - we simply don't know yet.
    polled = Shipment.last_polled_at.is_not(None)
    return or_(
        Shipment.status == NormalizedStatus.EXCEPTION,
        Shipment.status == NormalizedStatus.RETURNED,
        Shipment.attention_flag.is_not(None),
        Shipment.poll_error_count >= 3,
        and_(
            polled,
            Shipment.status.in_([NormalizedStatus.LABEL_CREATED, NormalizedStatus.IN_TRANSIT]),
            stale_days >= stuck_days,
        ),
        and_(
            polled,
            Shipment.status.not_in([NormalizedStatus.DELIVERED, NormalizedStatus.RETURNED]),
            days >= stuck_days * 2,
        ),
    )


SORTABLE = {
    "id": Shipment.id,
    "tracking_number": Shipment.tracking_number,
    "carrier": Shipment.carrier,
    "recipient_name": Shipment.recipient_name,
    "city": Shipment.city,
    "state": Shipment.state,
    "postal_code": Shipment.postal_code,
    "order_ref": Shipment.order_ref,
    "ship_date": Shipment.ship_date,
    "status": Shipment.status,
    "expected_delivery": Shipment.expected_delivery,
    "delivered_at": Shipment.delivered_at,
    "last_event_at": Shipment.last_event_at,
    "last_polled_at": Shipment.last_polled_at,
    "created_at": Shipment.created_at,
    "updated_at": Shipment.updated_at,
    "days_in_transit": "days_in_transit",
}


def apply_filters(stmt: Select, f: ShipmentFilters, stuck_days: int = 7) -> Select:
    if f.ids:
        stmt = stmt.where(Shipment.id.in_(f.ids))
    if f.status:
        stmt = stmt.where(Shipment.status.in_(f.status))
    if f.carrier:
        stmt = stmt.where(Shipment.carrier.in_(f.carrier))
    if f.state:
        stmt = stmt.where(Shipment.state.in_([s.upper() for s in f.state]))
    if f.city:
        stmt = stmt.where(Shipment.city.ilike(f"%{f.city}%"))
    if f.ship_date_from:
        stmt = stmt.where(Shipment.ship_date >= f.ship_date_from)
    if f.ship_date_to:
        stmt = stmt.where(Shipment.ship_date <= f.ship_date_to)
    if f.last_event_from:
        stmt = stmt.where(func.date(Shipment.last_event_at) >= f.last_event_from.isoformat())
    if f.last_event_to:
        stmt = stmt.where(func.date(Shipment.last_event_at) <= f.last_event_to.isoformat())
    if f.days_min is not None:
        stmt = stmt.where(days_in_transit_expr() >= f.days_min)
    if f.days_max is not None:
        stmt = stmt.where(days_in_transit_expr() <= f.days_max)
    if f.q:
        like = f"%{f.q.strip()}%"
        stmt = stmt.where(
            or_(
                Shipment.recipient_name.ilike(like),
                Shipment.tracking_number.ilike(like),
                Shipment.order_ref.ilike(like),
                Shipment.city.ilike(like),
                Shipment.email.ilike(like),
                Shipment.company.ilike(like),
                Shipment.address1.ilike(like),
                Shipment.postal_code.ilike(like),
            )
        )
    if f.upload_id:
        sub = select(ShipmentUpload.shipment_id).where(ShipmentUpload.upload_id.in_(f.upload_id))
        stmt = stmt.where(Shipment.id.in_(sub))
    if f.tag:
        sub = select(ShipmentTag.shipment_id).join(Tag).where(Tag.name.in_(f.tag))
        stmt = stmt.where(Shipment.id.in_(sub))
    if f.attention:
        stmt = stmt.where(attention_expr(stuck_days))
    if f.geocoded is True:
        stmt = stmt.where(Shipment.dest_lat.is_not(None))
    elif f.geocoded is False:
        stmt = stmt.where(Shipment.dest_lat.is_(None))
    return stmt


def apply_sort(stmt: Select, sort: str | None) -> Select:
    sort = sort or "-last_event_at"
    desc = sort.startswith("-")
    key = sort.lstrip("-+")
    col = SORTABLE.get(key)
    if col is None:
        col, desc = Shipment.last_event_at, True
    if isinstance(col, str):
        col = days_in_transit_expr()
    order = col.desc() if desc else col.asc()
    # NULLS LAST for both directions so empty values don't float to the top.
    return stmt.order_by(order.nulls_last(), Shipment.id.desc())


def base_select() -> Select:
    return select(Shipment)


def count(db: Session, stmt: Select) -> int:
    return db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
