import pytest

from app.carriers.detect import _usps_impb_check_ok, carrier_link, detect_carrier


@pytest.mark.parametrize(
    "num,carrier,min_conf",
    [
        ("9400111899223197428490", "usps", 0.85),
        ("EA123456789US", "usps", 1.0),
        ("123456789012", "fedex", 0.9),
        ("123456789012345", "fedex", 0.9),
        ("9612345678901234567890", "fedex", 0.9),
        ("", "unknown", 0.0),
        ("hello", "unknown", 0.0),
    ],
)
def test_detect(num, carrier, min_conf):
    c, conf = detect_carrier(num)
    assert c == carrier
    assert conf >= min_conf


def test_check_digit():
    body = "940011189922319742849"
    total = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        total += d * 3 if i % 2 == 0 else d
    check = (10 - total % 10) % 10
    assert _usps_impb_check_ok(body + str(check))
    assert not _usps_impb_check_ok(body + str((check + 1) % 10))
    assert detect_carrier(body + str(check))[1] == 1.0


def test_twenty_digit_is_low_confidence():
    c, conf = detect_carrier("61299999999999999999")
    assert c == "fedex" and conf < 0.7
    c, conf = detect_carrier("12345678901234567890")
    assert c == "usps" and conf < 0.7


def test_links():
    assert "usps.com" in carrier_link("usps", "X")
    assert "fedex.com" in carrier_link("fedex", "X")
    assert carrier_link("unknown", "X") is None
