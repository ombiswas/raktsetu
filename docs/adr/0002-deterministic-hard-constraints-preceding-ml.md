# ADR 0002: Deterministic Hard Constraints Preceding Machine Learning Ranking

## Status
Accepted

## Context
In emergency blood donation systems, recommending an incompatible donor or an ineligible donor can lead to catastrophic medical outcomes or wasted emergency response time. Machine learning models, regardless of accuracy or confidence score, cannot guarantee 100% adherence to biological and clinical constraints.

## Decision
1. **Strict Deterministic Filter Gate**:
   - Blood compatibility (ABO/Rh antigen-antibody compatibility), statutory donor eligibility (age $\ge 18$ and $\le 65$, weight $\ge 45\text{ kg}$, absence of clinical deferrals), donation cooldown intervals ($\ge 90\text{ days}$ for whole blood), and active availability flags (`is_available = true`) are defined as **HARD DETERMINISTIC CONSTRAINTS**.
   - These constraints are executed strictly in the PostGIS query and pure domain logic BEFORE any candidate features are extracted or sent to the ML service.
2. **Machine Learning Scope Limitation**:
   - Machine learning is strictly constrained to behavioral modeling: predicting $P(\text{response} \mid \text{donor}, \text{request}, \text{context})$.
   - ML output is an input to the Node.js API ranking optimizer, which computes a multi-objective utility score.
   - ML can never promote an ineligible candidate into the consideration set or override a biological incompatibility.
3. **Simulation Distinction**:
   - All synthetic experiments and prototype visualizations must carry an explicit "SIMULATION" badge. The prototype does not make clinical decisions.

## Consequences
- **Positive**: Absolute mathematical and medical guarantee that incompatible or ineligible donors are never notified. Eliminates safety hazards from algorithmic hallucinations or miscalibrations.
- **Negative**: Candidate pool is strictly pruned, meaning if no compatible donors exist within radius, the system reports zero matches immediately rather than attempting speculative suggestions.
