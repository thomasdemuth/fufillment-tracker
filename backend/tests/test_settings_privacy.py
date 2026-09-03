import httpx
import respx


def test_carrier_settings_roundtrip_and_masking(client):
    cs = client.get("/api/settings/carriers").json()
    assert [c["carrier"] for c in cs] == ["usps", "fedex"]
    assert cs[0]["mode"] == "mock" and cs[0]["status"] == "mock"
    r = client.put(
        "/api/settings/carriers/usps",
        json={"mode": "live", "client_id": "abc", "client_secret": "supersecret1234", "sandbox": True},
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["client_secret_masked"].endswith("1234") and "supersecret" not in j["client_secret_masked"]
    assert j["has_secret"] and j["status"] == "ok" and j["sandbox"] is True
    # secret is encrypted at rest
    from sqlalchemy import select

    from app.db import session_factory
    from app.models import CarrierCredential

    with session_factory()() as db:
        row = db.execute(select(CarrierCredential)).scalar_one()
        assert row.client_secret_enc and "supersecret" not in row.client_secret_enc
    # omitting the secret keeps it
    j = client.put("/api/settings/carriers/usps", json={"client_id": "abc2"}).json()
    assert j["has_secret"] and j["client_id"] == "abc2"
    assert client.get("/api/health").json()["carriers"]["usps"] == "ok"


@respx.mock
def test_carrier_test_endpoint(client):
    client.put("/api/settings/carriers/fedex", json={"mode": "live", "client_id": "k", "client_secret": "s"})
    respx.post("https://apis.fedex.com/oauth/token").mock(return_value=httpx.Response(401, text="bad"))
    r = client.post("/api/settings/carriers/fedex/test").json()
    assert r["ok"] is False and "rejected" in r["message"]
    assert client.get("/api/settings/carriers").json()[1]["status"] == "error"
    respx.post("https://apis.fedex.com/oauth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "t", "expires_in": 100})
    )
    assert client.post("/api/settings/carriers/fedex/test").json()["ok"] is True
    assert client.post("/api/settings/carriers/usps/test").json()["ok"] is True  # mock mode


def test_general_and_geocoder_settings(client):
    assert (
        client.put("/api/settings", json={"stuck_days": 3, "origin_postal_code": "90052"}).json()[
            "stuck_days"
        ]
        == 3
    )
    assert client.get("/api/config").json()["stuck_days"] == 3
    assert client.put("/api/settings", json={"stuck_days": 500}).status_code == 422
    g = client.put("/api/settings/geocoder", json={"provider": "geocodio", "api_key": "geo-key-9999"}).json()
    assert g["provider"] == "geocodio" and g["api_key_masked"].endswith("9999") and g["has_key"]
    assert client.put("/api/settings/geocoder", json={"provider": "google"}).status_code == 422


def test_privacy_summary_and_wipe(seeded):
    s = seeded.get("/api/privacy/summary").json()
    assert s["shipments"] == 300 and s["uploads"] == 3
    assert s["tile_host"] == "tiles.openfreemap.org"
    assert any(x["name"] == "Encryption key" for x in s["secrets"])
    assert seeded.post("/api/privacy/wipe", json={"token": "nope"}).status_code == 403
    assert seeded.post("/api/privacy/wipe", json={"token": s["wipe_token"]}).json()["ok"] is True
    s2 = seeded.get("/api/privacy/summary").json()
    assert s2["shipments"] == 0 and s2["uploads"] == 0 and s2["uploads_size_bytes"] == 0


def test_basic_auth(tmp_path, monkeypatch, app_env):
    monkeypatch.setenv("APP_PASSWORD", "hunter2")
    from app import config

    config.get_settings.cache_clear()
    from fastapi.testclient import TestClient

    from app.main import create_app

    c = TestClient(create_app())
    assert c.get("/api/health").status_code == 200  # exempt
    assert c.get("/api/shipments").status_code == 401
    assert c.get("/api/shipments", auth=("anyone", "wrong")).status_code == 401
    assert c.get("/api/shipments", auth=("anyone", "hunter2")).status_code == 200
    config.get_settings.cache_clear()
