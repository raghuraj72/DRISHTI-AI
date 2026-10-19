"""
DRISHTI-AI Ingestion Package
=============================
Multi-modal data ingestion layer for India's AI-based border threat
detection system.  Aggregates satellite imagery, air-traffic state
vectors, maritime AIS streams, seismic signals and geospatial context
into a unified Kafka event bus for downstream ML inference.

Competition : RYIC 2026
Author      : DRISHTI-AI Team, DTU
"""

__version__ = "1.0.0"
__author__ = "DRISHTI-AI Team, DTU"
__competition__ = "RYIC 2026"

# StreamManager is NOT imported here at package level to avoid circular
# import issues when the sub-packages are imported individually.
# Import directly: from ingestion.stream_manager import StreamManager

__all__ = ["__version__"]
