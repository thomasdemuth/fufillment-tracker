"""Carrier protocol and normalized tracking result types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal, Protocol

from app.enums import Carrier, NormalizedStatus

ErrorKind = Literal["not_found", "auth", "rate_limited", "transient", "invalid", "disabled"]


@dataclass
class NormalizedEvent:
    at: datetime | None
    at_raw: str
    code: str | None
    description: str
    status: NormalizedStatus
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class TrackResult:
    tracking_number: str
    carrier: Carrier
    status: NormalizedStatus
    status_raw: str
    status_code: str | None = None
    attention_flag: str | None = None
    expected_delivery: date | None = None
    delivered_at: datetime | None = None
    origin_postal_code: str | None = None
    dest_postal_code: str | None = None
    events: list[NormalizedEvent] = field(default_factory=list)
    raw: dict = field(default_factory=dict)


@dataclass
class TrackError:
    tracking_number: str
    kind: ErrorKind
    message: str


@dataclass
class CredentialStatus:
    ok: bool
    message: str


class CarrierClient(Protocol):
    name: Carrier
    max_batch: int

    async def fetch(self, numbers: list[str]) -> dict[str, TrackResult | TrackError]: ...

    async def check_credentials(self) -> CredentialStatus: ...
