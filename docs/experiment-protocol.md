# RaktSetu Research Experiment Protocol & Benchmark Methodology

> **SIMULATION & BENCHMARKING PROTOCOL**  
> All experimental results and synthetic datasets described herein are designed strictly for academic evaluation and algorithm comparison. They do not represent clinical trials or real-world clinical advice.

---

## 1. Research Objectives & Hypotheses

### 1.1 Research Questions (RQs)
- **RQ1 (Latency & Fulfillment)**: Does response-probability-aware prioritization ($P(\text{response})$) reduce the time-to-first-donor-acceptance and increase emergency fulfillment rates compared to pure geospatial Nearest Neighbor (NN) baselines?
- **RQ2 (Donor Fatigue & Efficiency)**: Does tiered ring-fenced dispatch (alerting candidate batches sequentially rather than mass broadcast) reduce alert spam per donor while achieving comparable or superior time-to-fulfillment?
- **RQ3 (Fairness & Spatial Equity)**: How does multi-objective optimization (balancing predicted response probability with spatial distance and donor fatigue penalties) prevent disproportionate burden on high-responsiveness donors (measured via Gini coefficient of alerts)?

### 1.2 Hypotheses
- **$H_1$**: An ML-prioritized queue achieves a statistically significant reduction ($p < 0.01$) in time-to-fulfillment over pure distance-based ranking during off-peak hours (night/work hours) due to modeling behavioral availability.
- **$H_2$**: Tiered dispatch reduces total alert volume by $> 40\%$ compared to broadcast dispatch without increasing median time-to-acceptance by more than 5 minutes.
- **$H_3$**: Incorporating fatigue decay penalties maintains the Gini coefficient of notification distribution below $0.35$, preventing donor burnout.

---

## 2. Synthetic Cohort Generation Protocol

Because real-world emergency blood donor behavioral data contains protected health information (PHI) and cannot be distributed without clinical IRB approval, RaktSetu uses an open, reproducible synthetic generation pipeline:

### 2.1 Demographic & Clinical Distributions
- **Blood Type Distribution** (Calibrated to representative regional distributions, e.g., India):
  - $O^+$: 37.1%, $O^-$: 2.0%
  - $A^+$: 22.9%, $A^-$: 0.8%
  - $B^+$: 32.3%, $B^-$: 1.8%
  - $AB^+$: 7.7%, $AB^-$: 0.4%
- **Age**: Uniformly distributed between 18 and 65 years.
- **Weight**: Normal distribution $\mathcal{N}(\mu=65\text{ kg}, \sigma=12\text{ kg})$, truncated at $45\text{ kg}$.
- **Donation History**: Poisson distributed donation count $\text{Pois}(\lambda=2.5)$, with simulated timestamps enforcing the minimum 90-day cooldown interval.

### 2.2 Geospatial Distribution
- Synthetic donors and healthcare facilities are distributed over a defined geographic bounding box (e.g., metropolitan Delhi NCR or Bengaluru).
- Donors follow a spatial kernel density mixture: 70% clustered around residential/urban nodes, 30% uniformly dispersed.

### 2.3 Ground-Truth Simulated Response Function
To generate synthetic response events for training and benchmark verification, donor acceptance is modeled via a logistic utility function:
$$U_i = \beta_0 + \beta_d \cdot \text{distance}_{ih} + \beta_h \cdot \text{hist\_response\_rate}_i + \beta_t \cdot \text{is\_working\_hours}_t - \beta_f \cdot \text{alerts\_last\_7d}_i + \epsilon_i$$
$$P(\text{accept}_{ih}) = \frac{1}{1 + e^{-U_i}}$$
where:
- $\beta_d < 0$: Negative utility with increasing distance to hospital.
- $\beta_h > 0$: Positive utility for historically reliable donors.
- $\beta_t$: Circadian availability penalty (e.g., night hours reduce responsiveness).
- $\beta_f > 0$: Fatigue penalty for each recent notification in the past 7 days.
- $\epsilon_i \sim \text{Logistic}(0, 1)$: Stochastic behavioral variation.

---

## 3. Experimental Baselines & Treatments

Every experimental run evaluates 4 distinct allocation strategies against identical synthetic request sequences:

1. **Baseline 1: Random Eligible (FIFO / Uniform)**
   - Hard deterministic filters applied.
   - Candidates ordered randomly.
2. **Baseline 2: Pure Nearest Neighbor (NN)**
   - Hard deterministic filters applied.
   - Candidates ordered strictly by ascending geodesic distance ($ST\_Distance$).
3. **Treatment 1: Pure ML Probability Prioritization**
   - Hard deterministic filters applied.
   - Candidates ordered strictly by descending predicted response probability $\hat{p}_i$.
4. **Treatment 2: RaktSetu Multi-Objective Tiered Strategy**
   - Hard deterministic filters applied.
   - Candidates scored via composite ranking utility:
     $$S_i = w_1 \cdot \hat{p}_i - w_2 \cdot \tilde{d}_i - w_3 \cdot \text{fatigue}_i$$
     where $\tilde{d}_i$ is normalized distance, and $\text{fatigue}_i$ penalizes recent alerts.
   - Top-$K$ candidates notified in Tier 1. If unfilled within $T_{\text{tier}}$ (e.g. 8 minutes), Tier 2 is triggered automatically.

---

## 4. Evaluation Metrics

1. **Fulfillment Rate ($FR$)**:
   $$FR = \frac{N_{\text{fulfilled}}}{N_{\text{total\_requests}}} \times 100\%$$
2. **Time to First Acceptance ($TTFA$)**:
   Elapsed time from request issuance to the first positive donor acceptance (minutes).
3. **Time to Full Fulfillment ($TFF$)**:
   Elapsed time from request issuance to reaching required units (minutes).
4. **Notification Efficiency Ratio ($NER$)**:
   $$\text{NER} = \frac{\text{Total Notifications Sent}}{N_{\text{fulfilled}}}$$
   Lower values indicate higher efficiency and less donor disturbance.
5. **Fairness Index (Gini Coefficient of Notifications)**:
   $$G = \frac{\sum_{i=1}^{n} \sum_{j=1}^{n} |a_i - a_j|}{2n \sum_{i=1}^{n} a_i}$$
   Measures inequality in alert distribution across the eligible donor population ($0 = \text{perfect equality}$).

---

## 5. Experiment Execution & Artifact Layout

- Experiment configs stored in `experiments/configs/` (JSON / YAML format).
- Simulation runner executed via Python CLI or Node test harness.
- Output metrics and raw trajectory logs written to `experiments/results/`.
- Statistical analysis notebooks and summary figures placed in `experiments/analysis/`.
- All outputs are version-controlled with deterministic seeds (`seed=42`).
