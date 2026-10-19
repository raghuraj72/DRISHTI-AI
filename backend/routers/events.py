"""backend/routers/events.py"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta

from models import ThreatEvent, ThreatEventOut, FlagFalsePositiveIn
from main import get_db
from geoalchemy2.shape import to_shape

router = APIRouter(prefix="/api/v1/events", tags=["Events"])


@router.get("/{event_id}", response_model=ThreatEventOut)
async def get_event(event_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ThreatEvent).where(ThreatEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return ThreatEventOut.from_orm_with_geo(event)


@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ThreatEvent).where(ThreatEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(event)
    await db.commit()
