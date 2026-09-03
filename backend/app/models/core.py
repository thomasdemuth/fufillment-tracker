from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    committed_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    sheet_name: Mapped[str | None] = mapped_column(String(255))
    header_row: Mapped[int] = mapped_column(Integer, default=0)
    column_mapping: Mapped[dict | None] = mapped_column(JSON)
    preset_id: Mapped[int | None] = mapped_column(ForeignKey("column_presets.id", ondelete="SET NULL"))
    geocode_mode: Mapped[str] = mapped_column(String(20), default="offline")
    default_carrier: Mapped[str | None] = mapped_column(String(20))
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    imported_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list | None] = mapped_column(JSON)
    raw_path: Mapped[str | None] = mapped_column(String(500))

    links: Mapped[list[ShipmentUpload]] = relationship(back_populates="upload", cascade="all, delete-orphan")


class Shipment(Base):
    __tablename__ = "shipments"
    __table_args__ = (
        Index("ix_shipments_status", "status"),
        Index("ix_shipments_carrier", "carrier"),
        Index("ix_shipments_state", "state"),
        Index("ix_shipments_ship_date", "ship_date"),
        Index("ix_shipments_last_event_at", "last_event_at"),
        Index("ix_shipments_recipient_name", "recipient_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tracking_number: Mapped[str] = mapped_column(String(64), unique=True)
    carrier: Mapped[str] = mapped_column(String(20), default="unknown")
    carrier_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    carrier_locked: Mapped[bool] = mapped_column(Boolean, default=False)

    recipient_name: Mapped[str | None] = mapped_column(String(255))
    company: Mapped[str | None] = mapped_column(String(255))
    address1: Mapped[str | None] = mapped_column(String(255))
    address2: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(2))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    country: Mapped[str] = mapped_column(String(2), default="US")
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    order_ref: Mapped[str | None] = mapped_column(String(120))
    ship_date: Mapped[date | None] = mapped_column(Date)

    status: Mapped[str] = mapped_column(String(30), default="unknown")
    status_raw: Mapped[str | None] = mapped_column(String(255))
    status_code: Mapped[str | None] = mapped_column(String(30))
    attention_flag: Mapped[str | None] = mapped_column(String(30))
    expected_delivery: Mapped[date | None] = mapped_column(Date)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)
    first_event_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_event_desc: Mapped[str | None] = mapped_column(String(500))
    last_event_place: Mapped[str | None] = mapped_column(String(255))
    origin_postal_code: Mapped[str | None] = mapped_column(String(10))

    dest_lat: Mapped[float | None] = mapped_column(Float)
    dest_lng: Mapped[float | None] = mapped_column(Float)
    geocode_precision: Mapped[str] = mapped_column(String(10), default="none")
    geocode_source: Mapped[str | None] = mapped_column(String(30))

    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime)
    poll_error_count: Mapped[int] = mapped_column(Integer, default=0)
    poll_last_error: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    events: Mapped[list[TrackingEvent]] = relationship(
        back_populates="shipment",
        cascade="all, delete-orphan",
        order_by="TrackingEvent.event_at.desc()",
    )
    links: Mapped[list[ShipmentUpload]] = relationship(
        back_populates="shipment", cascade="all, delete-orphan"
    )
    notes: Mapped[list[Note]] = relationship(back_populates="shipment", cascade="all, delete-orphan")
    tag_links: Mapped[list[ShipmentTag]] = relationship(
        back_populates="shipment", cascade="all, delete-orphan"
    )


class ShipmentUpload(Base):
    __tablename__ = "shipment_uploads"

    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), primary_key=True)
    upload_id: Mapped[int] = mapped_column(ForeignKey("uploads.id", ondelete="CASCADE"), primary_key=True)
    row_number: Mapped[int] = mapped_column(Integer)

    shipment: Mapped[Shipment] = relationship(back_populates="links")
    upload: Mapped[Upload] = relationship(back_populates="links")


class TrackingEvent(Base):
    __tablename__ = "tracking_events"
    __table_args__ = (UniqueConstraint("shipment_id", "dedupe_key", name="uq_event_dedupe"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True)
    event_at: Mapped[datetime | None] = mapped_column(DateTime)
    event_at_raw: Mapped[str | None] = mapped_column(String(64))
    code: Mapped[str | None] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(500))
    normalized_status: Mapped[str] = mapped_column(String(30), default="unknown")
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(2))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    country: Mapped[str | None] = mapped_column(String(2))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    raw: Mapped[dict | None] = mapped_column(JSON)
    dedupe_key: Mapped[str] = mapped_column(String(40))

    shipment: Mapped[Shipment] = relationship(back_populates="events")


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"
    __table_args__ = (UniqueConstraint("query_key", "source", name="uq_geocode_query"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    query_key: Mapped[str] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(30))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    precision: Mapped[str] = mapped_column(String(10), default="none")
    raw: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CarrierCredential(Base):
    __tablename__ = "carrier_credentials"

    carrier: Mapped[str] = mapped_column(String(20), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    mode: Mapped[str] = mapped_column(String(10), default="mock")  # live | mock
    sandbox: Mapped[bool] = mapped_column(Boolean, default=False)
    client_id: Mapped[str | None] = mapped_column(String(255))
    client_secret_enc: Mapped[str | None] = mapped_column(Text)
    access_token_enc: Mapped[str | None] = mapped_column(Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_check_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_check_ok: Mapped[bool | None] = mapped_column(Boolean)
    last_check_message: Mapped[str | None] = mapped_column(String(500))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ColumnPreset(Base):
    __tablename__ = "column_presets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    mapping: Mapped[dict] = mapped_column(JSON)
    header_signature: Mapped[str | None] = mapped_column(String(40), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    shipment: Mapped[Shipment] = relationship(back_populates="notes")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    color: Mapped[str] = mapped_column(String(20), default="gray")

    links: Mapped[list[ShipmentTag]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class ShipmentTag(Base):
    __tablename__ = "shipment_tags"

    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

    shipment: Mapped[Shipment] = relationship(back_populates="tag_links")
    tag: Mapped[Tag] = relationship(back_populates="links")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    total: Mapped[int] = mapped_column(Integer, default=0)
    done: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)
    error_sample: Mapped[list | None] = mapped_column(JSON)
    message: Mapped[str | None] = mapped_column(String(500))
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class EgressLog(Base):
    __tablename__ = "egress_log"
    __table_args__ = (UniqueConstraint("host", "purpose", name="uq_egress_host_purpose"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    host: Mapped[str] = mapped_column(String(255))
    purpose: Mapped[str] = mapped_column(String(60))
    data_classes: Mapped[str] = mapped_column(String(120), default="")
    count: Mapped[int] = mapped_column(Integer, default=0)
    first_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_status: Mapped[str | None] = mapped_column(String(20))
