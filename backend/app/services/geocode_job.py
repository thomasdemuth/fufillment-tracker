"""Background job: street-level geocoding for one upload (opt-in). Falls back to the offline result."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.db import session_factory
from app.geocode.base import AddressQuery
from app.geocode.cache import CachingGeocoder
from app.geocode.online import build_online_geocoder
from app.models import Job, Shipment

log = logging.getLogger("geocode")


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def run_geocode_job(job_id: int) -> None:
    Session = session_factory()
    with Session() as db:
        job = db.get(Job, job_id)
        if not job or job.status != "queued":
            return
        ids = list((job.error_sample or {}).get("ids", []))
        geocoder = build_online_geocoder(db)
        if geocoder is None:
            job.status, job.finished_at, job.message = (
                "failed",
                _now(),
                "Online geocoder is not configured (Settings > Geocoding)",
            )
            db.commit()
            return
        job.status, job.started_at = "running", _now()
        db.commit()
        cached = CachingGeocoder(geocoder, db)
        done = updated = errors = 0
        samples: list[str] = []
        try:
            for sid in ids:
                s = db.get(Shipment, sid)
                if s is None:
                    continue
                if db.get(Job, job_id).cancel_requested:
                    job.status = "cancelled"
                    break
                if s.address1 and s.geocode_precision != "street":
                    try:
                        res = await cached.geocode(
                            AddressQuery(s.address1, s.city, s.state, s.postal_code, s.country or "US")
                        )
                        if res:
                            s.dest_lat, s.dest_lng, s.geocode_precision, s.geocode_source = (
                                res.lat,
                                res.lng,
                                res.precision,
                                res.source,
                            )
                            updated += 1
                    except Exception as e:
                        errors += 1
                        if len(samples) < 20:
                            samples.append(f"{s.tracking_number}: {e}")
                done += 1
                job.done, job.updated, job.errors = done, updated, errors
                job.error_sample = {"ids": ids, "errors": samples}
                db.commit()
            if job.status != "cancelled":
                job.status = "done"
            job.message = f"{updated} placed at street level, {errors} errors"
        except Exception as e:  # pragma: no cover
            log.exception("geocode job failed")
            job.status, job.message = "failed", str(e)[:500]
        job.finished_at = _now()
        job.error_sample = {"ids": [], "errors": samples}
        db.commit()
