"""Manual refresh jobs. One job runs at a time; progress is stored in the jobs table and polled by the UI."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.carriers.base import TrackError, TrackResult
from app.carriers.registry import build_client, carrier_config
from app.db import session_factory
from app.enums import TERMINAL_STATUSES, Carrier
from app.models import Job, Shipment
from app.services.tracking import apply_error, apply_result

log = logging.getLogger("refresh")
_lock = asyncio.Lock()


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def is_running() -> bool:
    return _lock.locked()


def select_targets(db: Session, ids: list[int] | None, include_terminal: bool) -> list[int]:
    stmt = select(Shipment.id).where(Shipment.carrier.in_([Carrier.USPS, Carrier.FEDEX]))
    if ids is not None:
        stmt = stmt.where(Shipment.id.in_(ids))
    if not include_terminal:
        stmt = stmt.where(Shipment.status.not_in(list(TERMINAL_STATUSES)))
    return [r[0] for r in db.execute(stmt.order_by(Shipment.last_polled_at.asc().nulls_first()))]


def create_job(db: Session, shipment_ids: list[int]) -> Job:
    job = Job(
        kind="refresh",
        status="queued",
        total=len(shipment_ids),
        error_sample={"ids": shipment_ids, "errors": []},
    )
    db.add(job)
    db.commit()
    return job


def _mock_context(shipments: list[Shipment]) -> dict:
    return {
        "ship_dates": {s.tracking_number: s.ship_date for s in shipments if s.ship_date},
        "dest_zips": {s.tracking_number: s.postal_code for s in shipments if s.postal_code},
    }


async def run_job(job_id: int) -> None:
    async with _lock:
        Session = session_factory()
        with Session() as db:
            job = db.get(Job, job_id)
            if not job or job.status != "queued":
                return
            job.status, job.started_at = "running", _now()
            db.commit()
        try:
            await _run(job_id)
        except Exception as e:  # pragma: no cover - defensive
            log.exception("refresh job failed")
            with Session() as db:
                job = db.get(Job, job_id)
                if job:
                    job.status, job.finished_at, job.message = "failed", _now(), str(e)[:500]
                    db.commit()


async def _run(job_id: int) -> None:
    Session = session_factory()
    with Session() as db:
        job = db.get(Job, job_id)
        ids: list[int] = list((job.error_sample or {}).get("ids", []))
        shipments = db.execute(select(Shipment).where(Shipment.id.in_(ids))).scalars().all()
        by_carrier: dict[Carrier, list[tuple[int, str]]] = {}
        for s in shipments:
            by_carrier.setdefault(Carrier(s.carrier), []).append((s.id, s.tracking_number))
        clients = {c: build_client(carrier_config(db, c), _mock_context(shipments)) for c in by_carrier}

    done = updated = errors = 0
    samples: list[str] = []
    for carrier, group in by_carrier.items():
        client = clients.get(carrier)
        if client is None:
            with Session() as db:
                for sid, tn in group:
                    apply_error(
                        db,
                        db.get(Shipment, sid),
                        TrackError(tn, "disabled", f"{carrier.value.upper()} is not configured"),
                    )
                errors += len(group)
                done += len(group)
                samples.append(f"{carrier.value.upper()}: not configured (see Settings)")
                _progress(db, job_id, done, updated, errors, samples)
            continue
        batch = max(1, client.max_batch)
        for i in range(0, len(group), batch):
            with Session() as db:
                if db.get(Job, job_id).cancel_requested:
                    _finish(db, job_id, "cancelled", done, updated, errors, samples)
                    return
            chunk = group[i : i + batch]
            try:
                results = await client.fetch([tn for _, tn in chunk])
            except Exception as e:  # network failure for the whole chunk
                results = {tn: TrackError(tn, "transient", str(e)[:200]) for _, tn in chunk}
            with Session() as db:
                for sid, tn in chunk:
                    sh = db.get(Shipment, sid)
                    r = results.get(tn)
                    if isinstance(r, TrackResult):
                        if apply_result(db, sh, r):
                            updated += 1
                    else:
                        err = r or TrackError(tn, "transient", "no result returned")
                        apply_error(db, sh, err)
                        errors += 1
                        if len(samples) < 20:
                            samples.append(f"{tn}: {err.kind}: {err.message}")
                    done += 1
                _progress(db, job_id, done, updated, errors, samples)
            await asyncio.sleep(0)
    with Session() as db:
        _finish(db, job_id, "done", done, updated, errors, samples)


def _progress(db: Session, job_id: int, done: int, updated: int, errors: int, samples: list[str]) -> None:
    job = db.get(Job, job_id)
    job.done, job.updated, job.errors = done, updated, errors
    job.error_sample = {"ids": (job.error_sample or {}).get("ids", []), "errors": samples}
    db.commit()


def _finish(
    db: Session, job_id: int, status: str, done: int, updated: int, errors: int, samples: list[str]
) -> None:
    job = db.get(Job, job_id)
    job.status, job.finished_at = status, _now()
    job.done, job.updated, job.errors = done, updated, errors
    job.error_sample = {"ids": [], "errors": samples}  # drop ids once finished to keep rows small
    if status == "done":
        job.message = f"{updated} updated, {errors} errors"
    db.commit()


async def refresh_one(db: Session, shipment: Shipment) -> TrackResult | TrackError:
    """Synchronous single-shipment refresh used by the detail view."""
    if shipment.carrier not in (Carrier.USPS, Carrier.FEDEX):
        err = TrackError(shipment.tracking_number, "invalid", "Carrier unknown: set it first")
        apply_error(db, shipment, err)
        db.commit()
        return err
    client = build_client(carrier_config(db, Carrier(shipment.carrier)), _mock_context([shipment]))
    if client is None:
        err = TrackError(
            shipment.tracking_number, "disabled", f"{shipment.carrier.upper()} is not configured"
        )
        apply_error(db, shipment, err)
        db.commit()
        return err
    try:
        res = (await client.fetch([shipment.tracking_number])).get(shipment.tracking_number)
    except Exception as e:
        res = TrackError(shipment.tracking_number, "transient", str(e)[:200])
    if isinstance(res, TrackResult):
        apply_result(db, shipment, res)
    else:
        res = res or TrackError(shipment.tracking_number, "transient", "no result")
        apply_error(db, shipment, res)
    db.commit()
    return res
