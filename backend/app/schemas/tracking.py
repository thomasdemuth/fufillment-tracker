from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel, ShipmentRow


class EventOut(ORMModel):
    id: int
    event_at: datetime | None
    event_at_raw: str | None
    code: str | None
    description: str
    normalized_status: str
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    lat: float | None
    lng: float | None


class NoteOut(ORMModel):
    id: int
    body: str
    created_at: datetime
    updated_at: datetime


class UploadRef(BaseModel):
    id: int
    filename: str
    row_number: int


class ShipmentDetail(ShipmentRow):
    email: str | None
    phone: str | None
    origin_postal_code: str | None
    status_code: str | None
    first_event_at: datetime | None
    carrier_locked: bool
    geocode_source: str | None
    created_at: datetime
    updated_at: datetime
    events: list[EventOut] = []
    notes: list[NoteOut] = []
    uploads: list[UploadRef] = []


class ShipmentPatch(BaseModel):
    carrier: str | None = None
    recipient_name: str | None = None
    company: str | None = None
    address1: str | None = None
    address2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    order_ref: str | None = None
    ship_date: date | None = None
    email: str | None = None
    phone: str | None = None


class RefreshRequest(BaseModel):
    all: bool = False
    shipment_ids: list[int] | None = None
    filters: dict | None = None
    include_terminal: bool = False


class RefreshStarted(BaseModel):
    job_id: int | None
    queued: int


class JobOut(ORMModel):
    id: int
    kind: str
    status: str
    total: int
    done: int
    updated: int
    errors: int
    message: str | None
    error_samples: list[str] = Field(default_factory=list)
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


def job_out(job) -> JobOut:  # noqa: ANN001
    out = JobOut.model_validate(job)
    es = job.error_sample or {}
    out.error_samples = list(es.get("errors", [])) if isinstance(es, dict) else []
    return out
