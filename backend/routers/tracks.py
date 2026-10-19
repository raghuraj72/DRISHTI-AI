"""backend/routers/tracks.py"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import DetectedEntity, Track
from main import get_db

router = APIRouter(prefix="/api/v1/tracks", tags=["Tracks"])


@router.get("/entities")
async def list_entities(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DetectedEntity).order_by(DetectedEntity.detected_at.desc()).limit(200))
    entities = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "source_modality": e.source_modality.value,
            "entity_class": e.entity_class,
            "confidence": e.confidence,
            "external_id": e.external_id,
            "detected_at": e.detected_at.isoformat() if e.detected_at else None,
        }
        for e in entities
    ]
