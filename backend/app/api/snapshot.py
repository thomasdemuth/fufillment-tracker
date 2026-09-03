"""Portable snapshot of the current view: everything the phone needs to show the board, map and detail
pages without a server. Names and addresses are included, so treat the file like the spreadsheet itself."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import shipment_filters, stuck_days
from app.api.shipments import shipment_rows
from app.config import get_settings
from app.db import get_db
from app.models import Shipment, Upload
from app.schemas.tracking import EventOut, NoteOut
from app.services.attention import attention_reasons
from app.services.query import ShipmentFilters, apply_filters, apply_sort, base_select
from app.services.settings_store import get_setting

router = APIRouter()

SNAPSHOT_VERSION = 1


@router.get("/snapshot")
def snapshot(
    f: ShipmentFilters = Depends(shipment_filters),
    sd: int = Depends(stuck_days),
    db: Session = Depends(get_db),
):
    stmt = apply_sort(apply_filters(base_select(), f, sd), "-last_event_at").options(
        selectinload(Shipment.events), selectinload(Shipment.notes)
    )
    shipments = db.execute(stmt).scalars().all()
    rows = shipment_rows(db, shipments)
    out = []
    for row, s in zip(rows, shipments, strict=True):
        d = row.model_dump(mode="json")
        d.update(
            email=s.email,
            phone=s.phone,
            origin_postal_code=s.origin_postal_code,
            status_code=s.status_code,
            first_event_at=s.first_event_at.isoformat() if s.first_event_at else None,
            carrier_locked=s.carrier_locked,
            geocode_source=s.geocode_source,
            created_at=s.created_at.isoformat(),
            updated_at=s.updated_at.isoformat(),
            events=[
                EventOut.model_validate(e).model_dump(mode="json")
                for e in sorted(s.events, key=lambda e: e.event_at or datetime.min, reverse=True)
            ],
            notes=[NoteOut.model_validate(n).model_dump(mode="json") for n in s.notes],
            reasons=attention_reasons(s, sd),
        )
        out.append(d)
    uploads = [
        {
            "id": u.id,
            "filename": u.filename,
            "created_at": u.created_at.isoformat(),
            "count": u.imported_count + u.duplicate_count,
        }
        for u in db.execute(select(Upload).where(Upload.status == "committed")).scalars()
    ]
    s = get_settings()
    body = {
        "format": "fulfillment-tracker-snapshot",
        "version": SNAPSHOT_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "app_name": s.app_name,
        "stuck_days": sd,
        "map_style_url": get_setting(db, "map_style_url") or s.map_style_url,
        "map_style_url_dark": get_setting(db, "map_style_url_dark") or s.map_style_url_dark,
        "filters": {k: v for k, v in f.__dict__.items() if v not in (None, [], False)},
        "uploads": uploads,
        "shipments": out,
    }
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M")
    return JSONResponse(
        body, headers={"Content-Disposition": f'attachment; filename="shipments-{stamp}.snapshot.json"'}
    )
