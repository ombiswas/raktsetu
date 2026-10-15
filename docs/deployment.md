# RaktSetu (रक्तसेतु) Free-Tier Deployment Guide & Checklist

**Target Cloud Architecture**:
- **Database**: [Neon](https://neon.tech) (Serverless PostgreSQL 16 + PostGIS)
- **Backend API**: [Render](https://render.com) Web Service (Node 22 / Fastify 5)
- **Machine Learning**: [Render](https://render.com) Web Service (Python 3.12 / FastAPI)
- **Web Frontend**: [Vercel](https://vercel.com) (React 19 / Vite with `/api` reverse proxy rewrite)

---

## 1. Pre-Deployment Security Checklist

Before triggering any cloud builds:

- [ ] **No Secrets Committed**:
  Verify zero secrets or environment files in git history:
  ```bash
  git log --all -- design.md  # Must return empty
  git log --all -- .env       # Must return empty
  ```
- [ ] **Dependency Audits Clean**:
  ```bash
  npm --prefix apps/api audit --omit=dev  # 0 vulnerabilities
  npm --prefix apps/web audit --omit=dev  # 0 vulnerabilities
  cd services/ml && uv run --with pip-audit pip-audit  # 0 vulnerabilities
  ```
- [ ] **Lockfiles Committed**:
  Ensure `apps/api/package-lock.json`, `apps/web/package-lock.json`, and `services/ml/uv.lock` are tracked.
- [ ] **Generate Production Secrets**:
  Generate three high-entropy cryptographically random strings (minimum 32 characters each):
  ```bash
  # In PowerShell or Bash:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Save these temporarily for inputting into provider dashboards:
  1. `JWT_ACCESS_SECRET`
  2. `COOKIE_SECRET`
  3. `ML_SERVICE_TOKEN` / `INTERNAL_API_TOKEN`

---

## 2. Step-by-Step Deployment Procedure

### Step 1: Provision Neon PostgreSQL
1. Sign in to [Neon](https://console.neon.tech).
2. Create a new project: `raktsetu-db` (Region: `US East` or nearest).
3. Open the **SQL Editor** in Neon Dashboard and enable the PostGIS spatial extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
4. Copy the connection string. Ensure it includes `?sslmode=require`:
   ```
   postgres://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

### Step 2: Deploy Python ML Service on Render
Deploy the ML service first so its private/public URL is ready for the API.

1. Sign in to [Render](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (`raktsetu`).
4. Configure service settings:
   - **Name**: `raktsetu-ml`
   - **Region**: `Oregon` (or match database region)
   - **Branch**: `main`
   - **Root Directory**: `services/ml`
   - **Runtime**: `Python`
   - **Build Command**: `pip install uv && uv sync`
   - **Start Command**: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
5. Configure Environment Variables in the Render Dashboard:
   - `PORT`: `8000`
   - `HOST`: `0.0.0.0`
   - `INTERNAL_API_TOKEN`: *(paste the generated ML secret)*
6. Click **Deploy Web Service**.
7. Once deployed, copy the internal service URL (e.g. `http://raktsetu-ml:8000`) or public service URL (e.g. `https://raktsetu-ml.onrender.com`).

---

### Step 3: Deploy Fastify API on Render
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Connect the same repository (`raktsetu`).
3. Configure service settings:
   - **Name**: `raktsetu-api`
   - **Region**: `Oregon`
   - **Branch**: `main`
   - **Root Directory**: `apps/api`
   - **Runtime**: `Node`
   - **Build Command**: `npm ci && npm run build`
   - **Pre-Deploy Command**: `npm run db:release`  *(Executes PostGIS extension verification and Drizzle migrations!)*
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. Configure Environment Variables in the Render Dashboard:
   | Variable | Value |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `HOST` | `0.0.0.0` |
   | `TRUST_PROXY` | `true` |
   | `DATABASE_URL` | *(paste Neon connection string with sslmode=require)* |
   | `JWT_ACCESS_SECRET` | *(paste generated 32+ char secret)* |
   | `COOKIE_SECRET` | *(paste generated 32+ char secret)* |
   | `COOKIE_SECURE` | `true` |
   | `COOKIE_SAME_SITE` | `strict` |
   | `CORS_ORIGINS` | `https://raktsetu.vercel.app` *(or your Vercel URL)* |
   | `ML_SERVICE_URL` | `http://raktsetu-ml:8000` *(or https://raktsetu-ml.onrender.com)* |
   | `ML_SERVICE_TOKEN` | *(must match INTERNAL_API_TOKEN from ML service)* |
   | `DB_POOL_MAX` | `10` |
   | `DB_IDLE_TIMEOUT_MS` | `30000` |
   | `DB_STATEMENT_TIMEOUT_MS` | `10000` |
5. Click **Deploy Web Service**.
6. Seed the database with demo users:
   In the Render Web Shell (or locally pointed to `DATABASE_URL`):
   ```bash
   DATABASE_URL="<neon-url>" npm --prefix apps/api run db:seed
   ```
7. Verify health endpoints:
   ```bash
   curl https://raktsetu-api.onrender.com/health/live
   # {"status":"ok"}
   curl https://raktsetu-api.onrender.com/health/ready
   # {"status":"ready","database":"connected"}
   ```

---

### Step 4: Deploy Web Frontend on Vercel
1. Sign in to [Vercel](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository (`raktsetu`).
4. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm ci`
5. Configure Environment Variables:
   - `VITE_API_URL`: `/api`
6. Verify `/api` reverse proxy rewrite:
   `apps/web/vercel.json` automatically routes `/api/:path*` to `https://raktsetu-api.onrender.com/:path*`.
   Ensure `destination` in `vercel.json` matches your Render API URL.
7. Click **Deploy**.

---

## 3. Post-Deployment Smoke Verification

Run the automated smoke test script against your live stack:
```bash
API_BASE_URL=https://raktsetu-api.onrender.com npm run smoke
```
The script automatically tests:
1. Health liveness & PostGIS readiness probes
2. Admin authentication
3. Hospital registration & administrative approval
4. Eligible donor registration with GPS coordinates
5. Emergency blood request creation
6. Geospatial matching engine execution
7. Volunteer donor acceptance response
8. Consent-based contact reveal verification
9. Donor privacy preservation (zero coordinate leaks)
10. Final request fulfillment transition

---

## 4. Free-Tier Operational Reminders & Gotchas

| Platform | Free-Tier Behavior | Mitigation |
| :--- | :--- | :--- |
| **Render Web Services** | Spins down after 15 minutes of idle traffic. Cold start takes 30–50s. | Normal on free tier. Display user-friendly loading skeletons; warmup ping script prior to demo. |
| **Neon PostgreSQL** | Serverless compute suspends after 5 min idle. | Pool connection timeout set to 5000ms with retry logic; `DB_POOL_MAX` capped at 10 to avoid connection exhaust. |
| **pg-boss Timers** | If Render service sleeps, in-memory timeout triggers are deferred until instance wake. | `pg-boss` polls database upon waking and immediately processes all expired batch windows. |
