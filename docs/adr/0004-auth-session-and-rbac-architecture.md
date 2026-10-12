# ADR 0004: Authentication, RBAC, and Session Security Architecture

## Status
Accepted

## Context
A healthcare emergency platform must resist unauthorized access, spoofing of emergency requests, and exfiltration of user records. Storage of access tokens in browser `localStorage` or `sessionStorage` is vulnerable to cross-site scripting (XSS). Weak password hashing or predictable tokens jeopardize account integrity.

## Decision
1. **Password Hashing**:
   - Passwords must be hashed using `argon2id` (the memory-hard variant recommended by OWASP).
   - Cost parameters configured according to OWASP guidelines: time cost = 3, memory cost = 64MB ($65536\text{ KiB}$), parallelism = 1.
2. **Dual-Token Session Strategy**:
   - **Access Token**: Short-lived JWT (lifespan: 15 minutes) signed using asymmetric or HMAC-SHA256 (`jose` library). Transmitted in the `Authorization: Bearer <token>` header. Kept **strictly in client memory** (React state/TanStack query cache); never written to browser storage.
   - **Refresh Token**: High-entropy cryptographically secure random token (256-bit). Stored as a hashed record in the database with family tracking for rotation detection. Sent via an `httpOnly`, `Secure`, `SameSite=Strict` cookie path-restricted to `/api/v1/auth/refresh`.
3. **Role-Based Access Control (RBAC)**:
   - Deny-by-default on all API routes via Fastify pre-handler hooks.
   - Distinct roles: `ADMIN`, `HOSPITAL_STAFF`, `DONOR`.
   - Resource-level authorization: Donors can only mutate their own profile/status; hospitals can only view requests created by their facility.
4. **Anti-Enumeration & Uniform Error Responses**:
   - Auth endpoints return identical response times and status codes (e.g., `401 Unauthorized` with generic message "Invalid credentials") regardless of whether an email exists in the database.
   - Stack traces are omitted from all production error responses.

## Consequences
- **Positive**: Exceptional defense against XSS token exfiltration, brute-force attacks, and credential stuffing.
- **Negative**: Memory-only access tokens require a silent refresh on browser page reload.
