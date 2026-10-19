-- ============================================================
-- DRISHTI-AI Database Schema
-- PostgreSQL 16 + PostGIS 3.4
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── ENUMS ────────────────────────────────────────────────────

CREATE TYPE threat_type AS ENUM (
    'INTRUSION', 'AIR_INCURSION', 'MARITIME',
    'SEISMIC_ANOMALY', 'MULTI_MODAL', 'CYBER', 'UNKNOWN'
);

CREATE TYPE priority_level AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

CREATE TYPE modality AS ENUM (
    'VIDEO', 'SATELLITE', 'ADS_B', 'AIS', 'SEISMIC', 'RADAR', 'HUMINT'
);

CREATE TYPE alert_status AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');

-- ── BORDER ZONES ─────────────────────────────────────────────

CREATE TABLE border_zones (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    code        TEXT UNIQUE NOT NULL,  -- e.g. 'LAC_LADAKH', 'LOC_KASHMIR'
    geom        GEOMETRY(POLYGON, 4326) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_border_zones_geom ON border_zones USING GIST(geom);

-- Seed border zones
INSERT INTO border_zones (name, code, geom, description) VALUES
(
    'LAC - Ladakh', 'LAC_LADAKH',
    ST_GeomFromText('POLYGON((75.0 32.0, 80.0 32.0, 80.0 36.0, 75.0 36.0, 75.0 32.0))', 4326),
    'Line of Actual Control - Ladakh sector'
),
(
    'LoC - Kashmir', 'LOC_KASHMIR',
    ST_GeomFromText('POLYGON((73.0 32.0, 77.0 32.0, 77.0 37.0, 73.0 37.0, 73.0 32.0))', 4326),
    'Line of Control - Jammu & Kashmir sector'
),
(
    'Rajasthan Border', 'RAJ_BORDER',
    ST_GeomFromText('POLYGON((68.0 23.0, 72.0 23.0, 72.0 29.0, 68.0 29.0, 68.0 23.0))', 4326),
    'India-Pakistan border - Rajasthan sector'
),
(
    'Northeast Border', 'NE_BORDER',
    ST_GeomFromText('POLYGON((88.0 24.0, 97.0 24.0, 97.0 30.0, 88.0 30.0, 88.0 24.0))', 4326),
    'India-China-Myanmar border - Northeast sector'
),
(
    'Gujarat Coast', 'GUJ_COAST',
    ST_GeomFromText('POLYGON((68.0 20.0, 74.0 20.0, 74.0 24.5, 68.0 24.5, 68.0 20.0))', 4326),
    'Arabian Sea - Gujarat coastal zone'
),
(
    'Andaman & Nicobar', 'ANDAMAN',
    ST_GeomFromText('POLYGON((92.0 6.0, 94.5 6.0, 94.5 14.0, 92.0 14.0, 92.0 6.0))', 4326),
    'Andaman & Nicobar Islands EEZ'
);

-- ── DETECTED ENTITIES ────────────────────────────────────────

CREATE TABLE detected_entities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_modality modality NOT NULL,
    entity_class    TEXT NOT NULL,          -- 'person', 'vehicle', 'aircraft', 'vessel'
    confidence      FLOAT NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    location        GEOMETRY(POINT, 4326),
    altitude_m      FLOAT,                  -- for aircraft
    speed_mps       FLOAT,                  -- metres per second
    heading_deg     FLOAT,                  -- 0-360
    external_id     TEXT,                   -- ICAO24, MMSI, etc.
    raw_data        JSONB,                  -- full original payload
    border_zone_id  UUID REFERENCES border_zones(id),
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_location ON detected_entities USING GIST(location);
CREATE INDEX idx_entities_detected_at ON detected_entities (detected_at DESC);
CREATE INDEX idx_entities_modality ON detected_entities (source_modality);
CREATE INDEX idx_entities_zone ON detected_entities (border_zone_id);

-- ── THREAT EVENTS ────────────────────────────────────────────

CREATE TABLE threat_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    threat_type     threat_type NOT NULL,
    threat_score    FLOAT NOT NULL CHECK (threat_score BETWEEN 0 AND 1),
    priority        priority_level NOT NULL,
    location        GEOMETRY(POINT, 4326) NOT NULL,
    modalities      TEXT[] NOT NULL,
    entity_count    INT DEFAULT 1,
    description     TEXT,
    border_zone_id  UUID REFERENCES border_zones(id),
    raw_context     JSONB,
    is_false_positive BOOLEAN DEFAULT FALSE,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_threats_location ON threat_events USING GIST(location);
CREATE INDEX idx_threats_occurred_at ON threat_events (occurred_at DESC);
CREATE INDEX idx_threats_priority ON threat_events (priority);
CREATE INDEX idx_threats_score ON threat_events (threat_score DESC);
CREATE INDEX idx_threats_zone ON threat_events (border_zone_id);

-- ── ENTITY TRACKS ────────────────────────────────────────────

CREATE TABLE tracks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id       UUID REFERENCES detected_entities(id) ON DELETE CASCADE,
    location        GEOMETRY(POINT, 4326) NOT NULL,
    altitude_m      FLOAT,
    speed_mps       FLOAT,
    heading_deg     FLOAT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracks_entity ON tracks (entity_id);
CREATE INDEX idx_tracks_location ON tracks USING GIST(location);
CREATE INDEX idx_tracks_recorded_at ON tracks (recorded_at DESC);

-- ── ALERTS ───────────────────────────────────────────────────

CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    threat_event_id UUID REFERENCES threat_events(id) ON DELETE CASCADE,
    priority        priority_level NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    status          alert_status DEFAULT 'ACTIVE',
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_status ON alerts (status);
CREATE INDEX idx_alerts_priority ON alerts (priority);
CREATE INDEX idx_alerts_created_at ON alerts (created_at DESC);

-- ── SITUATION REPORTS ────────────────────────────────────────

CREATE TABLE situation_reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id        UUID REFERENCES alerts(id),
    priority        priority_level NOT NULL,
    content         TEXT NOT NULL,  -- Markdown from Gemini
    threat_zone     TEXT,
    generated_by    TEXT DEFAULT 'gemini-1.5-flash',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_created_at ON situation_reports (created_at DESC);

-- ── SEISMIC EVENTS ───────────────────────────────────────────

CREATE TABLE seismic_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usgs_id         TEXT UNIQUE NOT NULL,
    magnitude       FLOAT NOT NULL,
    magnitude_type  TEXT,
    depth_km        FLOAT,
    location        GEOMETRY(POINT, 4326) NOT NULL,
    place           TEXT,
    is_suspicious   BOOLEAN DEFAULT FALSE,
    classification  TEXT,   -- 'natural', 'suspicious', 'unknown'
    border_zone_id  UUID REFERENCES border_zones(id),
    occurred_at     TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seismic_location ON seismic_events USING GIST(location);
CREATE INDEX idx_seismic_occurred_at ON seismic_events (occurred_at DESC);
CREATE INDEX idx_seismic_suspicious ON seismic_events (is_suspicious);

-- ── AIR TRAFFIC STATES ───────────────────────────────────────

CREATE TABLE airtraffic_states (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    icao24          TEXT NOT NULL,
    callsign        TEXT,
    origin_country  TEXT,
    location        GEOMETRY(POINT, 4326),
    altitude_m      FLOAT,
    velocity_mps    FLOAT,
    true_track_deg  FLOAT,
    vertical_rate   FLOAT,
    on_ground       BOOLEAN DEFAULT FALSE,
    is_anomalous    BOOLEAN DEFAULT FALSE,
    anomaly_reason  TEXT,
    border_zone_id  UUID REFERENCES border_zones(id),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_airtraffic_location ON airtraffic_states USING GIST(location);
CREATE INDEX idx_airtraffic_recorded_at ON airtraffic_states (recorded_at DESC);
CREATE INDEX idx_airtraffic_icao24 ON airtraffic_states (icao24);
CREATE INDEX idx_airtraffic_anomalous ON airtraffic_states (is_anomalous) WHERE is_anomalous = TRUE;

-- ── MARITIME POSITIONS ───────────────────────────────────────

CREATE TABLE maritime_positions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mmsi            TEXT NOT NULL,
    vessel_name     TEXT,
    vessel_type     INT,
    location        GEOMETRY(POINT, 4326),
    speed_knots     FLOAT,
    course_deg      FLOAT,
    heading_deg     FLOAT,
    nav_status      INT,
    is_anomalous    BOOLEAN DEFAULT FALSE,
    anomaly_reason  TEXT,
    went_dark       BOOLEAN DEFAULT FALSE,
    border_zone_id  UUID REFERENCES border_zones(id),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maritime_location ON maritime_positions USING GIST(location);
CREATE INDEX idx_maritime_recorded_at ON maritime_positions (recorded_at DESC);
CREATE INDEX idx_maritime_mmsi ON maritime_positions (mmsi);
CREATE INDEX idx_maritime_anomalous ON maritime_positions (is_anomalous) WHERE is_anomalous = TRUE;

-- ── AUTO-ALERTS ──────────────────────────────────────────────
-- Managed by backend/alert_engine.py with AI situation reports

-- ── VIEWS ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW active_alerts_view AS
SELECT
    a.id,
    a.priority,
    a.title,
    a.message,
    a.status,
    a.created_at,
    te.threat_type,
    te.threat_score,
    te.modalities,
    ST_Y(te.location) AS lat,
    ST_X(te.location) AS lon,
    bz.name AS zone_name,
    bz.code AS zone_code
FROM alerts a
JOIN threat_events te ON a.threat_event_id = te.id
LEFT JOIN border_zones bz ON te.border_zone_id = bz.id
WHERE a.status = 'ACTIVE'
ORDER BY a.priority DESC, a.created_at DESC;

CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '24 hours') AS threats_24h,
    COUNT(*) FILTER (WHERE priority = 'CRITICAL' AND occurred_at > NOW() - INTERVAL '24 hours') AS critical_24h,
    COUNT(*) FILTER (WHERE priority = 'HIGH' AND occurred_at > NOW() - INTERVAL '24 hours') AS high_24h,
    COUNT(*) FILTER (WHERE threat_type = 'INTRUSION') AS total_intrusions,
    COUNT(*) FILTER (WHERE threat_type = 'AIR_INCURSION') AS total_air,
    COUNT(*) FILTER (WHERE threat_type = 'MARITIME') AS total_maritime,
    COUNT(*) FILTER (WHERE threat_type = 'SEISMIC_ANOMALY') AS total_seismic,
    COUNT(*) FILTER (WHERE threat_type = 'MULTI_MODAL') AS total_multimodal
FROM threat_events
WHERE is_false_positive = FALSE;
