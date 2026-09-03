from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo"


@pytest.fixture(scope="session")
def demo_dir() -> Path:
    if not (DEMO / "batch_1.xlsx").exists():
        import subprocess
        import sys

        subprocess.run([sys.executable, str(ROOT / "backend" / "scripts" / "seed_demo.py")], check=True)
    return DEMO


@pytest.fixture
def app_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("CARRIER_MODE", "mock")
    monkeypatch.delenv("APP_PASSWORD", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from app import config, db, security

    config.get_settings.cache_clear()
    security.get_fernet.cache_clear()
    settings = config.get_settings()
    engine = db.make_engine(settings.resolved_database_url)
    from app import models  # noqa: F401

    db.Base.metadata.create_all(engine)
    db.set_engine(engine)
    yield settings
    engine.dispose()
    config.get_settings.cache_clear()
    security.get_fernet.cache_clear()


@pytest.fixture
def client(app_env) -> Iterator[TestClient]:
    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session(app_env):
    from app.db import session_factory

    s = session_factory()()
    try:
        yield s
    finally:
        s.close()


def upload_and_commit(client: TestClient, path: Path, **overrides) -> dict:
    with path.open("rb") as f:
        r = client.post("/api/uploads", files={"file": (path.name, f, "application/octet-stream")})
    assert r.status_code == 201, r.text
    prev = r.json()
    body = {
        "sheet": prev["sheet"],
        "header_row": prev["header_row"],
        "mapping": prev["suggested_mapping"],
        "geocode_mode": "offline",
    }
    body.update(overrides)
    r = client.post(f"/api/uploads/{prev['upload_id']}/commit", json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def seeded(client: TestClient, demo_dir: Path) -> TestClient:
    for name in ("batch_1.xlsx", "batch_2.xlsx", "batch_3_messy.csv"):
        upload_and_commit(client, demo_dir / name)
    return client
