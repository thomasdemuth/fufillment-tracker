"""Map carrier-specific status vocab onto NormalizedStatus. Tables are data so they're easy to extend."""

from __future__ import annotations

import re

from app.enums import NormalizedStatus as S

# ---------------------------------------------------------------- USPS
USPS_CATEGORY: dict[str, S] = {
    "pre-shipment": S.LABEL_CREATED,
    "preshipment": S.LABEL_CREATED,
    "shipping label created": S.LABEL_CREATED,
    "in transit": S.IN_TRANSIT,
    "accepted": S.IN_TRANSIT,
    "moving through network": S.IN_TRANSIT,
    "arriving early": S.IN_TRANSIT,
    "arriving late": S.IN_TRANSIT,
    "arriving on time": S.IN_TRANSIT,
    "out for delivery": S.OUT_FOR_DELIVERY,
    "delivered": S.DELIVERED,
    "delivered to agent": S.DELIVERED,
    "available for pickup": S.IN_TRANSIT,
    "alert": S.EXCEPTION,
    "return to sender": S.RETURNED,
    "returned": S.RETURNED,
}

USPS_ATTENTION_CATEGORY = {"available for pickup": "pickup"}

# USPS Publication 97 / TextTrack event codes (subset)
USPS_EVENT_CODE: dict[str, S] = {
    "GX": S.LABEL_CREATED,
    "MA": S.LABEL_CREATED,
    "GS": S.LABEL_CREATED,
    "03": S.IN_TRANSIT,
    "07": S.IN_TRANSIT,
    "10": S.IN_TRANSIT,
    "T1": S.IN_TRANSIT,
    "TM": S.IN_TRANSIT,
    "SF": S.IN_TRANSIT,
    "PC": S.IN_TRANSIT,
    "AE": S.IN_TRANSIT,
    "AD": S.IN_TRANSIT,
    "A1": S.IN_TRANSIT,
    "NT": S.IN_TRANSIT,
    "EF": S.IN_TRANSIT,
    "OA": S.IN_TRANSIT,
    "L1": S.IN_TRANSIT,
    "OF": S.OUT_FOR_DELIVERY,
    "59": S.OUT_FOR_DELIVERY,
    "01": S.DELIVERED,
    "DX": S.DELIVERED,
    "DN": S.DELIVERED,
    "17": S.DELIVERED,
    "16": S.IN_TRANSIT,  # available for pickup
    "02": S.EXCEPTION,
    "04": S.EXCEPTION,
    "05": S.EXCEPTION,
    "06": S.EXCEPTION,
    "53": S.EXCEPTION,
    "55": S.EXCEPTION,
    "56": S.EXCEPTION,
    "H0": S.EXCEPTION,
    "51": S.EXCEPTION,
    "52": S.EXCEPTION,
    "09": S.RETURNED,
    "21": S.RETURNED,
    "28": S.RETURNED,
    "29": S.RETURNED,
    "31": S.RETURNED,
}
USPS_ATTENTION_CODE = {
    "16": "pickup",
    "02": "delivery_failed",
    "55": "delivery_failed",
    "53": "delivery_failed",
}

# ---------------------------------------------------------------- FedEx
FEDEX_CODE: dict[str, S] = {
    "OC": S.LABEL_CREATED,
    "IN": S.LABEL_CREATED,
    "PU": S.IN_TRANSIT,
    "IT": S.IN_TRANSIT,
    "AR": S.IN_TRANSIT,
    "DP": S.IN_TRANSIT,
    "AF": S.IN_TRANSIT,
    "CD": S.IN_TRANSIT,
    "CC": S.IN_TRANSIT,
    "HL": S.IN_TRANSIT,
    "PF": S.IN_TRANSIT,
    "PM": S.IN_TRANSIT,
    "SP": S.IN_TRANSIT,
    "PX": S.IN_TRANSIT,
    "SE": S.EXCEPTION,
    "FD": S.IN_TRANSIT,
    "TR": S.IN_TRANSIT,
    "OD": S.OUT_FOR_DELIVERY,
    "DL": S.DELIVERED,
    "DE": S.EXCEPTION,
    "DY": S.EXCEPTION,
    "CA": S.EXCEPTION,
    "RR": S.EXCEPTION,
    "RS": S.RETURNED,
    "RG": S.RETURNED,
    "RP": S.RETURNED,
}
FEDEX_ATTENTION_CODE = {"HL": "pickup", "DE": "delivery_failed", "RR": "delivery_failed"}

# ---------------------------------------------------------------- keyword fallback (any carrier)
KEYWORDS: list[tuple[re.Pattern[str], S]] = [
    (re.compile(r"\bdelivered\b(?!.*\bnot\b)", re.I), S.DELIVERED),
    (re.compile(r"out for delivery", re.I), S.OUT_FOR_DELIVERY),
    (re.compile(r"return(ed|ing)? to (sender|shipper)|returned", re.I), S.RETURNED),
    (
        re.compile(
            r"label created|shipping label|awaiting item|pre-?shipment|shipment information sent", re.I
        ),
        S.LABEL_CREATED,
    ),
    (
        re.compile(
            r"notice left|undeliverable|refused|delay|alert|held|exception|damaged|unable|missed|attempt",
            re.I,
        ),
        S.EXCEPTION,
    ),
    (re.compile(r"available for pickup|pickup", re.I), S.IN_TRANSIT),
    (
        re.compile(r"in transit|arrived|departed|accepted|processed|picked up|on its way|moving", re.I),
        S.IN_TRANSIT,
    ),
]


def by_keywords(text: str | None) -> S | None:
    if not text:
        return None
    for pat, status in KEYWORDS:
        if pat.search(text):
            return status
    return None


def map_usps(category: str | None, latest_code: str | None, description: str | None) -> tuple[S, str | None]:
    """Returns (status, attention_flag)."""
    cat = (category or "").strip().lower()
    if cat in USPS_CATEGORY:
        return USPS_CATEGORY[cat], USPS_ATTENTION_CATEGORY.get(cat)
    code = (latest_code or "").strip().upper()
    if code in USPS_EVENT_CODE:
        return USPS_EVENT_CODE[code], USPS_ATTENTION_CODE.get(code)
    for key, status in USPS_CATEGORY.items():
        if key in cat:
            return status, USPS_ATTENTION_CATEGORY.get(key)
    kw = by_keywords(description) or by_keywords(category)
    if kw:
        return kw, None
    return S.UNKNOWN, None


def map_fedex(derived_code: str | None, code: str | None, description: str | None) -> tuple[S, str | None]:
    for c in (derived_code, code):
        c = (c or "").strip().upper()
        if c in FEDEX_CODE:
            return FEDEX_CODE[c], FEDEX_ATTENTION_CODE.get(c)
    kw = by_keywords(description)
    if kw:
        return kw, None
    return S.UNKNOWN, None
