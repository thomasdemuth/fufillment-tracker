from __future__ import annotations

from enum import StrEnum


class NormalizedStatus(StrEnum):
    LABEL_CREATED = "label_created"
    IN_TRANSIT = "in_transit"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    EXCEPTION = "exception"
    RETURNED = "returned"
    UNKNOWN = "unknown"


TERMINAL_STATUSES = {NormalizedStatus.DELIVERED, NormalizedStatus.RETURNED}

STATUS_ORDER = [
    NormalizedStatus.EXCEPTION,
    NormalizedStatus.OUT_FOR_DELIVERY,
    NormalizedStatus.IN_TRANSIT,
    NormalizedStatus.LABEL_CREATED,
    NormalizedStatus.DELIVERED,
    NormalizedStatus.RETURNED,
    NormalizedStatus.UNKNOWN,
]


class Carrier(StrEnum):
    USPS = "usps"
    FEDEX = "fedex"
    UNKNOWN = "unknown"


class GeocodePrecision(StrEnum):
    STREET = "street"
    ZIP = "zip"
    CITY = "city"
    STATE = "state"
    NONE = "none"


class UploadStatus(StrEnum):
    PENDING = "pending"
    COMMITTED = "committed"
    FAILED = "failed"


class GeocodeMode(StrEnum):
    OFFLINE = "offline"
    ONLINE = "online"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobKind(StrEnum):
    REFRESH = "refresh"
    GEOCODE = "geocode"
