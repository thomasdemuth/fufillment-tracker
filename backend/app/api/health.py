from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.carriers.registry import carrier_status
from app.config import get_settings
from app.db import get_db
from app.enums import Carrier
from app.services import refresh as refresh_service

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("select 1"))
    s = get_settings()
    return {
        "ok": True,
        "db": "ok",
        "carrier_mode": s.carrier_mode,
        "auth": bool(s.app_password),
        "refresh_running": refresh_service.is_running(),
        "carriers": {c.value: carrier_status(db, c) for c in (Carrier.USPS, Carrier.FEDEX)},
    }
