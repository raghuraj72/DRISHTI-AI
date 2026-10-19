"""
DRISHTI-AI — Backend SQLAlchemy ORM Models + Pydantic Schemas
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from geoalchemy2 import Geometry
from geoalchemy2.shape import to_shape
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import (
    Boolean, Column, DateTime, Float, Integer, String, Text,
    ForeignKey, Enum as SAEnum, ARRAY, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship
import enum


# ── SQLAlchemy Base ──────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Python Enums ────────────────────────────────────────────

class ThreatType(str, enum.Enum):
    INTRUSION = "INTRUSION"
    AIR_INCURSION = "AIR_INCURSION"
    MARITIME = "MARITIME"
    SEISMIC_ANOMALY = "SEISMIC_ANOMALY"
    MULTI_MODAL = "MULTI_MODAL"
    CYBER = "CYBER"
    UNKNOWN = "UNKNOWN"


class PriorityLevel(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class Modality(str, enum.Enum):
    VIDEO = "VIDEO"
    SATELLITE = "SATELLITE"
    ADS_B = "ADS_B"
    AIS = "AIS"
    SEISMIC = "SEISMIC"
    RADAR = "RADAR"
    HUMINT = "HUMINT"


class AlertStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    FALSE_POSITIVE = "FALSE_POSITIVE"


# ── ORM Models ──────────────────────────────────────────────

class BorderZone(Base):
    __tablename__ = "border_zones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    geom = Column(Geometry("POLYGON", srid=4326))
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DetectedEntity(Base):
    __tablename__ = "detected_entities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_modality = Column(SAEnum(Modality, name="modality"), nullable=False)
    entity_class = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    location = Column(Geometry("POINT", srid=4326))
    altitude_m = Column(Float)
    speed_mps = Column(Float)
    heading_deg = Column(Float)
    external_id = Column(String)
    raw_data = Column(JSONB)
    border_zone_id = Column(UUID(as_uuid=True), ForeignKey("border_zones.id"))
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    border_zone = relationship("BorderZone")
    tracks = relationship("Track", back_populates="entity", cascade="all, delete")


class ThreatEvent(Base):
    __tablename__ = "threat_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    threat_type = Column(SAEnum(ThreatType, name="threat_type"), nullable=False)
    threat_score = Column(Float, nullable=False)
    priority = Column(SAEnum(PriorityLevel, name="priority_level"), nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=False)
    modalities = Column(ARRAY(String))
    entity_count = Column(Integer, default=1)
    description = Column(Text)
    border_zone_id = Column(UUID(as_uuid=True), ForeignKey("border_zones.id"))
    raw_context = Column(JSONB)
    is_false_positive = Column(Boolean, default=False)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    border_zone = relationship("BorderZone")
    alerts = relationship("Alert", back_populates="threat_event", cascade="all, delete")


class Track(Base):
    __tablename__ = "tracks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id = Column(UUID(as_uuid=True), ForeignKey("detected_entities.id", ondelete="CASCADE"))
    location = Column(Geometry("POINT", srid=4326), nullable=False)
    altitude_m = Column(Float)
    speed_mps = Column(Float)
    heading_deg = Column(Float)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    entity = relationship("DetectedEntity", back_populates="tracks")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    threat_event_id = Column(UUID(as_uuid=True), ForeignKey("threat_events.id", ondelete="CASCADE"))
    priority = Column(SAEnum(PriorityLevel, name="priority_level"), nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    status = Column(SAEnum(AlertStatus, name="alert_status"), default=AlertStatus.ACTIVE)
    acknowledged_by = Column(String)
    acknowledged_at = Column(DateTime(timezone=True))
    resolved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    threat_event = relationship("ThreatEvent", back_populates="alerts")
    situation_reports = relationship("SituationReport", back_populates="alert")


class SituationReport(Base):
    __tablename__ = "situation_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"))
    priority = Column(SAEnum(PriorityLevel, name="priority_level"), nullable=False)
    content = Column(Text, nullable=False)
    threat_zone = Column(String)
    generated_by = Column(String, default="gemini-1.5-flash")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    alert = relationship("Alert", back_populates="situation_reports")


class SeismicEvent(Base):
    __tablename__ = "seismic_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usgs_id = Column(String, unique=True, nullable=False)
    magnitude = Column(Float, nullable=False)
    magnitude_type = Column(String)
    depth_km = Column(Float)
    location = Column(Geometry("POINT", srid=4326))
    place = Column(Text)
    is_suspicious = Column(Boolean, default=False)
    classification = Column(String)
    border_zone_id = Column(UUID(as_uuid=True), ForeignKey("border_zones.id"))
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    ingested_at = Column(DateTime(timezone=True), server_default=func.now())


class AirTrafficState(Base):
    __tablename__ = "airtraffic_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    icao24 = Column(String, nullable=False)
    callsign = Column(String)
    origin_country = Column(String)
    location = Column(Geometry("POINT", srid=4326))
    altitude_m = Column(Float)
    velocity_mps = Column(Float)
    true_track_deg = Column(Float)
    vertical_rate = Column(Float)
    on_ground = Column(Boolean, default=False)
    is_anomalous = Column(Boolean, default=False)
    anomaly_reason = Column(String)
    border_zone_id = Column(UUID(as_uuid=True), ForeignKey("border_zones.id"))
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())


class MaritimePosition(Base):
    __tablename__ = "maritime_positions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mmsi = Column(String, nullable=False)
    vessel_name = Column(String)
    vessel_type = Column(Integer)
    location = Column(Geometry("POINT", srid=4326))
    speed_knots = Column(Float)
    course_deg = Column(Float)
    heading_deg = Column(Float)
    nav_status = Column(Integer)
    is_anomalous = Column(Boolean, default=False)
    anomaly_reason = Column(String)
    went_dark = Column(Boolean, default=False)
    border_zone_id = Column(UUID(as_uuid=True), ForeignKey("border_zones.id"))
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Pydantic Schemas ─────────────────────────────────────────

class GeoPoint(BaseModel):
    lat: float
    lon: float


class ThreatEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    threat_type: ThreatType
    threat_score: float
    priority: PriorityLevel
    location: GeoPoint
    modalities: List[str]
    entity_count: int
    description: Optional[str]
    border_zone_id: Optional[uuid.UUID]
    is_false_positive: bool
    occurred_at: datetime

    @classmethod
    def from_orm_with_geo(cls, obj: ThreatEvent) -> "ThreatEventOut":
        point = to_shape(obj.location)
        return cls(
            id=obj.id,
            threat_type=obj.threat_type,
            threat_score=obj.threat_score,
            priority=obj.priority,
            location=GeoPoint(lat=point.y, lon=point.x),
            modalities=obj.modalities or [],
            entity_count=obj.entity_count,
            description=obj.description,
            border_zone_id=obj.border_zone_id,
            is_false_positive=obj.is_false_positive,
            occurred_at=obj.occurred_at,
        )


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    priority: PriorityLevel
    title: str
    message: str
    status: AlertStatus
    threat_event_id: Optional[uuid.UUID]
    created_at: datetime


class SituationReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    priority: PriorityLevel
    content: str
    threat_zone: Optional[str]
    generated_by: str
    created_at: datetime


class TrackPointOut(BaseModel):
    lat: float
    lon: float
    altitude_m: Optional[float]
    speed_mps: Optional[float]
    heading_deg: Optional[float]
    recorded_at: datetime


class DashboardStatsOut(BaseModel):
    threats_24h: int
    critical_24h: int
    high_24h: int
    total_intrusions: int
    total_air: int
    total_maritime: int
    total_seismic: int
    total_multimodal: int


class AcknowledgeAlertIn(BaseModel):
    acknowledged_by: str = Field(..., min_length=1, max_length=100)


class FlagFalsePositiveIn(BaseModel):
    event_id: uuid.UUID
    reason: Optional[str] = None
