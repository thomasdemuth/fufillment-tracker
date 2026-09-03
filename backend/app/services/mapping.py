"""Map spreadsheet headers onto shipment fields using synonyms + fuzzy matching."""

from __future__ import annotations

import hashlib
import re

from rapidfuzz import fuzz

# target field -> list of synonyms (lowercase, punctuation stripped)
FIELD_SYNONYMS: dict[str, list[str]] = {
    "tracking_number": [
        "tracking",
        "tracking number",
        "tracking no",
        "tracking #",
        "trackingnumber",
        "track",
        "tracking id",
        "shipment id",
        "label",
    ],
    "carrier": ["carrier", "shipping carrier", "shipper", "service", "shipping method", "courier"],
    "recipient_name": [
        "name",
        "recipient",
        "recipient name",
        "customer",
        "customer name",
        "full name",
        "ship to",
        "ship to name",
        "contact",
        "attention",
        "buyer",
    ],
    "company": ["company", "organization", "business", "org"],
    "address1": [
        "address",
        "address 1",
        "address1",
        "street",
        "street address",
        "address line 1",
        "ship to address",
        "shipping address",
        "addr1",
        "line 1",
    ],
    "address2": ["address 2", "address2", "address line 2", "apt", "suite", "unit", "addr2", "line 2"],
    "city": ["city", "town", "ship to city"],
    "state": ["state", "province", "region", "st", "state province", "ship to state"],
    "postal_code": ["zip", "zip code", "zipcode", "postal", "postal code", "postcode", "ship to zip"],
    "city_state_zip": ["city state zip", "city, state zip", "city/state/zip", "csz", "locality"],
    "country": ["country", "country code"],
    "email": ["email", "e-mail", "email address"],
    "phone": ["phone", "telephone", "phone number", "mobile"],
    "order_ref": ["order", "order number", "order #", "order id", "reference", "ref", "po", "invoice", "sku"],
    "ship_date": ["ship date", "shipped", "shipped date", "date shipped", "date", "sent", "ship on"],
    "status": ["status", "delivery status", "shipment status"],
}

# Which of these targets are required to import a row
REQUIRED_FIELDS = ["tracking_number"]
ALL_FIELDS = list(FIELD_SYNONYMS.keys())


def _norm(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[_\-/]+", " ", s)
    s = re.sub(r"[^a-z0-9#, ]+", "", s)
    return re.sub(r"\s+", " ", s).strip()


def score_header(header: str, field: str) -> float:
    h = _norm(header)
    if not h:
        return 0.0
    best = 0.0
    for syn in FIELD_SYNONYMS[field]:
        if h == syn:
            return 1.0
        # token-set similarity handles "Ship To Name" vs "name"
        best = max(best, fuzz.token_set_ratio(h, syn) / 100.0 * 0.9)
        if syn in h.split():
            best = max(best, 0.85)
    return best


def suggest_mapping(headers: list[str], sample_rows: list[list[str]] | None = None) -> dict[str, str]:
    """Return {field: header} for the best confident matches. One header per field, one field per header."""
    candidates: list[tuple[float, str, str]] = []
    for h in headers:
        for f in ALL_FIELDS:
            s = score_header(h, f)
            if s >= 0.6:
                candidates.append((s, f, h))
    candidates.sort(reverse=True)
    mapping: dict[str, str] = {}
    used_headers: set[str] = set()
    for _s, f, h in candidates:
        if f in mapping or h in used_headers:
            continue
        mapping[f] = h
        used_headers.add(h)

    # Content-based fallback for the tracking column if headers were unhelpful.
    if "tracking_number" not in mapping and sample_rows:
        best_h, best_hits = None, 0
        for i, h in enumerate(headers):
            hits = 0
            for r in sample_rows[:30]:
                v = r[i] if i < len(r) else ""
                v = re.sub(r"[\s\-]", "", v)
                if (
                    10 <= len(v) <= 34
                    and re.fullmatch(r"[A-Z0-9]+", v.upper())
                    and sum(c.isdigit() for c in v) >= 8
                ):
                    hits += 1
            if hits > best_hits:
                best_h, best_hits = h, hits
        if best_h and best_hits >= max(2, len(sample_rows[:30]) // 2):
            # Content wins over a weak header match (e.g. "Ref Code" fuzzily matched order_ref).
            for f_used, h_used in list(mapping.items()):
                if h_used == best_h:
                    del mapping[f_used]
            mapping["tracking_number"] = best_h

    # A combined "City, ST ZIP" column detected by content.
    if "city" not in mapping and "city_state_zip" not in mapping and sample_rows:
        for i, h in enumerate(headers):
            if h in used_headers:
                continue
            hits = sum(
                1 for r in sample_rows[:30] if i < len(r) and re.search(r",\s*[A-Za-z]{2}\.?\s+\d{5}", r[i])
            )
            if hits >= max(2, len(sample_rows[:30]) // 2):
                mapping["city_state_zip"] = h
                break
    return mapping


def header_signature(headers: list[str]) -> str:
    key = "|".join(sorted(_norm(h) for h in headers if h))
    return hashlib.sha1(key.encode()).hexdigest()
