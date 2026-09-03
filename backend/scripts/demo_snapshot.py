"""Regenerate the demo snapshot bundled with the hosted site, from FAKE data only.

Starts a throwaway server on a temporary data directory, loads the seeded demo spreadsheets (make seed),
refreshes them with the mock carriers, exports /api/snapshot to frontend/public/demo/demo.snapshot.json,
and deletes the temporary directory. Your real database is never touched, so real names and addresses
cannot end up in the repository.

Usage: python scripts/demo_snapshot.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "public" / "demo" / "demo.snapshot.json"
PORT = 8765


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from demo_load import main as load_demo

    if not list((ROOT / "demo").glob("batch_*")):
        print("No demo spreadsheets. Run `make seed` first.")
        return 1
    with tempfile.TemporaryDirectory(prefix="ft-demo-") as tmp:
        env = {**os.environ, "DATA_DIR": tmp, "CARRIER_MODE": "mock", "APP_PASSWORD": "", "PUBLIC_URL": ""}
        env.pop("HOSTED_UI_URL", None)
        backend = ROOT / "backend"
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=backend, env=env, check=True)
        server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT), "--log-level", "warning"],
            cwd=backend,
            env=env,
        )
        base = f"http://127.0.0.1:{PORT}"
        try:
            for _ in range(100):
                try:
                    if httpx.get(f"{base}/api/health", timeout=2).status_code == 200:
                        break
                except httpx.HTTPError:
                    time.sleep(0.2)
            else:
                print("Server did not start")
                return 1
            rc = load_demo(base)
            if rc:
                return rc
            r = httpx.get(f"{base}/api/snapshot", timeout=120)
            r.raise_for_status()
            OUT.parent.mkdir(parents=True, exist_ok=True)
            OUT.write_bytes(r.content)
            print(f"Wrote {OUT} ({len(r.content) // 1024} KB, {len(r.json()['shipments'])} fake shipments)")
        finally:
            server.terminate()
            server.wait(timeout=10)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
