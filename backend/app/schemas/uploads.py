from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class UploadOut(ORMModel):
    id: int
    filename: str
    size_bytes: int
    created_at: datetime
    committed_at: datetime | None
    status: str
    sheet_name: str | None
    header_row: int
    column_mapping: dict | None
    preset_id: int | None
    geocode_mode: str
    default_carrier: str | None
    row_count: int
    imported_count: int
    duplicate_count: int
    skipped_count: int
    errors: list | None
    shipment_count: int = 0


class UploadPreview(BaseModel):
    upload_id: int
    filename: str
    sheets: list[str]
    sheet: str
    header_row: int
    headers: list[str]
    sample_rows: list[list[str]]
    row_count: int
    suggested_mapping: dict[str, str]
    matched_preset_id: int | None
    fields: list[dict]
    carrier_detection: dict


class CommitRequest(BaseModel):
    sheet: str | None = None
    header_row: int = 0
    mapping: dict[str, str] = Field(default_factory=dict)
    geocode_mode: str = "offline"
    default_carrier: str | None = None
    save_preset_as: str | None = None
    preset_id: int | None = None


class CommitResult(BaseModel):
    upload: UploadOut
    imported: int
    duplicates: int
    skipped: int
    errors: list[dict]
    geocode_job_id: int | None = None


class PresetIn(BaseModel):
    name: str
    mapping: dict[str, str]
    headers: list[str] | None = None


class PresetOut(ORMModel):
    id: int
    name: str
    mapping: dict
    header_signature: str | None
    created_at: datetime
    last_used_at: datetime | None
