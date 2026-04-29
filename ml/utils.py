from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

import numpy as np


CSV_HEADER = [
    "timestamp",
    "userId",
    "pauseTime",
    "scrollSpeed",
    "reReadCount",
    "attentionScore",
    "fatigueScore",
    "label",
]

FEATURE_COLUMNS = [
    "pauseTime",
    "scrollSpeed",
    "reReadCount",
    "attentionScore",
    "fatigueScore",
]


@dataclass(frozen=True)
class Dataset:
    X: np.ndarray  # shape: (n_samples, 5)
    y: np.ndarray  # shape: (n_samples,)
    user_ids: np.ndarray  # shape: (n_samples,)


def _require_columns(fieldnames: Iterable[str] | None) -> None:
    if not fieldnames:
        raise ValueError("CSV missing header")
    missing = [c for c in CSV_HEADER if c not in fieldnames]
    if missing:
        raise ValueError(f"CSV missing required columns: {missing}. Expected header: {CSV_HEADER}")


def load_labeled_dataset(csv_path: str | Path) -> Dataset:
    """Load X (5 numeric features) and y (0/1) from the project CSV.

    Notes:
    - Uses ONLY numeric features. Does NOT use topic.
    - Ignores timestamp + userId.
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    X_rows: List[List[float]] = []
    y_rows: List[int] = []
    user_ids: List[str] = []

    with path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        _require_columns(reader.fieldnames)

        for idx, row in enumerate(reader, start=2):
            # Label must be 0/1
            label_raw = (row.get("label") or "").strip()
            if label_raw not in {"0", "1"}:
                raise ValueError(f"Invalid label on line {idx}: {label_raw!r}. Must be 0 or 1.")
            y = int(label_raw)

            features: List[float] = []
            for col in FEATURE_COLUMNS:
                raw = (row.get(col) or "").strip()
                try:
                    val = float(raw)
                except ValueError as e:
                    raise ValueError(f"Invalid numeric value for {col} on line {idx}: {raw!r}") from e
                if not np.isfinite(val):
                    raise ValueError(f"Non-finite value for {col} on line {idx}: {val}")
                features.append(val)

            X_rows.append(features)
            y_rows.append(y)
            user_ids.append((row.get("userId") or "").strip())

    if not X_rows:
        raise ValueError("Dataset is empty (no rows)")

    X = np.asarray(X_rows, dtype=np.float64)
    y = np.asarray(y_rows, dtype=np.int64)
    g = np.asarray(user_ids, dtype=np.str_)

    if X.ndim != 2 or X.shape[1] != 5:
        raise ValueError(f"Unexpected feature shape: {X.shape}")

    return Dataset(X=X, y=y, user_ids=g)


def ensure_dir(path: str | Path) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return float(x)
