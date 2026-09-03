from __future__ import annotations

import csv
import io
from collections.abc import Iterator

from openpyxl import Workbook

from app.carriers.detect import carrier_link
from app.models import Shipment
from app.schemas.common import ShipmentRow

COLUMNS: list[tuple[str, str]] = [
    ("tracking_number", "Tracking number"),
    ("carrier", "Carrier"),
    ("status", "Status"),
    ("status_raw", "Carrier status"),
    ("recipient_name", "Recipient"),
    ("company", "Company"),
    ("address1", "Address 1"),
    ("address2", "Address 2"),
    ("city", "City"),
    ("state", "State"),
    ("postal_code", "ZIP"),
    ("order_ref", "Order"),
    ("ship_date", "Ship date"),
    ("expected_delivery", "Expected delivery"),
    ("delivered_at", "Delivered at"),
    ("last_event_at", "Last event at"),
    ("last_event_desc", "Last event"),
    ("last_event_place", "Last event place"),
    ("days_in_transit", "Days in transit"),
    ("tags", "Tags"),
    ("carrier_url", "Carrier link"),
    ("email", "Email"),
    ("phone", "Phone"),
]


def _cell(row: ShipmentRow, s: Shipment, key: str):
    if key == "tags":
        return ", ".join(t.name for t in row.tags)
    if key == "carrier_url":
        return carrier_link(s.carrier, s.tracking_number)
    if key in ("email", "phone"):
        return getattr(s, key)
    v = getattr(row, key, None)
    if hasattr(v, "isoformat"):
        return v.isoformat(sep=" ") if hasattr(v, "hour") else v.isoformat()
    return v


def rows_to_csv(rows: list[ShipmentRow], shipments: list[Shipment], columns: list[str]) -> Iterator[str]:
    buf = io.StringIO()
    w = csv.writer(buf)
    labels = dict(COLUMNS)
    w.writerow([labels.get(c, c) for c in columns])
    yield buf.getvalue()
    for row, s in zip(rows, shipments, strict=True):
        buf.seek(0)
        buf.truncate()
        w.writerow([_cell(row, s, c) for c in columns])
        yield buf.getvalue()


def rows_to_xlsx(rows: list[ShipmentRow], shipments: list[Shipment], columns: list[str]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Shipments"
    labels = dict(COLUMNS)
    ws.append([labels.get(c, c) for c in columns])
    for row, s in zip(rows, shipments, strict=True):
        ws.append([_cell(row, s, c) for c in columns])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
