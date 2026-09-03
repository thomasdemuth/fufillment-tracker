from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import stuck_days
from app.db import get_db
from app.models import Job
from app.schemas.tracking import JobOut, RefreshRequest, RefreshStarted, job_out
from app.services import refresh as refresh_service
from app.services.query import ShipmentFilters, apply_filters, base_select

router = APIRouter()


def _filters_from_dict(d: dict) -> ShipmentFilters:
    def lst(k):  # noqa: ANN001
        v = d.get(k) or []
        if isinstance(v, str):
            v = [x for x in v.split(",") if x]
        return list(v)

    def num(k):  # noqa: ANN001
        v = d.get(k)
        return None if v in (None, "") else float(v)

    from datetime import date

    def dt(k):  # noqa: ANN001
        v = d.get(k)
        return date.fromisoformat(v) if v else None

    return ShipmentFilters(
        status=lst("status"),
        carrier=lst("carrier"),
        upload_id=[int(x) for x in lst("upload_id")],
        state=lst("state"),
        tag=lst("tag"),
        city=d.get("city") or None,
        q=d.get("q") or None,
        ship_date_from=dt("ship_date_from"),
        ship_date_to=dt("ship_date_to"),
        last_event_from=dt("last_event_from"),
        last_event_to=dt("last_event_to"),
        days_min=num("days_min"),
        days_max=num("days_max"),
        attention=bool(d.get("attention")) or None,
        geocoded=None if d.get("geocoded") in (None, "") else bool(d.get("geocoded")),
    )


@router.post("/refresh", response_model=RefreshStarted)
def start_refresh(
    body: RefreshRequest, bg: BackgroundTasks, sd: int = Depends(stuck_days), db: Session = Depends(get_db)
):
    if refresh_service.is_running():
        running = (
            db.execute(select(Job).where(Job.status.in_(["queued", "running"])).order_by(Job.id.desc()))
            .scalars()
            .first()
        )
        raise HTTPException(409, f"A refresh is already running (job {running.id if running else '?'})")
    ids: list[int] | None
    if body.shipment_ids:
        ids = body.shipment_ids
    elif body.filters:
        stmt = apply_filters(base_select(), _filters_from_dict(body.filters), sd)
        ids = [s.id for s in db.execute(stmt).scalars()]
    elif body.all:
        ids = None
    else:
        raise HTTPException(422, "Provide all=true, shipment_ids or filters")
    targets = refresh_service.select_targets(db, ids, body.include_terminal)
    if not targets:
        return RefreshStarted(job_id=None, queued=0)
    job = refresh_service.create_job(db, targets)
    bg.add_task(refresh_service.run_job, job.id)
    return RefreshStarted(job_id=job.id, queued=len(targets))


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db)):
    return [job_out(j) for j in db.execute(select(Job).order_by(Job.id.desc()).limit(20)).scalars()]


@router.get("/jobs/current", response_model=JobOut | None)
def current_job(db: Session = Depends(get_db)):
    j = (
        db.execute(select(Job).where(Job.status.in_(["queued", "running"])).order_by(Job.id.desc()))
        .scalars()
        .first()
    )
    return job_out(j) if j else None


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return job_out(j)


@router.post("/jobs/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: int, db: Session = Depends(get_db)):
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    if j.status in ("queued", "running"):
        j.cancel_requested = True
        if j.status == "queued":
            j.status = "cancelled"
        db.commit()
    return job_out(j)
