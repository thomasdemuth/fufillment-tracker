from pathlib import Path

from tests.conftest import upload_and_commit


def test_upload_preview_and_commit(client, demo_dir: Path):
    with (demo_dir / "batch_1.xlsx").open("rb") as f:
        r = client.post("/api/uploads", files={"file": ("batch_1.xlsx", f, "application/octet-stream")})
    assert r.status_code == 201
    p = r.json()
    assert p["row_count"] == 140
    assert p["suggested_mapping"]["tracking_number"] == "Tracking Number"
    assert p["carrier_detection"]["usps"] > 0
    body = {"sheet": p["sheet"], "header_row": p["header_row"], "mapping": p["suggested_mapping"], "save_preset_as": "Shopify export"}
    r = client.post(f"/api/uploads/{p['upload_id']}/commit", json=body)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["imported"] == 140 and res["duplicates"] == 0
    assert client.get("/api/presets").json()[0]["name"] == "Shopify export"
    assert client.get("/api/uploads").json()[0]["status"] == "committed"
    # committing again is rejected
    r = client.post(f"/api/uploads/{p['upload_id']}/commit", json=body)
    assert r.status_code == 409


def test_dedupe_across_uploads(client, demo_dir: Path):
    upload_and_commit(client, demo_dir / "batch_1.xlsx")
    res = upload_and_commit(client, demo_dir / "batch_2.xlsx")
    assert res["imported"] == 90 and res["duplicates"] == 25
    total = client.get("/api/shipments", params={"page_size": 1}).json()["total"]
    assert total == 230


def test_messy_csv_maps_and_geocodes(client, demo_dir: Path):
    res = upload_and_commit(client, demo_dir / "batch_3_messy.csv")
    assert res["imported"] == 70
    rows = client.get("/api/shipments", params={"upload_id": res["upload"]["id"], "page_size": 500}).json()["items"]
    assert all(r["state"] and r["postal_code"] for r in rows)
    assert sum(1 for r in rows if r["dest_lat"] is not None) >= 65
    assert all(r["ship_date"] for r in rows)


def test_delete_upload_keeps_shared_shipments(client, demo_dir: Path):
    u1 = upload_and_commit(client, demo_dir / "batch_1.xlsx")["upload"]["id"]
    upload_and_commit(client, demo_dir / "batch_2.xlsx")
    assert client.delete(f"/api/uploads/{u1}").status_code == 204
    total = client.get("/api/shipments", params={"page_size": 1}).json()["total"]
    assert total == 115  # 90 new + 25 shared survivors


def test_commit_requires_tracking(client, demo_dir: Path):
    with (demo_dir / "batch_1.xlsx").open("rb") as f:
        p = client.post("/api/uploads", files={"file": ("b.xlsx", f, "application/octet-stream")}).json()
    r = client.post(f"/api/uploads/{p['upload_id']}/commit", json={"mapping": {"city": "City"}})
    assert r.status_code == 422
