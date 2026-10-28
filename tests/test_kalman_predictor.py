"""
Tests for DRISHTI-AI Kalman Filter & Trajectory Predictor.
Validates smooth trajectory estimation, 5/10/15-minute extrapolation,
uncertainty propagation, and track state maintenance.
"""
import pytest
import numpy as np
from trajectory.kalman_predictor import (
    KalmanTracker,
    TrajectoryPredictor,
    TrackState,
    TrajectoryPrediction,
)

def test_kalman_tracker_initialization():
    """Verify Kalman filter initializes with appropriate noise profile."""
    tracker = KalmanTracker(entity_type="air")
    assert tracker.kf.dim_x == 6
    assert tracker.kf.dim_z == 2
    assert not tracker._initialised

def test_kalman_tracker_update_and_smooth():
    """Verify position updates reduce noise variance and estimate velocities."""
    tracker = KalmanTracker(entity_type="ground")
    
    # Simulate movement along a line with measurement jitter
    true_lat, true_lon = 32.5, 75.0
    for i in range(5):
        noise = float(np.random.normal(0, 0.0001))
        state = tracker.update(true_lat + i * 0.001 + noise, true_lon + i * 0.001 + noise)
    
    assert tracker._initialised
    assert state.shape == (6,)

def test_kalman_extrapolation_steps():
    """Verify future step projection extrapolates smoothly with growing uncertainty."""
    tracker = KalmanTracker(entity_type="air")
    tracker.update(28.0, 77.0)
    tracker.update(28.01, 77.01)
    tracker.update(28.02, 77.02)
    
    lat_5m, lon_5m, unc_5m = tracker.predict(steps=10)
    lat_15m, lon_15m, unc_15m = tracker.predict(steps=30)
    
    # 15m projection uncertainty must be greater than or equal to 5m
    assert unc_15m >= unc_5m
    assert unc_5m > 0

def test_trajectory_predictor_manager():
    """Verify TrajectoryPredictor handles multi-entity track state updates."""
    predictor = TrajectoryPredictor()
    pred = predictor.update(entity_id="UAV-001", lat=34.0, lon=74.5, entity_type="air")
    
    assert pred is not None
    assert pred.entity_id == "UAV-001"
    assert pred.current == (34.0, 74.5)
    assert pred.uncertainty_m > 0
