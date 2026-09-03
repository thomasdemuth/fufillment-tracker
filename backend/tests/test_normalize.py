from datetime import date

from app.services.normalize import (
    normalize_state,
    normalize_tracking,
    normalize_zip,
    parse_date,
    split_city_state_zip,
)


def test_zip():
    assert normalize_zip("1324") == "01324"
    assert normalize_zip("78701-1234") == "78701-1234"
    assert normalize_zip("787011234") == "78701-1234"
    assert normalize_zip("abc") is None


def test_state():
    assert normalize_state("tx") == "TX"
    assert normalize_state("Texas") == "TX"
    assert normalize_state("Nowhere") is None


def test_split():
    assert split_city_state_zip("Cold Brook, NY 13324") == ("Cold Brook", "NY", "13324")
    assert split_city_state_zip("San Jose, California 95112") == ("San Jose", "CA", "95112")
    assert split_city_state_zip("Austin TX 78701") == ("Austin", "TX", "78701")


def test_tracking():
    assert normalize_tracking(" 9400 1118 9922 3197 4284 90 ") == "9400111899223197428490"
    assert normalize_tracking("9.4E+21") is None


def test_dates():
    assert parse_date("08/09/2026") == date(2026, 8, 9)
    assert parse_date("2026-08-09") == date(2026, 8, 9)
    assert parse_date("2026-08-09 00:00:00") == date(2026, 8, 9)
    assert parse_date("nope") is None
