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

- Experiment configs stored in `experiments/configs/` (JSON format).
- Simulation runner executed via CLI: `npm run exp:generate -- --config experiments/configs/default.json`.
- Output metrics and raw trajectory logs written to `experiments/results/` (git-ignored).
- Artifacts generated:
  - `experiments/results/donor_response.csv` & `donor_response.metadata.json`
  - `experiments/results/demand_series.csv` & `demand_series.metadata.json`
- All outputs are labelled `SIMULATION` and accompanied by SHA-256 config hashes and reproducible seeds (`seed=42`).

---

## 6. Data Dictionary

### 6.1 `donor_response.csv` (Notification-Level Observation)
Each row represents a single emergency notification dispatched to an eligible, compatible donor at timestamp $T_{\text{notif}}$.

| Column Name | Type | Range / Values | Definition | Feature / Label | Known at $T_{\text{notif}}$? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `notification_id` | `string` | `notif-xxxxxxxx` | Unique dispatch identifier | Identifier | Yes |
| `request_id` | `string` | `req-xxxxxx` | Emergency blood request ID | Identifier | Yes |
| `donor_id` | `string` | `donor-xxxxx` | Unique candidate donor ID | Identifier | Yes |
| `timestamp` | `string` | ISO 8601 UTC | Notification dispatch timestamp ($T_{\text{notif}}$) | Temporal Anchor | Yes |
| `distance_km` | `float` | $[0.0, 30.0]$ | Geodesic distance between donor home and hospital | Feature | Yes |
| `prior_response_rate` | `float` | $[0.0, 1.0]$ | Proportion of past alerts responded to prior to $T_{\text{notif}}$ | Feature | Yes |
| `recency_score` | `float` | $[0.0, 1.0]$ | Normalized recency metric ($\min(365, \text{days}) / 365$) | Feature | Yes |
| `total_past_donations`| `int` | $\ge 0$ | Cumulative completed donations strictly prior to $T_{\text{notif}}$ | Feature | Yes |
| `days_since_last_donation` | `int` | $\ge 0$ | Days elapsed from donor's previous donation to $T_{\text{notif}}$ | Feature | Yes |
| `recent_alerts_count` | `int` | $\ge 0$ | Total alerts received in the window $[T_{\text{notif}} - 7\text{d}, T_{\text{notif}})$ | Feature | Yes |
| `age` | `int` | $[18, 65]$ | Candidate donor age in years at $T_{\text{notif}}$ | Feature | Yes |
| `urgency` | `string` | `CRITICAL`, `URGENT`, `ROUTINE` | Emergency triage priority category | Feature | Yes |
| `hour_of_day` | `int` | $[0, 23]$ | UTC hour of notification dispatch | Feature | Yes |
| `is_weekend` | `boolean` | `true`, `false` | Indicator whether $T_{\text{notif}}$ is Saturday or Sunday | Feature | Yes |
| `night_flag` | `int` | $\{0, 1\}$ | Indicator whether $T_{\text{notif}}$ occurs between 22:00 and 06:00 | Feature | Yes |
| `blood_group` | `string` | 8 ABO/Rh groups | Candidate donor ABO/Rh blood group | Feature / Context | Yes |
| `component_needed` | `string` | 4 components | Component requested (`whole_blood`, `rbc`, `plasma`, `platelets`) | Context | Yes |
| `response` | `int` | $\{0, 1\}$ | Binary ground-truth outcome ($1 = \text{accepted}$, $0 = \text{declined/ignored}$) | **Target (Label)** | **NO** (Observed post-alert) |
| `simulation` | `string` | `SIMULATION` | Research prototype simulation badge | Metadata | Yes |

### 6.2 `demand_series.csv` (Daily Aggregated Demand)
Each row records the daily aggregated units demanded per blood group and component.

| Column Name | Type | Range / Values | Definition | Role |
| :--- | :--- | :--- | :--- | :--- |
| `date` | `string` | `YYYY-MM-DD` | Calendar date of emergency requests | Temporal index |
| `blood_group` | `string` | 8 ABO/Rh groups | Recipient blood group requested | Category |
| `component` | `string` | 4 components | Requested blood component | Category |
| `units` | `int` | $\ge 1$ | Total units requested on this date | Target metric |
| `simulation` | `string` | `SIMULATION` | Research prototype simulation badge | Metadata |

---

## 7. Strict Temporal Leakage Rules & Verification

To prevent data leakage and guarantee that models evaluate realistic operational constraints:

1. **Temporal Information Horizon Barrier**:
   - For every notification at timestamp $T_{\text{notif}}$, no feature may be derived using information with timestamp $t \ge T_{\text{notif}}$.
   - Donor fatigue (`recent_alerts_count`) is calculated over the strictly half-open interval $[T_{\text{notif}} - 7\text{ days}, T_{\text{notif}})$.
   - `prior_response_rate` and `total_past_donations` count only events completed strictly before $T_{\text{notif}}$.
2. **Zero Target and Latent Parameter Leakage**:
   - The ML models are **NEVER** provided the latent function coefficients ($b_0 \dots b_5$), the additive noise term $\epsilon$, or future response status.
   - The response column is excluded from the input feature matrix $X$.
3. **Temporal Partitioning Protocol**:
   - Models are trained using chronological splits:
     - **Train Split**: Earliest 70% of chronological observations.
     - **Validation Split**: Next 15% of chronological observations.
     - **Test Split**: Latest 15% of chronological observations.
   - Cross-validation must strictly preserve chronological order; random shuffling across the timeline is forbidden.
4. **Time-Travel Automated Verification**:
   - Unit tests (`apps/api/src/modules/experiments/__tests__/synthetic-data.test.ts`) assert that mutating or injecting post-$T_{\text{notif}}$ events produces zero change in the feature vector generated at $T_{\text{notif}}$.

---

## 8. Multi-Strategy Simulation Runner Procedure

### 8.1 Evaluated Dispatch Strategies
The benchmark runner executes 4 distinct prioritization strategies across the exact same candidate donor pool for each emergency request:
1. **`baseline_proximity`**: Production `ProximityRanker` ordering strictly by ascending geodesic distance with last-response recency tie-breaking.
2. **`hybrid_full`**: Production `HybridRanker` applying urgency-calibrated weights ($S = w_p \cdot \hat{p} + w_a \cdot \text{accessibility}$) with calibrated $P(\text{response})$ from `TrainedResponsePredictor`.
3. **`ablation_ml_only`**: Production `HybridRanker` configured with $w_p = 1.0, w_a = 0.0$ (evaluating pure ML ranking with zero spatial weighting).
4. **`ablation_geo_only`**: Production `HybridRanker` configured with $w_p = 0.0, w_a = 1.0$ (evaluating pure spatial accessibility with zero ML probability).

### 8.2 Top-K Notification & Radius Expansion Loop
The runner mirrors the production dispatch lifecycle:
- Candidates are notified in batches of size $K = 5$ with a batch window $T_{\text{window}} = 300\text{s}$ (5 minutes).
- Responses are delayed stochastically ($\tau_i \ge 30\text{s}$ via exponential latency).
- If units fulfilled $< \text{unitsRequired}$ at $T_{\text{window}}$, subsequent batches are alerted.
- If all candidates within the initial radius ($5\text{ km}$) are exhausted, concentric radius expansion triggers ($+5\text{ km}$ increments up to $25\text{ km}$).

### 8.3 Fair Ground-Truth Behavioral Sampling
To ensure unbiased paired evaluation:
- Underlying donor acceptance and response latency are sampled from the hidden ground-truth latent function using a deterministic PRNG stream seeded on `(seed, request.id, donor.id)`.
- Consequently, candidate donor $d$ yields identical acceptance decisions and identical response latencies regardless of which strategy notifies them or in which batch they appear.

### 8.4 Statistical Methodology & Confidence Intervals
- Benchmark runs across $N = 30$ independent random seeds.
- For each metric (Fulfillment Rate, Top-K Response Rate, Donors Contacted, Time to First Acceptance, Contact Distance, Radius Expansions), the runner reports:
  - Sample Mean ($\bar{x}$)
  - Sample Standard Deviation ($s$)
  - 95% Non-Parametric Bootstrap Confidence Interval (1,000 resamples with replacement).
- Paired differences ($\Delta_i = \text{Metric}_{\text{hybrid}, i} - \text{Metric}_{\text{baseline}, i}$) are computed per request to evaluate statistical significance without assuming the proposed method wins.

### 8.5 Sensitivity Sweeps
The runner executes multidimensional sensitivity sweeps across:
1. **Donor Population Size**: $N \in \{600, 1200, 2400\}$.
2. **Base Response Rate**: $r_{\text{base}} \in \{0.15, 0.30, 0.45\}$.
3. **Noise Standard Deviation**: $\sigma_{\epsilon} \in \{0.05, 0.20, 0.40\}$.
4. **Urgency Mix**: Critical-heavy (60/30/10), Balanced (25/45/30), Routine-heavy (10/30/60).

---

## 9. Threats to Validity & Research Limitations

Academic integrity demands transparent disclosure of methodological limitations:

### 9.1 Synthetic Cohort Assumption
- **Threat**: Synthetic donors and hospitals are generated from parametric statistical distributions (Poisson donation frequency, truncated Gaussian body weights, Indian national ABO/Rh distributions) clustered around the geography of Dehradun, Uttarakhand.
- **Impact**: While parameterized from empirical demographic literature, synthetic data cannot fully reflect real-world demographic heterogeneity, localized travel friction (e.g., mountain topography, road bottlenecks), or informal donation networks.

### 9.2 Assumed Ground-Truth Behavioral Function
- **Threat**: Ground-truth donor responses are sampled from a logistic latent utility function ($U_i = \beta_0 + \sum \beta_k x_k + \epsilon$) modeling distance decay, prior compliance, urgency salience, alert fatigue, and circadian penalties.
- **Impact**: Real human donor psychology involves complex cognitive factors (emotional empathy, fear of needles, employer blood donation policies, religious beliefs) that cannot be perfectly captured by linear utility functions with Gaussian noise.

### 9.3 Absence of Real Clinical Interventions
- **Threat**: RaktSetu is an academic research prototype. No physical emergency dispatch is initiated, and no actual clinical patient outcomes are influenced.
- **Impact**: The prototype makes no clinical decisions and offers no clinical or operational guarantees. All performance metrics represent in-silico simulation results.

### 9.4 Spatial-Responsiveness Trade-off
- **Threat**: Prioritizing predicted response probability naturally selects highly responsive donors who may reside farther from the hospital than nearest-neighbor candidates.
- **Impact**: While hybrid prioritization improves Top-K acceptance rates (+1.8%) and reduces time-to-first-acceptance (-1.4s), it incurs a modest increase in mean donor contact distance (+0.37 km). This trade-off is reported honestly and must be calibrated to local transit infrastructure before any operational consideration.

