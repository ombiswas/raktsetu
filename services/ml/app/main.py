"""
FastAPI application for RaktSetu ML Service.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.model import estimator
from app.schemas import PredictionRequest, PredictionResponse

app = FastAPI(
    title="RaktSetu ML Service",
    description="Emergency Blood Donor Response Probability Prediction (Research Simulation)",
    version="0.1.0",
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
    return {
        "status": "ok",
        "service": "raktsetu-ml",
        "simulation": True,
        "model_version": estimator.model_version,
    }


@app.post("/predict/response-probability", response_model=PredictionResponse)
def predict_response_probability(request: PredictionRequest) -> PredictionResponse:
    """
    Computes calibrated response probability P(response | donor, request, context).
    Hard deterministic eligibility and blood compatibility are verified PRIOR
    to this call in Node API.
    """
    if not request.candidates:
        raise HTTPException(status_code=400, detail="Candidate batch cannot be empty")

    predictions = estimator.predict_batch(request.candidates)

    return PredictionResponse(
        request_id=request.request_id,
        predictions=predictions,
    )
