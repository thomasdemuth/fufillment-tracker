from __future__ import annotations

import os
import shutil
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import (
    CarrierCredential,
    ColumnPreset,
    EgressLog,
    GeocodeCache,
    Job,
    Note,
    Shipment,
    Tag,
    TrackingEvent,
    Upload,
)
from app.schemas.settings import EgressOut, PrivacySummary
from app.services.settings_store import get_setting

router = APIRouter(prefix="/privacy")
_WIPE_TOKEN = os.urandom(6).hex()


def _dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.exists() else 0


@router.get("/summary", response_model=PrivacySummary)
def summary(db: Session = Depends(get_db)):
    s = get_settings()
    db_path = s.data_dir / "app.db"
    secrets = []
    for carrier in ("usps", "fedex"):
        env_set = bool(
            (s.usps_client_id and s.usps_client_secret)
            if carrier == "usps"
            else (s.fedex_api_key and s.fedex_secret_key)
        )
        row = db.get(CarrierCredential, carrier)
        secrets.append(
            {
                "name": f"{carrier.upper()} credentials",
                "where": "environment (.env)"
                if env_set
                else ("database, encrypted" if row and row.client_secret_enc else "not set"),
            }
        )
    secrets.append(
        {
            "name": "Geocoder API key",
            "where": "database, encrypted" if get_setting(db, "geocoder_api_key_enc") else "not set",
        }
    )
    secrets.append(
        {
            "name": "Encryption key",
            "where": "APP_SECRET_KEY env"
            if s.app_secret_key
            else f"{s.data_dir / '.secret_key'} (auto-generated)",
        }
    )
    style = get_setting(db, "map_style_url") or s.map_style_url
    return PrivacySummary(
        data_dir=str(s.data_dir.resolve()),
        db_size_bytes=db_path.stat().st_size if db_path.exists() else 0,
        uploads_size_bytes=_dir_size(s.uploads_dir),
        shipments=db.execute(select(func.count()).select_from(Shipment)).scalar_one(),
        uploads=db.execute(select(func.count()).select_from(Upload)).scalar_one(),
        events=db.execute(select(func.count()).select_from(TrackingEvent)).scalar_one(),
        secrets=secrets,
        tile_host=urlsplit(style).netloc or "local",
        geocoder=get_setting(db, "geocoder_provider") or "nominatim",
        auth_enabled=bool(s.app_password),
        egress=[
            EgressOut.model_validate(e).model_dump()
            for e in db.execute(select(EgressLog).order_by(EgressLog.last_at.desc())).scalars()
        ],
        wipe_token=_WIPE_TOKEN,
    )


@router.get("/egress", response_model=list[EgressOut])
def egress(db: Session = Depends(get_db)):
    return db.execute(select(EgressLog).order_by(EgressLog.last_at.desc())).scalars().all()


class WipeRequest(BaseModel):
    token: str
    keep_settings: bool = True


@router.post("/wipe")
def wipe(body: WipeRequest, db: Session = Depends(get_db)):
    """Delete every shipment, upload, event, note, tag, job and cached geocode. Optionally keep settings."""
    if body.token != _WIPE_TOKEN:
        raise HTTPException(403, "Invalid confirmation token; reload the page and try again")
    for model in (TrackingEvent, Note, Shipment, Upload, Tag, Job, GeocodeCache, EgressLog, ColumnPreset):
        db.execute(delete(model))
    if not body.keep_settings:
        from app.models import Setting

        db.execute(delete(CarrierCredential))
        db.execute(delete(Setting))
    db.commit()
    db.execute(text("VACUUM"))
    s = get_settings()
    if s.uploads_dir.exists():
        shutil.rmtree(s.uploads_dir, ignore_errors=True)
        s.uploads_dir.mkdir(parents=True, exist_ok=True)
    return {"ok": True}
