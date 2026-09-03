import time

import httpx
import respx

from tests.conftest import upload_and_commit


@respx.mock
def test_online_geocode_job_uses_cache_and_falls_back(client, demo_dir):
    client.put("/api/settings/geocoder", json={"provider": "geocodio", "api_key": "k"})
    route = respx.get("https://api.geocod.io/v1.7/geocode").mock(
        return_value=httpx.Response(
            200, json={"results": [{"location": {"lat": 30.27, "lng": -97.74}, "accuracy_type": "rooftop"}]}
        )
    )
    res = upload_and_commit(client, demo_dir / "batch_3_messy.csv", geocode_mode="online")
    jid = res["geocode_job_id"]
    assert jid
    for _ in range(200):
        j = client.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert j["status"] == "done" and j["updated"] == 70, j
    rows = client.get("/api/shipments", params={"upload_id": res["upload"]["id"], "page_size": 500}).json()[
        "items"
    ]
    assert all(r["geocode_precision"] == "street" for r in rows)
    assert route.call_count == 70
    # egress log records addresses were sent to the geocoder host
    eg = client.get("/api/privacy/egress").json()
    assert any(e["host"] == "api.geocod.io" and e["data_classes"] == "address" for e in eg)


def test_online_geocode_without_config_fails_gracefully(client, demo_dir):
    res = upload_and_commit(client, demo_dir / "batch_1.xlsx", geocode_mode="online")
    jid = res["geocode_job_id"]
    for _ in range(100):
        j = client.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert j["status"] == "failed" and "not configured" in j["message"]
    # offline placement still happened
    assert client.get("/api/shipments/stats").json()["not_geocoded"] == 0
