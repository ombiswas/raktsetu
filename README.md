# RaktSetu (रक्तसेतु)

> **AI-Assisted, Geospatially Aware Emergency Blood-Donor Prioritization Prototype**  
> *Academic Research & Engineering Simulation Project*

---

> [!IMPORTANT]
> **ACADEMIC PROTOTYPE NOTICE**  
> RaktSetu is a research prototype designed for algorithmic study and simulation benchmarking. It makes **NO clinical or diagnostic decisions** and provides **NO operational guarantees**. All donor traces and emergency evaluations are designated strictly as **SIMULATION**. Real-world transfusions require strict immunohematology cross-matching and licensed clinical oversight.

---

## 1. Overview & Core Architecture

In critical medical emergencies (trauma surgeries, obstetric hemorrhages, acute anemia), traditional broadcast dispatch methods (e.g., mass SMS blasts, uncoordinated WhatsApp groups) suffer from three structural failures:
1. **Donor Alert Fatigue**: Donors are repeatedly spammed for blood requests they are ineligible or unable to fulfill.
2. **Geospatial Latency**: Alerts ignore physical transit distances and road travel constraints.
3. **Severe Privacy Breaches**: Unprotected contact lists expose donor medical status and phone numbers to arbitrary broadcast groups.

RaktSetu solves this through a **decoupled, three-pillar architecture**:

```
                                 [ Hospital Emergency Request ]
                                                │
                                                ▼
                   ┌─────────────────────────────────────────────────────────┐
                   │    Pillar 1: Deterministic Hard Constraint Boundary     │
                   │  • ABO/Rh biological compatibility matrix               │
                   │  • Statutory donation intervals (e.g., 90-day cooldown) │
                   │  • Weight, age, and clinical eligibility gates          │
                   │  (ML is strictly prevented from overriding biology)     │
                   └────────────────────────────┬────────────────────────────┘
                                                │ Eligible Candidates
                                                ▼
                   ┌─────────────────────────────────────────────────────────┐
                   │     Pillar 2: Geospatial & ML Prioritization Engine     │
                   │  • PostGIS GiST index radius filtering (e.g., 5-15 km)   │
                   │  • Calibrated XGBoost response probability P(response|x)│
                   │  • Multi-objective fatigue mitigation ranking score     │
                   └────────────────────────────┬────────────────────────────┘
                                                │ Ranked Rings
                                                ▼
                   ┌─────────────────────────────────────────────────────────┐
                   │         Pillar 3: Zero-Knowledge Privacy Cloaking       │
                   │  • Exact GPS coordinates never leave the database       │
                   │  • Distances quantized into privacy bands (<2km, 2-5km) │
                   │  • PII & phone numbers cloaked until explicit consent   │
                   └─────────────────────────────────────────────────────────┘
```

---

## 2. Monorepo Structure

```
raktsetu/
├── apps/
│   ├── api/               # Fastify 5 + TypeScript + Drizzle ORM (Port 3000)
│   │   ├── src/           # Modular domain architecture (matching, donors, dispatch)
│   │   ├── drizzle/       # PostgreSQL + PostGIS schema migrations
│   │   └── tests/         # Unit, integration, and security test suites
│   └── web/               # React 19 + Vite 6 + Tailwind CSS (Port 5173)
│       ├── src/           # Portals for Admin, Hospital, Blood Bank, and Donors
│       └── public/        # Static assets
├── services/
│   └── ml/                # FastAPI + Python 3.12+ + XGBoost (Port 8000)
│       ├── app/           # Calibrated response probability & demand forecasting
│       ├── models/        # Serialized model artifacts with SHA-256 tamper verification
│       └── training/      # Synthetic trajectory generation & training pipelines
├── experiments/           # Algorithmic benchmark runner & reproducibility configs
├── infra/                 # Docker Compose configuration for PostgreSQL + PostGIS
├── docs/                  # Architecture specs, ADRs, security reviews, and runbook
└── scripts/               # End-to-end smoke tests and migration scripts
```

---

## 3. Prerequisites

Ensure the following runtimes and tools are installed on your system:

| Tool | Recommended Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 22.0.0` | Backend API and Web frontend |
| **npm** | `>= 10.0.0` | Package manager |
| **Python** | `>= 3.12.0` | Machine learning microservice |
| **uv** | `>= 0.4.0` | High-speed Python package & environment manager |
| **PostgreSQL** | `>= 16.0` (with PostGIS `>= 3.4`) | Spatial database (Neon Cloud or local Docker) |

---

## 4. Local Setup & Running Guide

### 4.1 Environment Configuration

Each service provides a template `.env.example`. Create the respective `.env` files:

1. **API Service** (`apps/api/.env`):
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   *Set `DATABASE_URL` to your PostgreSQL instance (e.g. Neon connection string or `postgres://postgres:postgrespassword@localhost:5432/raktsetu`).*

2. **Web Client** (`apps/web/.env`):
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```
   *(Defaults to `VITE_API_URL=/api`, which Vite proxies to port 3000).*

3. **ML Service** (`services/ml/.env`):
   ```bash
   cp services/ml/.env.example services/ml/.env
   ```
   *(Defaults to `PORT=8000`, `INTERNAL_API_TOKEN=raktsetu-dev-ml-token-secret-2026`).*

---

### 4.2 Database Initialization & Seeding

Run the Drizzle schema migrations and populate initial simulation fixtures:

```bash
# 1. Apply database migrations
npm --prefix apps/api run db:migrate

# 2. Seed pre-configured fixtures (Hospitals, Blood Banks, and ~300 Donors)
npm --prefix apps/api run db:seed
```

---

### 4.3 Starting the Services

Run each service in a separate terminal:

#### Terminal 1: Backend API
```powershell
cd apps/api
npm run dev
```
* **URL**: [http://localhost:3000](http://localhost:3000)
* **Swagger OpenAPI Docs**: [http://localhost:3000/docs](http://localhost:3000/docs)
* **Health Check**: `GET http://localhost:3000/health/live`

#### Terminal 2: ML Inference Microservice
```powershell
cd services/ml
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
* **URL**: [http://localhost:8000](http://localhost:8000)
* **Health Check**: `GET http://localhost:8000/health`

#### Terminal 3: Web Application
```powershell
cd apps/web
npm run dev
```
* **URL**: [http://localhost:5173](http://localhost:5173)

---

## 5. Seeded Demo Accounts

The database comes pre-seeded with test profiles across all system roles:

| Role | Email | Password | Features Accessible |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@raktsetu.internal` | `Admin@RaktSetu2026!` | Verification queues (`/admin/accounts`), audit logs |
| **Hospital** | `doon.hospital@hospitals.internal` | `DevHospitalPass2026!` | Emergency request creation, matching radar |
| **Hospital (Alt)** | `max.hospital@hospitals.internal` | `DevHospitalPass2026!` | Alternate hospital dispatch portal |
| **Blood Bank** | `ima.bloodbank@bloodbanks.internal` | `DevHospitalPass2026!` | Inventory tracking & blood component stock |
| **Volunteer Donor** | `simulated.donor.1@raktsetu.simulation` | `DevDonorPass2026!` | Donor portal, real-time alert SSE stream, availability toggle |

*(Donors from `simulated.donor.1@raktsetu.simulation` to `simulated.donor.300@raktsetu.simulation` share password `DevDonorPass2026!`)*

---

## 6. Research Benchmark Experiments

To reproduce comparative algorithmic experiments across dispatch policies (Baseline Proximity, ML-Only, Geography-Only, and Full Hybrid):

```powershell
# Run benchmark simulation suite
npm --prefix apps/api run exp:run -- --config experiments/configs/standard_run.json
```

Outputs containing time-to-first-response, fatigue penalties, and fulfillment rates are saved into `experiments/results/`.

---

## 7. Testing & Quality Assurance

```powershell
# API Typecheck, Lint, and Unit/Integration Tests
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run test

# Web Client Typecheck and Tests
npm --prefix apps/web run typecheck
npm --prefix apps/web run test

# ML Service Tests & Linting
cd services/ml
uv run ruff check .
uv run pytest
```

---

## 8. Troubleshooting

### Port 3000 Already in Use (`EADDRINUSE`)
If a background Node instance holds port 3000, find and terminate it via PowerShell:

```powershell
# Stop process holding port 3000
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
```

### Cold Starts with Neon / Cloud Database
When using free-tier serverless PostgreSQL, the database may suspend after 15 minutes of inactivity. Initial connection attempts may experience a 10–20 second delay while compute resumes.

---

## 9. License

This project is released under the **MIT License** for academic, research, and educational demonstration purposes.
