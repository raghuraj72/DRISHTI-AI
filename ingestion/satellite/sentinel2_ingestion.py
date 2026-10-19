"""
DRISHTI-AI — Sentinel-2 Satellite Imagery Ingestion
Fetches live multi-spectral imagery for Indian border regions via
the Copernicus Data Space Ecosystem (free, REST API).
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

SENTINEL_CLIENT_ID = os.getenv("SENTINEL_CLIENT_ID", "")
SENTINEL_CLIENT_SECRET = os.getenv("SENTINEL_CLIENT_SECRET", "")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
DATA_DIR = Path(os.getenv("SATELLITE_DATA_DIR", "./data/satellite"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CATALOG_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

# Indian border region AOIs: (name, bbox as [lon_min, lat_min, lon_max, lat_max])
BORDER_AOIS: List[Tuple[str, List[float]]] = [
    ("LAC_LADAKH",   [77.5, 33.5, 78.5, 34.5]),
    ("LOC_KASHMIR",  [74.0, 33.0, 75.5, 34.5]),
    ("RAJ_BORDER",   [69.0, 24.0, 72.0, 27.0]),
    ("NE_BORDER",    [91.0, 25.0, 94.0, 27.5]),
]

EVALSCRIPT_TRUE_COLOR = """
//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04"], output: { bands: 3 } };
}
function evaluatePixel(sample) {
  return [3.5 * sample.B04, 3.5 * sample.B03, 3.5 * sample.B02];
}
"""

EVALSCRIPT_NDVI = """
//VERSION=3
function setup() {
  return { input: ["B04", "B08"], output: { bands: 1 } };
}
function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return [ndvi];
}
"""


class Sentinel2Ingestion:
    """
    Fetches Sentinel-2 L2A imagery from the Copernicus Data Space Ecosystem.

    Authentication: OAuth2 client credentials (free registration at dataspace.copernicus.eu)
    API: Sentinel Hub Process API — https://documentation.dataspace.copernicus.eu/
    """

    def __init__(self):
        self._access_token: Optional[str] = None
        self._token_expiry: float = 0.0
        self._session = requests.Session()

    def _get_access_token(self) -> str:
        """Obtain or refresh OAuth2 access token."""
        if self._access_token and time.time() < self._token_expiry - 60:
            return self._access_token

        if not SENTINEL_CLIENT_ID or not SENTINEL_CLIENT_SECRET:
            raise RuntimeError(
                "SENTINEL_CLIENT_ID and SENTINEL_CLIENT_SECRET must be set in .env\n"
                "Register free at: https://dataspace.copernicus.eu/"
            )

        resp = self._session.post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": SENTINEL_CLIENT_ID,
                "client_secret": SENTINEL_CLIENT_SECRET,
            },
            timeout=15,
        )
        resp.raise_for_status()
        token_data = resp.json()
        self._access_token = token_data["access_token"]
        self._token_expiry = time.time() + token_data.get("expires_in", 3600)
        logger.debug("Sentinel-2 OAuth2 token refreshed.")
        return self._access_token

    def fetch_tile(
        self,
        aoi_name: str,
        bbox: List[float],
        date: Optional[datetime] = None,
        image_type: str = "true_color",
        resolution_m: int = 60,
    ) -> Optional[Path]:
        """
        Fetch a Sentinel-2 image tile for a given AOI and date.

        Args:
            aoi_name: Human-readable name (used in filename).
            bbox: [lon_min, lat_min, lon_max, lat_max] in WGS84.
            date: Target date (defaults to yesterday for guaranteed availability).
            image_type: 'true_color' or 'ndvi'.
            resolution_m: Output resolution in metres (10, 20, or 60).

        Returns:
            Path to saved PNG file, or None on failure.
        """
        token = self._get_access_token()
        date = date or (datetime.now(timezone.utc) - timedelta(days=1))
        date_str = date.strftime("%Y-%m-%d")

        evalscript = EVALSCRIPT_TRUE_COLOR if image_type == "true_color" else EVALSCRIPT_NDVI
        output_format = "image/png"
        out_path = DATA_DIR / f"{aoi_name}_{image_type}_{date_str}.png"

        payload = {
            "input": {
                "bounds": {
                    "bbox": bbox,
                    "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
                },
                "data": [{
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {
                            "from": f"{date_str}T00:00:00Z",
                            "to": f"{date_str}T23:59:59Z",
                        },
                        "maxCloudCoverage": 30,
                    },
                }],
            },
            "output": {
                "width": 512,
                "height": 512,
                "responses": [{"identifier": "default", "format": {"type": output_format}}],
            },
            "evalscript": evalscript,
        }

        try:
            resp = self._session.post(
                PROCESS_URL,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60,
            )
            if resp.status_code == 200:
                out_path.write_bytes(resp.content)
                logger.info(f"Sentinel-2 tile saved: {out_path} ({len(resp.content) / 1024:.1f}KB)")
                return out_path
            else:
                logger.warning(f"Sentinel-2 fetch failed [{resp.status_code}]: {resp.text[:200]}")
                return None
        except requests.RequestException as e:
            logger.error(f"Sentinel-2 request error for {aoi_name}: {e}")
            return None

    def send_to_kafka(self, aoi_name: str, tile_path: Path, image_type: str):
        """Publish satellite fetch event metadata to Kafka for downstream processing."""
        try:
            from kafka import KafkaProducer
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            producer.send("satellite-alerts", value={
                "source": "sentinel2",
                "aoi": aoi_name,
                "image_type": image_type,
                "file_path": str(tile_path),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "needs_processing": True,
            })
            producer.flush()
            producer.close()
        except Exception as e:
            logger.warning(f"Kafka publish skipped (Kafka may not be running): {e}")

    def schedule_fetch(self, interval_hours: int = 6):
        """
        Blocking loop that fetches tiles for all AOIs every interval_hours.

        Args:
            interval_hours: How often to fetch new imagery (default: every 6h).
        """
        logger.info(f"Sentinel-2 scheduler started. Fetching every {interval_hours}h.")
        while True:
            for aoi_name, bbox in BORDER_AOIS:
                for img_type in ("true_color", "ndvi"):
                    tile = self.fetch_tile(aoi_name, bbox, image_type=img_type)
                    if tile:
                        self.send_to_kafka(aoi_name, tile, img_type)
            logger.info(f"Sentinel-2 cycle complete. Next fetch in {interval_hours}h.")
            time.sleep(interval_hours * 3600)


if __name__ == "__main__":
    logger.info("Sentinel-2 ingestion — standalone test")
    if not SENTINEL_CLIENT_ID:
        print("Set SENTINEL_CLIENT_ID and SENTINEL_CLIENT_SECRET in .env")
        print("Register at: https://dataspace.copernicus.eu/")
    else:
        ingestor = Sentinel2Ingestion()
        # Fetch last available tile for Ladakh
        tile = ingestor.fetch_tile("LAC_LADAKH", [77.5, 33.5, 78.5, 34.5], image_type="true_color")
        if tile:
            print(f"✅ Tile saved to: {tile}")
        else:
            print("❌ Fetch failed — check credentials and cloud cover for chosen date")
