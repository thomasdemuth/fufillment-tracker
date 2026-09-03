"""Generate demo spreadsheets with fake recipients and real-format tracking numbers.

Writes ./demo/batch_1.xlsx, ./demo/batch_2.xlsx (overlaps batch_1 for dedupe) and ./demo/batch_3_messy.csv
(different headers, header on row 2, combined 'City, ST ZIP' column). All data is fake.
"""

from __future__ import annotations

import csv
import random
import sys
from datetime import date, timedelta
from pathlib import Path

import zipcodes
from faker import Faker
from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "demo"
SEED = 42


def usps_impb(rng: random.Random) -> str:
    body = "9400" + "".join(rng.choice("0123456789") for _ in range(17))
    total = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        total += d * 3 if i % 2 == 0 else d
    return body + str((10 - total % 10) % 10)


def fedex_num(rng: random.Random) -> str:
    n = rng.choice([12, 15])
    return "".join(rng.choice("0123456789") for _ in range(n))


def pick_zips(rng: random.Random, n: int) -> list[dict]:
    allz = [
        z
        for z in zipcodes.list_all()
        if z.get("lat") and z.get("zip_code_type") == "STANDARD" and z.get("active")
    ]
    # Bias toward populous states so the map looks realistic.
    weights = {
        "CA": 6,
        "TX": 5,
        "FL": 4,
        "NY": 4,
        "PA": 2,
        "IL": 2,
        "OH": 2,
        "GA": 2,
        "NC": 2,
        "MI": 2,
        "WA": 2,
        "AZ": 2,
    }
    pool: list[dict] = []
    for z in allz:
        pool.extend([z] * weights.get(z["state"], 1))
    return rng.sample(pool, n)


def make_rows(fake: Faker, rng: random.Random, n: int, start_id: int) -> list[dict]:
    zips = pick_zips(rng, n)
    rows = []
    today = date.today()
    for i, z in enumerate(zips):
        carrier = rng.choices(["USPS", "FedEx"], weights=[65, 35])[0]
        tracking = usps_impb(rng) if carrier == "USPS" else fedex_num(rng)
        ship = today - timedelta(days=rng.randint(0, 30))
        rows.append(
            {
                "order": f"ORD-{start_id + i:05d}",
                "name": fake.name(),
                "company": fake.company() if rng.random() < 0.2 else "",
                "address1": fake.street_address(),
                "address2": rng.choice(
                    ["", "", "", f"Apt {rng.randint(1, 400)}", f"Suite {rng.randint(100, 900)}"]
                ),
                "city": z["city"],
                "state": z["state"],
                "zip": z["zip_code"],
                "email": fake.email(),
                "phone": fake.phone_number() if rng.random() < 0.5 else "",
                "carrier": carrier,
                "tracking": tracking,
                "ship_date": ship,
            }
        )
    return rows


def write_xlsx(path: Path, rows: list[dict], headers: list[tuple[str, str]]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Shipments"
    ws.append([h for h, _ in headers])
    for r in rows:
        ws.append([r[k] for _, k in headers])
    wb.save(path)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    fake = Faker("en_US")
    Faker.seed(SEED)
    rng = random.Random(SEED)

    batch1 = make_rows(fake, rng, 140, 1000)
    batch2_new = make_rows(fake, rng, 90, 2000)
    batch2 = rng.sample(batch1, 25) + batch2_new  # 25 duplicates
    batch3 = make_rows(fake, rng, 70, 3000)

    h1 = [
        ("Order #", "order"),
        ("Customer Name", "name"),
        ("Company", "company"),
        ("Address 1", "address1"),
        ("Address 2", "address2"),
        ("City", "city"),
        ("State", "state"),
        ("ZIP", "zip"),
        ("Email", "email"),
        ("Phone", "phone"),
        ("Carrier", "carrier"),
        ("Tracking Number", "tracking"),
        ("Ship Date", "ship_date"),
    ]
    write_xlsx(OUT / "batch_1.xlsx", batch1, h1)

    h2 = [
        ("Ship To Name", "name"),
        ("Street", "address1"),
        ("Apt/Suite", "address2"),
        ("Town", "city"),
        ("ST", "state"),
        ("Postal Code", "zip"),
        ("Tracking #", "tracking"),
        ("Shipped", "ship_date"),
        ("Reference", "order"),
        ("E-mail", "email"),
    ]
    write_xlsx(OUT / "batch_2.xlsx", batch2, h2)

    # messy CSV: title row, then header on row 2, combined city/state/zip, no carrier column
    with (OUT / "batch_3_messy.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Holiday gift shipments - exported 2026", "", "", "", ""])
        w.writerow(["Recipient", "Address", "City, State Zip", "Tracking ID", "Sent On"])
        for r in batch3:
            addr = r["address1"] + (f", {r['address2']}" if r["address2"] else "")
            w.writerow(
                [
                    r["name"],
                    addr,
                    f"{r['city']}, {r['state']} {r['zip']}",
                    r["tracking"],
                    r["ship_date"].strftime("%m/%d/%Y"),
                ]
            )

    print(f"wrote {len(batch1)} + {len(batch2)} (25 dupes) + {len(batch3)} rows to {OUT}")


if __name__ == "__main__":
    sys.exit(main())
