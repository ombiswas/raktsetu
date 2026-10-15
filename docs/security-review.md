# RaktSetu Security Review Record

**Date**: October 2026  
**Status**: Final Review Complete — Zero Open High/Critical Findings  
**Target Environment**: Neon PostgreSQL (PostGIS) + Render (API / ML) + Vercel (Web)  
**Classification**: Educational Research Prototype (Simulated Emergency Blood Matching)

---

## 1. Executive Summary

This security review covers the full stack of RaktSetu, encompassing `apps/api` (Node 22 / Fastify 5), `apps/web` (React / Vite), and `services/ml` (Python / FastAPI). As an emergency healthcare research prototype handling sensitive donor geography, medical eligibility attributes, and real-time dispatch matching, RaktSetu operates under strict privacy-preserving and defense-in-depth architectural mandates.

All automated route registries, role-based authorization matrices, parameterization checks, secret history scans, dependency audits, PII log redaction filters, and privacy contracts have been executed and verified. **There are 0 open critical or high severity security findings.**

---

## 2. Authentication and Authorization (AuthN / AuthZ)

### 2.1 Route Registry Enforcement
RaktSetu implements an automated route audit test (`apps/api/tests/integration/route-registry.test.ts`) that inspects the live Fastify route tree using `RouteRegistry.findViolations()`. The test guarantees that:
- Every non-public endpoint explicitly declares `config.auth: true`.
- Every non-public endpoint declares an explicit `config.roles: Role[]` allowlist.
- Every route handler attaches the `preHandler` tuple `[authenticate, authorize(...)]`.

#### Finding & Resolution:
- **Finding SEC-01 (Medium)**: The notifications route family (`/stream`, `/`, `/:id/read`, `/push-subscription`) lacked explicit `roles` declarations and the RBAC guard in `notifications.routes.ts`.
- **Resolution**: Updated `notifications.routes.ts` with `preHandler: [authenticate, authorize('donor', 'hospital', 'blood_bank', 'admin')]` and matching `config.roles` configuration.
- **Verification**: `tests/integration/route-registry.test.ts` passes with **0 route registry violations**.

### 2.2 Role-Based Access Control (RBAC) Matrix
The authorization layer denies access by default (`tests/unit/modules/authorization-and-idor.test.ts` and `tests/unit/modules/security-fuzz.test.ts`). Probing tests confirm:
| Principal Role | Protected Route Family | Expected Outcome | Verification |
| :--- | :--- | :--- | :--- |
| Unauthenticated | Any protected route (`/v1/*`) | `401 Unauthorized` | Passed |
| `donor` | Hospital management (`/v1/hospitals/*`) | `403 Forbidden` | Passed |
| `donor` | Blood bank operations (`/v1/blood-banks/*`) | `403 Forbidden` | Passed |
| `donor` | System administration (`/v1/admin/*`) | `403 Forbidden` | Passed |
| `hospital` | Donor self-service (`/v1/donors/me`) | `403 Forbidden` | Passed |
| `hospital` | Admin user control (`/v1/admin/accounts`) | `403 Forbidden` | Passed |
| `blood_bank` | Donor self-service (`/v1/donors/me`) | `403 Forbidden` | Passed |
| `admin` | Admin user control (`/v1/admin/accounts`) | `200 OK` | Passed |

### 2.3 Insecure Direct Object Reference (IDOR) Scoping
- Donor self endpoints (`/v1/donors/me`, `/v1/donors/me/location`) resolve strictly from the cryptographically verified JWT subject `req.user.id`, ignoring arbitrary path or body identifiers.
- Blood request cancellation and matching status endpoints strictly enforce resource ownership: only the hospital that created the request or an administrator can inspect candidate matching radars or cancel an active request.

---

## 3. SQL Injection Resilience and Parameterization

### 3.1 Static Analysis & Parameterized Queries
- Grep audit across the entire codebase confirmed **0 occurrences of `sql.raw`**.
- All database queries leverage Drizzle ORM query builders (`eq()`, `and()`, `inArray()`, `desc()`) or parameterized `sql` tagged template literals.
- Complex PostGIS spatial queries (`ST_DWithin`, `ST_Distance`, `ST_MakePoint`) interpolate coordinates and radii strictly as typed parameters (`$1`, `$2`), never through string concatenation.

### 3.2 Endpoint Fuzzing Results
A dedicated fuzzing and resilience test suite (`tests/unit/modules/security-fuzz.test.ts`) probed endpoints with:
- Classic SQL injection strings: `' OR '1'='1`, `'; DROP TABLE users; --`, `admin'--`, `UNION SELECT...`, `\x00' OR 1=1`.
- Path traversal sequences in UUID params: `../../etc/passwd`, `' OR 1=1`, invalid hex lengths.
- Unicode and control characters: RTL overrides, emojis, zero-width spaces, null bytes.
- Overflow and negative values: `unitsRequired = -999999`, units exceeding medical ceilings.

**Result**: All injection payloads were safely rejected by Zod schema validators with `400 Bad Request` or handled as literal strings by argon2/auth checks with `401 Unauthorized`. No database errors or SQL syntax leaks occurred.

---

## 4. Secrets Management and Git History Audit

### 4.1 History Audit
- Checked complete commit history for sensitive design or environment files:
  ```powershell
  git log --all -- design.md  # 0 commits found (clean)
  git log --all -- .env       # 0 commits found (clean)
  git log -p -S "BEGIN PRIVATE KEY" # 0 commits found (clean)
  ```
- `.gitignore` explicitly prevents staging:
  - `.env`, `.env.*` (excluding `.env.example`)
  - `*.pem`, `*.key`
  - `design.md`, `drsign.md`
- Tracked git files contain zero credentials or private tokens (`git ls-files | Select-String "\.env"` returned 0 matches).

### 4.2 Runtime Secret Requirements
The platform configuration validator (`apps/api/src/platform/config/index.ts`) enforces strict entropy constraints:
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: Minimum 32 characters.
- `COOKIE_SECRET`: Minimum 32 characters.
- In production (`NODE_ENV=production`), hardcoded defaults are disabled; missing secrets immediately halt service bootstrap.

---

## 5. Dependency Vulnerability Audits

Audit commands executed across all three sub-projects:

### 5.1 API Service (`apps/api`)
```bash
npm --prefix apps/api audit --omit=dev
```
- **Finding SEC-02**: `@fastify/static` < 10.1.6 had high-severity vulnerability GHSA-8pvw-jcv7-9cmj. Fixed via package override `"@fastify/static": "10.1.6"`.
- **Finding SEC-03**: `drizzle-orm` < 0.45.4 had high-severity advisory GHSA-gpj5-g38j-94v9. Fixed by updating to `"drizzle-orm": "^0.45.4"`.
- **Audit Outcome**: **0 vulnerabilities** (clean at low, moderate, high, and critical).

### 5.2 Web Frontend (`apps/web`)
```bash
npm --prefix apps/web audit --omit=dev
```
- **Audit Outcome**: **0 vulnerabilities** (clean).

### 5.3 Machine Learning Service (`services/ml`)
```bash
uv run --with pip-audit pip-audit
```
- **Audit Outcome**: **0 vulnerabilities detected** across all pinned dependencies.

All lockfiles (`apps/api/package-lock.json`, `apps/web/package-lock.json`, `services/ml/uv.lock`) are committed and up to date.

---

## 6. HTTP Security Headers, CORS, and Cookie Isolation

### 6.1 Security Headers (Fastify Helmet)
Verified via `tests/unit/platform/security.test.ts`:
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains`
- `X-Frame-Options`: `SAMEORIGIN` (prevents clickjacking)
- `X-Content-Type-Options`: `nosniff` (prevents MIME sniffing)
- `Referrer-Policy`: `no-referrer`
- `X-Powered-By`: Strictly disabled and removed from all responses.

### 6.2 CORS Policy
- Configured via `CORS_ORIGINS` environment variable.
- Uses strict origin allowlisting. Unlisted origins receive no `Access-Control-Allow-Origin` header and are rejected by browser security sandboxes.
- `credentials: true` supported exclusively for verified allowlisted origins.

### 6.3 Cookie Security Strategy
- Session refresh tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- In-memory access tokens with 15-minute expiration window to limit token replay blast radius.

---

## 7. Structured Logging and PII Sanitization

### 7.1 Pino Redaction
RaktSetu implements centralized structured logging with `pino` (`apps/api/src/platform/logging/index.ts`).
The `PII_REDACT_PATHS` dictionary automatically intercepts and censors sensitive properties across all log levels:
- Credentials: `password`, `*.password`, `token`, `*.token`, `accessToken`, `refreshToken`, `authorization`, `req.headers.authorization`.
- Cookie headers: `cookie`, `req.headers.cookie`.
- Personal Identifiable Information: `email`, `*.email`, `phone`, `*.phone`, `phoneNumber`, `*.phoneNumber`.
- Precise Coordinates: `latitude`, `*.latitude`, `longitude`, `*.longitude`, `location`, `*.location`, `lat`, `lon`.

### 7.2 Verification
`tests/unit/platform/logging.test.ts` executes automated assertions guaranteeing that raw passwords, JWTs, donor emails, telephone numbers, and GPS coordinates never appear in the serialized JSON stream.

---

## 8. Privacy Contracts and Donor Data Cloaking

### 8.1 Data Cloaking Model
Under the research privacy model, donors provide GPS coordinates solely for spatial indexing in PostGIS. Coordinates are never published or distributed:
- **Donor Self Profile**: Returns boolean `hasLocation: true` and timestamps. Raw latitude/longitude and GeoJSON points are stripped from the response schema.
- **Third-Party Radar View**: When hospitals or blood banks query candidate radars, the system returns quantized approximate distance bands (e.g., `< 1 km`, `2-3 km`, `5-6 km`) calculated via `formatDistanceBand()`.
- **Public Candidate View**: Donor names, emails, phone numbers, and dates of birth are completely omitted.

### 8.2 Consent-Based Contact Reveal
- Hospital dashboards display anonymized candidate IDs and distance bands during matching.
- **Contact Reveal Rule**: Donor first name and contact phone number are revealed to the requesting hospital **only after the donor explicitly accepts** the dispatch notification.
- **Immutable Audit Trail**: Every reveal event automatically generates an immutable audit record:
  ```json
  {
    "action": "donor_contact_revealed",
    "entity": "match_candidates",
    "actorUserId": "<hospital-id>",
    "metadata": { "requestId": "<req-id>", "donorId": "<donor-id>" }
  }
  ```
- Verified via contract tests in `tests/unit/modules/privacy-contracts.test.ts`.

---

## 9. Denial of Service (DoS) Controls

### 9.1 Payload Size Limits
- Fastify application body limit configured to **100 KB** (`apps/api/src/platform/security/index.ts`).
- Payloads exceeding 100 KB are immediately terminated with `413 Payload Too Large` before reaching module controllers (`tests/unit/platform/security.test.ts`).

### 9.2 Rate Limiting
- Configured using `@fastify/rate-limit`.
- General API endpoints: 100 requests per minute per IP.
- Authentication endpoints (`/v1/auth/login`, `/v1/auth/register`): Stricter burst protection (20 requests per minute) to deter brute-force credential stuffing.
- Exceeded thresholds return `429 Too Many Requests` with a standardized structured error envelope.

---

## 10. Summary of Security Test Suite Coverage

| Test File | Focus Area | Status |
| :--- | :--- | :--- |
| `tests/integration/route-registry.test.ts` | Route guard audit (AuthN, explicit roles, preHandlers) | **PASS** (0 violations) |
| `tests/unit/modules/authorization-and-idor.test.ts` | RBAC matrix, IDOR isolation, and input edge cases | **PASS** (21 tests) |
| `tests/unit/modules/security-fuzz.test.ts` | SQL injection resilience, UUID fuzzing, and route RBAC | **PASS** (15 tests) |
| `tests/unit/modules/privacy-contracts.test.ts` | Output shaping, coordinate redaction, and contact reveal | **PASS** (7 tests) |
| `tests/unit/platform/security.test.ts` | CORS whitelist, Helmet headers, 100kb body limit, 429 rate limit | **PASS** (6 tests) |
| `tests/unit/platform/logging.test.ts` | Request ID tracking and automated PII log redaction | **PASS** (5 tests) |

**Conclusion**: All security controls are verified functional and enforced at the framework level. The codebase is cleared for free-tier staging deployment.
