"""
DRISHTI-AI — Kafka Consumer
Async multi-topic consumer that persists events to PostGIS and broadcasts to WebSocket clients.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, Optional

from aiokafka import AIOKafkaConsumer
from dotenv import load_dotenv
from geoalchemy2 import WKTElement
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models import (
    ThreatEvent, SeismicEvent, AirTrafficState, MaritimePosition,
    DetectedEntity, ThreatType, PriorityLevel, Modality,
)

load_dotenv()

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "drishti-consumer-group")

TOPICS = [
    "airtraffic-events",
    "maritime-events",
    "seismic-events",
    "satellite-alerts",
    "video-detections",
    "threat-events",
]


def _score_to_priority(score: float) -> PriorityLevel:
    if score >= 0.9:
        return PriorityLevel.CRITICAL
    elif score >= 0.7:
        return PriorityLevel.HIGH
    elif score >= 0.5:
        return PriorityLevel.MEDIUM
    return PriorityLevel.LOW


def _make_point(lon: float, lat: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


class KafkaEventConsumer:
    """
    Async Kafka consumer subscribing to all DRISHTI-AI topics.
    Persists each message to the appropriate PostgreSQL table
    and broadcasts to connected WebSocket clients.
    """

    def __init__(self, db_session_factory: async_sessionmaker, ws_manager, alert_engine):
        self._db_factory = db_session_factory
        self._ws = ws_manager
        self._alert_engine = alert_engine
        self._consumer: Optional[AIOKafkaConsumer] = None
        self._running = False

    async def start(self):
        """Start consuming messages from all topics."""
        self._consumer = AIOKafkaConsumer(
            *TOPICS,
            bootstrap_servers=KAFKA_BOOTSTRAP,
            group_id=KAFKA_GROUP_ID,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="latest",
            enable_auto_commit=True,
        )
        await self._consumer.start()
        self._running = True
        logger.info(f"Kafka consumer started. Subscribed to: {TOPICS}")

        try:
            async for msg in self._consumer:
                if not self._running:
                    break
                await self.process_message(msg.topic, msg.value)
        except Exception as e:
            logger.error(f"Kafka consumer error: {e}")
        finally:
            await self._consumer.stop()

    async def stop(self):
        """Gracefully stop the consumer."""
        self._running = False
        if self._consumer:
            await self._consumer.stop()
        logger.info("Kafka consumer stopped.")

    async def process_message(self, topic: str, payload: Dict[str, Any]):
        """Route incoming message to the correct handler based on topic."""
        try:
            async with self._db_factory() as db:
                if topic == "threat-events":
                    await self._handle_threat_event(db, payload)
                elif topic == "seismic-events":
                    await self._handle_seismic(db, payload)
                elif topic == "airtraffic-events":
                    await self._handle_airtraffic(db, payload)
                elif topic == "maritime-events":
                    await self._handle_maritime(db, payload)
                elif topic in ("satellite-alerts", "video-detections"):
                    await self._handle_detection(db, payload, topic)
                await db.commit()

            # Broadcast to dashboard
            await self._ws.broadcast({"type": topic.upper().replace("-", "_"), "payload": payload})

        except Exception as e:
            logger.error(f"Error processing message from {topic}: {e}")

    async def _handle_threat_event(self, db: AsyncSession, data: Dict):
        score = float(data.get("threat_score", 0.0))
        lon = float(data["location"]["lon"])
        lat = float(data["location"]["lat"])
        event = ThreatEvent(
            threat_type=data.get("threat_type", "UNKNOWN"),
            threat_score=score,
            priority=_score_to_priority(score),
            location=_make_point(lon, lat),
            modalities=data.get("modalities", []),
            entity_count=int(data.get("entity_count", 1)),
            description=data.get("description"),
            raw_context=data,
        )
        db.add(event)
        await db.flush()
        # Trigger alert engine evaluation
        await self._alert_engine.evaluate_threat(db, event)
        logger.info(f"Persisted threat event: {event.threat_type} score={score:.2f}")

    async def _handle_seismic(self, db: AsyncSession, data: Dict):
        # Avoid duplicates using USGS ID
        from sqlalchemy import select
        usgs_id = data.get("usgs_id", "")
        existing = await db.execute(
            select(SeismicEvent).where(SeismicEvent.usgs_id == usgs_id)
        )
        if existing.scalar_one_or_none():
            return

        coords = data.get("coordinates", {})
        event = SeismicEvent(
            usgs_id=usgs_id,
            magnitude=float(data.get("magnitude", 0)),
            magnitude_type=data.get("magnitude_type"),
            depth_km=float(coords.get("depth", 0)),
            location=_make_point(float(coords.get("lon", 0)), float(coords.get("lat", 0))),
            place=data.get("place"),
            is_suspicious=bool(data.get("is_suspicious", False)),
            classification=data.get("classification", "unknown"),
            occurred_at=datetime.fromisoformat(data.get("time", datetime.utcnow().isoformat())),
        )
        db.add(event)
        logger.debug(f"Persisted seismic event: M{event.magnitude} at {event.place}")
        if event.is_suspicious:
            threat = ThreatEvent(
                threat_type=ThreatType.SEISMIC_ANOMALY,
                threat_score=0.75,
                priority=PriorityLevel.HIGH,
                location=event.location,
                modalities=["SEISMIC"],
                entity_count=1,
                description=f"Suspicious seismic activity: M{event.magnitude} at {event.place}. Classification: {event.classification}",
                raw_context=data,
            )
            db.add(threat)
            await db.flush()
            await self._alert_engine.evaluate_threat(db, threat)

    async def _handle_airtraffic(self, db: AsyncSession, data: Dict):
        lon = float(data.get("lon", 0))
        lat = float(data.get("lat", 0))
        loc = _make_point(lon, lat)
        is_anom = bool(data.get("is_anomalous", False))
        state = AirTrafficState(
            icao24=data.get("icao24", ""),
            callsign=data.get("callsign"),
            origin_country=data.get("origin_country"),
            location=loc,
            altitude_m=data.get("altitude_m"),
            velocity_mps=data.get("velocity_mps"),
            true_track_deg=data.get("true_track_deg"),
            vertical_rate=data.get("vertical_rate"),
            on_ground=bool(data.get("on_ground", False)),
            is_anomalous=is_anom,
            anomaly_reason=data.get("anomaly_reason"),
        )
        db.add(state)
        if is_anom:
            threat = ThreatEvent(
                threat_type=ThreatType.AIR_INCURSION,
                threat_score=0.85,
                priority=PriorityLevel.HIGH,
                location=loc,
                modalities=["ADS_B"],
                entity_count=1,
                description=f"Anomalous aircraft {state.callsign or state.icao24} ({state.origin_country}): {state.anomaly_reason}",
                raw_context=data,
            )
            db.add(threat)
            await db.flush()
            await self._alert_engine.evaluate_threat(db, threat)

    async def _handle_maritime(self, db: AsyncSession, data: Dict):
        lon = float(data.get("lon", 0))
        lat = float(data.get("lat", 0))
        loc = _make_point(lon, lat)
        is_anom = bool(data.get("is_anomalous", False))
        went_dark = bool(data.get("went_dark", False))
        pos = MaritimePosition(
            mmsi=str(data.get("mmsi", "")),
            vessel_name=data.get("vessel_name"),
            vessel_type=data.get("vessel_type"),
            location=loc,
            speed_knots=data.get("speed_knots"),
            course_deg=data.get("course_deg"),
            heading_deg=data.get("heading_deg"),
            nav_status=data.get("nav_status"),
            is_anomalous=is_anom,
            anomaly_reason=data.get("anomaly_reason"),
            went_dark=went_dark,
        )
        db.add(pos)
        if is_anom or went_dark:
            threat = ThreatEvent(
                threat_type=ThreatType.MARITIME,
                threat_score=0.80,
                priority=PriorityLevel.HIGH,
                location=loc,
                modalities=["AIS"],
                entity_count=1,
                description=f"Maritime anomaly vessel {pos.vessel_name or pos.mmsi}: {pos.anomaly_reason or 'Went dark'}",
                raw_context=data,
            )
            db.add(threat)
            await db.flush()
            await self._alert_engine.evaluate_threat(db, threat)

    async def _handle_detection(self, db: AsyncSession, data: Dict, topic: str):
        modality = Modality.SATELLITE if topic == "satellite-alerts" else Modality.VIDEO
        entity = DetectedEntity(
            source_modality=modality,
            entity_class=data.get("entity_class", "unknown"),
            confidence=float(data.get("confidence", 0.0)),
            location=_make_point(
                float(data.get("lon", 0)), float(data.get("lat", 0))
            ),
            external_id=data.get("external_id"),
            raw_data=data,
        )
        db.add(entity)
