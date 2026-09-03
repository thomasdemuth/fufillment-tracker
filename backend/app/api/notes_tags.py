from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.shipments import load_shipment, shipment_detail
from app.db import get_db
from app.models import Note, ShipmentTag, Tag
from app.schemas.common import TagOut
from app.schemas.tracking import NoteOut, ShipmentDetail

router = APIRouter()

TAG_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#64748b"]


class NoteIn(BaseModel):
    body: str


class TagIn(BaseModel):
    name: str
    color: str | None = None


class TagsSet(BaseModel):
    tags: list[str]


@router.post("/shipments/{shipment_id}/notes", response_model=ShipmentDetail, status_code=201)
def add_note(shipment_id: int, body: NoteIn, db: Session = Depends(get_db)):
    s = load_shipment(db, shipment_id)
    if not body.body.strip():
        raise HTTPException(422, "Note is empty")
    db.add(Note(shipment_id=s.id, body=body.body.strip()))
    db.commit()
    return shipment_detail(db, load_shipment(db, shipment_id))


@router.put("/notes/{note_id}", response_model=NoteOut)
def edit_note(note_id: int, body: NoteIn, db: Session = Depends(get_db)):
    n = db.get(Note, note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    n.body = body.body.strip()
    db.commit()
    return n


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    n = db.get(Note, note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    db.delete(n)
    db.commit()


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    return db.execute(select(Tag).order_by(Tag.name)).scalars().all()


def _get_or_create_tag(db: Session, name: str, color: str | None = None) -> Tag:
    name = name.strip()[:60]
    if not name:
        raise HTTPException(422, "Tag name is empty")
    t = db.execute(select(Tag).where(Tag.name == name)).scalar_one_or_none()
    if t is None:
        n = db.execute(select(Tag)).scalars().all()
        t = Tag(name=name, color=color or TAG_COLORS[len(n) % len(TAG_COLORS)])
        db.add(t)
        db.flush()
    elif color:
        t.color = color
    return t


@router.post("/tags", response_model=TagOut, status_code=201)
def create_tag(body: TagIn, db: Session = Depends(get_db)):
    t = _get_or_create_tag(db, body.name, body.color)
    db.commit()
    return t


@router.put("/tags/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, body: TagIn, db: Session = Depends(get_db)):
    t = db.get(Tag, tag_id)
    if not t:
        raise HTTPException(404, "Tag not found")
    t.name = body.name.strip()[:60] or t.name
    if body.color:
        t.color = body.color
    db.commit()
    return t


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    t = db.get(Tag, tag_id)
    if not t:
        raise HTTPException(404, "Tag not found")
    db.delete(t)
    db.commit()


@router.put("/shipments/{shipment_id}/tags", response_model=ShipmentDetail)
def set_tags(shipment_id: int, body: TagsSet, db: Session = Depends(get_db)):
    s = load_shipment(db, shipment_id)
    db.execute(delete(ShipmentTag).where(ShipmentTag.shipment_id == s.id))
    for name in dict.fromkeys(n.strip() for n in body.tags if n.strip()):
        t = _get_or_create_tag(db, name)
        db.add(ShipmentTag(shipment_id=s.id, tag_id=t.id))
    db.commit()
    return shipment_detail(db, load_shipment(db, shipment_id))
