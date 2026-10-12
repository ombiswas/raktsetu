# RaktSetu ML Service

> **SIMULATION RESEARCH COMPONENT**  
> This service models donor response probabilities under varying dispatch conditions for research evaluation. It makes no clinical decisions.

## Scope
- Endpoint: `POST /predict/response-probability`
- Estimates: $P(\text{response} = 1 \mid \mathbf{x})$
- Constraints: Deterministic clinical and biological checks are handled BEFORE this service in `apps/api`.
