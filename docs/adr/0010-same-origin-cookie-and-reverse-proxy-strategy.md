# ADR 0010: Same-Origin Cookie Strategy via Reverse Proxy Rewrite

## Status
Accepted

## Context
RaktSetu implements authentication using short-lived JWT access tokens in client memory and long-lived refresh tokens stored in cookies. 

Modern web security standards (such as Google Chrome's Third-Party Cookie Phaseout, Safari ITP, and strict cross-site cookie restrictions) treat cookies set across differing domains or differing subdomains (e.g. `web.vercel.app` vs `api.onrender.com`) as third-party / cross-site cookies (`SameSite=None; Secure`). This introduces:
- Fragile third-party cookie blocking by default in modern privacy-focused browsers.
- CORS preflight overhead (`OPTIONS` requests on every authenticated dispatch).
- Increased susceptibility to cross-origin credential misuse without strict partition keys.

## Decision
1. **Same-Origin Presentation Layer via Vercel `/api` Rewrite**:
   - In production, `apps/web` on Vercel configures a reverse proxy rewrite in `vercel.json`:
     ```json
     {
       "rewrites": [
         {
           "source": "/api/:path*",
           "destination": "https://raktsetu-api.onrender.com/:path*"
         }
       ]
     }
     ```
   - The browser communicates exclusively with its own origin (e.g. `https://raktsetu.vercel.app/api/...`), completely eliminating cross-origin browser requests.
2. **First-Party Cookie Isolation**:
   - Refresh tokens are transmitted as first-party cookies with `HttpOnly; Secure; SameSite=Strict`.
   - Access tokens remain short-lived (15 minutes) and are stored strictly in client memory.
   - Third-party cookie blocking policies in Safari and Chromium have zero effect on authentication.

## Consequences
- **Positive**: Zero third-party cookie blocking; elimination of CORS preflight latency on standard calls; impenetrable CSRF defense under `SameSite=Strict`; seamless developer experience matching local Vite proxying (`/api` -> `localhost:3000`).
- **Negative**: Requires maintaining the Vercel rewrite route configuration; bandwidth flows through the Vercel edge rewrite layer to Render.
