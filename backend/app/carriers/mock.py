"""Deterministic fake carrier for demos, development and tests.

Each tracking number hashes to a scenario and a route through real hub cities; events "appear" over
time relative to the ship date so repeated refreshes show progress without any network access."""

from __future__ import annotations

import hashlib
import random
from datetime import UTC, date, datetime, timedelta

from app.carriers.base import CredentialStatus, NormalizedEvent, TrackError, TrackResult
from app.enums import Carrier
from app.enums import NormalizedStatus as S
from app.geocode.offline_zip import zip_lookup

HUBS = [
    ("Los Angeles", "CA", "90052"),
    ("San Francisco", "CA", "94188"),
    ("Seattle", "WA", "98108"),
    ("Denver", "CO", "80217"),
    ("Phoenix", "AZ", "85026"),
    ("Dallas", "TX", "75260"),
    ("Houston", "TX", "77201"),
    ("Chicago", "IL", "60607"),
    ("Minneapolis", "MN", "55401"),
    ("Kansas City", "MO", "64121"),
    ("Atlanta", "GA", "30304"),
    ("Miami", "FL", "33152"),
    ("Charlotte", "NC", "28228"),
    ("Memphis", "TN", "38118"),
    ("Indianapolis", "IN", "46241"),
    ("Columbus", "OH", "43217"),
    ("Philadelphia", "PA", "19104"),
    ("New York", "NY", "10199"),
    ("Boston", "MA", "02205"),
    ("Portland", "OR", "97208"),
    ("Salt Lake City", "UT", "84199"),
    ("Louisville", "KY", "40231"),
    ("Nashville", "TN", "37230"),
    ("Jacksonville", "FL", "32099"),
]

SCENARIOS = (
    ["normal"] * 62
    + ["fast"] * 10
    + ["delayed"] * 10
    + ["exception"] * 8
    + ["returned"] * 4
    + ["pretransit"] * 6
)


class MockCarrier:
    max_batch = 50

    def __init__(
        self,
        name: Carrier,
        ship_dates: dict[str, date] | None = None,
        dest_zips: dict[str, str] | None = None,
    ):
        self.name = name
        self.ship_dates = ship_dates or {}
        self.dest_zips = dest_zips or {}
        self.now = None  # override in tests

    async def check_credentials(self) -> CredentialStatus:
        return CredentialStatus(True, "Mock carrier: generates fake tracking data, no credentials needed")

    async def fetch(self, numbers: list[str]) -> dict[str, TrackResult | TrackError]:
        return {n: self._one(n) for n in numbers}

    # ---------------------------------------------------------------- generation
    def _one(self, number: str) -> TrackResult | TrackError:
        seed = int(hashlib.sha1(number.encode()).hexdigest(), 16)
        rng = random.Random(seed)
        scenario = rng.choice(SCENARIOS)
        now = self.now or datetime.now(UTC).replace(tzinfo=None)
        ship_date = self.ship_dates.get(number) or (now.date() - timedelta(days=rng.randint(1, 20)))
        start = datetime.combine(ship_date, datetime.min.time()) + timedelta(hours=rng.randint(9, 17))
        if rng.random() < 0.02:
            return TrackError(number, "transient", "Mock: simulated temporary carrier outage (try again)")

        dest_zip = self.dest_zips.get(number)
        dest = zip_lookup(dest_zip) if dest_zip else None
        dest_city, dest_state, dest_zip5 = (
            (dest[2], dest[3], dest_zip[:5]) if dest and dest_zip else ("Springfield", "IL", "62701")
        )
        origin = rng.choice(HUBS)
        hops = rng.sample([h for h in HUBS if h != origin], rng.randint(1, 3))
        pace = {
            "fast": 0.5,
            "normal": 1.0,
            "delayed": 1.8,
            "exception": 1.3,
            "returned": 1.2,
            "pretransit": 1.0,
        }[scenario]

        # timeline: (offset_hours, code, description, status, place)
        timeline: list[tuple[float, str, str, S, tuple[str, str, str]]] = [
            (
                0,
                "GX",
                "Shipping Label Created, USPS Awaiting Item"
                if self.name == Carrier.USPS
                else "Shipment information sent to FedEx",
                S.LABEL_CREATED,
                origin,
            ),
        ]
        if scenario != "pretransit":
            t = 6 * pace
            timeline.append(
                (
                    t,
                    "03" if self.name == Carrier.USPS else "PU",
                    "Accepted at Origin Facility" if self.name == Carrier.USPS else "Picked up",
                    S.IN_TRANSIT,
                    origin,
                )
            )
            t += 10 * pace
            timeline.append(
                (
                    t,
                    "10" if self.name == Carrier.USPS else "DP",
                    "Departed Origin Facility" if self.name == Carrier.USPS else "Left FedEx origin facility",
                    S.IN_TRANSIT,
                    origin,
                )
            )
            for hop in hops:
                t += rng.uniform(14, 30) * pace
                timeline.append(
                    (
                        t,
                        "T1" if self.name == Carrier.USPS else "AR",
                        "Arrived at Regional Facility"
                        if self.name == Carrier.USPS
                        else "Arrived at FedEx hub",
                        S.IN_TRANSIT,
                        hop,
                    )
                )
                t += rng.uniform(3, 9) * pace
                timeline.append(
                    (
                        t,
                        "TM" if self.name == Carrier.USPS else "DP",
                        "Departed Regional Facility" if self.name == Carrier.USPS else "Departed FedEx hub",
                        S.IN_TRANSIT,
                        hop,
                    )
                )
            local = (dest_city, dest_state, dest_zip5)
            t += rng.uniform(12, 24) * pace
            timeline.append(
                (
                    t,
                    "07" if self.name == Carrier.USPS else "AR",
                    "Arrived at Post Office" if self.name == Carrier.USPS else "At local FedEx facility",
                    S.IN_TRANSIT,
                    local,
                )
            )
            if scenario == "exception":
                t += rng.uniform(4, 8)
                timeline.append(
                    (
                        t,
                        "OF" if self.name == Carrier.USPS else "OD",
                        "Out for Delivery",
                        S.OUT_FOR_DELIVERY,
                        local,
                    )
                )
                t += rng.uniform(4, 8)
                timeline.append(
                    (
                        t,
                        "02" if self.name == Carrier.USPS else "DE",
                        "Notice Left (No Authorized Recipient Available)"
                        if self.name == Carrier.USPS
                        else "Delivery exception: customer not available",
                        S.EXCEPTION,
                        local,
                    )
                )
            elif scenario == "returned":
                t += rng.uniform(4, 8)
                timeline.append(
                    (
                        t,
                        "02" if self.name == Carrier.USPS else "DE",
                        "Undeliverable as Addressed"
                        if self.name == Carrier.USPS
                        else "Delivery exception: incorrect address",
                        S.EXCEPTION,
                        local,
                    )
                )
                t += rng.uniform(24, 72)
                timeline.append(
                    (
                        t,
                        "09" if self.name == Carrier.USPS else "RS",
                        "Return to Sender" if self.name == Carrier.USPS else "Returning package to shipper",
                        S.RETURNED,
                        local,
                    )
                )
            else:
                t += rng.uniform(6, 14)
                timeline.append(
                    (
                        t,
                        "OF" if self.name == Carrier.USPS else "OD",
                        "Out for Delivery",
                        S.OUT_FOR_DELIVERY,
                        local,
                    )
                )
                t += rng.uniform(3, 9)
                timeline.append(
                    (
                        t,
                        "01" if self.name == Carrier.USPS else "DL",
                        "Delivered, In/At Mailbox" if self.name == Carrier.USPS else "Delivered",
                        S.DELIVERED,
                        local,
                    )
                )

        events: list[NormalizedEvent] = []
        for off, code, desc, status, (city, st, z) in timeline:
            at = start + timedelta(hours=off)
            if at > now:
                break
            events.append(
                NormalizedEvent(
                    at=at,
                    at_raw=at.isoformat(),
                    code=code,
                    description=desc,
                    status=status,
                    city=city,
                    state=st,
                    postal_code=z,
                    country="US",
                    raw={"mock": True},
                )
            )
        events.reverse()
        latest = events[0] if events else None
        status = latest.status if latest else S.LABEL_CREATED
        last_off = timeline[-1][0]
        expected = (
            (start + timedelta(hours=last_off)).date()
            if status not in (S.DELIVERED, S.RETURNED) and scenario not in ("exception", "returned")
            else None
        )
        delivered_at = latest.at if latest and latest.status == S.DELIVERED else None
        flag = "delivery_failed" if status == S.EXCEPTION else None
        return TrackResult(
            tracking_number=number,
            carrier=self.name,
            status=status,
            status_raw=latest.description if latest else "Label created",
            status_code=latest.code if latest else "GX",
            attention_flag=flag,
            expected_delivery=expected,
            delivered_at=delivered_at,
            origin_postal_code=origin[2],
            dest_postal_code=dest_zip5,
            events=events,
            raw={"mock": True, "scenario": scenario},
        )
