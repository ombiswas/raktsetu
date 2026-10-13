import { SeededPRNG } from './prng.js';
import type {
  ExperimentConfig,
  SyntheticDonor,
  SyntheticRequest,
  DonorNotificationRow,
  DemandSeriesRow,
  UrgencyLevel
} from './types.js';
import { isCompatible, type BloodGroup, type BloodComponent } from '../matching/domain/compatibility.js';

const EARTH_RADIUS_KM = 6371.0088;
const MS_PER_DAY = 86_400_000;

export function computeHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function sampleGaussianCoordinate(
  centerLat: number,
  centerLon: number,
  stdDevKm: number,
  prng: SeededPRNG
): { latitude: number; longitude: number } {
  // Approximate conversion: 1 deg lat ~ 110.574 km; 1 deg lon ~ 111.320 * cos(lat) km
  const dNorthKm = prng.normal(0, stdDevKm);
  const dEastKm = prng.normal(0, stdDevKm);

  const deltaLat = dNorthKm / 110.574;
  const deltaLon = dEastKm / (111.32 * Math.cos((centerLat * Math.PI) / 180.0));

  return {
    latitude: Math.round((centerLat + deltaLat) * 1e6) / 1e6,
    longitude: Math.round((centerLon + deltaLon) * 1e6) / 1e6
  };
}

export function sigmoid(z: number): number {
  if (z > 40) return 1.0;
  if (z < -40) return 0.0;
  return 1.0 / (1.0 + Math.exp(-z));
}

export function calculateDonorAge(dobString: string, asOfDate: Date): number {
  const dob = new Date(dobString);
  let age = asOfDate.getUTCFullYear() - dob.getUTCFullYear();
  const m = asOfDate.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && asOfDate.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

export class SyntheticDataGenerator {
  private readonly config: ExperimentConfig;
  private readonly prng: SeededPRNG;

  constructor(config: ExperimentConfig) {
    this.config = config;
    this.prng = new SeededPRNG(config.seed);
  }

  /**
   * Generates synthetic donor population around Dehradun clusters.
   */
  public generateDonors(): SyntheticDonor[] {
    const donors: SyntheticDonor[] = [];
    const bloodGroups = Object.keys(this.config.population.blood_group_distribution) as BloodGroup[];
    const bloodWeights = Object.values(this.config.population.blood_group_distribution);

    const clusterWeights = this.config.population.clusters.map((c) => c.weight);
    const startDate = new Date(this.config.timeline.start_date);

    for (let i = 0; i < this.config.population.num_donors; i++) {
      const donorId = `donor-${String(i + 1).padStart(5, '0')}`;
      const bloodGroup = this.prng.choice(bloodGroups, bloodWeights);
      const sex: 'male' | 'female' = this.prng.bernoulli(this.config.population.male_ratio) ? 'male' : 'female';

      // Age uniformly sampled between min and max
      const age = this.prng.integer(this.config.population.age_range.min, this.config.population.age_range.max);
      const birthYear = startDate.getUTCFullYear() - age;
      const birthMonth = this.prng.integer(1, 12);
      const birthDay = this.prng.integer(1, 28);
      const dateOfBirth = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

      // Weight sampled from normal distribution, truncated at min
      const rawWeight = this.prng.normal(
        this.config.population.weight_params.mean,
        this.config.population.weight_params.std_dev
      );
      const weightKg = Math.round(Math.max(this.config.population.weight_params.min, rawWeight) * 10) / 10;

      // Cluster selection and spatial coordinate sampling
      const cluster = this.prng.choice(this.config.population.clusters, clusterWeights);
      const coords = sampleGaussianCoordinate(cluster.latitude, cluster.longitude, cluster.std_dev_km, this.prng);

      // Past donation history before simulation start date
      const priorDonationCount = this.prng.poisson(2.5);
      const completedDonations: Array<{ timestamp: Date; component: BloodComponent }> = [];
      let lastDonationTime = startDate.getTime() - this.prng.integer(100, 365) * MS_PER_DAY;

      for (let d = 0; d < priorDonationCount; d++) {
        completedDonations.push({
          timestamp: new Date(lastDonationTime),
          component: 'whole_blood'
        });
        const intervalDays = sex === 'male' ? 95 + this.prng.integer(5, 60) : 125 + this.prng.integer(5, 60);
        lastDonationTime -= intervalDays * MS_PER_DAY;
      }
      completedDonations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      donors.push({
        id: donorId,
        bloodGroup,
        sex,
        dateOfBirth,
        weightKg,
        latitude: coords.latitude,
        longitude: coords.longitude,
        homeCluster: cluster.name,
        completedDonations,
        notificationHistory: []
      });
    }

    return donors;
  }

  /**
   * Generates sequence of emergency requests over the timeline.
   */
  public generateRequests(): SyntheticRequest[] {
    const requests: SyntheticRequest[] = [];
    const startDate = new Date(this.config.timeline.start_date);
    const totalDays = this.config.timeline.days;
    const baseDailyRate = this.config.timeline.requests_per_day_mean;
    const weeklyPattern = this.config.timeline.weekly_pattern;
    const seasonalSurge = this.config.timeline.seasonal_surge_factor;

    const bloodGroups = Object.keys(this.config.population.blood_group_distribution) as BloodGroup[];
    const bloodWeights = Object.values(this.config.population.blood_group_distribution);

    const components: BloodComponent[] = ['whole_blood', 'rbc', 'plasma', 'platelets'];
    const componentWeights = [0.45, 0.35, 0.10, 0.10];

    const urgencies: UrgencyLevel[] = ['CRITICAL', 'URGENT', 'ROUTINE'];
    const urgencyWeights = [0.25, 0.45, 0.30];

    let reqCounter = 1;

    for (let day = 0; day < totalDays; day++) {
      const currentDate = new Date(startDate.getTime() + day * MS_PER_DAY);
      const dayOfWeek = (currentDate.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
      const dayMultiplier = weeklyPattern[dayOfWeek] ?? 1.0;

      // Seasonal surge effect in latter half of timeline (e.g. monsoon dengue surge)
      const seasonFactor = day > totalDays * 0.6 ? seasonalSurge : 1.0;
      const expectedRequestsToday = baseDailyRate * dayMultiplier * seasonFactor;
      const numRequestsToday = this.prng.poisson(expectedRequestsToday);

      for (let r = 0; r < numRequestsToday; r++) {
        // Sample timestamp within the day
        // Diurnal distribution: higher during day (08:00 - 20:00), lower at night
        const hourProbs = [
          0.02, 0.01, 0.01, 0.01, 0.02, 0.03, // 00-05
          0.04, 0.05, 0.06, 0.07, 0.07, 0.06, // 06-11
          0.06, 0.06, 0.07, 0.07, 0.06, 0.06, // 12-17
          0.05, 0.04, 0.03, 0.03, 0.02, 0.02  // 18-23
        ];
        const hours = Array.from({ length: 24 }, (_, i) => i);
        const hour = this.prng.choice(hours, hourProbs);
        const minute = this.prng.integer(0, 59);
        const second = this.prng.integer(0, 59);

        const reqTime = new Date(currentDate);
        reqTime.setUTCHours(hour, minute, second, 0);

        const hospital = this.prng.choice(this.config.hospitals);
        const bloodGroup = this.prng.choice(bloodGroups, bloodWeights);
        const component = this.prng.choice(components, componentWeights);
        const urgency = this.prng.choice(urgencies, urgencyWeights);
        const unitsRequired = this.prng.integer(1, 3);

        requests.push({
          id: `req-${String(reqCounter++).padStart(6, '0')}`,
          timestamp: reqTime,
          hospitalId: hospital.id,
          hospitalName: hospital.name,
          hospitalLatitude: hospital.latitude,
          hospitalLongitude: hospital.longitude,
          bloodGroup,
          component,
          unitsRequired,
          urgency
        });
      }
    }

    requests.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return requests;
  }

  /**
   * Simulates full timeline dispatch, applying:
   * 1. Hard deterministic eligibility constraints
   * 2. Ground-truth latent response function
   * 3. Strict temporal leakage guard (features strictly derived from events < notification time)
   */
  public simulate(): {
    notifications: DonorNotificationRow[];
    demandSeries: DemandSeriesRow[];
  } {
    const donors = this.generateDonors();
    const requests = this.generateRequests();
    const notifications: DonorNotificationRow[] = [];

    // Map for demand aggregation: 'YYYY-MM-DD|bloodGroup|component' -> units
    const demandMap = new Map<string, number>();

    let notifCounter = 1;

    for (const request of requests) {
      const reqTime = request.timestamp;
      const dateKey = reqTime.toISOString().slice(0, 10);
      const demandKey = `${dateKey}|${request.bloodGroup}|${request.component}`;
      demandMap.set(demandKey, (demandMap.get(demandKey) ?? 0) + request.unitsRequired);

      // Filter eligible candidates deterministically
      const candidates: Array<{ donor: SyntheticDonor; distanceKm: number }> = [];

      for (const donor of donors) {
        // 1. Compatibility check
        if (!isCompatible(donor.bloodGroup, request.bloodGroup, request.component)) {
          continue;
        }

        // 2. Age check as of request time
        const age = calculateDonorAge(donor.dateOfBirth, reqTime);
        if (age < 18 || age > 65) {
          continue;
        }

        // 3. Weight check
        if (donor.weightKg < 45.0) {
          continue;
        }

        // 4. Interval cooldown check (enforce non-future, strictly before reqTime)
        const recentDonation = donor.completedDonations
          .filter((d) => d.timestamp.getTime() < reqTime.getTime())
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

        if (recentDonation) {
          const daysSinceDonation = (reqTime.getTime() - recentDonation.timestamp.getTime()) / MS_PER_DAY;
          const minDays =
            request.component === 'platelets' ? 14 : donor.sex === 'male' ? 90 : 120;
          if (daysSinceDonation < minDays) {
            continue;
          }
        }

        // 5. Geospatial proximity
        const distKm = computeHaversineDistanceKm(
          donor.latitude,
          donor.longitude,
          request.hospitalLatitude,
          request.hospitalLongitude
        );

        if (distKm <= this.config.max_notification_radius_km) {
          candidates.push({ donor, distanceKm: distKm });
        }
      }

      // Sort by proximity and take up to max_candidates_per_request
      candidates.sort((a, b) => a.distanceKm - b.distanceKm);
      const selectedBatch = candidates.slice(0, this.config.max_candidates_per_request);

      let unitsFulfilled = 0;

      for (const { donor, distanceKm } of selectedBatch) {
        const notifId = `notif-${String(notifCounter++).padStart(8, '0')}`;

        // ====================================================================
        // STRICT TEMPORAL LEAKAGE GUARD:
        // Compute features using ONLY data strictly occurring BEFORE reqTime!
        // ====================================================================
        const priorAlerts = donor.notificationHistory.filter(
          (n) => n.timestamp.getTime() < reqTime.getTime()
        );

        const priorAlertCount = priorAlerts.length;
        const priorResponseCount = priorAlerts.filter((n) => n.responded).length;

        // If no prior alerts, use the config baseline rate
        const priorResponseRate =
          priorAlertCount > 0
            ? priorResponseCount / priorAlertCount
            : this.config.ground_truth_response.base_rate;

        // Cumulative completed donations strictly prior to reqTime
        const priorDonations = donor.completedDonations.filter(
          (d) => d.timestamp.getTime() < reqTime.getTime()
        );
        const totalPastDonations = priorDonations.length;

        // Days since last donation strictly prior to reqTime
        let daysSinceLastDonation = 365;
        if (priorDonations.length > 0) {
          const lastDonation = priorDonations[priorDonations.length - 1];
          if (lastDonation) {
            daysSinceLastDonation = Math.min(
              365,
              Math.max(0, Math.floor((reqTime.getTime() - lastDonation.timestamp.getTime()) / MS_PER_DAY))
            );
          }
        }

        // Recent alerts count strictly in window [reqTime - 7d, reqTime)
        const sevenDaysAgoMs = reqTime.getTime() - 7 * MS_PER_DAY;
        const recentAlertsCount = priorAlerts.filter(
          (n) => n.timestamp.getTime() >= sevenDaysAgoMs && n.timestamp.getTime() < reqTime.getTime()
        ).length;

        const age = calculateDonorAge(donor.dateOfBirth, reqTime);
        const hourOfDay = reqTime.getUTCHours();
        const dayOfWeek = (reqTime.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
        const isWeekend = dayOfWeek >= 5;
        const nightFlag = hourOfDay >= 22 || hourOfDay < 6 ? 1 : 0;

        // Recency score normalized between 0 and 1
        const recencyScore = Math.min(1.0, daysSinceLastDonation / 365.0);

        // ====================================================================
        // GROUND-TRUTH RESPONSE LATENT FUNCTION:
        // p = sigmoid(b0 + b1*prior_response_rate + b2*recency + b3*(urgency)
        //             - b4*distance_km + b5*night_flag + noise)
        // ====================================================================
        const pParams = this.config.ground_truth_response;
        const urgencyTerm = pParams.b3_urgency[request.urgency];
        const noise = this.prng.normal(0, pParams.noise_std);

        const utility =
          pParams.b0_intercept +
          pParams.b1_prior_response_rate * priorResponseRate +
          pParams.b2_recency * recencyScore +
          urgencyTerm -
          pParams.b4_distance_km * distanceKm +
          pParams.b5_night_flag * nightFlag +
          noise;

        const rawProb = sigmoid(utility);
        const probability = Math.max(0.001, Math.min(0.999, rawProb));

        // Sample binary response label
        const isResponded = this.prng.bernoulli(probability);
        const responseLabel = isResponded ? 1 : 0;

        notifications.push({
          notification_id: notifId,
          request_id: request.id,
          donor_id: donor.id,
          timestamp: reqTime.toISOString(),
          distance_km: Math.round(distanceKm * 100) / 100,
          prior_response_rate: Math.round(priorResponseRate * 1000) / 1000,
          recency_score: Math.round(recencyScore * 1000) / 1000,
          total_past_donations: totalPastDonations,
          days_since_last_donation: daysSinceLastDonation,
          recent_alerts_count: recentAlertsCount,
          age,
          urgency: request.urgency,
          hour_of_day: hourOfDay,
          is_weekend: isWeekend,
          night_flag: nightFlag,
          blood_group: donor.bloodGroup,
          component_needed: request.component,
          response: responseLabel,
          simulation: 'SIMULATION'
        });

        // Update donor history chronologically
        donor.notificationHistory.push({
          timestamp: reqTime,
          responded: isResponded,
          requestId: request.id
        });

        if (isResponded && unitsFulfilled < request.unitsRequired) {
          unitsFulfilled++;
          // Fulfills donation: record donation 1 hour after request
          donor.completedDonations.push({
            timestamp: new Date(reqTime.getTime() + 3_600_000),
            component: request.component
          });
        }
      }
    }

    // Format demand series rows
    const demandSeries: DemandSeriesRow[] = [];
    for (const [key, units] of demandMap.entries()) {
      const parts = key.split('|');
      const date = parts[0]!;
      const blood_group = parts[1]! as BloodGroup;
      const component = parts[2]! as BloodComponent;
      demandSeries.push({
        date,
        blood_group,
        component,
        units,
        simulation: 'SIMULATION'
      });
    }

    demandSeries.sort((a, b) => a.date.localeCompare(b.date));

    return {
      notifications,
      demandSeries
    };
  }
}
