from __future__ import annotations

from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class TagOut(ORMModel):
    id: int
    name: str
    color: str


class ShipmentRow(ORMModel):
    id: int
    tracking_number: str
    carrier: str
    carrier_confidence: float
    recipient_name: str | None
    company: str | None
    address1: str | None
    address2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str
    order_ref: str | None
    ship_date: date | None
    status: str
    status_raw: str | None
    attention_flag: str | None
    expected_delivery: date | None
    delivered_at: datetime | None
    last_event_at: datetime | None
    last_event_desc: str | None
    last_event_place: str | None
    dest_lat: float | None
    dest_lng: float | None
    geocode_precision: str
    last_polled_at: datetime | None
    poll_error_count: int
    poll_last_error: str | None
    days_in_transit: float | None = None
    tags: list[TagOut] = []
    upload_ids: list[int] = []
    carrier_url: str | None = None


class StatusCount(BaseModel):
    status: str
    count: int


class Stats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_carrier: dict[str, int]
    delivered_last_7d: int
    attention: int
    avg_days_in_transit: float | None
    median_days_in_transit: float | None
    not_geocoded: int
    last_polled_at: datetime | None


class Facets(BaseModel):
    states: list[str]
    cities: list[str]
    carriers: list[str]
    uploads: list[dict]
    tags: list[TagOut]
    statuses: list[str]
