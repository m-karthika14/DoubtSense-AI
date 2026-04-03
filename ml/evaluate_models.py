from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Optional, Tuple

import sys

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from pathlib import Path

if __package__ in (None, ""):
    # Allow: python ml/evaluate_models.py
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))

from ml.utils import clamp01, load_labeled_dataset


@dataclass(frozen=True)
class Metrics:
    accuracy: float
    precision: float
    recall: float
    f1: float
    tpr: float
    fpr: float
    detection_accuracy: float
    cm: np.ndarray

    @property
    def tn_fp_fn_tp(self) -> Tuple[int, int, int, int]:
        tn, fp, fn, tp = self.cm.ravel()
        return int(tn), int(fp), int(fn), int(tp)


def build_lr(random_state: int) -> Pipeline:
    return Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "lr",
                LogisticRegression(
                    max_iter=1000,
                    solver="lbfgs",
                    random_state=random_state,
                ),
            ),
        ]
    )


def build_rf(random_state: int) -> RandomForestClassifier:
    return RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=2,
        random_state=random_state,
        n_jobs=-1,
    )


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Metrics:
    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    tpr = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0

    # Detection Accuracy is same as overall accuracy here.
    det_acc = acc

    return Metrics(
        accuracy=acc,
        precision=prec,
        recall=rec,
        f1=f1,
        tpr=tpr,
        fpr=fpr,
        detection_accuracy=det_acc,
        cm=cm,
    )


def _parse_sample(sample: str) -> np.ndarray:
    parts = [p.strip() for p in sample.split(",")]
    if len(parts) != 5:
        raise ValueError("--sample must have exactly 5 comma-separated numbers")
    vals = [float(p) for p in parts]
    if not all(np.isfinite(vals)):
        raise ValueError("--sample contains non-finite values")
    return np.asarray([vals], dtype=np.float64)


def _confusion_yesno(prob: float, threshold: float) -> str:
    return "YES" if prob > threshold else "NO"


def print_block(name: str, metrics: Metrics, sample_prob: Optional[float], threshold: float) -> None:
    print(f"========== {name} ==========")
    print(f"Accuracy: {metrics.accuracy:.2f}")
    print(f"Precision: {metrics.precision:.2f}")
    print(f"Recall: {metrics.recall:.2f}")
    print(f"F1 Score: {metrics.f1:.2f}")
    print(f"TPR: {metrics.tpr:.2f}")
    print(f"FPR: {metrics.fpr:.2f}")
    print(f"Detection Accuracy: {metrics.detection_accuracy:.2f}")

    if sample_prob is None:
        print("Confusion: N/A (no --sample provided)")
    else:
        print(f"Confusion: {_confusion_yesno(sample_prob, threshold)}")
        print(f"Score: {clamp01(sample_prob):.2f}")

    tn, fp, fn, tp = metrics.tn_fp_fn_tp
    print("Confusion Matrix:")
    print(f"[[{tn} {fp}]\n [{fn} {tp}]]")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate confusion detection models (LR, RF, Combined)")
    parser.add_argument("--data", default="project/data/behavior_data.csv")
    parser.add_argument("--threshold", type=float, default=0.6, help="Decision threshold for combined (and sample display)")
    parser.add_argument("--lr-weight", type=float, default=0.4, help="Weight for LR probability in the ensemble")
    parser.add_argument("--rf-weight", type=float, default=0.6, help="Weight for RF probability in the ensemble")
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--sample", type=str, default=None, help="Optional 5-feature vector: p,s,r,a,f")
    args = parser.parse_args()

    ds = load_labeled_dataset(args.data)
    X_train, X_test, y_train, y_test = train_test_split(
        ds.X, ds.y, test_size=args.test_size, random_state=args.random_state, stratify=ds.y
    )

    lr = build_lr(args.random_state)
    rf = build_rf(args.random_state)

    lr.fit(X_train, y_train)
    rf.fit(X_train, y_train)

    lr_prob = lr.predict_proba(X_test)[:, 1]
    rf_prob = rf.predict_proba(X_test)[:, 1]

    # Individual model hard predictions (standard 0.5 threshold)
    y_pred_lr = (lr_prob >= 0.5).astype(int)
    y_pred_rf = (rf_prob >= 0.5).astype(int)

    w_sum = float(args.lr_weight + args.rf_weight)
    if not np.isfinite(w_sum) or w_sum <= 0:
        lr_w, rf_w = 0.4, 0.6
    else:
        lr_w = float(args.lr_weight / w_sum)
        rf_w = float(args.rf_weight / w_sum)

    combined_prob = (lr_w * lr_prob) + (rf_w * rf_prob)
    y_pred_combined = (combined_prob > args.threshold).astype(int)

    lr_metrics = compute_metrics(y_test, y_pred_lr)
    rf_metrics = compute_metrics(y_test, y_pred_rf)
    comb_metrics = compute_metrics(y_test, y_pred_combined)

    sample_X = _parse_sample(args.sample) if args.sample else None
    lr_sample_prob = float(lr.predict_proba(sample_X)[0, 1]) if sample_X is not None else None
    rf_sample_prob = float(rf.predict_proba(sample_X)[0, 1]) if sample_X is not None else None
    comb_sample_prob = (
        float((lr_w * lr_sample_prob) + (rf_w * rf_sample_prob)) if sample_X is not None else None
    )

    print_block("Logistic Regression", lr_metrics, lr_sample_prob, args.threshold)
    print_block("Random Forest", rf_metrics, rf_sample_prob, args.threshold)
    print(f"[ensemble] lr_weight={lr_w:.2f} rf_weight={rf_w:.2f} threshold={args.threshold:.2f}")
    print()

    print_block("Combined Model", comb_metrics, comb_sample_prob, args.threshold)


if __name__ == "__main__":
    main()
