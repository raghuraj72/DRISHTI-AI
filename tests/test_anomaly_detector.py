"""
Tests for DRISHTI-AI Anomaly Detector.
Validates LSTM Autoencoder sequence reconstruction, dynamic thresholding,
and Isolation Forest ensemble fallback.
"""
import pytest
import torch
import numpy as np
from detection.anomaly_detector import LSTMAutoencoder, AnomalyDetector

def test_lstm_autoencoder_shape():
    """Verify LSTM Autoencoder reconstructs the exact input shape without NaN."""
    model = LSTMAutoencoder(input_dim=8, hidden_dim=64, latent_dim=32)
    x = torch.randn(4, 30, 8)  # (batch=4, seq_len=30, input_dim=8)
    recon = model(x)
    assert recon.shape == (4, 30, 8), f"Expected shape (4, 30, 8), got {recon.shape}"
    assert not torch.isnan(recon).any(), "Reconstructed output contains NaN"

def test_lstm_autoencoder_latent_encoding():
    """Verify encoder outputs correct latent bottleneck dimension."""
    model = LSTMAutoencoder(input_dim=8, hidden_dim=64, latent_dim=32)
    x = torch.randn(3, 30, 8)
    latent = model.encode(x)
    assert latent.shape == (3, 32), f"Expected latent shape (3, 32), got {latent.shape}"

def test_anomaly_detector_training_and_scoring():
    """Verify anomaly detector trains on normal data and scores incoming observations."""
    detector = AnomalyDetector(input_dim=4, seq_len=10, zone="ladakh_lac")
    
    # Generate 100 rows of baseline 4-dim normal data
    normal_data = np.random.normal(loc=0.0, scale=1.0, size=(100, 4))
    thresh = detector.train(normal_data)
    
    assert detector._trained
    assert thresh >= 0.0
    
    # Score a test window of 15 readings
    test_window = normal_data[:15].tolist()
    combined_score, is_anom, explanation = detector.score(test_window)
    
    assert 0.0 <= combined_score <= 1.0
    assert isinstance(is_anom, bool)
    assert "LSTM" in explanation or "IsoForest" in explanation
