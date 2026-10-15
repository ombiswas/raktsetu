# ADR 0008: Separate Python ML Service Over In-Process Node.js Inference

## Status
Accepted

## Context
RaktSetu relies on machine learning (specifically calibrated gradient-boosted trees and probabilistic classifiers via XGBoost / LightGBM / scikit-learn) to predict the conditional donor response probability $P(\text{response} \mid \text{donor}, \text{request}, \text{context})$.

We evaluated two deployment topologies:
1. Running ONNX / TensorFlow.js / Python bindings in-process within the Node.js API.
2. Isolating ML training, evaluation, and inference inside an independent Python microservice (`services/ml`) communicating over HTTP/JSON with the Node API.

## Decision
1. **Decouple ML into an Independent Python Service**:
   - Host model training, feature preprocessing, hyperparameter optimization, and inference in `services/ml` built with Python 3.12, FastAPI, and uv.
   - Restrict ML service responsibilities exclusively to:
     $$\text{POST } /v1/predict/response \implies \hat{p} \in [0.0, 1.0]$$
2. **Node API Remains Authoritative Orchestrator**:
   - Decision-making, deterministic hard constraint gating, ranking formulas, batch window timeouts, notification dispatches, and audit trails reside 100% in `apps/api`.
3. **Resilience & Fault Isolation**:
   - The Node API interacts with the ML service through `HttpMlClient`, which enforces an 800ms timeout (`AbortSignal.timeout`) and a circuit breaker (`CLOSED`, `OPEN`, `HALF_OPEN`).
   - If the ML service is unreachable, cold-starting, or failing, the Node API fails open to the deterministic proximity ranking strategy (`ProximityRanker`).

## Consequences
- **Positive**: Native access to state-of-the-art Python ML libraries (scikit-learn, XGBoost, pandas, NumPy); fault isolation prevents heavy ML matrix operations or memory spikes from blocking the Fastify event loop; independent scaling and free-tier deployment on Render.
- **Negative**: Adds a network hop between API and ML (budgeted at $\le 50\text{ ms}$ over internal networking; bounded by an 800ms client timeout).
