# ADR 0001: Isolated Monorepo Architecture with Contract-Driven OpenAPI

## Status
Accepted

## Context
RaktSetu contains three distinct application subsystems:
1. `apps/api`: Node.js / Fastify backend service with PostGIS and job queues.
2. `apps/web`: React 19 / Vite client application.
3. `services/ml`: Python / FastAPI microservice for response probability estimation.

A common pitfall in monorepos is coupling services via shared internal utility directories (`shared/`, `packages/`, npm workspaces), which creates fragile dependencies, circular type imports, and breaks operational independence. Furthermore, Hard Rule 1 explicitly mandates zero shared code between applications.

## Decision
1. **Zero Shared Packages**: No npm workspaces, no Lerna/Turborepo shared symlinks, no shared utility packages across `apps/` or `services/`.
2. **Contract-Driven Communication**:
   - `apps/api` exports an OpenAPI v3.1 specification generated directly from Fastify route schemas (`@fastify/swagger` and `fastify-type-provider-zod`).
   - `apps/web` consumes the API strictly through TypeScript types generated dev-time via `openapi-typescript`.
   - The generated type file in `apps/web` is checked in and regenerated via a script (`npm run codegen:api`), preserving complete decoupling.
3. **ML Inter-Service Protocol**:
   - `apps/api` communicates with `services/ml` via standardized HTTP REST payloads validated by Zod on the Node side and Pydantic v2 on the Python side.

## Consequences
- **Positive**: Clean boundaries; `apps/web` and `apps/api` can be deployed, tested, and upgraded independently. Zero risk of leaking Node-specific libraries into the browser bundle.
- **Negative**: Schema changes in `apps/api` require running the codegen command in `apps/web` to update types.
