"""
Strict Pydantic v2 schemas for the RaktSetu ML Service.
Validates input boundaries and prevents path injection or excessive batch payloads.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class DonorFeatureRow(BaseModel):
    """
    Feature row for a single eligible donor candidate.
    Strictly forbids paths, URLs, or arbitrary strings.
    """
    donor_id: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_\-]+$")
    distance_km: Annotated[float, Field(ge=0.0, le=100.0, description="Geodesic distance in km")]
    prior_response_rate: Annotated[
        float, Field(ge=0.0, le=1.0, description="Historical acceptance rate [0, 1]")
    ] = 0.3
    historical_response_rate: Annotated[
        float | None, Field(ge=0.0, le=1.0, description="Alias for response rate")
    ] = None
    recency_score: Annotated[
        float | None, Field(ge=0.0, le=1.0, description="Normalized recency [0, 1]")
    ] = None
    total_past_donations: Annotated[int, Field(ge=0, le=500)] = 0
    days_since_last_donation: Annotated[int, Field(ge=0, le=5000)] = 120
    recent_alerts_count: Annotated[int, Field(ge=0, le=100)] = 0
    age: Annotated[int, Field(ge=18, le=65)]
    urgency: Literal["CRITICAL", "URGENT", "ROUTINE"] = "ROUTINE"
    hour_of_day: Annotated[int, Field(ge=0, le=23)]
    is_weekend: bool = False
    night_flag: Annotated[int | None, Field(ge=0, le=1)] = None

    def get_effective_response_rate(self) -> float:
        if self.historical_response_rate is not None:
            return self.historical_response_rate
        return self.prior_response_rate


# Backward-compatible alias for existing tests
DonorFeatureVector = DonorFeatureRow


class CandidatePrediction(BaseModel):
    donor_id: str
    probability: Annotated[
        float, Field(ge=0.0, le=1.0, description="Calibrated P(response | donor, request)")
    ]
    model_version: str = "v0.1.0-baseline"
    is_simulation: Literal[True] = True


class BatchResponsePredictionRequest(BaseModel):
    request_id: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_\-]+$")
    candidates: list[DonorFeatureRow] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Batch of up to 500 eligible candidates for response ranking",
    )


# Backward-compatible alias
PredictionRequest = BatchResponsePredictionRequest


class BatchResponsePredictionResponse(BaseModel):
    request_id: str
    predictions: list[CandidatePrediction]
    model_version: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    disclaimer: str = (
        "SIMULATION PROTOTYPE: Academic probability estimate only. No clinical guarantees."
    )


PredictionResponse = BatchResponsePredictionResponse


class TimeSeriesDataPoint(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date string YYYY-MM-DD")
    units: Annotated[float, Field(ge=0.0, description="Observed units demanded")]


class DemandForecastRequest(BaseModel):
    series: list[TimeSeriesDataPoint] = Field(
        ...,
        min_length=7,
        max_length=365,
        description="Historical chronological daily demand series (7-365 days)",
    )
    horizon: Annotated[int, Field(ge=1, le=30, description="Forecast horizon in days (1 to 30)")]
    blood_group: str | None = Field(default=None, max_length=10)
    component: str | None = Field(default=None, max_length=20)


class ForecastPoint(BaseModel):
    step: int = Field(..., ge=1, le=30, description="Forecast step 1..H")
    date: str | None = None
    predicted_units: Annotated[float, Field(ge=0.0, description="Point forecast units")]


class DemandForecastResponse(BaseModel):
    forecast: list[ForecastPoint]
    model_version: str
    horizon: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    disclaimer: str = (
        "SIMULATION PROTOTYPE: Academic blood demand forecast. Research prototype only."
    )
