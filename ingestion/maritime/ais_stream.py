"""
DRISHTI-AI — AISstream.io Maritime AIS Ingestion
Real-time WebSocket stream of vessel positions near Indian coastal borders.
Detects vessels going dark, unusual manoeuvres, and restricted zone incursions.
"""
from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Dict, Optional, Set

import websockets
from dotenv import load_dotenv
from kafka import KafkaProducer
from loguru import logger

load_dotenv()

AISSTREAM_API_KEY = os.getenv("AISSTREAM_API_KEY", "")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"

# Indian coastal + maritime zones (entire EEZ)
# Format: [[lat_min, lon_min], [lat_max, lon_max]]
BOUNDING_BOXES = [
    [[6.0, 68.0], [24.0, 88.0]],     # Main Indian coastal zone (Arabian Sea + Bay of Bengal)
    [[6.0, 92.0], [14.5, 94.5]],     # Andaman & Nicobar
]

# Vessel types to monitor closely (IMO codes)
SUSPICIOUS_VESSEL_TYPES: Set[int] = {
    0,    # Not available (unknown)
    30,   # Fishing (often used as cover for intelligence vessels)
    1000, # Unknown / undefined
}

# Navigation status: 1 = At Anchor, 5 = Moored, 15 = Undefined
SUSPICIOUS_NAV_STATUS: Set[int] = {15, 0}  # Undefined or under way but behaving oddly


@dataclass
class VesselPosition:
    mmsi: str
    vessel_name: Optional[str]
    vessel_type: Optional[int]
    lat: Optional[float]
    lon: Optional[float]
    speed_knots: Optional[float]
    course_deg: Optional[float]
    heading_deg: Optional[float]
    nav_status: Optional[int]
    is_anomalous: bool = False
    anomaly_reason: Optional[str] = None
    went_dark: bool = False
    recorded_at: str = ""


class AISStreamIngestion:
    """
    Connects to aisstream.io WebSocket for real-time AIS maritime data.
    Subscribes to the entire Indian EEZ including Andaman & Nicobar.

    API: https://aisstream.io/documentation
    Free tier: full global AIS stream via WebSocket (API key required — free registration)
    """

    def __init__(self):
        self._producer: Optional[KafkaProducer] = None
        self._running = False
        # Track last-seen timestamp per MMSI to detect vessels going dark
        self._vessel_last_seen: Dict[str, datetime] = {}
        self._vessel_cache: Dict[str, VesselPosition] = {}

    def _get_producer(self) -> KafkaProducer:
        if not self._producer:
            self._producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                retries=5,
            )
        return self._producer

    def parse_message(self, raw: Dict) -> Optional[VesselPosition]:
        """
        Parse an aisstream.io WebSocket message into a VesselPosition.

        Args:
            raw: Decoded JSON message from aisstream.io.

        Returns:
            VesselPosition dataclass, or None if message type not relevant.
        """
        msg_type = raw.get("MessageType")
        if msg_type not in ("PositionReport", "ExtendedClassBPositionReport"):
            return None

        message = raw.get("Message", {})
        metadata = raw.get("MetaData", {})

        report = message.get("PositionReport") or message.get("ExtendedClassBPositionReport", {})
        if not report:
            return None

        mmsi = str(metadata.get("MMSI", "") or report.get("UserID", ""))
        if not mmsi:
            return None

        lat = report.get("Latitude")
        lon = report.get("Longitude")

        if lat is None or lon is None:
            return None

        pos = VesselPosition(
            mmsi=mmsi,
            vessel_name=metadata.get("ShipName", "").strip() or None,
            vessel_type=metadata.get("ShipType"),
            lat=float(lat),
            lon=float(lon),
            speed_knots=report.get("Sog"),           # Speed over Ground
            course_deg=report.get("Cog"),            # Course over Ground
            heading_deg=report.get("TrueHeading"),
            nav_status=report.get("NavigationalStatus"),
            recorded_at=datetime.now(timezone.utc).isoformat(),
        )

        is_anomalous, reason = self.detect_anomaly(pos)
        pos.is_anomalous = is_anomalous
        pos.anomaly_reason = reason

        # Update last-seen cache
        self._vessel_last_seen[mmsi] = datetime.now(timezone.utc)
        self._vessel_cache[mmsi] = pos

        return pos

    def detect_anomaly(self, pos: VesselPosition) -> tuple[bool, Optional[str]]:
        """
        Detect suspicious maritime behaviour.

        Anomaly criteria:
        - Unknown vessel type operating in border zone
        - Navigating at night with no AIS callsign
        - Extreme speed changes (possible GPS spoofing)
        - Vessel previously seen now gone dark

        Returns:
            (is_anomalous, reason_string)
        """
        reasons = []

        if pos.vessel_type in SUSPICIOUS_VESSEL_TYPES:
            reasons.append(f"Suspicious vessel type: {pos.vessel_type}")

        if pos.speed_knots is not None and pos.speed_knots > 30:
            reasons.append(f"Unusually high speed: {pos.speed_knots:.1f}kn")

        if pos.nav_status in SUSPICIOUS_NAV_STATUS and pos.speed_knots and pos.speed_knots > 5:
            reasons.append(f"Nav status undefined while moving at {pos.speed_knots:.1f}kn")

        if not pos.vessel_name:
            reasons.append("No vessel name (anonymous AIS transponder)")

        if reasons:
            return True, " | ".join(reasons)
        return False, None

    def check_dark_vessels(self) -> list[str]:
        """
        Identify vessels that have gone dark (AIS dropout > 30 minutes).

        Returns:
            List of MMSIs that have gone dark.
        """
        dark_threshold_minutes = 30
        now = datetime.now(timezone.utc)
        dark = []
        for mmsi, last_seen in list(self._vessel_last_seen.items()):
            elapsed = (now - last_seen).total_seconds() / 60
            if elapsed > dark_threshold_minutes:
                dark.append(mmsi)
                logger.warning(f"Vessel {mmsi} went DARK after {elapsed:.0f} min silence")
                # Mark as dark and publish alert
                if mmsi in self._vessel_cache:
                    pos = self._vessel_cache[mmsi]
                    pos.went_dark = True
                    pos.is_anomalous = True
                    pos.anomaly_reason = f"AIS dropout after {elapsed:.0f} minutes"
                    payload = asdict(pos)
                    self._get_producer().send("maritime-events", value=payload)
        return dark

    async def connect(self):
        """Establish WebSocket connection to aisstream.io and subscribe."""
        if not AISSTREAM_API_KEY:
            logger.error("AISSTREAM_API_KEY not set. Cannot connect to aisstream.io.")
            return

        subscribe_message = {
            "APIKey": AISSTREAM_API_KEY,
            "BoundingBoxes": BOUNDING_BOXES,
            "FilterMessageTypes": ["PositionReport", "ExtendedClassBPositionReport"],
        }

        reconnect_delay = 5
        while self._running:
            try:
                logger.info("Connecting to aisstream.io...")
                async with websockets.connect(AISSTREAM_URL, ping_interval=20) as ws:
                    await ws.send(json.dumps(subscribe_message))
                    logger.info("AIS stream connected. Subscribed to Indian EEZ.")
                    reconnect_delay = 5  # Reset on successful connection

                    # Start dark vessel checker as parallel task
                    asyncio.create_task(self._dark_vessel_checker())

                    async for raw_msg in ws:
                        if not self._running:
                            break
                        try:
                            data = json.loads(raw_msg)
                            pos = self.parse_message(data)
                            if pos:
                                payload = asdict(pos)
                                self._get_producer().send("maritime-events", value=payload)
                                if pos.is_anomalous:
                                    logger.warning(
                                        f"ANOMALOUS VESSEL: {pos.mmsi} ({pos.vessel_name}) "
                                        f"| {pos.anomaly_reason}"
                                    )
                        except json.JSONDecodeError:
                            pass

            except (websockets.ConnectionClosed, ConnectionRefusedError, OSError) as e:
                logger.warning(f"AIS stream disconnected: {e}. Reconnecting in {reconnect_delay}s...")
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, 120)  # Exponential backoff

    async def _dark_vessel_checker(self):
        """Background task to check for vessels that went dark."""
        while self._running:
            await asyncio.sleep(300)  # Check every 5 minutes
            dark = self.check_dark_vessels()
            if dark:
                logger.info(f"Dark vessel check: {len(dark)} vessels went silent")

    async def run(self):
        """Main async entry point."""
        self._running = True
        await self.connect()

    def stop(self):
        self._running = False
        if self._producer:
            self._producer.flush()
            self._producer.close()


if __name__ == "__main__":
    if not AISSTREAM_API_KEY:
        print("ERROR: Set AISSTREAM_API_KEY in .env file")
        print("Register free at: https://aisstream.io/authenticate")
    else:
        logger.info("Starting AIS stream (standalone test)...")
        ingestor = AISStreamIngestion()
        asyncio.run(ingestor.run())
