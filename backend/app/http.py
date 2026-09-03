"""Single outbound HTTP client. Every request that leaves the machine goes through here and is
recorded in the egress log (host + purpose + data classes), never the payload."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx
from sqlalchemy import select

from app.db import session_factory
from app.models import EgressLog

log = logging.getLogger("egress")


def record_egress(host: str, purpose: str, data_classes: str, status: str | None) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    try:
        with session_factory()() as db:
            row = db.execute(
                select(EgressLog).where(EgressLog.host == host, EgressLog.purpose == purpose)
            ).scalar_one_or_none()
            if row is None:
                row = EgressLog(host=host, purpose=purpose, data_classes=data_classes, first_at=now)
                db.add(row)
            row.count = (row.count or 0) + 1
            row.last_at = now
            row.last_status = status
            row.data_classes = data_classes
            db.commit()
    except Exception:  # pragma: no cover - logging must never break a request
        log.exception("failed to record egress")


def make_client(purpose: str, data_classes: str, timeout: float = 30.0, **kwargs) -> httpx.AsyncClient:
    async def on_response(response: httpx.Response) -> None:
        record_egress(response.request.url.host, purpose, data_classes, str(response.status_code))

    async def on_request(request: httpx.Request) -> None:
        log.info("egress %s %s [%s]", request.method, request.url.host, purpose)

    return httpx.AsyncClient(
        timeout=timeout,
        event_hooks={"request": [on_request], "response": [on_response]},
        headers={"User-Agent": "fulfillment-tracker/0.1 (self-hosted)"},
        **kwargs,
    )
