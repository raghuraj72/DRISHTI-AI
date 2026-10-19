"""backend/routers/reports.py"""
from uuid import UUID
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import SituationReport, SituationReportOut
from main import get_db

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])


@router.get("/{report_id}", response_model=SituationReportOut)
async def get_report(report_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SituationReport).where(SituationReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report
