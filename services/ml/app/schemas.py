"""
Pydantic v2 schemas for the RaktSetu ML response probability service.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class DonorFeatureVector(BaseModel):
    donor_id: str = Field(..., description="Unique donor identifier")
    age: Annotated[int, Field(ge=18, le=65, description="Donor age in years")]
    historical_response_rate: Annotated[
        float, Field(ge=0.0, le=1.0, description="Past acceptance rate [0, 1]")
    ]
    total_past_donations: Annotated[
        int, Field(ge=0, description="Cumulative completed donations")
    ]
    days_since_last_donation: Annotated[
        int, Field(ge=0, description="Days elapsed since previous donation")
    ]
    recent_alerts_count: Annotated[
        int, Field(ge=0, description="Notifications received in last 7 days")
    ]
    distance_km: Annotated[
        float, Field(ge=0.0, le=100.0, description="Geodesic distance to hospital in km")
    ]
    hour_of_day: Annotated[
        int, Field(ge=0, le=23, description="Local hour of alert dispatch [0-23]")
    ]
    is_weekend: bool = Field(..., description="Whether alert is issued on a weekend")
    urgency: Literal["CRITICAL", "URGENT", "ROUTINE"] = Field(
        ..., description="Emergency triage category"
    )


class PredictionRequest(BaseModel):
    request_id: str = Field(..., description="Hospital emergency request ID")
    candidates: list[DonorFeatureVector] = Field(
        ..., min_length=1, description="Batch of pre-filtered eligible donor candidates"
    )


class CandidatePrediction(BaseModel):
    donor_id: str
    probability: Annotated[
        float, Field(ge=0.0, le=1.0, description="Calibrated P(response | donor, request)")
    ]
    model_version: str = "v0.1.0-baseline"
    is_simulation: Literal[True] = True


class PredictionResponse(BaseModel):
    request_id: str
    predictions: list[CandidatePrediction]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    disclaimer: str = (
        "SIMULATION PROTOTYPE: Academic probability estimate only. No clinical guarantees."
    )
