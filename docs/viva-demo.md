# RaktSetu (रक्तसेतु) Viva Presentation & Live Demo Script

**Project Title**: RaktSetu: AI-Assisted, Geospatially Aware Emergency Blood-Donor Prioritization  
**Target Audience**: Academic Viva Committee, External Examiners, Faculty Evaluators  
**Duration**: 8–12 Minutes  
**Demonstration Mode**: Live Stack (or Local Monorepo Stack with Seeded Data)

---

## 1. Executive Synopsis (The 60-Second Elevator Pitch)

> *"Good morning, respected examiners. Today we present **RaktSetu** (रक्तसेतु), an emergency blood donor mobilization research prototype.*
>
> *In emergency surgeries and trauma cases, traditional broadcast methods—like mass SMS blasts or generic WhatsApp alerts—suffer from three catastrophic failures: **donor alert fatigue**, **geospatial latency**, and **privacy violations**.*
>
> *Our core research contribution is a **decoupled, two-stage architecture**:*
> 1. *A **100% deterministic hard constraint engine** that strictly enforces biological blood compatibility, clinical eligibility, and donation intervals **BEFORE** any machine learning is applied. ML is never allowed to override biological reality.*
> 2. *A **calibrated probabilistic ML model** that estimates the conditional likelihood of a donor responding, paired with a multi-objective ranking function in Node.js to optimize rapid arrival while mitigating donor fatigue.*
> 3. *A **zero-knowledge privacy boundary** where exact donor coordinates never leave the database, and donor contact numbers are only revealed to hospitals upon explicit donor consent."*

---

## 2. Pre-Demo Setup Checklist

1. Ensure the backend and web frontend are running (either local or deployed):
   - Local: `npm --prefix apps/api run dev` (Port 3000) and `npm --prefix apps/web run dev` (Port 5173).
2. Ensure database is migrated and seeded:
   ```bash
   npm --prefix apps/api run db:seed
   ```
3. Open two browser windows side-by-side:
   - **Window A (Left)**: Standard browser window for **Hospital & Admin** view.
   - **Window B (Right)**: Incognito / Private window for **Volunteer Donor** view.

---

## 3. Step-by-Step Viva Demo Script

### Act 1: Deterministic Governance & Administration (2 Minutes)

1. **Navigate to `http://localhost:5173` (or deployed URL)**.
   - Highlight the prominent **"SIMULATION PROTOTYPE"** banner in the header, demonstrating research integrity and adherence to ethical guidelines.
2. **Login as Administrator**:
   - Email: `admin@raktsetu.org`
   - Password: `AdminSecret2026!`
3. **Show Admin Verification Queue**:
   - Navigate to `/admin/accounts`.
   - Point out pending hospital registrations and blood bank license verification.
   - Explain that hospitals cannot create emergency requests without administrator verification (defense against fraudulent dispatch requests).
4. **Show Audit Log Ledger**:
   - Point out that every critical action (registration, verification, matching run, contact reveal) writes an immutable record to the audit log.

---

### Act 2: Emergency Request & The Matching Radar (3 Minutes)

1. **Log out and log in as Hospital**:
   - Email: `metro.hospital@raktsetu.org`
   - Password: `HospitalSecret2026!`
2. **Navigate to `/hospital` Dashboard**:
   - Point out active blood inventory and open emergency requests.
3. **Create an Emergency Request**:
   - Click **"Create Emergency Request"**.
   - Select:
     - **Blood Group**: `O+`
     - **Component**: `Whole Blood`
     - **Units Required**: `1`
     - **Urgency**: `Critical (Immediate dispatch)`
     - **Needed Within**: `4 Hours`
   - Click **"Submit Emergency Request"**.
4. **Inspect the Live Matching Panel**:
   - Navigate to the newly created request detail view.
   - **Point to the Candidate Radar**:
     - Explain: *"Notice how PostGIS filtered donors within the initial 5 km radius using GiST indexes."*
   - **Explain the "Why This Order?" Explanation**:
     - Show the composite score breakdown:
       $$\text{Score} = w_1 \cdot \text{Proximity} + w_2 \cdot P(\text{response}) - w_3 \cdot \text{FatiguePenalty}$$
     - Show how the top candidate combines high response likelihood with low historical contact frequency.
   - **CRITICAL PRIVACY HIGHLIGHT**:
     - Point to the candidate table:
     - Notice that candidate names say `"Candidate #1"`, phone numbers are `"Cloaked"`, and distance says `"< 2 km"`.
     - Explain to examiners: *"Exact GPS coordinates are never exposed to the client or the hospital. Distances are quantized into privacy bands."*

---

### Act 3: The Real-Time Volunteer Donor Experience (3 Minutes)

1. **Switch to Window B (Incognito Window)**.
2. **Log in as Volunteer Donor**:
   - Email: `aarav.sharma@example.com` (or pre-registered donor)
   - Password: `Password123!`
3. **Show Donor Dashboard & Availability Controls**:
   - Point out the **"Available for Emergency Dispatch"** toggle.
   - Point out the **Donation Eligibility Indicator**:
     - Explain the deterministic interval check: *"Because Aarav donated 110 days ago (statutory minimum is 90 days), he is eligible. Had he donated 60 days ago, our deterministic boundary would have excluded him before the ML stage."*
4. **Real-Time Notification Arrival**:
   - Show the incoming emergency alert received via Server-Sent Events (SSE).
   - Click **"View Emergency Alert"**:
     - Shows Hospital name, blood group requested (`O+`), urgency, and approximate distance.
5. **Donor Acceptance**:
   - Click **"Accept Dispatch"**.
   - A confirmation toast appears: *"Thank you! Your contact details have been securely shared with Metro Hospital."*

---

### Act 4: Closed-Loop Fulfilment & Consent Reveal (2 Minutes)

1. **Switch back to Window A (Hospital View)**:
   - Notice the live matching panel automatically updates in real-time via SSE.
   - Candidate status transitions to **`Accepted`**.
2. **Point out the Consent Reveal**:
   - The accepted donor row now reveals:
     - **Name**: `Aarav Sharma`
     - **Phone**: `+91 98765 43210`
   - Point out to examiners:
     - *"This is our consent-based contact reveal contract. The phone number was strictly withheld until the donor clicked Accept."*
     - *"An immutable audit record `donor_contact_revealed` was immediately written to the database with the hospital's user ID and timestamp."*
3. **Fulfill Request**:
   - Click **"Mark Fulfilled"**. Request transitions to `Fulfilled`.

---

### Act 5: Experimental Benchmarks & Algorithmic Findings (2 Minutes)

1. **Present the Comparative Experiment Results** (from `docs/experiment-protocol.md` and Phase 14 runs):
   | Strategy | Time to First Accept | Donor Contacted per Unit | Radius Expansions | Fulfilment Rate |
   | :--- | :--- | :--- | :--- | :--- |
   | **1. Baseline Proximity** | 18.4 min | 4.8 donors | 2.1 | 82.5% |
   | **2. Hybrid Full (RaktSetu)** | **9.2 min** | **2.9 donors** | **0.8** | **94.2%** |
   | **3. ML-Only (Ablation)** | 14.1 min | 3.6 donors | 1.4 | 88.0% |
   | **4. Geo-Only (Ablation)** | 17.9 min | 4.6 donors | 2.0 | 83.1% |

2. **Key Takeaway**:
   - The Hybrid model achieves a **50% reduction in time-to-first-accept** while alerting **39% fewer donors**, directly solving the alert fatigue problem.

---

## 4. Anticipated Viva Defense Q&A

### Q1: *"What happens if the Machine Learning model makes a mistake and predicts a high score for an incompatible blood donor?"*
> **Answer**:  
> *"That is mathematically impossible in RaktSetu due to our deterministic hard boundary. Blood compatibility (ABO and Rh factor) is evaluated in Stage 1 in pure TypeScript logic before any ML model is called. An incompatible donor receives a hard boolean `is_compatible = false` and is completely purged from the candidate set. ML only calculates response probability on biologically verified, eligible donors."*

### Q2: *"Why did you use PostGIS instead of simple Euclidean distance or MongoDB $near?"*
> **Answer**:  
> *"Euclidean distance calculations ($\sqrt{\Delta x^2 + \Delta y^2}$) suffer from significant latitudinal distortion (over 15% error at Delhi's latitude). PostGIS computes true geodesic distances on the WGS84 spheroid using `ST_DWithin` and `ST_Distance` on geography types. Furthermore, PostGIS GiST spatial indexing allows us to scan 50,000 donors in under 5 milliseconds with index-assisted bounding-box pruning."*

### Q3: *"How do you prevent malicious actors from harvesting donor phone numbers and locations?"*
> **Answer**:  
> *"We enforce four distinct security layers: First, exact GPS coordinates are never sent across the network; they stay within PostgreSQL. Second, API responses return approximate distance bands (`< 2 km`). Third, candidate telephone numbers and names are redacted at the schema level until a donor explicitly clicks 'Accept'. Fourth, every reveal generates an immutable audit record linking the hospital identity to the transaction."*

### Q4: *"Why did you use pg-boss instead of Redis and BullMQ?"*
> **Answer**:  
> *"Redis introduces an additional stateful infrastructure dependency, which increases cost and complicates zero-budget free-tier deployment. `pg-boss` runs natively inside PostgreSQL using `SKIP LOCKED` row-level locking. This allows us to enqueue matching escalation jobs inside the exact same ACID database transaction as the emergency blood request creation, guaranteeing zero orphaned alerts or race conditions."*

### Q5: *"Can this prototype be deployed in a real hospital tomorrow?"*
> **Answer**:  
> *"No, and we explicitly document this in our limitations section. RaktSetu is an educational research and engineering demonstration prototype evaluated on synthetic donor behavior. Real-world deployment requires integration with the national blood portal (e-RaktKosh), clinical laboratory information systems (LIMS), and formal institutional review board (IRB) medical ethics clearance."*
