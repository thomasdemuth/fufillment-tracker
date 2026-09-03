from fastapi import APIRouter

from app.api import (
    attention,
    config,
    export,
    health,
    map,
    notes_tags,
    presets,
    privacy,
    refresh,
    settings,
    shipments,
    uploads,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(config.router, tags=["config"])
api_router.include_router(uploads.router, tags=["uploads"])
api_router.include_router(presets.router, tags=["presets"])
api_router.include_router(shipments.router, tags=["shipments"])
api_router.include_router(notes_tags.router, tags=["notes-tags"])
api_router.include_router(map.router, tags=["map"])
api_router.include_router(refresh.router, tags=["refresh"])
api_router.include_router(attention.router, tags=["attention"])
api_router.include_router(export.router, tags=["export"])
api_router.include_router(settings.router, tags=["settings"])
api_router.include_router(privacy.router, tags=["privacy"])
