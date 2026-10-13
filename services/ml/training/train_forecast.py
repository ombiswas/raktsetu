"""
Temporally validated forecasting pipeline for emergency blood demand units.
Evaluates:
  1. Naive baseline (last value)
  2. Seasonal naive (7-day lag)
  3. SARIMA / State-space model
  4. XGBoost with autoregressive lag and rolling window features
Evaluates via walk-forward validation and reports MAE, RMSE, and non-zero MAPE.
Saves model artifact + metadata with SHA-256 integrity checksum.
"""

import hashlib
import json
import sys
import warnings
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX
from xgboost import XGBRegressor

warnings.filterwarnings("ignore")

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.model import ProductionDemandForecaster  # noqa: E402


def compute_file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def calculate_forecast_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=np.float64)
    y_pred = np.asarray(y_pred, dtype=np.float64)

    mae = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

    # MAPE computed EXCLUSIVELY where actuals are non-zero (avoid div by zero)
    non_zero_mask = y_true != 0.0
    if np.any(non_zero_mask):
        ape = np.abs((y_true[non_zero_mask] - y_pred[non_zero_mask]) / y_true[non_zero_mask])
        mape = float(np.mean(ape)) * 100.0
    else:
        mape = 0.0

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 4),
    }


def create_lag_features(series: np.ndarray, max_lag: int = 14) -> tuple[np.ndarray, np.ndarray]:
    """Builds tabular feature matrix from univariate time series."""
    X, y = [], []
    for t in range(max_lag, len(series)):
        lags = [series[t - 1], series[t - 2], series[t - 3], series[t - 7], series[t - 14]]
        rolling_7 = np.mean(series[t - 7 : t])
        rolling_14 = np.mean(series[t - 14 : t])
        dow = t % 7
        is_weekend = 1.0 if dow in (5, 6) else 0.0
        X.append([*lags, rolling_7, rolling_14, float(dow), is_weekend])
        y.append(series[t])
    return np.array(X, dtype=np.float64), np.array(y, dtype=np.float64)


def run_forecast_training() -> dict[str, Any]:
    print("=" * 78)
    print("  RaktSetu Emergency Demand Series Forecasting Pipeline")
    print("  (SIMULATION RESEARCH PROTOTYPE - ACADEMIC BENCHMARK)")
    print("=" * 78)

    workspace_root = BASE_DIR.parent.parent
    data_path = workspace_root / "experiments" / "results" / "demand_series.csv"

    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {data_path}. Run 'npm run exp:generate' first."
        )

    data_hash = compute_file_sha256(data_path)
    print(f"\n[1] Loading dataset: {data_path}")
    print(f"    Data SHA-256: {data_hash}")

    df = pd.read_csv(data_path, comment="#")
    # Group by date to get daily continuous aggregated series
    daily_series = df.groupby("date")["units"].sum().reset_index()
    daily_series = daily_series.sort_values(by="date").reset_index(drop=True)

    y_series = daily_series["units"].to_numpy(dtype=np.float64)
    dates = daily_series["date"].tolist()
    total_days = len(y_series)
    print(f"    Total daily timeline observations: {total_days} days ({dates[0]} to {dates[-1]})")

    if total_days < 30:
        raise ValueError(f"Insufficient history ({total_days} days). Minimum 30 days needed.")

    # [2] Walk-Forward Cross-Validation
    horizon = 7
    # Use last 21 days for walk-forward evaluation (3 steps of 7 days)
    test_folds = 3
    print(f"\n[2] Walk-Forward Validation Setup: {test_folds} folds of horizon H={horizon} days")

    naive_preds, snaive_preds, sarima_preds, xgb_preds = [], [], [], []
    actuals = []

    for fold in range(test_folds):
        cutoff = total_days - (test_folds - fold) * horizon
        train_hist = y_series[:cutoff]
        test_actual = y_series[cutoff : cutoff + horizon]

        # 1. Naive (last value)
        naive_forecast = np.full(horizon, train_hist[-1])
        naive_preds.extend(naive_forecast)

        # 2. Seasonal Naive (7-day lag)
        snaive_forecast = train_hist[-7:]
        snaive_preds.extend(snaive_forecast)

        # 3. SARIMA
        try:
            sarima_fold = SARIMAX(train_hist, order=(1, 0, 1), seasonal_order=(1, 0, 1, 7))
            sarima_fit = sarima_fold.fit(disp=False)
            sarima_fc = sarima_fit.forecast(steps=horizon)
            sarima_preds.extend(np.maximum(0.0, sarima_fc))
        except Exception:
            sarima_preds.extend(snaive_forecast)

        # 4. XGBoost with lag features
        X_tr, y_tr = create_lag_features(train_hist)
        xgb_reg = XGBRegressor(n_estimators=60, max_depth=3, learning_rate=0.08, random_state=42)
        xgb_reg.fit(X_tr, y_tr)

        forecaster_obj = ProductionDemandForecaster("xgboost", xgb_reg)
        xgb_fc = forecaster_obj.predict(train_hist, horizon)
        xgb_preds.extend(xgb_fc)

        actuals.extend(test_actual)

    actuals_arr = np.array(actuals)
    models_eval = {
        "Naive (Last Value)": np.array(naive_preds),
        "Seasonal Naive (Lag-7)": np.array(snaive_preds),
        "SARIMA": np.array(sarima_preds),
        "XGBoost (Autoregressive)": np.array(xgb_preds),
    }

    print("\n[3] Walk-Forward Model Comparison on Non-Zero Actuals:")
    print("-" * 78)
    print(f"{'Model':<30} | {'MAE':<10} | {'RMSE':<10} | {'MAPE (%)':<10}")
    print("-" * 78)

    metrics_table: dict[str, dict[str, float]] = {}
    best_model_name = ""
    best_rmse = float("inf")

    for name, p in models_eval.items():
        m = calculate_forecast_metrics(actuals_arr, p)
        metrics_table[name] = m
        print(f"{name:<30} | {m['mae']:<10.4f} | {m['rmse']:<10.4f} | {m['mape']:<10.2f}%")
        if m["rmse"] < best_rmse:
            best_rmse = m["rmse"]
            best_model_name = name

    print("-" * 78)
    print(f"--> Selected Best Forecasting Model: {best_model_name}")

    # [4] Train final production model on all available data
    X_full, y_full = create_lag_features(y_series)
    final_xgb = XGBRegressor(n_estimators=80, max_depth=3, learning_rate=0.08, random_state=42)
    final_xgb.fit(X_full, y_full)

    production_forecaster = ProductionDemandForecaster("xgboost", final_xgb)

    # [5] Save Artifact and Checksum Metadata
    models_dir = BASE_DIR / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    artifact_path = models_dir / "forecast_model.joblib"
    metadata_path = models_dir / "forecast_model.metadata.json"

    joblib.dump(production_forecaster, artifact_path)
    artifact_checksum = compute_file_sha256(artifact_path)

    metadata = {
        "simulation": True,
        "disclaimer": "SIMULATION PROTOTYPE: Academic blood demand forecaster. Not clinical data.",
        "model_version": "v0.2.0-xgb-forecast",
        "sha256_checksum": artifact_checksum,
        "best_model": best_model_name,
        "metrics": metrics_table,
        "data_hash": data_hash,
        "trained_at": datetime.now(UTC).isoformat(),
        "total_days_trained": total_days,
    }

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print("\n[5] Forecast Artifacts Successfully Saved:")
    print(f"    Artifact: {artifact_path}")
    print(f"    SHA-256:  {artifact_checksum}")
    print(f"    Metadata: {metadata_path}")
    print("\n" + "=" * 78 + "\n")

    return metadata


if __name__ == "__main__":
    run_forecast_training()
