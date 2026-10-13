"""
Tests for canonical feature ordering and vector extraction.
Ensures single-source consistency between training and serving.
"""

import numpy as np
import pandas as pd

from app.features import (
    CANONICAL_FEATURES,
    batch_to_feature_matrix,
    extract_feature_dict,
    feature_dict_to_vector,
)


def test_canonical_feature_list_length_and_order() -> None:
    expected_order = [
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
    assert CANONICAL_FEATURES == expected_order
    assert len(CANONICAL_FEATURES) == 12


def test_feature_extraction_order_invariance() -> None:
    sample_data = {
        "age": 35,
        "distance_km": 4.5,
        "is_weekend": True,
        "night_flag": 1,
        "hour_of_day": 23,
        "recent_alerts_count": 2,
        "days_since_last_donation": 90,
        "total_past_donations": 4,
        "recency_score": 0.246,
        "prior_response_rate": 0.75,
        "urgency": "CRITICAL",
    }

    f_dict = extract_feature_dict(sample_data)
    vector = feature_dict_to_vector(f_dict)

    assert len(vector) == len(CANONICAL_FEATURES)
    assert vector[0] == 4.5  # distance_km
    assert vector[1] == 0.75  # prior_response_rate
    assert vector[6] == 35.0  # age
    assert vector[9] == 1.0  # night_flag
    assert vector[10] == 1.0  # urgency_critical
    assert vector[11] == 0.0  # urgency_urgent


def test_batch_to_feature_matrix_shape_and_types() -> None:
    rows = [
        {"distance_km": 1.0, "age": 20, "urgency": "ROUTINE"},
        {"distance_km": 5.0, "age": 45, "urgency": "URGENT"},
        {"distance_km": 10.0, "age": 60, "urgency": "CRITICAL"},
    ]
    matrix = batch_to_feature_matrix(rows)
    assert isinstance(matrix, np.ndarray)
    assert matrix.shape == (3, 12)
    assert matrix.dtype == np.float64

    # Test with DataFrame input
    df = pd.DataFrame(rows)
    df_matrix = batch_to_feature_matrix(df)
    assert np.allclose(matrix, df_matrix)
