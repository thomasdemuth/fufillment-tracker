def test_list_filter_sort_paginate(seeded):
    c = seeded
    all_ = c.get("/api/shipments", params={"page_size": 500}).json()
    assert all_["total"] == 300
    usps = c.get("/api/shipments", params={"carrier": "usps", "page_size": 500}).json()
    assert 0 < usps["total"] < 300 and all(r["carrier"] == "usps" for r in usps["items"])
    ca = c.get("/api/shipments", params={"state": "CA,TX", "page_size": 500}).json()
    assert all(r["state"] in ("CA", "TX") for r in ca["items"])
    name = all_["items"][0]["recipient_name"].split()[0]
    q = c.get("/api/shipments", params={"q": name}).json()
    assert q["total"] >= 1
    asc = c.get("/api/shipments", params={"sort": "recipient_name", "page_size": 5}).json()["items"]
    names = [r["recipient_name"] for r in asc]
    assert names == sorted(names)
    p2 = c.get("/api/shipments", params={"page": 2, "page_size": 100}).json()
    assert len(p2["items"]) == 100 and p2["page"] == 2
    bad = c.get("/api/shipments", params={"sort": "drop table"}).json()
    assert bad["total"] == 300


def test_stats_and_facets(seeded):
    s = seeded.get("/api/shipments/stats").json()
    assert s["total"] == 300
    assert sum(s["by_status"].values()) == 300
    assert s["by_carrier"]["usps"] + s["by_carrier"]["fedex"] == 300
    f = seeded.get("/api/shipments/facets").json()
    assert "CA" in f["states"] and len(f["uploads"]) == 3
    filtered = seeded.get("/api/shipments/stats", params={"state": "CA"}).json()
    assert 0 < filtered["total"] < 300
