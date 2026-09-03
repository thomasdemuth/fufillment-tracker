from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.services.settings_store import get_setting

router = APIRouter()


@router.get("/config")
def config(db: Session = Depends(get_db)) -> dict:
    s = get_settings()
    return {
        "app_name": s.app_name,
        "map_style_url": get_setting(db, "map_style_url") or s.map_style_url,
        "map_style_url_dark": get_setting(db, "map_style_url_dark") or s.map_style_url_dark,
        "carrier_mode": s.carrier_mode,
        "auth_enabled": bool(s.app_password),
        "stuck_days": get_setting(db, "stuck_days", 7),
    }
