"""Carrier detection from tracking-number shape. Returns (carrier, confidence)."""

from __future__ import annotations

import re

from app.enums import Carrier


def _usps_impb_check_ok(num: str) -> bool:
    """USPS IMpb (22 digits) uses a mod-10 check digit on the last position."""
    if len(num) != 22 or not num.isdigit():
        return False
    body, check = num[:-1], int(num[-1])
    total = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        total += d * 3 if i % 2 == 0 else d
    return (10 - total % 10) % 10 == check


_RULES: list[tuple[re.Pattern[str], Carrier, float]] = [
    (re.compile(r"^[A-Z]{2}\d{9}US$"), Carrier.USPS, 1.0),  # international / Priority Express
    (re.compile(r"^82\d{8}$"), Carrier.USPS, 0.9),  # Global Express Guaranteed
    (re.compile(r"^\d{12}$"), Carrier.FEDEX, 0.95),  # FedEx Express
    (re.compile(r"^\d{15}$"), Carrier.FEDEX, 0.95),  # FedEx Ground
    (re.compile(r"^96\d{20}$"), Carrier.FEDEX, 0.9),  # FedEx Ground 96 barcode
    (re.compile(r"^\d{34}$"), Carrier.FEDEX, 0.8),  # FedEx Ground 34-digit
]


def detect_carrier(tracking_number: str | None) -> tuple[Carrier, float]:
    if not tracking_number:
        return Carrier.UNKNOWN, 0.0
    t = re.sub(r"[\s\-]", "", tracking_number).upper()
    for pattern, carrier, conf in _RULES:
        if pattern.match(t):
            return carrier, conf
    if len(t) == 22 and t.isdigit():
        if t.startswith(("92", "93", "94", "95")):
            return Carrier.USPS, 1.0 if _usps_impb_check_ok(t) else 0.85
        return Carrier.USPS, 0.6
    if len(t) in (26, 30, 32, 34) and t.isdigit() and t.startswith(("420", "92", "93", "94", "95")):
        return Carrier.USPS, 0.9  # IMpb with routing prefix
    if len(t) == 20 and t.isdigit():
        # Both USPS (older) and FedEx SmartPost use 20 digits; SmartPost commonly starts with 61/58.
        if t.startswith(("61", "58", "02")):
            return Carrier.FEDEX, 0.55
        return Carrier.USPS, 0.6
    return Carrier.UNKNOWN, 0.0


def carrier_link(carrier: str, tracking_number: str) -> str | None:
    if carrier == Carrier.USPS:
        return f"https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking_number}"
    if carrier == Carrier.FEDEX:
        return f"https://www.fedex.com/fedextrack/?trknbr={tracking_number}"
    return None
