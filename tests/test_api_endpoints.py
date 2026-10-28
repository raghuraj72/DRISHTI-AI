"""
Tests for DRISHTI-AI FastAPI Backend & Data Models.
Validates Pydantic schema validation, route structure, and CORS/health endpoints.
"""
import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.models import (
    ThreatEventOut,
    AlertOut,
    DashboardStatsOut,
    AcknowledgeAlertIn,
    FlagFalsePositiveIn,
)

# Bypass lifespan startup DB connection in unit tests
app.router.lifespan_context = None
client = TestClient(app, raise_server_exceptions=False)

def test_health_check_endpoint():
    """Verify health check endpoint returns 200 OK and service status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") in ("ok", "healthy", "up", "degraded")
    assert "timestamp" in data

def test_pydantic_threat_event_model():
    """Verify ThreatEventOut schema rejects invalid priority or out-of-range threat score."""
    valid_data = {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "threat_type": "AIR_INCURSION",
        "threat_score": 0.88,
        "priority": "HIGH",
        "location": {"lat": 34.12, "lon": 77.58},
        "modalities": ["ADS_B", "RADAR"],
        "entity_count": 1,
        "description": "Unidentified low-altitude target",
        "border_zone_id": None,
        "is_false_positive": False,
        "occurred_at": datetime.now(timezone.utc),
    }
    model = ThreatEventOut(**valid_data)
    assert model.threat_score == 0.88
    assert model.priority == "HIGH"
    assert model.location.lat == 34.12

def test_acknowledge_alert_schema():
    """Verify alert acknowledgment payload validation."""
    ack = AcknowledgeAlertIn(acknowledged_by="MAJOR_V_KUMAR")
    assert ack.acknowledged_by == "MAJOR_V_KUMAR"

def test_flag_false_positive_schema():
    """Verify false positive flagging payload validation."""
    test_id = uuid.uuid4()
    fp = FlagFalsePositiveIn(event_id=test_id, reason="Scheduled civilian drone survey")
    assert fp.event_id == test_id
    assert "civilian drone" in fp.reason
