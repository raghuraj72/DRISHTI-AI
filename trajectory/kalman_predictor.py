"""
DRISHTI-AI — Kalman Filter + GNN Trajectory Predictor
Tracks detected entities, smooths noisy position estimates,
and predicts their location 5/10/15 minutes into the future.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
try:
    from filterpy.kalman import KalmanFilter
except ImportError:
    class KalmanFilter:
        """Pure NumPy fallback for 6-state constant acceleration Kalman Filter."""
        def __init__(self, dim_x: int = 6, dim_z: int = 2):
            self.dim_x = dim_x
            self.dim_z = dim_z
            self.x = np.zeros((dim_x, 1))
            self.F = np.eye(dim_x)
            self.H = np.zeros((dim_z, dim_x))
            self.R = np.eye(dim_z)
            self.Q = np.eye(dim_x)
            self.P = np.eye(dim_x)

        def predict(self):
            self.x = self.F @ self.x
            self.P = self.F @ self.P @ self.F.T + self.Q

        def update(self, z):
            y = z - self.H @ self.x
            S = self.H @ self.P @ self.H.T + self.R
            K = self.P @ self.H.T @ np.linalg.pinv(S)
            self.x = self.x + K @ y
            I = np.eye(self.dim_x)
            self.P = (I - K @ self.H) @ self.P

from loguru import logger

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── Entity Track State ────────────────────────────────────────

@dataclass
class TrackState:
    """Running state of a tracked entity."""
    entity_id: str
    positions: List[Tuple[float, float]] = field(default_factory=list)  # [(lat, lon), ...]
    timestamps: List[str] = field(default_factory=list)
    velocities: List[Tuple[float, float]] = field(default_factory=list) # [(vlat, vlon), ...]
    kalman: Optional[KalmanFilter] = field(default=None, repr=False)
    last_updated: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class TrajectoryPrediction:
    """Predicted future positions for an entity."""
    entity_id: str
    current: Tuple[float, float]
    predicted_5min:  Optional[Tuple[float, float]]
    predicted_10min: Optional[Tuple[float, float]]
    predicted_15min: Optional[Tuple[float, float]]
    uncertainty_m: float       # 1-sigma position uncertainty in metres
    heading_deg: Optional[float]
    speed_mps: Optional[float]
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Kalman Filter Tracker ─────────────────────────────────────

class KalmanTracker:
    """
    6-state Kalman Filter for 2D position tracking.

    State vector: [lat, lon, v_lat, v_lon, a_lat, a_lon]
    Measurement:  [lat, lon]

    Designed for tracking slow entities (ground vehicles, vessels) and
    fast entities (aircraft) with different process noise tuning.
    """

    def __init__(self, entity_type: str = "ground"):
        """
        Args:
            entity_type: 'ground' (vehicles/people), 'air' (aircraft), 'maritime' (vessels)
        """
        self.kf = KalmanFilter(dim_x=6, dim_z=2)
        dt = 30.0  # seconds between updates

        # Transition matrix (constant acceleration model)
        self.kf.F = np.array([
            [1, 0, dt, 0,  0.5*dt**2, 0        ],
            [0, 1, 0,  dt, 0,         0.5*dt**2],
            [0, 0, 1,  0,  dt,        0        ],
            [0, 0, 0,  1,  0,         dt       ],
            [0, 0, 0,  0,  1,         0        ],
            [0, 0, 0,  0,  0,         1        ],
        ])

        # Measurement matrix (observe lat/lon only)
        self.kf.H = np.array([
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
        ])

        # Measurement noise (GPS/ADS-B accuracy ≈ 10m ≈ 0.0001 deg)
        obs_noise = {"ground": 0.0002, "air": 0.0001, "maritime": 0.0003}
        r = obs_noise.get(entity_type, 0.0002)
        self.kf.R = np.eye(2) * r**2

        # Process noise (how much the entity can deviate from constant acceleration)
        proc_noise = {"ground": 1e-8, "air": 1e-6, "maritime": 1e-9}
        q = proc_noise.get(entity_type, 1e-8)
        self.kf.Q = np.eye(6) * q

        # Initial covariance (high uncertainty at start)
        self.kf.P = np.eye(6) * 0.01

        self._initialised = False

    def update(self, lat: float, lon: float) -> np.ndarray:
        """
        Feed a new position measurement and return the filtered state.

        Args:
            lat, lon: Measured latitude/longitude.

        Returns:
            Filtered state vector [lat, lon, v_lat, v_lon, a_lat, a_lon].
        """
        z = np.array([[lat], [lon]])
        if not self._initialised:
            self.kf.x = np.array([lat, lon, 0, 0, 0, 0]).reshape(6, 1)
            self._initialised = True
        self.kf.predict()
        self.kf.update(z)
        return self.kf.x.flatten()

    def predict(self, steps: int = 1) -> Tuple[float, float, float]:
        """
        Predict position N steps (each step = 30s) into the future.

        Returns:
            (predicted_lat, predicted_lon, uncertainty_m)
        """
        F_n = np.linalg.matrix_power(self.kf.F, steps)
        x_pred = F_n @ self.kf.x
        P_pred = F_n @ self.kf.P @ F_n.T + self.kf.Q * steps

        pred_lat = float(x_pred[0, 0])
        pred_lon = float(x_pred[1, 0])

        # Position uncertainty (1 sigma) in metres — 1 deg lat ≈ 111km
        sigma_lat = float(np.sqrt(P_pred[0, 0])) * 111_000
        sigma_lon = float(np.sqrt(P_pred[1, 1])) * 111_000 * np.cos(np.radians(pred_lat))
        uncertainty_m = float(np.sqrt(sigma_lat**2 + sigma_lon**2))

        return pred_lat, pred_lon, uncertainty_m


# ── Graph Neural Network (Multi-Entity) ──────────────────────

class TrajectoryGNN(nn.Module):
    """
    Simple GNN for multi-entity trajectory refinement.

    Models interactions between entities (e.g., group moving together,
    aircraft escorting a vessel) via message passing.

    Node features: [lat_norm, lon_norm, v_lat, v_lon, entity_type_emb]
    Edge features: [distance_km, relative_heading]
    Output: per-node displacement correction (Δlat, Δlon)
    """

    def __init__(self, node_dim: int = 8, edge_dim: int = 4, hidden: int = 64):
        super().__init__()
        self.node_enc = nn.Linear(node_dim, hidden)
        self.edge_enc = nn.Linear(edge_dim, hidden)
        self.msg_mlp = nn.Sequential(
            nn.Linear(hidden * 3, hidden),
            nn.GELU(),
            nn.Linear(hidden, hidden),
        )
        self.update_mlp = nn.Sequential(
            nn.Linear(hidden * 2, hidden),
            nn.GELU(),
            nn.Linear(hidden, 2),  # Δlat, Δlon correction
            nn.Tanh(),
        )

    def forward(
        self,
        node_feats: torch.Tensor,    # (N, node_dim)
        edge_index: torch.Tensor,    # (2, E) — sender, receiver pairs
        edge_feats: torch.Tensor,    # (E, edge_dim)
    ) -> torch.Tensor:               # (N, 2) — corrections
        N = node_feats.size(0)
        h_nodes = self.node_enc(node_feats)     # (N, hidden)
        h_edges = self.edge_enc(edge_feats)     # (E, hidden)

        # Message passing
        src, dst = edge_index[0], edge_index[1]
        msgs = self.msg_mlp(
            torch.cat([h_nodes[src], h_nodes[dst], h_edges], dim=-1)
        )  # (E, hidden)

        # Aggregate (sum)
        agg = torch.zeros(N, h_nodes.size(-1), device=node_feats.device)
        agg.index_add_(0, dst, msgs)

        # Update nodes
        corrections = self.update_mlp(torch.cat([h_nodes, agg], dim=-1))  # (N, 2)
        return corrections * 1e-4  # Small corrections in degrees


# ── Trajectory Predictor ──────────────────────────────────────

class TrajectoryPredictor:
    """
    High-level trajectory prediction for DRISHTI-AI.

    Combines Kalman Filters (per-entity) with optional GNN correction
    for multi-entity scenarios.
    """

    def __init__(self):
        self._trackers: Dict[str, KalmanTracker] = {}
        self._states: Dict[str, TrackState] = {}
        self._gnn = TrajectoryGNN().to(DEVICE).eval()

    def _get_or_create_tracker(self, entity_id: str, entity_type: str = "ground") -> KalmanTracker:
        if entity_id not in self._trackers:
            self._trackers[entity_id] = KalmanTracker(entity_type=entity_type)
            self._states[entity_id] = TrackState(entity_id=entity_id)
            logger.debug(f"New tracker created for entity {entity_id} (type={entity_type})")
        return self._trackers[entity_id]

    def update(
        self,
        entity_id: str,
        lat: float,
        lon: float,
        entity_type: str = "ground",
        timestamp: Optional[str] = None,
    ) -> TrajectoryPrediction:
        """
        Update tracker with a new position observation.

        Args:
            entity_id: Unique entity identifier (ICAO24, MMSI, or detection ID).
            lat, lon:  Observed position.
            entity_type: 'ground' | 'air' | 'maritime'
            timestamp:  ISO8601 timestamp (defaults to now).

        Returns:
            TrajectoryPrediction with 5/10/15-minute forecasts.
        """
        tracker = self._get_or_create_tracker(entity_id, entity_type)
        state = self._states[entity_id]
        ts = timestamp or datetime.now(timezone.utc).isoformat()

        filtered = tracker.update(lat, lon)
        state.positions.append((filtered[0], filtered[1]))
        state.velocities.append((filtered[2], filtered[3]))
        state.timestamps.append(ts)
        state.last_updated = ts

        return self.predict(entity_id)

    def predict(self, entity_id: str) -> Optional[TrajectoryPrediction]:
        """
        Generate 5/10/15-minute predictions for an entity.

        Args:
            entity_id: Entity to predict.

        Returns:
            TrajectoryPrediction, or None if entity not tracked.
        """
        if entity_id not in self._trackers:
            return None

        tracker = self._trackers[entity_id]
        state = self._states[entity_id]

        if not state.positions:
            return None

        cur_lat, cur_lon = state.positions[-1]

        # Predict: 30s per step → 5min=10 steps, 10min=20, 15min=30
        p5_lat, p5_lon, unc5 = tracker.predict(steps=10)
        p10_lat, p10_lon, unc10 = tracker.predict(steps=20)
        p15_lat, p15_lon, unc15 = tracker.predict(steps=30)

        # Compute heading and speed from recent velocity
        vel = state.velocities[-1] if state.velocities else (0, 0)
        v_lat, v_lon = vel
        speed_mps = float(np.sqrt((v_lat * 111_000)**2 + (v_lon * 111_000 * np.cos(np.radians(cur_lat)))**2))
        heading = float(np.degrees(np.arctan2(v_lon, v_lat))) % 360 if speed_mps > 0.1 else None

        return TrajectoryPrediction(
            entity_id=entity_id,
            current=(cur_lat, cur_lon),
            predicted_5min=(p5_lat, p5_lon),
            predicted_10min=(p10_lat, p10_lon),
            predicted_15min=(p15_lat, p15_lon),
            uncertainty_m=unc5,
            heading_deg=heading,
            speed_mps=speed_mps,
        )

    def predict_multi_entity(
        self, entity_ids: List[str]
    ) -> Dict[str, TrajectoryPrediction]:
        """
        Predict trajectories for multiple entities simultaneously,
        using GNN to model entity-entity interactions.

        Returns dict mapping entity_id → TrajectoryPrediction.
        """
        valid = [eid for eid in entity_ids if eid in self._trackers and self._states[eid].positions]
        if not valid:
            return {}
        if len(valid) == 1:
            pred = self.predict(valid[0])
            return {valid[0]: pred} if pred else {}

        # Build node feature matrix
        node_feats = []
        for eid in valid:
            s = self._states[eid]
            pos = s.positions[-1]
            vel = s.velocities[-1] if s.velocities else (0, 0)
            node_feats.append([
                pos[0] / 90.0,   # normalised lat
                pos[1] / 180.0,  # normalised lon
                vel[0] * 1e4,
                vel[1] * 1e4,
                0, 0, 0, 0,      # placeholder type embedding
            ])

        node_t = torch.tensor(node_feats, dtype=torch.float32, device=DEVICE)

        # Fully-connected edges
        N = len(valid)
        src, dst, edge_feats = [], [], []
        for i in range(N):
            for j in range(N):
                if i == j:
                    continue
                pi, pj = self._states[valid[i]].positions[-1], self._states[valid[j]].positions[-1]
                dist = float(np.sqrt((pi[0]-pj[0])**2 + (pi[1]-pj[1])**2)) * 111.0  # km
                rel_hdg = float(np.degrees(np.arctan2(pj[1]-pi[1], pj[0]-pi[0]))) / 360.0
                src.append(i); dst.append(j)
                edge_feats.append([dist / 1000.0, rel_hdg, 0, 0])

        edge_idx = torch.tensor([src, dst], dtype=torch.long, device=DEVICE)
        edge_t = torch.tensor(edge_feats, dtype=torch.float32, device=DEVICE)

        with torch.no_grad():
            corrections = self._gnn(node_t, edge_idx, edge_t).cpu().numpy()

        results = {}
        for idx, eid in enumerate(valid):
            pred = self.predict(eid)
            if pred and pred.predicted_5min:
                # Apply GNN correction to 5-minute prediction
                dlat, dlon = corrections[idx]
                pred.predicted_5min = (pred.predicted_5min[0] + dlat, pred.predicted_5min[1] + dlon)
            if pred:
                results[eid] = pred

        return results


if __name__ == "__main__":
    logger.info("Testing Kalman + GNN trajectory predictor...")
    predictor = TrajectoryPredictor()

    # Simulate an aircraft moving NE over Ladakh
    lat, lon = 34.0, 76.0
    for i in range(20):
        lat += 0.01; lon += 0.015
        pred = predictor.update(f"test-aircraft-1", lat, lon, entity_type="air")

    print(f"Current:    ({pred.current[0]:.4f}, {pred.current[1]:.4f})")
    print(f"5-min pred: ({pred.predicted_5min[0]:.4f}, {pred.predicted_5min[1]:.4f})")
    print(f"10-min pred: ({pred.predicted_10min[0]:.4f}, {pred.predicted_10min[1]:.4f})")
    print(f"15-min pred: ({pred.predicted_15min[0]:.4f}, {pred.predicted_15min[1]:.4f})")
    print(f"Speed: {pred.speed_mps:.1f} m/s | Heading: {pred.heading_deg:.1f}°")
    print(f"Uncertainty: ±{pred.uncertainty_m:.0f}m")
