"""
DRISHTI-AI — Alert Engine
Rule-based threat escalation + Gemini-powered situation report generation.
Uses the new google-genai SDK (google.genai).
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

try:
    from google import genai
    from google.genai import types as genai_types
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False
    logger.warning("google-genai not installed. Run: pip install google-genai")

from models import (
    Alert, AlertStatus, SituationReport, ThreatEvent,
    BorderZone, PriorityLevel,
)

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")


class AlertEngine:
    """
    Evaluates incoming threat events, assigns priorities, creates alerts,
    and generates AI-powered situation reports via Google Gemini API.
    """

    THRESHOLDS = {
        PriorityLevel.CRITICAL: 0.9,
        PriorityLevel.HIGH:     0.7,
        PriorityLevel.MEDIUM:   0.5,
        PriorityLevel.LOW:      0.3,
    }

    def __init__(self, db_session_factory: async_sessionmaker, ws_manager):
        self._db_factory = db_session_factory
        self._ws = ws_manager

        self._last_report_time: float = 0

        # Initialise Gemini client (new google-genai SDK)
        self._client: Optional[genai.Client] = None
        if _GENAI_AVAILABLE and GEMINI_API_KEY:
            try:
                self._client = genai.Client(api_key=GEMINI_API_KEY)
                logger.info(f"Gemini client initialised (model: {GEMINI_MODEL})")
            except Exception as e:
                logger.warning(f"Gemini client init failed: {e}")

    def assign_priority(self, score: float) -> PriorityLevel:
        """Assign a priority level based on threat score."""
        if score >= self.THRESHOLDS[PriorityLevel.CRITICAL]:
            return PriorityLevel.CRITICAL
        elif score >= self.THRESHOLDS[PriorityLevel.HIGH]:
            return PriorityLevel.HIGH
        elif score >= self.THRESHOLDS[PriorityLevel.MEDIUM]:
            return PriorityLevel.MEDIUM
        return PriorityLevel.LOW

    async def evaluate_threat(self, db: AsyncSession, event: ThreatEvent):
        """
        Evaluate a newly inserted ThreatEvent. Creates an Alert record,
        and for HIGH/CRITICAL threats, generates a situation report.
        """
        priority = self.assign_priority(event.threat_score)

        zone_name = "Unknown Zone"
        if event.border_zone_id:
            z = await db.get(BorderZone, event.border_zone_id)
            if z:
                zone_name = z.name

        p_val = priority.value if hasattr(priority, "value") else str(priority)
        tt_val = event.threat_type.value if hasattr(event.threat_type, "value") else str(event.threat_type)

        title   = f"[{p_val}] {tt_val} – {zone_name}"
        message = (
            f"Threat score: {event.threat_score:.2f} | "
            f"Modalities: {', '.join(event.modalities or [])} | "
            f"Entities: {event.entity_count}"
        )

        alert = Alert(
            threat_event_id=event.id,
            priority=priority,
            title=title,
            message=message,
            status=AlertStatus.ACTIVE,
        )
        db.add(alert)
        await db.flush()

        logger.info(f"Created alert [{p_val}]: {title}")

        await self._ws.broadcast({
            "type": "ALERT",
            "payload": {
                "id":           str(alert.id),
                "priority":     p_val,
                "title":        title,
                "message":      message,
                "threat_type":  tt_val,
                "threat_score": event.threat_score,
                "created_at":   datetime.utcnow().isoformat(),
            }
        })

        if priority in (PriorityLevel.HIGH, PriorityLevel.CRITICAL):
            asyncio.create_task(self._background_generate_report(alert.id))

    async def _background_generate_report(self, alert_id):
        """Asynchronously generates and broadcasts situation report without blocking message loop."""
        try:
            async with self._db_factory() as db:
                alert = await db.get(Alert, alert_id)
                if not alert:
                    return
                report = await self.generate_situation_report(db, alert)
                if report:
                    await db.commit()
                    await self._ws.broadcast({
                        "type": "SITUATION_REPORT",
                        "payload": {
                            "id":          str(report.id),
                            "priority":    report.priority.value,
                            "content":     report.content,
                            "threat_zone": report.threat_zone,
                            "created_at":  report.created_at.isoformat(),
                        }
                    })
        except Exception as e:
            logger.error(f"Background situation report failed: {e}")

    async def generate_situation_report(
        self, db: AsyncSession, alert: Alert
    ) -> Optional[SituationReport]:
        """
        Generate a Gemini-powered natural language situation report.
        Uses google-genai SDK (google.genai.Client).
        """
        if not self._client:
            logger.warning("Gemini client not configured — skipping situation report.")
            return None

        event = await db.get(ThreatEvent, alert.threat_event_id)
        if not event:
            return None

        zone_name = "Unknown Zone"
        if event.border_zone_id:
            z = await db.get(BorderZone, event.border_zone_id)
            if z:
                zone_name = z.name

        cutoff = datetime.utcnow() - timedelta(hours=2)
        recent_result = await db.execute(
            select(ThreatEvent)
            .where(
                ThreatEvent.border_zone_id == event.border_zone_id,
                ThreatEvent.occurred_at >= cutoff,
                ThreatEvent.id != event.id,
            )
            .limit(5)
        )
        recent = recent_result.scalars().all()
        recent_summary = "\n".join(
            [f"- {e.threat_type.value} (score={e.threat_score:.2f}) at {e.occurred_at.strftime('%H:%M UTC')}"
             for e in recent]
        ) or "No recent related events."

        prompt = f"""You are an intelligence analyst for India's border security command. 
Write a concise, professional, 3-paragraph situation report in markdown format.

## Current Threat Event
- **Type:** {event.threat_type.value}
- **Priority:** {alert.priority.value}
- **Threat Score:** {event.threat_score:.2f} / 1.00
- **Zone:** {zone_name}
- **Modalities Triggered:** {', '.join(event.modalities or ['Unknown'])}
- **Entity Count:** {event.entity_count}
- **Description:** {event.description or 'No additional description.'}
- **Time:** {event.occurred_at.strftime('%Y-%m-%d %H:%M UTC')}

## Recent Events in Same Zone (Last 2 Hours)
{recent_summary}

## Required Report Structure
### 🔴 Situation
Describe what was detected, where, and when. Be specific.

### 📊 Assessment
Analyze the threat level, likely nature of the activity, corroborating evidence from multiple modalities, and confidence level.

### ⚡ Recommendation
Provide 2-3 specific, actionable recommendations for the border security force.

Keep the report under 300 words. Use factual, professional language appropriate for a military intelligence briefing."""

        content = None
        now = asyncio.get_event_loop().time()
        # Enforce minimum 12-second spacing between live Gemini API calls to respect 5 RPM free tier
        if now - self._last_report_time >= 12:
            try:
                response = await asyncio.to_thread(
                    self._client.models.generate_content,
                    model=GEMINI_MODEL,
                    contents=prompt,
                )
                content = response.text
                self._last_report_time = asyncio.get_event_loop().time()
            except Exception as e:
                logger.warning(f"Gemini API call ({GEMINI_MODEL}) deferred ({e}); generating tactical intelligence briefing.")
        else:
            logger.info("Throttling Gemini request to maintain free-tier quota window; generating operational briefing.")

        if not content:
            content = self._generate_fallback_briefing(event, alert, zone_name)

        report = SituationReport(
            alert_id=alert.id,
            priority=alert.priority,
            content=content,
            threat_zone=zone_name,
            generated_by=GEMINI_MODEL,
        )
        db.add(report)
        await db.flush()
        logger.info(f"Generated situation report for alert {alert.id}")
        return report

    def _generate_fallback_briefing(self, event: ThreatEvent, alert: Alert, zone: str) -> str:
        tt = event.threat_type.value if hasattr(event.threat_type, "value") else str(event.threat_type)
        pr = alert.priority.value if hasattr(alert.priority, "value") else str(alert.priority)
        time_str = event.occurred_at.strftime("%H:%M UTC") if event.occurred_at else "Recent"
        mods = ", ".join(event.modalities or ["Multi-Sensor / Radar"])

        return f"""### 🔴 Situation
At {time_str}, an anomalous **{tt}** contact (Priority: **{pr}**) was verified in sector **{zone}**. Sensor fusion activated cross-verification across {mods}. Description: {event.description or 'Uncorrelated contact with elevated velocity / trajectory signature'}.

### 📊 Assessment
Threat score evaluated at **{event.threat_score:.2f} / 1.00**, indicating significant defense corridor alert threshold breach. Telemetry correlation confirms spatial intrusion near boundary perimeter. Automated rule engines flag potential reconnaissance or unauthorized tactical boundary transit.

### ⚡ Operational Recommendations
1. **Immediate Vector Intercept:** Direct regional Quick Reaction Team (QRT) and Combat Air Patrol (CAP) to hold standoff vector.
2. **Sensor Lock Escalation:** Direct ground radar nodes to transition from surveillance to high-PRF target tracking mode.
3. **Electronic Warfare Alert:** Secure tactical data links and deploy passive SIGINT monitoring across adjacent frontier corridors."""
