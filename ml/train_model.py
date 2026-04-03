from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

if __package__ in (None, ""):
    # Allow: python ml/train_model.py
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))

from ml.utils import load_labeled_dataset, ensure_dir


def build_lr(random_state: int) -> Pipeline:
    # StandardScaler is important for LR stability.
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
    # Keep inference fast (bounded tree depth).
    return RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=2,
        random_state=random_state,
        n_jobs=-1,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train confusion models (LR + RF) from behavior_data.csv")
    parser.add_argument("--data", default="project/data/behavior_data.csv", help="Path to CSV dataset")
    parser.add_argument("--artifacts-dir", default="ml/artifacts", help="Output directory for saved models")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()

    ds = load_labeled_dataset(args.data)
    X_train, X_test, y_train, y_test = train_test_split(
        ds.X, ds.y, test_size=args.test_size, random_state=args.random_state, stratify=ds.y
    )

    lr = build_lr(args.random_state)
    rf = build_rf(args.random_state)

    lr.fit(X_train, y_train)
    rf.fit(X_train, y_train)

    out_dir = ensure_dir(args.artifacts_dir)
    joblib.dump(lr, out_dir / "logistic_regression.joblib")
    joblib.dump(rf, out_dir / "random_forest.joblib")

    lr_acc = float(lr.score(X_test, y_test))
    rf_acc = float(rf.score(X_test, y_test))
    print("Saved artifacts to:", str(out_dir))
    print(f"LR test accuracy: {lr_acc:.2f}")
    print(f"RF test accuracy: {rf_acc:.2f}")


if __name__ == "__main__":
    main()
