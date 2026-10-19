"""
DRISHTI-AI — YOLOv8 Training Pipeline
Fine-tunes YOLOv8m on merged VIRAT + DOTA v2 dataset for border surveillance
object detection. Tracks all experiments with MLflow.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import mlflow
import torch
import yaml
from dotenv import load_dotenv
from loguru import logger
from ultralytics import YOLO

load_dotenv()

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
MLFLOW_EXPERIMENT = os.getenv("MLFLOW_EXPERIMENT_NAME", "drishti-ai-detection")
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
MODEL_DIR = Path(os.getenv("MODEL_DIR", "./models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

DATASET_YAML = DATA_DIR / "merged_dataset" / "dataset.yaml"
BASE_WEIGHTS = "yolov8m.pt"
OUTPUT_MODEL = MODEL_DIR / "drishti_yolo_best.pt"

# Training hyperparameters
TRAIN_CONFIG = {
    "epochs": 100,
    "imgsz": 640,
    "batch": 16,
    "optimizer": "AdamW",
    "lr0": 0.001,
    "lrf": 0.01,
    "momentum": 0.937,
    "weight_decay": 0.0005,
    "warmup_epochs": 3,
    "mosaic": 1.0,
    "fliplr": 0.5,
    "hsv_s": 0.7,
    "scale": 0.5,
    "workers": 4,
    "device": "cuda" if torch.cuda.is_available() else "cpu",
    "project": str(MODEL_DIR / "runs"),
    "name": "drishti_yolov8m",
    "save_period": 10,
    "patience": 20,     # Early stopping
    "plots": True,
}


class DrishtiTrainer:
    """
    Fine-tunes YOLOv8m on the merged DRISHTI dataset (VIRAT + DOTA v2 + UCF-Crime).

    Classes:
        0: person
        1: vehicle
        2: aircraft
        3: vessel
        4: group_of_people
        5: bicycle
        6: motorcycle

    Usage:
        trainer = DrishtiTrainer()
        results = trainer.train()
        trainer.export_onnx()
    """

    def __init__(self, dataset_yaml: Path = DATASET_YAML):
        self.dataset_yaml = dataset_yaml
        self.model: YOLO | None = None
        mlflow.set_tracking_uri(MLFLOW_URI)
        mlflow.set_experiment(MLFLOW_EXPERIMENT)

    def _check_dataset(self):
        """Verify dataset YAML exists and has correct structure."""
        if not self.dataset_yaml.exists():
            logger.error(
                f"Dataset YAML not found: {self.dataset_yaml}\n"
                f"Run dataset_prep.py first to download and prepare datasets."
            )
            sys.exit(1)

        with open(self.dataset_yaml) as f:
            config = yaml.safe_load(f)

        required_keys = ["path", "train", "val", "nc", "names"]
        for key in required_keys:
            if key not in config:
                raise ValueError(f"dataset.yaml missing required key: '{key}'")

        logger.info(f"Dataset: {config['nc']} classes | {config['names']}")
        logger.info(f"Train: {config['train']} | Val: {config['val']}")

    def train(self) -> dict:
        """
        Run the full training pipeline with MLflow tracking.

        Returns:
            dict: Training results metrics.
        """
        self._check_dataset()

        logger.info(f"Starting YOLOv8m training on {TRAIN_CONFIG['device'].upper()}")
        logger.info(f"Epochs: {TRAIN_CONFIG['epochs']} | Batch: {TRAIN_CONFIG['batch']}")

        self.model = YOLO(BASE_WEIGHTS)

        with mlflow.start_run(run_name="drishti_yolov8m_training"):
            # Log all hyperparameters
            mlflow.log_params(TRAIN_CONFIG)
            mlflow.log_param("base_weights", BASE_WEIGHTS)
            mlflow.log_param("dataset", str(self.dataset_yaml))

            # Run training
            results = self.model.train(
                data=str(self.dataset_yaml),
                **TRAIN_CONFIG,
            )

            # Extract and log metrics
            metrics = {}
            if hasattr(results, "results_dict"):
                metrics = {
                    "mAP50": results.results_dict.get("metrics/mAP50(B)", 0),
                    "mAP50_95": results.results_dict.get("metrics/mAP50-95(B)", 0),
                    "precision": results.results_dict.get("metrics/precision(B)", 0),
                    "recall": results.results_dict.get("metrics/recall(B)", 0),
                }
                for name, value in metrics.items():
                    mlflow.log_metric(name, value)

            # Save best model
            best_pt = Path(TRAIN_CONFIG["project"]) / TRAIN_CONFIG["name"] / "weights" / "best.pt"
            if best_pt.exists():
                import shutil
                shutil.copy(best_pt, OUTPUT_MODEL)
                mlflow.log_artifact(str(OUTPUT_MODEL), artifact_path="models")
                logger.info(f"Best model saved to: {OUTPUT_MODEL}")

            logger.info(f"Training complete. Metrics: {metrics}")
            return metrics

    def validate(self) -> dict:
        """Run validation on the best saved model."""
        if not OUTPUT_MODEL.exists():
            logger.error(f"No trained model found at {OUTPUT_MODEL}. Run train() first.")
            return {}

        model = YOLO(str(OUTPUT_MODEL))
        results = model.val(data=str(self.dataset_yaml))
        logger.info(f"Validation mAP50: {results.box.map50:.4f}")
        return {"mAP50": results.box.map50, "mAP50_95": results.box.map}

    def export_onnx(self, output_path: Optional[Path] = None) -> Path:
        """
        Export the trained model to ONNX format for edge deployment.

        Args:
            output_path: Optional custom output path for .onnx file.

        Returns:
            Path to the exported ONNX file.
        """
        if not OUTPUT_MODEL.exists():
            logger.error("No trained model found. Run train() first.")
            raise FileNotFoundError(f"Model not found: {OUTPUT_MODEL}")

        model = YOLO(str(OUTPUT_MODEL))
        onnx_path = output_path or MODEL_DIR / "drishti_yolo.onnx"

        model.export(
            format="onnx",
            imgsz=640,
            opset=12,
            dynamic=False,  # Static shape for edge deployment
            simplify=True,
        )
        logger.info(f"ONNX model exported: {onnx_path}")
        return onnx_path

    def log_to_mlflow(self, metrics: dict, run_name: str = "manual_log"):
        """Log metrics to an existing or new MLflow run."""
        with mlflow.start_run(run_name=run_name):
            for name, value in metrics.items():
                mlflow.log_metric(name, value)


if __name__ == "__main__":
    trainer = DrishtiTrainer()
    print(f"Device: {TRAIN_CONFIG['device']}")
    print(f"Dataset: {DATASET_YAML}")
    print(f"Output model: {OUTPUT_MODEL}")
    print("\nStarting training... (check MLflow at http://localhost:5000)")
    metrics = trainer.train()
    print(f"\n✅ Training complete: {metrics}")
    print("Exporting to ONNX for edge deployment...")
    trainer.export_onnx()
    print("✅ ONNX export complete.")
