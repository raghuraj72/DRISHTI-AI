"""
DRISHTI-AI — FastAPI Backend
Real-time border threat intelligence API with WebSocket live feed
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional

import asyncpg
from dotenv import load_dotenv
from fastapi import (
    FastAPI, Request, WebSocket, WebSocketDisconnect,
    HTTPException, Depends, Query, status
)
from fastapi.middleware.cors import CORSMiddleware
from geoalchemy2.functions import ST_DWithin, ST_GeomFromText, ST_MakeEnvelope
from loguru import logger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from models import (
    Base, ThreatEvent, Alert, SituationReport, Track, DetectedEntity,
    SeismicEvent, AirTrafficState, MaritimePosition, BorderZone,
    ThreatEventOut, AlertOut, SituationReportOut, TrackPointOut,
    DashboardStatsOut, AcknowledgeAlertIn, FlagFalsePositiveIn,
    PriorityLevel, AlertStatus
)
from kafka_consumer import KafkaEventConsumer
from alert_engine import AlertEngine

from pydantic import BaseModel

try:
    from google import genai
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False

load_dotenv()

# ── Config ───────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
_copilot_client = genai.Client(api_key=GEMINI_API_KEY) if (_GENAI_AVAILABLE and GEMINI_API_KEY) else None

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://drishti:drishti_secure_pass_change_me@localhost:5432/drishti_db"
)

# ── Database ─────────────────────────────────────────────────

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


# ── WebSocket Connection Manager ─────────────────────────────

class ConnectionManager:
    """Manages all active WebSocket connections for live dashboard feed."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast JSON message to all connected dashboard clients."""
        data = json.dumps(message, default=str)
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                dead.append(connection)
        for conn in dead:
            self.disconnect(conn)


manager = ConnectionManager()

# ── Rate Limiter ─────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

# ── Lifespan ─────────────────────────────────────────────────

kafka_consumer: Optional[KafkaEventConsumer] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Starting DRISHTI-AI backend...")

    # Create tables if not exists (in prod, use Alembic migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Start Kafka consumer
    global kafka_consumer
    kafka_consumer = KafkaEventConsumer(
        db_session_factory=AsyncSessionLocal,
        ws_manager=manager,
        alert_engine=AlertEngine(db_session_factory=AsyncSessionLocal, ws_manager=manager),
    )
    asyncio.create_task(kafka_consumer.start())
    logger.info("Kafka consumer started.")

    yield

    # Shutdown
    if kafka_consumer:
        await kafka_consumer.stop()
    await engine.dispose()
    logger.info("DRISHTI-AI backend shut down cleanly.")


# ── App ──────────────────────────────────────────────────────

app = FastAPI(
    title="DRISHTI-AI API",
    description="Multi-Modal Border Threat Intelligence System — RYIC 2026",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ───────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check(db: AsyncSession = Depends(get_db)):
    """Returns service health and DB connectivity status."""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
        "ws_connections": len(manager.active_connections),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── WebSocket Live Feed ───────────────────────────────────────

@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """Real-time stream of threat events, alerts, and situation reports."""
    await manager.connect(websocket)
    try:
        # Send initial ping
        await websocket.send_json({"type": "CONNECTED", "payload": {"message": "DRISHTI-AI live feed active"}})
        while True:
            # Keep alive — wait for client ping
            await asyncio.sleep(30)
            await websocket.send_json({"type": "PING", "payload": {}})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Threat Events ────────────────────────────────────────────

@app.get("/api/v1/events", response_model=List[ThreatEventOut], tags=["Threats"])
@limiter.limit("60/minute")
async def list_events(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    priority: Optional[str] = Query(None, description="Filter by priority: CRITICAL/HIGH/MEDIUM/LOW"),
    threat_type: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=168, description="Events from last N hours"),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    radius_km: Optional[float] = Query(None, description="Filter within radius_km of lat/lon"),
    db: AsyncSession = Depends(get_db),
):
    """List threat events with optional spatial and temporal filters."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    stmt = select(ThreatEvent).where(
        ThreatEvent.occurred_at >= cutoff,
        ThreatEvent.is_false_positive == False,
    )

    if priority:
        stmt = stmt.where(ThreatEvent.priority == priority)
    if threat_type:
        stmt = stmt.where(ThreatEvent.threat_type == threat_type)
    if lat is not None and lon is not None and radius_km is not None:
        point_wkt = f"POINT({lon} {lat})"
        stmt = stmt.where(
            ST_DWithin(
                ThreatEvent.location,
                ST_GeomFromText(point_wkt, 4326),
                radius_km * 1000,  # metres
            )
        )

    stmt = stmt.order_by(ThreatEvent.occurred_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    events = result.scalars().all()
    return [ThreatEventOut.from_orm_with_geo(e) for e in events]


@app.patch("/api/v1/events/{event_id}/flag", tags=["Threats"])
async def flag_false_positive(
    event_id: uuid.UUID,
    body: FlagFalsePositiveIn,
    db: AsyncSession = Depends(get_db),
):
    """Mark a threat event as a false positive."""
    result = await db.execute(select(ThreatEvent).where(ThreatEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.is_false_positive = True
    await db.commit()
    return {"status": "flagged", "event_id": str(event_id)}


# ── Alerts ───────────────────────────────────────────────────

@app.get("/api/v1/alerts", response_model=List[AlertOut], tags=["Alerts"])
@limiter.limit("60/minute")
async def list_alerts(
    request: Request,
    status_filter: Optional[str] = Query("ACTIVE", alias="status"),
    priority: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List alerts filtered by status and/or priority."""
    stmt = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if status_filter:
        stmt = stmt.where(Alert.status == status_filter)
    if priority:
        stmt = stmt.where(Alert.priority == priority)
    result = await db.execute(stmt)
    return result.scalars().all()


@app.patch("/api/v1/alerts/{alert_id}/acknowledge", tags=["Alerts"])
async def acknowledge_alert(
    alert_id: uuid.UUID,
    body: AcknowledgeAlertIn,
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge an active alert."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status != AlertStatus.ACTIVE:
        raise HTTPException(status_code=400, detail=f"Alert is already {alert.status.value}")
    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_by = body.acknowledged_by
    alert.acknowledged_at = datetime.utcnow()
    await db.commit()
    # Broadcast update
    await manager.broadcast({"type": "ALERT_ACKNOWLEDGED", "payload": {"alert_id": str(alert_id)}})
    return {"status": "acknowledged", "alert_id": str(alert_id)}


# ── Tracks ───────────────────────────────────────────────────

@app.get("/api/v1/tracks/{entity_id}", response_model=List[TrackPointOut], tags=["Tracks"])
async def get_track(
    entity_id: uuid.UUID,
    hours: int = Query(6, ge=1, le=48),
    db: AsyncSession = Depends(get_db),
):
    """Get trajectory track points for a detected entity."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(Track)
        .where(Track.entity_id == entity_id, Track.recorded_at >= cutoff)
        .order_by(Track.recorded_at.asc())
    )
    tracks = result.scalars().all()
    from geoalchemy2.shape import to_shape
    return [
        TrackPointOut(
            lat=to_shape(t.location).y,
            lon=to_shape(t.location).x,
            altitude_m=t.altitude_m,
            speed_mps=t.speed_mps,
            heading_deg=t.heading_deg,
            recorded_at=t.recorded_at,
        )
        for t in tracks
    ]


# ── Situation Reports ─────────────────────────────────────────

@app.get("/api/v1/reports", response_model=List[SituationReportOut], tags=["Reports"])
async def list_reports(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List the latest AI-generated situation reports."""
    result = await db.execute(
        select(SituationReport).order_by(SituationReport.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


@app.post("/api/v1/reports/generate", tags=["Reports"])
async def generate_report(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a Gemini situation report for an alert."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    engine = AlertEngine(db_session_factory=AsyncSessionLocal, ws_manager=manager)
    report = await engine.generate_situation_report(db, alert)
    return {"report_id": str(report.id), "content": report.content}


# ── Dashboard Stats ───────────────────────────────────────────

@app.get("/api/v1/stats", response_model=DashboardStatsOut, tags=["Dashboard"])
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Aggregated dashboard statistics."""
    result = await db.execute(text("SELECT * FROM dashboard_stats"))
    row = result.mappings().first()
    if not row:
        return DashboardStatsOut(
            threats_24h=0, critical_24h=0, high_24h=0,
            total_intrusions=0, total_air=0, total_maritime=0,
            total_seismic=0, total_multimodal=0,
        )
    return DashboardStatsOut(**dict(row))


@app.get("/api/v1/stats/timeline", tags=["Dashboard"])
async def get_timeline(
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Threat event counts bucketed by hour for timeline chart."""
    result = await db.execute(text("""
        SELECT
            date_trunc('hour', occurred_at) AS hour,
            threat_type,
            COUNT(*) AS count
        FROM threat_events
        WHERE occurred_at > NOW() - (:hours * INTERVAL '1 hour')
          AND is_false_positive = FALSE
        GROUP BY 1, 2
        ORDER BY 1 ASC
    """).bindparams(hours=hours))
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@app.get("/api/v1/zones", tags=["Dashboard"])
async def list_zones(db: AsyncSession = Depends(get_db)):
    """List all border zones with metadata."""
    result = await db.execute(select(BorderZone.id, BorderZone.name, BorderZone.code, BorderZone.description))
    return [dict(r._mapping) for r in result.all()]


# ── AI Strategic Copilot & Simulation ─────────────────────────

class CopilotChatIn(BaseModel):
    message: str
    history: Optional[List[dict]] = None


class CopilotChatOut(BaseModel):
    reply: str
    suggested_actions: List[str]
    timestamp: str


class SimulateScenarioIn(BaseModel):
    scenario: str


@app.post("/api/v1/copilot/chat", response_model=CopilotChatOut, tags=["AI Copilot"])
async def copilot_chat(body: CopilotChatIn, db: AsyncSession = Depends(get_db)):
    """
    Drishti Tactical Copilot — interactive commander AI advisor powered by Gemini 3.8 Flash.
    Answers natural-language queries with live situational telemetry.
    """
    alerts_res = await db.execute(
        select(Alert).where(Alert.status == AlertStatus.ACTIVE).order_by(Alert.priority.desc()).limit(5)
    )
    alerts = alerts_res.scalars().all()

    threats_res = await db.execute(
        select(ThreatEvent).where(ThreatEvent.is_false_positive == False).order_by(ThreatEvent.occurred_at.desc()).limit(5)
    )
    threats = threats_res.scalars().all()

    stats_res = await db.execute(text("SELECT * FROM dashboard_stats"))
    stats_row = stats_res.mappings().first() or {}

    threat_summary = "\n".join([
        f"- [{t.priority.value if hasattr(t.priority, 'value') else t.priority}] {t.threat_type.value if hasattr(t.threat_type, 'value') else t.threat_type}: {t.description or 'Target detected'} (Score: {t.threat_score:.2f})"
        for t in threats
    ]) or "No active threat incidents reported in current window."

    alert_summary = "\n".join([
        f"- {a.title}: {a.message}" for a in alerts
    ]) or "No active alerts pending acknowledgement."

    prompt = f"""You are 'DRISHTI TACTICAL COPILOT', the AI Strategic & Tactical Advisor inside the Indian Border Surveillance Command Center (RYIC 2026).
You assist military commanders and intelligence officers with real-time operational decisions across all Indian frontiers (LAC Ladakh, LoC Kashmir, Rajasthan Desert, Northeast/Tawang, and Coastal EEZ).

LIVE TELEMETRY FROM COMMAND DATA ENGINE:
- 24h Total Threat Events: {stats_row.get('threats_24h', 0)}
- Critical Alerts: {stats_row.get('critical_24h', 0)}
- High Priority Alerts: {stats_row.get('high_24h', 0)}
- Active Unacknowledged Alerts: {len(alerts)}
- Recent Key Threats:
{threat_summary}
- Active Alerts Queue:
{alert_summary}

COMMANDER QUERY:
"{body.message}"

INSTRUCTIONS:
1. Provide an authoritative, concise military operational briefing answering the commander's question directly.
2. Reference specific sector geography, sensor modalities (ADS-B, Sentinel-2 satellite, AIS maritime, USGS seismic, radar), and Indian defense forces (IAF, BSF, Indian Army, Indian Navy, Coast Guard).
3. Structure with clean markdown headings and actionable bullet points.
4. Keep the response crisp, decisive, and under 300 words."""

    reply = None
    if _copilot_client:
        try:
            resp = await asyncio.to_thread(
                _copilot_client.models.generate_content,
                model=GEMINI_MODEL,
                contents=prompt,
            )
            reply = resp.text
        except Exception as e:
            logger.warning(f"Copilot Gemini API call failed: {e}")

    if not reply:
        reply = f"""### 🛡️ Operational Assessment — DRISHTI Tactical Advisor
**Current Threat Posture:** Telemetry reflects **{stats_row.get('threats_24h', 0)}** registered threat tracks over the last 24h ({stats_row.get('critical_24h', 0)} Critical, {stats_row.get('high_24h', 0)} High).

**Sector Telemetry Analysis:**
{threat_summary}

**Directives for Query:** *"{body.message}"*
- **Air Defense Posture:** Maintain Level-2 radar intercept readiness across frontier vectors.
- **Sensor Fusion Protocol:** Continue cross-verifying satellite change-detection passes with ground radar telemetry.
- **Force Deployment:** Advise BSF and forward IAF squadrons to preserve heightened alert status."""

    suggested = [
        "Assess current overall border threat posture",
        "Generate sector defense recommendations for Ladakh & Kashmir",
        "Simulate Pangong Tso drone swarm incursion",
        "Export official DEF-INTEL Situation Report (SITREP)",
    ]

    return CopilotChatOut(
        reply=reply,
        suggested_actions=suggested,
        timestamp=datetime.utcnow().isoformat(),
    )


@app.post("/api/v1/simulate/scenario", tags=["Simulation"])
async def simulate_scenario(body: SimulateScenarioIn):
    """
    Trigger a high-impact multi-modal threat scenario for live wargame demonstration.
    Pushes directly into Kafka / consumer pipeline to trigger real-time AI fusion and alerts.
    """
    scenario_map = {
        "ladakh_drone_swarm": {
            "threat_type": "AIR_INCURSION",
            "threat_score": 0.98,
            "priority": "CRITICAL",
            "location": {"lat": 34.2250, "lon": 77.5600},
            "modalities": ["ADS_B", "RADAR", "SATELLITE", "VIDEO"],
            "entity_count": 5,
            "description": "CRITICAL: Swarm of 5 Low-RCS stealth UAVs detected navigating Pangong Tso corridor below 200m AGL. Thermal signature verified by Sentinel-2 pass.",
            "timestamp": datetime.utcnow().isoformat(),
        },
        "sir_creek_maritime": {
            "threat_type": "MARITIME",
            "threat_score": 0.92,
            "priority": "CRITICAL",
            "location": {"lat": 23.6500, "lon": 68.2000},
            "modalities": ["AIS", "RADAR", "SATELLITE"],
            "entity_count": 2,
            "description": "CRITICAL: Fast unflagged assault skiffs approaching Sir Creek tidal zone. AIS transponder disabled 8 NM seaward. Navigational speed 34 knots.",
            "timestamp": datetime.utcnow().isoformat(),
        },
        "loc_tunnel_seismic": {
            "threat_type": "SEISMIC_ANOMALY",
            "threat_score": 0.89,
            "priority": "HIGH",
            "location": {"lat": 33.7800, "lon": 74.3200},
            "modalities": ["SEISMIC", "HUMINT"],
            "entity_count": 1,
            "description": "HIGH ALERT: Micro-seismic burst cluster detected at 8m depth beneath LoC fencing (Poonch sector), characteristic of subterranean rotary drilling.",
            "timestamp": datetime.utcnow().isoformat(),
        },
        "ne_border_incursion": {
            "threat_type": "INTRUSION",
            "threat_score": 0.94,
            "priority": "CRITICAL",
            "location": {"lat": 27.8500, "lon": 92.4000},
            "modalities": ["VIDEO", "SATELLITE", "RADAR"],
            "entity_count": 8,
            "description": "CRITICAL: Group of 8 motorized all-terrain recon vehicles observed crossing boundary marker 42 in Tawang sector under cloud cover.",
            "timestamp": datetime.utcnow().isoformat(),
        },
    }

    event = scenario_map.get(body.scenario)
    if not event:
        raise HTTPException(status_code=400, detail=f"Unknown scenario '{body.scenario}'. Available: {list(scenario_map.keys())}")

    if kafka_consumer:
        await kafka_consumer.process_message("threat-events", event)
        return {"status": "simulated", "scenario": body.scenario, "event": event}
    else:
        raise HTTPException(status_code=503, detail="Kafka consumer pipeline not active")
