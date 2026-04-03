from __future__ import annotations

import os
from pathlib import Path
from typing import List

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ml.utils import clamp01


ARTIFACTS_DIR = Path(os.environ.get("ML_ARTIFACTS_DIR", "ml/artifacts"))


class PredictRequest(BaseModel):
    features: List[float] = Field(..., description="[pauseTime, scrollSpeed, reReadCount, attention, fatigue]")


class PredictResponse(BaseModel):
    lr_prob: float
    rf_prob: float


def _validate_features(features: List[float]) -> np.ndarray:
    if not isinstance(features, list) or len(features) != 5:
        raise HTTPException(status_code=422, detail="features must be an array of 5 numbers")

    vals = []
    for x in features:
        try:
            v = float(x)
        except Exception:
            raise HTTPException(status_code=422, detail="features must contain numeric values")
        if not np.isfinite(v):
            raise HTTPException(status_code=422, detail="features must contain only finite numbers")
        vals.append(v)

    return np.asarray([vals], dtype=np.float64)


app = FastAPI(title="DoubtSense Confusion ML", version="1.0")


@app.on_event("startup")
def _load_models() -> None:
    global lr_model, rf_model

    lr_path = ARTIFACTS_DIR / "logistic_regression.joblib"
    rf_path = ARTIFACTS_DIR / "random_forest.joblib"

    if not lr_path.exists() or not rf_path.exists():
        raise RuntimeError(
            "Missing model artifacts. Train first with: python ml/train_model.py --data project/data/behavior_data.csv"
        )

    lr_model = joblib.load(lr_path)
    rf_model = joblib.load(rf_path)


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    X = _validate_features(req.features)

    try:
        lr_prob = float(lr_model.predict_proba(X)[0][1])
        rf_prob = float(rf_model.predict_proba(X)[0][1])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"prediction error: {e}")

    return PredictResponse(lr_prob=clamp01(lr_prob), rf_prob=clamp01(rf_prob))
