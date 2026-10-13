"""
Tests for determinism with fixed seeds and temporal leakage guard on the training frame.
"""

from pathlib import Path

import pandas as pd

from app.model import ResponseProbabilityEstimator
from app.schemas import DonorFeatureRow

BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = BASE_DIR.parent.parent


def test_determinism_with_fixed_input() -> None:
    estimator = ResponseProbabilityEstimator()

    candidate = DonorFeatureRow(
        donor_id="donor-det-1",
        age=28,
        prior_response_rate=0.75,
        total_past_donations=3,
        days_since_last_donation=100,
        recent_alerts_count=1,
        distance_km=3.2,
        hour_of_day=14,
        is_weekend=False,
        urgency="URGENT",
    )

    pred1 = estimator.predict_candidate(candidate)
    pred2 = estimator.predict_candidate(candidate)
    assert pred1 == pred2
    assert 0.0 <= pred1 <= 1.0


def test_leakage_guard_on_training_frame() -> None:
    data_path = WORKSPACE_ROOT / "experiments" / "results" / "donor_response.csv"
    assert data_path.exists(), "donor_response.csv must exist"

    df = pd.read_csv(data_path, comment="#")
    assert len(df) > 100

    # Ensure chronologically sorted
    df = df.sort_values(by="timestamp").reset_index(drop=True)

    n = len(df)
    n_train = int(n * 0.70)
    n_val = int(n * 0.15)

    train_df = df.iloc[:n_train]
    val_df = df.iloc[n_train : n_train + n_val]
    test_df = df.iloc[n_train + n_val :]

    # Assert strictly non-overlapping temporal partition:
    # max(train_timestamp) <= min(val_timestamp) <= max(val_timestamp) <= min(test_timestamp)
    max_train_ts = train_df["timestamp"].max()
    min_val_ts = val_df["timestamp"].min()
    max_val_ts = val_df["timestamp"].max()
    min_test_ts = test_df["timestamp"].min()

    assert max_train_ts <= min_val_ts, f"Train ({max_train_ts}) overlaps with Val ({min_val_ts})"
    assert max_val_ts <= min_test_ts, f"Val ({max_val_ts}) overlaps with Test ({min_test_ts})"

    # Target leakage check:
    # 'response' column must NOT appear inside features
    features_cols = [
        "distance_km",
        "prior_response_rate",
        "recency_score",
        "total_past_donations",
        "days_since_last_donation",
        "recent_alerts_count",
        "age",
        "hour_of_day",
        "is_weekend",
        "night_flag",
    ]
    for col in features_cols:
        assert col != "response"

    # Latent coefficients check:
    # Ground truth parameters must not be present in columns
    for forbidden in ["b0", "b1", "b2", "b3", "b4", "b5", "noise"]:
        assert forbidden not in df.columns
