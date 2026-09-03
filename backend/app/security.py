from __future__ import annotations

import base64
import hmac
import os
import secrets
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings


def _load_or_create_key(data_dir: Path, explicit: str | None) -> bytes:
    if explicit:
        raw = explicit.encode()
        # Accept a ready-made Fernet key or any passphrase (derived deterministically).
        try:
            Fernet(raw)
            return raw
        except Exception:
            import hashlib

            return base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    key_path = data_dir / ".secret_key"
    if key_path.exists():
        return key_path.read_text().strip().encode()
    key = Fernet.generate_key()
    key_path.write_text(key.decode())
    try:
        os.chmod(key_path, 0o600)
    except OSError:
        pass
    return key


@lru_cache
def get_fernet() -> Fernet:
    s = get_settings()
    return Fernet(_load_or_create_key(s.data_dir, s.app_secret_key))


def encrypt(value: str) -> str:
    return get_fernet().encrypt(value.encode()).decode()


def decrypt(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return get_fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    tail = value[-4:] if len(value) > 4 else ""
    return f"••••••••{tail}"


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """HTTP Basic auth for the whole app when APP_PASSWORD is set. Any username is accepted."""

    def __init__(self, app, password: str, exempt_paths: tuple[str, ...] = ("/api/health",)):  # noqa: ANN001
        super().__init__(app)
        self.password = password.encode()
        self.exempt_paths = exempt_paths

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001
        if request.url.path in self.exempt_paths:
            return await call_next(request)
        if request.method == "OPTIONS":  # CORS preflight carries no credentials
            return await call_next(request)
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            if hmac.compare_digest(header[7:].strip().encode(), self.password):
                return await call_next(request)
        if header.lower().startswith("basic "):
            try:
                decoded = base64.b64decode(header[6:]).decode()
                _, _, pw = decoded.partition(":")
                if hmac.compare_digest(pw.encode(), self.password):
                    return await call_next(request)
            except Exception:
                pass
        # Cross-origin callers (the hosted UI) get a plain 401 so the browser doesn't show a Basic prompt;
        # same-origin browsers still get the prompt.
        headers = (
            {} if request.headers.get("origin") else {"WWW-Authenticate": 'Basic realm="Fulfillment Tracker"'}
        )
        return Response("Authentication required", status_code=401, headers=headers)


def new_confirm_token() -> str:
    return secrets.token_urlsafe(8)
