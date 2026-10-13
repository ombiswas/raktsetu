"""
Temporally validated training pipeline for emergency donor response probability estimation.
Models: LogisticRegression (baseline), RandomForest, XGBoost.
Applies imbalance handling, reports full evaluation metrics, calibrates on validation split,
and saves artifact + metadata with SHA-256 integrity checksum.
"""

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

# Add services/ml to sys.path so app.features can be imported directly
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.features import CANONICAL_FEATURES, batch_to_feature_matrix  # noqa: E402


def compute_file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def calculate_metrics(y_true: np.ndarray, y_prob: np.ndarray) -> dict[str, float]:
    y_pred = (y_prob >= 0.5).astype(int)
    roc_auc = float(roc_auc_score(y_true, y_prob)) if len(np.unique(y_true)) > 1 else 0.5
    pr_auc = float(average_precision_score(y_true, y_prob)) if len(np.unique(y_true)) > 1 else 0.5
    brier = float(brier_score_loss(y_true, y_prob))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))

    # Calibration check (mean absolute calibration error)
    prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=10, strategy="uniform")
    calibration_error = float(np.mean(np.abs(prob_true - prob_pred))) if len(prob_true) > 0 else 0.0

    return {
        "roc_auc": round(roc_auc, 4),
        "pr_auc": round(pr_auc, 4),
        "brier_score": round(brier, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
        "calibration_error": round(calibration_error, 4),
    }


def run_training() -> dict[str, Any]:
    print("=" * 78)
    print("  RaktSetu Emergency Donor Response Probability Training Pipeline")
    print("  (SIMULATION RESEARCH PROTOTYPE - ACADEMIC BENCHMARK)")
    print("=" * 78)

    # Locate dataset
    workspace_root = BASE_DIR.parent.parent
    data_path = workspace_root / "experiments" / "results" / "donor_response.csv"

    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {data_path}. Run 'npm run exp:generate' first."
        )

    data_hash = compute_file_sha256(data_path)
    print(f"\n[1] Loading dataset: {data_path}")
    print(f"    Data SHA-256: {data_hash}")

    df = pd.read_csv(data_path, comment="#")
    print(f"    Total records: {len(df)}")

    # Sort strictly chronologically by timestamp for temporal splitting
    df = df.sort_values(by="timestamp").reset_index(drop=True)
    n = len(df)

    n_train = int(n * 0.70)
    n_val = int(n * 0.15)

    train_df = df.iloc[:n_train]
    val_df = df.iloc[n_train : n_train + n_val]
    test_df = df.iloc[n_train + n_val :]

    print("\n[2] Temporal Split Protocol (No Shuffling):")
    t_tr_start, t_tr_end = train_df['timestamp'].iloc[0][:16], train_df['timestamp'].iloc[-1][:16]
    t_val_start, t_val_end = val_df['timestamp'].iloc[0][:16], val_df['timestamp'].iloc[-1][:16]
    t_te_start, t_te_end = test_df['timestamp'].iloc[0][:16], test_df['timestamp'].iloc[-1][:16]
    print(f"    Train:      {len(train_df):5d} rows ({t_tr_start} -> {t_tr_end})")
    print(f"    Validation: {len(val_df):5d} rows ({t_val_start} -> {t_val_end})")
    print(f"    Test:       {len(test_df):5d} rows ({t_te_start} -> {t_te_end})")

    # Extract features using single-source canonical module
    X_train = batch_to_feature_matrix(train_df)
    y_train = train_df["response"].to_numpy(dtype=np.int64)

    X_val = batch_to_feature_matrix(val_df)
    y_val = val_df["response"].to_numpy(dtype=np.int64)

    X_test = batch_to_feature_matrix(test_df)
    y_test = test_df["response"].to_numpy(dtype=np.int64)

    # Imbalance ratio
    pos_count = np.sum(y_train == 1)
    neg_count = np.sum(y_train == 0)
    scale_pos_weight = float(neg_count / max(1, pos_count))
    print(
        f"\n[3] Class Imbalance in Train: {neg_count} Neg / {pos_count} Pos "
        f"(Weight: {scale_pos_weight:.2f})"
    )

    # Standard Scaler fit ONLY on train split (Strict Leakage Guard)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    # Models definition
    models: dict[str, Any] = {
        "LogisticRegression (Baseline)": LogisticRegression(
            class_weight="balanced",
            max_iter=1000,
            random_state=42,
        ),
        "RandomForest": RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.08,
            scale_pos_weight=scale_pos_weight,
            random_state=42,
            eval_metric="logloss",
        ),
    }

    results: dict[str, dict[str, float]] = {}

    print("\n[4] Training and Evaluating Candidate Models on Validation Split:")
    print("-" * 78)
    print(f"{'Model':<30} | {'ROC-AUC':<8} | {'PR-AUC':<8} | {'Brier':<8} | {'F1':<8}")
    print("-" * 78)

    best_model_name = ""
    best_score = -1.0
    fitted_models: dict[str, Any] = {}

    for name, model in models.items():
        if "LogisticRegression" in name:
            model.fit(X_train_scaled, y_train)
            probs_val = model.predict_proba(X_val_scaled)[:, 1]
        else:
            model.fit(X_train, y_train)
            probs_val = model.predict_proba(X_val)[:, 1]

        fitted_models[name] = model
        m = calculate_metrics(y_val, probs_val)
        results[name] = m
        row_str = (
            f"{name:<30} | {m['roc_auc']:<8.4f} | {m['pr_auc']:<8.4f} | "
            f"{m['brier_score']:<8.4f} | {m['f1']:<8.4f}"
        )
        print(row_str)

        # Choose best based on ROC-AUC + PR-AUC
        composite_score = m["roc_auc"] + m["pr_auc"]
        if composite_score > best_score:
            best_score = composite_score
            best_model_name = name

    print("-" * 78)
    print(f"--> Selected Best Candidate Model: {best_model_name}")

    # [5] Probability Calibration on Validation Split ONLY using PredefinedSplit
    print("\n[5] Calibrating Probabilities (Platt Scaling / Sigmoid) on Validation Split:")
    from sklearn.model_selection import PredefinedSplit

    # Combine train and val sets: -1 for train (base model), 0 for val (calibrator only)
    X_train_val = np.vstack([X_train, X_val])
    y_train_val = np.concatenate([y_train, y_val])
    test_fold = np.array([-1] * len(X_train) + [0] * len(X_val))
    cv_split = PredefinedSplit(test_fold)

    # Re-initialize clean base model instance
    if "LogisticRegression" in best_model_name:
        fresh_base_model = LogisticRegression(
            class_weight="balanced",
            max_iter=1000,
            random_state=42,
        )
        base_pipeline = Pipeline([("scaler", StandardScaler()), ("clf", fresh_base_model)])
    elif "RandomForest" in best_model_name:
        base_pipeline = Pipeline([
            ("clf", RandomForestClassifier(
                n_estimators=100,
                max_depth=6,
                class_weight="balanced",
                random_state=42,
                n_jobs=-1,
            ))
        ])
    else:
        base_pipeline = Pipeline([
            ("clf", XGBClassifier(
                n_estimators=100,
                max_depth=4,
                learning_rate=0.08,
                scale_pos_weight=scale_pos_weight,
                random_state=42,
                eval_metric="logloss",
            ))
        ])

    calibrated_pipeline = CalibratedClassifierCV(
        estimator=base_pipeline,
        method="sigmoid",
        cv=cv_split,
    )
    calibrated_pipeline.fit(X_train_val, y_train_val)
    full_pipeline = calibrated_pipeline

    # Evaluate on held-out Test split
    test_probs = full_pipeline.predict_proba(X_test)[:, 1]
    test_metrics = calculate_metrics(y_test, test_probs)

    print("\n[6] Final Out-of-Sample Performance on Chronological Test Split:")
    print("-" * 50)
    for k, v in test_metrics.items():
        print(f"    {k:<22}: {v:.4f}")
    print("-" * 50)

    # [7] Save Artifact and Checksum Metadata
    models_dir = BASE_DIR / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    artifact_path = models_dir / "response_model.joblib"
    metadata_path = models_dir / "response_model.metadata.json"

    joblib.dump(full_pipeline, artifact_path)
    artifact_checksum = compute_file_sha256(artifact_path)

    metadata = {
        "simulation": True,
        "disclaimer": "SIMULATION PROTOTYPE: Academic probability model. Not clinical data.",
        "model_version": "v0.2.0-calibrated-xgb",
        "sha256_checksum": artifact_checksum,
        "features": CANONICAL_FEATURES,
        "best_base_model": best_model_name,
        "test_metrics": test_metrics,
        "validation_metrics": results,
        "data_hash": data_hash,
        "library_versions": {
            "python": sys.version.split()[0],
            "scikit_learn": pd.__version__,
        },
        "trained_at": datetime.now(UTC).isoformat(),
        "temporal_split": {
            "train_rows": len(train_df),
            "val_rows": len(val_df),
            "test_rows": len(test_df),
        },
    }

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print("\n[7] Artifacts Successfully Saved:")
    print(f"    Artifact: {artifact_path}")
    print(f"    SHA-256:  {artifact_checksum}")
    print(f"    Metadata: {metadata_path}")
    print("\n" + "=" * 78 + "\n")

    return metadata


if __name__ == "__main__":
    run_training()
