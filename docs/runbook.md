# RaktSetu (रक्तसेतु) Operations Runbook

> **ACADEMIC PROTOTYPE NOTICE**  
> RaktSetu is a research prototype for algorithmic study and demonstration. It makes **NO clinical decisions** and offers **NO clinical or operational guarantees**. Results from synthetic benchmarks are strictly designated as **"SIMULATION"**.

---

## 1. Prerequisites & Environment Setup

| Component | Required Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 22.0.0` | Node API (`apps/api`) & Web client (`apps/web`) |
| **npm** | `>= 10.0.0` | Package management across monorepo |
| **Python** | `>= 3.12.0` | Machine Learning inference & training (`services/ml`) |
| **uv** | `>= 0.4.0` | Ultra-fast Python package & virtualenv manager |
| **PostgreSQL** | `>= 16.0` | Primary relational database |
| **PostGIS** | `>= 3.4` | Spatial extensions for geospatial indexing & distance math |
| **Docker (optional)** | `>= 24.0` | Local containerized PostgreSQL with PostGIS |

---

## 2. Environment Variables Reference

### 2.1 API Service (`apps/api/.env`)

| Variable | Type | Default (Dev) | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `enum` | `development` | Runtime mode: `development`, `test`, `production` |
| `PORT` | `number` | `3000` | Port Fastify binds to |
| `HOST` | `string` | `0.0.0.0` | Host interface |
| `DATABASE_URL` | `string` | `postgres://...` | Connection URI to PostgreSQL (must include credentials and sslmode in prod) |
| `JWT_ACCESS_SECRET` | `string` | *(32+ chars dev key)* | Secret key for signing short-lived access JWTs (min 32 chars) |
| `JWT_ISSUER` | `string` | `raktsetu-api` | JWT issuer claim (`iss`) |
| `COOKIE_SECRET` | `string` | *(32+ chars dev key)* | Secret for signing secure session cookies |
| `COOKIE_SECURE` | `boolean` | `true` (in prod) | Enforce HTTPS-only cookie transmission |
| `COOKIE_SAME_SITE` | `enum` | `strict` | Cookie isolation mode (`strict`, `lax`, `none`) |
| `CORS_ORIGINS` | `string` | `http://localhost:5173,...` | Comma-separated list of allowed origins |
| `ML_SERVICE_URL` | `string` | `http://localhost:8000` | Base URL of the Python ML prediction service |
| `ML_SERVICE_TOKEN` | `string` | `raktsetu-dev-...` | Shared Bearer token for authenticating ML inference requests |
| `MATCHING_ALGORITHM`| `enum` | `hybrid` | Matching strategy: `hybrid` (ML + Proximity) or `baseline` (Proximity only) |
| `MATCHING_BATCH_SIZE`| `number` | `5` | Number of donors notified per escalation ring |
| `MATCHING_BATCH_WINDOW_SECONDS` | `number` | `300` | Window before escalating to the next candidate ring (seconds) |
| `DB_POOL_MAX` | `number` | `10` | Maximum connections in PostgreSQL connection pool |
| `DB_IDLE_TIMEOUT_MS`| `number`| `30000` | Milliseconds before idle database connection is closed |
| `DB_STATEMENT_TIMEOUT_MS` | `number` | `10000` | Max statement execution duration before database timeout |
| `EMAIL_PROVIDER` | `enum` | `mock` | Delivery provider: `mock` (console logging), `resend`, `brevo` |
| `EMAIL_API_KEY` | `string` | *(optional)* | API key for Resend or Brevo |
| `VAPID_PUBLIC_KEY` | `string` | *(optional)* | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY`| `string` | *(optional)* | Web Push VAPID private key |
| `VAPID_SUBJECT` | `string` | `mailto:...` | Contact URI for Web Push notifications |
| `TRUST_PROXY` | `boolean` | `false` | Enable reverse proxy IP resolution (required behind Render/Vercel) |

### 2.2 Web Client (`apps/web/.env`)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | `string` | `/api` | Base path for API requests (uses Vite proxy in dev, Vercel rewrite in prod) |

### 2.3 ML Service (`services/ml/.env`)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | `number` | `8000` | Port FastAPI binds to |
| `HOST` | `string` | `0.0.0.0` | Host interface |
| `INTERNAL_API_TOKEN`| `string` | `raktsetu-dev-...` | Token checked against inbound `Authorization: Bearer <token>` |
| `MODEL_PATH` | `string` | `app/models/response_model.joblib` | Path to serialized trained model artifact |

---

## 3. Database Setup & Migration

### 3.1 Initializing PostGIS Extension
Before running schema migrations on any new PostgreSQL database (e.g. Neon or fresh local Docker container), enable the PostGIS extension:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 3.2 Running Migrations
Migrations are managed with Drizzle Kit:
```bash
# Generate new migration files if schema changes:
npm --prefix apps/api run db:generate

# Apply pending migrations to the database:
npm --prefix apps/api run db:migrate
```

### 3.3 Seeding Initial Demo Data
To populate hospitals, blood banks, donor profiles, and mock inventory:
```bash
npm --prefix apps/api run db:seed
```
The seeder provisions:
- **Admin**: `admin@raktsetu.org` / `AdminSecret2026!`
- **Hospital**: `metro.hospital@raktsetu.org` / `HospitalSecret2026!`
- **Blood Bank**: `central.bank@raktsetu.org` / `BankSecret2026!`
- **Donors**: Multiple pre-registered donors with varied blood groups and locations in Delhi NCR.

---

## 4. Machine Learning Model Training

The ML service trains a calibrated classifier on synthetic emergency dispatch trajectories:
```bash
cd services/ml

# Install dependencies into uv environment
uv sync

# Run training pipeline (generates synthetic traces, trains XGBoost, evaluates ROC-AUC)
uv run python -m app.training.train

# Run unit and validation tests
uv run pytest
```
The trained model artifact is saved to `services/ml/app/models/response_model.joblib`.

---

## 5. Serving Locally

### 5.1 Terminal 1: API Server
```bash
npm --prefix apps/api run dev
# Starts Fastify on http://localhost:3000
# Interactive Swagger docs available at http://localhost:3000/docs
```

### 5.2 Terminal 2: ML Inference Service
```bash
cd services/ml
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Starts FastAPI on http://localhost:8000
```

### 5.3 Terminal 3: Web Application
```bash
npm --prefix apps/web run dev
# Starts Vite on http://localhost:5173
```

---

## 6. Running Research Experiments

To reproduce comparative benchmarks across dispatch algorithms (Baseline Proximity, Hybrid Full, ML-Only, Geography-Only):
```bash
# Execute experiment runner CLI against standard config:
npm --prefix apps/api run exp:run -- --config experiments/configs/standard_run.json
```
Metrics (time to first accept, fulfilment rates, contact counts, radius expansions) are written to `experiments/results/`.

---

## 7. Health Checks and Monitoring

| Endpoint | Method | Expected Status | Purpose |
| :--- | :--- | :--- | :--- |
| `/health/live` | `GET` | `200 OK` | Liveness check (process running) |
| `/health/ready`| `GET` | `200 OK` (or `503 Service Unavailable`) | Readiness probe (verifies live PostgreSQL connectivity) |
| `/v1/notifications/stream` | `GET` | `200 OK` (SSE) | Real-time event channel with heartbeat |

---

## 8. Honest Limitations & Operational Realities

1. **Synthetic Data and Simulation**:
   - The system is evaluated entirely on synthetic donor behavior and simulated hospital requests.
   - It has **never been evaluated in live clinical environments**.
2. **Not For Clinical Use**:
   - RaktSetu is an educational research and engineering demonstration prototype.
   - It makes **no medical diagnoses, no triage decisions, and zero guarantees** of blood safety or donor availability.
   - Real-world blood transfusions require physical immunohematology testing and doctor oversight.
3. **Free-Tier Infrastructure Cold Starts**:
   - When deployed on Render free web services and Neon serverless databases, compute instances scale down after 15 minutes of inactivity.
   - A cold-start request will incur a **30–60 second latency delay**, during which active pg-boss expansion timers are paused until the runtime environment resumes execution.
4. **Distance Simplification**:
   - Spatial searches use PostGIS geodesic distances on the WGS84 spheroid. Road traffic, physical barriers, and transit availability are not modeled.
