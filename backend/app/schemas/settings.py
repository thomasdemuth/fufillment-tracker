from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class CarrierSettingsOut(BaseModel):
    carrier: str
    enabled: bool
    mode: str  # mock | live
    sandbox: bool
    client_id: str | None
    client_secret_masked: str | None
    has_secret: bool
    from_env: bool
    status: str  # ok | error | unconfigured | mock | disabled
    last_check_at: datetime | None
    last_check_ok: bool | None
    last_check_message: str | None


class CarrierSettingsIn(BaseModel):
    enabled: bool | None = None
    mode: str | None = None
    sandbox: bool | None = None
    client_id: str | None = None
    client_secret: str | None = None  # write-only; omit to keep


class CredentialCheck(BaseModel):
    ok: bool
    message: str


class GeocoderSettingsOut(BaseModel):
    provider: str
    api_key_masked: str | None
    has_key: bool
    nominatim_email: str | None


class GeocoderSettingsIn(BaseModel):
    provider: str | None = None
    api_key: str | None = None
    nominatim_email: str | None = None


class GeneralSettings(BaseModel):
    stuck_days: int | None = None
    origin_postal_code: str | None = None
    map_style_url: str | None = None
    map_style_url_dark: str | None = None


class PrivacySummary(BaseModel):
    data_dir: str
    db_size_bytes: int
    uploads_size_bytes: int
    shipments: int
    uploads: int
    events: int
    secrets: list[dict]
    tile_host: str
    geocoder: str
    auth_enabled: bool
    egress: list[dict]
    wipe_token: str


class EgressOut(BaseModel):
    host: str
    purpose: str
    data_classes: str
    count: int
    first_at: datetime
    last_at: datetime
    last_status: str | None
