"""Reasons a shipment needs a human look. Mirrors query.attention_expr but explains *why*."""

from __future__ import annotations

from datetime import datetime

from app.enums import NormalizedStatus as S
from app.models import Shipment
from app.services.query import now_naive


def attention_reasons(s: Shipment, stuck_days: int = 7, now: datetime | None = None) -> list[str]:
    now = now or now_naive()
    reasons: list[str] = []
    if s.status == S.EXCEPTION:
        reasons.append("exception")
    if s.status == S.RETURNED:
        reasons.append("returned")
    if s.attention_flag and s.attention_flag not in reasons:
        reasons.append(s.attention_flag)
    if (s.poll_error_count or 0) >= 3:
        reasons.append("poll_errors")
    if s.last_polled_at and s.status in (S.LABEL_CREATED, S.IN_TRANSIT, S.OUT_FOR_DELIVERY, S.UNKNOWN):
        anchor = s.last_event_at or (
            datetime.combine(s.ship_date, datetime.min.time()) if s.ship_date else s.created_at
        )
        stale = (now - anchor).days if anchor else 0
        if stale >= stuck_days:
            reasons.append("stuck_pre_transit" if s.status == S.LABEL_CREATED else "stuck_in_transit")
        start = s.ship_date or (s.first_event_at.date() if s.first_event_at else None)
        if (
            start
            and s.status not in (S.DELIVERED, S.RETURNED)
            and (now.date() - start).days >= stuck_days * 2
        ):
            if "stuck_in_transit" not in reasons and "stuck_pre_transit" not in reasons:
                reasons.append("stuck_in_transit")
    if s.dest_lat is None:
        reasons.append("not_geocoded")
    return reasons
