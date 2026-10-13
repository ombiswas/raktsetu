# ADR 0006: Prototype Eligibility Constraints and Statutory Intervals

## Status
Accepted

## Context
RaktSetu is an academic research prototype evaluating geospatial and machine learning donor prioritization. To guarantee safety and simulate realistic clinical operations, deterministic rules must govern donor eligibility before any matching or dispatch occurs.

However, real-world clinical transfusion medicine requires extensive donor questionnaires, in-person hemoglobin screening ($Hb \ge 12.5\text{ g/dL}$), blood pressure checks, travel history analysis, and specialized medical practitioner evaluations. A software prototype cannot replicate comprehensive medical triage or provide legal clinical advice.

## Decision
1. **Academic Simulation Assumptions**:
   - The system implements statutory and consensus blood banking constraints from the National Blood Transfusion Council (NBTC) / Drugs and Cosmetics Act (India) as typed configuration parameters:
     - Age range: Statutory $18 \le \text{age} \le 65$ years.
     - Body weight: $\ge 45\text{ kg}$ (statutory threshold for 350 mL whole blood collection).
     - Whole blood donation interval: Minimum **90 days for male donors** and **120 days for female donors** (accounting for physiological iron store recovery periods).
     - Apheresis (platelets) donation interval: Minimum **14 days**.
     - Temporary deferral window: `eligible_after` timestamp must not be in the future.
     - Self-reported medical deferrals: `has_medical_deferral = false`.
     - Active availability: `is_available = true` and `available_from \le \text{current_time}`.
2. **Prototype Disclaimer**:
   - These rules serve strictly as prototype algorithmic boundaries for research evaluation.
   - They do NOT constitute medical guidance or clinical decision-making.
   - In any real-world blood mobilization deployment, in-person clinical assessment by licensed medical professionals at a licensed blood centre is legally and medically required prior to phlebotomy.

## Consequences
- **Positive**: Standardizes algorithmic evaluation with reproducible, realistic clinical constraints. Explicit gender-differentiated intervals reflect established transfusion medicine standards.
- **Negative**: Excludes potential donors based solely on self-reported and algorithmic thresholds without clinical nuance.
