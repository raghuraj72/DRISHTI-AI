"""
DRISHTI-AI — Multi-Modal Fusion Engine
Cross-attention Transformer that fuses heterogeneous sensor streams
into a single calibrated ThreatEvent with a 0–1 threat score.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Data Classes ──────────────────────────────────────────────

@dataclass
class ModalitySignal:
    """Encoded signal from a single sensor modality."""
    modality: str           # 'VIDEO', 'SATELLITE', 'ADS_B', 'AIS', 'SEISMIC'
    lat: float
    lon: float
    confidence: float       # Raw confidence from the source detector
    features: List[float]   # Domain-specific feature vector (length varies)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict = field(default_factory=dict)


@dataclass
class ThreatEventPayload:
    """Output of the fusion engine — sent to Kafka `threat-events` topic."""
    threat_type: str
    threat_score: float
    confidence: float
    location: Dict[str, float]   # {"lat": ..., "lon": ...}
    modalities: List[str]
    entity_count: int
    description: str
    occurred_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Neural Network Modules ────────────────────────────────────

class ModalityEncoder(nn.Module):
    """
    Projects variable-length modality feature vectors into a common 256-dim embedding space.

    Input:  (batch, feature_dim) — raw features from one sensor modality
    Output: (batch, 256)        — standardized embedding
    """

    def __init__(self, input_dim: int, embed_dim: int = 256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.LayerNorm(128),
            nn.GELU(),
            nn.Linear(128, embed_dim),
            nn.LayerNorm(embed_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class CrossModalFusion(nn.Module):
    """
    Cross-attention Transformer that attends across modality embeddings
    and produces a fused threat representation.

    Input:  (batch, num_modalities, embed_dim)
    Output: (batch, embed_dim)
    """

    def __init__(self, embed_dim: int = 256, num_heads: int = 8, num_layers: int = 2):
        super().__init__()
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embed_dim,
            nhead=num_heads,
            dim_feedforward=512,
            dropout=0.1,
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.pool = nn.AdaptiveAvgPool1d(1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len=num_modalities, embed_dim)
        out = self.transformer(x)               # (batch, seq_len, embed_dim)
        out = out.transpose(1, 2)               # (batch, embed_dim, seq_len)
        out = self.pool(out).squeeze(-1)        # (batch, embed_dim)
        return out


class ThreatScorer(nn.Module):
    """
    Maps fused embedding → threat score (0–1) and threat type logits.

    Output:
        threat_score: float in [0, 1]
        type_logits:  (batch, 7) for 7 threat types
    """

    THREAT_TYPES = [
        "INTRUSION", "AIR_INCURSION", "MARITIME",
        "SEISMIC_ANOMALY", "MULTI_MODAL", "CYBER", "UNKNOWN"
    ]

    def __init__(self, embed_dim: int = 256):
        super().__init__()
        self.score_head = nn.Sequential(
            nn.Linear(embed_dim, 64),
            nn.GELU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )
        self.type_head = nn.Sequential(
            nn.Linear(embed_dim, 64),
            nn.GELU(),
            nn.Linear(64, len(self.THREAT_TYPES)),
        )

    def forward(self, fused: torch.Tensor):
        score = self.score_head(fused).squeeze(-1)      # (batch,)
        type_logits = self.type_head(fused)              # (batch, 7)
        return score, type_logits


# ── Modality-specific feature extractors ─────────────────────

MODALITY_DIMS = {
    "VIDEO":     16,   # [confidence, class_id, bbox_area, aspect_ratio, ...]
    "SATELLITE": 12,   # [ndvi_mean, ndvi_std, change_score, area_ha, ...]
    "ADS_B":     10,   # [altitude, speed, track, vrate, country_risk, ...]
    "AIS":       10,   # [speed, course, nav_status, vessel_type, dark_risk, ...]
    "SEISMIC":    8,   # [magnitude, depth, frequency, shallow_flag, ...]
    "RADAR":      8,
    "HUMINT":     4,
}


def extract_video_features(signal: ModalitySignal) -> List[float]:
    f = signal.features
    return (f + [0.0] * MODALITY_DIMS["VIDEO"])[:MODALITY_DIMS["VIDEO"]]


def extract_adsb_features(signal: ModalitySignal) -> List[float]:
    m = signal.metadata
    feat = [
        float(m.get("altitude_m", 0)) / 15000.0,       # normalised altitude
        float(m.get("velocity_mps", 0)) / 300.0,        # normalised speed
        float(m.get("heading", 0)) / 360.0,
        float(m.get("vertical_rate", 0)) / 30.0,
        1.0 if m.get("no_callsign") else 0.0,
        1.0 if m.get("origin_restricted") else 0.0,
        float(m.get("low_altitude_flag", 0)),
        signal.confidence,
        0.0, 0.0,
    ]
    return feat[:MODALITY_DIMS["ADS_B"]]


def extract_seismic_features(signal: ModalitySignal) -> List[float]:
    m = signal.metadata
    feat = [
        float(m.get("magnitude", 0)) / 10.0,
        float(m.get("depth_km", 30)) / 100.0,
        1.0 if m.get("is_suspicious") else 0.0,
        signal.confidence,
        0.0, 0.0, 0.0, 0.0,
    ]
    return feat[:MODALITY_DIMS["SEISMIC"]]


FEATURE_EXTRACTORS = {
    "VIDEO":    extract_video_features,
    "ADS_B":    extract_adsb_features,
    "SEISMIC":  extract_seismic_features,
}


# ── Fusion Engine ─────────────────────────────────────────────

class FusionEngine:
    """
    Combines signals from multiple modalities and scores the resulting threat.

    Usage:
        engine = FusionEngine()
        signals = [ModalitySignal("ADS_B", lat, lon, conf, features), ...]
        event = engine.fuse(signals)
        # event.threat_score, event.threat_type, event.location
    """

    EMBED_DIM = 256

    def __init__(self, model_path: Optional[str] = None):
        # Build model
        self.encoders = nn.ModuleDict({
            mod: ModalityEncoder(dim, self.EMBED_DIM)
            for mod, dim in MODALITY_DIMS.items()
        })
        self.fusion = CrossModalFusion(self.EMBED_DIM, num_heads=8, num_layers=2)
        self.scorer = ThreatScorer(self.EMBED_DIM)

        for module in [self.encoders, self.fusion, self.scorer]:
            module.to(DEVICE).eval()

        if model_path and os.path.exists(model_path):
            state = torch.load(model_path, map_location=DEVICE)
            self.encoders.load_state_dict(state["encoders"])
            self.fusion.load_state_dict(state["fusion"])
            self.scorer.load_state_dict(state["scorer"])
            logger.info(f"Fusion model loaded from {model_path}")
        else:
            logger.warning("No fusion model weights found — using untrained weights (for demo).")

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
                pass
        return self._producer

    def encode_modality(self, signal: ModalitySignal) -> Optional[torch.Tensor]:
        """Encode one modality signal into a 256-dim embedding."""
        mod = signal.modality.upper()
        if mod not in self.encoders:
            logger.warning(f"Unknown modality: {mod}")
            return None

        extractor = FEATURE_EXTRACTORS.get(mod)
        if extractor:
            raw_features = extractor(signal)
        else:
            dim = MODALITY_DIMS.get(mod, 8)
            raw_features = (signal.features + [0.0] * dim)[:dim]

        x = torch.tensor(raw_features, dtype=torch.float32, device=DEVICE).unsqueeze(0)
        with torch.no_grad():
            return self.encoders[mod](x)   # (1, 256)

    @torch.no_grad()
    def fuse(self, signals: List[ModalitySignal]) -> Optional[ThreatEventPayload]:
        """
        Fuse multiple modality signals into a single ThreatEventPayload.

        Args:
            signals: List of ModalitySignal from different sensors.

        Returns:
            ThreatEventPayload with computed threat_score and threat_type,
            or None if no valid signals.
        """
        if not signals:
            return None

        embeddings = []
        valid_modalities = []
        for sig in signals:
            emb = self.encode_modality(sig)
            if emb is not None:
                embeddings.append(emb)
                valid_modalities.append(sig.modality)

        if not embeddings:
            return None

        # Stack: (1, num_modalities, embed_dim)
        stacked = torch.stack(embeddings, dim=1)

        fused = self.fusion(stacked)                    # (1, embed_dim)
        score, type_logits = self.scorer(fused)

        threat_score = float(score.item())
        threat_type_idx = int(type_logits.argmax(dim=-1).item())
        threat_type = ThreatScorer.THREAT_TYPES[threat_type_idx]

        # Override threat type if single modality (more deterministic)
        if len(valid_modalities) == 1:
            mod_to_type = {
                "ADS_B": "AIR_INCURSION",
                "AIS": "MARITIME",
                "SEISMIC": "SEISMIC_ANOMALY",
                "VIDEO": "INTRUSION",
                "SATELLITE": "INTRUSION",
            }
            threat_type = mod_to_type.get(valid_modalities[0], threat_type)
        elif len(valid_modalities) >= 3:
            threat_type = "MULTI_MODAL"

        # Geo: weighted centroid
        lat = float(np.mean([s.lat for s in signals]))
        lon = float(np.mean([s.lon for s in signals]))
        confidence = float(np.mean([s.confidence for s in signals]))

        description = (
            f"Fusion of {len(valid_modalities)} modalities: {', '.join(valid_modalities)}. "
            f"Score: {threat_score:.2f}, Type: {threat_type}"
        )

        return ThreatEventPayload(
            threat_type=threat_type,
            threat_score=threat_score,
            confidence=confidence,
            location={"lat": lat, "lon": lon},
            modalities=valid_modalities,
            entity_count=len(signals),
            description=description,
        )

    def compute_threat_score(self, signals: List[ModalitySignal]) -> float:
        """Convenience method — returns only the threat score."""
        result = self.fuse(signals)
        return result.threat_score if result else 0.0

    def publish(self, event: ThreatEventPayload):
        """Publish a fused ThreatEventPayload to Kafka topic `threat-events`."""
        producer = self._get_producer()
        if producer:
            producer.send("threat-events", value=asdict(event))
            logger.info(f"Published threat event: {event.threat_type} score={event.threat_score:.2f}")


if __name__ == "__main__":
    logger.info("Testing FusionEngine...")
    engine = FusionEngine()

    # Simulate concurrent signals from 3 modalities
    signals = [
        ModalitySignal("ADS_B", lat=34.2, lon=76.5, confidence=0.85,
                       features=[], metadata={"altitude_m": 200, "no_callsign": True, "origin_restricted": True}),
        ModalitySignal("VIDEO", lat=34.21, lon=76.51, confidence=0.72,
                       features=[0.72, 1.0, 0.05, 1.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
        ModalitySignal("SEISMIC", lat=34.19, lon=76.48, confidence=0.6,
                       features=[], metadata={"magnitude": 1.8, "depth_km": 3.2, "is_suspicious": True}),
    ]

    result = engine.fuse(signals)
    print(f"\nFusion result:")
    print(f"  Threat type:  {result.threat_type}")
    print(f"  Threat score: {result.threat_score:.3f}")
    print(f"  Confidence:   {result.confidence:.3f}")
    print(f"  Modalities:   {result.modalities}")
    print(f"  Location:     ({result.location['lat']:.4f}, {result.location['lon']:.4f})")
