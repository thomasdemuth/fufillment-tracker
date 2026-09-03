from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.carriers.registry import build_client, carrier_config, carrier_status
from app.db import get_db
from app.enums import Carrier
from app.models import CarrierCredential
from app.schemas.settings import (
    CarrierSettingsIn,
    CarrierSettingsOut,
    CredentialCheck,
    GeneralSettings,
    GeocoderSettingsIn,
    GeocoderSettingsOut,
)
from app.security import decrypt, encrypt, mask_secret
from app.services.settings_store import all_settings, get_setting, set_setting

router = APIRouter(prefix="/settings")

CARRIERS = [Carrier.USPS, Carrier.FEDEX]


def _carrier_out(db: Session, carrier: Carrier) -> CarrierSettingsOut:
    cfg = carrier_config(db, carrier)
    row = db.get(CarrierCredential, carrier.value)
    return CarrierSettingsOut(
        carrier=carrier.value,
        enabled=cfg.enabled,
        mode=cfg.mode,
        sandbox=cfg.sandbox,
        client_id=cfg.client_id,
        client_secret_masked=mask_secret(cfg.client_secret),
        has_secret=bool(cfg.client_secret),
        from_env=cfg.from_env,
        status=carrier_status(db, carrier),
        last_check_at=row.last_check_at if row else None,
        last_check_ok=row.last_check_ok if row else None,
        last_check_message=row.last_check_message if row else None,
    )


@router.get("", response_model=GeneralSettings)
def get_general(db: Session = Depends(get_db)):
    s = all_settings(db)
    return GeneralSettings(
        stuck_days=s.get("stuck_days"),
        origin_postal_code=s.get("origin_postal_code"),
        map_style_url=s.get("map_style_url"),
    )


@router.put("", response_model=GeneralSettings)
def put_general(body: GeneralSettings, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if "stuck_days" in data and data["stuck_days"] is not None and not (1 <= data["stuck_days"] <= 90):
        raise HTTPException(422, "stuck_days must be between 1 and 90")
    for k, v in data.items():
        set_setting(db, k, v or None if k != "stuck_days" else v)
    db.commit()
    return get_general(db)


@router.get("/carriers", response_model=list[CarrierSettingsOut])
def get_carriers(db: Session = Depends(get_db)):
    return [_carrier_out(db, c) for c in CARRIERS]


@router.put("/carriers/{carrier}", response_model=CarrierSettingsOut)
def put_carrier(carrier: Carrier, body: CarrierSettingsIn, db: Session = Depends(get_db)):
    if carrier not in CARRIERS:
        raise HTTPException(404, "Unknown carrier")
    row = db.get(CarrierCredential, carrier.value)
    if row is None:
        row = CarrierCredential(carrier=carrier.value, mode="mock")
        db.add(row)
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.mode is not None:
        if body.mode not in ("mock", "live"):
            raise HTTPException(422, "mode must be mock or live")
        row.mode = body.mode
    if body.sandbox is not None:
        row.sandbox = body.sandbox
    if body.client_id is not None:
        row.client_id = body.client_id.strip() or None
    if body.client_secret is not None:
        row.client_secret_enc = encrypt(body.client_secret.strip()) if body.client_secret.strip() else None
        row.access_token_enc, row.token_expires_at = None, None
    if body.client_id is not None or body.client_secret is not None:
        row.last_check_ok, row.last_check_message, row.last_check_at = None, None, None
    db.commit()
    return _carrier_out(db, carrier)


@router.post("/carriers/{carrier}/test", response_model=CredentialCheck)
async def test_carrier(carrier: Carrier, db: Session = Depends(get_db)):
    cfg = carrier_config(db, carrier)
    if cfg.mode == "mock":
        return CredentialCheck(
            ok=True, message="Mock mode: no credentials needed. Switch to live to use the real API."
        )
    client = build_client(cfg)
    if client is None:
        return CredentialCheck(ok=False, message="Enter a client ID and secret first")
    st = await client.check_credentials()
    row = db.get(CarrierCredential, carrier.value)
    if row is None:
        row = CarrierCredential(carrier=carrier.value, mode="live")
        db.add(row)
    row.last_check_at = datetime.now(UTC).replace(tzinfo=None)
    row.last_check_ok, row.last_check_message = st.ok, st.message[:500]
    db.commit()
    return CredentialCheck(ok=st.ok, message=st.message)


@router.get("/geocoder", response_model=GeocoderSettingsOut)
def get_geocoder(db: Session = Depends(get_db)):
    key = decrypt(get_setting(db, "geocoder_api_key_enc"))
    return GeocoderSettingsOut(
        provider=get_setting(db, "geocoder_provider") or "nominatim",
        api_key_masked=mask_secret(key),
        has_key=bool(key),
        nominatim_email=get_setting(db, "nominatim_email"),
    )


@router.put("/geocoder", response_model=GeocoderSettingsOut)
def put_geocoder(body: GeocoderSettingsIn, db: Session = Depends(get_db)):
    if body.provider is not None:
        if body.provider not in ("nominatim", "geocodio", "mapbox"):
            raise HTTPException(422, "provider must be nominatim, geocodio or mapbox")
        set_setting(db, "geocoder_provider", body.provider)
    if body.api_key is not None:
        set_setting(
            db, "geocoder_api_key_enc", encrypt(body.api_key.strip()) if body.api_key.strip() else None
        )
    if body.nominatim_email is not None:
        set_setting(db, "nominatim_email", body.nominatim_email.strip() or None)
    db.commit()
    return get_geocoder(db)


@router.post("/geocoder/test", response_model=CredentialCheck)
async def test_geocoder(db: Session = Depends(get_db)):
    from app.geocode.online import build_online_geocoder

    g = build_online_geocoder(db)
    if g is None:
        return CredentialCheck(ok=False, message="Geocoder is not configured (missing API key or email)")
    try:
        from app.geocode.base import AddressQuery

        res = await g.geocode(AddressQuery("1600 Pennsylvania Ave NW", "Washington", "DC", "20500"))
    except Exception as e:
        return CredentialCheck(ok=False, message=f"Geocoder request failed: {e}")
    if res is None:
        return CredentialCheck(ok=False, message="Geocoder responded but found nothing for a known address")
    return CredentialCheck(
        ok=True, message=f"OK: {g.source} placed the test address at {res.lat:.4f}, {res.lng:.4f}"
    )
