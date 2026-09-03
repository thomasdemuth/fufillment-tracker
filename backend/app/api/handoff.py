from __future__ import annotations

import socket
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.services.settings_store import get_setting

router = APIRouter()


def lan_ip() -> str | None:
    """Best-effort LAN address of this machine. Connecting a UDP socket sends no packets."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
        finally:
            s.close()
        return None if ip.startswith("127.") else ip
    except OSError:
        return None


class Handoff(BaseModel):
    lan_url: str | None
    public_url: str | None
    hosted_ui_url: str | None
    auth_required: bool


@router.get("/handoff", response_model=Handoff)
def handoff(request: Request, db: Session = Depends(get_db)):
    s = get_settings()
    port = request.url.port or s.port
    ip = lan_ip()
    lan = f"http://{ip}:{port}" if ip else None
    public = (get_setting(db, "public_url") or s.public_url or "").rstrip("/") or None
    hosted = (get_setting(db, "hosted_ui_url") or s.hosted_ui_url or "").rstrip("/") or None
    if hosted and not urlsplit(hosted).scheme:
        hosted = f"https://{hosted}"
    return Handoff(lan_url=lan, public_url=public, hosted_ui_url=hosted, auth_required=bool(s.app_password))


@router.get("/auth/check")
def auth_check():
    """Reachable only with valid credentials when APP_PASSWORD is set (the auth middleware guards it)."""
    return {"ok": True, "auth": bool(get_settings().app_password)}
