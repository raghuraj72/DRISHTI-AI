"""
DRISHTI-AI — OpenSky Network ADS-B Air Traffic Ingestion
Polls live aircraft state vectors from OpenSky Network REST API
and detects anomalies near Indian border airspace.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from kafka import KafkaProducer
from loguru import logger

load_dotenv()

OPENSKY_USERNAME = os.getenv("OPENSKY_USERNAME", "")
OPENSKY_PASSWORD = os.getenv("OPENSKY_PASSWORD", "")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
POLL_INTERVAL = int(os.getenv("OPENSKY_POLL_INTERVAL", "30"))

OPENSKY_BASE_URL = "https://opensky-network.org/api"

# Bounding boxes for Indian border airspace: (lon_min, lat_min, lon_max, lat_max, zone_name)
WATCH_BOXES: List[Tuple[float, float, float, float, str]] = [
    (68.0, 23.0, 72.0, 28.0, "RAJ_BORDER_AIRSPACE"),     # Rajasthan border
    (75.0, 32.0, 80.0, 36.0, "LAC_LADAKH_AIRSPACE"),      # Ladakh / LAC
    (73.0, 32.0, 77.0, 37.0, "LOC_KASHMIR_AIRSPACE"),     # LoC Kashmir
    (88.0, 24.0, 97.0, 29.0, "NE_BORDER_AIRSPACE"),       # Northeast border
]

# Anomaly detection thresholds
LOW_ALTITUDE_M = 500.0          # Below 500m above ground = suspicious for non-military
SLOW_SPEED_MPS = 20.0           # Very slow = loitering
RESTRICTED_COUNTRIES = {"China", "Pakistan"}


@dataclass
class AircraftState:
    icao24: str
    callsign: Optional[str]
    origin_country: Optional[str]
    lon: Optional[float]
    lat: Optional[float]
    altitude_m: Optional[float]
    velocity_mps: Optional[float]
    true_track_deg: Optional[float]
    vertical_rate: Optional[float]
    on_ground: bool
    recorded_at: str
    zone: str
    is_anomalous: bool = False
    anomaly_reason: Optional[str] = None


class OpenSkyIngestion:
    """
    Polls OpenSky Network REST API for live ADS-B aircraft states
    in Indian border airspace bounding boxes.

    API docs: https://openskynetwork.github.io/opensky-api/rest.html
    Free for research/non-commercial use with OAuth2.
    """

    def __init__(self):
        self._producer: Optional[KafkaProducer] = None
        self._running = False
        self._session = requests.Session()
        if OPENSKY_USERNAME and OPENSKY_PASSWORD:
            self._session.auth = (OPENSKY_USERNAME, OPENSKY_PASSWORD)
            logger.info("OpenSky: authenticated mode (higher rate limits)")
        else:
            logger.warning("OpenSky: anonymous mode (limited to 400 API calls/day)")

    def _get_producer(self) -> KafkaProducer:
        if not self._producer:
            self._producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                retries=5,
            )
        return self._producer

    def poll_states(
        self, lon_min: float, lat_min: float, lon_max: float, lat_max: float, zone: str
    ) -> List[AircraftState]:
        """
        Fetch live aircraft state vectors from OpenSky for a bounding box.

        Args:
            lon_min, lat_min, lon_max, lat_max: Bounding box (WGS84).
            zone: Human-readable zone name for logging.

        Returns:
            List of AircraftState dataclasses.
        """
        url = f"{OPENSKY_BASE_URL}/states/all"
        params = {
            "lamin": lat_min,
            "lomin": lon_min,
            "lamax": lat_max,
            "lomax": lon_max,
        }

        try:
            resp = self._session.get(url, params=params, timeout=15)
            if resp.status_code == 429:
                logger.warning("OpenSky rate limit hit — backing off 60s")
                time.sleep(60)
                return []
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            logger.error(f"OpenSky API error for {zone}: {e}")
            return []

        states_raw = data.get("states", []) or []
        aircraft_list = []

        for s in states_raw:
            # OpenSky state vector fields (by index):
            # 0:icao24, 1:callsign, 2:origin_country, 3:time_position, 4:last_contact,
            # 5:longitude, 6:latitude, 7:baro_altitude, 8:on_ground, 9:velocity,
            # 10:true_track, 11:vertical_rate, ...
            try:
                state = AircraftState(
                    icao24=s[0] or "",
                    callsign=(s[1] or "").strip() or None,
                    origin_country=s[2],
                    lon=s[5],
                    lat=s[6],
                    altitude_m=s[7],
                    velocity_mps=s[9],
                    true_track_deg=s[10],
                    vertical_rate=s[11],
                    on_ground=bool(s[8]),
                    recorded_at=datetime.now(timezone.utc).isoformat(),
                    zone=zone,
                )
                anomalous, reason = self.detect_anomaly(state)
                state.is_anomalous = anomalous
                state.anomaly_reason = reason
                aircraft_list.append(state)
            except (IndexError, TypeError) as e:
                logger.debug(f"Malformed state vector: {e}")
                continue

        return aircraft_list

    def detect_anomaly(self, state: AircraftState) -> Tuple[bool, Optional[str]]:
        """
        Detect anomalous aircraft behaviour near border airspace.

        Anomaly criteria:
        - Aircraft from adversarial countries (China/Pakistan) in border airspace
        - Very low altitude flight (potential UAV/drone)
        - Very slow speed (loitering behaviour)
        - No callsign (transponder manipulation)

        Returns:
            Tuple of (is_anomalous, reason_string).
        """
        reasons = []

        if state.on_ground:
            return False, None

        if state.origin_country in RESTRICTED_COUNTRIES:
            reasons.append(f"Origin country: {state.origin_country}")

        if state.altitude_m is not None and 0 < state.altitude_m < LOW_ALTITUDE_M:
            reasons.append(f"Low altitude: {state.altitude_m:.0f}m")

        if state.velocity_mps is not None and 0 < state.velocity_mps < SLOW_SPEED_MPS:
            reasons.append(f"Low speed: {state.velocity_mps:.1f}m/s (loitering)")

        if not state.callsign:
            reasons.append("No callsign (ADS-B manipulation possible)")

        if reasons:
            return True, " | ".join(reasons)
        return False, None

    def run_loop(self):
        """Blocking polling loop across all watch boxes."""
        self._running = True
        logger.info(f"OpenSky ADS-B polling started. Interval: {POLL_INTERVAL}s")

        while self._running:
            for (lon_min, lat_min, lon_max, lat_max, zone) in WATCH_BOXES:
                states = self.poll_states(lon_min, lat_min, lon_max, lat_max, zone)

                for state in states:
                    payload = asdict(state)
                    self._get_producer().send("airtraffic-events", value=payload)

                    if state.is_anomalous:
                        logger.warning(
                            f"ANOMALOUS AIRCRAFT [{zone}]: {state.icao24} "
                            f"({state.callsign or 'no-callsign'}) | {state.anomaly_reason}"
                        )

                logger.debug(f"{zone}: {len(states)} aircraft tracked ({sum(s.is_anomalous for s in states)} anomalous)")

            time.sleep(POLL_INTERVAL)

    async def run_async(self):
        """Async wrapper — runs blocking loop in thread executor."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.run_loop)

    def stop(self):
        self._running = False
        if self._producer:
            self._producer.flush()
            self._producer.close()
        self._session.close()


if __name__ == "__main__":
    logger.info("Testing OpenSky ADS-B ingestion (standalone)...")
    ing = OpenSkyIngestion()

    for (lon_min, lat_min, lon_max, lat_max, zone) in WATCH_BOXES:
        states = ing.poll_states(lon_min, lat_min, lon_max, lat_max, zone)
        print(f"\n{zone}: {len(states)} aircraft")
        for s in states[:3]:
            print(f"  {s.icao24} | {s.callsign} | alt={s.altitude_m}m | "
                  f"vel={s.velocity_mps}m/s | country={s.origin_country} "
                  f"| anomalous={s.is_anomalous}")
    ing.stop()
