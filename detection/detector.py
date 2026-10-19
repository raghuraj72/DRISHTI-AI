"""
DRISHTI-AI — YOLOv8 Object Detector
Runs inference on video frames and satellite tiles using the fine-tuned DRISHTI model.
Produces structured DetectionEvent objects and publishes to Kafka.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from loguru import logger
from ultralytics import YOLO

load_dotenv_safe = None
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv_safe = True
except ImportError:
    pass

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
MODEL_PATH = os.getenv("MODEL_PATH", str(Path(__file__).parent / "models" / "drishti_yolo_best.pt"))
CONFIDENCE_THRESHOLD = float(os.getenv("DETECTION_CONFIDENCE", "0.45"))

# DRISHTI detection classes (matching VIRAT + DOTA merged training)
CLASS_NAMES = {
    0: "person",
    1: "vehicle",
    2: "aircraft",
    3: "vessel",
    4: "group_of_people",
    5: "bicycle",
    6: "motorcycle",
}


@dataclass
class DetectionEvent:
    """A single object detection from video or satellite imagery."""
    entity_class: str
    confidence: float
    bbox_pixels: List[float]        # [x1, y1, x2, y2]
    lat: float                       # Geo-referenced latitude
    lon: float                       # Geo-referenced longitude
    source_modality: str             # 'VIDEO' or 'SATELLITE'
    source_file: Optional[str] = None
    frame_index: Optional[int] = None
    detected_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_anomalous: bool = False
    external_id: Optional[str] = None


class DrishtiDetector:
    """
    DRISHTI-AI object detection engine using YOLOv8.

    Supports:
    - Video frame inference (from RTSP streams or video files)
    - Satellite tile inference (PIL Image or numpy arrays)
    - Pixel-to-geo coordinate conversion using image metadata
    """

    def __init__(self, model_path: str = MODEL_PATH):
        import torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Loading DRISHTI YOLOv8 model from {model_path} on {self.device}")

        if not Path(model_path).exists():
            logger.warning(f"Custom model not found at {model_path}. Loading YOLOv8m as base.")
            model_path = "yolov8m.pt"

        self.model = YOLO(model_path)
        self.model.to(self.device)
        self._producer = None

    def _get_producer(self):
        if not self._producer:
            try:
                from kafka import KafkaProducer
                self._producer = KafkaProducer(
                    bootstrap_servers=KAFKA_BOOTSTRAP,
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                    retries=3,
                )
            except Exception:
                logger.warning("Kafka not available — detections will not be published.")
        return self._producer

    def pixel_to_latlon(
        self,
        pixel_x: float, pixel_y: float,
        img_w: int, img_h: int,
        bbox_geo: Tuple[float, float, float, float],  # (lon_min, lat_min, lon_max, lat_max)
    ) -> Tuple[float, float]:
        """
        Convert pixel coordinates to geographic lat/lon using linear interpolation
        over the image's geographic bounding box.

        Args:
            pixel_x, pixel_y: Pixel coordinates (0,0 = top-left).
            img_w, img_h: Image dimensions in pixels.
            bbox_geo: (lon_min, lat_min, lon_max, lat_max) of the image.

        Returns:
            (lat, lon) tuple.
        """
        lon_min, lat_min, lon_max, lat_max = bbox_geo
        lon = lon_min + (pixel_x / img_w) * (lon_max - lon_min)
        # Note: pixel y increases downward, lat increases upward
        lat = lat_max - (pixel_y / img_h) * (lat_max - lat_min)
        return lat, lon

    def detect_frame(
        self,
        frame: np.ndarray,
        geo_bbox: Optional[Tuple[float, float, float, float]] = None,
        frame_index: int = 0,
        source_file: Optional[str] = None,
        default_location: Tuple[float, float] = (28.5, 77.2),  # Default: Delhi approx
    ) -> List[DetectionEvent]:
        """
        Run YOLO inference on a single video frame.

        Args:
            frame: BGR numpy array (OpenCV format).
            geo_bbox: Optional (lon_min, lat_min, lon_max, lat_max) for geo-referencing.
            frame_index: Frame number in video sequence.
            source_file: Source video file/stream name.
            default_location: Fallback lat/lon if geo_bbox not provided.

        Returns:
            List of DetectionEvent objects.
        """
        results = self.model.predict(
            frame,
            conf=CONFIDENCE_THRESHOLD,
            device=self.device,
            verbose=False,
        )

        detections = []
        h, w = frame.shape[:2]

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

                if geo_bbox:
                    lat, lon = self.pixel_to_latlon(cx, cy, w, h, geo_bbox)
                else:
                    lat, lon = default_location

                event = DetectionEvent(
                    entity_class=CLASS_NAMES.get(cls_id, "unknown"),
                    confidence=conf,
                    bbox_pixels=[x1, y1, x2, y2],
                    lat=lat,
                    lon=lon,
                    source_modality="VIDEO",
                    source_file=source_file,
                    frame_index=frame_index,
                )
                detections.append(event)

        return detections

    def detect_tile(
        self,
        image_path: str,
        geo_bbox: Tuple[float, float, float, float],
    ) -> List[DetectionEvent]:
        """
        Run YOLO inference on a satellite image tile.

        Args:
            image_path: Path to the PNG/GeoTIFF satellite tile.
            geo_bbox: (lon_min, lat_min, lon_max, lat_max) of the tile.

        Returns:
            List of DetectionEvent objects with geo-referenced positions.
        """
        from PIL import Image
        img = Image.open(image_path)
        frame = np.array(img.convert("RGB"))[:, :, ::-1]  # PIL RGB → BGR numpy

        return self.detect_frame(frame, geo_bbox=geo_bbox, source_file=image_path)

    def run_video_stream(
        self,
        source: str,
        geo_bbox: Optional[Tuple[float, float, float, float]] = None,
        publish_to_kafka: bool = True,
    ):
        """
        Process a video stream (file path, RTSP URL, or webcam index).
        Publishes detections to Kafka topic `video-detections`.

        Args:
            source: Video source (file path, RTSP URL, or 0 for webcam).
            geo_bbox: Optional geographic bounding box for geo-referencing.
            publish_to_kafka: Whether to publish events to Kafka.
        """
        import cv2
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            logger.error(f"Cannot open video source: {source}")
            return

        logger.info(f"Processing video stream: {source}")
        frame_idx = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                detections = self.detect_frame(
                    frame, geo_bbox=geo_bbox,
                    frame_index=frame_idx, source_file=str(source)
                )

                for det in detections:
                    if publish_to_kafka:
                        producer = self._get_producer()
                        if producer:
                            producer.send("video-detections", value=asdict(det))
                    if det.entity_class in ("aircraft", "vessel") or det.confidence > 0.8:
                        logger.info(
                            f"HIGH CONF DETECTION [{frame_idx}]: {det.entity_class} "
                            f"conf={det.confidence:.2f} at ({det.lat:.4f}, {det.lon:.4f})"
                        )

                frame_idx += 1

        finally:
            cap.release()
            logger.info(f"Video stream finished. Processed {frame_idx} frames.")


if __name__ == "__main__":
    import sys
    logger.info("DRISHTI Detector — standalone test")
    detector = DrishtiDetector()

    # Test on a sample image if provided
    if len(sys.argv) > 1:
        img_path = sys.argv[1]
        # Use Ladakh AOI bbox for geo-referencing
        geo_bbox = (77.5, 33.5, 78.5, 34.5)
        detections = detector.detect_tile(img_path, geo_bbox)
        print(f"Detected {len(detections)} objects:")
        for d in detections:
            print(f"  {d.entity_class} (conf={d.confidence:.2f}) at ({d.lat:.4f}, {d.lon:.4f})")
    else:
        print("Usage: python detector.py <image_path>")
        print("Or run with a video: detector.run_video_stream('path/to/video.mp4')")
