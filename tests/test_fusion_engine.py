"""
Tests for DRISHTI-AI Multi-Modal Fusion Engine.
Validates cross-attention transformer, embedding projections,
threat scoring calibration, and multi-sensor correlation.
"""
import pytest
import torch
import numpy as np
from fusion.fusion_engine import (
    ModalitySignal,
    ModalityEncoder,
    CrossModalFusion,
    FusionEngine,
    ThreatEventPayload,
)

def test_modality_encoder_projection():
    """Verify variable feature dimensions are projected into standard 256-dim embeddings."""
    encoder = ModalityEncoder(input_dim=12, embed_dim=256)
    x = torch.randn(4, 12)
    out = encoder(x)
    assert out.shape == (4, 256), f"Expected shape (4, 256), got {out.shape}"
    assert not torch.isnan(out).any(), "Encoder output contains NaN"

def test_cross_modal_fusion_forward():
    """Verify multi-head cross-attention produces valid pooled fused embedding."""
    fusion_model = CrossModalFusion(embed_dim=256, num_heads=4)
    # Simulate batch of 2, sequence of 5 modalities
    tokens = torch.randn(2, 5, 256)
    fused = fusion_model(tokens)
    
    assert fused.shape == (2, 256), f"Expected fused representation shape (2, 256), got {fused.shape}"
    assert not torch.isnan(fused).any(), "Fused representation contains NaN"

def test_fusion_engine_single_signal():
    """Verify fusion engine correctly handles a single sensor signal."""
    engine = FusionEngine()
    signal = ModalitySignal(
        modality="ADS_B",
        lat=34.08,
        lon=74.79,
        confidence=0.88,
        features=[34.08, 74.79, 450.0, 12000.0, -15.0],
        metadata={"callsign": "UAV-HOSTILE-01"},
    )
    result = engine.fuse([signal])
    assert isinstance(result, ThreatEventPayload)
    assert 0.0 <= result.threat_score <= 1.0
    assert "ADS_B" in result.modalities
    assert result.location["lat"] == pytest.approx(34.08, abs=0.01)

def test_fusion_engine_multi_modal_gain():
    """Corroboration from 3+ sensors should yield fused multi-modal threat output."""
    engine = FusionEngine()
    signals = [
        ModalitySignal("VIDEO", 34.12, 77.58, 0.90, [34.12, 77.58, 1.0, 0.9]),
        ModalitySignal("SATELLITE", 34.12, 77.58, 0.85, [34.12, 77.58, 0.85]),
        ModalitySignal("SEISMIC", 34.12, 77.58, 0.75, [34.12, 77.58, 3.2, 5.0]),
    ]
    result = engine.fuse(signals)
    assert len(result.modalities) >= 3
    assert result.threat_score >= 0.50, "Multi-sensor corroboration should trigger elevated threat score"
    assert result.threat_type == "MULTI_MODAL"
