from fastapi import APIRouter

from app.api import config, health, map, presets, shipments, uploads

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(config.router, tags=["config"])
api_router.include_router(uploads.router, tags=["uploads"])
api_router.include_router(presets.router, tags=["presets"])
api_router.include_router(shipments.router, tags=["shipments"])
api_router.include_router(map.router, tags=["map"])
