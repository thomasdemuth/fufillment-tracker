from fastapi.testclient import TestClient


def test_handoff_defaults(client):
    h = client.get("/api/handoff").json()
    assert h["hosted_ui_url"] == "https://fufillment-tracker.pages.dev"
    assert h["auth_required"] is False
    assert h["public_url"] is None
    client.put(
        "/api/settings",
        json={"public_url": "https://tracker.example.com/", "hosted_ui_url": "my-ui.pages.dev"},
    )
    h = client.get("/api/handoff").json()
    assert h["public_url"] == "https://tracker.example.com"
    assert h["hosted_ui_url"] == "https://my-ui.pages.dev"


def test_cors_allows_hosted_ui(client):
    r = client.options(
        "/api/config",
        headers={"Origin": "https://fufillment-tracker.pages.dev", "Access-Control-Request-Method": "GET"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "https://fufillment-tracker.pages.dev"
    r = client.get("/api/config", headers={"Origin": "https://abc123.fufillment-tracker.pages.dev"})
    assert r.headers.get("access-control-allow-origin") == "https://abc123.fufillment-tracker.pages.dev"
    r = client.get("/api/config", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_bearer_auth_and_cross_origin_401(monkeypatch, app_env):
    monkeypatch.setenv("APP_PASSWORD", "hunter2")
    from app import config

    config.get_settings.cache_clear()
    from app.main import create_app

    c = TestClient(create_app())
    assert c.get("/api/auth/check").status_code == 401
    assert c.get("/api/auth/check", headers={"Authorization": "Bearer hunter2"}).json()["ok"] is True
    assert c.get("/api/auth/check", headers={"Authorization": "Bearer nope"}).status_code == 401
    # cross-origin callers don't get the Basic prompt header; same-origin browsers do
    r = c.get("/api/auth/check", headers={"Origin": "https://fufillment-tracker.pages.dev"})
    assert r.status_code == 401 and "www-authenticate" not in r.headers
    assert "www-authenticate" in c.get("/api/auth/check").headers
    # preflight passes without credentials
    r = c.options(
        "/api/auth/check",
        headers={"Origin": "https://fufillment-tracker.pages.dev", "Access-Control-Request-Method": "GET"},
    )
    assert r.status_code == 200
    config.get_settings.cache_clear()
