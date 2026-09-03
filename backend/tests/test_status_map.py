import pytest

from app.enums import NormalizedStatus as S
from app.services.status_map import by_keywords, map_fedex, map_usps


@pytest.mark.parametrize(
    "cat,code,desc,expected,flag",
    [
        ("Delivered", None, None, S.DELIVERED, None),
        ("Delivered to Agent", None, None, S.DELIVERED, None),
        ("In Transit", None, None, S.IN_TRANSIT, None),
        ("Moving Through Network", None, None, S.IN_TRANSIT, None),
        ("Out for Delivery", None, None, S.OUT_FOR_DELIVERY, None),
        ("Pre-Shipment", None, None, S.LABEL_CREATED, None),
        ("Available for Pickup", None, None, S.IN_TRANSIT, "pickup"),
        ("Alert", None, None, S.EXCEPTION, None),
        ("Return to Sender", None, None, S.RETURNED, None),
        (None, "01", None, S.DELIVERED, None),
        (None, "OF", None, S.OUT_FOR_DELIVERY, None),
        (None, "02", None, S.EXCEPTION, "delivery_failed"),
        (None, "GX", None, S.LABEL_CREATED, None),
        (None, None, "Your item was delivered in the mailbox", S.DELIVERED, None),
        (None, None, "Notice Left (No Authorized Recipient Available)", S.EXCEPTION, None),
        (None, None, "something odd", S.UNKNOWN, None),
    ],
)
def test_usps(cat, code, desc, expected, flag):
    assert map_usps(cat, code, desc) == (expected, flag)


@pytest.mark.parametrize(
    "derived,code,desc,expected,flag",
    [
        ("DL", None, None, S.DELIVERED, None),
        ("OD", None, None, S.OUT_FOR_DELIVERY, None),
        ("IT", "AR", None, S.IN_TRANSIT, None),
        ("OC", None, None, S.LABEL_CREATED, None),
        ("DE", None, None, S.EXCEPTION, "delivery_failed"),
        ("SE", None, None, S.EXCEPTION, None),
        ("RS", None, None, S.RETURNED, None),
        (None, "HL", None, S.IN_TRANSIT, "pickup"),
        (None, None, "Delivery exception", S.EXCEPTION, None),
        (None, None, "Picked up", S.IN_TRANSIT, None),
    ],
)
def test_fedex(derived, code, desc, expected, flag):
    assert map_fedex(derived, code, desc) == (expected, flag)


def test_keywords_prefer_delivered_over_transit():
    assert by_keywords("Delivered, In/At Mailbox") == S.DELIVERED
    assert by_keywords("Arrived at USPS Regional Facility") == S.IN_TRANSIT
    assert by_keywords("Label Created, not yet in system") == S.LABEL_CREATED
