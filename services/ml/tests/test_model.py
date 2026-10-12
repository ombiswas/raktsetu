"""
Tests for ML response probability estimator logic.
"""

from app.model import ResponseProbabilityEstimator
from app.schemas import DonorFeatureVector


def test_estimator_bounds_and_validity() -> None:
    estimator = ResponseProbabilityEstimator()

    candidate = DonorFeatureVector(
        donor_id="donor-123",
        age=28,
        historical_response_rate=0.85,
        total_past_donations=5,
        days_since_last_donation=120,
        recent_alerts_count=1,
        distance_km=3.5,
        hour_of_day=14,
        is_weekend=False,
        urgency="CRITICAL",
    )

    prob = estimator.predict_candidate(candidate)
    assert 0.0 <= prob <= 1.0


def test_distance_decay_monotonicity() -> None:
    estimator = ResponseProbabilityEstimator()

    near_candidate = DonorFeatureVector(
        donor_id="donor-near",
        age=30,
        historical_response_rate=0.7,
        total_past_donations=3,
        days_since_last_donation=100,
        recent_alerts_count=0,
        distance_km=1.2,
        hour_of_day=15,
        is_weekend=False,
        urgency="URGENT",
    )

    far_candidate = near_candidate.model_copy(update={"distance_km": 15.0})

    prob_near = estimator.predict_candidate(near_candidate)
    prob_far = estimator.predict_candidate(far_candidate)

    assert prob_near > prob_far


def test_fatigue_penalty_effect() -> None:
    estimator = ResponseProbabilityEstimator()

    fresh_candidate = DonorFeatureVector(
        donor_id="donor-fresh",
        age=25,
        historical_response_rate=0.8,
        total_past_donations=4,
        days_since_last_donation=95,
        recent_alerts_count=0,
        distance_km=4.0,
        hour_of_day=11,
        is_weekend=True,
        urgency="ROUTINE",
    )

    fatigued_candidate = fresh_candidate.model_copy(update={"recent_alerts_count": 4})

    prob_fresh = estimator.predict_candidate(fresh_candidate)
    prob_fatigued = estimator.predict_candidate(fatigued_candidate)

    assert prob_fresh > prob_fatigued


def test_urgency_moral_incentive() -> None:
    estimator = ResponseProbabilityEstimator()

    routine_candidate = DonorFeatureVector(
        donor_id="donor-urgency",
        age=35,
        historical_response_rate=0.6,
        total_past_donations=2,
        days_since_last_donation=110,
        recent_alerts_count=0,
        distance_km=5.0,
        hour_of_day=10,
        is_weekend=False,
        urgency="ROUTINE",
    )

    critical_candidate = routine_candidate.model_copy(update={"urgency": "CRITICAL"})

    prob_routine = estimator.predict_candidate(routine_candidate)
    prob_critical = estimator.predict_candidate(critical_candidate)

    assert prob_critical > prob_routine
