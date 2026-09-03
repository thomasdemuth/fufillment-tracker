import pytest

from app.services.mapping import header_signature, suggest_mapping


def test_maps_common_headers():
    m = suggest_mapping(
        ["Order #", "Customer Name", "Address 1", "City", "State", "ZIP", "Tracking Number", "Carrier"]
    )
    assert m["tracking_number"] == "Tracking Number"
    assert m["recipient_name"] == "Customer Name"
    assert m["address1"] == "Address 1"
    assert m["postal_code"] == "ZIP"
    assert m["order_ref"] == "Order #"
    assert m["carrier"] == "Carrier"


def test_maps_odd_headers():
    m = suggest_mapping(["Ship To Name", "Street", "Town", "ST", "Postal Code", "Tracking #", "Shipped"])
    assert m["recipient_name"] == "Ship To Name"
    assert m["city"] == "Town"
    assert m["state"] == "ST"
    assert m["ship_date"] == "Shipped"
    assert m["tracking_number"] == "Tracking #"


def test_detects_tracking_by_content_when_header_is_useless():
    rows = [["Bob", "9400111899223197428490"], ["Sue", "123456789012"], ["Al", "9400111899223197428491"]]
    m = suggest_mapping(["Person", "Ref Code"], rows)
    assert m["tracking_number"] == "Ref Code"


def test_detects_combined_city_state_zip():
    rows = [["Bob", "Austin, TX 78701"], ["Sue", "Denver, CO 80202"], ["Al", "Boise, ID 83702"]]
    m = suggest_mapping(["Name", "Location"], rows)
    assert m["city_state_zip"] == "Location"


@pytest.mark.parametrize(
    "a,b,same", [(["Name", "ZIP"], ["zip", "name"], True), (["Name"], ["Name", "ZIP"], False)]
)
def test_signature(a, b, same):
    assert (header_signature(a) == header_signature(b)) is same
