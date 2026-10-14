"""
Response probability estimator and demand forecaster for RaktSetu ML Service.
Loads checksum-verified trained models when available; falls back to calibrated baseline otherwise.
"""

import logging
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from app.features import batch_to_feature_matrix
from app.model_loader import SecurityIntegrityError, verify_and_load_artifact
from app.schemas import (
    CandidatePrediction,
    DemandForecastRequest,
    DonorFeatureRow,
    ForecastPoint,
)

logger = logging.getLogger("raktsetu.ml.model")

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


class ResponseProbabilityEstimator:
    """
    Estimator predicting P(response = 1 | donor, request, context).
    Uses checksum-verified trained artifact when present, otherwise uses calibrated baseline.
    """

    def __init__(self, models_dir: Path = MODELS_DIR) -> None:
        self.models_dir = models_dir
        self.trained_pipeline: Any = None
        self.model_version = "v0.1.0-calibrated-baseline"
        self._load_trained_model_if_available()

    def _load_trained_model_if_available(self) -> None:
        artifact_path = self.models_dir / "response_model.joblib"
        metadata_path = self.models_dir / "response_model.metadata.json"

        if artifact_path.exists() and metadata_path.exists():
            try:
                pipeline, metadata = verify_and_load_artifact(artifact_path, metadata_path)
                self.trained_pipeline = pipeline
                self.model_version = metadata.get("model_version", "v0.2.0-trained")
                logger.info("Loaded verified response model %s", self.model_version)
            except SecurityIntegrityError:
                logger.exception("Artifact checksum verification failed. Refusing to load.")
                raise
            except Exception as e:
                logger.warning("Failed to load response model artifact: %s. Using baseline.", e)
        else:
            logger.info("No trained artifact found at %s. Using baseline heuristic.", artifact_path)

    def predict_candidate_baseline(self, candidate: DonorFeatureRow) -> float:
        """Fallback logistic utility calculation."""
        utility = 0.20
        utility += -0.08 * candidate.distance_km
        effective_rate = candidate.get_effective_response_rate()
        utility += 1.85 * effective_rate
        utility += 0.05 * math.log1p(candidate.total_past_donations)
        utility += -0.35 * candidate.recent_alerts_count

        if candidate.urgency == "CRITICAL":
            utility += 0.45
        elif candidate.urgency == "URGENT":
            utility += 0.20

        if candidate.night_flag is not None:
            if candidate.night_flag == 1:
                utility += -0.75
        elif candidate.hour_of_day >= 22 or candidate.hour_of_day < 6:
            utility += -0.75
        elif not candidate.is_weekend and 9 <= candidate.hour_of_day <= 17:
            utility += -0.25

        prob = 1.0 / (1.0 + math.exp(-utility))
        return round(max(0.01, min(0.99, prob)), 4)

    def predict_candidate(self, candidate: DonorFeatureRow) -> float:
        """Predicts probability for a single candidate."""
        if self.trained_pipeline is not None:
            X = batch_to_feature_matrix([candidate.model_dump()])
            try:
                proba = float(self.trained_pipeline.predict_proba(X)[0, 1])
                return round(max(0.01, min(0.99, proba)), 4)
            except Exception as e:
                logger.warning("Pipeline predict_proba failed: %s; falling back to baseline", e)

        return self.predict_candidate_baseline(candidate)

    def predict_batch(self, candidates: list[DonorFeatureRow]) -> list[CandidatePrediction]:
        """Evaluates batch of candidates using trained pipeline or baseline."""
        if not candidates:
            return []

        if self.trained_pipeline is not None:
            rows = [c.model_dump() for c in candidates]
            X = batch_to_feature_matrix(rows)
            try:
                probs = self.trained_pipeline.predict_proba(X)[:, 1]
                predictions = []
                for candidate, p in zip(candidates, probs, strict=True):
                    clamped = round(max(0.01, min(0.99, float(p))), 4)
                    predictions.append(
                        CandidatePrediction(
                            donor_id=candidate.donor_id,
                            probability=clamped,
                            model_version=self.model_version,
                            is_simulation=True,
                        )
                    )
                return predictions
            except Exception as e:
                logger.warning("Batch predict_proba failed: %s; falling back to baseline", e)

        # Baseline fallback
        predictions = []
        for candidate in candidates:
            prob = self.predict_candidate_baseline(candidate)
            predictions.append(
                CandidatePrediction(
                    donor_id=candidate.donor_id,
                    probability=prob,
                    model_version=self.model_version,
                    is_simulation=True,
                )
            )
        return predictions


class ProductionDemandForecaster:
    """Production wrapper for recursive multi-step forecasting."""

    def __init__(self, model_type: str, model_artifact: Any) -> None:
        self.model_type = model_type
        self.model_artifact = model_artifact

    def predict(self, history: np.ndarray, horizon: int) -> np.ndarray:
        history = np.asarray(history, dtype=np.float64).copy()
        if self.model_type == "xgboost":
            preds: list[float] = []
            curr_history = list(history)
            for _ in range(horizon):
                t = len(curr_history)
                lags = [
                    curr_history[t - 1],
                    curr_history[t - 2],
                    curr_history[t - 3],
                    curr_history[t - 7],
                    curr_history[t - 14] if t >= 14 else curr_history[t - 7],
                ]
                rolling_7 = float(np.mean(curr_history[-7:]))
                rolling_14 = float(np.mean(curr_history[-14:]))
                dow = t % 7
                is_weekend = 1.0 if dow in (5, 6) else 0.0
                row = np.array(
                    [[*lags, rolling_7, rolling_14, float(dow), is_weekend]],
                    dtype=np.float64,
                )
                y_hat = max(0.0, float(self.model_artifact.predict(row)[0]))
                preds.append(y_hat)
                curr_history.append(y_hat)
            return np.array(preds, dtype=np.float64)

        if self.model_type == "sarima":
            try:
                from statsmodels.tsa.statespace.sarimax import SARIMAX

                sarima_mod = SARIMAX(history, order=(1, 0, 1), seasonal_order=(1, 0, 1, 7))
                model_fit = sarima_mod.fit(disp=False)
                res = model_fit.forecast(steps=horizon)
                return np.maximum(0.0, np.asarray(res, dtype=np.float64))
            except Exception:
                pass

        # Fallback to Seasonal Naive
        preds = []
        n = len(history)
        for h in range(horizon):
            lag_idx = n - (7 - (h % 7))
            val = history[lag_idx] if lag_idx >= 0 else history[-1]
            preds.append(max(0.0, float(val)))
        return np.array(preds, dtype=np.float64)


class DemandForecaster:
    """
    Forecaster predicting emergency blood demand units for horizon H days.
    """

    def __init__(self, models_dir: Path = MODELS_DIR) -> None:
        self.models_dir = models_dir
        self.trained_pipeline: Any = None
        self.model_version = "v0.1.0-seasonal-baseline"
        self._load_trained_model_if_available()

    def _load_trained_model_if_available(self) -> None:
        artifact_path = self.models_dir / "forecast_model.joblib"
        metadata_path = self.models_dir / "forecast_model.metadata.json"

        if artifact_path.exists() and metadata_path.exists():
            try:
                pipeline, metadata = verify_and_load_artifact(artifact_path, metadata_path)
                self.trained_pipeline = pipeline
                self.model_version = metadata.get("model_version", "v0.2.0-forecast-trained")
                logger.info("Loaded verified forecast model %s", self.model_version)
            except SecurityIntegrityError:
                logger.exception("Forecast artifact checksum verification failed.")
                raise
            except Exception as e:
                logger.warning("Failed to load forecast model artifact: %s", e)

    def forecast(self, req: DemandForecastRequest) -> list[ForecastPoint]:
        """Generates point forecast for horizon steps."""
        series = req.series
        horizon = req.horizon
        last_date_str = series[-1].date
        try:
            last_date = datetime.strptime(last_date_str, "%Y-%m-%d")
        except ValueError:
            last_date = datetime.now()

        values = np.array([pt.units for pt in series], dtype=np.float64)

        if self.trained_pipeline is not None:
            try:
                # Use model recursive forecast or predict function
                forecast_values = self.trained_pipeline.predict(values, horizon)
                points = []
                for h in range(horizon):
                    step_date = (last_date + timedelta(days=h + 1)).strftime("%Y-%m-%d")
                    pred = max(0.0, round(float(forecast_values[h]), 2))
                    points.append(ForecastPoint(step=h + 1, date=step_date, predicted_units=pred))
                return points
            except Exception as e:
                logger.warning("Trained forecaster failed: %s; falling back to seasonal naive", e)

        # Baseline: Seasonal Naive (7-day lag) with exponential smoothing fallback
        points = []
        n = len(values)
        for h in range(horizon):
            step_date = (last_date + timedelta(days=h + 1)).strftime("%Y-%m-%d")
            # 7-day seasonal lag
            lag_idx = n - (7 - (h % 7))
            if lag_idx >= 0:
                pred = values[lag_idx]
            else:
                pred = values[-1]
            points.append(
                ForecastPoint(step=h + 1, date=step_date, predicted_units=round(float(pred), 2))
            )
        return points


# Singleton instances
estimator = ResponseProbabilityEstimator()
forecaster = DemandForecaster()
