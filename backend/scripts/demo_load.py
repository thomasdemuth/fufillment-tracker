"""Upload the demo spreadsheets to a running server and trigger a refresh with mock carriers.

Usage: python scripts/demo_load.py [http://localhost:8000]
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo"


def main(base: str) -> int:
    files = sorted(DEMO.glob("batch_*"))
    if not files:
        print("No demo files. Run `make seed` first.")
        return 1
    with httpx.Client(base_url=base, timeout=120) as c:
        for path in files:
            with path.open("rb") as fh:
                r = c.post("/api/uploads", files={"file": (path.name, fh)})
            r.raise_for_status()
            p = r.json()
            body = {
                "sheet": p["sheet"],
                "header_row": p["header_row"],
                "mapping": p["suggested_mapping"],
                "geocode_mode": "offline",
            }
            r = c.post(f"/api/uploads/{p['upload_id']}/commit", json=body)
            r.raise_for_status()
            res = r.json()
            print(f"{path.name}: {res['imported']} new, {res['duplicates']} merged, {res['skipped']} skipped")
        r = c.post("/api/refresh", json={"all": True, "include_terminal": True})
        if r.status_code in (404, 405):
            print("refresh endpoint not available yet")
            return 0
        r.raise_for_status()
        job_id = r.json()["job_id"]
        while True:
            j = c.get(f"/api/jobs/{job_id}").json()
            print(f"  refresh: {j['status']} {j['done']}/{j['total']}", end="\r")
            if j["status"] in ("done", "failed", "cancelled"):
                print()
                break
            time.sleep(0.5)
    print("done. Open", base)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"))
