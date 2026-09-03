"""Build carrier clients from env + saved credentials. Mock clients need nothing."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.carriers.base import CarrierClient
from app.carriers.mock import MockCarrier
from app.config import get_settings
from app.enums import Carrier
from app.models import CarrierCredential
from app.security import decrypt


@dataclass
class CarrierConfig:
    carrier: Carrier
    enabled: bool
    mode: str  # mock | live
    sandbox: bool
    client_id: str | None
    client_secret: str | None
    from_env: bool


def carrier_config(db: Session, carrier: Carrier) -> CarrierConfig:
    s = get_settings()
    row = db.get(CarrierCredential, carrier.value)
    env_id, env_secret = (
        (s.usps_client_id, s.usps_client_secret)
        if carrier == Carrier.USPS
        else (s.fedex_api_key, s.fedex_secret_key)
    )
    if env_id and env_secret:
        return CarrierConfig(carrier, True, "live", bool(row and row.sandbox), env_id, env_secret, True)
    if row is None:
        return CarrierConfig(
            carrier,
            True,
            s.carrier_mode if s.carrier_mode in ("mock", "live") else "mock",
            False,
            None,
            None,
            False,
        )
    return CarrierConfig(
        carrier, row.enabled, row.mode, row.sandbox, row.client_id, decrypt(row.client_secret_enc), False
    )


def build_client(cfg: CarrierConfig, mock_context: dict | None = None) -> CarrierClient | None:
    if not cfg.enabled:
        return None
    if cfg.mode == "mock":
        ctx = mock_context or {}
        return MockCarrier(cfg.carrier, ship_dates=ctx.get("ship_dates"), dest_zips=ctx.get("dest_zips"))
    if not cfg.client_id or not cfg.client_secret:
        return None
    from app.carriers.fedex import FedExClient
    from app.carriers.usps import USPSClient

    if cfg.carrier == Carrier.USPS:
        return USPSClient(cfg.client_id, cfg.client_secret, sandbox=cfg.sandbox)
    return FedExClient(cfg.client_id, cfg.client_secret, sandbox=cfg.sandbox)


def carrier_status(db: Session, carrier: Carrier) -> str:
    cfg = carrier_config(db, carrier)
    if not cfg.enabled:
        return "disabled"
    if cfg.mode == "mock":
        return "mock"
    if not cfg.client_id or not cfg.client_secret:
        return "unconfigured"
    row = db.get(CarrierCredential, carrier.value)
    if row and row.last_check_ok is False:
        return "error"
    return "ok"
