"""
DRISHTI-AI — USGS Seismic Ingestion
Polls the USGS FDSN Event API (no auth required) for real-time seismic events
in all Indian border regions and publishes to Kafka.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from kafka import KafkaProducer
from loguru import logger

load_dotenv()

USGS_API_URL = os.getenv("USGS_API_URL", "https://earthquake.usgs.gov/fdsnws/event/1/query")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
POLL_INTERVAL = int(os.getenv("SEISMIC_POLL_INTERVAL", "300"))  # 5 minutes

# Indian border region bounding boxes: (minlat, maxlat, minlon, maxlon, zone_name)
BORDER_REGIONS = [
    (28.0, 36.0, 75.0, 97.0, "LAC_LADAKH_NE"),       # India-China (LAC)
    (32.0, 37.0, 73.0, 77.0, "LOC_KASHMIR"),           # India-Pakistan (LoC)
    (23.0, 30.0, 67.0, 75.0, "RAJ_GUJARAT_BORDER"),    # Rajasthan/Gujarat border
]

# Suspicious seismic signatures (tunnelling, explosions) vs natural
SUSPICIOUS_DEPTH_MAX_KM = 5.0        # Very shallow = possibly man-made
SUSPICIOUS_MAG_RANGE = (0.5, 3.5)    # Too small for natural major quake


def classify_seismic_event(magnitude: float, depth_km: float) -> str:
    """
    Classify a seismic event as natural, suspicious, or unknown.

    Heuristic:
    - Very shallow (< 5km) + small magnitude (0.5–3.5) → suspicious
      (could be tunnelling, small explosion, quarry blast)
    - Deeper or larger → natural
    """
    is_shallow = depth_km is not None and depth_km < SUSPICIOUS_DEPTH_MAX_KM
    is_small_mag = SUSPICIOUS_MAG_RANGE[0] <= magnitude <= SUSPICIOUS_MAG_RANGE[1]
    if is_shallow and is_small_mag:
        return "suspicious"
    elif magnitude >= 4.0 or (depth_km and depth_km > 10.0):
        return "natural"
    return "unknown"


class USGSSeismicIngestion:
    """
    Polls the USGS FDSN Event API for seismic events in Indian border regions.
    Classifies events and publishes to Kafka topic `seismic-events`.

    Real API: https://earthquake.usgs.gov/fdsnws/event/1/  (no auth needed)
    """

    def __init__(self):
        self._producer: Optional[KafkaProducer] = None
        self._seen_ids: set = set()
        self._running = False

    def _get_producer(self) -> KafkaProducer:
        if not self._producer:
            self._producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                retries=5,
            )
        return self._producer

    def fetch_events(
        self,
        minlat: float, maxlat: float,
        minlon: float, maxlon: float,
        lookback_minutes: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Fetch recent seismic events from USGS FDSN API for a bounding box.

        Args:
            minlat, maxlat, minlon, maxlon: Bounding box in WGS84.
            lookback_minutes: How far back to query (default 10 min).

        Returns:
            List of parsed event dicts.
        """
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(minutes=lookback_minutes)

        params = {
            "format": "geojson",
            "starttime": start_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "endtime": end_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "minlatitude": minlat,
            "maxlatitude": maxlat,
            "minlongitude": minlon,
            "maxlongitude": maxlon,
            "minmagnitude": 0.5,
            "orderby": "time",
        }

        try:
            resp = requests.get(USGS_API_URL, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            return data.get("features", [])
        except requests.RequestException as e:
            logger.error(f"USGS API request failed: {e}")
            return []

    def classify_event(self, feature: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a GeoJSON feature from USGS and produce a structured event dict.

        Args:
            feature: GeoJSON feature from USGS response.

        Returns:
            Structured event dict ready for Kafka.
        """
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [0, 0, 0])

        magnitude = props.get("mag", 0.0) or 0.0
        depth_km = coords[2] if len(coords) > 2 else None
        classification = classify_seismic_event(magnitude, depth_km or 999)
        is_suspicious = classification == "suspicious"

        return {
            "usgs_id": feature.get("id", ""),
            "magnitude": magnitude,
            "magnitude_type": props.get("magType"),
            "depth_km": depth_km,
            "coordinates": {
                "lon": coords[0],
                "lat": coords[1],
                "depth": depth_km,
            },
            "place": props.get("place"),
            "time": datetime.fromtimestamp(
                props.get("time", 0) / 1000, tz=timezone.utc
            ).isoformat(),
            "updated": datetime.fromtimestamp(
                props.get("updated", 0) / 1000, tz=timezone.utc
            ).isoformat(),
            "status": props.get("status"),
            "url": props.get("url"),
            "classification": classification,
            "is_suspicious": is_suspicious,
            "source": "USGS_FDSN",
        }

    def run_polling_loop(self):
        """
        Blocking polling loop. Polls every POLL_INTERVAL seconds.
        Run this in a thread or use run_async() for async context.
        """
        self._running = True
        logger.info(f"USGS seismic polling started. Interval: {POLL_INTERVAL}s")

        while self._running:
            total_events = 0
            suspicious_count = 0

            for (minlat, maxlat, minlon, maxlon, zone) in BORDER_REGIONS:
                features = self.fetch_events(minlat, maxlat, minlon, maxlon, lookback_minutes=POLL_INTERVAL // 60 + 2)

                for feature in features:
                    usgs_id = feature.get("id", "")
                    if usgs_id in self._seen_ids:
                        continue
                    self._seen_ids.add(usgs_id)

                    event_data = self.classify_event(feature)
                    event_data["border_zone"] = zone

                    self._get_producer().send("seismic-events", value=event_data)
                    total_events += 1
                    if event_data["is_suspicious"]:
                        suspicious_count += 1
                        logger.warning(
                            f"SUSPICIOUS seismic: M{event_data['magnitude']} "
                            f"depth={event_data['depth_km']}km at {event_data['place']}"
                        )

            if total_events:
                logger.info(f"Seismic poll: {total_events} new events ({suspicious_count} suspicious)")

            import time
            time.sleep(POLL_INTERVAL)

    async def run_async(self):
        """Async wrapper for run_polling_loop — runs in thread executor."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.run_polling_loop)

    def stop(self):
        """Stop the polling loop."""
        self._running = False
        if self._producer:
            self._producer.flush()
            self._producer.close()


if __name__ == "__main__":
    import time
    logger.info("Testing USGS seismic ingestion (standalone mode)...")
    ingestor = USGSSeismicIngestion()

    # One-off fetch test — no Kafka needed
    for (minlat, maxlat, minlon, maxlon, zone) in BORDER_REGIONS:
        features = ingestor.fetch_events(minlat, maxlat, minlon, maxlon, lookback_minutes=1440)  # last 24h
        print(f"\n{zone}: {len(features)} seismic events in last 24h")
        for f in features[:3]:
            evt = ingestor.classify_event(f)
            print(f"  M{evt['magnitude']} | depth={evt['depth_km']}km | {evt['place']} | class={evt['classification']}")
