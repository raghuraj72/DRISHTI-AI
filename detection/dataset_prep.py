"""
DRISHTI-AI — Dataset Preparation
Downloads and preprocesses VIRAT v2, DOTA v2, and UCF-Crime datasets
for YOLOv8 fine-tuning on border surveillance object detection.
"""
from __future__ import annotations

import json
import os
import random
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from loguru import logger
import yaml

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
MERGED_DIR = DATA_DIR / "merged_dataset"
MERGED_DIR.mkdir(parents=True, exist_ok=True)

# DRISHTI target classes
CLASS_MAP = {
    "person":          0,
    "vehicle":         1,
    "aircraft":        2,
    "vessel":          3,
    "group_of_people": 4,
    "bicycle":         5,
    "motorcycle":      6,
}

# DOTA v2 class → DRISHTI class mapping
DOTA_TO_DRISHTI = {
    "plane":           "aircraft",
    "ship":            "vessel",
    "small-vehicle":   "vehicle",
    "large-vehicle":   "vehicle",
    "helicopter":      "aircraft",
    "roundabout":      None,
    "soccer-ball-field": None,
    "tennis-court":    None,
    "swimming-pool":   None,
    "harbor":          None,
    "ground-track-field": None,
    "baseball-diamond": None,
    "storage-tank":    None,
    "basketball-court": None,
    "bridge":          None,
}

# VIRAT v2 activity → DRISHTI class mapping
VIRAT_TO_DRISHTI = {
    "person_walks":     "person",
    "person_runs":      "person",
    "vehicle_moving":   "vehicle",
    "vehicle_turning":  "vehicle",
    "person_bicycling": "bicycle",
    "person_riding":    "motorcycle",
}


class DatasetPreparation:
    """
    Prepares the merged training dataset for DRISHTI-AI.

    Steps:
    1. Download DOTA v2 sample splits (public release via captain-whu.github.io)
    2. Download UCF-Crime sample frames (for person/group detection)
    3. Convert all annotation formats to YOLO format
    4. Split into train/val/test (70/20/10)
    5. Write dataset.yaml for Ultralytics training

    Note: Full VIRAT dataset requires academic registration at viratdata.org.
          This script sets up the publicly available samples and provides
          instructions for adding the full dataset.
    """

    def __init__(self, data_dir: Path = MERGED_DIR):
        self.data_dir = data_dir
        self.images_dir = data_dir / "images"
        self.labels_dir = data_dir / "labels"
        for split in ("train", "val", "test"):
            (self.images_dir / split).mkdir(parents=True, exist_ok=True)
            (self.labels_dir / split).mkdir(parents=True, exist_ok=True)

    def download_dota_sample(self) -> Path:
        """
        Download DOTA v2 sample set from the official GitHub release.
        The sample contains 100 annotated satellite images.

        Full dataset: Register at https://captain-whu.github.io/DOTA/dataset.html
        """
        sample_url = "https://github.com/captain-whu/DOTA/archive/refs/heads/main.zip"
        out_zip = DATA_DIR / "dota_sample.zip"
        out_dir = DATA_DIR / "dota"

        if out_dir.exists():
            logger.info("DOTA sample already downloaded.")
            return out_dir

        logger.info("Downloading DOTA v2 sample...")
        try:
            resp = requests.get(sample_url, stream=True, timeout=60)
            resp.raise_for_status()
            with open(out_zip, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            shutil.unpack_archive(out_zip, DATA_DIR)
            out_zip.unlink()
            logger.info(f"DOTA sample extracted to {DATA_DIR}")
        except Exception as e:
            logger.warning(f"DOTA download failed: {e}. Please download manually.")

        return out_dir

    def download_ucf_crime_frames(self) -> Path:
        """
        UCF-Crime is available via the CRCV lab at UCF.
        Full dataset: https://www.crcv.ucf.edu/research/real-world-anomaly-detection/
        This function sets up the directory structure and downloads the public README.
        """
        ucf_dir = DATA_DIR / "ucf_crime"
        ucf_dir.mkdir(exist_ok=True)

        readme = ucf_dir / "DOWNLOAD_INSTRUCTIONS.txt"
        if not readme.exists():
            readme.write_text(
                "UCF-Crime Dataset\n"
                "=================\n"
                "Request access at: https://www.crcv.ucf.edu/research/real-world-anomaly-detection/\n\n"
                "After downloading, place video frames in:\n"
                "  data/ucf_crime/frames/\n"
                "with subdirs: Fighting/, Robbery/, Stealing/, Vandalism/, Normal/\n\n"
                "Then re-run dataset_prep.py to convert to YOLO format.\n"
            )
        logger.info(f"UCF-Crime setup: {readme}")
        return ucf_dir

    def convert_dota_annotation(
        self, annotation_text: str, img_w: int, img_h: int
    ) -> List[str]:
        """
        Convert DOTA format annotation to YOLO format.

        DOTA format: x1 y1 x2 y2 x3 y3 x4 y4 class difficult
        YOLO format: class cx cy w h (normalised 0–1)

        Returns:
            List of YOLO-format annotation lines.
        """
        yolo_lines = []
        for line in annotation_text.strip().split("\n"):
            parts = line.strip().split()
            if len(parts) < 9:
                continue
            try:
                coords = list(map(float, parts[:8]))
                class_name = parts[8].lower()
            except (ValueError, IndexError):
                continue

            drishti_class = DOTA_TO_DRISHTI.get(class_name)
            if drishti_class is None:
                continue

            cls_id = CLASS_MAP.get(drishti_class)
            if cls_id is None:
                continue

            # Get bounding box from polygon corners
            xs = coords[0::2]
            ys = coords[1::2]
            x_min, x_max = min(xs), max(xs)
            y_min, y_max = min(ys), max(ys)

            cx = ((x_min + x_max) / 2) / img_w
            cy = ((y_min + y_max) / 2) / img_h
            w  = (x_max - x_min) / img_w
            h  = (y_max - y_min) / img_h

            # Clamp to [0, 1]
            cx, cy = max(0, min(1, cx)), max(0, min(1, cy))
            w,  h  = max(0, min(1, w)),  max(0, min(1, h))

            if w > 0 and h > 0:
                yolo_lines.append(f"{cls_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

        return yolo_lines

    def process_dota_directory(self, dota_dir: Path) -> int:
        """
        Process all DOTA annotation files in a directory.
        Returns count of converted images.
        """
        ann_dir = dota_dir / "labelTxt-v1.0" / "labelTxt"
        img_dir = dota_dir / "images"
        if not ann_dir.exists() or not img_dir.exists():
            logger.warning(f"DOTA directory structure not found in {dota_dir}")
            return 0

        count = 0
        for ann_file in sorted(ann_dir.glob("*.txt")):
            stem = ann_file.stem
            img_file = img_dir / f"{stem}.png"
            if not img_file.exists():
                img_file = img_dir / f"{stem}.jpg"
            if not img_file.exists():
                continue

            # Read image size
            from PIL import Image
            try:
                with Image.open(img_file) as img:
                    img_w, img_h = img.size
            except Exception:
                continue

            yolo_lines = self.convert_dota_annotation(ann_file.read_text(), img_w, img_h)
            if not yolo_lines:
                continue

            # Assign to split
            split = self._assign_split()
            shutil.copy(img_file, self.images_dir / split / img_file.name)
            (self.labels_dir / split / f"{stem}.txt").write_text("\n".join(yolo_lines))
            count += 1

        logger.info(f"Converted {count} DOTA images to YOLO format")
        return count

    def _assign_split(self) -> str:
        """Randomly assign to train/val/test with 70/20/10 ratio."""
        r = random.random()
        if r < 0.70: return "train"
        elif r < 0.90: return "val"
        return "test"

    def write_dataset_yaml(self) -> Path:
        """
        Write the Ultralytics dataset.yaml file.

        Returns:
            Path to the written YAML file.
        """
        yaml_path = MERGED_DIR / "dataset.yaml"
        config = {
            "path":   str(MERGED_DIR.resolve()),
            "train":  "images/train",
            "val":    "images/val",
            "test":   "images/test",
            "nc":     len(CLASS_MAP),
            "names":  [k for k, _ in sorted(CLASS_MAP.items(), key=lambda x: x[1])],
        }
        with open(yaml_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False)
        logger.info(f"Dataset YAML written to: {yaml_path}")
        return yaml_path

    def count_samples(self) -> Dict[str, int]:
        """Count image samples per split."""
        return {
            split: len(list((self.images_dir / split).glob("*.png")) +
                        list((self.images_dir / split).glob("*.jpg")))
            for split in ("train", "val", "test")
        }

    def run(self):
        """Full dataset preparation pipeline."""
        logger.info("Starting DRISHTI-AI dataset preparation...")

        # Step 1: Download datasets
        dota_dir = self.download_dota_sample()
        self.download_ucf_crime_frames()

        # Step 2: Convert annotations
        count = 0
        if dota_dir.exists():
            count += self.process_dota_directory(dota_dir)

        # Step 3: Write YAML
        yaml_path = self.write_dataset_yaml()

        # Summary
        splits = self.count_samples()
        logger.info(f"Dataset ready: train={splits['train']}, val={splits['val']}, test={splits['test']}")
        logger.info(f"Total: {sum(splits.values())} images | YAML: {yaml_path}")

        if sum(splits.values()) < 100:
            logger.warning(
                "\n⚠️  Dataset too small for meaningful training (<100 images).\n"
                "Please download the full datasets:\n"
                "  • DOTA v2: https://captain-whu.github.io/DOTA/dataset.html\n"
                "  • VIRAT v2: https://viratdata.org (academic registration)\n"
                "  • UCF-Crime: https://www.crcv.ucf.edu/research/real-world-anomaly-detection/\n"
                "Place images + labels in data/merged_dataset/ and re-run this script."
            )

        return yaml_path


if __name__ == "__main__":
    prep = DatasetPreparation()
    prep.run()
