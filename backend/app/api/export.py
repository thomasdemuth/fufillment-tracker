from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import shipment_filters, stuck_days
from app.api.shipments import shipment_rows
from app.db import get_db
from app.services.export import COLUMNS, rows_to_csv, rows_to_xlsx
from app.services.query import ShipmentFilters, apply_filters, apply_sort, base_select

router = APIRouter()


@router.get("/export")
def export(
    format: str = "csv",
    columns: str | None = None,
    sort: str | None = None,
    f: ShipmentFilters = Depends(shipment_filters),
    sd: int = Depends(stuck_days),
    db: Session = Depends(get_db),
):
    valid = [c for c, _ in COLUMNS]
    cols = [c for c in (columns.split(",") if columns else valid) if c in valid] or valid
    shipments = db.execute(apply_sort(apply_filters(base_select(), f, sd), sort)).scalars().all()
    rows = shipment_rows(db, shipments)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M")
    if format == "xlsx":
        data = rows_to_xlsx(rows, shipments, cols)
        return Response(
            data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="shipments-{stamp}.xlsx"'},
        )
    if format != "csv":
        raise HTTPException(422, "format must be csv or xlsx")
    return StreamingResponse(
        rows_to_csv(rows, shipments, cols),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="shipments-{stamp}.csv"'},
    )
