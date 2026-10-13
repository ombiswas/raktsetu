"""
Single source of truth for feature definitions, ordering, and extraction.
Used identically across training pipelines and online serving.
"""

from typing import Any

import numpy as np
import pandas as pd

CANONICAL_FEATURES: list[str] = [
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
    "urgency_critical",
    "urgency_urgent",
]


def extract_feature_dict(row: dict[str, Any] | pd.Series) -> dict[str, float]:
    """
    Extracts canonical features from a dictionary or pandas series.
    Normalizes categorical urgency into one-hot indicators.
    """
    # Distance
    distance_km = float(row.get("distance_km", 0.0))

    # Prior compliance
    if row.get("prior_response_rate") is not None:
        prior_response_rate = float(row["prior_response_rate"])
    elif row.get("historical_response_rate") is not None:
        prior_response_rate = float(row["historical_response_rate"])
    else:
        prior_response_rate = 0.3

    # Recency
    if row.get("recency_score") is not None:
        recency_score = float(row["recency_score"])
    elif row.get("days_since_last_donation") is not None:
        recency_score = min(1.0, float(row["days_since_last_donation"]) / 365.0)
    else:
        recency_score = 0.5

    total_past_donations = float(row.get("total_past_donations") or 0.0)
    days_since_last_donation = float(row.get("days_since_last_donation") or 120.0)
    recent_alerts_count = float(row.get("recent_alerts_count") or 0.0)
    age = float(row.get("age") or 30.0)
    raw_hour = row.get("hour_of_day")
    hour_of_day = float(raw_hour) if raw_hour is not None else 12.0

    # Weekend flag
    is_weekend_raw = row.get("is_weekend", False)
    if isinstance(is_weekend_raw, str):
        is_weekend = 1.0 if is_weekend_raw.strip().lower() in ("true", "1") else 0.0
    else:
        is_weekend = 1.0 if bool(is_weekend_raw) else 0.0

    # Night flag
    if row.get("night_flag") is not None:
        night_flag = float(row["night_flag"])
    else:
        night_flag = 1.0 if (hour_of_day >= 22 or hour_of_day < 6) else 0.0

    # Urgency one-hot encoding
    urgency = str(row.get("urgency", "ROUTINE")).upper()
    urgency_critical = 1.0 if urgency == "CRITICAL" else 0.0
    urgency_urgent = 1.0 if urgency == "URGENT" else 0.0

    return {
        "distance_km": distance_km,
        "prior_response_rate": prior_response_rate,
        "recency_score": recency_score,
        "total_past_donations": total_past_donations,
        "days_since_last_donation": days_since_last_donation,
        "recent_alerts_count": recent_alerts_count,
        "age": age,
        "hour_of_day": hour_of_day,
        "is_weekend": is_weekend,
        "night_flag": night_flag,
        "urgency_critical": urgency_critical,
        "urgency_urgent": urgency_urgent,
    }


def feature_dict_to_vector(features: dict[str, float]) -> list[float]:
    """
    Returns feature values in the exact canonical order.
    """
    return [float(features[col]) for col in CANONICAL_FEATURES]


def batch_to_feature_matrix(rows: list[dict[str, Any]] | pd.DataFrame) -> np.ndarray:
    """
    Converts a batch of rows or DataFrame to a 2D float64 NumPy matrix
    with column ordering matching CANONICAL_FEATURES.
    """
    if isinstance(rows, pd.DataFrame):
        matrix: list[list[float]] = []
        for _, series in rows.iterrows():
            f_dict = extract_feature_dict(series)
            matrix.append(feature_dict_to_vector(f_dict))
        return np.array(matrix, dtype=np.float64)

    matrix = []
    for r in rows:
        f_dict = extract_feature_dict(r)
        matrix.append(feature_dict_to_vector(f_dict))
    return np.array(matrix, dtype=np.float64)
