import time


def test_snapshot_contains_everything_the_phone_needs(seeded):
    r = seeded.post("/api/refresh", json={"all": True})
    jid = r.json()["job_id"]
    for _ in range(300):
        if seeded.get(f"/api/jobs/{jid}").json()["status"] == "done":
            break
        time.sleep(0.1)
    r = seeded.get("/api/snapshot", params={"state": "CA"})
    assert r.status_code == 200
    assert "snapshot.json" in r.headers["content-disposition"]
    j = r.json()
    assert j["format"] == "fulfillment-tracker-snapshot" and j["version"] == 1
    assert j["filters"] == {"state": ["CA"]}
    assert (
        len(j["shipments"])
        == seeded.get("/api/shipments", params={"state": "CA", "page_size": 1}).json()["total"]
    )
    s = next(x for x in j["shipments"] if x["events"])
    assert s["dest_lat"] is not None and s["events"][0]["lat"] is not None
    assert "reasons" in s and "carrier_url" in s and "days_in_transit" in s
    assert j["uploads"] and j["map_style_url"].startswith("http")
