# ADR 0003: Privacy-Preserving Donor Geospatial Coordinates and Contact Cloaking

## Status
Accepted

## Context
Voluntary blood donors share sensitive personal data: precise physical locations (home or workplace coordinates) and direct contact phone numbers. Exposing these details to hospitals or broadcasting them across dashboards creates significant privacy vulnerabilities, tracking risks, and unsolicited contact harassment.

## Decision
1. **Coordinate Cloaking & Database Confinement**:
   - Exact donor latitude and longitude coordinates are stored exclusively in the database within PostGIS geometry columns (`geography(Point, 4326)`).
   - Exact coordinates are NEVER serialized into API responses sent to hospital users, dashboards, or public endpoints.
   - Exact coordinates are NEVER written to application logs. Pino loggers redact coordinates and PII automatically.
2. **Distance Quantization**:
   - Hospitals querying candidate status or tracking dispatch progress receive only approximate, quantized geodesic distances (e.g., rounded to nearest 0.5 km or categorized into bins: `<2 km`, `2-5 km`, `5-10 km`).
3. **Just-In-Time Contact Disclosure**:
   - When an emergency alert is dispatched to a donor, the hospital view displays an anonymous candidate identifier (e.g., `Candidate #4 [O+, ~3.5 km]`).
   - The donor's full name and contact phone number remain hidden until the donor explicitly reviews the request and clicks "Accept Request".
   - Upon donor acceptance, a scoped event reveals the contact phone number strictly to the authenticated hospital staff managing that active request.
   - When the request transitions to `FULFILLED` or `CANCELLED`, contact visibility is revoked.

## Consequences
- **Positive**: Complies with strict privacy-by-design standards; protects voluntary donors from stalking, spam, and unsolicited inquiries.
- **Negative**: Hospitals cannot proactively call candidates prior to their app acceptance.
