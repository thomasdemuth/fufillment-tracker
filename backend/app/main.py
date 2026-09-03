from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api.router import api_router
from app.config import get_settings
from app.db import get_engine
from app.security import BasicAuthMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, tile_origins: list[str], extra_connect: list[str]):  # noqa: ANN001
        super().__init__(app)
        tiles = " ".join(dict.fromkeys(tile_origins))
        connect = " ".join(["'self'", tiles, *extra_connect])
        self.csp = (
            f"default-src 'self'; connect-src {connect}; img-src 'self' data: blob: {tiles}; "
            f"style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; "
            f"script-src 'self' 'unsafe-eval'; frame-ancestors 'none'"
        )

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001
        response = await call_next(request)
        response.headers.setdefault("Content-Security-Policy", self.csp)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response


def _origin(url: str) -> str:
    from urllib.parse import urlsplit

    p = urlsplit(url)
    return f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else "'self'"


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        get_engine()
        yield

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan, docs_url="/api/docs")
    app.include_router(api_router, prefix="/api")

    if settings.app_password:
        app.add_middleware(BasicAuthMiddleware, password=settings.app_password)

    origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=r"https://[a-z0-9-]+\.github\.io",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    extra_connect = [
        "https://nominatim.openstreetmap.org",
        "https://api.geocod.io",
        "https://api.mapbox.com",
    ]
    app.add_middleware(
        SecurityHeadersMiddleware,
        tile_origins=[_origin(settings.map_style_url), _origin(settings.map_style_url_dark)],
        extra_connect=extra_connect,
    )

    dist = settings.frontend_dist or Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
        for static in ("geo", "favicon.svg"):
            path = dist / static
            if path.is_dir():
                app.mount(f"/{static}", StaticFiles(directory=path), name=static)

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):  # noqa: ARG001
            candidate = dist / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
