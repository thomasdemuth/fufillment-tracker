from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ColumnPreset
from app.schemas.uploads import PresetIn, PresetOut
from app.services.mapping import header_signature

router = APIRouter(prefix="/presets")


@router.get("", response_model=list[PresetOut])
def list_presets(db: Session = Depends(get_db)):
    return db.execute(select(ColumnPreset).order_by(ColumnPreset.name)).scalars().all()


@router.post("", response_model=PresetOut, status_code=201)
def create_preset(body: PresetIn, db: Session = Depends(get_db)):
    if db.execute(select(ColumnPreset).where(ColumnPreset.name == body.name)).scalar_one_or_none():
        raise HTTPException(409, "A preset with that name already exists")
    p = ColumnPreset(
        name=body.name,
        mapping=body.mapping,
        header_signature=header_signature(body.headers) if body.headers else None,
    )
    db.add(p)
    db.commit()
    return p


@router.put("/{preset_id}", response_model=PresetOut)
def update_preset(preset_id: int, body: PresetIn, db: Session = Depends(get_db)):
    p = db.get(ColumnPreset, preset_id)
    if not p:
        raise HTTPException(404, "Preset not found")
    p.name, p.mapping = body.name, body.mapping
    if body.headers:
        p.header_signature = header_signature(body.headers)
    db.commit()
    return p


@router.delete("/{preset_id}", status_code=204)
def delete_preset(preset_id: int, db: Session = Depends(get_db)):
    p = db.get(ColumnPreset, preset_id)
    if not p:
        raise HTTPException(404, "Preset not found")
    db.delete(p)
    db.commit()
