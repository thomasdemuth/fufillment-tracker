from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import Setting

DEFAULTS: dict[str, Any] = {
    "stuck_days": 7,
    "origin_postal_code": None,
    "geocoder_provider": "nominatim",  # nominatim | geocodio | mapbox
    "geocoder_api_key_enc": None,
    "nominatim_email": None,
    "map_style_url": None,
}


def get_setting(db: Session, key: str, default: Any = None) -> Any:
    row = db.get(Setting, key)
    if row is None:
        return DEFAULTS.get(key, default)
    return row.value


def set_setting(db: Session, key: str, value: Any) -> None:
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value


def all_settings(db: Session) -> dict[str, Any]:
    out = dict(DEFAULTS)
    for row in db.query(Setting).all():
        out[row.key] = row.value
    return out
