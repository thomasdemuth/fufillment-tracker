from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.carriers.detect import detect_carrier
from app.config import get_settings
from app.db import get_db
from app.enums import Carrier
from app.geocode.service import geocode_shipments_offline
from app.models import ColumnPreset, Shipment, ShipmentUpload, Upload
from app.schemas.uploads import CommitRequest, CommitResult, UploadOut, UploadPreview
from app.services.importer import import_rows
from app.services.mapping import ALL_FIELDS, FIELD_SYNONYMS, header_signature, suggest_mapping
from app.services.normalize import normalize_tracking
from app.services.spreadsheet import detect_header_row, read_workbook, table_from_rows

router = APIRouter(prefix="/uploads")

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
FIELD_LABELS = {
    "tracking_number": "Tracking number",
    "carrier": "Carrier",
    "recipient_name": "Recipient name",
    "company": "Company",
    "address1": "Address line 1",
    "address2": "Address line 2",
    "city": "City",
    "state": "State",
    "postal_code": "ZIP / postal code",
    "city_state_zip": "Combined 'City, ST ZIP'",
    "country": "Country",
    "email": "Email",
    "phone": "Phone",
    "order_ref": "Order / reference",
    "ship_date": "Ship date",
    "status": "Status (from sheet)",
}


def _upload_out(db: Session, u: Upload) -> UploadOut:
    out = UploadOut.model_validate(u)
    out.shipment_count = db.execute(
        select(func.count()).select_from(ShipmentUpload).where(ShipmentUpload.upload_id == u.id)
    ).scalar_one()
    return out


def _preview(db: Session, u: Upload, sheet: str | None, header_row: int | None) -> UploadPreview:
    wb = read_workbook(Path(u.raw_path))
    sh = wb.sheet(sheet)
    hr = detect_header_row(sh.rows) if header_row is None else max(0, header_row)
    headers, body = table_from_rows(sh.rows, hr)
    sample = body[:50]
    suggested = suggest_mapping(headers, sample)
    sig = header_signature(headers)
    preset = db.execute(select(ColumnPreset).where(ColumnPreset.header_signature == sig)).scalars().first()
    if preset:
        # Only keep preset entries whose headers still exist in this file.
        suggested = {f: h for f, h in preset.mapping.items() if h in headers} or suggested

    # Carrier detection summary across the sample so the UI can ask for a default carrier when ambiguous.
    detection = {"usps": 0, "fedex": 0, "unknown": 0, "low_confidence": 0}
    th = suggested.get("tracking_number")
    if th and th in headers:
        i = headers.index(th)
        for r in sample:
            c, conf = detect_carrier(normalize_tracking(r[i] if i < len(r) else None))
            detection[c] = detection.get(c, 0) + 1
            if c != Carrier.UNKNOWN and conf < 0.7:
                detection["low_confidence"] += 1

    return UploadPreview(
        upload_id=u.id,
        filename=u.filename,
        sheets=[s.name for s in wb.sheets],
        sheet=sh.name,
        header_row=hr,
        headers=headers,
        sample_rows=sample[:20],
        row_count=len(body),
        suggested_mapping=suggested,
        matched_preset_id=preset.id if preset else None,
        fields=[
            {
                "key": f,
                "label": FIELD_LABELS.get(f, f),
                "required": f == "tracking_number",
                "hints": FIELD_SYNONYMS[f][:4],
            }
            for f in ALL_FIELDS
        ],
        carrier_detection=detection,
    )


@router.post("", response_model=UploadPreview, status_code=201)
async def create_upload(file: UploadFile = File(...), db: Session = Depends(get_db)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 50 MB)")
    name = Path(file.filename or "upload").name
    ext = Path(name).suffix.lower() or ".csv"
    u = Upload(filename=name, sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data), status="pending")
    db.add(u)
    db.flush()
    path = get_settings().uploads_dir / f"{u.id}{ext}"
    path.write_bytes(data)
    u.raw_path = str(path)
    try:
        preview = _preview(db, u, None, None)
    except Exception as e:
        db.rollback()
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"Could not read spreadsheet: {e}") from e
    u.sheet_name, u.header_row, u.row_count = preview.sheet, preview.header_row, preview.row_count
    db.commit()
    return preview


@router.get("", response_model=list[UploadOut])
def list_uploads(db: Session = Depends(get_db)):
    rows = db.execute(select(Upload).order_by(Upload.created_at.desc())).scalars().all()
    return [_upload_out(db, u) for u in rows]


@router.get("/{upload_id}", response_model=UploadOut)
def get_upload(upload_id: int, db: Session = Depends(get_db)):
    u = db.get(Upload, upload_id)
    if not u:
        raise HTTPException(404, "Upload not found")
    return _upload_out(db, u)


@router.get("/{upload_id}/preview", response_model=UploadPreview)
def preview_upload(
    upload_id: int, sheet: str | None = None, header_row: int | None = None, db: Session = Depends(get_db)
):
    u = db.get(Upload, upload_id)
    if not u or not u.raw_path or not Path(u.raw_path).exists():
        raise HTTPException(404, "Upload not found")
    return _preview(db, u, sheet, header_row)


@router.post("/{upload_id}/commit", response_model=CommitResult)
def commit_upload(upload_id: int, body: CommitRequest, bg: BackgroundTasks, db: Session = Depends(get_db)):
    u = db.get(Upload, upload_id)
    if not u or not u.raw_path:
        raise HTTPException(404, "Upload not found")
    if u.status == "committed":
        raise HTTPException(409, "Upload already committed")
    if "tracking_number" not in body.mapping:
        raise HTTPException(422, "A tracking number column is required")
    wb = read_workbook(Path(u.raw_path))
    sh = wb.sheet(body.sheet)
    headers, rows = table_from_rows(sh.rows, body.header_row)
    missing = [h for h in body.mapping.values() if h not in headers]
    if missing:
        raise HTTPException(422, f"Mapped columns not found in sheet: {missing}")

    u.sheet_name, u.header_row, u.column_mapping = sh.name, body.header_row, body.mapping
    u.geocode_mode, u.default_carrier, u.row_count = body.geocode_mode, body.default_carrier, len(rows)

    if body.save_preset_as:
        preset = db.execute(
            select(ColumnPreset).where(ColumnPreset.name == body.save_preset_as)
        ).scalar_one_or_none()
        if preset:
            preset.mapping = body.mapping
            preset.header_signature = header_signature(headers)
        else:
            preset = ColumnPreset(
                name=body.save_preset_as, mapping=body.mapping, header_signature=header_signature(headers)
            )
            db.add(preset)
        db.flush()
        u.preset_id = preset.id
    elif body.preset_id:
        u.preset_id = body.preset_id
    if u.preset_id:
        p = db.get(ColumnPreset, u.preset_id)
        if p:
            p.last_used_at = datetime.now(UTC).replace(tzinfo=None)

    summary = import_rows(db, u, headers, rows, body.mapping, body.default_carrier)
    u.imported_count, u.duplicate_count, u.skipped_count = (
        summary.imported,
        summary.duplicates,
        summary.skipped,
    )
    u.errors = summary.errors[:50]
    u.status = "committed"
    u.committed_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()

    # Offline geocoding is fast and private: do it inline.
    ids = [
        r[0] for r in db.execute(select(ShipmentUpload.shipment_id).where(ShipmentUpload.upload_id == u.id))
    ]
    geocode_shipments_offline(db, ids)
    db.commit()

    geocode_job_id = None
    if body.geocode_mode == "online" and ids:
        from app.models import Job
        from app.services.geocode_job import run_geocode_job

        job = Job(kind="geocode", status="queued", total=len(ids), error_sample={"ids": ids, "errors": []})
        db.add(job)
        db.commit()
        geocode_job_id = job.id
        bg.add_task(run_geocode_job, job.id)

    return CommitResult(
        geocode_job_id=geocode_job_id,
        upload=_upload_out(db, u),
        imported=summary.imported,
        duplicates=summary.duplicates,
        skipped=summary.skipped,
        errors=summary.errors[:50],
    )


@router.delete("/{upload_id}", status_code=204)
def delete_upload(upload_id: int, db: Session = Depends(get_db)):
    """Delete an upload and the shipments that came only from it. Shipments also present in another
    upload are kept."""
    u = db.get(Upload, upload_id)
    if not u:
        raise HTTPException(404, "Upload not found")
    mine = {
        r[0] for r in db.execute(select(ShipmentUpload.shipment_id).where(ShipmentUpload.upload_id == u.id))
    }
    shared = {
        r[0]
        for r in db.execute(
            select(ShipmentUpload.shipment_id).where(
                ShipmentUpload.shipment_id.in_(mine), ShipmentUpload.upload_id != u.id
            )
        )
    }
    exclusive = mine - shared
    if exclusive:
        for s in db.execute(select(Shipment).where(Shipment.id.in_(exclusive))).scalars():
            db.delete(s)
    if u.raw_path:
        Path(u.raw_path).unlink(missing_ok=True)
    db.delete(u)
    db.commit()
