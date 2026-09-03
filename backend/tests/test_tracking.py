import asyncio
import time
from datetime import date, datetime

import pytest

from app.carriers.mock import MockCarrier
from app.enums import Carrier
from app.enums import NormalizedStatus as S


def _fetch(c, nums):
    return asyncio.run(c.fetch(nums))


def test_mock_is_deterministic_and_progresses():
    c = MockCarrier(Carrier.USPS, ship_dates={"A": date(2026, 8, 1)})
    c.now = datetime(2026, 8, 2, 12)
    r1 = _fetch(c, ["A"])["A"]
    r2 = _fetch(c, ["A"])["A"]
    assert r1.status == r2.status and [e.description for e in r1.events] == [e.description for e in r2.events]
    c.now = datetime(2026, 8, 30, 12)
    r3 = _fetch(c, ["A"])["A"]
    assert len(r3.events) >= len(r1.events)
    assert r3.status in (
        S.DELIVERED,
        S.EXCEPTION,
        S.RETURNED,
        S.LABEL_CREATED,
        S.IN_TRANSIT,
        S.OUT_FOR_DELIVERY,
    )


def test_mock_scenarios_cover_statuses():
    c = MockCarrier(Carrier.FEDEX, ship_dates={str(i): date(2026, 7, 1) for i in range(300)})
    c.now = datetime(2026, 8, 15)
    res = _fetch(c, [str(i) for i in range(300)])
    statuses = {r.status for r in res.values() if hasattr(r, "status")}
    assert {S.DELIVERED, S.EXCEPTION, S.RETURNED, S.LABEL_CREATED} <= statuses
    delivered = [r for r in res.values() if getattr(r, "status", None) == S.DELIVERED]
    assert all(r.delivered_at and r.events[0].status == S.DELIVERED for r in delivered)


def _wait_job(client, job_id, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "failed", "cancelled"):
            return j
        time.sleep(0.1)
    pytest.fail("job did not finish")


def test_refresh_job_updates_shipments(seeded):
    c = seeded
    r = c.post("/api/refresh", json={"all": True})
    assert r.status_code == 200, r.text
    job_id, queued = r.json()["job_id"], r.json()["queued"]
    assert queued == 300
    j = _wait_job(c, job_id)
    assert j["status"] == "done" and j["done"] == 300
    assert j["updated"] > 250
    stats = c.get("/api/shipments/stats").json()
    assert stats["by_status"]["unknown"] < 20
    assert stats["by_status"]["delivered"] > 50
    # second run skips delivered
    r = c.post("/api/refresh", json={"all": True})
    j2 = _wait_job(c, r.json()["job_id"])
    assert j2["total"] == 300 - stats["by_status"]["delivered"] - stats["by_status"]["returned"]
    # events were stored and deduped
    row = c.get("/api/shipments", params={"status": "delivered", "page_size": 1}).json()["items"][0]
    d = c.get(f"/api/shipments/{row['id']}").json()
    assert len(d["events"]) >= 5 and d["events"][0]["normalized_status"] == "delivered"
    before = len(d["events"])
    c.post(f"/api/shipments/{row['id']}/refresh")
    assert len(c.get(f"/api/shipments/{row['id']}").json()["events"]) == before


def test_refresh_filters_and_single(seeded):
    c = seeded
    r = c.post("/api/refresh", json={"filters": {"state": "CA"}})
    j = _wait_job(c, r.json()["job_id"])
    ca = c.get("/api/shipments", params={"state": "CA", "page_size": 500}).json()
    assert j["total"] == ca["total"]
    assert all(x["last_polled_at"] for x in ca["items"])
    tx = c.get("/api/shipments", params={"state": "TX", "page_size": 1}).json()["items"][0]
    assert tx["last_polled_at"] is None
    d = c.post(f"/api/shipments/{tx['id']}/refresh").json()
    assert d["last_polled_at"] and d["status"] != "unknown"
    p = c.get(f"/api/shipments/{tx['id']}/path.geojson").json()
    kinds = [f["properties"].get("kind") for f in p["features"] if f["geometry"]["type"] == "Point"]
    assert "destination" in kinds


def test_patch_shipment_regeocodes(seeded):
    row = seeded.get("/api/shipments", params={"page_size": 1}).json()["items"][0]
    d = seeded.patch(
        f"/api/shipments/{row['id']}",
        json={"city": "Beverly Hills", "state": "ca", "postal_code": "90210", "carrier": "fedex"},
    ).json()
    assert d["state"] == "CA" and d["carrier"] == "fedex" and d["carrier_locked"] is True
    assert abs(d["dest_lat"] - 34.09) < 0.1
    assert seeded.patch(f"/api/shipments/{row['id']}", json={"carrier": "dhl"}).status_code == 422
