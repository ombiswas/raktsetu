"""
Integration tests for FastAPI endpoints in services/ml.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "raktsetu-ml"
    assert data["simulation"] is True


def test_predict_response_probability() -> None:
    payload = {
        "request_id": "req-999",
        "candidates": [
            {
                "donor_id": "donor-1",
                "age": 24,
                "historical_response_rate": 0.9,
                "total_past_donations": 6,
                "days_since_last_donation": 140,
                "recent_alerts_count": 0,
                "distance_km": 2.1,
                "hour_of_day": 16,
                "is_weekend": False,
                "urgency": "CRITICAL",
            },
            {
                "donor_id": "donor-2",
                "age": 42,
                "historical_response_rate": 0.5,
                "total_past_donations": 1,
                "days_since_last_donation": 92,
                "recent_alerts_count": 3,
                "distance_km": 8.5,
                "hour_of_day": 16,
                "is_weekend": False,
                "urgency": "CRITICAL",
            },
        ],
    }

    response = client.post("/predict/response-probability", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["request_id"] == "req-999"
    assert len(data["predictions"]) == 2

    pred_1 = data["predictions"][0]
    pred_2 = data["predictions"][1]

    assert pred_1["donor_id"] == "donor-1"
    assert pred_2["donor_id"] == "donor-2"
    assert 0.0 <= pred_1["probability"] <= 1.0
    assert 0.0 <= pred_2["probability"] <= 1.0
    # Donor 1 (closer, higher compliance, zero fatigue) should have higher response probability
    assert pred_1["probability"] > pred_2["probability"]
    assert pred_1["is_simulation"] is True


def test_invalid_candidate_payload_rejected() -> None:
    # Age < 18 is invalid
    payload = {
        "request_id": "req-bad",
        "candidates": [
            {
                "donor_id": "donor-underage",
                "age": 16,  # Violation: ge=18
                "historical_response_rate": 0.5,
                "total_past_donations": 0,
                "days_since_last_donation": 0,
                "recent_alerts_count": 0,
                "distance_km": 1.0,
                "hour_of_day": 12,
                "is_weekend": False,
                "urgency": "ROUTINE",
            }
        ],
    }

    response = client.post("/predict/response-probability", json=payload)
    assert response.status_code == 422
