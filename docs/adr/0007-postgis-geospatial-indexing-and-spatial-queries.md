# ADR 0007: PostGIS Geospatial Indexing and Spatial Queries

## Status
Accepted

## Context
Emergency blood donor prioritization requires matching hospital emergency requests with donors located in spatial proximity. Key challenges include:
- Calculating geodesic distance on the Earth's spheroid (WGS84 / EPSG:4326) without Euclidean distortion over 5–50 km ranges.
- Filtering potentially tens of thousands of registered donors within dynamic search radii ($R \in [5\text{ km}, 30\text{ km}]$) under sub-50ms latency SLAs.
- Ensuring donor GPS coordinates remain cloaked at the database layer rather than exported in bulk to application memory.

## Decision
1. **Enable and Rely on PostGIS**:
   - Utilize PostgreSQL with the `postgis` extension enabled.
   - Model donor locations and hospital facilities as `geometry(Point, 4326)` columns.
   - Enforce GiST (Generalized Search Tree) spatial indexing on location columns (`CREATE INDEX ... USING GIST (location)`).
2. **Execute Spatial Filtering in PostgreSQL**:
   - Apply `ST_DWithin(d.location::geography, target_point::geography, radius_meters)` inside the database engine.
   - Compute geodesic distance using `ST_Distance(d.location::geography, target_point::geography)`.
   - GiST index bounding box filtering prunes non-candidate rows prior to running exact spheroidal distance math.
3. **Privacy Boundary**:
   - Raw coordinates never leave the database layer during candidate search; only the metric distance is retrieved into the Node API, where it is quantized into approximate distance bands.

## Consequences
- **Positive**: Sub-millisecond indexed spatial filtering; accurate spheroidal distance calculations; coordinates remain quarantined inside PostgreSQL.
- **Negative**: Requires cloud database providers that support the PostGIS extension (e.g. Neon, AWS RDS, Supabase); requires explicit release migration step `CREATE EXTENSION IF NOT EXISTS postgis;`.
