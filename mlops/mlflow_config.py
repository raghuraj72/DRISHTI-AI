"""
DRISHTI-AI MLOps Configuration
MLflow experiment tracking + model registry management
"""
import os
import mlflow
import mlflow.pytorch
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
EXPERIMENT_NAME = os.getenv("MLFLOW_EXPERIMENT_NAME", "drishti-ai-detection")


def setup_mlflow() -> str:
    """
    Configure MLflow tracking server and create experiment if it doesn't exist.

    Returns:
        str: The experiment ID.
    """
    mlflow.set_tracking_uri(TRACKING_URI)
    experiment = mlflow.get_experiment_by_name(EXPERIMENT_NAME)
    if experiment is None:
        experiment_id = mlflow.create_experiment(
            EXPERIMENT_NAME,
            tags={
                "project": "DRISHTI-AI",
                "challenge": "RYIC 2026",
                "team": "DTU",
            },
        )
        logger.info(f"Created MLflow experiment: {EXPERIMENT_NAME} (ID: {experiment_id})")
    else:
        experiment_id = experiment.experiment_id
        logger.info(f"Using MLflow experiment: {EXPERIMENT_NAME} (ID: {experiment_id})")
    mlflow.set_experiment(EXPERIMENT_NAME)
    return experiment_id


def log_model_card(
    model_name: str,
    architecture: str,
    dataset: str,
    input_shape: str,
    output_shape: str,
    metrics: dict,
    notes: str = "",
) -> None:
    """
    Log a structured model card to the active MLflow run.

    Args:
        model_name: Human-readable model name.
        architecture: Model architecture description.
        dataset: Training dataset description.
        input_shape: Input tensor shape description.
        output_shape: Output tensor/format description.
        metrics: Dict of metric_name → value to log.
        notes: Additional notes or limitations.
    """
    mlflow.set_tags(
        {
            "model.name": model_name,
            "model.architecture": architecture,
            "model.dataset": dataset,
            "model.input_shape": input_shape,
            "model.output_shape": output_shape,
            "model.notes": notes,
        }
    )
    for metric_name, value in metrics.items():
        mlflow.log_metric(metric_name, value)
    logger.info(f"Logged model card for '{model_name}' with metrics: {metrics}")


if __name__ == "__main__":
    eid = setup_mlflow()
    print(f"MLflow ready. Experiment ID: {eid}")
    print(f"Open dashboard at: {TRACKING_URI}")
