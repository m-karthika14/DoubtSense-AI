# DoubtSense ML (Confusion Detection)

This folder contains the confusion detection engine using two models:
- Logistic Regression
- Random Forest

The ML input is ONLY numeric features:
`[pauseTime, scrollSpeed, reReadCount, attentionScore, fatigueScore]`

## Dataset

CSV path: `project/data/behavior_data.csv`

Header (must match exactly):

```
timestamp,userId,pauseTime,scrollSpeed,reReadCount,attentionScore,fatigueScore,label
```

- `label`: `0` (no confusion) or `1` (confusion)

## Install

```bash
pip install -r ml/requirements.txt
```

## Train

```bash
python -m ml.train_model --data project/data/behavior_data.csv
```

Artifacts are saved under `ml/artifacts/`.

## Run API

```bash
uvicorn ml.ml_service:app --host 0.0.0.0 --port 8000
```

POST `/predict`

```json
{ "features": [pauseTime, scrollSpeed, reReadCount, attention, fatigue] }
```

Response:

```json
{ "lr_prob": 0.72, "rf_prob": 0.81 }
```

## Ensemble (Backend)

The backend computes a weighted ensemble:

`raw_final_score = (0.4 * lr_prob) + (0.6 * rf_prob)`

Then it applies last-3 smoothing per user and thresholds the smoothed score.

You can tune these via environment variables:
- `CONFUSION_LR_WEIGHT` (default `0.4`)
- `CONFUSION_RF_WEIGHT` (default `0.6`)
- `CONFUSION_THRESHOLD` (default `0.6`)

## Evaluate

```bash
python -m ml.evaluate_models --data project/data/behavior_data.csv --threshold 0.6 --sample "10,120,2,0.4,0.7"
```

Weighted combined evaluation:

```bash
python -m ml.evaluate_models --data project/data/behavior_data.csv --threshold 0.6 --lr-weight 0.4 --rf-weight 0.6
```
