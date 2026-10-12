# ADR 0005: PostgreSQL-Backed Job Queue with pg-boss (No Redis)

## Status
Accepted

## Context
RaktSetu requires reliable asynchronous job execution for:
- Matching engine alert fan-out (escalation tiers)
- Push notification dispatches (Web Push via VAPID)
- Audit log persistence and metrics aggregation

Deploying a Redis instance (like Redis Cloud or Upstash) increases cost, adds an external dependency, and complicates local development. PostgreSQL 16 is already required as the primary datastore for relational entities and PostGIS geospatial operations.

## Decision
1. **Adopt pg-boss**:
   - Use `pg-boss`, a battle-tested, zero-external-dependency background job queue designed exclusively for PostgreSQL.
   - Operates in dedicated tables within the primary PostgreSQL database (`pgboss` schema).
   - Utilizes `SKIP LOCKED` row-level concurrency control for high-throughput, transactional job processing.
2. **Transactional Dispatch**:
   - When an emergency blood request is submitted in `apps/api`, the request insertion and the initial matching job enqueue can be executed within the same database transaction, guaranteeing zero missed dispatches even if a worker crashes mid-request.

## Consequences
- **Positive**: Zero Redis dependency; works identically in local Docker Compose and on Neon PostgreSQL serverless instances; strictly ACID-compliant job registration.
- **Negative**: Polling load on Postgres (mitigated by pg-boss's efficient listen/notify and polling interval configuration).
