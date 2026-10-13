"""
Integration tests for FastAPI endpoints in services/ml.
Covers authentication, schema rejection, bounded probabilities, and forecasting.
"""

from fastapi.testclient import TestClient

from app.auth import DEFAULT_DEV_TOKEN
from app.main import app

client = TestClient(app)
AUTH_HEADER = {"Authorization": f"Bearer {DEFAULT_DEV_TOKEN}"}


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "raktsetu-ml"
    assert data["simulation"] is True
    assert "model_version" in data
    assert "forecast_model_version" in data


def test_unauthenticated_requests_rejected_with_401() -> None:
    payload = {
        "request_id": "req-auth-test",
        "candidates": [
            {
                "donor_id": "donor-1",
                "age": 25,
                "distance_km": 2.5,
                "hour_of_day": 14,
                "urgency": "CRITICAL",
            }
        ],
    }

    # Missing header -> 401
    r_no_auth = client.post("/v1/predict/response", json=payload)
    assert r_no_auth.status_code == 401

    # Invalid token -> 401
    r_bad_auth = client.post(
        "/v1/predict/response",
        json=payload,
        headers={"Authorization": "Bearer bad-token-xyz"},
    )
    assert r_bad_auth.status_code == 401

    # Malformed header -> 401
    r_malformed = client.post(
        "/v1/predict/response",
        json=payload,
        headers={"Authorization": "Basic 12345"},
    )
    assert r_malformed.status_code == 401


def test_authenticated_predict_response_success() -> None:
    payload = {
        "request_id": "req-predict-1",
        "candidates": [
            {
                "donor_id": "donor-near",
                "age": 24,
                "prior_response_rate": 0.85,
                "total_past_donations": 5,
                "days_since_last_donation": 100,
                "recent_alerts_count": 0,
                "distance_km": 1.5,
                "hour_of_day": 15,
                "is_weekend": False,
                "urgency": "CRITICAL",
            },
            {
                "donor_id": "donor-far",
                "age": 45,
                "prior_response_rate": 0.35,
                "total_past_donations": 1,
                "days_since_last_donation": 90,
                "recent_alerts_count": 3,
                "distance_km": 12.0,
                "hour_of_day": 23,
                "is_weekend": False,
                "urgency": "ROUTINE",
            },
        ],
    }

    response = client.post("/v1/predict/response", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 200

    data = response.json()
    assert data["request_id"] == "req-predict-1"
    assert len(data["predictions"]) == 2

    p1 = data["predictions"][0]
    p2 = data["predictions"][1]

    assert p1["donor_id"] == "donor-near"
    assert p2["donor_id"] == "donor-far"
    assert 0.0 <= p1["probability"] <= 1.0
    assert 0.0 <= p2["probability"] <= 1.0
    assert p1["probability"] > p2["probability"]


def test_schema_rejection_for_invalid_donor_fields() -> None:
    # Underage donor (< 18)
    bad_payload = {
        "request_id": "req-invalid",
        "candidates": [
            {
                "donor_id": "donor-underage",
                "age": 16,
                "distance_km": 2.0,
                "hour_of_day": 12,
            }
        ],
    }
    r = client.post("/v1/predict/response", json=bad_payload, headers=AUTH_HEADER)
    assert r.status_code == 422


def test_schema_rejection_for_batch_overflow() -> None:
    # Batch size > 500 must be rejected
    overflow_candidates = [
        {
            "donor_id": f"d-{i}",
            "age": 25,
            "distance_km": 3.0,
            "hour_of_day": 12,
        }
        for i in range(501)
    ]
    payload = {
        "request_id": "req-overflow",
        "candidates": overflow_candidates,
    }
    r = client.post("/v1/predict/response", json=payload, headers=AUTH_HEADER)
    assert r.status_code in (400, 422)


def test_authenticated_demand_forecast_endpoint() -> None:
    history = [
        {"date": f"2026-03-{i:02d}", "units": 15.0 + (i % 5)}
        for i in range(1, 15)
    ]
    payload = {
        "series": history,
        "horizon": 7,
        "blood_group": "O+",
        "component": "whole_blood",
    }

    # Missing auth -> 401
    r_unauth = client.post("/v1/forecast", json=payload)
    assert r_unauth.status_code == 401

    # Valid auth -> 200
    r_auth = client.post("/v1/forecast", json=payload, headers=AUTH_HEADER)
    assert r_auth.status_code == 200

    data = r_auth.json()
    assert data["horizon"] == 7
    assert len(data["forecast"]) == 7
    for pt in data["forecast"]:
        assert pt["step"] >= 1
        assert pt["predicted_units"] >= 0.0


def test_legacy_endpoint_backward_compatibility() -> None:
    payload = {
        "request_id": "req-legacy",
        "candidates": [
            {
                "donor_id": "donor-leg",
                "age": 30,
                "historical_response_rate": 0.8,
                "total_past_donations": 3,
                "days_since_last_donation": 100,
                "recent_alerts_count": 0,
                "distance_km": 2.0,
                "hour_of_day": 14,
                "is_weekend": False,
                "urgency": "CRITICAL",
            }
        ],
    }
    response = client.post("/predict/response-probability", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["predictions"]) == 1
    assert 0.0 <= data["predictions"][0]["probability"] <= 1.0
