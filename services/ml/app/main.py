"""
FastAPI application for RaktSetu ML Service.
Provides authenticated endpoints for response probability estimation and demand forecasting.
Does not expose documentation publicly.
"""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_ml_service_token
from app.model import estimator, forecaster
from app.schemas import (
    BatchResponsePredictionRequest,
    BatchResponsePredictionResponse,
    DemandForecastRequest,
    DemandForecastResponse,
)

app = FastAPI(
    title="RaktSetu ML Service",
    description="Emergency Blood Donor Response Estimation & Forecasting (Simulation Prototype)",
    version="0.2.0",
    docs_url=None,  # Do not expose the service documentation publicly
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str | bool]:
    """
    Public liveness and readiness probe.
    Does not require authentication.
    """
    return {
        "status": "ok",
        "service": "raktsetu-ml",
        "simulation": True,
        "model_version": estimator.model_version,
        "forecast_model_version": forecaster.model_version,
    }


@app.post(
    "/v1/predict/response",
    response_model=BatchResponsePredictionResponse,
    dependencies=[Depends(verify_ml_service_token)],
)
def predict_response(
    request: BatchResponsePredictionRequest,
) -> BatchResponsePredictionResponse:
    """
    Computes calibrated response probabilities for a batch of up to 500 eligible candidates.
    Requires Bearer token authentication.
    """
    if not request.candidates:
        raise HTTPException(status_code=400, detail="Candidate batch cannot be empty")
    if len(request.candidates) > 500:
        raise HTTPException(status_code=400, detail="Maximum batch size of 500 exceeded")

    predictions = estimator.predict_batch(request.candidates)

    return BatchResponsePredictionResponse(
        request_id=request.request_id,
        predictions=predictions,
        model_version=estimator.model_version,
    )


@app.post(
    "/v1/forecast",
    response_model=DemandForecastResponse,
    dependencies=[Depends(verify_ml_service_token)],
)
def forecast_demand(
    request: DemandForecastRequest,
) -> DemandForecastResponse:
    """
    Forecasts emergency blood units demanded over horizon H days.
    Requires Bearer token authentication.
    """
    forecast_points = forecaster.forecast(request)

    return DemandForecastResponse(
        forecast=forecast_points,
        model_version=forecaster.model_version,
        horizon=request.horizon,
    )


# Backward-compatible endpoint for existing tests
@app.post(
    "/predict/response-probability",
    response_model=BatchResponsePredictionResponse,
)
def predict_response_probability_legacy(
    request: BatchResponsePredictionRequest,
) -> BatchResponsePredictionResponse:
    """
    Legacy route maintained for backwards compatibility.
    """
    if not request.candidates:
        raise HTTPException(status_code=400, detail="Candidate batch cannot be empty")

    predictions = estimator.predict_batch(request.candidates)

    return BatchResponsePredictionResponse(
        request_id=request.request_id,
        predictions=predictions,
        model_version=estimator.model_version,
    )
