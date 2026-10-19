"""
DRISHTI-AI — LSTM Autoencoder Anomaly Detector
Learns the normal pattern of multi-sensor time-series data per border zone
and flags deviations as anomalies with a calibrated confidence score.
"""
from __future__ import annotations

import json
import os
import pickle
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from loguru import logger
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

MODEL_DIR = Path(os.getenv("MODEL_DIR", "./models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── LSTM Autoencoder ──────────────────────────────────────────

class LSTMAutoencoder(nn.Module):
    """
    Sequence autoencoder for time-series anomaly detection.

    Architecture:
        Encoder: 2-layer LSTM (input_dim → 128 → 64)
        Decoder: 2-layer LSTM (64 → 128 → input_dim)

    Input shape:  (batch, seq_len, input_dim)
    Output shape: (batch, seq_len, input_dim)  — reconstructed sequence

    Anomaly score = MSE(input, reconstruction) — high score = anomalous
    """

    def __init__(self, input_dim: int, hidden_dim: int = 128, latent_dim: int = 64):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.latent_dim = latent_dim

        # Encoder
        self.encoder = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=2,
            batch_first=True,
            dropout=0.2,
        )
        self.enc_proj = nn.Linear(hidden_dim, latent_dim)

        # Decoder
        self.dec_proj = nn.Linear(latent_dim, hidden_dim)
        self.decoder = nn.LSTM(
            input_size=latent_dim,
            hidden_size=hidden_dim,
            num_layers=2,
            batch_first=True,
            dropout=0.2,
        )
        self.output_proj = nn.Linear(hidden_dim, input_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch, seq_len, _ = x.shape

        # Encode
        enc_out, _ = self.encoder(x)                     # (batch, seq, hidden)
        latent = self.enc_proj(enc_out)                   # (batch, seq, latent)

        # Decode
        dec_out, _ = self.decoder(latent)                 # (batch, seq, hidden)
        recon = self.output_proj(dec_out)                 # (batch, seq, input_dim)
        return recon

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        """Return latent representation (last timestep)."""
        with torch.no_grad():
            enc_out, _ = self.encoder(x)
            latent = self.enc_proj(enc_out)
        return latent[:, -1, :]   # (batch, latent_dim)


# ── Anomaly Detector ─────────────────────────────────────────

class AnomalyDetector:
    """
    Two-stage anomaly detector combining:
    1. LSTM Autoencoder — captures temporal patterns in sensor streams
    2. Isolation Forest — fast tabular anomaly detection (fallback + ensemble)

    Training data: historical normal sensor readings per border zone.
    Inference:     sliding window of recent readings → anomaly score + flag.
    """

    def __init__(
        self,
        input_dim: int = 8,
        seq_len: int = 30,
        zone: str = "default",
    ):
        self.input_dim = input_dim
        self.seq_len = seq_len
        self.zone = zone

        self.lstm_ae = LSTMAutoencoder(input_dim).to(DEVICE)
        self.iso_forest = IsolationForest(n_estimators=200, contamination=0.05, random_state=42)
        self.scaler = StandardScaler()

        self._threshold: Optional[float] = None
        self._trained = False

        # Window buffer for streaming inference
        self._window: List[List[float]] = []

    def _model_path(self, suffix: str) -> Path:
        return MODEL_DIR / f"anomaly_{self.zone}_{suffix}"

    def train(self, normal_data: np.ndarray) -> float:
        """
        Train on historical normal data.

        Args:
            normal_data: Shape (N, input_dim) — rows of sensor readings
                         representing normal baseline conditions.

        Returns:
            float: The calibrated anomaly threshold (95th percentile of reconstruction error).
        """
        logger.info(f"Training anomaly detector for zone '{self.zone}' on {len(normal_data)} samples")

        # Scale data
        scaled = self.scaler.fit_transform(normal_data)

        # Train Isolation Forest on raw features
        self.iso_forest.fit(scaled)

        # Build sequences for LSTM AE
        seqs = self._build_sequences(scaled)
        if len(seqs) == 0:
            logger.warning("Not enough data for LSTM training — using Isolation Forest only.")
            self._trained = True
            return 0.0

        dataset = torch.tensor(seqs, dtype=torch.float32).to(DEVICE)
        optimizer = torch.optim.Adam(self.lstm_ae.parameters(), lr=1e-3, weight_decay=1e-5)
        criterion = nn.MSELoss()

        self.lstm_ae.train()
        for epoch in range(50):
            perm = torch.randperm(len(dataset))
            total_loss = 0.0
            for i in range(0, len(dataset), 64):
                batch = dataset[perm[i:i+64]]
                optimizer.zero_grad()
                recon = self.lstm_ae(batch)
                loss = criterion(recon, batch)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
            if (epoch + 1) % 10 == 0:
                logger.debug(f"  Epoch {epoch+1}/50 — loss: {total_loss:.4f}")

        # Calibrate threshold at 95th percentile of reconstruction errors on normal data
        self.lstm_ae.eval()
        with torch.no_grad():
            recon = self.lstm_ae(dataset)
            errors = ((dataset - recon) ** 2).mean(dim=(1, 2)).cpu().numpy()
        self._threshold = float(np.percentile(errors, 95))
        logger.info(f"Anomaly threshold calibrated: {self._threshold:.6f}")

        self._trained = True
        self.save()
        return self._threshold

    def _build_sequences(self, data: np.ndarray) -> np.ndarray:
        """Convert flat array into overlapping sequences of length seq_len."""
        if len(data) < self.seq_len:
            return np.array([])
        seqs = np.stack([data[i:i+self.seq_len] for i in range(len(data) - self.seq_len + 1)])
        return seqs

    @torch.no_grad()
    def score(self, readings: List[List[float]]) -> Tuple[float, bool, str]:
        """
        Score a window of sensor readings for anomaly.

        Args:
            readings: List of recent sensor reading vectors (length ≥ seq_len preferred).

        Returns:
            (anomaly_score, is_anomalous, explanation)
        """
        if len(readings) == 0:
            return 0.0, False, "No data"

        arr = np.array(readings, dtype=np.float32)
        scaled = self.scaler.transform(arr) if self._trained else arr

        # Isolation Forest score (works on any length)
        iso_scores = self.iso_forest.score_samples(scaled)
        iso_mean = float(np.mean(-iso_scores))  # Higher = more anomalous

        # LSTM AE score (needs at least seq_len samples)
        lstm_score = 0.0
        if len(scaled) >= self.seq_len and self._threshold is not None:
            window = scaled[-self.seq_len:]
            t = torch.tensor(window, dtype=torch.float32, device=DEVICE).unsqueeze(0)
            self.lstm_ae.eval()
            recon = self.lstm_ae(t)
            lstm_score = float(((t - recon) ** 2).mean().item())

        # Ensemble: weighted average
        combined = 0.6 * (lstm_score / (self._threshold + 1e-8)) + 0.4 * (iso_mean / 0.5)
        combined = float(np.clip(combined, 0.0, 1.0))

        is_anomalous = combined > 0.6
        explanation = (
            f"LSTM recon error: {lstm_score:.4f} (thresh: {self._threshold:.4f}) | "
            f"IsoForest score: {iso_mean:.4f} | Combined: {combined:.4f}"
        )

        return combined, is_anomalous, explanation

    def update_window(self, reading: List[float]) -> Tuple[float, bool, str]:
        """
        Add a single reading to the sliding window and return current anomaly score.

        Args:
            reading: Single sensor reading vector of length input_dim.
        """
        self._window.append(reading)
        if len(self._window) > self.seq_len * 3:
            self._window = self._window[-self.seq_len * 3:]
        return self.score(self._window)

    def threshold_calibrate(self, normal_data: np.ndarray, percentile: float = 95) -> float:
        """Re-calibrate threshold from new normal data without re-training."""
        scaled = self.scaler.transform(normal_data)
        seqs = self._build_sequences(scaled)
        if len(seqs) == 0:
            return self._threshold or 0.0
        t = torch.tensor(seqs, dtype=torch.float32, device=DEVICE)
        self.lstm_ae.eval()
        with torch.no_grad():
            recon = self.lstm_ae(t)
            errors = ((t - recon) ** 2).mean(dim=(1, 2)).cpu().numpy()
        self._threshold = float(np.percentile(errors, percentile))
        return self._threshold

    def explain_anomaly(self, readings: List[List[float]]) -> Dict:
        """Return a structured explanation dict for the anomaly."""
        score, is_anomalous, explanation = self.score(readings)
        arr = np.array(readings, dtype=np.float32)
        recent = arr[-min(5, len(arr)):]
        return {
            "is_anomalous": is_anomalous,
            "anomaly_score": round(score, 4),
            "threshold": round(self._threshold or 0.0, 4),
            "explanation": explanation,
            "recent_mean": recent.mean(axis=0).tolist() if len(recent) > 0 else [],
        }

    def save(self):
        """Persist model weights and scaler to disk."""
        torch.save(self.lstm_ae.state_dict(), self._model_path("lstm.pt"))
        with open(self._model_path("iso.pkl"), "wb") as f:
            pickle.dump(self.iso_forest, f)
        with open(self._model_path("scaler.pkl"), "wb") as f:
            pickle.dump(self.scaler, f)
        if self._threshold is not None:
            with open(self._model_path("threshold.json"), "w") as f:
                json.dump({"threshold": self._threshold}, f)
        logger.info(f"Anomaly detector saved for zone '{self.zone}'")

    def load(self) -> bool:
        """Load persisted model weights. Returns True if successful."""
        lstm_path = self._model_path("lstm.pt")
        iso_path = self._model_path("iso.pkl")
        if not lstm_path.exists() or not iso_path.exists():
            return False
        self.lstm_ae.load_state_dict(torch.load(lstm_path, map_location=DEVICE))
        with open(iso_path, "rb") as f:
            self.iso_forest = pickle.load(f)
        with open(self._model_path("scaler.pkl"), "rb") as f:
            self.scaler = pickle.load(f)
        threshold_path = self._model_path("threshold.json")
        if threshold_path.exists():
            with open(threshold_path) as f:
                self._threshold = json.load(f)["threshold"]
        self._trained = True
        logger.info(f"Anomaly detector loaded for zone '{self.zone}'")
        return True


if __name__ == "__main__":
    logger.info("Testing AnomalyDetector...")

    # Simulate normal seismic readings: (N, 8) — [mag, depth, lat, lon, freq, amp, p_wave, s_wave]
    np.random.seed(42)
    normal = np.random.normal(loc=[2.0, 15.0, 30.0, 76.0, 1.2, 0.3, 0.8, 1.5], scale=0.5, size=(500, 8))

    detector = AnomalyDetector(input_dim=8, seq_len=30, zone="LAC_LADAKH")
    threshold = detector.train(normal)
    print(f"✅ Trained. Threshold: {threshold:.6f}")

    # Test on normal reading
    normal_window = normal[-40:].tolist()
    score, flag, expl = detector.score(normal_window)
    print(f"\nNormal reading:   score={score:.3f}, anomalous={flag}")

    # Test on anomalous reading (shallow, small magnitude — suspicious)
    anomalous = np.random.normal(loc=[1.5, 2.0, 30.0, 76.0, 5.0, 1.2, 0.2, 0.3], scale=0.1, size=(40, 8))
    score, flag, expl = detector.score(anomalous.tolist())
    print(f"Anomalous reading: score={score:.3f}, anomalous={flag}")
    print(f"Explanation: {expl}")
