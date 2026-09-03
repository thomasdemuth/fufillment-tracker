def test_points_geojson(seeded):
    g = seeded.get("/api/map/points.geojson").json()
    assert g["type"] == "FeatureCollection"
    assert len(g["features"]) >= 290
    f = g["features"][0]
    assert f["geometry"]["type"] == "Point"
    lng, lat = f["geometry"]["coordinates"]
    assert -180 <= lng <= 180 and -90 <= lat <= 90
    assert set(f["properties"]) >= {"id", "s", "c", "p", "n", "pl", "t", "w"}
    # deterministic jitter
    g2 = seeded.get("/api/map/points.geojson").json()
    assert g2["features"][0]["geometry"]["coordinates"] == f["geometry"]["coordinates"]
    # filters apply
    ca = seeded.get("/api/map/points.geojson", params={"state": "CA"}).json()
    assert 0 < len(ca["features"]) < len(g["features"])
    assert all(x["properties"]["pl"].endswith("CA") for x in ca["features"])


def test_states(seeded):
    st = seeded.get("/api/map/states").json()
    assert "CA" in st and st["CA"]["total"] > 0
    assert sum(v["total"] for v in st.values()) == 300
    only = seeded.get("/api/map/states", params={"state": "TX"}).json()
    assert list(only) == ["TX"]


def test_config(client):
    c = client.get("/api/config").json()
    assert c["map_style_url"].startswith("http")
    assert c["carrier_mode"] == "mock"
