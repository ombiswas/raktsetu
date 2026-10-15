# RaktSetu (रक्तसेतु) System Architecture & Research Protocol

> **CRITICAL RESEARCH PROTOTYPE DISCLAIMER**  
> RaktSetu is an academic research prototype demonstrating AI-assisted, geospatially aware emergency blood-donor prioritization. It is designed for study, benchmarking, and algorithmic evaluation. It makes **NO clinical decisions** and offers **NO clinical or operational guarantees**. All evaluation runs and synthetic benchmarks are strictly designated as **"SIMULATION"**.

---

## 1. System Overview & Problem Statement

Emergency blood shortages in healthcare facilities require rapid mobilization of replacement or voluntary donors. Traditional broadcast systems (SMS blasts, mass alerts) suffer from:
1. **Donor fatigue**: High blast volume causes voluntary donors to mute or ignore urgent alerts.
2. **Geospatial mismatch**: Alerting donors too far away introduces critical latency or high refusal rates.
3. **Blood mismatch risks**: Inaccurate or relaxed compatibility checks risk catastrophic mismatch.
4. **Privacy violations**: Exposing donor locations and phone numbers creates safety and privacy hazards.

RaktSetu resolves these issues through a two-stage decoupled architecture:
1. **Stage 1 (Deterministic Hard Boundary)**: A strict, zero-tolerance deterministic constraint engine that verifies biological blood compatibility, clinical eligibility, statutory donation intervals, and donor availability flags.
2. **Stage 2 (Geospatial & ML Prioritization)**: A calibrated machine learning model predicting $P(\text{response} \mid \text{donor}, \text{request}, \text{context})$, combined with a multi-objective ranking function in the Node.js API to optimize response likelihood while managing donor fatigue.

```
[ Hospital Request ] (Emergency need: Blood Group, Units, Lat/Lon, Urgency)
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Deterministic Hard Constraints Boundary (Zero ML, 100% Rule)  │
│ 1. Blood Compatibility (ABO / Rh exact matrix)                         │
│ 2. Clinical Eligibility (Age, Weight, Self-reported flags)             │
│ 3. Donation Interval (Whole blood >= 90 days since last donation)      │
│ 4. Availability Status (Active, donor opted-in, not paused)            │
│ 5. Geospatial Radius Filter (ST_DWithin PostGIS boundary)              │
└────────────────────────────────────────────────────────────────────────┘
         │ Eligible Candidate Subset (Passes 100% of hard criteria)
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Machine Learning Inference (services/ml)                      │
│ Input: Donor historical response features, time-of-day, distance, etc.  │
│ Output: P(response | donor, request, context) ∈ [0, 1]                 │
└────────────────────────────────────────────────────────────────────────┘
         │ Calibrated Response Probabilities
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Node API Decision & Dispatch Optimization (apps/api)          │
│ 1. Composite Multi-Objective Ranking (P(resp), Distance, Fatigue)      │
│ 2. Tiered Ring-Fenced Batch Dispatch (e.g., top-k notification via     │
│    pg-boss background jobs)                                            │
│ 3. Privacy-Preserving Distance Bucketing & Contact Cloaking           │
└────────────────────────────────────────────────────────────────────────┘
         │ Push / Notification Dispatch
         ▼
[ Selected Donors ] (Receive alert; contact revealed to hospital ONLY on acceptance)
```

---

## 2. Hard Research Boundaries

### 2.1 The Hard Deterministic Boundary (Zero ML Override)
Under no circumstances may an ML model, heuristic weight, or optimization algorithm relax or bypass any of the following deterministic rules:

1. **Blood Compatibility**:
   - Red Blood Cells (Whole Blood / Packed Red Blood Cells):
     - $O^-$ donors are universal red cell donors (can donate to all).
     - $O^+$ can donate to $O^+, A^+, B^+, AB^+$.
     - $A^-$ can donate to $A^-, A^+, AB^-, AB^+$.
     - $A^+$ can donate to $A^+, AB^+$.
     - $B^-$ can donate to $B^-, B^+, AB^-, AB^+$.
     - $B^+$ can donate to $B^+, AB^+$.
     - $AB^-$ can donate to $AB^-, AB^+$.
     - $AB^+$ can donate only to $AB^+$.
   - Plasma / Platelets (Inverted compatibility matrix where $AB$ is universal donor).
2. **Donation Interval (Cooldown)**:
   - Whole blood donation interval: Minimum **90 days** (12 weeks) between successive donations.
   - Platelet apheresis: Minimum **14 days**.
   - If `last_donation_date + interval > current_date`, donor is **strictly excluded**.
3. **Donor Eligibility**:
   - Age must be between **18 and 65 years**.
   - Body weight must be $\ge 45\text{ kg}$ (or statutory $\ge 50\text{ kg}$).
   - Current health status: Donor must not have active deferral flags (e.g., recent surgery, tattoos within 6 months, pregnancy, infection).
4. **Availability Status**:
   - Donor must have `is_available = true` and `status = 'ACTIVE'`.
   - Donors marked as 'PAUSED', 'DEFERRED', or 'INACTIVE' are disqualified immediately.
5. **Geospatial Range**:
   - Candidate must be physically within the maximum emergency dispatch radius ($d \le R_{\max}$ via PostGIS `ST_DWithin`).

### 2.2 Machine Learning Scope Boundary
- The ML service **never makes decisions, rejects donors, or triggers notifications**.
- The ML service exposes an isolated REST endpoint:
  $$\text{POST } /predict/response-probability$$
  which accepts a batch of candidate donor feature vectors and request context, returning strictly:
  $$\hat{p} = P(\text{response} = 1 \mid \mathbf{x}_{\text{donor}}, \mathbf{x}_{\text{request}}, \mathbf{x}_{\text{context}}) \in [0.0, 1.0]$$
- All dispatch rankings, thresholding, batch size allocations, and audit logging take place inside the Node API (`apps/api`).

---

## 3. Privacy & Security Architecture

### 3.1 Spatial Privacy & Contact Cloaking
1. **Exact Coordinates Never Disclosed**:
   - Hospitals, dashboard users, and third parties **NEVER** receive exact donor latitudes and longitudes.
   - PostGIS queries perform distance calculations in the database layer.
   - API responses return strictly **quantized/bucketed distances** (e.g., `3.5 km`, or within range `2-5 km`).
2. **Contact Details Cloaking (Zero-Knowledge until Consent)**:
   - Donor name, phone number, and email are never visible to the requesting hospital when candidates are alerted.
   - Only upon **explicit donor acceptance** of a specific emergency request does the system grant the hospital access to the donor's contact phone number for logistics coordination.
   - Upon request completion or cancellation, access tokens or contact visibility expire.

### 3.2 Authentication & Authorization (RBAC)
- **Passwords**: Hashed with `argon2id` (memory-hard, recommended OWASP configuration).
- **Access Tokens**: Short-lived JWT (15-minute lifespan) held strictly in client memory. Never stored in localStorage or sessionStorage.
- **Refresh Tokens**: Cryptographically secure random tokens with rotating family IDs, stored in encrypted `httpOnly`, `Secure`, `SameSite=Strict` cookies.
- **Role-Based Access Control (RBAC)**: Deny-by-default on all routes. Roles include:
  - `ADMIN`: Research administrator, audit inspection, system metrics.
  - `HOSPITAL`: Create blood requests, view status of assigned requests, view accepted donor contact info.
  - `DONOR`: Manage profile, toggle availability, respond to emergency alerts, view own donation history.

### 3.3 Audit Logging & PII Redaction
- Every state transition (request creation, candidate scoring, alert dispatch, donor acceptance/decline) writes an immutable record to the `audit_logs` table.
- Pino logging pipeline incorporates automated redaction regexes for email, phone numbers, coordinates, passwords, and authorization tokens.

---

## 4. Layering & Software Architecture

### 4.1 `apps/api` Architecture (Node 22 + Fastify 5 + Drizzle)
Each feature module (`modules/<feature>/`) follows a strict 3-tier decoupled structure:
- `<name>.routes.ts`: Fastify route definitions, Zod schema attachments, RBAC hooks.
- `<name>.controller.ts`: Request parsing, HTTP status resolution, response formatting. Zero business logic.
- `<name>.service.ts`: Business logic, domain rule enforcement, orchestration. Injected with repository interfaces.
- `<name>.repository.ts`: Database access via Drizzle ORM and PostGIS SQL queries. Only code interacting with PostgreSQL.
- `<name>.schema.ts`: Zod validation schemas for params, querystring, request body, and response DTOs.
- `<name>.types.ts`: TypeScript interfaces and domain types.

#### The `matching` Module Specialization
The `matching` engine is structured according to Clean Architecture:
- `domain/`: Pure TypeScript functions with zero I/O and zero dependencies. Contains blood compatibility matrix evaluation, eligibility filters, and multi-objective ranking math.
- `application/`: Use cases orchestrating the matching pipeline (`FindEligibleDonorsUseCase`, `ScoreAndRankCandidatesUseCase`, `DispatchAlertBatchesUseCase`).
- `infrastructure/`: PostGIS geospatial repository (`PostgisCandidateRepository`), ML client (`HttpMlClient`).

### 4.2 `services/ml` Architecture (Python 3.12 + FastAPI + XGBoost)
- `app/`: FastAPI application, Pydantic v2 schemas for inference requests/responses, model loading.
- `training/`: Synthetic data generation, feature engineering, model training, cross-validation, and calibration curves.
- `tests/`: Pytest suite verifying boundary conditions, schema adherence, and output bounds $[0, 1]$.

### 4.3 `apps/web` Architecture (React 19 + Vite + Tailwind v4)
- Consumes the API strictly through the typed contract generated by `openapi-typescript`.
- UI tokens strictly comply with `design.md` (near-black `#0a0a0a` canvas, outline pills, universalSans / GeistMono typography, no custom UI libraries).
- Displays prominent **"SIMULATION PROTOTYPE"** banners on all dashboard views.

---

## 5. Background Jobs & Notification Pipeline

The platform uses `pg-boss` (PostgreSQL-backed job queue):
- **Zero Redis requirement**: Avoids external stateful services and keeps free-tier deployment lightweight.
- **Job Queues**:
  - `match-and-dispatch`: Triggered on emergency blood request creation.
  - `escalate-batch`: Schedules next tier dispatch if insufficient donors accept within the timeout window (e.g. 10 minutes).
  - `send-web-push`: Asynchronous Web Push notification delivery using VAPID keys.
  - `audit-event`: Asynchronous audit log persistence.

---

## 6. System Architecture Diagram

```mermaid
flowchart TB
    subgraph Client["Client Tier (Vercel)"]
        Browser["User Browser\n(Donor / Hospital / Blood Bank / Admin)"]
        Web["apps/web (React 19 + Vite)\nSame-Origin /api Rewrite"]
    end

    subgraph Platform["Application & Compute Tier (Render)"]
        API["apps/api (Node 22 + Fastify 5)\n- Deterministic Hard Constraints\n- Hybrid Multi-Objective Ranker\n- Output Shaping & PII Redaction"]
        ML["services/ml (Python 3.12 + FastAPI)\n- XGBoost Calibrated Classifier\n- Isolated P(response) Inference"]
        Workers["pg-boss Workers (In-Process / Background)\n- Batch Escalation Timeouts\n- Request Expiry Reaper\n- Demand Forecasting Nightly"]
    end

    subgraph Data["Data & Persistence Tier (Neon PostgreSQL)"]
        Postgres["PostgreSQL 16 Database\n- Relational Core Schemas\n- PostGIS Geometry & GiST Indexes\n- pgboss Job Queues & State Machine"]
    end

    subgraph External["External Notification Services"]
        WebPush["Web Push Gateway\n(VAPID / RFC 8291)"]
        EmailGW["Email Dispatcher\n(Resend / Brevo / Console)"]
    end

    Browser -->|HTTPS / WSS| Web
    Web -->|Rewrite: /api/* -> API| API
    API -->|Internal Bearer HTTP / 800ms Timeout| ML
    API -->|TCP / SSL Pool (Max 10)| Postgres
    Workers -->|SKIP LOCKED Queries| Postgres
    API -->|Web Push Dispatch| WebPush
    API -->|Transaction Mail| EmailGW
    WebPush -.-> Browser
```

---

## 7. API Specification & OpenAPI Documentation

RaktSetu automatically maintains an OpenAPI 3.1 specification generated from Fastify Zod route definitions:
- The authoritative specification is persisted at [`docs/openapi.json`](file:///d:/Backup/Projects/raktsetu/docs/openapi.json).
- Generated via CLI: `npm --prefix apps/api run openapi:generate`.
- When running in non-production mode, interactive Swagger UI is available at `/docs` (e.g. `http://localhost:3000/docs`).
- The web frontend generates strong TypeScript bindings from this schema via `openapi-typescript`.

---

## 8. Honest Limitations & Operational Assumptions

1. **Synthetic Data and Simulation Only**:
   - All donor profiles, historical response traces, emergency blood requests, and demand arrival patterns are generated through statistical simulations (`src/modules/experiments/fixture-generator.ts`).
   - The ML response predictor is calibrated on synthetic probabilistic distributions. The system has **not been tested or clinically validated** in live hospital environments.
2. **Not For Clinical Use**:
   - RaktSetu is an educational research and engineering demonstration prototype.
   - It makes **no medical diagnoses, no triage judgments, and zero guarantees** of blood safety or donor availability.
   - All physical blood donations must undergo standard clinical pre-screening, hemoglobin testing, and serological cross-matching by certified healthcare professionals.
3. **Free-Tier Infrastructure Cold Starts**:
   - On free hosting tiers (Render Web Services and Neon Serverless PostgreSQL), compute instances scale to zero after 15 minutes of idle traffic.
   - Initial cold-start wakeups may take **30 to 60 seconds**, temporarily pausing active pg-boss expansion timers or delaying SSE event delivery until the server spins up.
4. **Coarse Spheroidal Distance vs. Real-Time Road Traffic**:
   - Candidate distances are computed via PostGIS `ST_Distance(location::geography)` as geodesic great-circle arc lengths on the WGS84 spheroid.
   - Great-circle distance does not account for urban traffic congestion, bridge crossings, or terrain barriers. In production, this would be supplemented with a routing matrix API (e.g. OSRM or OpenRouteService).

