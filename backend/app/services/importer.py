"""Turn a mapped spreadsheet into shipments. Dedupes by tracking number across uploads."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.carriers.detect import detect_carrier
from app.enums import Carrier, NormalizedStatus
from app.models import Shipment, ShipmentUpload, Upload
from app.services.normalize import (
    clean,
    normalize_state,
    normalize_tracking,
    normalize_zip,
    parse_date,
    split_city_state_zip,
)

CARRIER_ALIASES = {
    "usps": Carrier.USPS,
    "us postal": Carrier.USPS,
    "postal": Carrier.USPS,
    "united states postal service": Carrier.USPS,
    "priority mail": Carrier.USPS,
    "first class": Carrier.USPS,
    "ground advantage": Carrier.USPS,
    "media mail": Carrier.USPS,
    "fedex": Carrier.FEDEX,
    "fed ex": Carrier.FEDEX,
    "federal express": Carrier.FEDEX,
    "fedex ground": Carrier.FEDEX,
    "fedex home": Carrier.FEDEX,
    "fedex express": Carrier.FEDEX,
    "smartpost": Carrier.FEDEX,
}

STATUS_ALIASES = {
    "delivered": NormalizedStatus.DELIVERED,
    "out for delivery": NormalizedStatus.OUT_FOR_DELIVERY,
    "in transit": NormalizedStatus.IN_TRANSIT,
    "shipped": NormalizedStatus.IN_TRANSIT,
    "label created": NormalizedStatus.LABEL_CREATED,
    "pre-shipment": NormalizedStatus.LABEL_CREATED,
    "pending": NormalizedStatus.LABEL_CREATED,
    "exception": NormalizedStatus.EXCEPTION,
    "returned": NormalizedStatus.RETURNED,
    "return to sender": NormalizedStatus.RETURNED,
}


def parse_carrier(value: str | None) -> Carrier | None:
    v = clean(value)
    if not v:
        return None
    low = v.lower()
    if low in CARRIER_ALIASES:
        return CARRIER_ALIASES[low]
    for k, c in CARRIER_ALIASES.items():
        if k in low:
            return c
    return None


def parse_status(value: str | None) -> NormalizedStatus | None:
    v = clean(value)
    if not v:
        return None
    low = v.lower()
    for k, s in STATUS_ALIASES.items():
        if k in low:
            return s
    return None


@dataclass
class ImportSummary:
    imported: int = 0
    duplicates: int = 0
    skipped: int = 0
    errors: list[dict] = field(default_factory=list)


def _get(row: list[str], headers: list[str], mapping: dict[str, str], fld: str) -> str | None:
    h = mapping.get(fld)
    if not h or h not in headers:
        return None
    i = headers.index(h)
    return row[i] if i < len(row) else None


def row_to_fields(
    row: list[str], headers: list[str], mapping: dict[str, str], default_carrier: str | None
) -> dict:
    g = lambda f: _get(row, headers, mapping, f)  # noqa: E731
    tracking = normalize_tracking(g("tracking_number"))
    city, state, postal = clean(g("city")), normalize_state(g("state")), normalize_zip(g("postal_code"))
    if mapping.get("city_state_zip"):
        c2, s2, z2 = split_city_state_zip(g("city_state_zip"))
        city, state, postal = city or c2, state or s2, postal or z2
    carrier_from_sheet = parse_carrier(g("carrier"))
    detected, conf = detect_carrier(tracking)
    if carrier_from_sheet:
        carrier, conf, locked = carrier_from_sheet, 1.0, True
    elif detected != Carrier.UNKNOWN:
        carrier, locked = detected, False
    elif default_carrier in (Carrier.USPS, Carrier.FEDEX):
        carrier, conf, locked = Carrier(default_carrier), 0.5, False
    else:
        carrier, locked = Carrier.UNKNOWN, False
    status = parse_status(g("status"))
    return {
        "tracking_number": tracking,
        "carrier": carrier,
        "carrier_confidence": conf,
        "carrier_locked": locked,
        "recipient_name": clean(g("recipient_name")),
        "company": clean(g("company")),
        "address1": clean(g("address1")),
        "address2": clean(g("address2")),
        "city": city,
        "state": state,
        "postal_code": postal,
        "country": (clean(g("country")) or "US")[:2].upper(),
        "email": clean(g("email")),
        "phone": clean(g("phone")),
        "order_ref": clean(g("order_ref")),
        "ship_date": parse_date(g("ship_date")),
        "status_from_sheet": status,
    }


def import_rows(
    db: Session,
    upload: Upload,
    headers: list[str],
    rows: list[list[str]],
    mapping: dict[str, str],
    default_carrier: str | None = None,
) -> ImportSummary:
    summary = ImportSummary()
    existing: dict[str, Shipment] = {s.tracking_number: s for s in db.execute(select(Shipment)).scalars()}
    seen_in_file: set[str] = set()
    now = datetime.now(UTC).replace(tzinfo=None)

    for idx, row in enumerate(rows):
        row_number = upload.header_row + 2 + idx  # 1-based spreadsheet row
        try:
            f = row_to_fields(row, headers, mapping, default_carrier)
        except Exception as e:  # pragma: no cover - defensive
            summary.skipped += 1
            summary.errors.append({"row": row_number, "error": f"parse error: {e}"})
            continue
        tracking = f.pop("tracking_number")
        status_from_sheet = f.pop("status_from_sheet")
        if not tracking:
            summary.skipped += 1
            if len(summary.errors) < 50:
                summary.errors.append({"row": row_number, "error": "missing tracking number"})
            continue
        if tracking in seen_in_file:
            summary.duplicates += 1
            continue
        seen_in_file.add(tracking)

        shipment = existing.get(tracking)
        if shipment is not None:
            summary.duplicates += 1
            # Fill in blanks from the new file without overwriting existing data.
            for k, v in f.items():
                if k in ("carrier", "carrier_confidence", "carrier_locked"):
                    continue
                if v and not getattr(shipment, k):
                    setattr(shipment, k, v)
            if f["carrier_locked"] and not shipment.carrier_locked:
                shipment.carrier, shipment.carrier_confidence, shipment.carrier_locked = (
                    f["carrier"],
                    1.0,
                    True,
                )
        else:
            shipment = Shipment(tracking_number=tracking, created_at=now, **f)
            if status_from_sheet:
                shipment.status = status_from_sheet
                shipment.status_raw = "from spreadsheet"
            db.add(shipment)
            db.flush()
            existing[tracking] = shipment
            summary.imported += 1
        db.add(ShipmentUpload(shipment_id=shipment.id, upload_id=upload.id, row_number=row_number))
    db.flush()
    return summary
