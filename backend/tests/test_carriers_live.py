"""USPS/FedEx clients against recorded response shapes (respx mocks). No network."""

import asyncio
import json
from pathlib import Path

import httpx
import respx

from app.carriers.fedex import FedExClient, parse_fedex
from app.carriers.usps import USPSClient, parse_usps
from app.enums import NormalizedStatus as S

FX = Path(__file__).parent / "fixtures"


def load(rel: str) -> dict:
    return json.loads((FX / rel).read_text())


def test_parse_usps_delivered():
    r = parse_usps("9400111899223197428490", load("usps/track_delivered.json"))
    assert r.status == S.DELIVERED
    assert r.delivered_at.isoformat() == "2026-08-20T13:02:00"
    assert r.origin_postal_code == "90052" and r.dest_postal_code == "78701"
    assert r.expected_delivery.isoformat() == "2026-08-20"
    assert [e.status for e in r.events][:3] == [S.DELIVERED, S.OUT_FOR_DELIVERY, S.IN_TRANSIT]
    assert r.events[-1].status == S.LABEL_CREATED
    assert r.events[0].city == "AUSTIN" and r.events[0].state == "TX"


def test_parse_usps_pickup_flag():
    r = parse_usps("x", load("usps/track_pickup.json"))
    assert r.status == S.IN_TRANSIT and r.attention_flag == "pickup"
    assert r.events[1].status == S.EXCEPTION


def test_parse_fedex_batch():
    j = load("fedex/track_batch.json")
    out = parse_fedex(["123456789012", "123456789013", "123456789014", "123456789015"], j)
    d = out["123456789012"]
    assert d.status == S.DELIVERED and d.delivered_at.isoformat() == "2026-08-19T14:22:00"
    assert d.origin_postal_code == "38118" and d.dest_postal_code == "33152"
    assert [e.status for e in d.events] == [S.DELIVERED, S.OUT_FOR_DELIVERY, S.IN_TRANSIT, S.IN_TRANSIT]
    e = out["123456789013"]
    assert e.status == S.EXCEPTION and e.attention_flag == "delivery_failed"
    assert e.expected_delivery.isoformat() == "2026-08-22"
    assert "Customer not available" in e.events[0].description
    assert out["123456789014"].kind == "not_found"
    assert out["123456789015"].kind == "not_found"


@respx.mock
def test_usps_client_end_to_end(app_env):
    base = "https://apis-tem.usps.com"
    respx.post(f"{base}/oauth2/v3/token").mock(return_value=httpx.Response(200, json=load("usps/token.json")))
    route = respx.get(f"{base}/tracking/v3/tracking/9400111899223197428490").mock(
        return_value=httpx.Response(200, json=load("usps/track_delivered.json"))
    )
    respx.get(f"{base}/tracking/v3/tracking/000").mock(
        return_value=httpx.Response(404, json={"error": {"message": "not found"}})
    )
    respx.get(f"{base}/tracking/v3/tracking/429").mock(return_value=httpx.Response(429))
    c = USPSClient("id", "secret", sandbox=True)
    out = asyncio.run(c.fetch(["9400111899223197428490", "000", "429"]))
    assert out["9400111899223197428490"].status == S.DELIVERED
    assert out["000"].kind == "not_found"
    assert out["429"].kind == "rate_limited"
    assert route.calls[0].request.headers["Authorization"] == "Bearer usps-test-token"
    assert "expand=DETAIL" in str(route.calls[0].request.url)
    # only the tracking number leaves: the egress log records host + purpose, never payloads
    from sqlalchemy import select

    from app.db import session_factory
    from app.models import EgressLog

    with session_factory()() as db:
        rows = db.execute(select(EgressLog)).scalars().all()
        assert {r.host for r in rows} == {"apis-tem.usps.com"}
        assert all(r.data_classes == "tracking_number" for r in rows)


@respx.mock
def test_usps_bad_credentials(app_env):
    respx.post("https://apis.usps.com/oauth2/v3/token").mock(
        return_value=httpx.Response(401, json={"error": "invalid_client"})
    )
    c = USPSClient("id", "bad")
    st = asyncio.run(c.check_credentials())
    assert st.ok is False and "rejected" in st.message
    out = asyncio.run(c.fetch(["9400111899223197428490"]))
    assert out["9400111899223197428490"].kind == "auth"


@respx.mock
def test_fedex_client_refreshes_token_on_401(app_env):
    base = "https://apis-sandbox.fedex.com"
    respx.post(f"{base}/oauth/token").mock(return_value=httpx.Response(200, json=load("fedex/token.json")))
    track = respx.post(f"{base}/track/v1/trackingnumbers").mock(
        side_effect=[
            httpx.Response(401, json={"errors": [{"code": "NOT.AUTHORIZED.ERROR"}]}),
            httpx.Response(200, json=load("fedex/track_batch.json")),
        ]
    )
    c = FedExClient("key", "secret", sandbox=True)
    out = asyncio.run(c.fetch(["123456789012", "123456789013", "123456789014"]))
    assert track.call_count == 2
    assert out["123456789012"].status == S.DELIVERED
    body = json.loads(track.calls[1].request.content)
    assert body["includeDetailedScans"] is True
    assert [t["trackingNumberInfo"]["trackingNumber"] for t in body["trackingInfo"]] == [
        "123456789012",
        "123456789013",
        "123456789014",
    ]


@respx.mock
def test_fedex_retries_5xx_then_gives_up(app_env):
    base = "https://apis.fedex.com"
    respx.post(f"{base}/oauth/token").mock(return_value=httpx.Response(200, json=load("fedex/token.json")))
    track = respx.post(f"{base}/track/v1/trackingnumbers").mock(return_value=httpx.Response(503))
    c = FedExClient("key", "secret")
    out = asyncio.run(c.fetch(["123456789012"]))
    assert out["123456789012"].kind == "transient"
    assert track.call_count == 3
