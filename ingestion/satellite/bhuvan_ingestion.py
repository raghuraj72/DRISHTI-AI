"""
bhuvan_ingestion.py
===================
ISRO Bhuvan WMS tile ingestion for DRISHTI-AI.

Fetches Resourcesat-2 LISS-III imagery for Indian border regions via
the ISRO Bhuvan OGC-WMS service.  Tiles are saved as PNG and GeoTIFF
(via Pillow + rasterio) and optionally forwarded to a Kafka topic.

WMS Endpoint : https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms
OGC Version  : 1.1.1 / 1.3.0

Environment Variables
---------------------
KAFKA_BOOTSTRAP_SERVERS : comma-separated broker list
DATA_DIR                : root directory for saved tiles
"""

from __future__ import annotations

import asyncio
import io
import os
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import numpy as np
import requests
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

try:
    from PIL import Image  # type: ignore
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False
    logger.warning("Pillow not installed — PNG saving disabled.")

try:
    import rasterio  # type: ignore
    from rasterio.transform import from_bounds  # type: ignore
    _RASTERIO_AVAILABLE = True
except ImportError:
    _RASTERIO_AVAILABLE = False
    logger.warning("rasterio not installed — GeoTIFF saving disabled.")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
WMS_BASE_URL = "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms"

BORDER_REGIONS: dict[str, tuple[float, float, float, float]] = {
    "ladakh":    (77.5, 33.5, 78.5, 34.5),
    "rajasthan": (69.0, 24.0, 72.0, 27.0),
    "northeast": (91.0, 25.0, 94.0, 27.5),
    "rann_of_kutch": (68.5, 22.5, 71.5, 24.5),
    "arunachal": (91.5, 26.5, 97.0, 29.5),
}

# Default LISS-III layer name on Bhuvan WMS
DEFAULT_LAYER = "liss3"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class WMSLayer:
    """Represents a single WMS layer available on the Bhuvan service."""

    name: str
    title: str
    abstract: str = ""
    srs: list[str] = field(default_factory=list)
    bbox_wgs84: Optional[tuple[float, float, float, float]] = None


# ---------------------------------------------------------------------------
# Kafka helper
# ---------------------------------------------------------------------------
def _make_producer():
    """Create a KafkaProducer if ``KAFKA_BOOTSTRAP_SERVERS`` is set."""
    servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "")
    if not servers:
        return None
    try:
        from kafka import KafkaProducer  # type: ignore
        import json
        return KafkaProducer(
            bootstrap_servers=servers.split(","),
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            retries=5,
        )
    except Exception as exc:
        logger.warning(f"Kafka producer unavailable: {exc}")
        return None


# ---------------------------------------------------------------------------
# Main Class
# ---------------------------------------------------------------------------
class BhuvanIngestion:
    """
    Fetches Resourcesat-2 LISS-III tiles from the ISRO Bhuvan WMS service
    for Indian border region monitoring.

    Parameters
    ----------
    width : int
        Pixel width of each requested tile (WMS WIDTH parameter).
    height : int
        Pixel height of each requested tile (WMS HEIGHT parameter).
    wms_version : str
        OGC WMS version string ('1.1.1' or '1.3.0').
    max_retries : int
        Retry attempts on transient HTTP errors.
    retry_delay : float
        Base delay (seconds) between retries; doubled each attempt.
    save_png : bool
        If True, save tile as PNG file.
    save_geotiff : bool
        If True, save tile as GeoTIFF (requires rasterio).
    """

    KAFKA_TOPIC = "satellite-alerts"

    def __init__(
        self,
        width: int = 1024,
        height: int = 1024,
        wms_version: str = "1.1.1",
        max_retries: int = 4,
        retry_delay: float = 3.0,
        save_png: bool = True,
        save_geotiff: bool = True,
    ) -> None:
        self.width = width
        self.height = height
        self.wms_version = wms_version
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.save_png = save_png and _PIL_AVAILABLE
        self.save_geotiff = save_geotiff and _RASTERIO_AVAILABLE

        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "DRISHTI-AI/1.0 (RYIC2026)"})

        data_root = Path(os.getenv("DATA_DIR", "data")) / "satellite" / "bhuvan"
        data_root.mkdir(parents=True, exist_ok=True)
        self._data_dir = data_root
        self._producer = _make_producer()

        logger.info(
            f"BhuvanIngestion initialised | size={width}x{height} | "
            f"wms_version={wms_version}"
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _wms_params(
        self,
        layer: str,
        bbox: tuple[float, float, float, float],
        fmt: str = "image/png",
    ) -> dict:
        """Build the WMS GetMap query-parameter dictionary."""
        min_lon, min_lat, max_lon, max_lat = bbox
        if self.wms_version == "1.3.0":
            bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"
            srs_key = "CRS"
        else:
            bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"
            srs_key = "SRS"

        return {
            "SERVICE": "WMS",
            "VERSION": self.wms_version,
            "REQUEST": "GetMap",
            "LAYERS": layer,
            "STYLES": "",
            srs_key: "EPSG:4326",
            "BBOX": bbox_str,
            "WIDTH": str(self.width),
            "HEIGHT": str(self.height),
            "FORMAT": fmt,
            "TRANSPARENT": "TRUE",
        }

    def _get_capabilities_xml(self) -> str:
        """Fetch and return the WMS GetCapabilities XML string."""
        params = {
            "SERVICE": "WMS",
            "VERSION": self.wms_version,
            "REQUEST": "GetCapabilities",
        }
        resp = self._session.get(WMS_BASE_URL, params=params, timeout=30)
        resp.raise_for_status()
        return resp.text

    def _save_tile_png(self, img_bytes: bytes, path: Path) -> None:
        """Decode raw PNG bytes and write to *path*."""
        img = Image.open(io.BytesIO(img_bytes))
        img.save(str(path), format="PNG")
        logger.debug(f"PNG saved → {path}")

    def _save_tile_geotiff(
        self,
        img_bytes: bytes,
        bbox: tuple[float, float, float, float],
        path: Path,
    ) -> None:
        """
        Decode PNG bytes and write a georeferenced GeoTIFF using the WGS-84
        bounding box to derive the affine transform.
        """
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        arr = np.array(img)                       # H × W × 3
        arr = arr.transpose(2, 0, 1)              # 3 × H × W

        min_lon, min_lat, max_lon, max_lat = bbox
        transform = from_bounds(min_lon, min_lat, max_lon, max_lat,
                                self.width, self.height)
        with rasterio.open(
            str(path),
            "w",
            driver="GTiff",
            height=self.height,
            width=self.width,
            count=3,
            dtype=arr.dtype,
            crs="EPSG:4326",
            transform=transform,
            compress="lzw",
        ) as dst:
            dst.write(arr)
        logger.debug(f"GeoTIFF saved → {path}")

    def _request_with_retry(self, url: str, params: dict) -> bytes:
        """
        Perform a GET request with exponential-back-off retry.

        Returns
        -------
        bytes
            Raw response body on success.

        Raises
        ------
        RuntimeError
            If all retry attempts are exhausted.
        """
        last_exc: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self._session.get(url, params=params, timeout=60)
                resp.raise_for_status()
                content_type = resp.headers.get("Content-Type", "")
                if "image" not in content_type:
                    raise ValueError(
                        f"Unexpected content-type '{content_type}' — "
                        "server may have returned an error XML."
                    )
                return resp.content
            except Exception as exc:
                last_exc = exc
                wait = self.retry_delay * (2 ** (attempt - 1))
                logger.warning(
                    f"WMS request failed (attempt {attempt}/{self.max_retries}): "
                    f"{exc} — retrying in {wait:.1f}s"
                )
                time.sleep(wait)
        raise RuntimeError(
            f"All {self.max_retries} retries exhausted: {last_exc}"
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_available_layers(self) -> list[WMSLayer]:
        """
        Query the Bhuvan WMS GetCapabilities document and return a list
        of available :class:`WMSLayer` objects.

        Returns
        -------
        list[WMSLayer]
            Parsed layer metadata from the capabilities document.
        """
        logger.info("Fetching WMS GetCapabilities …")
        try:
            xml_text = self._get_capabilities_xml()
        except Exception as exc:
            logger.error(f"GetCapabilities failed: {exc}")
            return []

        layers: list[WMSLayer] = []
        root = ET.fromstring(xml_text)
        # Strip namespaces for robust parsing
        ns = root.tag.split("}")[0].strip("{") if "}" in root.tag else ""
        tag = lambda t: f"{{{ns}}}{t}" if ns else t  # noqa: E731

        for layer_el in root.iter(tag("Layer")):
            name_el = layer_el.find(tag("Name"))
            title_el = layer_el.find(tag("Title"))
            if name_el is None or name_el.text is None:
                continue
            srs_list = [
                el.text for el in layer_el.findall(tag("SRS"))
                if el.text
            ] + [
                el.text for el in layer_el.findall(tag("CRS"))
                if el.text
            ]
            layers.append(WMSLayer(
                name=name_el.text,
                title=(title_el.text if title_el is not None else ""),
                srs=srs_list,
            ))

        logger.info(f"Discovered {len(layers)} WMS layers on Bhuvan")
        return layers

    def fetch_tile(
        self,
        region: str,
        layer: str = DEFAULT_LAYER,
        bbox_override: Optional[tuple[float, float, float, float]] = None,
        image_format: str = "image/png",
    ) -> dict:
        """
        Fetch one WMS tile for the given border region and save it locally.

        Parameters
        ----------
        region : str
            Named region key from ``BORDER_REGIONS``, or 'custom'.
        layer : str
            WMS layer name to request (default: ``liss3``).
        bbox_override : tuple, optional
            ``(min_lon, min_lat, max_lon, max_lat)`` — overrides the
            preset bbox when provided.
        image_format : str
            MIME type for the WMS image response.

        Returns
        -------
        dict
            Metadata with 'region', 'layer', 'files', 'status'.
        """
        bbox = bbox_override or BORDER_REGIONS.get(region)
        if bbox is None:
            raise ValueError(
                f"Unknown region '{region}'. "
                f"Choose from {list(BORDER_REGIONS)} or pass bbox_override."
            )

        params = self._wms_params(layer, bbox, fmt=image_format)
        logger.info(
            f"Fetching Bhuvan tile | region={region} | layer={layer} | "
            f"bbox={bbox}"
        )

        try:
            img_bytes = self._request_with_retry(WMS_BASE_URL, params)
        except Exception as exc:
            logger.error(f"Tile fetch failed for {region}: {exc}")
            return {
                "region": region,
                "layer": layer,
                "files": [],
                "status": "error",
                "error": str(exc),
            }

        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        out_dir = self._data_dir / region
        out_dir.mkdir(parents=True, exist_ok=True)
        saved_files: list[str] = []

        if self.save_png:
            png_path = out_dir / f"{region}_{layer}_{ts}.png"
            self._save_tile_png(img_bytes, png_path)
            saved_files.append(str(png_path))

        if self.save_geotiff:
            tif_path = out_dir / f"{region}_{layer}_{ts}.tif"
            self._save_tile_geotiff(img_bytes, bbox, tif_path)
            saved_files.append(str(tif_path))

        result = {
            "region": region,
            "layer": layer,
            "bbox": bbox,
            "files": saved_files,
            "status": "ok",
            "timestamp_utc": datetime.utcnow().isoformat(),
            "source": "bhuvan_wms",
        }
        logger.success(
            f"Bhuvan tile saved | region={region} | files={len(saved_files)}"
        )
        return result

    async def send_to_kafka(self, tile_metadata: dict) -> None:
        """
        Publish a tile-ready event to the ``satellite-alerts`` Kafka topic.

        Parameters
        ----------
        tile_metadata : dict
            The dict returned by :meth:`fetch_tile`.
        """
        if self._producer is None:
            logger.warning("Kafka producer not available — skipping publish.")
            return
        try:
            future = self._producer.send(self.KAFKA_TOPIC, value=tile_metadata)
            future.get(timeout=10)
            logger.debug(
                f"Kafka ack | topic={self.KAFKA_TOPIC} | "
                f"region={tile_metadata.get('region')}"
            )
        except Exception as exc:
            logger.error(f"Kafka send failed: {exc}")

    async def schedule_fetch(
        self,
        interval_hours: float = 12.0,
        layer: str = DEFAULT_LAYER,
    ) -> None:
        """
        Async loop that fetches tiles for all regions at a fixed interval.

        Parameters
        ----------
        interval_hours : float
            Hours between successive fetch cycles.
        layer : str
            WMS layer to request on each cycle.
        """
        logger.info(
            f"Bhuvan scheduled fetch started | "
            f"interval={interval_hours}h | layer={layer}"
        )
        while True:
            for region in BORDER_REGIONS:
                try:
                    result = await asyncio.get_event_loop().run_in_executor(
                        None, self.fetch_tile, region, layer
                    )
                    if result["status"] == "ok" and self._producer:
                        await self.send_to_kafka(result)
                except Exception as exc:
                    logger.error(f"schedule_fetch error for {region}: {exc}")

            logger.info(f"Bhuvan cycle done — sleeping {interval_hours}h")
            await asyncio.sleep(interval_hours * 3600)


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logger.info("=== DRISHTI-AI | Bhuvan WMS Ingestion — standalone test ===")

    ingestor = BhuvanIngestion(width=512, height=512)

    layers = ingestor.get_available_layers()
    logger.info(f"Available layers (first 5): {[l.name for l in layers[:5]]}")

    result = ingestor.fetch_tile(region="ladakh")
    logger.info(f"Fetch result: {result}")
