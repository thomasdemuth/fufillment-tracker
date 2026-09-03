from __future__ import annotations

import re
from datetime import date, datetime

US_STATES = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "DC": "District of Columbia",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "PR": "Puerto Rico",
    "GU": "Guam",
    "VI": "Virgin Islands",
    "AS": "American Samoa",
    "MP": "Northern Mariana Islands",
}
_STATE_BY_NAME = {v.lower(): k for k, v in US_STATES.items()}

_ZIP_RE = re.compile(r"(\d{5})(?:-?(\d{4}))?")
_CITY_STATE_ZIP_RE = re.compile(
    r"^\s*(?P<city>[^,]+?)\s*,?\s+(?P<state>[A-Za-z]{2}|[A-Za-z .]{4,})\.?\s+(?P<zip>\d{5}(?:-\d{4})?)\s*$"
)


def clean(s: str | None) -> str | None:
    if s is None:
        return None
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s or None


def normalize_tracking(s: str | None) -> str | None:
    if not s:
        return None
    t = re.sub(r"[\s\-]", "", str(s)).upper()
    # Excel sometimes renders long numbers in scientific notation; nothing we can do but flag.
    if "E+" in t:
        return None
    return t or None


def normalize_state(s: str | None) -> str | None:
    s = clean(s)
    if not s:
        return None
    u = s.upper().strip(".")
    if u in US_STATES:
        return u
    return _STATE_BY_NAME.get(s.lower())


def normalize_zip(s: str | None) -> str | None:
    s = clean(s)
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    if len(digits) in (3, 4):  # leading zeros lost by Excel
        digits = digits.zfill(5)
    m = _ZIP_RE.search(digits if len(digits) <= 9 else s)
    if not m:
        return None
    z5, z4 = m.group(1), m.group(2)
    return f"{z5}-{z4}" if z4 else z5


def split_city_state_zip(s: str | None) -> tuple[str | None, str | None, str | None]:
    """'Austin, TX 78701' -> ('Austin', 'TX', '78701')."""
    s = clean(s)
    if not s:
        return None, None, None
    m = _CITY_STATE_ZIP_RE.match(s)
    if m:
        return clean(m.group("city")), normalize_state(m.group("state")), normalize_zip(m.group("zip"))
    parts = [p.strip() for p in s.split(",")]
    if len(parts) >= 2:
        city = parts[0]
        rest = " ".join(parts[1:]).split()
        st = normalize_state(rest[0]) if rest else None
        z = normalize_zip(rest[-1]) if len(rest) > 1 else None
        return clean(city), st, z
    return s, None, None


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%m/%d/%y",
    "%Y/%m/%d",
    "%d-%b-%Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%Y-%m-%d %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%m/%d/%Y %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
)


def parse_date(s: str | None) -> date | None:
    s = clean(s)
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        pass
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None
