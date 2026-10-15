# ADR 0009: No Shared Modules and Strict Contract-Driven Isolation

## Status
Accepted

## Context
Monorepo architectures frequently introduce shared TypeScript/JavaScript libraries (e.g. `packages/common`, `packages/types`, or shared npm workspaces) across web, API, and worker services. 

However, in multi-language environments (TypeScript Node.js API + TypeScript React web + Python ML service) and containerized microservice deployments, shared filesystem packages introduce significant pitfalls:
- Monolithic lockstep deployments and complex build-time symlinks.
- Accidental cross-boundary data leakage (e.g. backend database schemas or server-only secrets imported into client bundles).
- Fragile cross-language type synchronizations when sharing types between Node.js and Python.

## Decision
1. **Zero Shared Code Modules**:
   - `apps/api`, `apps/web`, and `services/ml` do NOT share runtime node_modules, libraries, or symlinked filesystem code.
   - Each application is completely self-contained with its own `package.json` (or `pyproject.toml`) and independent dependency tree.
2. **Contract-Driven Communication**:
   - The boundary between `apps/api` and `apps/web` is strictly defined by the OpenAPI 3.1 schema (`docs/openapi.json`), generated directly from Fastify Zod route definitions (`npm run openapi:generate`).
   - The web client generates its TypeScript API bindings via `openapi-typescript` against the published schema.
   - The boundary between `apps/api` and `services/ml` is strictly governed by Pydantic v2 and Zod DTO contracts over HTTP with constant-time Bearer token authorization.

## Consequences
- **Positive**: Strict compile-time and runtime isolation; impossible for internal database entities or ORM models to leak into frontend bundles; zero monorepo symlink build headaches on Vercel/Render free tiers.
- **Negative**: Model changes require updating the contract schema and regenerating types rather than instantaneous in-repo TypeScript symbol sharing.
