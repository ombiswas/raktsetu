"""
Behavioral response probability estimator for emergency blood donor candidates.
Computes P(response | donor, request, context) strictly in range [0.0, 1.0].
"""

import math

from app.schemas import CandidatePrediction, DonorFeatureVector


class ResponseProbabilityEstimator:
    """
    Calibrated behavioral response estimator.
    Models probability of a donor accepting an emergency alert based on
    spatial proximity, historical adherence, fatigue decay, and temporal circadian factors.
    """

    def __init__(self, model_version: str = "v0.1.0-calibrated-baseline") -> None:
        self.model_version = model_version
        # Base log-odds and behavioral coefficients
        self.intercept = 0.20
        self.coef_distance = -0.08          # Negative utility per km
        self.coef_hist_rate = 1.85          # Strong positive utility for reliable donors
        self.coef_past_donations = 0.05     # Small loyalty bonus
        self.coef_fatigue = -0.35           # Fatigue penalty per alert in past 7 days
        self.coef_critical_urgency = 0.45   # Moral urgency incentive
        self.coef_urgent_urgency = 0.20
        self.coef_night_penalty = -0.75     # Circadian sleep penalty (22:00 - 06:00)
        self.coef_work_penalty = -0.25      # Office hours penalty (09:00 - 17:00 weekdays)

    def predict_candidate(self, candidate: DonorFeatureVector) -> float:
        """
        Calculates P(response = 1 | x) using logistic utility formulation.
        """
        utility = self.intercept

        # 1. Geospatial distance penalty
        utility += self.coef_distance * candidate.distance_km

        # 2. Historical compliance bonus
        utility += self.coef_hist_rate * candidate.historical_response_rate

        # 3. Experience / loyalty bonus (diminishing returns)
        utility += self.coef_past_donations * math.log1p(candidate.total_past_donations)

        # 4. Fatigue penalty
        utility += self.coef_fatigue * candidate.recent_alerts_count

        # 5. Urgency moral salience
        if candidate.urgency == "CRITICAL":
            utility += self.coef_critical_urgency
        elif candidate.urgency == "URGENT":
            utility += self.coef_urgent_urgency

        # 6. Circadian / Temporal effect
        if candidate.hour_of_day >= 22 or candidate.hour_of_day < 6:
            utility += self.coef_night_penalty
        elif not candidate.is_weekend and 9 <= candidate.hour_of_day <= 17:
            utility += self.coef_work_penalty

        # Sigmoid link function
        prob = 1.0 / (1.0 + math.exp(-utility))

        # Clamp and round to 4 decimal places
        clamped_prob = max(0.01, min(0.99, prob))
        return round(clamped_prob, 4)

    def predict_batch(
        self, candidates: list[DonorFeatureVector]
    ) -> list[CandidatePrediction]:
        """
        Evaluates predictions for a batch of pre-filtered candidates.
        """
        predictions = []
        for candidate in candidates:
            prob = self.predict_candidate(candidate)
            predictions.append(
                CandidatePrediction(
                    donor_id=candidate.donor_id,
                    probability=prob,
                    model_version=self.model_version,
                    is_simulation=True,
                )
            )
        return predictions


# Singleton estimator instance
estimator = ResponseProbabilityEstimator()
