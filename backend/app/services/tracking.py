"""Apply carrier results to the database."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.carriers.base import TrackError, TrackResult
from app.enums import NormalizedStatus
from app.geocode.base import AddressQuery
from app.geocode.offline_zip import geocode_offline
from app.models import Shipment, TrackingEvent


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _dedupe_key(at_raw: str, code: str | None, city: str | None, desc: str) -> str:
    return hashlib.sha1(
        "|".join([at_raw or "", code or "", (city or "").lower(), desc.strip().lower()]).encode()
    ).hexdigest()[:40]


def _place(city: str | None, state: str | None) -> str | None:
    parts = [p for p in (city, state) if p]
    return ", ".join(parts) if parts else None


def apply_result(db: Session, shipment: Shipment, result: TrackResult) -> bool:
    """Merge a TrackResult into the shipment. Returns True if anything changed."""
    existing_keys = {
        r[0]
        for r in db.execute(select(TrackingEvent.dedupe_key).where(TrackingEvent.shipment_id == shipment.id))
    }
    changed = False
    for ev in result.events:
        key = _dedupe_key(ev.at_raw, ev.code, ev.city, ev.description)
        if key in existing_keys:
            continue
        existing_keys.add(key)
        lat = lng = None
        if ev.postal_code or (ev.city and ev.state):
            g = geocode_offline(AddressQuery(None, ev.city, ev.state, ev.postal_code, ev.country or "US"))
            if g:
                lat, lng = g.lat, g.lng
        db.add(
            TrackingEvent(
                shipment_id=shipment.id,
                event_at=ev.at,
                event_at_raw=ev.at_raw,
                code=ev.code,
                description=ev.description[:500],
                normalized_status=ev.status,
                city=ev.city,
                state=ev.state,
                postal_code=ev.postal_code,
                country=ev.country,
                lat=lat,
                lng=lng,
                raw=ev.raw,
                dedupe_key=key,
            )
        )
        changed = True

    new_fields = {
        "status": result.status,
        "status_raw": result.status_raw[:255] if result.status_raw else None,
        "status_code": result.status_code,
        "attention_flag": result.attention_flag,
        "expected_delivery": result.expected_delivery,
        "delivered_at": result.delivered_at,
        "origin_postal_code": result.origin_postal_code or shipment.origin_postal_code,
    }
    if result.events:
        latest = max(result.events, key=lambda e: e.at or datetime.min)
        first = min(result.events, key=lambda e: e.at or datetime.max)
        new_fields.update(
            last_event_at=latest.at,
            last_event_desc=latest.description[:500],
            last_event_place=_place(latest.city, latest.state),
            first_event_at=first.at or shipment.first_event_at,
        )
        if result.status == NormalizedStatus.DELIVERED and not new_fields["delivered_at"]:
            new_fields["delivered_at"] = latest.at
    for k, v in new_fields.items():
        if getattr(shipment, k) != v:
            setattr(shipment, k, v)
            changed = True
    # Carrier confirmed by a successful fetch
    if shipment.carrier != result.carrier or shipment.carrier_confidence < 1.0:
        shipment.carrier, shipment.carrier_confidence = result.carrier, 1.0
        changed = True
    shipment.last_polled_at = _now()
    shipment.poll_error_count = 0
    shipment.poll_last_error = None
    return changed


def apply_error(db: Session, shipment: Shipment, err: TrackError) -> None:
    shipment.last_polled_at = _now()
    if err.kind == "not_found":
        # A label that the carrier does not know yet is normal for a few days after creation.
        age_days = (_now().date() - shipment.ship_date).days if shipment.ship_date else 0
        if shipment.status in (NormalizedStatus.UNKNOWN, NormalizedStatus.LABEL_CREATED) and age_days <= 7:
            shipment.status = NormalizedStatus.LABEL_CREATED
            shipment.status_raw = "Not yet in carrier system"
            shipment.poll_last_error = None
            return
    shipment.poll_error_count = (shipment.poll_error_count or 0) + 1
    shipment.poll_last_error = f"{err.kind}: {err.message}"[:500]
