"""
DRISHTI-AI — OSM Geospatial Context Loader
Fetches roads, settlements, military areas, bridges, and border crossings
near Indian border zones via the Overpass API (OpenStreetMap).
Also retrieves SRTM elevation profiles for terrain-aware threat analysis.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
SRTM_API_URL = "https://api.opentopodata.org/v1/srtm30m"
DATA_DIR = Path(os.getenv("DATA_DIR", "./data")) / "geospatial"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Border region bounding boxes: (south, west, north, east) for Overpass
BORDER_BBOXES: Dict[str, Tuple[float, float, float, float]] = {
    "LAC_LADAKH":   (32.0, 75.0, 36.0, 80.0),
    "LOC_KASHMIR":  (32.0, 73.0, 37.0, 77.0),
    "RAJ_BORDER":   (23.0, 68.0, 29.0, 72.0),
    "NE_BORDER":    (24.0, 88.0, 30.0, 97.0),
    "GUJARAT_COAST":(20.0, 68.0, 24.5, 74.0),
    "ANDAMAN":      (6.0,  92.0, 14.0, 94.5),
}


class OSMLoader:
    """
    Fetches geospatial context data from OpenStreetMap via Overpass API.
    Provides roads, settlements, military areas, bridges, and checkpoints
    near Indian border zones for terrain-aware threat analysis.

    All results cached as GeoJSON to avoid repeated API calls.
    Cache is refreshed every 7 days automatically.
    """

    CACHE_TTL_DAYS = 7

    def __init__(self):
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "DRISHTI-AI/1.0 RYIC2026"})

    def _cache_path(self, zone: str, feature_type: str) -> Path:
        return DATA_DIR / f"{zone}_{feature_type}.geojson"

    def _is_cache_valid(self, path: Path) -> bool:
        if not path.exists():
            return False
        age_days = (time.time() - path.stat().st_mtime) / 86400
        return age_days < self.CACHE_TTL_DAYS

    def _overpass_query(self, query: str, timeout: int = 60) -> Optional[Dict]:
        """Execute an Overpass QL query and return parsed JSON."""
        try:
            resp = self._session.post(
                OVERPASS_URL,
                data={"data": query},
                timeout=timeout,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            logger.error(f"Overpass API error: {e}")
            return None

    def _to_geojson(self, overpass_result: Dict) -> Dict:
        """Convert Overpass JSON to GeoJSON FeatureCollection."""
        features = []
        for el in overpass_result.get("elements", []):
            el_type = el.get("type")
            tags = el.get("tags", {})
            props = {"osm_id": el.get("id"), **tags}

            if el_type == "node":
                lat, lon = el.get("lat"), el.get("lon")
                if lat and lon:
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                        "properties": props,
                    })
            elif el_type == "way":
                coords = [[n.get("lon"), n.get("lat")] for n in el.get("geometry", []) if n.get("lat")]
                if len(coords) >= 2:
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": coords},
                        "properties": props,
                    })

        return {"type": "FeatureCollection", "features": features}

    def fetch_border_region(self, zone: str, feature_type: str = "all") -> Dict:
        """
        Fetch geospatial features for a border zone.

        Args:
            zone: Key from BORDER_BBOXES (e.g. 'LAC_LADAKH').
            feature_type: One of 'roads', 'military', 'settlements', 'crossings', 'all'.

        Returns:
            GeoJSON FeatureCollection dict.
        """
        cache_key = f"{zone}_{feature_type}"
        cache_path = self._cache_path(zone, feature_type)

        if self._is_cache_valid(cache_path):
            logger.debug(f"OSM cache hit: {cache_path}")
            return json.loads(cache_path.read_text())

        bbox = BORDER_BBOXES.get(zone)
        if not bbox:
            raise ValueError(f"Unknown zone: {zone}. Valid: {list(BORDER_BBOXES.keys())}")

        south, west, north, east = bbox
        bbox_str = f"{south},{west},{north},{east}"

        # Build Overpass QL query by feature type
        queries = {
            "roads": f"""
                [out:json][timeout:60];
                (
                  way["highway"]["highway"~"track|path|unclassified|secondary|tertiary"]({bbox_str});
                );
                out geom;
            """,
            "military": f"""
                [out:json][timeout:60];
                (
                  way["landuse"="military"]({bbox_str});
                  node["military"]({bbox_str});
                  way["military"]({bbox_str});
                );
                out geom;
            """,
            "settlements": f"""
                [out:json][timeout:60];
                (
                  node["place"~"village|town|hamlet|isolated_dwelling"]({bbox_str});
                );
                out geom;
            """,
            "crossings": f"""
                [out:json][timeout:60];
                (
                  node["barrier"~"border_control|checkpoint"]({bbox_str});
                  node["amenity"="border_control"]({bbox_str});
                  way["bridge"="yes"]({bbox_str});
                );
                out geom;
            """,
            "all": f"""
                [out:json][timeout:90];
                (
                  way["highway"~"track|path|unclassified|secondary"]({bbox_str});
                  node["place"~"village|town|hamlet"]({bbox_str});
                  node["military"]({bbox_str});
                  way["landuse"="military"]({bbox_str});
                  node["barrier"~"border_control|checkpoint"]({bbox_str});
                  way["bridge"="yes"]({bbox_str});
                );
                out geom;
            """,
        }

        query = queries.get(feature_type, queries["all"])
        logger.info(f"Fetching OSM data: {zone} / {feature_type}")

        result = self._overpass_query(query)
        if not result:
            logger.warning(f"Empty OSM result for {zone}/{feature_type}")
            return {"type": "FeatureCollection", "features": []}

        geojson = self._to_geojson(result)
        cache_path.write_text(json.dumps(geojson, indent=2))
        logger.info(f"OSM {zone}/{feature_type}: {len(geojson['features'])} features cached")
        return geojson

    def fetch_elevation_profile(
        self,
        locations: List[Tuple[float, float]],  # [(lat, lon), ...]
    ) -> List[Dict[str, float]]:
        """
        Fetch SRTM elevation values for a list of lat/lon points.
        Uses the OpenTopoData SRTM30m API (free, no auth).

        Args:
            locations: List of (lat, lon) tuples.

        Returns:
            List of dicts: [{"lat": ..., "lon": ..., "elevation_m": ...}, ...]
        """
        if not locations:
            return []

        # API accepts up to 100 locations per request
        results = []
        for i in range(0, len(locations), 100):
            batch = locations[i:i+100]
            loc_str = "|".join(f"{lat},{lon}" for lat, lon in batch)
            try:
                resp = self._session.get(
                    SRTM_API_URL,
                    params={"locations": loc_str},
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                for result in data.get("results", []):
                    results.append({
                        "lat": result["location"]["lat"],
                        "lon": result["location"]["lng"],
                        "elevation_m": result.get("elevation", 0.0),
                    })
            except requests.RequestException as e:
                logger.error(f"SRTM elevation fetch failed: {e}")

        return results

    def export_geojson(self, zone: str, feature_type: str = "all") -> Path:
        """
        Ensure GeoJSON is fetched and saved for a zone.
        Returns the path to the cached file.

        Args:
            zone: Border zone key.
            feature_type: Feature category to export.

        Returns:
            Path to the GeoJSON file.
        """
        self.fetch_border_region(zone, feature_type)
        path = self._cache_path(zone, feature_type)
        logger.info(f"GeoJSON exported: {path}")
        return path

    def load_all_zones(self) -> Dict[str, Dict]:
        """
        Pre-fetch and cache geospatial data for all border zones.
        Run this once at startup to warm the cache.

        Returns:
            Dict mapping zone_name → GeoJSON FeatureCollection.
        """
        all_data = {}
        for zone in BORDER_BBOXES:
            try:
                geojson = self.fetch_border_region(zone, feature_type="all")
                all_data[zone] = geojson
                logger.info(f"Zone loaded: {zone} ({len(geojson['features'])} features)")
                time.sleep(2)  # Respect Overpass rate limits
            except Exception as e:
                logger.error(f"Failed to load zone {zone}: {e}")
        return all_data


if __name__ == "__main__":
    logger.info("Testing OSM Geospatial Loader...")
    loader = OSMLoader()

    # Fetch data for LAC Ladakh
    data = loader.fetch_border_region("LAC_LADAKH", feature_type="all")
    print(f"\nLAC Ladakh features: {len(data['features'])}")

    # Sample features
    for feat in data["features"][:3]:
        props = feat.get("properties", {})
        geom_type = feat["geometry"]["type"]
        print(f"  [{geom_type}] {props.get('name', props.get('highway', props.get('place', 'unnamed')))}")

    # Test elevation
    test_pts = [(34.2, 77.5), (34.5, 77.8), (33.8, 76.9)]
    elevations = loader.fetch_elevation_profile(test_pts)
    print(f"\nElevation profile:")
    for e in elevations:
        print(f"  ({e['lat']:.3f}, {e['lon']:.3f}) → {e['elevation_m']:.0f}m")
