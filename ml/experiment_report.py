from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

from sklearn.base import BaseEstimator
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from ml.utils import Dataset, ensure_dir, load_labeled_dataset


@dataclass(frozen=True)
class ModelSpec:
    name: str
    estimator: BaseEstimator


@dataclass(frozen=True)
class Metrics:
    accuracy: float
    precision: float
    recall: float
    f1: float
    roc_auc: float
    cm: np.ndarray


def _as_float(x: Any) -> float:
    return float(x) if x is not None else float("nan")


def build_models(random_state: int) -> List[ModelSpec]:
    # Notes:
    # - LR + SVM get scaling.
    # - We use class_weight='balanced' where supported because the dataset can be imbalanced.
    lr = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "lr",
                LogisticRegression(
                    max_iter=2000,
                    solver="lbfgs",
                    penalty="l2",
                    C=1.0,
                    class_weight="balanced",
                    random_state=random_state,
                ),
            ),
        ]
    )

    rf = RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=2,
        random_state=random_state,
        n_jobs=-1,
        class_weight="balanced_subsample",
    )

    svm = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "svm",
                SVC(
                    kernel="rbf",
                    C=2.0,
                    gamma="scale",
                    probability=True,
                    class_weight="balanced",
                    random_state=random_state,
                ),
            ),
        ]
    )

    dt = DecisionTreeClassifier(
        max_depth=8,
        min_samples_leaf=2,
        random_state=random_state,
        class_weight="balanced",
    )

    mlp = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "mlp",
                MLPClassifier(
                    hidden_layer_sizes=(32, 16),
                    activation="relu",
                    solver="adam",
                    alpha=1e-4,
                    learning_rate_init=1e-3,
                    max_iter=2000,
                    early_stopping=True,
                    random_state=random_state,
                ),
            ),
        ]
    )

    # Full catalog (select via --models)
    return [
        ModelSpec("Logistic Regression", lr),
        ModelSpec("Random Forest", rf),
        ModelSpec("SVM (RBF)", svm),
        ModelSpec("Decision Tree", dt),
        ModelSpec("MLP", mlp),
    ]


def select_models(all_models: List[ModelSpec], keys: List[str]) -> List[ModelSpec]:
    key_map = {
        "lr": "Logistic Regression",
        "rf": "Random Forest",
        "svm": "SVM (RBF)",
        "dt": "Decision Tree",
        "mlp": "MLP",
    }

    wanted = [key_map[k] for k in keys if k in key_map]
    picked = [m for m in all_models if m.name in wanted]
    if not picked:
        raise ValueError("No valid models selected. Use --models lr,rf,svm[,dt,mlp]")
    return picked


def _predict_proba_pos(model: BaseEstimator, X: np.ndarray) -> np.ndarray:
    # Uniform interface for probability output
    if hasattr(model, "predict_proba"):
        p = model.predict_proba(X)
        return np.asarray(p)[:, 1]
    if hasattr(model, "decision_function"):
        # Map decision scores to [0,1] with a logistic; OK for ROC curves.
        s = np.asarray(model.decision_function(X))
        return 1.0 / (1.0 + np.exp(-s))
    # Fall back to hard predictions
    y = np.asarray(model.predict(X))
    return y.astype(np.float64)


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> Metrics:
    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))

    # ROC-AUC requires both classes present
    try:
        auc = float(roc_auc_score(y_true, y_prob))
    except Exception:
        auc = float("nan")

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return Metrics(accuracy=acc, precision=prec, recall=rec, f1=f1, roc_auc=auc, cm=cm)


def _aggregate(metrics: List[Metrics]) -> Dict[str, Tuple[float, float]]:
    keys = ["accuracy", "precision", "recall", "f1", "roc_auc"]
    out: Dict[str, Tuple[float, float]] = {}
    for k in keys:
        vals = np.asarray([getattr(m, k) for m in metrics], dtype=np.float64)
        vals = vals[np.isfinite(vals)]
        if vals.size == 0:
            out[k] = (float("nan"), float("nan"))
        else:
            out[k] = (float(vals.mean()), float(vals.std(ddof=1) if vals.size > 1 else 0.0))
    return out


def evaluate_groupkfold(ds: Dataset, models: List[ModelSpec], n_splits: int, random_state: int) -> Dict[str, Any]:
    # GroupKFold prevents participant leakage.
    unique_groups = np.unique(ds.user_ids)
    if unique_groups.size < 2:
        raise ValueError("Need at least 2 unique userIds for group-based evaluation")
    if n_splits > unique_groups.size:
        n_splits = int(unique_groups.size)

    gkf = GroupKFold(n_splits=n_splits)
    results: Dict[str, Any] = {}

    for spec in models:
        fold_metrics: List[Metrics] = []
        for train_idx, test_idx in gkf.split(ds.X, ds.y, groups=ds.user_ids):
            X_train, X_test = ds.X[train_idx], ds.X[test_idx]
            y_train, y_test = ds.y[train_idx], ds.y[test_idx]

            model = spec.estimator
            model.fit(X_train, y_train)

            y_prob = _predict_proba_pos(model, X_test)
            y_pred = (y_prob >= 0.5).astype(int)
            fold_metrics.append(compute_metrics(y_test, y_pred, y_prob))

        results[spec.name] = {
            "fold_metrics": fold_metrics,
            "summary": _aggregate(fold_metrics),
        }

    results["n_splits"] = n_splits
    results["n_users"] = int(unique_groups.size)
    results["random_state"] = int(random_state)
    return results


def evaluate_holdout_by_user(ds: Dataset, models: List[ModelSpec], test_size: float, random_state: int) -> Dict[str, Any]:
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
    train_idx, test_idx = next(gss.split(ds.X, ds.y, groups=ds.user_ids))

    X_train, X_test = ds.X[train_idx], ds.X[test_idx]
    y_train, y_test = ds.y[train_idx], ds.y[test_idx]

    out: Dict[str, Any] = {
        "split": {
            "test_size": float(test_size),
            "n_train": int(train_idx.size),
            "n_test": int(test_idx.size),
            "n_users_train": int(np.unique(ds.user_ids[train_idx]).size),
            "n_users_test": int(np.unique(ds.user_ids[test_idx]).size),
            "random_state": int(random_state),
        },
        "models": {},
        "y_test": y_test,
        "feature_names": ["pauseTime", "scrollSpeed", "reReadCount", "attentionScore", "fatigueScore"],
    }

    for spec in models:
        model = spec.estimator
        model.fit(X_train, y_train)
        y_prob = _predict_proba_pos(model, X_test)
        y_pred = (y_prob >= 0.5).astype(int)
        out["models"][spec.name] = {
            "metrics": compute_metrics(y_test, y_pred, y_prob),
            "y_prob": y_prob,
            "model": model,
        }

    return out


def _save_plots(holdout: Dict[str, Any], out_dir: Path) -> None:
    import matplotlib.pyplot as plt
    import seaborn as sns

    sns.set_theme(style="whitegrid", context="talk")

    # ROC curves
    plt.figure(figsize=(10, 7))
    y_test = holdout["y_test"]
    for name, rec in holdout["models"].items():
        y_prob = rec["y_prob"]
        try:
            fpr, tpr, _ = roc_curve(y_test, y_prob)
            auc = rec["metrics"].roc_auc
            plt.plot(fpr, tpr, linewidth=2, label=f"{name} (AUC={auc:.3f})")
        except Exception:
            continue
    plt.plot([0, 1], [0, 1], "--", color="gray", linewidth=1)
    plt.title("ROC Curves (Holdout Test, User-Level Split)")
    plt.xlabel("False Positive Rate")
    plt.ylabel("True Positive Rate")
    plt.legend(loc="lower right", fontsize=10)
    plt.tight_layout()
    plt.savefig(out_dir / "roc_curves.png", dpi=220)
    plt.close()

    # Metric bar chart
    metric_names = ["accuracy", "precision", "recall", "f1", "roc_auc"]
    rows = []
    for name, rec in holdout["models"].items():
        m: Metrics = rec["metrics"]
        rows.append(
            {
                "Model": name,
                **{k: getattr(m, k) for k in metric_names},
            }
        )

    import pandas as pd

    df = pd.DataFrame(rows)
    df_melt = df.melt(id_vars=["Model"], var_name="Metric", value_name="Value")

    plt.figure(figsize=(14, 7))
    sns.barplot(data=df_melt, x="Metric", y="Value", hue="Model")
    plt.title("Model Comparison on Holdout Test Set")
    plt.ylim(0, 1.0)
    plt.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=3, frameon=False)
    plt.tight_layout()
    plt.savefig(out_dir / "model_comparison_metrics.png", dpi=220)
    plt.close()

    # Accuracy/F1-only bar chart (paper-friendly)
    keep = df[["Model", "accuracy", "f1"]].copy()
    keep = keep.melt(id_vars=["Model"], var_name="Metric", value_name="Value")
    plt.figure(figsize=(10, 6))
    sns.barplot(data=keep, x="Metric", y="Value", hue="Model")
    plt.title("Model Comparison (Accuracy and F1) on Holdout Test Set")
    plt.ylim(0, 1.0)
    plt.legend(loc="upper center", bbox_to_anchor=(0.5, -0.14), ncol=3, frameon=False)
    plt.tight_layout()
    plt.savefig(out_dir / "model_comparison_accuracy_f1.png", dpi=220)
    plt.close()

    # Confusion matrices
    for name, rec in holdout["models"].items():
        cm = rec["metrics"].cm
        plt.figure(figsize=(6.2, 5.2))
        sns.heatmap(
            cm,
            annot=True,
            fmt="d",
            cmap="Blues",
            cbar=False,
            xticklabels=["Not Confused (0)", "Confused (1)"],
            yticklabels=["Not Confused (0)", "Confused (1)"],
        )
        plt.title(f"Confusion Matrix: {name}")
        plt.xlabel("Predicted")
        plt.ylabel("True")
        plt.tight_layout()
        safe = "".join(ch if ch.isalnum() else "_" for ch in name).strip("_")
        plt.savefig(out_dir / f"confusion_matrix_{safe}.png", dpi=220)
        plt.close()

    # Feature importance / coefficients (optional but highly useful)
    feature_names = holdout.get("feature_names") or ["f1", "f2", "f3", "f4", "f5"]

    # Logistic Regression coefficients (absolute magnitude)
    if "Logistic Regression" in holdout["models"]:
        rec = holdout["models"]["Logistic Regression"]
        model = rec.get("model")
        try:
            # model may be Pipeline(scaler, lr)
            lr_est = model.named_steps["lr"] if hasattr(model, "named_steps") else model
            coefs = np.asarray(getattr(lr_est, "coef_"))
            coefs = coefs.reshape(-1)
            vals = np.abs(coefs)
            order = np.argsort(vals)[::-1]

            plt.figure(figsize=(9, 6))
            sns.barplot(
                x=vals[order],
                y=[feature_names[i] for i in order],
                palette="viridis",
                orient="h",
            )
            plt.title("Logistic Regression: |Coefficient| by Feature")
            plt.xlabel("Absolute coefficient magnitude")
            plt.ylabel("Feature")
            plt.tight_layout()
            plt.savefig(out_dir / "lr_coefficients.png", dpi=220)
            plt.close()
        except Exception:
            pass

    # Random Forest feature importance
    if "Random Forest" in holdout["models"]:
        rec = holdout["models"]["Random Forest"]
        model = rec.get("model")
        try:
            rf_est = model
            importances = np.asarray(getattr(rf_est, "feature_importances_"))
            order = np.argsort(importances)[::-1]

            plt.figure(figsize=(9, 6))
            sns.barplot(
                x=importances[order],
                y=[feature_names[i] for i in order],
                palette="mako",
                orient="h",
            )
            plt.title("Random Forest: Feature Importance")
            plt.xlabel("Importance")
            plt.ylabel("Feature")
            plt.tight_layout()
            plt.savefig(out_dir / "rf_feature_importance.png", dpi=220)
            plt.close()
        except Exception:
            pass


def _print_holdout_table(holdout: Dict[str, Any]) -> None:
    print("\n=== Holdout Test Evaluation (User-Level Split) ===")
    sp = holdout["split"]
    print(
        f"Split: test_size={sp['test_size']:.2f}, n_train={sp['n_train']}, n_test={sp['n_test']}, "
        f"users_train={sp['n_users_train']}, users_test={sp['n_users_test']}"
    )
    print("\nModel\t\t\tAcc\tPrec\tRec\tF1\tROC-AUC")

    for name, rec in holdout["models"].items():
        m: Metrics = rec["metrics"]
        nm = (name[:24] + "…") if len(name) > 25 else name
        print(f"{nm:26s}\t{m.accuracy:.3f}\t{m.precision:.3f}\t{m.recall:.3f}\t{m.f1:.3f}\t{_as_float(m.roc_auc):.3f}")


def _print_cv_summary(cv: Dict[str, Any]) -> None:
    print("\n=== 5-Fold GroupKFold Cross-Validation (by userId) ===")
    print(f"n_users={cv['n_users']}  n_splits={cv['n_splits']}")
    print("\nModel\t\t\tAcc(mean+/-sd)\tF1(mean+/-sd)\tROC-AUC(mean+/-sd)")

    for name, rec in cv.items():
        if name in {"n_splits", "n_users", "random_state"}:
            continue
        summ = rec["summary"]
        acc_m, acc_s = summ["accuracy"]
        f1_m, f1_s = summ["f1"]
        auc_m, auc_s = summ["roc_auc"]
        nm = (name[:24] + "…") if len(name) > 25 else name
        print(f"{nm:26s}\t{acc_m:.3f}+/-{acc_s:.3f}\t{f1_m:.3f}+/-{f1_s:.3f}\t{auc_m:.3f}+/-{auc_s:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate paper-ready metrics + plots for confusion detection (user-level split + GroupKFold)."
    )
    parser.add_argument("--data", default="project/data/behavior_data.csv", help="Path to CSV dataset")
    parser.add_argument("--out", default="ml/plots", help="Output directory for plots")
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--cv-folds", type=int, default=5)
    parser.add_argument(
        "--models",
        default="lr,rf,svm",
        help="Comma-separated model keys: lr,rf,svm,dt,mlp (default: lr,rf,svm)",
    )
    args = parser.parse_args()

    ds = load_labeled_dataset(args.data)
    out_dir = ensure_dir(args.out)

    all_models = build_models(args.random_state)
    model_keys = [p.strip().lower() for p in str(args.models).split(",") if p.strip()]
    models = select_models(all_models, model_keys)

    holdout = evaluate_holdout_by_user(ds, models, test_size=args.test_size, random_state=args.random_state)
    _print_holdout_table(holdout)

    cv = evaluate_groupkfold(ds, models, n_splits=args.cv_folds, random_state=args.random_state)
    _print_cv_summary(cv)

    _save_plots(holdout, out_dir)
    print("\nSaved plots to:", str(out_dir))


if __name__ == "__main__":
    main()
